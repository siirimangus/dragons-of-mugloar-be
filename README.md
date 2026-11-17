# Dragons of Mugloar: backend bot

A Node.js + TypeScript program that plays [Dragons of Mugloar](https://dragonsofmugloar.com/) on its own. It starts a game, reads the message board, solves the ads with the best expected payoff, spends gold in the shop, and repeats until the game ends, with no human input.

The goal is to reliably score **1000+ points**. A run plays itself out in full: it ends when the dragon runs out of lives.

| Latest live run (20 real games, played to the end) |                       |
| -------------------------------------------------- | --------------------- |
| Games reaching 1000+ points                        | **20 of 20**          |
| Score (min / median / max)                         | 3,950 / 6,905 / 8,259 |
| Turns per game                                     | 66 to 84              |
| Errors or warnings                                 | none                  |
| Ended by                                           | **lives in all 20**   |

Reproduce it yourself with `npm run test:live` (about 15 minutes, see [Testing](#testing)).

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Exit codes](#exit-codes)
- [How the bot plays](#how-the-bot-plays)
- [Live API quirks](#live-api-quirks)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Testing](#testing)
- [Calibration](#calibration)
- [Design decisions and known limitations](#design-decisions-and-known-limitations)

## Quick start

**Prerequisites:** Node.js 24 (LTS). With [nvm](https://github.com/nvm-sh/nvm), `nvm use` picks the right version from `.nvmrc`.

```bash
npm install
npm start
```

That plays one game against the real API and prints a summary when it ends:

```text
Game s4cnwXmz ended (lives)
  score:      7183
  turns:      81
  solved:     48
  failed:     13
  purchases:  20 (2500 gold)
  final gold: 4683, lives: 0
```

**Good to know**

- A game ends when the dragon runs out of lives. Lives are purchasable, so what makes a run finite is the **potion budget** (`maxPotions` in [`src/config/tuning.ts`](src/config/tuning.ts), default **10**): a run gets the 3 starting lives plus at most that many bought ones. With the default that is 66 to 84 turns, or about 45 seconds. Raising it lengthens the run and raises the score close to proportionally.
- Press **Ctrl-C** to stop early. The bot finishes the current turn, prints the summary and exits with code 130.
- Settings can come from the environment or from a `.env` file (`cp .env.example .env`). If there is no `.env`, Node prints `.env not found. Continuing without it.`, which is harmless.
- Set `LOG_LEVEL=debug` to see every solved ad and purchase, or `LOG_LEVEL=warn` for a quiet run.

**Production build**

```bash
npm run build        # compiles src/ to dist/
npm run start:prod   # runs dist/index.js with plain Node
```

## Configuration

All settings are environment variables, validated once at startup. A bad value stops the program immediately with a message listing every problem (exit code 2). Empty values count as unset.

| Variable                           | Default                               | Meaning                                                    |
| ---------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `DRAGONS_API_BASE_URL`             | `https://dragonsofmugloar.com/api/v2` | Game API base URL (http or https only)                     |
| `DRAGONS_HTTP_TIMEOUT_MS`          | `10000`                               | Timeout of each HTTP attempt                               |
| `DRAGONS_RETRY_ATTEMPTS`           | `5` (max 10)                          | Attempts per request on network errors, 408, 429 and 5xx   |
| `DRAGONS_RETRY_BASE_DELAY_MS`      | `500`                                 | First backoff delay; doubles each retry (0.5 s, 1 s, ... ) |
| `DRAGONS_MAX_CONSECUTIVE_FAILURES` | `5`                                   | Skipped turns in a row before giving up                    |
| `LOG_LEVEL`                        | `info`                                | `debug`, `info`, `warn`, `error` or `silent`               |

Strategy numbers (probabilities, life value, shop priorities) are plain constants in [`src/config/tuning.ts`](src/config/tuning.ts), kept separate from deployment settings on purpose.

## Exit codes

| Code  | Meaning                                                             |
| ----- | ------------------------------------------------------------------- |
| `0`   | The game finished: out of lives, or stalled (no safe move was left) |
| `1`   | Fatal error, e.g. the API stayed unreachable after all retries      |
| `2`   | Invalid configuration                                               |
| `130` | Interrupted with Ctrl-C                                             |

## How the bot plays

Every turn the game loop does the following:

1. **Fetches the ads** and decodes the encrypted ones (see [Live API quirks](#live-api-quirks)). An ad that cannot be decoded is dropped with a warning.
2. **Asks the strategy** for one action: solve an ad or buy an item.
3. **Executes it** and folds the API response into an immutable game state.
4. **Stops** when lives reach 0, the user interrupts, or the game is stalled.

The expected-value strategy decides in this order:

1. **Heal:** buy a healing potion when lives are 2 or fewer, gold is at least 50, and the potion budget still has room.
2. **Upgrade:** buy the next shop item from a fixed priority list (cheapest first) while keeping 50 gold in reserve. Every upgrade raises the dragon's level, which roughly doubles the rewards the board offers; it does not change success rates (see quirk 12). This is where most of the score comes from.
3. **Solve the best ad:** each ad is scored as `p x reward - (1 - p) x 150`, where `p` is the measured success rate for its difficulty label and 150 is what losing a life is worth. Trap ads are left out of the ranking entirely; step 5 is the only thing that will ever solve one.
4. **Wait instead of gambling:** if no ad is worth solving, the bot buys a healing potion whenever it can afford one. That spends a turn and one potion from the budget, but refreshes the board and adds a life. A run has no turn budget and gold beyond the shop has no other use, so waiting is worth it whenever it is affordable; measured against the simulator it is worth about **+400 points a game**.
5. **Last resort:** when it cannot afford a potion or the budget is spent, it solves the least bad non-trap ad. If the board is nothing but traps, it solves one anyway. That costs a life, but it is the only move that refreshes the board, and spending lives is exactly how a run is meant to end. `stalled` (exit code 0) is therefore only reachable when the board has no ads at all.

**Shop** (prices are fixed for a whole game):

| Item                                      | Cost | Effect                |
| ----------------------------------------- | ---- | --------------------- |
| `hpot` Healing potion                     | 50   | +1 life               |
| `cs`, `gas`, `wax`, `tricks`, `wingpot`   | 100  | +1 dragon level each  |
| `ch`, `rf`, `iron`, `mtrix`, `wingpotmax` | 300  | +2 dragon levels each |

## Live API quirks

The API documentation (<https://dragonsofmugloar.com/doc/>) is rendered in the browser and is not fully accurate. The bot was built against what the real API does, which differs in the following ways. Each point was observed on the live API.

**Endpoints used**

| Method | Path                        | Returns                                                             |
| ------ | --------------------------- | ------------------------------------------------------------------- |
| POST   | `/game/start`               | `gameId`, `lives`, `gold`, `level`, `score`, `highScore`, `turn`    |
| GET    | `/:gameId/messages`         | the ads on the board                                                |
| POST   | `/:gameId/solve/:adId`      | `success`, `lives`, `gold`, `score`, `highScore`, `turn`, `message` |
| GET    | `/:gameId/shop`             | the items for sale                                                  |
| POST   | `/:gameId/shop/buy/:itemId` | `shoppingSuccess`, `gold`, `lives`, `level`, `turn`                 |

**Quirks**

1. **Undocumented fields.** Ads also carry `probability` (a text label such as "Sure thing") and `encrypted` (`null`, `1` or `2`). `reward` is a number although the docs say string. Responses are validated with zod and accept the documented variants.
2. **Encrypted ads.** When `encrypted` is `1`, the ad's `message`, `probability` **and `adId`** are Base64. When it is `2`, they are presumably ROT13; that kind never appeared in about 400 recorded turns, so its test fixture is synthetic.
3. **The decoded id must be used to solve.** Sending the encoded `adId` of an encrypted ad returns HTTP 400 ("Bad Request" as an HTML page); the decoded id returns 200. Covered by a regression test in the fake API.
4. **Trap ads.** Ads like "Steal super awesome diamond pot from ..." have huge rewards (340-450) and top labels ("Sure thing", "Piece of cake") but cost a life ("You fell into a trap"). They are recognised by their message and never solved.
5. **Late-game boards can be all traps.** After about turn 50, a board may consist of ten trap ads. The bot buys a potion to advance the turn and get a fresh board.
6. **Labels are probabilities, not promises.** There are 11 labels from "Piece of cake" to "Impossible". Measured success rates (with upgrades) are roughly 0.94, 0.88, 0.99, 0.75, 0.65, 0.55, 0.46, 0.40, 0.26, 0.08 and 0 for "Piece of cake", "Walk in the park", "Sure thing", "Quite likely", "Hmmm....", "Gamble", "Risky", "Rather detrimental", "Playing with fire", "Suicide mission" and "Impossible".
7. **Every call advances the turn**, including purchases and failed purchases. The board refreshes with the turn, and the same ad can reappear with a different `expiresIn`.
8. **Lives are not capped.** A healing potion works at full health (3 to 4 to 5 lives were observed). Together with effectively unlimited gold this means a good game never ends on its own, which is why the bot caps how many potions it will buy (`maxPotions`).
9. **Score is the sum of rewards** earned. Spending gold does not reduce it.
10. **Occasional network errors.** Requests sometimes fail with a connection error. The client retries with exponential backoff and includes the underlying cause (for example `ECONNRESET`) in the error message.
11. **A game can vanish mid-run.** `GET /:gameId/messages` has been seen to return HTTP 410 (Gone) for a game that was playing normally. Like any 4xx it is not retried, so the turn is skipped; five in a row then end the run as a fatal error. Observed once in about 100 games, so it is rare, but a live run can fail on it through no fault of the strategy.
12. **Upgrades scale rewards, not odds.** Dragon level does not change the success rate of a given difficulty label. Measured over two 20-game calibration runs, one with the full upgrade list and one with `--priority none` (level 0 throughout), per-label success rates matched within noise across all ten labels: "Piece of cake" 0.94 against 0.95, "Quite likely" 0.79 against 0.79, "Hmmm...." 0.66 against 0.67. What level changes is the reward on offer, which roughly doubles ("Piece of cake" averaged 144 gold with upgrades against 65 without), taking the median score from 2,788 to 7,053. Because `reward` is read from each ad as the API offers it, the expected-value calculation picks this up with no level term of its own.

## Architecture

The code is layered, and dependencies point one way:

```text
index.ts          CLI entry: config, signals, exit codes
   |
app.ts            composition root: the only place real objects are built
   |
services/         game loop, strategy, ad scoring, shop rules, state reducers
   |   depends only on the DragonsApi interface and models, never on fetch or console
   v
api/              DragonsApi interface  <--  HttpDragonsApi (the only code that uses the network)
```

```text
src/
  index.ts            entry point (exit codes 0/1/2/130, SIGINT handling)
  app.ts              createApp(): wires config, HTTP client, strategy and game loop
  config/             env.ts (validated environment), tuning.ts (strategy numbers)
  models/             shared types
  api/                DragonsApi interface, HTTP client, zod schemas, retry, error types
  services/           game.service (loop), strategy, ad.service, shop.service, game-state
  utils/              Base64/ROT13 decoding, logger, sleep
test/                 unit/, integration/, live/ (opt-in), support/ (fake API, builders), fixtures/
scripts/              calibration and fixture-recording tools (developer tools, not part of the bot)
```

Key ideas:

- **Purity rule, enforced by ESLint.** Files in `src/services/` may not use `fetch`, `console` or any HTTP/network module. They only talk to the injected `DragonsApi`, which is why the whole game can be tested against an in-memory fake.
- **Dependency injection without a framework.** `createApp` receives `fetch`, `sleep` and `tuning` as options; tests use the same entry point as the real program.
- **Strategy behind an interface.** `Strategy.chooseAction(context)` returns an action or `null`. A different or adaptive strategy can replace the expected-value one without touching the game loop.
- **State management.** `GameState` is immutable. Two pure reducers (`applySolve`, `applyPurchase`) turn each API response into the next state, and the game loop owns the only reference.
- **Validation at the boundary.** Every API response is parsed by zod and converted to typed objects before it reaches the services. A response with the wrong shape stops the run instead of corrupting it.
- **Error policy.** Network errors, timeouts, 408, 429 and 5xx are retried with backoff. Validation errors are never retried. A 4xx on one ad skips that turn and avoids picking the same ad again that turn; too many skipped turns in a row end the run.

## Tech stack

| Area          | Choice                                                                    |
| ------------- | ------------------------------------------------------------------------- |
| Runtime       | Node.js 24 LTS, native `fetch`                                            |
| Language      | TypeScript 6 (strict, ES modules, `NodeNext`, `noUncheckedIndexedAccess`) |
| Validation    | [zod](https://zod.dev/) 4: the only runtime dependency                    |
| Testing       | [Vitest](https://vitest.dev/) 5 with the V8 coverage provider             |
| Lint / format | ESLint 10 with typescript-eslint, Prettier                                |
| Dev runner    | [tsx](https://tsx.is/) (runs TypeScript directly)                         |

All dependency versions are pinned exactly in `package.json`.

## Testing

```bash
npm test                # unit + integration tests, offline and fast
npm run test:coverage   # same, with coverage thresholds (90% lines/functions/statements, 80% branches)
npm run test:live       # opt-in: plays real games against the live API
```

Quality checks: `npm run lint`, `npm run typecheck` and `npm run format:check`.

- **Unit tests** cover decoding, schemas, the HTTP client (with a stub `fetch`), retry and backoff, config validation, ad scoring, shop rules, the strategy and the state reducers.
- **Integration tests** run the real game loop and the real strategy against `FakeDragonsApi`, a seeded in-memory simulator of the game. It reproduces the quirks above: encrypted ads, trap ads, trap-only boards, a 400 for encoded ids, and turns advancing on purchases.
- **Fixtures** in `test/fixtures/` are real API responses recorded by `scripts/record-fixtures.ts` (the ROT13 one is synthetic).
- **The live test** (`test/live/`) plays real games to their natural end and asserts the 1000-point requirement, printing every game's score and the distribution. It is excluded from `npm test` because it is slow and needs the network. Options: `LIVE_GAMES` (default 20) and `LIVE_MIN_SHARE` (share of games that must reach 1000, default 0.9). Run length is set by `maxPotions` in the tuning, not by the test.

  ```bash
  LIVE_GAMES=12 npm run test:live
  ```

## Calibration

The strategy's numbers (success rate per label, life value, thresholds) were measured with a tool that plays many games and reports statistics:

```bash
npm run calibrate -- --games 12 --concurrency 3 --max-potions 8
```

It prints the score distribution, observed versus tuned success rate per label, failures grouped by API message, purchase effects and whether shop prices change during a game. Useful flags: `--priority cs,gas,...` or `--priority none`, `--life-value`, `--heal-threshold`, `--max-potions` and `--target`. Invalid values are rejected with a clear message. Please be considerate of the public API: keep `--concurrency` low and the number of games modest.

## Design decisions and known limitations

- **Why the strategy waits.** A failed attempt costs a life, and a life costs 50 gold plus a turn to buy back. When the best ad has a negative expected value, a potion is the cheaper move.
- **Why a potion budget.** Lives are purchasable and the bot earns far more gold than a potion costs, so a bot free to heal at will never dies: left uncapped against the simulator for 50,000 turns it finished alive every time, having accumulated ~1,800 lives and ~1.7M gold. Capping healing potions per game (`maxPotions`) makes the life budget finite, so `lives` is reached and a run ends on its own.
- **Why the bot will solve a trap.** Once the potion budget is spent and every upgrade is bought, an all-trap board leaves no other legal action — and because the turn only advances on an action, the board would never refresh and the run would freeze with lives still in hand. Solving a trap is a guaranteed lost life, but it refreshes the board and spends the lives the run is meant to end on, so it beats freezing.
- **Ctrl-C is only checked between turns.** The abort signal is not passed into HTTP requests or retry sleeps, so stopping can take a few seconds (up to about a minute in a long retry sequence).
- **Retried POSTs.** `solve` and `buy` are retried after network errors or 5xx responses. If the first request had actually been delivered, it may be applied twice (a repeated `solve` gets a 400 and is skipped; a repeated `buy` may cost one extra purchase). The API has no idempotency keys, so this is an accepted trade-off.
- **The ROT13 variant** (`encrypted: 2`) is implemented by analogy with Base64 but has never been seen live.
- **The life budget dominates the score, not the tuning.** Measured against the simulator over 80 paired seeds, score is close to linear in `maxPotions` (~370 points per extra potion), while `lifeValue` and `minSolveScore` move it by a few percent at most. `lifeValue: 150` sits near an interior optimum: both raising it (900 → -860 points) and lowering it (50 → -1,020) are clearly worse, because with a fixed life budget the aim is to extract the most reward per life risked, and over-caution buys safe but low-reward ads. Treat `maxPotions` as the run-length dial. The live run bears this out: all 20 games spent the whole budget (10 upgrades + 10 potions, 20 purchases each), so run length is set by the cap rather than by luck.

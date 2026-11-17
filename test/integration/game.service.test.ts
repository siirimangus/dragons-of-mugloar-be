import { describe, expect, it, vi } from 'vitest';
import type { DragonsApi } from '../../src/api/dragons-api.js';
import { ApiError } from '../../src/api/errors.js';
import { GameService, type GameServiceOptions } from '../../src/services/game.service.js';
import { ExpectedValueStrategy, type Strategy } from '../../src/services/strategy.js';
import type { Action, RawAd } from '../../src/models/types.js';
import { silentLogger, type Logger } from '../../src/utils/logger.js';
import { FakeDragonsApi } from '../support/fake-dragons-api.js';
import { TEST_TUNING } from '../support/test-tuning.js';

function makeService(
  api: DragonsApi,
  options: Partial<GameServiceOptions> = {},
  strategy: Strategy = new ExpectedValueStrategy(TEST_TUNING),
) {
  return new GameService({
    api,
    strategy,
    logger: silentLogger,
    options: { maxConsecutiveFailures: 3, ...options },
  });
}

/**
 * Bounds a run that would otherwise not end. A game stops only when lives run out, so a test that
 * keeps the dragon alive (`successRateOverride: 1`) has to stop itself. The returned api delegates
 * to `api`, so `vi.spyOn(api, ...)` still applies, and aborts the run once `turns` turns have begun.
 */
function abortingAfter(api: DragonsApi, turns: number): { api: DragonsApi; signal: AbortSignal } {
  const controller = new AbortController();
  let started = 0;
  return {
    signal: controller.signal,
    api: {
      startGame: () => api.startGame(),
      getShop: (gameId) => api.getShop(gameId),
      getMessages: (gameId) => {
        if (++started >= turns) controller.abort();
        return api.getMessages(gameId);
      },
      solve: (gameId, adId) => api.solve(gameId, adId),
      buy: (gameId, itemId) => api.buy(gameId, itemId),
    },
  };
}

type LogEntry = { level: string; message: string; meta: Record<string, unknown> | undefined };

function capturingLogger(): { logger: Logger; entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  const at =
    (level: string) =>
    (message: string, meta?: Record<string, unknown>): void => {
      entries.push({ level, message, meta });
    };
  return {
    entries,
    logger: { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') },
  };
}

/** Buys `itemId` once, then solves the first ad. */
function buyOnceThenSolve(itemId: string): Strategy {
  return {
    chooseAction: (ctx): Action | null => {
      if (!ctx.attemptedItemIds.includes(itemId)) return { kind: 'buy', itemId };
      const ad = ctx.ads[0];
      return ad ? { kind: 'solve', adId: ad.adId } : null;
    },
  };
}

class PoisonedAdsApi extends FakeDragonsApi {
  override async getMessages(gameId: string): Promise<RawAd[]> {
    const ads = await super.getMessages(gameId);
    return [
      ...ads,
      {
        adId: 'bad-ad',
        message: '!!not base64!!',
        reward: 999,
        expiresIn: 7,
        encrypted: 1,
        probability: 'Piece of cake',
      },
    ];
  }
}

describe('GameService', () => {
  it('ends exactly when lives run out', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 0 });
    const summary = await makeService(api).run();
    expect(summary).toMatchObject({
      endedBy: 'lives',
      failed: 3,
      solved: 0,
      turns: 3,
      finalLives: 0,
      score: 0,
      goldSpent: 0,
    });
  });

  it('plays to its natural end without a turn budget and keeps bookkeeping consistent', async () => {
    const api = new FakeDragonsApi({ seed: 42 });
    const summary = await makeService(api).run();
    expect(summary.endedBy).toBe('lives');
    expect(summary.finalLives).toBe(0);
    expect(api.trapsSolved).toBe(0);
    expect(summary.score).toBe(api.snapshot().score);
    expect(summary.finalGold).toBe(api.snapshot().gold);
    expect(summary.solved).toBeGreaterThan(0);
    expect(summary.turns).toBe(summary.solved + summary.failed + summary.purchases);
  });

  it('scores well across fixed seeds (strategy regression guard)', async () => {
    const scores: number[] = [];
    for (const seed of [1, 7, 13, 42, 99]) {
      const api = new FakeDragonsApi({ seed });
      scores.push((await makeService(api).run()).score);
    }
    // These are fake-API economics, not a forecast of the live score: the point is that a
    // change which quietly halves the bot's effectiveness fails here instead of passing CI.
    for (const score of scores) expect(score).toBeGreaterThan(1000);
    expect(scores.reduce((a, b) => a + b, 0) / scores.length).toBeGreaterThan(3000);
  });

  it('spends no more than the potion budget before dying', async () => {
    const api = new FakeDragonsApi({ seed: 42 });
    const capped = new ExpectedValueStrategy({ ...TEST_TUNING, maxPotions: 3 });
    const summary = await makeService(api, {}, capped).run();
    expect(api.purchases.filter((id) => id === 'hpot').length).toBeLessThanOrEqual(3);
    expect(summary.endedBy).toBe('lives');
  });

  it('heals when lives are low and buys the configured upgrade once it can afford it', async () => {
    const api = new FakeDragonsApi({ lives: 1, successRateOverride: 1 });
    // Waiting is disabled on purpose: this test is about the heal/upgrade rules only.
    const noWaiting = new ExpectedValueStrategy({
      ...TEST_TUNING,
      minSolveScore: Number.NEGATIVE_INFINITY,
    });
    const bounded = abortingAfter(api, 40);
    const summary = await makeService(bounded.api, {}, noWaiting).run(bounded.signal);
    expect(api.purchases.filter((id) => id === 'hpot')).toHaveLength(2);
    expect(api.purchases).toContain('cs');
    expect(summary.finalLives).toBe(3);
    expect(summary.endedBy).toBe('aborted');
  });

  it('waits with heal purchases through trap-only boards while the potion budget lasts', async () => {
    const api = new FakeDragonsApi({ seed: 7, trapBoardEvery: 2, startGold: 2000 });
    const capped = new ExpectedValueStrategy({ ...TEST_TUNING, maxPotions: 5 });
    const summary = await makeService(api, {}, capped).run();
    expect(api.purchases.filter((id) => id === 'hpot')).toHaveLength(5);
    expect(summary.endedBy).toBe('lives');
  });

  it('burns lives on traps rather than deadlocking when nothing safe is affordable', async () => {
    // Every board is traps and there is no gold to pass the turn with. Returning no action here
    // would freeze the run with lives in hand, so the bot spends them instead and the game ends.
    const api = new FakeDragonsApi({ seed: 7, trapBoardEvery: 1, startGold: 0 });
    const summary = await makeService(api).run();
    expect(summary.endedBy).toBe('lives');
    expect(summary.finalLives).toBe(0);
    expect(api.trapsSolved).toBeGreaterThan(0);
  });

  it('stops when the abort signal fires', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const controller = new AbortController();
    controller.abort();
    const summary = await makeService(api).run(controller.signal);
    expect(summary).toMatchObject({ endedBy: 'aborted', turns: 0 });
  });

  it('aborts the run when the API stays down', async () => {
    const api = new FakeDragonsApi();
    vi.spyOn(api, 'getMessages').mockRejectedValue(
      new ApiError('down', { retryable: true, status: 503 }),
    );
    await expect(makeService(api).run()).rejects.toThrow('down');
  });

  it('skips a turn after a non-retryable API error and then recovers', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const spy = vi.spyOn(api, 'getMessages');
    spy.mockRejectedValueOnce(new ApiError('gone', { retryable: false, status: 404 }));
    const bounded = abortingAfter(api, 4);
    const summary = await makeService(bounded.api).run(bounded.signal);
    expect(summary.endedBy).toBe('aborted');
    expect(summary.turns).toBe(3);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('does not re-pick an ad the API rejected on the same turn', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const solve = vi.spyOn(api, 'solve');
    solve.mockRejectedValueOnce(new ApiError('bad ad', { retryable: false, status: 400 }));
    const bounded = abortingAfter(api, 4);
    const summary = await makeService(bounded.api).run(bounded.signal);
    expect(solve.mock.calls[0]?.[1]).toBeDefined();
    expect(solve.mock.calls[1]?.[1]).not.toBe(solve.mock.calls[0]?.[1]);
    expect(summary.endedBy).toBe('aborted');
    expect(summary.turns).toBe(3);
  });

  it('does not retry a purchase that threw a non-retryable error', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const buy = vi.spyOn(api, 'buy');
    buy.mockRejectedValueOnce(new ApiError('nope', { retryable: false, status: 400 }));
    const bounded = abortingAfter(api, 4);
    const summary = await makeService(bounded.api, {}, buyOnceThenSolve('cs')).run(bounded.signal);
    expect(buy).toHaveBeenCalledTimes(1);
    expect(summary.endedBy).toBe('aborted');
    expect(summary.turns).toBe(3);
  });

  it('does not retry an unaffordable purchase and records no spend', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const buy = vi.spyOn(api, 'buy');
    const bounded = abortingAfter(api, 3);
    const summary = await makeService(bounded.api, {}, buyOnceThenSolve('cs')).run(bounded.signal);
    expect(buy).toHaveBeenCalledTimes(1);
    expect(summary.purchases).toBe(0);
    expect(summary.goldSpent).toBe(0);
    expect(summary.solved).toBe(2);
  });

  it('applies the API response when the strategy buys an item missing from the shop', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    vi.spyOn(api, 'buy').mockResolvedValue({
      shoppingSuccess: true,
      gold: 0,
      lives: 3,
      level: 0,
      turn: 1,
    });
    const bounded = abortingAfter(api, 3);
    const summary = await makeService(bounded.api, {}, buyOnceThenSolve('ghost')).run(
      bounded.signal,
    );
    expect(summary.goldSpent).toBe(0);
    expect(summary.purchases).toBe(1);
    expect(summary.solved).toBe(2);
  });

  it('drops undecodable ads with a warning and never solves them', async () => {
    const api = new PoisonedAdsApi({ successRateOverride: 1 });
    const solve = vi.spyOn(api, 'solve');
    const { logger, entries } = capturingLogger();
    const bounded = abortingAfter(api, 3);
    await new GameService({
      api: bounded.api,
      strategy: new ExpectedValueStrategy(TEST_TUNING),
      logger,
      options: { maxConsecutiveFailures: 3 },
    }).run(bounded.signal);
    expect(solve.mock.calls.map((call) => call[1])).not.toContain('bad-ad');
    const warn = entries.find((e) => e.level === 'warn' && e.message === 'Dropping undecodable ad');
    expect(warn?.meta).toMatchObject({ adId: 'bad-ad' });
  });

  it('never skips a turn because of an encoded ad id (live API 400s on those)', async () => {
    const api = new FakeDragonsApi({ seed: 42 });
    const { logger, entries } = capturingLogger();
    await new GameService({
      api,
      strategy: new ExpectedValueStrategy(TEST_TUNING),
      logger,
      options: { maxConsecutiveFailures: 3 },
    }).run();
    expect(entries.filter((e) => e.message === 'Turn skipped')).toEqual([]);
  });

  it('logs an end-of-run summary and a progress line every 25 turns', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const { logger, entries } = capturingLogger();
    const bounded = abortingAfter(api, 50);
    const summary = await new GameService({
      api: bounded.api,
      strategy: new ExpectedValueStrategy(TEST_TUNING),
      logger,
      options: { maxConsecutiveFailures: 3 },
    }).run(bounded.signal);
    const infos = entries.filter((e) => e.level === 'info');
    expect(infos.filter((e) => e.message === 'Progress')).toHaveLength(2);
    const finished = infos.find((e) => e.message === 'Run finished');
    expect(finished?.meta).toMatchObject({
      endedBy: 'aborted',
      turns: 50,
      score: summary.score,
    });
  });

  it('logs the partial summary and rethrows the same error on a fatal failure', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const failure = new ApiError('down', { retryable: true, status: 503 });
    await api.startGame(); // populates the board so the first turn can be played for real
    vi.spyOn(api, 'getMessages')
      .mockResolvedValueOnce(await api.getMessages('fake-game'))
      .mockRejectedValue(failure);
    const { logger, entries } = capturingLogger();
    const service = new GameService({
      api,
      strategy: new ExpectedValueStrategy(TEST_TUNING),
      logger,
      options: { maxConsecutiveFailures: 3 },
    });
    await expect(service.run()).rejects.toBe(failure);
    const logged = entries.find((e) => e.level === 'error' && e.message === 'Run failed');
    expect(logged?.meta).toMatchObject({ gameId: 'fake-game', turns: 1, solved: 1 });
    expect(logged?.meta).not.toHaveProperty('endedBy');
  });

  it('fails fast after too many consecutive skipped turns', async () => {
    const api = new FakeDragonsApi();
    const spy = vi
      .spyOn(api, 'getMessages')
      .mockRejectedValue(new ApiError('gone', { retryable: false, status: 404 }));
    await expect(makeService(api, { maxConsecutiveFailures: 3 }).run()).rejects.toThrow('gone');
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('ends as stalled when the strategy keeps producing no action', async () => {
    const api = new FakeDragonsApi();
    const idle: Strategy = { chooseAction: () => null };
    const summary = await makeService(api, { maxConsecutiveFailures: 2 }, idle).run();
    expect(summary).toMatchObject({ endedBy: 'stalled', turns: 0 });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import { GameService, type GameServiceOptions } from '../../src/services/game.service.js';
import { ExpectedValueStrategy, type Strategy } from '../../src/services/strategy.js';
import type { Action, RawAd } from '../../src/models/types.js';
import { silentLogger, type Logger } from '../../src/utils/logger.js';
import { FakeDragonsApi } from '../support/fake-dragons-api.js';
import { TEST_TUNING } from '../support/test-tuning.js';

function makeService(
  api: FakeDragonsApi,
  options: Partial<GameServiceOptions> = {},
  strategy: Strategy = new ExpectedValueStrategy(TEST_TUNING),
) {
  return new GameService({
    api,
    strategy,
    logger: silentLogger,
    options: { maxConsecutiveFailures: 3, maxTurns: 300, ...options },
  });
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

  it('never solves trap ads and keeps its bookkeeping consistent with the API', async () => {
    const api = new FakeDragonsApi({ seed: 42 });
    const summary = await makeService(api, { maxTurns: 200 }).run();
    expect(api.trapsSolved).toBe(0);
    expect(summary.score).toBe(api.snapshot().score);
    expect(summary.finalGold).toBe(api.snapshot().gold);
    expect(summary.solved).toBeGreaterThan(0);
    expect(summary.turns).toBe(summary.solved + summary.failed + summary.purchases);
    expect(summary.turns).toBeLessThanOrEqual(200);
  });

  it('heals when lives are low and buys the configured upgrade once it can afford it', async () => {
    const api = new FakeDragonsApi({ lives: 1, successRateOverride: 1 });
    // Waiting is disabled on purpose: this test is about the heal/upgrade rules only.
    const noWaiting = new ExpectedValueStrategy({
      ...TEST_TUNING,
      minSolveScore: Number.NEGATIVE_INFINITY,
    });
    const summary = await makeService(api, { maxTurns: 40 }, noWaiting).run();
    expect(api.purchases.filter((id) => id === 'hpot')).toHaveLength(2);
    expect(api.purchases).toContain('cs');
    expect(summary.finalLives).toBe(3);
    expect(summary.endedBy).toBe('turn-limit');
  });

  it('waits with heal purchases through trap-only boards instead of aborting', async () => {
    const api = new FakeDragonsApi({ seed: 7, trapBoardEvery: 2, startGold: 2000 });
    const summary = await makeService(api, { maxTurns: 60 }).run();
    expect(summary.endedBy).toBe('turn-limit');
    expect(api.trapsSolved).toBe(0);
    expect(api.purchases.filter((id) => id === 'hpot').length).toBeGreaterThan(1);
  });

  it('ends as stalled with a summary when no safe action exists and nothing is affordable', async () => {
    const api = new FakeDragonsApi({ seed: 7, trapBoardEvery: 1, startGold: 0 });
    const summary = await makeService(api, { maxTurns: 60 }).run();
    expect(summary.endedBy).toBe('stalled');
    expect(api.trapsSolved).toBe(0);
  });

  it('stops at the turn limit', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const summary = await makeService(api, { maxTurns: 5 }).run();
    expect(summary.endedBy).toBe('turn-limit');
    expect(summary.turns).toBe(5);
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
    const summary = await makeService(api, { maxTurns: 3 }).run();
    expect(summary.endedBy).toBe('turn-limit');
    expect(summary.turns).toBe(3);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('does not re-pick an ad the API rejected on the same turn', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const solve = vi.spyOn(api, 'solve');
    solve.mockRejectedValueOnce(new ApiError('bad ad', { retryable: false, status: 400 }));
    const summary = await makeService(api, { maxTurns: 3 }).run();
    expect(solve.mock.calls[0]?.[1]).toBeDefined();
    expect(solve.mock.calls[1]?.[1]).not.toBe(solve.mock.calls[0]?.[1]);
    expect(summary.endedBy).toBe('turn-limit');
    expect(summary.turns).toBe(3);
  });

  it('does not retry a purchase that threw a non-retryable error', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const buy = vi.spyOn(api, 'buy');
    buy.mockRejectedValueOnce(new ApiError('nope', { retryable: false, status: 400 }));
    const summary = await makeService(api, { maxTurns: 3 }, buyOnceThenSolve('cs')).run();
    expect(buy).toHaveBeenCalledTimes(1);
    expect(summary.endedBy).toBe('turn-limit');
    expect(summary.turns).toBe(3);
  });

  it('does not retry an unaffordable purchase and records no spend', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const buy = vi.spyOn(api, 'buy');
    const summary = await makeService(api, { maxTurns: 3 }, buyOnceThenSolve('cs')).run();
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
    const summary = await makeService(api, { maxTurns: 3 }, buyOnceThenSolve('ghost')).run();
    expect(summary.goldSpent).toBe(0);
    expect(summary.purchases).toBe(1);
    expect(summary.turns).toBe(3);
  });

  it('drops undecodable ads with a warning and never solves them', async () => {
    const api = new PoisonedAdsApi({ successRateOverride: 1 });
    const solve = vi.spyOn(api, 'solve');
    const { logger, entries } = capturingLogger();
    const service = new GameService({
      api,
      strategy: new ExpectedValueStrategy(TEST_TUNING),
      logger,
      options: { maxConsecutiveFailures: 3, maxTurns: 3 },
    });
    await service.run();
    expect(solve.mock.calls.map((call) => call[1])).not.toContain('bad-ad');
    const warn = entries.find((e) => e.level === 'warn' && e.message === 'Dropping undecodable ad');
    expect(warn?.meta).toMatchObject({ adId: 'bad-ad' });
  });

  it('never skips a turn because of an encoded ad id (live API 400s on those)', async () => {
    const api = new FakeDragonsApi({ seed: 42 });
    const { logger, entries } = capturingLogger();
    const service = new GameService({
      api,
      strategy: new ExpectedValueStrategy(TEST_TUNING),
      logger,
      options: { maxConsecutiveFailures: 3, maxTurns: 100 },
    });
    await service.run();
    expect(entries.filter((e) => e.message === 'Turn skipped')).toEqual([]);
  });

  it('logs an end-of-run summary and a progress line every 25 turns', async () => {
    const api = new FakeDragonsApi({ successRateOverride: 1 });
    const { logger, entries } = capturingLogger();
    const service = new GameService({
      api,
      strategy: new ExpectedValueStrategy(TEST_TUNING),
      logger,
      options: { maxConsecutiveFailures: 3, maxTurns: 50 },
    });
    const summary = await service.run();
    const infos = entries.filter((e) => e.level === 'info');
    expect(infos.filter((e) => e.message === 'Progress')).toHaveLength(2);
    const finished = infos.find((e) => e.message === 'Run finished');
    expect(finished?.meta).toMatchObject({
      endedBy: 'turn-limit',
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
      options: { maxConsecutiveFailures: 3, maxTurns: 10 },
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

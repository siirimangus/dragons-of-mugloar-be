import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/errors.js';
import {
  GameService,
  NoActionError,
  type GameServiceOptions,
} from '../../src/services/game.service.js';
import { ExpectedValueStrategy, type Strategy } from '../../src/services/strategy.js';
import { silentLogger } from '../../src/utils/logger.js';
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
    const summary = await makeService(api, { maxTurns: 40 }).run();
    expect(api.purchases.filter((id) => id === 'hpot')).toHaveLength(2);
    expect(api.purchases).toContain('cs');
    expect(summary.finalLives).toBe(3);
    expect(summary.endedBy).toBe('turn-limit');
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
    vi.spyOn(api, 'getMessages').mockRejectedValueOnce(
      new ApiError('gone', { retryable: false, status: 404 }),
    );
    const summary = await makeService(api, { maxTurns: 3 }).run();
    expect(summary.endedBy).toBe('turn-limit');
    expect(summary.turns).toBe(3);
  });

  it('fails fast after too many consecutive skipped turns', async () => {
    const api = new FakeDragonsApi();
    const spy = vi
      .spyOn(api, 'getMessages')
      .mockRejectedValue(new ApiError('gone', { retryable: false, status: 404 }));
    await expect(makeService(api, { maxConsecutiveFailures: 3 }).run()).rejects.toThrow('gone');
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('fails fast when the strategy keeps producing no action', async () => {
    const api = new FakeDragonsApi();
    const idle: Strategy = { chooseAction: () => null };
    await expect(makeService(api, { maxConsecutiveFailures: 2 }, idle).run()).rejects.toThrow(
      NoActionError,
    );
  });
});

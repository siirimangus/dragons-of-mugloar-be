import { describe, expect, it } from 'vitest';
import type { DragonsApi } from '../../src/api/dragons-api.js';
import { ApiError } from '../../src/api/errors.js';
import { TEST_TUNING } from '../support/test-tuning.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import type { FetchFn } from '../../src/api/http-dragons-api.js';
import { silentLogger } from '../../src/utils/logger.js';

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('createApp', () => {
  it('wires config, HTTP client, strategy and game loop together', async () => {
    const requests: string[] = [];
    const fetchFn: FetchFn = async (input, init) => {
      requests.push(`${init?.method ?? 'GET'} ${input}`);
      if (input.endsWith('/game/start')) {
        return json({ gameId: 'g1', lives: 0, gold: 0, level: 0, score: 0, highScore: 0, turn: 0 });
      }
      if (input.endsWith('/g1/shop')) return json([]);
      throw new Error(`unexpected request ${input}`);
    };

    const app = createApp({
      config: loadConfig({ DRAGONS_API_BASE_URL: 'https://api.test/v2' }),
      logger: silentLogger,
      fetch: fetchFn,
      sleep: async () => undefined,
    });
    const summary = await app.run();

    expect(requests).toEqual([
      'POST https://api.test/v2/game/start',
      'GET https://api.test/v2/g1/shop',
    ]);
    expect(summary).toMatchObject({ gameId: 'g1', turns: 0, endedBy: 'lives' });
  });

  const startBody = (overrides: Record<string, unknown> = {}) => ({
    gameId: 'g1',
    lives: 3,
    gold: 0,
    level: 0,
    score: 0,
    highScore: 0,
    turn: 0,
    ...overrides,
  });
  const plainAd = {
    adId: 'ad1',
    message: 'Help a merchant',
    reward: '100',
    expiresIn: 5,
    probability: 'Piece of cake',
  };
  const base = { DRAGONS_API_BASE_URL: 'https://api.test/v2', DRAGONS_RETRY_BASE_DELAY_MS: '0' };

  it('applies decorateApi to the real client', async () => {
    const calls: string[] = [];
    const fetchFn: FetchFn = async (input) => {
      if (input.endsWith('/game/start')) return json(startBody({ lives: 0 }));
      if (input.endsWith('/g1/shop')) return json([]);
      throw new Error(`unexpected request ${input}`);
    };
    const app = createApp({
      config: loadConfig(base),
      logger: silentLogger,
      fetch: fetchFn,
      decorateApi: (api): DragonsApi => ({
        startGame: () => {
          calls.push('startGame');
          return api.startGame();
        },
        getShop: (gameId) => {
          calls.push('getShop');
          return api.getShop(gameId);
        },
        getMessages: (gameId) => api.getMessages(gameId),
        solve: (gameId, adId) => api.solve(gameId, adId),
        buy: (gameId, itemId) => api.buy(gameId, itemId),
      }),
    });
    await app.run();
    expect(calls).toEqual(['startGame', 'getShop']);
  });

  it('stops with endedBy aborted for an already-aborted signal, without fetching messages', async () => {
    const requests: string[] = [];
    const fetchFn: FetchFn = async (input) => {
      requests.push(input);
      if (input.endsWith('/game/start')) return json(startBody());
      if (input.endsWith('/g1/shop')) return json([]);
      throw new Error(`unexpected request ${input}`);
    };
    const app = createApp({ config: loadConfig(base), logger: silentLogger, fetch: fetchFn });
    const summary = await app.run(AbortSignal.abort());
    expect(summary.endedBy).toBe('aborted');
    expect(requests.some((url) => url.includes('/messages'))).toBe(false);
  });

  it('plays through the game loop until lives run out, with no turn budget', async () => {
    const requests: string[] = [];
    let lives = 3;
    const fetchFn: FetchFn = async (input, init) => {
      requests.push(`${init?.method ?? 'GET'} ${input}`);
      if (input.endsWith('/game/start')) return json(startBody());
      if (input.endsWith('/g1/shop')) return json([]);
      if (input.endsWith('/g1/messages')) return json([plainAd]);
      if (input.includes('/g1/solve/')) {
        lives -= 1;
        return json({
          success: false,
          lives,
          gold: 0,
          score: 0,
          highScore: 0,
          turn: 3 - lives,
          message: 'failed',
        });
      }
      throw new Error(`unexpected request ${input}`);
    };
    const app = createApp({ config: loadConfig(base), logger: silentLogger, fetch: fetchFn });
    const summary = await app.run();
    expect(summary).toMatchObject({ endedBy: 'lives', turns: 3, failed: 3, finalLives: 0 });
    expect(requests.filter((r) => r.startsWith('POST') && r.includes('/solve/'))).toHaveLength(3);
  });

  it('passes a custom tuning to the strategy', async () => {
    const requests: string[] = [];
    const fetchFn: FetchFn = async (input, init) => {
      requests.push(`${init?.method ?? 'GET'} ${input}`);
      if (input.endsWith('/game/start')) return json(startBody({ gold: 100 }));
      if (input.endsWith('/g1/shop')) {
        return json([{ id: 'hpot', name: 'Healing potion', cost: 50 }]);
      }
      if (input.endsWith('/g1/messages')) return json([plainAd]);
      if (input.includes('/g1/shop/buy/')) {
        return json({ shoppingSuccess: true, gold: 0, lives: 4, level: 0, turn: 1 });
      }
      if (input.includes('/g1/solve/')) {
        return json({
          success: false,
          lives: 0,
          gold: 0,
          score: 0,
          highScore: 0,
          turn: 2,
          message: 'dead',
        });
      }
      throw new Error(`unexpected request ${input}`);
    };
    const app = createApp({
      config: loadConfig(base),
      logger: silentLogger,
      fetch: fetchFn,
      // Above any reachable score, so the strategy must wait with a potion. The default tuning
      // would solve this ad (Piece of cake, reward 100) on the very first turn instead.
      tuning: { ...TEST_TUNING, minSolveScore: Number.POSITIVE_INFINITY },
    });
    await app.run();
    const firstAction = requests.find((r) => r.startsWith('POST') && !r.includes('/game/start'));
    expect(firstAction).toContain('/shop/buy/hpot');
  });

  it('wires retry attempts to the HTTP client', async () => {
    const makeFetch = (): FetchFn => {
      let startCalls = 0;
      return async (input) => {
        if (input.endsWith('/game/start')) {
          startCalls += 1;
          if (startCalls <= 2) return new Response('unavailable', { status: 503 });
          return json(startBody({ lives: 0 }));
        }
        if (input.endsWith('/g1/shop')) return json([]);
        throw new Error(`unexpected request ${input}`);
      };
    };
    const sleepFn = async (): Promise<void> => undefined;

    const ok = createApp({
      config: loadConfig({ ...base, DRAGONS_RETRY_ATTEMPTS: '3' }),
      logger: silentLogger,
      fetch: makeFetch(),
      sleep: sleepFn,
    });
    await expect(ok.run()).resolves.toMatchObject({ gameId: 'g1' });

    const failing = createApp({
      config: loadConfig({ ...base, DRAGONS_RETRY_ATTEMPTS: '1' }),
      logger: silentLogger,
      fetch: makeFetch(),
      sleep: sleepFn,
    });
    await expect(failing.run()).rejects.toBeInstanceOf(ApiError);
  });
});

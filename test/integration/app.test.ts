import { describe, expect, it } from 'vitest';
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
});

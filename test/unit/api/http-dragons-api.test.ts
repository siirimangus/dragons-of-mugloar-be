import { describe, expect, it } from 'vitest';
import { ApiError, ValidationError } from '../../../src/api/errors.js';
import { HttpDragonsApi, type FetchFn } from '../../../src/api/http-dragons-api.js';
import { loadFixture } from '../../support/fixtures.js';

type Call = { url: string; method: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup(
  handler: (call: Call, index: number) => Response | Promise<Response>,
  baseUrl = 'https://api.test/v2',
) {
  const calls: Call[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const call = { url: input, method: init?.method ?? 'GET' };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  const api = new HttpDragonsApi({
    baseUrl,
    timeoutMs: 1000,
    retry: { attempts: 3, baseDelayMs: 0, sleep: async () => undefined },
    fetch: fetchFn,
  });
  return { api, calls };
}

describe('HttpDragonsApi', () => {
  it('starts a game with POST /game/start', async () => {
    const { api, calls } = setup(() => json(loadFixture('start-game.json')));
    const state = await api.startGame();
    expect(calls).toEqual([{ url: 'https://api.test/v2/game/start', method: 'POST' }]);
    expect(state.lives).toBe(3);
  });

  it('fetches messages with GET /:gameId/messages', async () => {
    const { api, calls } = setup(() => json(loadFixture('messages-plain.json')));
    const ads = await api.getMessages('abc');
    expect(calls).toEqual([{ url: 'https://api.test/v2/abc/messages', method: 'GET' }]);
    expect(ads.length).toBeGreaterThan(0);
  });

  it('solves with POST /:gameId/solve/:adId', async () => {
    const { api, calls } = setup(() => json(loadFixture('solve-result.json')));
    await api.solve('abc', 'xyz');
    expect(calls).toEqual([{ url: 'https://api.test/v2/abc/solve/xyz', method: 'POST' }]);
  });

  it('fetches the shop with GET /:gameId/shop', async () => {
    const { api, calls } = setup(() => json(loadFixture('shop.json')));
    const items = await api.getShop('abc');
    expect(calls).toEqual([{ url: 'https://api.test/v2/abc/shop', method: 'GET' }]);
    expect(items.length).toBeGreaterThan(0);
  });

  it('buys with POST /:gameId/shop/buy/:itemId', async () => {
    const { api, calls } = setup(() => json(loadFixture('purchase-result.json')));
    const result = await api.buy('abc', 'hpot');
    expect(calls).toEqual([{ url: 'https://api.test/v2/abc/shop/buy/hpot', method: 'POST' }]);
    expect(result.shoppingSuccess).toBe(true);
  });

  it('strips trailing slashes from the base URL and encodes path segments', async () => {
    const { api, calls } = setup(
      () => json(loadFixture('solve-result.json')),
      'https://api.test/v2/',
    );
    await api.solve('a/b', 'c d');
    expect(calls[0]?.url).toBe('https://api.test/v2/a%2Fb/solve/c%20d');
  });

  it('retries 5xx responses and then succeeds', async () => {
    const { api, calls } = setup((_call, index) =>
      index === 0 ? json({ error: 'down' }, 503) : json(loadFixture('start-game.json')),
    );
    await expect(api.startGame()).resolves.toMatchObject({ lives: 3 });
    expect(calls).toHaveLength(2);
  });

  it('retries 429 responses', async () => {
    const { api, calls } = setup((_call, index) =>
      index === 0 ? json({}, 429) : json(loadFixture('start-game.json')),
    );
    await api.startGame();
    expect(calls).toHaveLength(2);
  });

  it('does not retry 4xx responses and exposes the status', async () => {
    const { api, calls } = setup(() => json({ error: 'nope' }, 404));
    const error = await api.solve('abc', 'xyz').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).retryable).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('retries network failures and then throws a retryable ApiError', async () => {
    const { api, calls } = setup(() => {
      throw new TypeError('fetch failed');
    });
    const error = await api.startGame().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).retryable).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it('throws ValidationError for invalid JSON without retrying', async () => {
    const { api, calls } = setup(() => new Response('<html>oops</html>', { status: 200 }));
    await expect(api.startGame()).rejects.toThrow(ValidationError);
    expect(calls).toHaveLength(1);
  });

  it('throws ValidationError when the shape is wrong', async () => {
    const { api } = setup(() => json({ gameId: 'a' }));
    await expect(api.startGame()).rejects.toThrow(ValidationError);
  });
});

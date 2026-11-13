import { describe, expect, it, vi } from 'vitest';
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
  handler: (call: Call, index: number, init?: RequestInit) => Response | Promise<Response>,
  baseUrl = 'https://api.test/v2',
  timeoutMs = 1000,
) {
  const calls: Call[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const call = { url: input, method: init?.method ?? 'GET' };
    calls.push(call);
    inits.push(init);
    return handler(call, calls.length - 1, init);
  };
  const api = new HttpDragonsApi({
    baseUrl,
    timeoutMs,
    retry: { attempts: 3, baseDelayMs: 0, sleep: async () => undefined },
    fetch: fetchFn,
  });
  return { api, calls, inits };
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
    const result = api.solve('abc', 'xyz');
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 404, retryable: false });
    expect(calls).toHaveLength(1);
  });

  it('retries network failures and then throws a retryable ApiError', async () => {
    const { api, calls } = setup(() => {
      throw new TypeError('fetch failed');
    });
    const result = api.startGame();
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ retryable: true });
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

  it('sends the accept header', async () => {
    const { api, inits } = setup(() => json(loadFixture('start-game.json')));
    await api.startGame();
    expect(new Headers(inits[0]?.headers).get('accept')).toBe('application/json');
  });

  it('retries 408 responses', async () => {
    const { api, calls } = setup((_call, index) =>
      index === 0 ? json({}, 408) : json(loadFixture('start-game.json')),
    );
    await api.startGame();
    expect(calls).toHaveLength(2);
  });

  it('exhausts retries on a persistent 503', async () => {
    const { api, calls } = setup(() => json({}, 503));
    const result = api.startGame();
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 503, retryable: true });
    expect(calls).toHaveLength(3);
  });

  it.each([503, 404])('cancels the unread body on a %i response', async (status) => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ cancel });
    const { api } = setup(() => new Response(stream, { status }));
    await expect(api.solve('abc', 'xyz')).rejects.toBeInstanceOf(ApiError);
    expect(cancel).toHaveBeenCalled();
  });

  it('times out hanging requests with a retryable ApiError', async () => {
    const { api, calls } = setup(
      (_call, _index, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
      'https://api.test/v2',
      5,
    );
    const result = api.startGame();
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ retryable: true });
    expect(calls).toHaveLength(3);
  });

  it('gives each attempt its own fresh AbortSignal', async () => {
    const alreadyAborted: boolean[] = [];
    const { api, inits } = setup((_call, _index, init) => {
      alreadyAborted.push(init?.signal?.aborted ?? true);
      return json({}, 503);
    });
    await expect(api.startGame()).rejects.toBeInstanceOf(ApiError);
    const signals = inits.map((init) => init?.signal);
    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(3);
    expect(alreadyAborted).toEqual([false, false, false]);
  });

  it('throws ValidationError for a null body', async () => {
    const { api } = setup(() => json(null));
    await expect(api.startGame()).rejects.toThrow(ValidationError);
  });

  describe('network error diagnostics', () => {
    const failWith = (thrown: unknown, timeoutMs = 1000) =>
      setup(
        () => {
          throw thrown;
        },
        'https://api.test/v2',
        timeoutMs,
      ).api.startGame();

    it('includes the underlying cause code and keeps the original as cause', async () => {
      const thrown = Object.assign(new TypeError('fetch failed'), {
        cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
      });
      const result = failWith(thrown);
      await expect(result).rejects.toThrow(
        /POST \/game\/start failed: network error \(.*ECONNRESET.*\)/,
      );
      await expect(result).rejects.toMatchObject({ cause: thrown, retryable: true });
    });

    it('describes a plain Error', async () => {
      await expect(failWith(new Error('boom'))).rejects.toThrow('network error (boom)');
    });

    it('describes a non-Error throwable', async () => {
      await expect(failWith('kaput')).rejects.toThrow('network error (kaput)');
    });

    it('mentions the timeout when the request timed out', async () => {
      const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      await expect(failWith(timeout, 10000)).rejects.toThrow(
        'network error (timed out after 10000ms)',
      );
    });
  });
});

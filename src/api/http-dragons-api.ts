import type { GameState, PurchaseResult, RawAd, ShopItem, SolveResult } from '../models/types.js';
import type { DragonsApi } from './dragons-api.js';
import { ApiError, ValidationError } from './errors.js';
import { type RetryOptions, withRetry } from './retry.js';
import {
  parseMessages,
  parsePurchaseResult,
  parseShop,
  parseSolveResult,
  parseStartGame,
} from './schemas.js';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpDragonsApiOptions = {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly retry: RetryOptions;
  readonly fetch?: FetchFn;
};

const segment = (value: string): string => encodeURIComponent(value);

export class HttpDragonsApi implements DragonsApi {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retry: RetryOptions;
  private readonly fetchFn: FetchFn;

  constructor(options: HttpDragonsApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs;
    this.retry = options.retry;
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  }

  startGame(): Promise<GameState> {
    return this.request('POST', '/game/start', parseStartGame);
  }

  getMessages(gameId: string): Promise<RawAd[]> {
    return this.request('GET', `/${segment(gameId)}/messages`, parseMessages);
  }

  solve(gameId: string, adId: string): Promise<SolveResult> {
    return this.request('POST', `/${segment(gameId)}/solve/${segment(adId)}`, parseSolveResult);
  }

  getShop(gameId: string): Promise<ShopItem[]> {
    return this.request('GET', `/${segment(gameId)}/shop`, parseShop);
  }

  buy(gameId: string, itemId: string): Promise<PurchaseResult> {
    return this.request(
      'POST',
      `/${segment(gameId)}/shop/buy/${segment(itemId)}`,
      parsePurchaseResult,
    );
  }

  private request<T>(
    method: 'GET' | 'POST',
    path: string,
    parse: (body: unknown) => T,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    return withRetry(async () => {
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method,
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (cause) {
        throw new ApiError(`${method} ${path} failed: network error`, { retryable: true, cause });
      }
      if (!response.ok) {
        throw new ApiError(`${method} ${path} failed with status ${response.status}`, {
          status: response.status,
          retryable: response.status >= 500 || response.status === 429,
        });
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ValidationError(`${method} ${path} returned invalid JSON`);
      }
      return parse(body);
    }, this.retry);
  }
}

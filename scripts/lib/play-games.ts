import { createApp } from '../../src/app.js';
import type { AppConfig } from '../../src/config/env.js';
import type { Tuning } from '../../src/config/tuning.js';
import type { RunSummary } from '../../src/models/types.js';
import type { Logger } from '../../src/utils/logger.js';
import { type PurchaseRecord, RecordingApi, type SolveRecord } from './recording-api.js';

export type GameReport =
  | {
      readonly ok: true;
      readonly summary: RunSummary;
      readonly solves: readonly SolveRecord[];
      readonly purchases: readonly PurchaseRecord[];
      /** true when shop prices changed during the game, null when it could not be checked */
      readonly shopDrift: boolean | null;
    }
  | { readonly ok: false; readonly error: string };

export type PlayOptions = {
  readonly games: number;
  readonly concurrency: number;
  readonly config: AppConfig;
  readonly tuning: Tuning;
  readonly logger: Logger;
};

export function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be an integer >= 1, got ${concurrency}`);
  }
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  return Promise.all(workers).then(() => results);
}

async function playOne(options: PlayOptions): Promise<GameReport> {
  const holder: { recorder?: RecordingApi } = {};
  const app = createApp({
    config: options.config,
    logger: options.logger,
    tuning: options.tuning,
    decorateApi: (api) => {
      holder.recorder = new RecordingApi(api);
      return holder.recorder;
    },
  });
  try {
    const summary = await app.run();
    const recorder = holder.recorder;
    let shopDrift: boolean | null = null;
    if (recorder?.firstShop) {
      try {
        const after = await recorder.getShop(summary.gameId);
        shopDrift = JSON.stringify(after) !== JSON.stringify(recorder.firstShop);
      } catch {
        shopDrift = null;
      }
    }
    return {
      ok: true,
      summary,
      solves: recorder?.solves ?? [],
      purchases: recorder?.purchases ?? [],
      shopDrift,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function playGames(options: PlayOptions): Promise<GameReport[]> {
  const indexes = Array.from({ length: options.games }, (_, index) => index);
  return mapPool(indexes, options.concurrency, () => playOne(options));
}

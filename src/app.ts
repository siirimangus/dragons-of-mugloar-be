import type { DragonsApi } from './api/dragons-api.js';
import { HttpDragonsApi, type FetchFn } from './api/http-dragons-api.js';
import type { AppConfig } from './config/env.js';
import { DEFAULT_TUNING, type Tuning } from './config/tuning.js';
import type { RunSummary } from './models/types.js';
import { GameService } from './services/game.service.js';
import { ExpectedValueStrategy } from './services/strategy.js';
import type { Logger } from './utils/logger.js';
import { sleep } from './utils/sleep.js';

export type AppDeps = {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly fetch?: FetchFn;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly tuning?: Tuning;
  /** Seam for tooling (e.g. recording) that wraps the real API client. */
  readonly decorateApi?: (api: DragonsApi) => DragonsApi;
};

export type App = {
  run(signal?: AbortSignal): Promise<RunSummary>;
};

export function createApp(deps: AppDeps): App {
  const { config, logger } = deps;

  const httpApi = new HttpDragonsApi({
    baseUrl: config.apiBaseUrl,
    timeoutMs: config.httpTimeoutMs,
    retry: {
      attempts: config.retryAttempts,
      baseDelayMs: config.retryBaseDelayMs,
      sleep: deps.sleep ?? sleep,
    },
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  const api = deps.decorateApi ? deps.decorateApi(httpApi) : httpApi;

  const service = new GameService({
    api,
    strategy: new ExpectedValueStrategy(deps.tuning ?? DEFAULT_TUNING),
    logger,
    options: { maxConsecutiveFailures: config.maxConsecutiveFailures },
  });

  return { run: (signal) => service.run(signal) };
}

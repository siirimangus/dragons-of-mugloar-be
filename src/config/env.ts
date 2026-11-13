import { z } from 'zod';
import type { LogLevel } from '../utils/logger.js';

export type AppConfig = {
  readonly apiBaseUrl: string;
  readonly httpTimeoutMs: number;
  readonly retryAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly maxConsecutiveFailures: number;
  readonly maxTurns: number;
  readonly logLevel: LogLevel;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const envSchema = z.object({
  DRAGONS_API_BASE_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://dragonsofmugloar.com/api/v2'),
  DRAGONS_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DRAGONS_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  DRAGONS_RETRY_BASE_DELAY_MS: z.coerce.number().int().min(0).default(250),
  DRAGONS_MAX_CONSECUTIVE_FAILURES: z.coerce.number().int().min(1).default(5),
  DRAGONS_MAX_TURNS: z.coerce.number().int().positive().default(1000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

function withoutBlanks(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter(([, v]) => v === undefined || v.trim() !== ''),
  );
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(withoutBlanks(env));
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const values = parsed.data;
  return {
    apiBaseUrl: values.DRAGONS_API_BASE_URL,
    httpTimeoutMs: values.DRAGONS_HTTP_TIMEOUT_MS,
    retryAttempts: values.DRAGONS_RETRY_ATTEMPTS,
    retryBaseDelayMs: values.DRAGONS_RETRY_BASE_DELAY_MS,
    maxConsecutiveFailures: values.DRAGONS_MAX_CONSECUTIVE_FAILURES,
    maxTurns: values.DRAGONS_MAX_TURNS,
    logLevel: values.LOG_LEVEL,
  };
}

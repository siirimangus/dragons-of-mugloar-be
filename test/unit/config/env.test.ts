import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../../src/config/env.js';

describe('loadConfig', () => {
  it('uses defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      apiBaseUrl: 'https://dragonsofmugloar.com/api/v2',
      httpTimeoutMs: 10_000,
      retryAttempts: 3,
      retryBaseDelayMs: 250,
      maxConsecutiveFailures: 5,
      maxTurns: 1000,
      logLevel: 'info',
    });
  });

  it('applies overrides', () => {
    const config = loadConfig({
      DRAGONS_API_BASE_URL: 'http://localhost:8080/api/v2',
      DRAGONS_HTTP_TIMEOUT_MS: '2500',
      DRAGONS_RETRY_ATTEMPTS: '5',
      DRAGONS_RETRY_BASE_DELAY_MS: '0',
      DRAGONS_MAX_CONSECUTIVE_FAILURES: '2',
      DRAGONS_MAX_TURNS: '50',
      LOG_LEVEL: 'debug',
    });
    expect(config).toEqual({
      apiBaseUrl: 'http://localhost:8080/api/v2',
      httpTimeoutMs: 2500,
      retryAttempts: 5,
      retryBaseDelayMs: 0,
      maxConsecutiveFailures: 2,
      maxTurns: 50,
      logLevel: 'debug',
    });
  });

  it.each([
    ['DRAGONS_HTTP_TIMEOUT_MS', 'abc'],
    ['DRAGONS_HTTP_TIMEOUT_MS', '-5'],
    ['DRAGONS_RETRY_ATTEMPTS', '0'],
    ['DRAGONS_MAX_TURNS', '0'],
    ['DRAGONS_API_BASE_URL', 'not a url'],
    ['LOG_LEVEL', 'loud'],
  ])('rejects %s=%s with a readable error', (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ [key]: value })).toThrow(key);
  });
});

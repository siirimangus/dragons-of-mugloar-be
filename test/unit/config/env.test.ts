import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../../src/config/env.js';

describe('loadConfig', () => {
  it('uses defaults for an empty environment', () => {
    expect(loadConfig({})).toEqual({
      apiBaseUrl: 'https://dragonsofmugloar.com/api/v2',
      httpTimeoutMs: 10_000,
      retryAttempts: 5,
      retryBaseDelayMs: 500,
      maxConsecutiveFailures: 5,
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
      LOG_LEVEL: 'debug',
    });
    expect(config).toEqual({
      apiBaseUrl: 'http://localhost:8080/api/v2',
      httpTimeoutMs: 2500,
      retryAttempts: 5,
      retryBaseDelayMs: 0,
      maxConsecutiveFailures: 2,
      logLevel: 'debug',
    });
  });

  it.each([
    ['DRAGONS_HTTP_TIMEOUT_MS', 'abc'],
    ['DRAGONS_HTTP_TIMEOUT_MS', '-5'],
    ['DRAGONS_HTTP_TIMEOUT_MS', '12.5'],
    ['DRAGONS_HTTP_TIMEOUT_MS', 'Infinity'],
    ['DRAGONS_RETRY_ATTEMPTS', '0'],
    ['DRAGONS_RETRY_ATTEMPTS', '11'],
    ['DRAGONS_RETRY_BASE_DELAY_MS', '-1'],
    ['DRAGONS_MAX_CONSECUTIVE_FAILURES', '0'],
    ['DRAGONS_API_BASE_URL', 'not a url'],
    ['DRAGONS_API_BASE_URL', 'ftp://example.com'],
    ['DRAGONS_API_BASE_URL', 'foo:bar'],
    ['LOG_LEVEL', 'loud'],
  ])('rejects %s=%s with a readable error', (key, value) => {
    let error: unknown;
    try {
      loadConfig({ [key]: value });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).message).toContain(key);
  });

  it('names every invalid variable in the error', () => {
    let error: unknown;
    try {
      loadConfig({ DRAGONS_RETRY_ATTEMPTS: '0', LOG_LEVEL: 'loud' });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).message).toContain('DRAGONS_RETRY_ATTEMPTS');
    expect((error as ConfigError).message).toContain('LOG_LEVEL');
  });

  it.each(['', '  '])('treats blank DRAGONS_RETRY_BASE_DELAY_MS %j as unset', (value) => {
    expect(loadConfig({ DRAGONS_RETRY_BASE_DELAY_MS: value }).retryBaseDelayMs).toBe(500);
  });

  it('accepts DRAGONS_RETRY_ATTEMPTS at the upper bound of 10', () => {
    expect(loadConfig({ DRAGONS_RETRY_ATTEMPTS: '10' }).retryAttempts).toBe(10);
  });

  it('treats a blank DRAGONS_API_BASE_URL as unset', () => {
    expect(loadConfig({ DRAGONS_API_BASE_URL: '' }).apiBaseUrl).toBe(
      'https://dragonsofmugloar.com/api/v2',
    );
  });
});

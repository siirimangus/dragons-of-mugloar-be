import { describe, expect, it } from 'vitest';
import { createConsoleLogger, silentLogger, type LogLevel } from '../../../src/utils/logger.js';

function makeSink() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    sink: { log: (line: string) => out.push(line), error: (line: string) => err.push(line) },
  };
}

describe('createConsoleLogger', () => {
  it('writes info to the log stream and warn/error to the error stream', () => {
    const { out, err, sink } = makeSink();
    const logger = createConsoleLogger('debug', sink);
    logger.info('hello');
    logger.warn('careful');
    logger.error('boom');
    expect(out).toEqual(['[info] hello']);
    expect(err).toEqual(['[warn] careful', '[error] boom']);
  });

  it('appends metadata as JSON', () => {
    const { out, sink } = makeSink();
    createConsoleLogger('info', sink).info('turn', { n: 1 });
    expect(out).toEqual(['[info] turn {"n":1}']);
  });

  it('filters messages below the configured level', () => {
    const { out, err, sink } = makeSink();
    const logger = createConsoleLogger('warn', sink);
    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    expect(out).toEqual([]);
    expect(err).toEqual(['[warn] w']);
  });

  it('prints nothing when silent', () => {
    const { out, err, sink } = makeSink();
    const logger = createConsoleLogger('silent', sink);
    logger.error('boom');
    expect(out).toEqual([]);
    expect(err).toEqual([]);
  });

  it('serialises BigInt metadata as strings', () => {
    const { out, sink } = makeSink();
    createConsoleLogger('info', sink).info('big', { n: 10n });
    expect(out).toEqual(['[info] big {"n":"10"}']);
  });

  it('serialises Error metadata with name and message', () => {
    const { err, sink } = makeSink();
    createConsoleLogger('info', sink).error('failed', { cause: new TypeError('bad') });
    expect(err).toEqual(['[error] failed {"cause":{"name":"TypeError","message":"bad"}}']);
  });

  it('does not throw on circular metadata', () => {
    const { out, sink } = makeSink();
    const meta: Record<string, unknown> = {};
    meta.self = meta;
    expect(() => createConsoleLogger('info', sink).info('loop', meta)).not.toThrow();
    expect(out).toEqual(['[info] loop [unserializable meta]']);
  });

  it('prints no suffix for empty metadata', () => {
    const { out, sink } = makeSink();
    createConsoleLogger('info', sink).info('plain', {});
    expect(out).toEqual(['[info] plain']);
  });

  it('sends warn and error with metadata to the error stream', () => {
    const { out, err, sink } = makeSink();
    const logger = createConsoleLogger('debug', sink);
    logger.warn('w', { a: 1 });
    logger.error('e', { b: 2 });
    expect(out).toEqual([]);
    expect(err).toEqual(['[warn] w {"a":1}', '[error] e {"b":2}']);
  });

  const levels = ['debug', 'info', 'warn', 'error'] as const;
  const cases = (['debug', 'info', 'warn', 'error', 'silent'] as LogLevel[]).flatMap((configured) =>
    levels.map((msg) => ({
      configured,
      msg,
      emitted:
        configured !== 'silent' &&
        levels.indexOf(msg) >= levels.indexOf(configured as (typeof levels)[number]),
    })),
  );
  it.each(cases)(
    'level $configured, message $msg, emitted: $emitted',
    ({ configured, msg, emitted }) => {
      const { out, err, sink } = makeSink();
      createConsoleLogger(configured, sink)[msg]('m');
      const target = msg === 'warn' || msg === 'error' ? err : out;
      expect(target).toEqual(emitted ? [`[${msg}] m`] : []);
    },
  );
});

describe('silentLogger', () => {
  it('does nothing and does not throw', () => {
    expect(() => {
      silentLogger.debug('a', { x: 1 });
      silentLogger.info('a');
      silentLogger.warn('a');
      silentLogger.error('a');
    }).not.toThrow();
  });
});

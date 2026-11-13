import { describe, expect, it } from 'vitest';
import { createConsoleLogger } from '../../../src/utils/logger.js';

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
});

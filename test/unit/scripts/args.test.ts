import { describe, expect, it } from 'vitest';
import { numberArg, parseCalibrateArgs } from '../../../scripts/lib/args.js';

describe('numberArg', () => {
  it('returns undefined for an unset flag', () => {
    expect(numberArg('games', undefined, 1, true)).toBeUndefined();
  });

  it('parses valid values', () => {
    expect(numberArg('games', '5', 1, true)).toBe(5);
    expect(numberArg('life-value', '12.5', 0)).toBe(12.5);
  });

  it('rejects NaN, infinity, below-min and non-integers', () => {
    expect(() => numberArg('games', 'abc', 1, true)).toThrow(
      '--games must be an integer >= 1, got "abc"',
    );
    expect(() => numberArg('target', 'Infinity', 0)).toThrow(
      '--target must be a number >= 0, got "Infinity"',
    );
    expect(() => numberArg('games', '0', 1, true)).toThrow(
      '--games must be an integer >= 1, got "0"',
    );
    expect(() => numberArg('life-value', '-3', 0)).toThrow(
      '--life-value must be a number >= 0, got "-3"',
    );
    expect(() => numberArg('concurrency', '2.5', 1, true)).toThrow(
      '--concurrency must be an integer >= 1, got "2.5"',
    );
    expect(() => numberArg('games', '', 1, true)).toThrow(
      '--games must be an integer >= 1, got ""',
    );
  });
});

describe('parseCalibrateArgs', () => {
  it('uses defaults when nothing is given', () => {
    const args = parseCalibrateArgs([]);
    expect(args).toMatchObject({ games: 20, concurrency: 4, target: 1000 });
    expect(args.priority).toBeUndefined();
    expect(args.lifeValue).toBeUndefined();
    expect(args.healThreshold).toBeUndefined();
    expect(args.maxPotions).toBeUndefined();
  });

  it('parses valid values', () => {
    const args = parseCalibrateArgs([
      '--games',
      '3',
      '--concurrency',
      '2',
      '--target',
      '500',
      '--life-value',
      '100',
      '--heal-threshold',
      '1',
      '--max-potions',
      '7',
      '--priority',
      'cs,gas',
    ]);
    expect(args).toMatchObject({
      games: 3,
      concurrency: 2,
      target: 500,
      lifeValue: 100,
      healThreshold: 1,
      maxPotions: 7,
      priority: ['cs', 'gas'],
    });
  });

  it('accepts none as an empty priority list', () => {
    expect(parseCalibrateArgs(['--priority', 'none']).priority).toEqual([]);
  });

  it('rejects bad numbers', () => {
    expect(() => parseCalibrateArgs(['--games', '0'])).toThrow('--games');
    expect(() => parseCalibrateArgs(['--games', 'x'])).toThrow('--games');
    expect(() => parseCalibrateArgs(['--concurrency', '1.5'])).toThrow('--concurrency');
    expect(() => parseCalibrateArgs(['--max-potions', '-1'])).toThrow('--max-potions');
    expect(() => parseCalibrateArgs(['--max-potions', '1.5'])).toThrow('--max-potions');
    expect(() => parseCalibrateArgs(['--heal-threshold', '1.5'])).toThrow('--heal-threshold');
  });

  it('rejects an empty or unknown priority', () => {
    expect(() => parseCalibrateArgs(['--priority='])).toThrow('--priority must not be empty');
    expect(() => parseCalibrateArgs(['--priority', 'cs,bogus'])).toThrow(
      /unknown shop item "bogus"/,
    );
    expect(() => parseCalibrateArgs(['--priority', 'hpot'])).toThrow(/unknown shop item "hpot"/);
  });
});

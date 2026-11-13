import { describe, expect, it } from 'vitest';
import { mapPool } from '../../../scripts/lib/play-games.js';

describe('mapPool', () => {
  it('preserves order and respects the concurrency cap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6, 7];
    const results = await mapPool(items, 3, async (item) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10 - item));
      inFlight -= 1;
      return item * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(maxInFlight).toBe(3);
  });

  it('rejects an invalid concurrency', () => {
    expect(() => mapPool([1], 0, async (n) => n)).toThrow(RangeError);
    expect(() => mapPool([1], 1.5, async (n) => n)).toThrow(RangeError);
    expect(() => mapPool([1], Number.NaN, async (n) => n)).toThrow(RangeError);
  });
});

import { describe, expect, it } from 'vitest';
import { scoreStats } from '../../../scripts/lib/stats.js';

describe('scoreStats', () => {
  it('summarises a score distribution', () => {
    const stats = scoreStats([100, 500, 1000, 1500, 2000], 1000);
    expect(stats).toMatchObject({ count: 5, min: 100, median: 1000, max: 2000, mean: 1020 });
    expect(stats.shareAtLeast).toBeCloseTo(0.6);
  });

  it('handles a single score', () => {
    expect(scoreStats([700], 1000)).toMatchObject({
      min: 700,
      median: 700,
      max: 700,
      shareAtLeast: 0,
    });
  });

  it('refuses an empty list', () => {
    expect(() => scoreStats([], 1000)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../../../src/config/tuning.js';

describe('DEFAULT_TUNING', () => {
  it('has probabilities between 0 and 1', () => {
    for (const value of [
      ...Object.values(DEFAULT_TUNING.labelProbability),
      DEFAULT_TUNING.unknownLabelProbability,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('values a life above zero', () => {
    expect(DEFAULT_TUNING.lifeValue).toBeGreaterThan(0);
  });

  it('allows a finite, non-zero potion budget so a run both survives and ends', () => {
    expect(DEFAULT_TUNING.maxPotions).toBeGreaterThan(0);
    expect(Number.isFinite(DEFAULT_TUNING.maxPotions)).toBe(true);
    expect(Number.isInteger(DEFAULT_TUNING.maxPotions)).toBe(true);
  });

  it('has no stateful (global or sticky) trap patterns', () => {
    for (const pattern of DEFAULT_TUNING.trapPatterns) {
      expect(pattern.flags).not.toMatch(/[gy]/);
    }
  });

  it('lists each upgrade once and never the healing item', () => {
    const priority = DEFAULT_TUNING.upgradePriority;
    expect(new Set(priority).size).toBe(priority.length);
    expect(priority).not.toContain(DEFAULT_TUNING.healItemId);
  });
});

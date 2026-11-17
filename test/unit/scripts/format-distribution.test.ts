import { describe, expect, it } from 'vitest';
import { formatDistribution } from '../../../scripts/lib/format-distribution.js';
import type { GameReport } from '../../../scripts/lib/play-games.js';
import type { EndReason, RunSummary } from '../../../src/models/types.js';

function ok(score: number, turns: number, endedBy: EndReason, purchases: number): GameReport {
  const summary: RunSummary = {
    gameId: 'g',
    score,
    highScore: score,
    turns,
    solved: 0,
    failed: 0,
    purchases,
    goldSpent: 0,
    finalGold: 0,
    finalLives: 0,
    endedBy,
  };
  return { ok: true, summary, solves: [], purchases: [], shopDrift: null };
}

describe('formatDistribution', () => {
  it('lists each game and the distribution', () => {
    const lines = formatDistribution(
      [ok(1500, 80, 'stalled', 3), ok(500, 20, 'lives', 1), { ok: false, error: 'boom' }],
      1000,
    );
    expect(lines).toEqual([
      '=== live acceptance results ===',
      'game 1: score=1500 turns=80 endedBy=stalled purchases=3',
      'game 2: score=500 turns=20 endedBy=lives purchases=1',
      'game 3: ERROR boom',
      'games=2 min=500 p10=500 median=1500 mean=1000 max=1500 share>=1000: 50%',
      'ended by lives=1 stalled=1',
    ]);
  });

  it('reports when no game finished', () => {
    expect(formatDistribution([{ ok: false, error: 'x' }], 1000)).toEqual([
      '=== live acceptance results ===',
      'game 1: ERROR x',
      'no finished games',
    ]);
  });
});

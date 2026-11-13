export type ScoreStats = {
  readonly count: number;
  readonly min: number;
  readonly p10: number;
  readonly median: number;
  readonly mean: number;
  readonly max: number;
  readonly shareAtLeast: number;
};

export function scoreStats(scores: readonly number[], target: number): ScoreStats {
  if (scores.length === 0) throw new Error('No scores to summarise');
  const sorted = [...scores].sort((a, b) => a - b);
  const at = (quantile: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))] as number;
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0] as number,
    p10: at(0.1),
    median: at(0.5),
    mean: sum / sorted.length,
    max: sorted[sorted.length - 1] as number,
    shareAtLeast: sorted.filter((value) => value >= target).length / sorted.length,
  };
}

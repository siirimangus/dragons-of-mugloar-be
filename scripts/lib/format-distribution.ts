import type { GameReport } from './play-games.js';
import { scoreStats } from './stats.js';

/** Formats per-game results and the score distribution as printable lines. */
export function formatDistribution(reports: readonly GameReport[], target: number): string[] {
  const lines = ['=== live acceptance results ==='];
  reports.forEach((report, index) => {
    const label = `game ${index + 1}`;
    lines.push(
      report.ok
        ? `${label}: score=${report.summary.score} turns=${report.summary.turns} ` +
            `endedBy=${report.summary.endedBy} purchases=${report.summary.purchases}`
        : `${label}: ERROR ${report.error}`,
    );
  });

  const summaries = reports.flatMap((report) => (report.ok ? [report.summary] : []));
  if (summaries.length === 0) {
    lines.push('no finished games');
    return lines;
  }
  const stats = scoreStats(
    summaries.map((summary) => summary.score),
    target,
  );
  lines.push(
    `games=${stats.count} min=${stats.min} p10=${stats.p10} median=${stats.median} ` +
      `mean=${stats.mean.toFixed(0)} max=${stats.max} ` +
      `share>=${target}: ${(stats.shareAtLeast * 100).toFixed(0)}%`,
  );
  // Counted from the data rather than a fixed list, so a new EndReason cannot go unreported.
  const byReason = new Map<string, number>();
  for (const summary of summaries) {
    byReason.set(summary.endedBy, (byReason.get(summary.endedBy) ?? 0) + 1);
  }
  const counts = [...byReason]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, n]) => `${reason}=${n}`);
  lines.push(`ended by ${counts.join(' ')}`);
  return lines;
}

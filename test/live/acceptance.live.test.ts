import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { DEFAULT_TUNING } from '../../src/config/tuning.js';
import { createConsoleLogger } from '../../src/utils/logger.js';
import { formatDistribution } from '../../scripts/lib/format-distribution.js';
import { playGames } from '../../scripts/lib/play-games.js';
import { scoreStats } from '../../scripts/lib/stats.js';

const GAMES = Number(process.env.LIVE_GAMES ?? 20);
const MIN_SCORE = 1000;
const MIN_SHARE = Number(process.env.LIVE_MIN_SHARE ?? 0.9);

describe('live acceptance', () => {
  it(`reaches ${MIN_SCORE}+ points in at least ${MIN_SHARE * 100}% of ${GAMES} real games`, async () => {
    const config = loadConfig({
      ...process.env,
      DRAGONS_MAX_TURNS: process.env.DRAGONS_MAX_TURNS ?? '300',
      LOG_LEVEL: 'warn',
    });
    const reports = await playGames({
      games: GAMES,
      concurrency: 4,
      config,
      tuning: DEFAULT_TUNING,
      logger: createConsoleLogger('warn'),
    });

    // Print before asserting so the results are visible even when an assertion fails.
    // process.stdout.write is used because vitest's default reporter hides console.log of passing tests.
    process.stdout.write(`\n${formatDistribution(reports, MIN_SCORE).join('\n')}\n`);

    const errors = reports.flatMap((report) => (report.ok ? [] : [report.error]));
    expect(errors).toEqual([]);

    const scores = reports.flatMap((report) => (report.ok ? [report.summary.score] : []));
    const stats = scoreStats(scores, MIN_SCORE);
    expect(stats.shareAtLeast).toBeGreaterThanOrEqual(MIN_SHARE);
  });
});

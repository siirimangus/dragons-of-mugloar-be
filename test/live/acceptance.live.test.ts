import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { DEFAULT_TUNING } from '../../src/config/tuning.js';
import { createConsoleLogger } from '../../src/utils/logger.js';
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

    const errors = reports.flatMap((report) => (report.ok ? [] : [report.error]));
    expect(errors).toEqual([]);

    const scores = reports.flatMap((report) => (report.ok ? [report.summary.score] : []));
    const stats = scoreStats(scores, MIN_SCORE);
    console.log(
      `games=${stats.count} min=${stats.min} median=${stats.median} max=${stats.max} ` +
        `share>=${MIN_SCORE}: ${(stats.shareAtLeast * 100).toFixed(0)}%`,
    );
    expect(stats.shareAtLeast).toBeGreaterThanOrEqual(MIN_SHARE);
  });
});

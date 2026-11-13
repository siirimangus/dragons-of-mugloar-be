import { parseArgs } from 'node:util';
import { loadConfig } from '../src/config/env.js';
import { DEFAULT_TUNING, type Tuning } from '../src/config/tuning.js';
import { createConsoleLogger } from '../src/utils/logger.js';
import { playGames } from './lib/play-games.js';
import { scoreStats } from './lib/stats.js';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '20' },
    concurrency: { type: 'string', default: '4' },
    'max-turns': { type: 'string', default: '200' },
    priority: { type: 'string' },
    'life-value': { type: 'string' },
    'heal-threshold': { type: 'string' },
    target: { type: 'string', default: '1000' },
  },
});

function buildTuning(): Tuning {
  const priority =
    values.priority === undefined
      ? DEFAULT_TUNING.upgradePriority
      : values.priority === 'none'
        ? []
        : values.priority.split(',');
  return {
    ...DEFAULT_TUNING,
    upgradePriority: priority,
    lifeValue:
      values['life-value'] === undefined ? DEFAULT_TUNING.lifeValue : Number(values['life-value']),
    healThreshold:
      values['heal-threshold'] === undefined
        ? DEFAULT_TUNING.healThreshold
        : Number(values['heal-threshold']),
  };
}

const tuning = buildTuning();
const target = Number(values.target);
const config = loadConfig({
  ...process.env,
  DRAGONS_MAX_TURNS: values['max-turns'],
  LOG_LEVEL: 'warn',
});

console.log(
  `Playing ${values.games} games (concurrency ${values.concurrency}, max ${values['max-turns']} turns)`,
);
console.log(
  `Tuning: priority=[${tuning.upgradePriority.join(',')}] lifeValue=${tuning.lifeValue} healThreshold=${tuning.healThreshold}`,
);

const reports = await playGames({
  games: Number(values.games),
  concurrency: Number(values.concurrency),
  config,
  tuning,
  logger: createConsoleLogger('warn'),
});

const okReports = reports.flatMap((report) => (report.ok ? [report] : []));
const errors = reports.flatMap((report) => (report.ok ? [] : [report.error]));

if (okReports.length > 0) {
  const stats = scoreStats(
    okReports.map((report) => report.summary.score),
    target,
  );
  const turns = okReports.map((report) => report.summary.turns);
  const endings = new Map<string, number>();
  for (const report of okReports) {
    endings.set(report.summary.endedBy, (endings.get(report.summary.endedBy) ?? 0) + 1);
  }
  console.log('\n== Scores ==');
  console.log(
    `games=${stats.count} min=${stats.min} p10=${stats.p10} median=${stats.median} ` +
      `mean=${stats.mean.toFixed(0)} max=${stats.max} share>=${target}: ${(stats.shareAtLeast * 100).toFixed(0)}%`,
  );
  console.log(`mean turns=${(turns.reduce((a, b) => a + b, 0) / turns.length).toFixed(1)}`);
  console.log(`ended by: ${[...endings].map(([reason, n]) => `${reason}=${n}`).join(' ')}`);

  console.log('\n== Success rate per probability label ==');
  const byLabel = new Map<string, { attempts: number; successes: number; reward: number }>();
  for (const report of okReports) {
    for (const solve of report.solves) {
      const entry = byLabel.get(solve.label) ?? { attempts: 0, successes: 0, reward: 0 };
      entry.attempts += 1;
      entry.successes += solve.success ? 1 : 0;
      entry.reward += solve.reward;
      byLabel.set(solve.label, entry);
    }
  }
  for (const [label, entry] of [...byLabel].sort((a, b) => b[1].attempts - a[1].attempts)) {
    const current = DEFAULT_TUNING.labelProbability[label];
    console.log(
      `${label.padEnd(20)} attempts=${String(entry.attempts).padStart(4)} ` +
        `observed=${(entry.successes / entry.attempts).toFixed(2)} ` +
        `tuned=${current ?? 'n/a'} avgReward=${(entry.reward / entry.attempts).toFixed(0)}`,
    );
  }

  console.log('\n== Failures grouped by API message ==');
  const failures = new Map<string, { count: number; samples: Set<string> }>();
  for (const report of okReports) {
    for (const solve of report.solves) {
      if (solve.success) continue;
      const entry = failures.get(solve.resultMessage) ?? { count: 0, samples: new Set<string>() };
      entry.count += 1;
      if (entry.samples.size < 6) entry.samples.add(solve.adMessage);
      failures.set(solve.resultMessage, entry);
    }
  }
  for (const [message, entry] of [...failures].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`${entry.count}x "${message}"`);
    for (const sample of entry.samples) console.log(`     e.g. ${sample}`);
  }

  console.log('\n== Purchases (itemId: successes/attempts, levels seen) ==');
  const byItem = new Map<string, { attempts: number; successes: number; levels: Set<number> }>();
  for (const report of okReports) {
    for (const purchase of report.purchases) {
      const entry = byItem.get(purchase.itemId) ?? {
        attempts: 0,
        successes: 0,
        levels: new Set<number>(),
      };
      entry.attempts += 1;
      entry.successes += purchase.success ? 1 : 0;
      entry.levels.add(purchase.level);
      byItem.set(purchase.itemId, entry);
    }
  }
  for (const [itemId, entry] of byItem) {
    console.log(
      `${itemId}: ${entry.successes}/${entry.attempts}, levels [${[...entry.levels].sort().join(',')}]`,
    );
  }

  const drift = okReports.map((report) => report.shopDrift);
  console.log(
    `\nShop prices changed during a game: ${drift.filter((d) => d === true).length} of ${drift.length} ` +
      `(unknown: ${drift.filter((d) => d === null).length})`,
  );
}

if (errors.length > 0) {
  console.log(`\n== ${errors.length} game(s) failed with errors ==`);
  for (const message of new Set(errors)) console.log(`- ${message}`);
}

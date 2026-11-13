import { createApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import type { RunSummary } from './models/types.js';
import { createConsoleLogger } from './utils/logger.js';

function printSummary(summary: RunSummary): void {
  console.log(`Game ${summary.gameId} ended (${summary.endedBy})`);
  console.log(`  score:      ${summary.score}`);
  console.log(`  turns:      ${summary.turns}`);
  console.log(`  solved:     ${summary.solved}`);
  console.log(`  failed:     ${summary.failed}`);
  console.log(`  purchases:  ${summary.purchases} (${summary.goldSpent} gold)`);
  console.log(`  final gold: ${summary.finalGold}, lives: ${summary.finalLives}`);
  if (summary.endedBy === 'stalled') console.log('  note: stalled (no safe action available)');
}

async function main(): Promise<number> {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  const logger = createConsoleLogger(config.logLevel);
  const controller = new AbortController();
  process.once('SIGINT', () => {
    logger.warn('SIGINT received, finishing the current turn (press Ctrl-C again to force quit)');
    controller.abort();
  });

  try {
    const summary = await createApp({ config, logger }).run(controller.signal);
    printSummary(summary);
    return summary.endedBy === 'aborted' ? 130 : 0;
  } catch (error) {
    logger.error('Fatal error', { error: error instanceof Error ? error.message : String(error) });
    return 1;
  }
}

process.exitCode = await main();

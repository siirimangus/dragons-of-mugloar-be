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
    logger.warn('SIGINT received, finishing the current turn');
    controller.abort();
  });

  try {
    const summary = await createApp({ config, logger }).run(controller.signal);
    printSummary(summary);
    return 0;
  } catch (error) {
    logger.error('Run failed', { error: error instanceof Error ? error.message : String(error) });
    return 1;
  }
}

process.exitCode = await main();

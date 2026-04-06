/**
 * hephaestus - 24/7 Autonomous AI Developer Agent
 * Main entry point
 */

import { logger } from './logger.js';
import { HephaestusRuntime } from './runtime.js';

const runOnce = process.argv.includes('--once');
const preflightOnly = process.argv.includes('--preflight');
const runtime = new HephaestusRuntime();

async function main(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('hephaestus v1.0.0 - Starting up...');
  logger.info('='.repeat(50));

  await runtime.run({ runOnce, preflightOnly });
}

async function shutdown(signal: string): Promise<void> {
  try {
    await runtime.shutdown(signal);
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: String(error) });
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception', { error: String(error) });
  await shutdown('uncaughtException');
});
process.on('unhandledRejection', async (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
  await shutdown('unhandledRejection');
});

// Start the agent
main().catch(async (error) => {
  logger.error('Fatal error', { error: String(error) });
  await runtime.shutdown('fatal');
  process.exit(1);
});

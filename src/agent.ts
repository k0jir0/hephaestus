/**
 * Hephaestus - 24/7 Autonomous AI Developer Agent
 * Main entry point
 */

import fs from 'fs/promises';
import { config } from './config.js';
import { logger } from './logger.js';
import { TaskWatcher } from './watcher.js';
import { AgentMemory } from './memory.js';
import { SafetySystem } from './safety.js';
import { AIExecutor } from './executor.js';
import type { Task, AgentState } from './types.js';

// Graceful shutdown handling
let isShuttingDown = false;

async function main(): Promise<void> {
  logger.info('='.repeat(50));
  logger.info('Hephaestus v1.0.0 - Starting up...');
  logger.info('='.repeat(50));

  // Initialize components
  const memory = new AgentMemory();
  const safety = new SafetySystem(config.safety);
  const executor = new AIExecutor();
  const watcher = new TaskWatcher();

  // Initialize memory
  await memory.initialize();
  await memory.updateStatus('Starting');

  // Check AI backend health
  const health = await executor.checkHealth();
  if (!health.available) {
    logger.warn(`AI Backend warning: ${health.message}`);
    logger.warn('Agent will run in limited mode without AI execution');
  } else {
    logger.info(health.message);
  }

  // Log configuration
  logger.info(`AI Backend: ${config.aiBackend}`);
  logger.info(`Model: ${config.aiModel || 'default'}`);
  logger.info(`Target Project: ${config.targetProject}`);
  logger.info(`Daily Budget: $${config.safety.dailyTokenBudget}`);
  logger.info(`Max Iterations: ${config.safety.maxIterations}`);

  // Agent state
  const state: AgentState = {
    status: 'idle',
    iterationCount: 0,
    totalTasksCompleted: 0,
    consecutiveErrors: 0,
    lastActivity: new Date(),
    sessionStart: new Date(),
    tokenUsage: {
      promptTokens: 0,
      completionTokens: 0,
      totalCost: 0,
    },
  };

  // Process a single task
  async function processTask(task: Task): Promise<void> {
    if (isShuttingDown) return;

    logger.info(`Processing task: ${task.description}`);
    state.status = 'working';
    await memory.updateStatus('Working', task.description);
    await watcher.markTaskInProgress(task);

    try {
      // Check safety first
      const safetyCheck = await safety.shouldContinue();
      if (!safetyCheck.allowed) {
        logger.warn(`Safety check failed: ${safetyCheck.reason}`);
        await memory.recordBlocker(task.description, safetyCheck.reason);
        state.status = 'idle';
        await memory.updateStatus('Blocked');
        return;
      }

      // Execute the task using AI
      const context = await getProjectContext();
      const result = await executor.executeTask(task, context);

      if (result.success) {
        // Record success
        safety.recordSuccess();
        safety.recordTaskCompletion();
        state.totalTasksCompleted++;

        // Record in memory
        await memory.recordTaskCompletion(task, result.content);
        await memory.addToTaskHistory(task, 'Success');
        await memory.addSessionSummary(`Completed: ${task.description}`);

        // Mark task complete in TASKS.md
        await watcher.markTaskCompleted(task);

        logger.info(`Task completed successfully: ${task.description}`);
      } else {
        // Record error
        safety.recordError(result.content);
        await memory.recordBlocker(task.description, result.content);

        logger.error(`Task failed: ${task.description}`, { error: result.content });
      }

      // Record token usage if available
      if (result.cost !== undefined && result.tokens) {
        safety.recordTokenUsage(
          result.tokens.prompt,
          result.tokens.completion,
          result.cost
        );
      }

      // Check for auto-commit
      if (safety.shouldAutoCommit()) {
        await safety.performAutoCommit();
      }

      state.status = 'idle';
      await memory.updateStatus('Idle');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Task processing error', { error: errorMessage });
      safety.recordError(errorMessage);
      state.status = 'error';
      await memory.updateStatus('Error', task.description);
    }
  }

  // Get project context for AI
  async function getProjectContext(): Promise<string> {
    try {
      const contextParts: string[] = [];

      // Read package.json if exists
      try {
        const packageJson = await fs.readFile(
          `${config.targetProject}/package.json`,
          'utf-8'
        );
        const pkg = JSON.parse(packageJson);
        contextParts.push(`Project: ${pkg.name || 'unknown'}`);
        contextParts.push(`Scripts: ${Object.keys(pkg.scripts || {}).join(', ')}`);
      } catch {
        // Ignore if no package.json
      }

      // Read README if exists
      try {
        const readme = await fs.readFile(
          `${config.targetProject}/README.md`,
          'utf-8'
        );
        const lines = readme.split('\n').slice(0, 20);
        contextParts.push(`README (excerpt):\n${lines.join('\n')}`);
      } catch {
        // Ignore if no README
      }

      // Get git status
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const { stdout } = await execAsync('git status --short', {
          cwd: config.targetProject,
        });
        if (stdout.trim()) {
          contextParts.push(`Git status:\n${stdout}`);
        }
      } catch {
        // Ignore if not a git repo
      }

      return contextParts.join('\n\n');
    } catch (error) {
      logger.warn('Could not get project context', {
        error: String(error)
      });
      return '';
    }
  }

  // Main loop - start watching for tasks
  await watcher.start(async (task: Task) => {
    if (isShuttingDown) return;

    // Check safety before processing
    const safetyCheck = await safety.shouldContinue();
    if (!safetyCheck.allowed) {
      logger.warn(`Cannot process task - safety check failed: ${safetyCheck.reason}`);
      return;
    }

    await processTask(task);
  });

  // Periodic status check (every 5 minutes)
  setInterval(async () => {
    if (isShuttingDown) return;

    // Log status
    logger.info('Periodic status check');
    logger.info(safety.getStatusSummary());

    // Check if we should auto-commit
    if (safety.shouldAutoCommit()) {
      await safety.performAutoCommit();
    }

    // Check daily budget reset (new day)
    const now = new Date();
    const sessionDay = state.sessionStart.getDate();
    if (now.getDate() !== sessionDay) {
      logger.info('New day detected, resetting daily counters');
      safety.resetDailyCounters();
    }
  }, 5 * 60 * 1000); // 5 minutes

  logger.info('='.repeat(50));
  logger.info('Hephaestus is running and watching TASKS.md');
  logger.info('Add tasks to TASKS.md to start working');
  logger.info('Press Ctrl+C to stop');
  logger.info('='.repeat(50));

  await memory.addSessionSummary('Agent started successfully');

  // Keep the process running
  return new Promise(() => {
    // This promise never resolves - the agent runs forever
    // until shutdown
  });
}

// Handle shutdown signals
async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Log final status
    logger.info('Final status:');
    const safety = new SafetySystem(config.safety);
    logger.info(safety.getStatusSummary());

    // Save memory
    const memory = new AgentMemory();
    await memory.addSessionSummary(`Agent shutdown: ${signal}`);
    await memory.updateStatus('Shutdown');

    logger.info('Shutdown complete. Goodbye!');
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
  await shutdown('fatal');
});

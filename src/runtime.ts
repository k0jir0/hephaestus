import fs from 'fs/promises';
import { config } from './config.js';
import { AIExecutor } from './executor.js';
import { logger } from './logger.js';
import { AgentMemory } from './memory.js';
import { formatTaskPlanSummary } from './plan-contract.js';
import type { PreflightResult } from './preflight.js';
import { evaluateTaskAdmission, runStartupPreflight } from './preflight.js';
import type { MemoryRepository, TaskRepository } from './repositories.js';
import { SafetySystem } from './safety.js';
import { TaskWatcher } from './watcher.js';
import type { AIResponse, AgentState, Task } from './types.js';

export interface RuntimeOptions {
  runOnce?: boolean;
  preflightOnly?: boolean;
}

export interface RuntimeExecutorPort {
  executeTask(task: Task, context?: string): Promise<AIResponse>;
  checkHealth(): Promise<{ available: boolean; message: string }>;
}

export interface RuntimeSafetyPort {
  shouldContinue(): Promise<{ allowed: boolean; reason?: string }>;
  recordSuccess(): void;
  recordError(error: string): void;
  recordTaskCompletion(): void;
  recordTokenUsage(promptTokens: number, completionTokens: number, cost: number): void;
  shouldAutoCommit(): boolean;
  performAutoCommit(message?: string): Promise<boolean>;
  getStatusSummary(): string;
  resetDailyCounters(): void;
}

export interface RuntimeDependencies {
  memory?: MemoryRepository;
  watcher?: TaskRepository;
  executor?: RuntimeExecutorPort;
  safety?: RuntimeSafetyPort;
  preflightRunner?: (executor: RuntimeExecutorPort) => Promise<PreflightResult>;
  contextProvider?: () => Promise<string>;
}

function createInitialState(): AgentState {
  return {
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
}

export class HephaestusRuntime {
  private readonly memory: MemoryRepository;
  private readonly watcher: TaskRepository;
  private readonly executor: RuntimeExecutorPort;
  private readonly safety: RuntimeSafetyPort;
  private readonly preflightRunner: (executor: RuntimeExecutorPort) => Promise<PreflightResult>;
  private readonly contextProvider: () => Promise<string>;
  private readonly state: AgentState = createInitialState();
  private isShuttingDown = false;
  private statusInterval: NodeJS.Timeout | null = null;
  private watchModeResolver: (() => void) | null = null;
  private budgetWindowDay = new Date().toDateString();

  constructor(dependencies: RuntimeDependencies = {}) {
    this.memory = dependencies.memory ?? new AgentMemory(config.agentMemoryFile);
    this.watcher = dependencies.watcher ?? new TaskWatcher(config.tasksFile);
    this.executor = dependencies.executor ?? new AIExecutor();
    this.safety = dependencies.safety ?? new SafetySystem();
    this.preflightRunner =
      dependencies.preflightRunner ??
      (async (executor) => runStartupPreflight({ healthChecker: executor }));
    this.contextProvider = dependencies.contextProvider ?? (() => this.getProjectContext());
  }

  async run(options: RuntimeOptions = {}): Promise<void> {
    await this.memory.initialize();
    await this.memory.updateStatus('Starting');

    const preflight = await this.preflightRunner(this.executor);
    await this.handlePreflight(preflight);

    if (options.preflightOnly) {
      await this.memory.addSessionSummary('Startup preflight passed');
      await this.memory.updateStatus('Idle', 'None');
      logger.info('Preflight mode complete');
      return;
    }

    this.logConfiguration(options);

    if (options.runOnce) {
      await this.runSinglePass();
      return;
    }

    await this.watcher.start(async (task: Task) => {
      if (this.isShuttingDown) {
        return;
      }

      await this.processTask(task);
    });

    this.startStatusLoop();
    await this.memory.addSessionSummary('Agent started successfully');

    await new Promise<void>((resolve) => {
      this.watchModeResolver = resolve;
    });
  }

  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.state.status = 'shutdown';
    this.state.currentTask = undefined;
    this.state.lastActivity = new Date();
    logger.info(`Received ${signal}, shutting down gracefully...`);

    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    await this.watcher.stop();
    logger.info('Final status:');
    logger.info(this.safety.getStatusSummary());

    await this.memory.addSessionSummary(`Agent shutdown: ${signal}`);
    await this.memory.updateStatus('Shutdown');

    if (this.watchModeResolver) {
      const resolve = this.watchModeResolver;
      this.watchModeResolver = null;
      resolve();
    }

    logger.info('Shutdown complete. Goodbye!');
  }

  private async handlePreflight(preflight: PreflightResult): Promise<void> {
    for (const issue of preflight.issues) {
      if (issue.severity === 'error') {
        logger.error(`Preflight ${issue.code}: ${issue.message}`);
        continue;
      }

      logger.warn(`Preflight ${issue.code}: ${issue.message}`);
    }

    if (preflight.issues.some((issue) => issue.code === 'backend-unavailable')) {
      logger.warn('Agent will run in limited mode without AI execution');
    }

    if (!preflight.ok) {
      const reasons = preflight.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.message)
        .join('; ');

      this.state.status = 'blocked';
      this.state.lastActivity = new Date();
      await this.memory.recordBlocker('Startup preflight', reasons);
      await this.memory.addSessionSummary('Startup preflight failed');
      await this.memory.updateStatus('Blocked', 'Startup preflight');
      throw new Error('Startup preflight failed');
    }

    if (preflight.issues.length === 0) {
      logger.info('Startup preflight passed with no issues');
    } else {
      logger.info('Startup preflight passed with warnings');
    }
  }

  private logConfiguration(options: RuntimeOptions): void {
    logger.info(`AI Backend: ${config.aiBackend}`);
    logger.info(`Model: ${config.aiModel || 'default'}`);
    logger.info(`Target Project: ${config.targetProject}`);
    logger.info(`Daily Budget: $${config.safety.dailyTokenBudget}`);
    logger.info(`Max Iterations: ${config.safety.maxIterations}`);
    logger.info(`Check Interval: ${config.checkInterval / 1000}s`);
    logger.info(`Mode: ${options.runOnce ? 'single-pass' : 'watch'}`);
  }

  private async runSinglePass(): Promise<void> {
    const pendingTasks = await this.watcher.getPendingTasks();
    let endedBlocked = false;

    if (pendingTasks.length === 0) {
      logger.info('No pending tasks found. Exiting single-pass mode.');
      await this.memory.addSessionSummary('Single-pass run found no pending tasks');
      await this.memory.updateStatus('Idle', 'None');
      return;
    }

    for (const task of pendingTasks) {
      if (this.isShuttingDown) {
        break;
      }

      const outcome = await this.processTask(task);
      if (outcome === 'rejected') {
        endedBlocked = true;
        break;
      }
    }

    await this.memory.addSessionSummary('Single-pass run complete');

    if (!endedBlocked) {
      await this.memory.updateStatus('Idle', 'None');
    }

    logger.info('Single-pass mode complete');
  }

  private startStatusLoop(): void {
    this.statusInterval = setInterval(() => {
      void this.handlePeriodicStatus();
    }, config.checkInterval);

    logger.info('='.repeat(50));
    logger.info('hephaestus is running and watching TASKS.md');
    logger.info('Add tasks to TASKS.md to start working');
    logger.info('Press Ctrl+C to stop');
    logger.info('='.repeat(50));
  }

  private async handlePeriodicStatus(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    logger.info('Periodic status check');
    logger.info(this.safety.getStatusSummary());

    if (this.safety.shouldAutoCommit()) {
      await this.safety.performAutoCommit();
    }

    const currentDay = new Date().toDateString();
    if (currentDay !== this.budgetWindowDay) {
      logger.info('New day detected, resetting daily counters');
      this.safety.resetDailyCounters();
      this.budgetWindowDay = currentDay;
    }
  }

  private async processTask(task: Task): Promise<'completed' | 'failed' | 'rejected'> {
    if (this.isShuttingDown) {
      return 'rejected';
    }

    try {
      const admission = await evaluateTaskAdmission(task, this.safety);
      if (!admission.allowed) {
        logger.warn(`Admission check failed: ${admission.reason}`);
        this.state.status = 'blocked';
        this.state.currentTask = undefined;
        this.state.lastActivity = new Date();
        await this.memory.recordBlocker(task.description, admission.reason);
        await this.memory.updateStatus('Blocked', task.description);
        return 'rejected';
      }

      logger.info(`Processing task: ${task.description}`);
      this.state.status = 'working';
      this.state.currentTask = task;
      this.state.lastActivity = new Date();
      await this.memory.updateStatus('Working', task.description);
      await this.watcher.markTaskInProgress(task);

      const context = await this.contextProvider();
      const result = await this.executor.executeTask(task, context);

      if (result.success) {
        this.recordSuccessfulTask(task, result);

        await this.memory.recordTaskCompletion(task, formatTaskPlanSummary(result.plan ?? {
          summary: result.content,
          intendedFiles: [],
          commands: [],
          verification: ['Review model output manually.'],
          risks: [],
        }));
        await this.memory.addToTaskHistory(task, 'Plan ready');
        await this.memory.addSessionSummary(`Planned: ${task.description}`);
        await this.watcher.markTaskCompleted(task);

        logger.info(`Task planned successfully: ${task.description}`);
        logger.info(result.content, {
          plannedFiles: result.plan?.intendedFiles.length ?? 0,
          plannedCommands: result.plan?.commands.length ?? 0,
        });

        await this.markIdle();
        return 'completed';
      }

      this.safety.recordError(result.content);
      await this.memory.recordBlocker(task.description, result.content);
      logger.error(`Task failed: ${task.description}`, { error: result.content });
      await this.markIdle();
      return 'failed';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Task processing error', { error: errorMessage });
      this.safety.recordError(errorMessage);
      this.state.status = 'error';
      this.state.currentTask = task;
      this.state.lastActivity = new Date();
      await this.memory.updateStatus('Error', task.description);
      return 'failed';
    }
  }

  private recordSuccessfulTask(task: Task, result: AIResponse): void {
    this.safety.recordSuccess();
    this.safety.recordTaskCompletion();
    this.state.totalTasksCompleted++;

    if (result.cost !== undefined && result.tokens) {
      this.safety.recordTokenUsage(
        result.tokens.prompt,
        result.tokens.completion,
        result.cost
      );
    }

    if (this.safety.shouldAutoCommit()) {
      void this.safety.performAutoCommit();
    }

    this.state.currentTask = task;
    this.state.lastActivity = new Date();
  }

  private async markIdle(): Promise<void> {
    this.state.status = 'idle';
    this.state.currentTask = undefined;
    this.state.lastActivity = new Date();
    await this.memory.updateStatus('Idle', 'None');
  }

  private async getProjectContext(): Promise<string> {
    try {
      const contextParts: string[] = [];

      try {
        const packageJson = await fs.readFile(
          `${config.targetProject}/package.json`,
          'utf-8'
        );
        const pkg = JSON.parse(packageJson) as { name?: string; scripts?: Record<string, string> };
        contextParts.push(`Project: ${pkg.name || 'unknown'}`);
        contextParts.push(`Scripts: ${Object.keys(pkg.scripts || {}).join(', ')}`);
      } catch {
        // Ignore if no package.json
      }

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
        error: String(error),
      });
      return '';
    }
  }
}
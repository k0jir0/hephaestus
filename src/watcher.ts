/**
 * Hephaestus File Watcher
 * Monitors TASKS.md for new tasks
 */

import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { createComponentLogger } from './logger.js';
import type { Task } from './types.js';

const logger = createComponentLogger('Watcher');

export class TaskWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private lastModified: Date = new Date(0);
  private onNewTask: ((task: Task) => void) | null = null;

  constructor() {
    logger.info('TaskWatcher initialized');
  }

  /**
   * Start watching the TASKS.md file
   */
  async start(callback: (task: Task) => void): Promise<void> {
    this.onNewTask = callback;

    logger.info(`Starting watcher on ${config.tasksFile}`);

    // Check for existing pending tasks
    await this.checkForTasks();

    // Set up file watcher
    this.watcher = chokidar.watch(config.tasksFile, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100,
      },
    });

    this.watcher.on('change', async () => {
      logger.debug('TASKS.md modified, checking for new tasks');
      await this.checkForTasks();
    });

    this.watcher.on('error', (error) => {
      logger.error('Watcher error', { error: String(error) });
    });

    logger.info('Watcher started successfully');
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info('Watcher stopped');
    }
  }

  /**
   * Parse TASKS.md and extract pending tasks
   */
  private async checkForTasks(): Promise<void> {
    try {
      const content = await fs.readFile(config.tasksFile, 'utf-8');
      const tasks = this.parseTasks(content);

      // Find new pending tasks
      const pendingTasks = tasks.filter(
        (t) => t.status === 'pending' && new Date(t.createdAt) > this.lastModified
      );

      if (pendingTasks.length > 0 && this.onNewTask) {
        logger.info(`Found ${pendingTasks.length} new task(s)`);
        for (const task of pendingTasks) {
          this.onNewTask(task);
        }
      }

      this.lastModified = new Date();
    } catch (error) {
      logger.error('Error reading TASKS.md', { error: String(error) });
    }
  }

  /**
   * Parse markdown task list
   */
  private parseTasks(content: string): Task[] {
    const tasks: Task[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Match checkbox format: - [ ] or - [x]
      const match = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.+)$/);
      if (match) {
        const status = match[2].toLowerCase() === 'x' ? 'completed' : 'pending';
        const description = match[3].trim();

        // Skip example/comment tasks
        if (description.startsWith('Example:') || description === '(empty)') {
          continue;
        }

        tasks.push({
          id: this.generateTaskId(description),
          description,
          status,
          createdAt: new Date(), // Would need frontmatter for accurate dates
        });
      }
    }

    return tasks;
  }

  /**
   * Generate a simple hash-based task ID
   */
  private generateTaskId(description: string): string {
    const hash = description
      .split('')
      .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
    return `task_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
  }

  /**
   * Update TASKS.md to mark task as in progress
   */
  async markTaskInProgress(task: Task): Promise<void> {
    try {
      let content = await fs.readFile(config.tasksFile, 'utf-8');

      // Find and replace the task line
      const searchStr = `- [ ] ${task.description}`;
      const replaceStr = `- [ ] **IN PROGRESS**: ${task.description}`;

      if (content.includes(searchStr)) {
        content = content.replace(searchStr, replaceStr);
        await fs.writeFile(config.tasksFile, content, 'utf-8');
        logger.debug(`Marked task as in progress: ${task.description}`);
      }
    } catch (error) {
      logger.error('Error marking task in progress', { error: String(error) });
    }
  }

  /**
   * Update TASKS.md to mark task as completed
   */
  async markTaskCompleted(task: Task): Promise<void> {
    try {
      let content = await fs.readFile(config.tasksFile, 'utf-8');

      // Replace the task with a completed version
      const searchStr = `- [ ] **IN PROGRESS**: ${task.description}`;
      const replaceStr = `- [x] ${task.description}`;

      if (content.includes(searchStr)) {
        content = content.replace(searchStr, replaceStr);
        await fs.writeFile(config.tasksFile, content, 'utf-8');
        logger.debug(`Marked task as completed: ${task.description}`);
      }
    } catch (error) {
      logger.error('Error marking task completed', { error: String(error) });
    }
  }
}

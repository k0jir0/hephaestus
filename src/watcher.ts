/**
 * hephaestus File Watcher
 * Monitors TASKS.md for new tasks
 */

import chokidar from 'chokidar';
import fs from 'fs/promises';
import { config } from './config.js';
import { createComponentLogger } from './logger.js';
import type { Task } from './types.js';

const logger = createComponentLogger('Watcher');
const EMPTY_SECTION_ITEM = '- (empty)';

type TaskSection = 'Queue' | 'In Progress' | 'Completed' | 'Cancelled';

export class TaskWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private knownPendingTaskIds = new Set<string>();
  private onNewTask: ((task: Task) => Promise<void>) | null = null;

  constructor() {
    logger.info('TaskWatcher initialized');
  }

  /**
   * Start watching the TASKS.md file.
   */
  async start(callback: (task: Task) => Promise<void> | void): Promise<void> {
    this.onNewTask = async (task: Task) => {
      await callback(task);
    };

    logger.info(`Starting watcher on ${config.tasksFile}`);

    await this.checkForTasks();

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
   * Stop watching.
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info('Watcher stopped');
    }
  }

  /**
   * Read the queue and return pending tasks in order.
   */
  async getPendingTasks(): Promise<Task[]> {
    const content = await fs.readFile(config.tasksFile, 'utf-8');
    return this.parseTasks(content).filter((task) => task.status === 'pending');
  }

  /**
   * Parse TASKS.md and invoke the callback for newly discovered queue items.
   */
  private async checkForTasks(): Promise<void> {
    try {
      const tasks = await this.getPendingTasks();
      const pendingTaskIds = new Set(tasks.map((task) => task.id));
      const newTasks = tasks.filter((task) => !this.knownPendingTaskIds.has(task.id));

      this.knownPendingTaskIds = pendingTaskIds;

      if (newTasks.length > 0 && this.onNewTask) {
        logger.info(`Found ${newTasks.length} new task(s)`);
        for (const task of newTasks) {
          await this.onNewTask(task);
        }
      }
    } catch (error) {
      logger.error('Error reading TASKS.md', { error: String(error) });
    }
  }

  /**
   * Parse markdown task list.
   */
  private parseTasks(content: string): Task[] {
    const tasks: Task[] = [];
    const lines = content.split('\n');
    const queueRange = this.findSectionRange(lines, 'Queue');

    if (!queueRange) {
      return tasks;
    }

    for (let index = queueRange.start; index < queueRange.end; index++) {
      const line = lines[index];
      const match = line.match(/^(\s*)-\s*\[([ xX])\]\s*(.+)$/);
      if (!match) {
        continue;
      }

      const status = match[2].toLowerCase() === 'x' ? 'completed' : 'pending';
      const description = this.normalizeTaskDescription(match[3]);

      if (description.startsWith('Example:') || description === '(empty)') {
        continue;
      }

      if (!description) {
        continue;
      }

      tasks.push({
        id: this.generateTaskId(description, index),
        description,
        status,
        createdAt: new Date(),
      });
    }

    return tasks;
  }

  /**
   * Generate a stable task ID from content and line position.
   */
  private generateTaskId(description: string, lineNumber: number): string {
    const hash = description
      .split('')
      .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
    return `task_${Math.abs(hash).toString(36)}_${lineNumber}`;
  }

  /**
   * Move a queue item into the In Progress section.
   */
  async markTaskInProgress(task: Task): Promise<void> {
    try {
      const content = await fs.readFile(config.tasksFile, 'utf-8');
      const updatedContent = this.moveTaskBetweenSections(
        content,
        task.description,
        'Queue',
        'In Progress',
        '- [ ]'
      );

      if (updatedContent !== content) {
        await fs.writeFile(config.tasksFile, updatedContent, 'utf-8');
        logger.debug(`Marked task as in progress: ${task.description}`);
      }
    } catch (error) {
      logger.error('Error marking task in progress', { error: String(error) });
    }
  }

  /**
   * Move a task into the Completed section.
   */
  async markTaskCompleted(task: Task): Promise<void> {
    try {
      const content = await fs.readFile(config.tasksFile, 'utf-8');
      let updatedContent = this.moveTaskBetweenSections(
        content,
        task.description,
        'In Progress',
        'Completed',
        '- [x]'
      );

      if (updatedContent === content) {
        updatedContent = this.moveTaskBetweenSections(
          content,
          task.description,
          'Queue',
          'Completed',
          '- [x]'
        );
      }

      if (updatedContent !== content) {
        await fs.writeFile(config.tasksFile, updatedContent, 'utf-8');
        logger.debug(`Marked task as completed: ${task.description}`);
      }
    } catch (error) {
      logger.error('Error marking task completed', { error: String(error) });
    }
  }

  private normalizeTaskDescription(description: string): string {
    return description.replace(/^(?:\*\*IN PROGRESS\*\*:\s*)+/, '').trim();
  }

  private findSectionRange(
    lines: string[],
    section: TaskSection
  ): { start: number; end: number } | null {
    const header = `## ${section}`;
    const headerIndex = lines.findIndex((line) => line.trim() === header);
    if (headerIndex === -1) {
      return null;
    }

    let endIndex = lines.length;
    for (let index = headerIndex + 1; index < lines.length; index++) {
      if (/^## /.test(lines[index])) {
        endIndex = index;
        break;
      }
    }

    return {
      start: headerIndex + 1,
      end: endIndex,
    };
  }

  private moveTaskBetweenSections(
    content: string,
    description: string,
    fromSection: TaskSection,
    toSection: TaskSection,
    destinationPrefix: '- [ ]' | '- [x]'
  ): string {
    const lines = content.split('\n');
    const sourceRange = this.findSectionRange(lines, fromSection);

    if (!sourceRange) {
      return content;
    }

    const sourceTaskIndex = this.findTaskLineIndex(lines, sourceRange, description);
    if (sourceTaskIndex === -1) {
      return content;
    }

    lines.splice(sourceTaskIndex, 1);
    this.ensureSectionPlaceholder(lines, fromSection);

    this.removePlaceholderLine(lines, toSection);
    const insertAt = this.getSectionInsertIndex(lines, toSection);
    lines.splice(insertAt, 0, `${destinationPrefix} ${description}`);

    return lines.join('\n');
  }

  private findTaskLineIndex(
    lines: string[],
    range: { start: number; end: number },
    description: string
  ): number {
    for (let index = range.start; index < range.end; index++) {
      const match = lines[index].match(/^\s*-\s*\[(?: |x|X)\]\s*(.+)$/);
      if (!match) {
        continue;
      }

      if (this.normalizeTaskDescription(match[1]) === description) {
        return index;
      }
    }

    return -1;
  }

  private getSectionInsertIndex(lines: string[], section: TaskSection): number {
    const range = this.findSectionRange(lines, section);
    if (!range) {
      return lines.length;
    }

    let insertAt = range.end;
    for (let index = range.end - 1; index >= range.start; index--) {
      if (lines[index].trim() === '') {
        insertAt = index;
        continue;
      }

      insertAt = index + 1;
      break;
    }

    return insertAt;
  }

  private removePlaceholderLine(lines: string[], section: TaskSection): void {
    const range = this.findSectionRange(lines, section);
    if (!range) {
      return;
    }

    const placeholderIndex = lines.findIndex(
      (line, index) =>
        index >= range.start && index < range.end && line.trim() === EMPTY_SECTION_ITEM
    );

    if (placeholderIndex !== -1) {
      lines.splice(placeholderIndex, 1);
    }
  }

  private ensureSectionPlaceholder(lines: string[], section: TaskSection): void {
    const range = this.findSectionRange(lines, section);
    if (!range) {
      return;
    }

    const hasTask = lines.some((line, index) => {
      if (index < range.start || index >= range.end) {
        return false;
      }

      return /^\s*-\s*\[(?: |x|X)\]\s+/.test(line);
    });

    const hasPlaceholder = lines.some(
      (line, index) =>
        index >= range.start && index < range.end && line.trim() === EMPTY_SECTION_ITEM
    );

    if (!hasTask && !hasPlaceholder) {
      const insertAt = this.getSectionInsertIndex(lines, section);
      lines.splice(insertAt, 0, EMPTY_SECTION_ITEM);
    }
  }
}
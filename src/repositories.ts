import type { Task } from './types.js';

export interface TaskRepository {
  start(callback: (task: Task) => Promise<void> | void): Promise<void>;
  stop(): Promise<void>;
  getPendingTasks(): Promise<Task[]>;
  markTaskInProgress(task: Task): Promise<void>;
  markTaskCompleted(task: Task): Promise<void>;
}

export interface MemoryRepository {
  initialize(): Promise<void>;
  updateStatus(status: string, task?: string): Promise<void>;
  recordTaskCompletion(task: Task, result: string): Promise<void>;
  recordBlocker(blocker: string, resolution?: string): Promise<void>;
  addToTaskHistory(task: Task, result: string): Promise<void>;
  addSessionSummary(summary: string): Promise<void>;
}
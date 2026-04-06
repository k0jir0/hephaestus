import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HephaestusRuntime } from '../src/runtime.js';
import type { AIResponse, Task, TaskPlan } from '../src/types.js';

function makeTask(description: string): Task {
  return {
    id: 'task_demo',
    description,
    status: 'pending',
    createdAt: new Date(),
  };
}

function makePlan(summary: string): TaskPlan {
  return {
    summary,
    intendedFiles: [],
    commands: [],
    verification: ['Review the generated plan'],
    risks: [],
  };
}

describe('HephaestusRuntime', () => {
  it('keeps a task in queue when admission is rejected', async () => {
    const task = makeTask('Ship demo');
    const calls = {
      markTaskInProgress: 0,
      markTaskCompleted: 0,
      blockers: [] as string[],
    };

    const runtime = new HephaestusRuntime({
      memory: {
        async initialize() {},
        async updateStatus() {},
        async recordTaskCompletion() {},
        async recordBlocker(_blocker, resolution) {
          calls.blockers.push(resolution || '');
        },
        async addToTaskHistory() {},
        async addSessionSummary() {},
      },
      watcher: {
        async start() {},
        async stop() {},
        async getPendingTasks() {
          return [task];
        },
        async markTaskInProgress() {
          calls.markTaskInProgress++;
        },
        async markTaskCompleted() {
          calls.markTaskCompleted++;
        },
      },
      executor: {
        async executeTask(): Promise<AIResponse> {
          throw new Error('executeTask should not be called when admission is rejected');
        },
        async checkHealth() {
          return { available: true, message: 'ok' };
        },
      },
      safety: {
        async shouldContinue() {
          return { allowed: false, reason: 'Daily budget exceeded' };
        },
        recordSuccess() {},
        recordError() {},
        recordTaskCompletion() {},
        recordTokenUsage() {},
        shouldAutoCommit() {
          return false;
        },
        async performAutoCommit() {
          return false;
        },
        getStatusSummary() {
          return 'ok';
        },
        resetDailyCounters() {},
      },
      preflightRunner: async () => ({ ok: true, issues: [] }),
      contextProvider: async () => 'README excerpt',
    });

    await runtime.run({ runOnce: true });

    assert.equal(calls.markTaskInProgress, 0);
    assert.equal(calls.markTaskCompleted, 0);
    assert.deepEqual(calls.blockers, ['Daily budget exceeded']);
  });

  it('records a successful structured plan during single-pass mode', async () => {
    const task = makeTask('Plan the runtime');
    const calls = {
      markTaskInProgress: 0,
      markTaskCompleted: 0,
      completions: [] as string[],
      history: [] as string[],
      summaries: [] as string[],
    };

    const runtime = new HephaestusRuntime({
      memory: {
        async initialize() {},
        async updateStatus() {},
        async recordTaskCompletion(_task, result) {
          calls.completions.push(result);
        },
        async recordBlocker() {},
        async addToTaskHistory(_task, result) {
          calls.history.push(result);
        },
        async addSessionSummary(summary) {
          calls.summaries.push(summary);
        },
      },
      watcher: {
        async start() {},
        async stop() {},
        async getPendingTasks() {
          return [task];
        },
        async markTaskInProgress() {
          calls.markTaskInProgress++;
        },
        async markTaskCompleted() {
          calls.markTaskCompleted++;
        },
      },
      executor: {
        async executeTask() {
          return {
            success: true,
            content: 'Plan the runtime service.',
            rawContent: '{"summary":"Plan the runtime service."}',
            plan: makePlan('Plan the runtime service.'),
          } satisfies AIResponse;
        },
        async checkHealth() {
          return { available: true, message: 'ok' };
        },
      },
      safety: {
        async shouldContinue() {
          return { allowed: true };
        },
        recordSuccess() {},
        recordError() {},
        recordTaskCompletion() {},
        recordTokenUsage() {},
        shouldAutoCommit() {
          return false;
        },
        async performAutoCommit() {
          return false;
        },
        getStatusSummary() {
          return 'ok';
        },
        resetDailyCounters() {},
      },
      preflightRunner: async () => ({ ok: true, issues: [] }),
      contextProvider: async () => 'README excerpt',
    });

    await runtime.run({ runOnce: true });

    assert.equal(calls.markTaskInProgress, 1);
    assert.equal(calls.markTaskCompleted, 1);
    assert.equal(calls.history[0], 'Plan ready');
    assert.match(calls.completions[0] || '', /Planned files: 0/);
    assert.ok(calls.summaries.includes('Planned: Plan the runtime'));
  });
});
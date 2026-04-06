import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, it } from 'node:test';
import type { Config } from '../src/config.js';
import { evaluateTaskAdmission, runStartupPreflight } from '../src/preflight.js';

const tempDirs: string[] = [];

async function createTempProject(tasksContent: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hephaestus-preflight-'));
  tempDirs.push(tempDir);

  await fs.writeFile(path.join(tempDir, 'TASKS.md'), tasksContent, 'utf-8');
  await fs.writeFile(path.join(tempDir, 'README.md'), '# Demo\n', 'utf-8');

  return tempDir;
}

function makeConfig(baseDir: string): Config {
  return {
    aiBackend: 'ollama',
    aiModel: 'llama3',
    safety: {
      dailyTokenBudget: 10,
      maxIterations: 50,
      errorThreshold: 5,
      autoCommitInterval: 30,
    },
    targetProject: baseDir,
    checkInterval: 60_000,
    baseDir,
    tasksFile: path.join(baseDir, 'TASKS.md'),
    agentMemoryFile: path.join(baseDir, 'AGENT.md'),
    progressLog: path.join(baseDir, 'PROGRESS.log'),
    ollamaBaseUrl: 'http://localhost:11434',
  };
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

describe('runStartupPreflight', () => {
  it('fails when TASKS.md is missing required sections', async () => {
    const baseDir = await createTempProject(`# hephaestus Task Queue

## Queue

- [ ] Ship demo
`);

    const result = await runStartupPreflight({
      config: makeConfig(baseDir),
    });

    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.severity === 'error' &&
          issue.message.includes('## In Progress')
      )
    );
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.severity === 'error' &&
          issue.message.includes('## Completed')
      )
    );
  });

  it('allows warnings for unavailable backends without failing startup', async () => {
    const baseDir = await createTempProject(`# hephaestus Task Queue

## Queue

- (empty)

## In Progress

- (empty)

## Completed

- (empty)
`);

    const result = await runStartupPreflight({
      config: makeConfig(baseDir),
      healthChecker: {
        async checkHealth() {
          return {
            available: false,
            message: 'Ollama is not running',
          };
        },
      },
    });

    assert.equal(result.ok, true);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.severity === 'warning' && issue.code === 'backend-unavailable'
      )
    );
  });
});

describe('evaluateTaskAdmission', () => {
  it('rejects the task before execution when safety denies admission', async () => {
    const result = await evaluateTaskAdmission(
      {
        id: 'task_demo',
        description: 'Ship demo',
        status: 'pending',
        createdAt: new Date(),
      },
      {
        async shouldContinue() {
          return {
            allowed: false,
            reason: 'Daily budget exceeded',
          };
        },
      }
    );

    assert.deepEqual(result, {
      allowed: false,
      reason: 'Daily budget exceeded',
    });
  });
});
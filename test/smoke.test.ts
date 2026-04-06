import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, it } from 'node:test';
import type { Config } from '../src/config.js';
import { AgentMemory } from '../src/memory.js';
import { runStartupPreflight } from '../src/preflight.js';
import { HephaestusRuntime } from '../src/runtime.js';
import type { AIResponse, TaskPlan } from '../src/types.js';
import { TaskWatcher } from '../src/watcher.js';

const tempDirs: string[] = [];

async function createFixtureRepo(): Promise<{ rootDir: string; tasksFile: string; memoryFile: string }> {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hephaestus-smoke-'));
  tempDirs.push(rootDir);

  const tasksFile = path.join(rootDir, 'TASKS.md');
  const memoryFile = path.join(rootDir, 'AGENT.md');

  await fs.writeFile(
    tasksFile,
    `# hephaestus Task Queue

## Queue

- [ ] Build a runtime smoke plan

## In Progress

- (empty)

## Completed

- (empty)

## Cancelled

- (empty)
`,
    'utf-8'
  );

  await fs.writeFile(
    path.join(rootDir, 'README.md'),
    '# Fixture Repo\n\nThis is a runtime smoke fixture.\n',
    'utf-8'
  );

  await fs.writeFile(
    path.join(rootDir, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture-repo',
        version: '1.0.0',
        scripts: {
          test: 'echo ok',
        },
      },
      null,
      2
    ),
    'utf-8'
  );

  return { rootDir, tasksFile, memoryFile };
}

function makeFixtureConfig(rootDir: string, tasksFile: string, memoryFile: string): Config {
  return {
    aiBackend: 'ollama',
    aiModel: 'llama3',
    safety: {
      dailyTokenBudget: 10,
      maxIterations: 50,
      errorThreshold: 5,
      autoCommitInterval: 0,
    },
    targetProject: rootDir,
    checkInterval: 60_000,
    baseDir: rootDir,
    tasksFile,
    agentMemoryFile: memoryFile,
    progressLog: path.join(rootDir, 'PROGRESS.log'),
    ollamaBaseUrl: 'http://localhost:11434',
  };
}

function makePlan(summary: string): TaskPlan {
  return {
    summary,
    intendedFiles: [
      {
        path: 'src/runtime.ts',
        changeType: 'inspect',
        purpose: 'Check the runtime flow before applying changes.',
      },
    ],
    commands: [
      {
        command: 'npm test',
        purpose: 'Validate smoke flow assumptions.',
        expectedOutcome: 'Tests pass.',
      },
    ],
    verification: ['Confirm the queue moved the task into Completed.'],
    risks: ['Requires the repository files to remain well-formed markdown.'],
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

describe('HephaestusRuntime smoke flow', () => {
  it('runs a bounded single-pass plan against real markdown repositories', async () => {
    const fixture = await createFixtureRepo();
    const fixtureConfig = makeFixtureConfig(fixture.rootDir, fixture.tasksFile, fixture.memoryFile);

    const runtime = new HephaestusRuntime({
      memory: new AgentMemory(fixture.memoryFile),
      watcher: new TaskWatcher(fixture.tasksFile),
      executor: {
        async executeTask(): Promise<AIResponse> {
          const plan = makePlan('Build a runtime smoke plan.');
          return {
            success: true,
            content: plan.summary,
            rawContent: JSON.stringify(plan),
            plan,
          };
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
      preflightRunner: (executor) =>
        runStartupPreflight({
          config: fixtureConfig,
          healthChecker: executor,
        }),
      contextProvider: async () => 'Fixture repo context',
    });

    await runtime.run({ runOnce: true });

    const tasksContent = await fs.readFile(fixture.tasksFile, 'utf-8');
    const memoryContent = await fs.readFile(fixture.memoryFile, 'utf-8');

    assert.match(tasksContent, /## Queue[\s\S]*- \(empty\)/);
    assert.match(tasksContent, /## Completed[\s\S]*- \[x\] Build a runtime smoke plan/);
    assert.match(memoryContent, /\| 20\d{2}-\d{2}-\d{2} \| Build a runtime smoke plan \| Plan ready \|/);
    assert.match(memoryContent, /Plan ready/);
    assert.match(memoryContent, /Planned: Build a runtime smoke plan/);
  });
});
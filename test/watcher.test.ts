import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, it } from 'node:test';
import { config } from '../src/config.js';
import type { Task } from '../src/types.js';
import { TaskWatcher } from '../src/watcher.js';

const originalTasksFile = config.tasksFile;
const tempDirs: string[] = [];

async function createTempTasksFile(content: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'Hephaestus-watcher-'));
  tempDirs.push(tempDir);

  const tasksFile = path.join(tempDir, 'TASKS.md');
  await fs.writeFile(tasksFile, content, 'utf-8');
  return tasksFile;
}

function makeTask(description: string): Task {
  return {
    id: 'task_demo',
    description,
    status: 'pending',
    createdAt: new Date(),
  };
}

afterEach(async () => {
  config.tasksFile = originalTasksFile;

  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

describe('TaskWatcher', () => {
  it('parses only queue tasks and strips legacy in-progress markers', () => {
    const watcher = new TaskWatcher();
    const content = `# Hephaestus Task Queue

## Queue

- [ ] **IN PROGRESS**: **IN PROGRESS**: Ship demo
- [ ] Add CI

## In Progress

- [ ] Already running

## Completed

- [x] Done
`;

    const tasks = (watcher as any).parseTasks(content) as Task[];

    assert.deepEqual(
      tasks.map((task) => task.description),
      ['Ship demo', 'Add CI']
    );
  });

  it('moves queue tasks into the in-progress section', async () => {
    config.tasksFile = await createTempTasksFile(`# Hephaestus Task Queue

## Queue

- [ ] Ship demo

## In Progress

- (empty)

## Completed

- (empty)

## Cancelled

- (empty)
`);

    const watcher = new TaskWatcher();
    await watcher.markTaskInProgress(makeTask('Ship demo'));

    const updated = await fs.readFile(config.tasksFile, 'utf-8');
    assert.match(updated, /## Queue[\s\S]*- \(empty\)/);
    assert.match(updated, /## In Progress[\s\S]*- \[ \] Ship demo/);
  });

  it('moves in-progress tasks into completed', async () => {
    config.tasksFile = await createTempTasksFile(`# Hephaestus Task Queue

## Queue

- (empty)

## In Progress

- [ ] Ship demo

## Completed

- (empty)

## Cancelled

- (empty)
`);

    const watcher = new TaskWatcher();
    await watcher.markTaskCompleted(makeTask('Ship demo'));

    const updated = await fs.readFile(config.tasksFile, 'utf-8');
    assert.match(updated, /## In Progress[\s\S]*- \(empty\)/);
    assert.match(updated, /## Completed[\s\S]*- \[x\] Ship demo/);
  });
});
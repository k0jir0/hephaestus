import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, it } from 'node:test';
import { config } from '../src/config.js';
import { AgentMemory } from '../src/memory.js';
import type { Task } from '../src/types.js';

const originalMemoryFile = config.agentMemoryFile;
const tempDirs: string[] = [];

async function createTempMemoryFile(initialContent: string): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'Hephaestus-memory-'));
  tempDirs.push(tempDir);

  const memoryFile = path.join(tempDir, 'AGENT.md');
  await fs.writeFile(memoryFile, initialContent, 'utf-8');
  return memoryFile;
}

function makeTask(description: string): Task {
  return {
    id: 'task_demo',
    description,
    status: 'completed',
    createdAt: new Date(),
  };
}

afterEach(async () => {
  config.agentMemoryFile = originalMemoryFile;

  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
});

describe('AgentMemory', () => {
  it('bootstraps an empty memory file', async () => {
    config.agentMemoryFile = await createTempMemoryFile('');

    const memory = new AgentMemory();
    await memory.initialize();

    const content = await fs.readFile(config.agentMemoryFile, 'utf-8');
    assert.match(content, /## Current State/);
    assert.match(content, /### Session Summaries/);
  });

  it('updates status and session summaries', async () => {
    config.agentMemoryFile = await createTempMemoryFile('');

    const memory = new AgentMemory();
    await memory.initialize();
    await memory.updateStatus('Working', 'Ship demo');
    await memory.addSessionSummary('Ran a single-pass demo');

    const content = await fs.readFile(config.agentMemoryFile, 'utf-8');
    assert.match(content, /- \*\*Status\*\*: Working/);
    assert.match(content, /- \*\*Current Task\*\*: Ship demo/);
    assert.match(content, /Ran a single-pass demo/);
  });

  it('writes task history and blocker rows', async () => {
    config.agentMemoryFile = await createTempMemoryFile('');

    const memory = new AgentMemory();
    await memory.initialize();
    await memory.addToTaskHistory(makeTask('Ship demo'), 'Success');
    await memory.recordBlocker('Missing backend auth', 'Configure API credentials');

    const content = await fs.readFile(config.agentMemoryFile, 'utf-8');
    assert.match(content, /Ship demo/);
    assert.match(content, /Missing backend auth/);
    assert.match(content, /Configure API credentials/);
  });
});
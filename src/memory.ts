/**
 * Hephaestus Memory System
 * Manages long-term memory via AGENT.md
 */

import fs from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { createComponentLogger } from './logger.js';
import type { MemoryEntry, Task } from './types.js';

const logger = createComponentLogger('Memory');

export class AgentMemory {
  private memoryFile: string;
  private entries: MemoryEntry[] = [];

  constructor() {
    this.memoryFile = config.agentMemoryFile;
    logger.info('AgentMemory initialized');
  }

  /**
   * Initialize memory file if it doesn't exist
   */
  async initialize(): Promise<void> {
    try {
      await fs.access(this.memoryFile);
      await this.load();
    } catch {
      // File doesn't exist, create with default content
      await this.createDefaultMemory();
    }
  }

  /**
   * Load memory from file
   */
  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.memoryFile, 'utf-8');
      logger.debug('Memory loaded successfully');
    } catch (error) {
      logger.error('Error loading memory', { error: String(error) });
    }
  }

  /**
   * Create default memory file
   */
  private async createDefaultMemory(): Promise<void> {
    const defaultContent = `# Hephaestus Agent Memory

This file stores the agent's long-term context and memory.

## Identity

- **Name**: Hephaestus
- **Role**: Autonomous AI Developer Agent
- **Started**: ${new Date().toISOString()}
- **Version**: 1.0.0

## Current State

- **Status**: Idle
- **Current Task**: None
- **Last Activity**: ${new Date().toISOString()}

## Working Context

### Known Patterns
- (Agent populates this with learned patterns)

### Project Conventions
- (Agent updates this based on project structure)

## Task History

### Recent Completed Tasks
| Date | Task | Result |
|------|------|--------|
| (empty) | | |

### Blockers Encountered
| Date | Blocker | Resolution |
|------|---------|------------|
| (empty) | | |

## Preferences

### Coding Style
- (Agent learns and records user preferences)

### Testing Preferences
- (Agent records testing approach preferences)

## Notes

### Session Summaries
- (Brief summaries of work sessions)

---

*This file is auto-updated by Hephaestus. Manual edits are preserved.*
`;

    await fs.writeFile(this.memoryFile, defaultContent, 'utf-8');
    logger.info('Created default memory file');
  }

  /**
   * Record a completed task
   */
  async recordTaskCompletion(task: Task, result: string): Promise<void> {
    const entry: MemoryEntry = {
      timestamp: new Date(),
      type: 'task',
      content: `Completed: ${task.description} - Result: ${result}`,
      source: 'agent',
    };
    this.entries.push(entry);

    await this.updateMemoryFile();
    logger.info(`Recorded task completion: ${task.description}`);
  }

  /**
   * Record a blocker
   */
  async recordBlocker(blocker: string, resolution?: string): Promise<void> {
    const entry: MemoryEntry = {
      timestamp: new Date(),
      type: 'note',
      content: `Blocker: ${blocker}${resolution ? ` - Resolution: ${resolution}` : ''}`,
      source: 'agent',
    };
    this.entries.push(entry);

    await this.updateMemoryFile();
    logger.info(`Recorded blocker: ${blocker}`);
  }

  /**
   * Record a learned pattern
   */
  async recordPattern(pattern: string): Promise<void> {
    const entry: MemoryEntry = {
      timestamp: new Date(),
      type: 'pattern',
      content: pattern,
      source: 'agent',
    };
    this.entries.push(entry);

    await this.updateMemoryFile();
    logger.debug(`Recorded pattern: ${pattern}`);
  }

  /**
   * Record a user preference
   */
  async recordPreference(preference: string): Promise<void> {
    const entry: MemoryEntry = {
      timestamp: new Date(),
      type: 'preference',
      content: preference,
      source: 'user',
    };
    this.entries.push(entry);

    await this.updateMemoryFile();
    logger.debug(`Recorded preference: ${preference}`);
  }

  /**
   * Update agent status in memory
   */
  async updateStatus(status: string, task?: string): Promise<void> {
    try {
      let content = await fs.readFile(this.memoryFile, 'utf-8');

      // Update status
      content = content.replace(
        /- \*\*Status\*\*:.*/,
        `- **Status**: ${status}`
      );

      // Update current task if provided
      if (task !== undefined) {
        content = content.replace(
          /- \*\*Current Task\*\*:.*/,
          `- **Current Task**: ${task || 'None'}`
        );
      }

      // Update last activity
      content = content.replace(
        /- \*\*Last Activity\*\*:.*/,
        `- **Last Activity**: ${new Date().toISOString()}`
      );

      await fs.writeFile(this.memoryFile, content, 'utf-8');
    } catch (error) {
      logger.error('Error updating status in memory', { error: String(error) });
    }
  }

  /**
   * Add to task history table
   */
  async addToTaskHistory(task: Task, result: string): Promise<void> {
    try {
      let content = await fs.readFile(this.memoryFile, 'utf-8');

      const date = new Date().toISOString().split('T')[0];
      const newRow = `| ${date} | ${task.description.substring(0, 50)}... | ${result} |`;

      // Find the table and add the row (after the header row)
      const tableMatch = content.match(/(### Recent Completed Tasks\n\| Date \| Task \| Result \|\n\|------|------|--------|\n)(.*?)(\n\n)/s);
      if (tableMatch) {
        const tableBody = tableMatch[2];
        const updatedBody = tableBody.replace('| (empty) | | |', newRow);
        content = content.replace(tableMatch[0], `${tableMatch[1]}${updatedBody}\n`);
      }

      await fs.writeFile(this.memoryFile, content, 'utf-8');
    } catch (error) {
      logger.error('Error adding to task history', { error: String(error) });
    }
  }

  /**
   * Add a session summary
   */
  async addSessionSummary(summary: string): Promise<void> {
    try {
      let content = await fs.readFile(this.memoryFile, 'utf-8');

      const timestamp = new Date().toISOString();
      const newEntry = `\n- [${timestamp}] ${summary}`;

      // Find the Session Summaries section and add entry
      const sectionMatch = content.match(/(### Session Summaries\n)(.*?)(\n---\*)/s);
      if (sectionMatch) {
        const sectionContent = sectionMatch[2];
        const updatedSection = sectionContent + newEntry;
        content = content.replace(sectionMatch[0], `${sectionMatch[1]}${updatedSection}${sectionMatch[3]}`);
      }

      await fs.writeFile(this.memoryFile, content, 'utf-8');
    } catch (error) {
      logger.error('Error adding session summary', { error: String(error) });
    }
  }

  /**
   * Update the memory file with current entries
   */
  private async updateMemoryFile(): Promise<void> {
    // This is called after adding entries to rebuild/compact memory if needed
    // For now, we append to specific sections in place
  }

  /**
   * Get all memory entries
   */
  getEntries(): MemoryEntry[] {
    return [...this.entries];
  }

  /**
   * Get recent entries
   */
  getRecentEntries(count: number = 10): MemoryEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Clear old entries (memory compaction)
   */
  async compact(): Promise<void> {
    const MAX_ENTRIES = 100;
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
      logger.info('Memory compacted');
    }
  }
}

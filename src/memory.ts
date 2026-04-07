/**
 * Hephaestus Memory System
 * Manages long-term memory via AGENT.md
 */

import fs from 'fs/promises';
import { config } from './config.js';
import { createComponentLogger } from './logger.js';
import type { MemoryRepository } from './repositories.js';
import type { MemoryEntry, Task } from './types.js';

const logger = createComponentLogger('Memory');

export class AgentMemory implements MemoryRepository {
  private memoryFile: string;
  private entries: MemoryEntry[] = [];

  constructor(memoryFile: string = config.agentMemoryFile) {
    this.memoryFile = memoryFile;
    logger.info('AgentMemory initialized');
  }

  /**
   * Initialize memory file if it doesn't exist.
   */
  async initialize(): Promise<void> {
    try {
      const content = await fs.readFile(this.memoryFile, 'utf-8');
      if (this.needsScaffold(content)) {
        await this.createDefaultMemory();
        return;
      }

      await this.load();
    } catch {
      await this.createDefaultMemory();
    }
  }

  /**
   * Load memory from file.
   */
  async load(): Promise<void> {
    try {
      await this.readMemoryFile();
      logger.debug('Memory loaded successfully');
    } catch (error) {
      logger.error('Error loading memory', { error: String(error) });
    }
  }

  /**
   * Create default memory file.
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
   * Record a completed task.
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
   * Record a blocker.
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
   * Record a learned pattern.
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
   * Record a user preference.
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
   * Update agent status in memory.
   */
  async updateStatus(status: string, task?: string): Promise<void> {
    try {
      await this.writeMemoryFile((content) => {
        let updated = content.replace(
          /- \*\*Status\*\*:.*/,
          `- **Status**: ${status}`
        );

        if (task !== undefined) {
          updated = updated.replace(
            /- \*\*Current Task\*\*:.*/,
            `- **Current Task**: ${task || 'None'}`
          );
        }

        return updated.replace(
          /- \*\*Last Activity\*\*:.*/,
          `- **Last Activity**: ${new Date().toISOString()}`
        );
      });
    } catch (error) {
      logger.error('Error updating status in memory', { error: String(error) });
    }
  }

  /**
   * Add to task history table.
   */
  async addToTaskHistory(task: Task, result: string): Promise<void> {
    try {
      const date = new Date().toISOString().split('T')[0];
      const shortDescription =
        task.description.length > 50
          ? `${task.description.slice(0, 47)}...`
          : task.description;
      const newRow = `| ${date} | ${shortDescription} | ${result} |`;

      await this.writeMemoryFile((content) =>
        this.updateTableSection(
          content,
          '### Recent Completed Tasks',
          '| (empty) | | |',
          newRow
        )
      );
    } catch (error) {
      logger.error('Error adding to task history', { error: String(error) });
    }
  }

  /**
   * Add a session summary.
   */
  async addSessionSummary(summary: string): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const newEntry = `- [${timestamp}] ${summary}`;

      await this.writeMemoryFile((content) =>
        this.appendLineToSection(
          content,
          '### Session Summaries',
          newEntry,
          '- (Brief summaries of work sessions)'
        )
      );
    } catch (error) {
      logger.error('Error adding session summary', { error: String(error) });
    }
  }

  /**
   * Update the memory file with current entries.
   */
  private async updateMemoryFile(): Promise<void> {
    const latestEntry = this.entries.at(-1);
    if (!latestEntry) {
      return;
    }

    try {
      if (latestEntry.type === 'pattern') {
        await this.writeMemoryFile((content) =>
          this.appendLineToSection(
            content,
            '### Known Patterns',
            `- ${latestEntry.content}`,
            '- (Agent populates this with learned patterns)'
          )
        );
        return;
      }

      if (latestEntry.type === 'preference') {
        await this.writeMemoryFile((content) =>
          this.appendLineToSection(
            content,
            '### Coding Style',
            `- ${latestEntry.content}`,
            '- (Agent learns and records user preferences)'
          )
        );
        return;
      }

      if (latestEntry.type === 'note' && latestEntry.content.startsWith('Blocker: ')) {
        const blockerContent = latestEntry.content.slice('Blocker: '.length);
        const [blocker, resolution = 'Unresolved'] = blockerContent.split(' - Resolution: ');
        const date = latestEntry.timestamp.toISOString().split('T')[0];
        const newRow = `| ${date} | ${blocker} | ${resolution} |`;

        await this.writeMemoryFile((content) =>
          this.updateTableSection(
            content,
            '### Blockers Encountered',
            '| (empty) | | |',
            newRow
          )
        );
      }
    } catch (error) {
      logger.error('Error updating memory file', { error: String(error) });
    }
  }

  /**
   * Get all memory entries.
   */
  getEntries(): MemoryEntry[] {
    return [...this.entries];
  }

  /**
   * Get recent entries.
   */
  getRecentEntries(count: number = 10): MemoryEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * Clear old entries (memory compaction).
   */
  async compact(): Promise<void> {
    const MAX_ENTRIES = 100;
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
      logger.info('Memory compacted');
    }
  }

  private needsScaffold(content: string): boolean {
    return (
      content.trim().length === 0 ||
      !content.includes('## Current State') ||
      !content.includes('### Session Summaries')
    );
  }

  private async readMemoryFile(): Promise<string> {
    const content = await fs.readFile(this.memoryFile, 'utf-8');
    if (!this.needsScaffold(content)) {
      return content;
    }

    await this.createDefaultMemory();
    return fs.readFile(this.memoryFile, 'utf-8');
  }

  private async writeMemoryFile(
    transform: (content: string) => string
  ): Promise<void> {
    const content = await this.readMemoryFile();
    const updated = transform(content);
    await fs.writeFile(this.memoryFile, updated, 'utf-8');
  }

  private appendLineToSection(
    content: string,
    sectionHeader: string,
    lineToAdd: string,
    placeholderLine?: string
  ): string {
    return this.updateSection(content, sectionHeader, (sectionLines) => {
      const linesWithoutPlaceholder = placeholderLine
        ? sectionLines.filter((line) => line.trim() !== placeholderLine)
        : [...sectionLines];

      if (linesWithoutPlaceholder.some((line) => line.trim() === lineToAdd)) {
        return this.ensureTrailingBlankLine(linesWithoutPlaceholder);
      }

      const trimmed = this.trimTrailingBlankLines(linesWithoutPlaceholder);
      return this.ensureTrailingBlankLine([...trimmed, lineToAdd]);
    });
  }

  private updateTableSection(
    content: string,
    sectionHeader: string,
    emptyRow: string,
    newRow: string
  ): string {
    return this.updateSection(content, sectionHeader, (sectionLines) => {
      const lines = [...sectionLines];
      const emptyRowIndex = lines.findIndex((line) => line.trim() === emptyRow);
      if (emptyRowIndex !== -1) {
        lines[emptyRowIndex] = newRow;
        return this.ensureTrailingBlankLine(lines);
      }

      const insertAt = this.trimTrailingBlankLines(lines).length;
      lines.splice(insertAt, 0, newRow);
      return this.ensureTrailingBlankLine(lines);
    });
  }

  private updateSection(
    content: string,
    sectionHeader: string,
    update: (sectionLines: string[]) => string[]
  ): string {
    const lines = content.split('\n');
    const startIndex = lines.findIndex((line) => line.trim() === sectionHeader);
    if (startIndex === -1) {
      return content;
    }

    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index++) {
      if (/^(## |### |---)/.test(lines[index])) {
        endIndex = index;
        break;
      }
    }

    const updatedSectionLines = update(lines.slice(startIndex + 1, endIndex));
    return [
      ...lines.slice(0, startIndex + 1),
      ...updatedSectionLines,
      ...lines.slice(endIndex),
    ].join('\n');
  }

  private trimTrailingBlankLines(lines: string[]): string[] {
    const trimmed = [...lines];
    while (trimmed.length > 0 && trimmed[trimmed.length - 1].trim() === '') {
      trimmed.pop();
    }
    return trimmed;
  }

  private ensureTrailingBlankLine(lines: string[]): string[] {
    const trimmed = this.trimTrailingBlankLines(lines);
    return [...trimmed, ''];
  }
}

export type MarkdownMemoryRepository = AgentMemory;
import type {
  PlannedCommand,
  PlannedFileChange,
  PlannedFileChangeType,
  Task,
  TaskPlan,
} from './types.js';

const changeTypes: PlannedFileChangeType[] = ['create', 'update', 'delete', 'inspect'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Field "${field}" must be a non-empty string.`);
  }

  return value.trim();
}

function requireStringArray(value: unknown, field: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Field "${field}" must be an array of strings.`);
  }

  const items = value.map((item, index) => requireString(item, `${field}[${index}]`));
  if (!allowEmpty && items.length === 0) {
    throw new Error(`Field "${field}" must contain at least one item.`);
  }

  return items;
}

function parsePlannedFileChange(value: unknown, index: number): PlannedFileChange {
  if (!isRecord(value)) {
    throw new Error(`intendedFiles[${index}] must be an object.`);
  }

  const changeType = requireString(value.changeType, `intendedFiles[${index}].changeType`);
  if (!changeTypes.includes(changeType as PlannedFileChangeType)) {
    throw new Error(
      `intendedFiles[${index}].changeType must be one of: ${changeTypes.join(', ')}`
    );
  }

  return {
    path: requireString(value.path, `intendedFiles[${index}].path`),
    changeType: changeType as PlannedFileChangeType,
    purpose: requireString(value.purpose, `intendedFiles[${index}].purpose`),
  };
}

function parsePlannedCommand(value: unknown, index: number): PlannedCommand {
  if (!isRecord(value)) {
    throw new Error(`commands[${index}] must be an object.`);
  }

  const expectedOutcome = value.expectedOutcome;
  return {
    command: requireString(value.command, `commands[${index}].command`),
    purpose: requireString(value.purpose, `commands[${index}].purpose`),
    expectedOutcome:
      expectedOutcome === undefined
        ? undefined
        : requireString(expectedOutcome, `commands[${index}].expectedOutcome`),
  };
}

function extractJsonPayload(rawContent: string): string {
  const trimmed = rawContent.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]+?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('Model response did not contain a JSON object.');
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
}

export function buildStructuredPlanPrompt(task: Task, context: string | undefined, targetProject: string): string {
  const contextSection = context
    ? `Context:\n${context}\n\n`
    : '';

  return [
    `Task: ${task.description}`,
    '',
    contextSection,
    `Project path: ${targetProject}`,
    '',
    'Return a single JSON object with this exact shape:',
    '{',
    '  "summary": "one-sentence summary of the planned work",',
    '  "intendedFiles": [',
    '    { "path": "src/example.ts", "changeType": "update", "purpose": "why this file matters" }',
    '  ],',
    '  "commands": [',
    '    { "command": "npm test", "purpose": "what this command validates", "expectedOutcome": "what success looks like" }',
    '  ],',
    '  "verification": ["at least one verification step"],',
    '  "risks": ["optional risk or dependency notes"]',
    '}',
    '',
    'Rules:',
    '- Return JSON only. Do not wrap it in markdown unless the client forces it.',
    '- Use relative file paths when possible.',
    '- Keep commands limited to the smallest useful set.',
    '- If no files need changes, return an empty intendedFiles array.',
    '- If no commands are needed, return an empty commands array.',
    '- verification must always contain at least one step.',
    '- risks may be empty when there are no meaningful risks.',
  ].join('\n');
}

export function getStructuredPlanSystemPrompt(): string {
  return [
    'You are hephaestus, an autonomous AI developer agent.',
    'Produce a typed execution plan before any code changes are applied.',
    'Return valid JSON that matches the requested schema exactly.',
    'Do not include prose outside the JSON object.',
  ].join(' ');
}

export function parseTaskPlan(rawContent: string): TaskPlan {
  const payload = extractJsonPayload(rawContent);
  const parsed = JSON.parse(payload) as unknown;

  if (!isRecord(parsed)) {
    throw new Error('Plan response must be a JSON object.');
  }

  const intendedFilesRaw = parsed.intendedFiles;
  if (!Array.isArray(intendedFilesRaw)) {
    throw new Error('Field "intendedFiles" must be an array.');
  }

  const commandsRaw = parsed.commands;
  if (!Array.isArray(commandsRaw)) {
    throw new Error('Field "commands" must be an array.');
  }

  return {
    summary: requireString(parsed.summary, 'summary'),
    intendedFiles: intendedFilesRaw.map((value, index) => parsePlannedFileChange(value, index)),
    commands: commandsRaw.map((value, index) => parsePlannedCommand(value, index)),
    verification: requireStringArray(parsed.verification, 'verification', false),
    risks: requireStringArray(parsed.risks, 'risks', true),
  };
}

export function formatTaskPlanSummary(plan: TaskPlan): string {
  return `${plan.summary} Planned files: ${plan.intendedFiles.length}. Commands: ${plan.commands.length}. Verification steps: ${plan.verification.length}.`;
}
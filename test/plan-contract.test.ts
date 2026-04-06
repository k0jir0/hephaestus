import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildStructuredPlanPrompt,
  formatTaskPlanSummary,
  parseTaskPlan,
} from '../src/plan-contract.js';

describe('parseTaskPlan', () => {
  it('parses a valid JSON plan payload', () => {
    const plan = parseTaskPlan(`{
      "summary": "Inspect the queue runtime and update the executor contract.",
      "intendedFiles": [
        { "path": "src/runtime.ts", "changeType": "update", "purpose": "centralize orchestration" }
      ],
      "commands": [
        { "command": "npm test", "purpose": "validate runtime behavior", "expectedOutcome": "All tests pass" }
      ],
      "verification": ["Run npm test"],
      "risks": ["Requires backend JSON compliance"]
    }`);

    assert.equal(plan.summary, 'Inspect the queue runtime and update the executor contract.');
    assert.equal(plan.intendedFiles[0]?.path, 'src/runtime.ts');
    assert.equal(plan.commands[0]?.command, 'npm test');
  });

  it('accepts fenced JSON and formats a summary', () => {
    const plan = parseTaskPlan([
      '```json',
      '{',
      '  "summary": "Add a typed planning contract.",',
      '  "intendedFiles": [],',
      '  "commands": [],',
      '  "verification": ["Review the generated plan object"],',
      '  "risks": []',
      '}',
      '```',
    ].join('\n'));

    assert.equal(
      formatTaskPlanSummary(plan),
      'Add a typed planning contract. Planned files: 0. Commands: 0. Verification steps: 1.'
    );
  });

  it('rejects a payload without verification steps', () => {
    assert.throws(
      () =>
        parseTaskPlan(`{
          "summary": "Missing verification.",
          "intendedFiles": [],
          "commands": [],
          "verification": [],
          "risks": []
        }`),
      /verification/
    );
  });
});

describe('buildStructuredPlanPrompt', () => {
  it('includes the schema and project context', () => {
    const prompt = buildStructuredPlanPrompt(
      {
        id: 'task_demo',
        description: 'Refine the runtime',
        status: 'pending',
        createdAt: new Date(),
      },
      'README excerpt',
      '.'
    );

    assert.match(prompt, /"summary"/);
    assert.match(prompt, /README excerpt/);
    assert.match(prompt, /Project path: \./);
  });
});
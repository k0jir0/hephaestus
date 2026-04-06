import fs from 'fs/promises';
import path from 'path';
import { config as defaultConfig, type Config, validateConfig } from './config.js';
import type { Task } from './types.js';

export interface PreflightIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
}

export interface HealthChecker {
  checkHealth(): Promise<{ available: boolean; message: string }>;
}

export interface SafetyGate {
  shouldContinue(): Promise<{ allowed: boolean; reason?: string }>;
}

export interface AdmissionDecision {
  allowed: boolean;
  reason?: string;
}

const requiredTaskSections = ['Queue', 'In Progress', 'Completed'] as const;

async function pathType(targetPath: string): Promise<'missing' | 'file' | 'directory'> {
  try {
    const stats = await fs.stat(targetPath);
    if (stats.isDirectory()) {
      return 'directory';
    }

    return 'file';
  } catch {
    return 'missing';
  }
}

function createError(code: string, message: string): PreflightIssue {
  return {
    severity: 'error',
    code,
    message,
  };
}

function createWarning(code: string, message: string): PreflightIssue {
  return {
    severity: 'warning',
    code,
    message,
  };
}

export async function runStartupPreflight(options: {
  config?: Config;
  healthChecker?: HealthChecker;
} = {}): Promise<PreflightResult> {
  const activeConfig = options.config ?? defaultConfig;
  const issues: PreflightIssue[] = validateConfig(activeConfig).map((issue) =>
    createError(issue.code, issue.message)
  );

  const targetProjectType = await pathType(activeConfig.targetProject);
  if (targetProjectType === 'missing') {
    issues.push(
      createError(
        'missing-target-project',
        `Target project path does not exist: ${activeConfig.targetProject}`
      )
    );
  } else if (targetProjectType !== 'directory') {
    issues.push(
      createError(
        'invalid-target-project',
        `Target project path must be a directory: ${activeConfig.targetProject}`
      )
    );
  }

  const tasksFileType = await pathType(activeConfig.tasksFile);
  if (tasksFileType === 'missing') {
    issues.push(
      createError('missing-tasks-file', `TASKS.md was not found at ${activeConfig.tasksFile}`)
    );
  } else if (tasksFileType !== 'file') {
    issues.push(
      createError('invalid-tasks-file', `TASKS.md path must be a file: ${activeConfig.tasksFile}`)
    );
  } else {
    const tasksContent = await fs.readFile(activeConfig.tasksFile, 'utf-8');
    for (const section of requiredTaskSections) {
      if (!tasksContent.includes(`## ${section}`)) {
        issues.push(
          createError(
            'missing-task-section',
            `TASKS.md is missing the required section header: ## ${section}`
          )
        );
      }
    }
  }

  const memoryDirectoryType = await pathType(path.dirname(activeConfig.agentMemoryFile));
  if (memoryDirectoryType !== 'directory') {
    issues.push(
      createError(
        'missing-memory-directory',
        `AGENT.md parent directory does not exist: ${path.dirname(activeConfig.agentMemoryFile)}`
      )
    );
  }

  const progressDirectoryType = await pathType(path.dirname(activeConfig.progressLog));
  if (progressDirectoryType !== 'directory') {
    issues.push(
      createError(
        'missing-progress-directory',
        `PROGRESS.log parent directory does not exist: ${path.dirname(activeConfig.progressLog)}`
      )
    );
  }

  if (options.healthChecker) {
    try {
      const health = await options.healthChecker.checkHealth();
      if (!health.available) {
        issues.push(createWarning('backend-unavailable', health.message));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      issues.push(
        createWarning('backend-health-check-failed', `Backend health check failed: ${errorMessage}`)
      );
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    issues,
  };
}

export async function evaluateTaskAdmission(
  _task: Task,
  safety: SafetyGate
): Promise<AdmissionDecision> {
  const decision = await safety.shouldContinue();

  if (decision.allowed) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: decision.reason || 'Task rejected by safety policy.',
  };
}
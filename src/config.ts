/**
 * Hephaestus Configuration
 * Loads and validates environment variables
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AIBackend, SafetyConfig } from './types.js';

export interface ConfigValidationIssue {
  code: string;
  message: string;
}

export const supportedAIBackends = ['copilot', 'openai', 'claude', 'ollama'] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export interface Config {
  // AI Backend
  aiBackend: AIBackend;
  aiModel: string;
  
  // Safety
  safety: SafetyConfig;
  
  // Project
  targetProject: string;
  
  // Timing
  checkInterval: number;
  
  // Paths
  baseDir: string;
  tasksFile: string;
  agentMemoryFile: string;
  progressLog: string;
  
  // API Keys (optional based on backend)
  githubToken?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
}

function isSupportedAIBackend(value: string): value is AIBackend {
  return supportedAIBackends.includes(value as AIBackend);
}

function getEnv(key: string, defaultValue?: string): string {
  return process.env[key] || defaultValue || '';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function resolveFromBase(baseDir: string, candidate: string): string {
  if (path.isAbsolute(candidate)) {
    return candidate;
  }

  return path.resolve(baseDir, candidate);
}

export function loadConfig(): Config {
  const baseDir = path.resolve(__dirname, '..');
  const targetProject = resolveFromBase(baseDir, getEnv('TARGET_PROJECT', '.'));
  
  return {
    // AI Backend
    aiBackend: (getEnv('AI_BACKEND', 'copilot') as AIBackend),
    aiModel: getEnv('AI_MODEL', ''),
    
    // Safety
    safety: {
      dailyTokenBudget: getEnvNumber('DAILY_TOKEN_BUDGET', 10.0),
      maxIterations: getEnvNumber('MAX_ITERATIONS', 50),
      errorThreshold: getEnvNumber('ERROR_THRESHOLD', 5),
      autoCommitInterval: getEnvNumber('AUTO_COMMIT_INTERVAL', 30),
    },
    
    // Project
    targetProject,
    
    // Timing
    checkInterval: getEnvNumber('CHECK_INTERVAL', 60) * 1000, // Convert to ms
    
    // Paths
    baseDir,
    tasksFile: path.join(baseDir, 'TASKS.md'),
    agentMemoryFile: path.join(baseDir, 'AGENT.md'),
    progressLog: path.join(baseDir, 'PROGRESS.log'),
    
    // API Keys
    githubToken: getEnv('GITHUB_TOKEN'),
    openaiApiKey: getEnv('OPENAI_API_KEY'),
    anthropicApiKey: getEnv('ANTHROPIC_API_KEY'),
    ollamaBaseUrl: getEnv('OLLAMA_BASE_URL', 'http://localhost:11434'),
  };
}

export function validateConfig(candidate: Config): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];

  if (!isSupportedAIBackend(String(candidate.aiBackend))) {
    issues.push({
      code: 'invalid-ai-backend',
      message: `AI_BACKEND must be one of: ${supportedAIBackends.join(', ')}`,
    });
  }

  if (!candidate.targetProject.trim()) {
    issues.push({
      code: 'missing-target-project',
      message: 'TARGET_PROJECT must resolve to a non-empty path.',
    });
  }

  if (!Number.isFinite(candidate.checkInterval) || candidate.checkInterval <= 0) {
    issues.push({
      code: 'invalid-check-interval',
      message: 'CHECK_INTERVAL must be a positive number of milliseconds.',
    });
  }

  if (!Number.isFinite(candidate.safety.dailyTokenBudget) || candidate.safety.dailyTokenBudget < 0) {
    issues.push({
      code: 'invalid-daily-budget',
      message: 'DAILY_TOKEN_BUDGET must be a finite number greater than or equal to 0.',
    });
  }

  if (
    !Number.isInteger(candidate.safety.maxIterations) ||
    candidate.safety.maxIterations <= 0
  ) {
    issues.push({
      code: 'invalid-max-iterations',
      message: 'MAX_ITERATIONS must be a positive integer.',
    });
  }

  if (
    !Number.isInteger(candidate.safety.errorThreshold) ||
    candidate.safety.errorThreshold <= 0
  ) {
    issues.push({
      code: 'invalid-error-threshold',
      message: 'ERROR_THRESHOLD must be a positive integer.',
    });
  }

  if (
    !Number.isFinite(candidate.safety.autoCommitInterval) ||
    candidate.safety.autoCommitInterval < 0
  ) {
    issues.push({
      code: 'invalid-auto-commit-interval',
      message: 'AUTO_COMMIT_INTERVAL must be a finite number greater than or equal to 0.',
    });
  }

  return issues;
}

export const config = loadConfig();

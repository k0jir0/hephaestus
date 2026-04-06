/**
 * hephaestus Configuration
 * Loads and validates environment variables
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AIBackend, SafetyConfig } from './types.js';

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

export const config = loadConfig();

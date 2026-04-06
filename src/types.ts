/**
 * Hephaestus Type Definitions
 */

export type AIBackend = 'copilot' | 'openai' | 'claude' | 'ollama';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: string;
  error?: string;
}

export interface AgentState {
  status: 'idle' | 'working' | 'error' | 'shutdown';
  currentTask?: Task;
  iterationCount: number;
  totalTasksCompleted: number;
  consecutiveErrors: number;
  lastActivity: Date;
  sessionStart: Date;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
  };
}

export interface SafetyConfig {
  dailyTokenBudget: number;
  maxIterations: number;
  errorThreshold: number;
  autoCommitInterval: number;
}

export interface AIResponse {
  success: boolean;
  content: string;
  toolCalls?: ToolCall[];
  cost?: number;
  tokens?: {
    prompt: number;
    completion: number;
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  error?: string;
}

export interface MemoryEntry {
  timestamp: Date;
  type: 'task' | 'pattern' | 'preference' | 'note';
  content: string;
  source: 'agent' | 'user';
}

export interface ProgressEntry {
  timestamp: Date;
  action: string;
  task?: string;
  result: 'success' | 'failure' | 'info';
  details?: string;
}

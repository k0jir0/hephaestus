/**
 * hephaestus AI Executor
 * Handles communication with various AI backends
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from './config.js';
import { createComponentLogger } from './logger.js';
import {
  buildStructuredPlanPrompt,
  getStructuredPlanSystemPrompt,
  parseTaskPlan,
} from './plan-contract.js';
import type { AIResponse, Task } from './types.js';

const execFileAsync = promisify(execFile);
const logger = createComponentLogger('Executor');

export class AIExecutor {
  private backend: string;

  constructor() {
    this.backend = config.aiBackend;
    logger.info(`AIExecutor initialized with backend: ${this.backend}`);
  }

  /**
   * Execute a task using the configured AI backend
   */
  async executeTask(task: Task, context?: string): Promise<AIResponse> {
    logger.info(`Executing task: ${task.description}`);

    const response = await this.requestStructuredPlan(task, context);
    if (!response.success) {
      return response;
    }

    try {
      const plan = parseTaskPlan(response.content);

      return {
        ...response,
        content: plan.summary,
        rawContent: response.content,
        plan,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Structured plan validation failed', { error: errorMessage });

      return {
        ...response,
        success: false,
        rawContent: response.content,
        content: `Structured plan validation failed: ${errorMessage}`,
      };
    }
  }

  private async requestStructuredPlan(task: Task, context?: string): Promise<AIResponse> {
    switch (this.backend) {
      case 'copilot':
        return this.executeWithCopilot(task, context);
      case 'openai':
        return this.executeWithOpenAI(task, context);
      case 'claude':
        return this.executeWithClaude(task, context);
      case 'ollama':
        return this.executeWithOllama(task, context);
      default:
        return {
          success: false,
          content: `Unknown backend: ${this.backend}`,
        };
    }
  }

  /**
   * Execute using GitHub Copilot CLI
   */
  private async executeWithCopilot(task: Task, context?: string): Promise<AIResponse> {
    try {
      try {
        await execFileAsync('gh', ['copilot', '--version']);
      } catch {
        return {
          success: false,
          content: 'GitHub Copilot CLI (gh copilot) is not installed or not authenticated. Run: gh copilot setup',
        };
      }

      const targetPath = config.targetProject;
      const prompt = this.buildPrompt(task, context);

      const { stdout, stderr } = await execFileAsync(
        'gh',
        ['copilot', 'suggest', '-t', 'implement', prompt],
        {
          cwd: targetPath,
          timeout: 300000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      if (stderr && !stdout) {
        logger.warn('Copilot stderr', { stderr });
      }

      return {
        success: true,
        content: stdout || stderr,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Copilot execution failed', { error: errorMessage });
      return {
        success: false,
        content: `Copilot execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute using OpenAI API
   */
  private async executeWithOpenAI(task: Task, context?: string): Promise<AIResponse> {
    try {
      if (!config.openaiApiKey) {
        return {
          success: false,
          content: 'OpenAI API key not configured. Set OPENAI_API_KEY in .env',
        };
      }

      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({ apiKey: config.openaiApiKey });

      const prompt = this.buildPrompt(task, context);
      const model = config.aiModel || 'gpt-4o-mini';

      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 4000,
        temperature: 0.2,
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;

      return {
        success: true,
        content,
        cost: this.calculateOpenAICost(usage?.prompt_tokens || 0, usage?.completion_tokens || 0, model),
        tokens: {
          prompt: usage?.prompt_tokens || 0,
          completion: usage?.completion_tokens || 0,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('OpenAI execution failed', { error: errorMessage });
      return {
        success: false,
        content: `OpenAI execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute using Anthropic Claude
   */
  private async executeWithClaude(task: Task, context?: string): Promise<AIResponse> {
    try {
      if (!config.anthropicApiKey) {
        return {
          success: false,
          content: 'Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env',
        };
      }

      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: config.anthropicApiKey });

      const prompt = this.buildPrompt(task, context);
      const model = config.aiModel || 'claude-3-5-sonnet-20241022';

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: this.getSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0].type === 'text' ? response.content[0].text : '';

      return {
        success: true,
        content,
        cost: this.calculateClaudeCost(response.usage.input_tokens, response.usage.output_tokens, model),
        tokens: {
          prompt: response.usage.input_tokens,
          completion: response.usage.output_tokens,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Claude execution failed', { error: errorMessage });
      return {
        success: false,
        content: `Claude execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute using Ollama (local models)
   */
  private async executeWithOllama(task: Task, context?: string): Promise<AIResponse> {
    try {
      const prompt = this.buildPrompt(task, context);
      const model = config.aiModel || 'llama3';

      const response = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `${this.getSystemPrompt()}\n\n${prompt}`,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json() as { response?: string };

      return {
        success: true,
        content: data.response || 'No response from Ollama',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Ollama execution failed', { error: errorMessage });
      return {
        success: false,
        content: `Ollama execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Build the prompt for a task
   */
  private buildPrompt(task: Task, context?: string): string {
    return buildStructuredPlanPrompt(task, context, config.targetProject);
  }

  /**
   * Get system prompt for the AI
   */
  private getSystemPrompt(): string {
    return getStructuredPlanSystemPrompt();
  }

  /**
   * Calculate OpenAI cost
   */
  private calculateOpenAICost(promptTokens: number, completionTokens: number, model: string): number {
    // Pricing per 1M tokens (approximate)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4o': { input: 5.0, output: 15.0 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.0, output: 30.0 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    };

    const rates = pricing[model] || pricing['gpt-4o-mini'];
    return (promptTokens / 1_000_000) * rates.input + (completionTokens / 1_000_000) * rates.output;
  }

  /**
   * Calculate Claude cost
   */
  private calculateClaudeCost(inputTokens: number, outputTokens: number, model: string): number {
    // Pricing per 1M tokens (approximate)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
      'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    };

    const rates = pricing[model] || pricing['claude-3-5-sonnet-20241022'];
    return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
  }

  /**
   * Check backend availability
   */
  async checkHealth(): Promise<{ available: boolean; message: string }> {
    switch (this.backend) {
      case 'copilot':
        try {
          await execFileAsync('gh', ['copilot', '--version']);
          return { available: true, message: 'GitHub Copilot CLI is available' };
        } catch {
          return { available: false, message: 'GitHub Copilot CLI is not installed or not authenticated' };
        }

      case 'openai':
        if (!config.openaiApiKey) {
          return { available: false, message: 'OPENAI_API_KEY not configured' };
        }
        return { available: true, message: 'OpenAI API key configured' };

      case 'claude':
        if (!config.anthropicApiKey) {
          return { available: false, message: 'ANTHROPIC_API_KEY not configured' };
        }
        return { available: true, message: 'Anthropic API key configured' };

      case 'ollama':
        try {
          const response = await fetch(`${config.ollamaBaseUrl}/api/tags`);
          if (response.ok) {
            return { available: true, message: 'Ollama is running' };
          }
          return { available: false, message: 'Ollama is not responding' };
        } catch {
          return { available: false, message: 'Ollama is not running' };
        }

      default:
        return { available: false, message: `Unknown backend: ${this.backend}` };
    }
  }
}

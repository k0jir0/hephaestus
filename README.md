# Hephaestus - 24/7 Autonomous AI Developer Agent

Hephaestus is an always-on AI agent that continuously works on tasks from a TODO list, implements features, runs tests, and maintains code quality while you sleep.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HEPHAESTUS AGENT                         │
├─────────────────────────────────────────────────────────────┤
│  TASKS.md ──► Watcher ──► AI Brain ──► Executor ──► Git    │
│                    │            │            │              │
│               File Monitor   Reasoning    Tool Calls         │
│                    │            │            │              │
│              AGENT.md ◄──── Memory ◄──── Logs/State        │
└─────────────────────────────────────────────────────────────┘
```

## Core Loop

1. **Perceive** - Watch TASKS.md for new tasks
2. **Reason** - Analyze task requirements using AI
3. **Plan** - Break down into executable steps
4. **Act** - Execute code changes, run tests
5. **Observe** - Verify results, log progress

## Safety Guardrails

- **Token Budget**: Daily spend limit with automatic shutdown
- **Iteration Limits**: Max loops before human check-in
- **Git Snapshots**: Auto-commit every 30 minutes
- **Health Checks**: External monitoring integration

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start the agent
npm run start

# Or run in background
npm run start:daemon
```

## Project Structure

```
hephaestus/
├── src/
│   ├── agent.ts        # Main agent loop
│   ├── watcher.ts      # TASKS.md monitor
│   ├── executor.ts     # AI command execution
│   ├── memory.ts       # Long-term memory (AGENT.md)
│   └── safety.ts       # Guardrails & kill switches
├── TASKS.md            # Task queue (add tasks here)
├── AGENT.md            # Agent memory & context
├── PROGRESS.log        # Execution history
└── scripts/
    └── start.sh       # Launch script
```

## Adding Tasks

Edit `TASKS.md` with task items:

```markdown
## Queue
- [ ] Implement user authentication
- [ ] Write unit tests for auth module
- [ ] Fix memory leak in data pipeline
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AI_BACKEND` | copilot, openai, claude, ollama | Yes |
| `AI_MODEL` | Model to use (e.g., gpt-4o-mini) | No |
| `DAILY_TOKEN_BUDGET` | Max daily spend (USD) | No |
| `MAX_ITERATIONS` | Loops before check-in | No |
| `GITHUB_TOKEN` | For Copilot CLI | Conditional |
| `OPENAI_API_KEY` | For OpenAI models | Conditional |
| `ANTHROPIC_API_KEY` | For Claude models | Conditional |

## Supported AI Backends

- **GitHub Copilot CLI** (`gh copilot`) - Default, uses existing gh auth
- **OpenAI** - GPT-4o, GPT-4o-mini
- **Anthropic Claude** - Claude 3.5 Sonnet, Opus
- **Ollama** - Local models (Llama 3, DeepSeek)

## Safety Features

1. **Kill Switch**: Automatically stops if daily budget exceeded
2. **Snapshotting**: Git auto-commits every 30 minutes
3. **Iteration Limits**: Forces human review after N iterations
4. **Error Threshold**: Shuts down after repeated failures

## Monitoring

Check progress:
```bash
tail -f PROGRESS.log
cat AGENT.md
```

## Extending

The agent can be extended with:
- Custom tool integrations
- Additional memory backends (Redis, vector DB)
- External triggers (webhooks, cron)
- Worktree isolation for parallel tasks

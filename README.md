# Hephaestus

Hephaestus is a self-targeting AI automation demo. It watches a Markdown task queue, gathers repository context, sends work to a configurable AI backend, and records state transitions in markdown so the workflow stays inspectable.

This repository is configured to run Hephaestus on itself by default. That makes it useful as a GitHub-ready demo of AI automation with visible guardrails instead of an opaque “magic agent” claim.

## What It Demonstrates

- Queue-driven automation through `TASKS.md`
- Startup preflight and policy-first task admission before queue mutation
- Structured planning contracts with intended files, commands, verification, and risks
- Markdown repository adapters with bounded fixture smoke coverage
- Repository context gathering from `package.json`, `README.md`, and git status
- Pluggable AI backends for GitHub Copilot CLI, OpenAI, Claude, and Ollama
- Guardrails for budget, iteration count, error thresholds, and optional auto-commit
- Persistent state tracking in `AGENT.md`
- Single-pass execution for bounded demos and CI-friendly runs

## Current Scope

Hephaestus is intentionally a safe demo project. It orchestrates tasks and records typed execution plans, but it does not yet apply code edits through a sandboxed tool runtime. That keeps the automation flow auditable while still exposing the plan the agent intends to follow.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Validate the environment and repo shape
npm run preflight

# Run one bounded demo pass
npm run start:once

# Or run in watcher mode
npm run start
```

On Windows, you can also use `start.bat`. On Unix-like systems, use `start.sh`.

## Default Demo Setup

The default `.env.example` targets the current repository:

```env
TARGET_PROJECT=.
```

That means the agent reads and reasons about this repository itself. To point it at another project, set `TARGET_PROJECT` to a different path.

## Scripts

- `npm run build` compiles the TypeScript source into `dist/`
- `npm run preflight` validates config, repo files, and backend reachability
- `npm run start` builds and starts watcher mode
- `npm run start:once` builds, processes the current queue once, and exits
- `npm run dev` runs the agent directly from source with `tsx`
- `npm run dev:once` runs a single-pass source-mode demo
- `npm test` runs contract, repository, runtime, and smoke tests

## Task Lifecycle

Hephaestus uses a section-based task file:

```text
Queue -> In Progress -> Completed
```

Pending work belongs in the `Queue` section of `TASKS.md`. As work starts, the task moves into `In Progress`. When a task succeeds, it moves into `Completed`.

Before a task leaves `Queue`, Hephaestus now runs an admission gate that checks policy and runtime readiness first. If admission fails, the task stays queued and the blocker is recorded in `AGENT.md`.

When a task is admitted, the executor now returns a structured plan instead of only free-form prose. Each successful plan contains:

- intended file targets
- intended commands
- verification steps
- risk notes

The runtime now talks to explicit task and memory repository interfaces. The built-in implementations remain markdown-backed so the workflow stays inspectable, but the orchestration layer no longer depends directly on markdown file logic.

## Architecture

See `docs/architecture.md` for the current runtime shape and the shift-left roadmap.

## Project Structure

```text
Hephaestus/
├── src/
│   ├── agent.ts
│   ├── config.ts
│   ├── executor.ts
│   ├── logger.ts
│   ├── memory.ts
│   ├── plan-contract.ts
│   ├── preflight.ts
│   ├── repositories.ts
│   ├── runtime.ts
│   ├── safety.ts
│   ├── types.ts
│   └── watcher.ts
├── docs/
│   └── architecture.md
├── test/
├── TASKS.md
├── AGENT.md
└── .github/workflows/ci.yml
```

## Safety Controls

- Daily token budget
- Maximum iteration count
- Error threshold shutdown behavior
- Optional git auto-snapshots
- Explicit single-pass mode for demos

## CI

GitHub Actions runs the TypeScript build and the unit tests on every push and pull request.

## Backends

- `copilot` for GitHub Copilot CLI
- `openai` for OpenAI chat completions
- `claude` for Anthropic models
- `ollama` for local model execution

## License

MIT

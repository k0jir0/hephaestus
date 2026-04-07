# Hephaestus Architecture

## Purpose

Hephaestus is intentionally small: it demonstrates an inspectable automation loop without claiming opaque end-to-end autonomy. The architecture is designed to keep workflow state visible in markdown while moving safety and validation earlier in the lifecycle.

## Current Runtime Shape

The runtime currently follows this sequence:

1. Load configuration and initialize the runtime service.
2. Run startup preflight against config, repository shape, and backend health.
3. Discover queued tasks from `TASKS.md`.
4. Admit or reject each task before any durable queue mutation.
5. Gather repository context and request a typed task plan from the configured AI backend.
6. Validate the plan contract before persisting task outcomes and session notes into markdown.

That keeps the operator-facing surface area simple:

- `TASKS.md` remains the task board.
- `AGENT.md` remains the persistent memory log.
- The runtime enforces guardrails before work starts instead of after state changes have already happened.

## Module Boundaries

- `src/config.ts`: environment loading plus config validation.
- `src/preflight.ts`: startup checks and task admission decisions.
- `src/agent.ts`: orchestration and runtime loop.
- `src/watcher.ts`: markdown queue parsing and state transitions.
- `src/memory.ts`: markdown memory persistence.
- `src/executor.ts`: backend-specific AI execution adapters.
- `src/safety.ts`: budget, iteration, and error-threshold policy.

## Phase 1 Shift-Left Work

Phase 1 focuses on catching failures before the agent mutates task state.

- Startup preflight validates config semantics, repo paths, and required task sections.
- Backend reachability is surfaced as a warning before the run starts.
- Task admission happens before the task is moved into `In Progress`.
- Blocked tasks remain in `Queue`, which preserves an accurate queue history.

## Phase 2: Structured Planning Contract

Phase 2 is now implemented.

- The executor requests a JSON plan instead of free-form output.
- Successful responses are validated into a typed contract with intended files, commands, verification, and risks.
- Invalid model output fails closed instead of being treated as a successful task result.

## Phase 3: Runtime Core Extraction

Phase 3 is now implemented.

- `src/runtime.ts` owns session lifecycle, single-pass mode, watch mode, timers, and shutdown.
- `src/agent.ts` is now a thin entrypoint.
- Shutdown uses the live runtime services instead of recreating fresh safety and memory instances.

## Phase 4: Repository Adapters

Phase 4 is now implemented.

- The runtime depends on explicit task and memory repository interfaces.
- Markdown-backed adapters remain the default implementations, so inspectability is preserved.
- The markdown adapters can now be pointed at fixture files directly, which makes integration-style tests practical.

## Phase 5: Broader Left-Shifted Quality Gates

Phase 5 is now implemented.

- A bounded smoke test now runs the real runtime against markdown fixture files on disk.
- The smoke path validates preflight, queue transitions, and memory persistence without relying on the live repository.
- The test suite covers config validation, admission policy, plan-contract parsing, runtime behavior, and markdown-backed repository flow.

## Next Phases

### Code-Edit Runtime

Keep the typed planning contract, but add a constrained tool runtime that can apply validated file edits and verification commands inside explicit safety boundaries.

### Richer Repository Policies

Extend the repository layer with stronger schema checks for queue metadata, duplicate-task detection, and more explicit session/event history.
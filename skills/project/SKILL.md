---
name: project
description: Treat a task as a structured project with workstreams, milestones, and a living plan document. Use when the work is non-trivial, spans multiple components, or benefits from explicit breakdown and progress tracking. Guides creation and maintenance of a project document under docs/temporary/projects/.
---

# Project Execution

Run structured projects with clear workstreams, tracked milestones, and a living document that keeps everything navigable as complexity grows.

## Core Principle

Complexity cannot be targeted directly. You cannot solve a complex problem by staring at the whole thing. Instead:

1. **Break down** — decompose until each piece is something you can hold in your head and solve confidently.
2. **Solve the smallest piece** — implement it in isolation.
3. **Verify** — test it, run it, confirm it works. Do not proceed on faith.
4. **Compose upward** — combine verified pieces into the next layer. Verify again.
5. **Repeat** — each level builds on proven foundations.

This is how engineers ship. The project document below is the scaffold that makes this process explicit and trackable.

## When to Use This

- Task spans 3+ files or components
- Multiple independent workstreams that could be parallelized
- Work that benefits from a clear definition of done before coding starts
- Any task where you'd otherwise lose track of what's done and what remains

**Not for**: single-file changes, quick fixes, well-scoped features you can implement in one pass.

## Workflow

1. **Define the goal** — write a crisp 1-2 sentence statement of what "done" looks like. If you can't, the scope isn't clear yet — clarify with the user before proceeding.
2. **Create the project document** at `docs/temporary/projects/YYYY/MM/DD/<project-slug>/PLAN.md`. Use today's date and a descriptive kebab-case slug.
3. **Decompose into workstreams** — identify the independent tracks of work. Each workstream should be completable and verifiable on its own. A workstream is too big if you can't describe its deliverable in one sentence.
4. **Order by dependencies** — some workstreams unblock others. Map this. Start with the ones that have no dependencies or that unblock the most downstream work.
5. **Execute bottom-up** — within each workstream, solve the smallest piece first, verify, then compose upward. Update the tracker after each milestone, not at the end.
6. **Commit at milestones** — each verified workstream or significant sub-deliverable gets its own commit. Don't batch up unverified work.
7. **Reassess as you go** — plans change. When you learn something that changes the approach, update the plan document first, then continue. The document is the source of truth, not your memory.

## Project Document Structure

```
docs/temporary/projects/YYYY/MM/DD/<project-slug>/
├── PLAN.md        # Main document — goal, workstreams, progress
└── ...            # Supporting files (notes, data, diagrams) if needed
```

### PLAN.md Template

```markdown
# <Project Title>

## Goal

<1-2 sentences: what does "done" look like?>

## Workstreams

### WS1: <Name>
**Deliverable**: <one sentence — what this workstream produces>
**Dependencies**: none | WS2, WS3
**Status**: not started | in progress | blocked | done

Tasks:
- [ ] <smallest piece>
- [ ] <next piece>
- [ ] <verification step>

### WS2: <Name>
...

## Dependency Map

<which workstreams block which — simple list or ASCII diagram>

```
WS1 ──→ WS3
WS2 ──→ WS3
WS3 ──→ WS4 (integration)
```

## Progress Tracker

| Workstream | Status | Milestone | Notes |
|------------|--------|-----------|-------|
| WS1: Name | done | Verified core logic | Simpler than expected |
| WS2: Name | in progress | API stubbed | Blocked on WS1 output format — resolved |
| WS3: Name | not started | — | — |

## Decision Log

Decisions made during execution that affect scope, approach, or trade-offs.

| # | Decision | Why | Impact |
|---|----------|-----|--------|
| D1 | Use X instead of Y | Y requires Z which adds complexity | Simplifies WS2 |

## Open Questions

- <anything unresolved that blocks or could change the plan>

## Files Modified

| File | Workstream | Purpose |
|------|------------|---------|
```

## Key Principles

- **Decompose before coding** — time spent planning saves multiples in execution. The breakdown is the thinking.
- **Each piece must be verifiable in isolation** — if you can't test it alone, decompose further.
- **Bottom-up, not top-down** — solve leaves first, then assemble. Never write glue code before the pieces it connects are proven.
- **Update the document as you work** — a plan that doesn't reflect reality is worse than no plan. The tracker should always show current state.
- **Decisions are first-class** — when you make a non-obvious choice, log it. Future-you (or the user) will want to know why.
- **Scope changes go through the document** — if you discover the plan needs to change, update the plan first, then execute. Don't silently drift.

# Multi-Agent Development System — V2

A system for running N AI agents in parallel on ForgeCAD, with automated
orchestration, merge safety, and human oversight at the right points.

---

## Overview

```
You (set goals, review plans, deep-dive on hard tasks)
  │
  ▼
Planner Agent ──► Task files in tasks/active/ (contract format)
  │
  ▼
Orchestrator Script ──► N Worker Agents (each in its own git worktree)
  │                         │
  │                         ▼
  │                     Commits on isolated branches
  │
  ▼
PM Agent (monitors progress, flags blockers)
  │
  ▼
Merge Queue (sequential, verified merges to mainline)
```

Three agent roles, one orchestration script, one task contract format.

---

## 1. Task Contract Format

Every task is a markdown file in `tasks/active/`. This is the interface between
the planner and the workers — it must be precise enough that an agent can
implement and self-verify without human intervention.

```markdown
# Task: <ID>-<slug>

## Status: pending | in-progress | done | failed
## Assignee: (worktree name, set by orchestrator)
## Priority: P0 | P1 | P2
## Depends-on: [<other-task-IDs>]
## Files-owned: [src/path/a.ts, src/path/b.ts]

## Objective
One paragraph. What to build and why.

## Acceptance Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `npm run test` passes — no regressions
- [ ] (Specific, testable criterion for this task)
- [ ] (Another specific criterion)

## Constraints
- Do NOT modify files outside Files-owned
- Do NOT change public API signatures in <list>
- Max N lines changed (optional)

## Context
- Read: (relevant doc or example paths)
- Related: (other task IDs or planning docs)

## Verification Command
\`\`\`bash
npm run test:constraints -- --filter "relevant-filter"
\`\`\`
```

### Key fields

| Field | Purpose |
|-------|---------|
| `Files-owned` | Prevents merge conflicts — no two tasks share files |
| `Verification Command` | Agent self-checks before marking done |
| `Acceptance Criteria` | Concrete, testable — not vague descriptions |
| `Depends-on` | Orchestrator sequences work correctly |
| `Status` | Planner writes `pending`, worker updates to `done`/`failed` |

---

## 2. Agent Definitions

### Planner (`.claude/agents/planner.md`)

Decomposes a high-level goal into parallelizable tasks.

- Analyzes the codebase to determine file ownership boundaries
- Ensures no two tasks touch the same files
- Identifies dependency ordering
- Writes verification commands that test the specific change
- Flags tasks needing human guidance as `needs-human-review`

**Invocation:**
```bash
claude --agent planner -p "Decompose: <goal description>"
```

### Worker (`.claude/agents/worker.md`)

Implements a single task in an isolated git worktree.

- Reads the task file, reads context, implements changes
- Only modifies files listed in `Files-owned`
- Runs verification command, fixes until passing
- Runs `npm run build`, fixes until passing
- Commits and marks task as `done`

**Invocation (by orchestrator):**
```bash
claude --worktree "worker-<task-id>" --agent worker \
  -p "Execute task: tasks/active/<task-id>.md" \
  --max-turns 50 --max-budget-usd 10
```

### PM (`.claude/agents/pm.md`)

Monitors progress, does NOT write code.

- Reads task statuses and worker results
- Checks worktree branch states via `git worktree list`
- Reports progress (pending / in-progress / done / failed)
- Flags stuck workers (no commits in worktree)
- Flags potential merge conflicts

**Invocation:**
```bash
claude --agent pm -p "Report status of all active tasks"
# Or continuous:
/loop 2m Check tasks/active/ and .agents/results/ — report progress
```

---

## 3. Merge Safety: Three Layers

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Prevention** | `Files-owned` in task spec | No two agents touch the same files |
| **Isolation** | Git worktrees | Each agent has its own branch and working copy |
| **Serialization** | Sequential merge queue | One-at-a-time merges with build verification |

### Merge queue operation

1. All workers run in parallel (fast)
2. After all workers finish, merges happen serially (safe)
3. Each merge: `git merge --no-ff`, then `npm run build && npm run test`
4. If merge fails: abort, flag for human review, continue to next
5. If post-merge verification fails: `git reset --hard HEAD~1`, flag, continue

The merge lock uses atomic `mkdir` (POSIX-safe) for cases where multiple
orchestrator instances might run. In practice, the single-threaded merge
phase is the primary serialization mechanism — same model as CI merge queues.

---

## 4. Orchestration Script

`scripts/orchestrate.sh` manages the full lifecycle:

```bash
# Phase 1: Plan
./scripts/orchestrate.sh plan "Implement solver improvements steps 4-6"
# → Creates task files in tasks/active/
# → You review and edit before proceeding

# Phase 2: Execute
./scripts/orchestrate.sh run
# → Launches one worker per pending task (respecting dependencies)
# → Each worker runs in its own worktree
# → Waits for all workers to finish

# Phase 3: Merge
./scripts/orchestrate.sh merge
# → Sequential merge queue with verification
# → Flags conflicts for human review
```

### Cost control

- `--max-turns 50` per worker (prevents infinite loops)
- `--max-budget-usd 10` per worker (prevents runaway spend)
- Workers that hit limits are marked `failed` for human review

---

## 5. File Structure

```
ForgeCAD/
├── .claude/
│   ├── agents/
│   │   ├── planner.md         # Task decomposition agent
│   │   ├── worker.md          # Code implementation agent
│   │   └── pm.md              # Progress monitoring agent
│   ├── skills/                # Custom skills (plan-sprint, etc.)
│   └── settings.json          # Hooks, permissions
├── tasks/
│   ├── active/                # Current sprint (contract format)
│   ├── backlog/               # Future work
│   └── completed/             # Done tasks (reference)
├── .agents/
│   ├── results/               # JSON output from each worker
│   └── worktrees/             # Git worktrees (auto-managed)
├── scripts/
│   └── orchestrate.sh         # Master orchestration script
└── docs/processes/
    └── MULTI_AGENT_DEVELOPMENT.md  # This document
```

---

## 6. Your Role

| Activity | Who | When |
|----------|-----|------|
| Set the goal | **You** | Start of sprint |
| Decompose into tasks | **Planner** | Automatic, then you review |
| Flag hard tasks | **Planner** | Marks `needs-human-review` |
| Deep-dive on hard tasks | **You** | Before or during sprint |
| Implement tasks | **Workers** | Fully autonomous in worktrees |
| Monitor progress | **PM** | Continuous or on-demand |
| Adjust plan mid-sprint | **You** | Edit task files directly |
| Merge to mainline | **Script** | Sequential, verified |
| Resolve conflicts | **You** | Script flags, you fix |

---

## 7. Getting Started

1. **Start small**: 2-3 workers, not 10. Validate the system works.
2. **Review task files**: The highest-leverage activity. Bad decomposition = bad code.
3. **Check file ownership**: If two tasks share files, you'll get merge conflicts.
4. **Use the PM**: Don't babysit workers — let the PM flag issues.
5. **Scale gradually**: Add more workers as confidence grows.

### Prerequisites

- Claude Code CLI installed and authenticated
- Git worktree support (standard git)
- Node.js (for build/test verification)

### Quick start

```bash
# 1. Plan
claude --agent planner -p "Decompose: <your goal>"

# 2. Review tasks/active/*.md — edit as needed

# 3. Launch workers
./scripts/orchestrate.sh run

# 4. Monitor
claude --agent pm -p "Report status"

# 5. Merge
./scripts/orchestrate.sh merge
```

---

## 8. Comparison of Approaches

| Approach | Pros | Cons | When to use |
|----------|------|------|-------------|
| `/batch` skill | Zero setup, auto-worktrees | No dependency ordering, simple tasks only | One-shot migrations |
| Agent Teams | Native coordination, messaging | Experimental, can be unreliable | Research, reviews |
| This system | Full control, dependency-aware, verified merges | More setup | Complex features with dependencies |
| Manual worktrees | Simple, you control everything | Doesn't scale, you're the bottleneck | 1-2 parallel tasks |

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Overlapping file ownership | Planner enforces boundaries; merge queue catches conflicts |
| Vague acceptance criteria | Template enforces concrete, testable criteria |
| Runaway agent costs | `--max-turns` and `--max-budget-usd` limits |
| Agent produces wrong code | Verification command + post-merge build/test |
| Stuck agent | PM monitors, flags after no progress |
| Merge conflict | Sequential queue; conflicts flagged for human review |
| Task too complex for agent | Planner flags `needs-human-review` |

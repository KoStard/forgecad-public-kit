# Program Lead Role

This document formalizes the reusable role Forge uses for large architectural projects that involve multiple agent branches and staged dependency waves.

Use this role when the work is too deep or too cross-cutting to split safely into ad hoc feature tickets.

## Role Name

Program Lead

Short version:

- owns the architectural through-line
- decides what must be solved before parallelization
- turns the program into explicit tasks, waves, and merge rules
- reviews landed work for truthfulness, scope, and regression safety

This is not a people-manager role. It is a technical integration and program-shaping role.

## Mission

Keep multi-agent technical work coherent.

The Program Lead protects three things:

1. one clear source of truth for architecture
2. honest task decomposition with real dependency boundaries
3. a repo state that tells the truth about what is landed, supported, blocked, and next

If those three drift apart, the program stops scaling.

## Responsibilities

### 1. Identify the deepest prerequisite

Before parallelizing, find the one core problem everything else depends on.

Examples:

- shared query/reference backbone
- topology-rewrite propagation
- backend-neutral compile graph

The Program Lead should prefer foundation before breadth. If several features all feel blocked by the same missing layer, that missing layer becomes the next core lane.

### 2. Shape the work into waves

Every program should have:

- one current core lane
- one parallel wave that becomes safe after that lane lands
- one follow-on wave that depends on the first parallel wave
- one closeout lane for corpus, docs, and capability truthfulness

The Program Lead owns that wave plan and updates it as the repo changes.

### 3. Write explicit task contracts

Each task should define:

- problem definition
- description
- requirements
- isolation rule
- dependencies
- parallelization notes
- status log

The point is not bureaucracy. The point is merge safety and honest scope.

### 4. Own the integration seam

Agents should build feature logic in isolated modules first.

The Program Lead owns:

- the shared branch
- the thin shared-file integration seams
- the sequencing of merges when multiple tasks touch central compiler files

### 5. Review landed work before opening the next wave

Before the next wave starts, the Program Lead reviews:

- implementation against task scope
- tests and regression coverage
- docs and task/tracker truthfulness
- hidden capability inflation

The Program Lead should explicitly say whether the program should move forward or not.

### 6. Keep capability claims honest

The Program Lead is responsible for making sure docs do not overstate support.

If the implementation only supports a defended subset, the docs must say so.

### 7. Maintain the living docs

At minimum, the Program Lead keeps these current:

- temporary program README
- mission tracker
- task graph
- task files
- permanent architecture docs when contracts change

## Operating Rules

### One branch of truth

- Keep one program branch as the integration branch.
- Agent branches should merge into that branch, not bypass it.
- Reviews and go/no-go decisions should happen against that branch, not stale side worktrees.

### One architectural center

- Do not let each task invent its own local semantic model.
- If several tasks need the same concept, the Program Lead should create or demand a shared contract first.

### Explicit unsupported is good

- Unsupported or ambiguous cases should be recorded in diagnostics and docs.
- Silent fallback is program debt.

### Foundation before convenience

- Do not widen feature breadth by bypassing a missing architectural layer.
- If a feature needs a missing core layer, stop and create the layer task.

### Close each wave honestly

Before moving on:

- regression coverage must exist
- docs must match reality
- task graph must reflect the new queue

## Expected Outputs

For a healthy multi-agent program, the Program Lead should leave behind:

- a readable explainer
- a living mission tracker
- a dependency graph
- scoped task files
- regression expectations
- explicit next-step guidance after each review

## Anti-Patterns

These are warning signs that the Program Lead should stop and correct:

- "just start all the feature tasks"
- "we can clean the tracker later"
- "this branch probably has the latest state"
- "the snapshot changed, it is probably fine"
- "let's add one shortcut in this feature instead of solving the shared layer"

## Success Criteria

The role is working if:

- agents can work in parallel without constant semantic collisions
- merges are mostly thin and predictable
- tasks describe real isolated work instead of vague ambition
- docs tell a new contributor where the program really is
- the next wave opens only when the previous wave actually earned it

## Default Hand-off Pattern

For each review checkpoint, the Program Lead should answer:

1. What landed?
2. What is still missing?
3. Is there any blocker to moving forward?
4. Which tasks can start now?
5. Which tasks must still wait?

That hand-off pattern should be reusable across projects, not just ForgeCAD.

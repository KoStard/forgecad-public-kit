# Post Rewrite Edge Queries
## Problem Definition
Task 130 proved the first tracked-edge finishing slice, but it also made the real blocker explicit: Forge still does not own durable edge meaning after topology-changing features.

Without that layer:

- fillet/chamfer stay trapped in the pre-rewrite tracked-edge subset
- shell/boolean/hole/cut descendants cannot support broader edge-driven workflows
- edge-driven exact lowering remains narrower than normal design-tool expectations

## Description
Implement compiler-owned propagated edge-query support for defended post-rewrite cases.

Scope this task to the edge-query layer itself:

- extend the topology-rewrite propagation backbone with edge semantics
- define defended propagated-edge cases after supported rewrites
- expose explicit unsupported diagnostics for ambiguous or non-defensible edge cases

Do not use this task to implement broader fillet/chamfer behavior directly. That belongs in task 220 once the edge-query layer exists.

Primary files:

- edge-query propagation modules
- `src/forge/queryModel.ts`
- edge-resolution helpers
- placement/reference invariants and exact-plan checks

## Requirements
- Define propagated edge-query semantics on top of task 160's propagation contract.
- Keep supported edge cases explicit and narrow where necessary.
- Reject ambiguous or post-merge edge cases explicitly instead of silently guessing.
- Add regression coverage for supported propagated-edge queries.
- Document the exact defended subset and the remaining gaps.

## Isolation Rule
- Consume the propagation kernel from task 160.
- Do not widen hole/cut or projection behavior in this task.
- Do not broaden `filletEdge()` / `chamferEdge()` beyond what is needed to prove the edge-query layer.

## Dependencies
- task 160
- task 105
- task 130

## Parallelization
Can start immediately after task 160. Safe to run in parallel with:

- task 170
- task 180
- task 195

## Status and log
- 2026-03-12: Created for the first post-160 parallel wave.
- 2026-03-12: Completed. Added defended propagated-edge support for untouched sibling vertical edges across supported fillet/chamfer rewrites, kept merged selected-edge cases explicit and unsupported, expanded placement/API/BREP/compiler regression coverage, and updated the permanent docs to spell out the current defended subset.

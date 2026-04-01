# Product Demo Example Migration
## Problem Definition
The root `examples/` tree contains many larger product-style demos. Those are the examples most likely to drift away from the compiler-owned part stack because they predate the architecture program and often use broader modeling styles.

If they are left untouched, the repo will have a "new architecture" in core docs but an example surface that still sends mixed signals.

## Description
Migrate the top-level product/demo part examples onto the post-MLP example gate and make their architecture status explicit.

Scope this task to:

- top-level part demos under `examples/`
- part demos under `examples/shelf/`
- helper modules directly owned by those examples

Primary files:

- top-level `examples/*.forge.js`
- `examples/shelf/`
- example manifest entries for those families
- docs or notes for holdout examples where needed

## Acceptance Criteria
- Every product/demo `.forge.js` example in the task scope is present in the example manifest.
- Each scoped example is assigned one intentional architecture status:
  - `part/exact`
  - `part/faceted`
  - or temporary holdout with a documented blocker
- Examples that can be brought inside the compiler-owned route should be updated to do so without changing their user-visible intent unnecessarily.
- Examples that cannot yet be brought inside the current architecture subset must not stay ambiguous:
  - they need an explicit blocker reason
  - they need a stable manifest classification
- The example gate passes for the example families owned by this task.
- The task leaves behind a short list of remaining product-demo blockers that are genuinely architectural, not just unreviewed.

## Isolation Rule
- Stay inside top-level part/demo examples and `examples/shelf/`.
- Do not take ownership of API/corpus examples or assembly/runtime/notebook validation behavior.
- Avoid broad compiler changes unless a real bug is required to make a migrated example truthful.

## Dependencies
- task 230
- task 240

## Parallelization
Can start after task 240 lands.

Safe to run in parallel with:

- task 250
- task 270

## Status and log
- 2026-03-12: Created for the top-level demo migration wave after the example gate lands.

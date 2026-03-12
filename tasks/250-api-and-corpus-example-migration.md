# API And Corpus Example Migration
## Problem Definition
Once the example gate exists, the next safest migration slice is the API and compiler-corpus part examples.

These examples are closest to the compiler program, so they should become the cleanest proof that part examples now work under the new architecture.

## Description
Migrate the API and compiler-corpus part examples onto the post-MLP example gate and make their route expectations honest.

Scope this task to:

- `examples/api/` part-model examples
- `examples/compiler-corpus/`
- any small shared helpers those examples depend on

Primary files:

- `examples/api/`
- `examples/compiler-corpus/`
- example manifest entries for those families
- example-gate regression checks
- docs for route expectations where needed

## Acceptance Criteria
- Every part-model example in `examples/compiler-corpus/` is covered by the example gate as `part`.
- Every `.forge.js` example in `examples/api/` is either:
  - covered as `part`
  - covered as `assembly`
  - covered as `runtime-scene`
  - or explicitly marked as a temporary holdout with a documented blocker
- For examples classified as `part`, the example gate asserts an intentional route outcome:
  - `exact` means no exact-export blockers for the primary shape objects
  - `faceted` means the exact route is intentionally blocked but the allow-faceted route succeeds with explicit diagnostics
- The migration does not rely on raw backend internals in example code.
- Any example that remains outside the part architecture gate after this task has an explicit reason tied to a real unsupported capability, not a vague "not migrated yet" note.
- The example-gate command passes for the example families owned by this task.

## Isolation Rule
- Stay inside API examples and compiler-corpus examples.
- Do not take ownership of top-level product demos, shelf demos, or notebook/assembly/runtime families beyond manifest classification.
- Keep shared check and manifest edits thin.

## Dependencies
- task 230
- task 240

## Parallelization
Can start after task 240 lands.

Safe to run in parallel with:

- task 260
- task 270

## Status and log
- 2026-03-12: Created for the first example-family migration wave after the example gate lands.

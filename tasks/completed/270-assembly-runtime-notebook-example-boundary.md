# Assembly Runtime Notebook Example Boundary
## Problem Definition
Not every example should be judged by exact part-lowering parity.

Assemblies, runtime-scene demos, sketch-only files, and notebooks still need to work, but they need a different success contract than ordinary part examples.

If we do not define that boundary clearly, the example gate will either:

- overreach and fail on the wrong thing
- or underreach and leave major example families unvalidated

## Description
Define and implement the post-MLP validation boundary for non-part example families.

Scope this task to:

- assembly examples
- runtime-scene / viewport / report examples
- sketch-only examples
- notebook examples

Primary files:

- example manifest entries for these families
- example-gate validation hooks
- notebook/sketch/runtime check helpers if required
- docs explaining how these families fit into the architecture phase

## Acceptance Criteria
- Every scoped example artifact is classified in the example manifest with a non-part validation class.
- The example gate runs the right validation path for each class:
  - `assembly` examples must execute successfully and keep their intended scene/assembly behavior available to the repo checks
  - `runtime-scene` examples must execute successfully without being misclassified as part-lowering failures
  - `sketch` examples must validate through a sketch-appropriate path
  - `notebook` examples must validate through their preview-cell path
- The docs explain clearly that these families are part of the new architecture phase gate, but not all of them are measures of exact part-lowering parity.
- No scoped example remains in an implicit "misc" bucket.
- The example gate passes for the non-part families owned by this task.

## Isolation Rule
- Do not take ownership of broad part-example migration.
- Prefer validation-path and manifest work over large example rewrites.
- Keep compiler feature changes out of scope unless a real bug prevents truthful validation.

## Dependencies
- task 230
- task 240

## Parallelization
Can start after task 240 lands.

Safe to run in parallel with:

- task 250
- task 260

## Status and log
- 2026-03-12: Created to define the non-part example boundary inside the post-MLP architecture phase gate.

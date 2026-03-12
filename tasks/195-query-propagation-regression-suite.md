# Query Propagation Regression Suite
## Problem Definition
The next compiler phase is about topology rewrites and downstream references. That is exactly the kind of architectural work that can appear to pass in narrow feature tests while failing in normal part workflows.

If the regression harness does not evolve with the propagation layer, the team will ship brittle semantics without noticing quickly enough.

## Description
Build the dedicated regression surface for topology-rewrite query propagation.

This task should add reviewable coverage for:

- preserved-face and created-face targeting after supported rewrites
- propagated-edge cases in the defended subset
- explicit unsupported diagnostics for ambiguous rewrite cases
- multi-feature corpus parts that exercise reference survival through normal design flows

Prefer isolated regression surfaces over edits that collide constantly with feature tasks.

Primary files:

- new or dedicated query-propagation check runner(s)
- `examples/compiler-corpus/`
- compiler/BREP snapshot baselines where needed
- small supporting docs

## Requirements
- Add curated cases for supported and intentionally unsupported rewrite scenarios.
- Keep snapshot updates deterministic and reviewable.
- Verify diagnostics, not just successful geometry.
- Avoid semantic feature changes unless a real bug is required to make the tests honest.
- Document what each new regression part is meant to guard.

## Isolation Rule
- Consume the propagation backbone from task 160.
- Prefer adding dedicated check files over editing every existing check surface.
- Do not widen feature behavior in order to make a test pass unless the feature task explicitly owns that work.

## Dependencies
- task 160
- task 150

## Parallelization
Can start immediately after task 160. Safe to run in parallel with:

- task 170
- task 180
- task 190

## Status and log
- 2026-03-12: Created as the quality/support lane for the next compiler wave.

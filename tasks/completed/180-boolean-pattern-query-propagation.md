# Boolean Pattern Query Propagation
## Problem Definition
Forge now preserves owner lineage through booleans, mirrors, and helper-driven patterns, but not durable per-face/per-edge meaning after topology merges.

That leaves a major gap:

- merged descendants are still hard to target semantically
- repeated features can keep owner lineage but still lose useful downstream face meaning
- broader projection and finishing flows remain narrower than they should be

## Description
Implement compiler-owned query propagation for boolean and repeated-result topology rewrites.

Scope this task to the subset Forge can currently defend:

- boolean-preserved descendants where the compiler can trace source ownership
- mirror/pattern descendants where repeated results stay identifiable before ambiguous merges
- explicit ambiguity diagnostics when merged topology cannot produce one defended query target

Primary files:

- boolean/repetition query propagation modules
- repeated-result ownership integration
- compile inspection helpers and regression checks

## Requirements
- Preserve useful face/edge query meaning through supported boolean and repetition flows.
- Detect and report ambiguous merged descendants explicitly.
- Avoid backend-specific heuristics or face-name guessing.
- Add regression cases where repeated descendants drive later downstream features.
- Document the supported and unsupported merge cases honestly.

## Isolation Rule
- Consume the propagation kernel from task 160.
- Do not implement hole/cut variants, projection replay expansion, or broader fillet/chamfer behavior here.
- Keep central compile/lowerer edits thin.

## Dependencies
- task 160
- task 140

## Parallelization
Can start immediately after task 160. Safe to run in parallel with:

- task 170
- task 190
- task 195

## Status and log
- 2026-03-12: Created for the first post-160 parallel wave.
- 2026-03-12: Completed. Added boolean/repetition propagation helpers that lift supported operand face/edge queries into explicit boolean rewrite metadata, preserve distinct repeated-result canonical-face lineage through supported unions, report duplicate-owner merges plus difference/intersection descendants as explicit ambiguity diagnostics, and cover the new behavior in placement/compiler regressions plus permanent docs.

# Projection And Sketch On Face Expansion
## Problem Definition
Forge now has a narrow projection replay slice, but normal part workflows need much broader downstream use:

- projecting from bodies that already went through supported rewrites
- placing downstream sketches on propagated faces, not just the original preserved subset
- keeping projection-driven follow-on features honest across both lowerers

## Description
Expand projection and sketch-on-face downstream support on top of the topology-rewrite propagation backbone.

Scope this task to the next defended subset:

- propagated-face targets after supported shell/boolean/repetition flows
- broader projection-driven downstream features than today's parallel-workplane replay slice
- explicit diagnostics when the source or target falls outside the defended propagated-query subset

Primary files:

- projection/sketch-on-face feature modules
- workplane placement integration
- compiler/BREP regression checks
- capability docs

## Requirements
- Reuse the shared propagated face-query model instead of local placement heuristics.
- Keep runtime and exact lowering aligned for the supported subset.
- Add regression parts that prove projection-driven downstream edits survive through ordinary supported feature chains.
- Document exactly what kinds of projected sources and propagated targets are supported.

## Isolation Rule
- Depends on task 170 and task 180 for the underlying face-query propagation.
- Do not broaden hole/cut or edge-finishing semantics in this task.
- Prefer projection/workplane modules over edits to unrelated feature families.

## Dependencies
- task 160
- task 170
- task 180
- task 120

## Parallelization
Can start after tasks 170 and 180 land. Safe to run in parallel with:

- task 200
- task 220

## Status and log
- 2026-03-12: Created for the second post-160 feature wave.

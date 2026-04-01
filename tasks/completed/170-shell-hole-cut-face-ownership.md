# Shell Hole Cut Face Ownership
## Problem Definition
Shell, hole, and cut features now exist as compiler-owned feature families, but the faces they create are still not first-class semantic targets.

That blocks ordinary downstream workflows like:

- sketching or cutting on shell-created walls
- targeting hole/cut-created faces with follow-on details
- keeping downstream face-driven edits stable after those features land

## Description
Implement compiler-owned face ownership and query propagation for shell, hole, and cut results on top of the topology-rewrite propagation backbone.

Scope this task to the defended subset Forge can currently support:

- shell v1 supported bases
- hole/cut v1 supported workflows
- semantic created-face queries for those feature families
- downstream `onFace()` / workplane placement against those created faces where the compiler can defend it

Primary files:

- shell/hole/cut query propagation modules
- shell/hole/cut feature modules only where integration is required
- workplane placement integration
- exact/runtime regression checks for downstream face-driven edits

## Requirements
- Expose created-face ownership and queryability for supported shell/hole/cut results.
- Preserve preserved-face queries where they remain valid.
- Reject ambiguous or unsupported created-face targeting explicitly.
- Keep both lowerers aligned with the same semantic model.
- Add regression cases where downstream features target supported created faces.
- Document the supported created-face subset honestly.

## Isolation Rule
- Consume the propagation kernel from task 160.
- Do not broaden projection replay or edge-finishing behavior in this task.
- Prefer new shell/hole/cut propagation helpers over changes to unrelated query logic.

## Dependencies
- task 160

## Parallelization
Can start immediately after task 160. Safe to run in parallel with:

- task 180
- task 190
- task 195

## Status and log
- 2026-03-12: Created for the first post-160 parallel wave.
- 2026-03-12: Completed. Added compiler-owned shell/hole/cut face resolution plus propagation-backed `Shape.face()` support for defended created-face subsets, routed non-canonical `onFace(shape, '...')` placement through those named faces, rejected ambiguous rewritten host faces explicitly, added placement/compiler regressions for shell inner walls, blind-hole floors, and cut-created walls, and updated the permanent docs plus examples to describe the supported subset honestly.

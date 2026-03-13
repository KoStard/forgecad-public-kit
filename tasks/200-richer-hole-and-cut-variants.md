# Richer Hole And Cut Variants
## Problem Definition
Forge now has a useful hole/cut v1 slice, but ordinary part-design work still needs more of the normal feature family:

- counterbores
- countersinks
- up-to-face / feature-aware extents
- patterned cut semantics that stay compiler-owned

Those workflows should not be added until created-face ownership exists for the feature family.

## Description
Expand the compiler-owned hole/cut family on top of the topology-rewrite propagation backbone and created-face ownership work.

Scope this task to a defended next subset:

- counterbore and countersink holes
- at least one feature-aware extent beyond today's simple blind/through model
- downstream ownership for created faces where the compiler can defend it

Primary files:

- hole/cut feature modules
- hole/cut lowering helpers
- exact/runtime regression checks
- capability docs

## Requirements
- Keep the feature family compiler-owned through both lowerers.
- Reuse created-face/query propagation instead of inventing local ownership rules.
- Make unsupported extents or variants explicit in diagnostics.
- Add corpus coverage for ordinary mechanical-part hole/cut workflows.
- Document the supported and unsupported variants honestly.

## Isolation Rule
- Depends on task 170's created-face work; do not re-implement that layer here.
- Avoid projection and fillet/chamfer internals.
- Keep lowerer integration thin and centered on the hole/cut family.

## Dependencies
- task 160
- task 170
- task 110

## Parallelization
Can start after task 170 lands. Safe to run in parallel with:

- task 210
- task 220

## Status and log
- 2026-03-12: Created for the second post-160 feature wave.
- 2026-03-12: Completed. Added compiler-owned counterbore/countersink `Shape.hole()` variants plus planar `upToFace` hole/cut extents, reused topology-rewrite propagation for the defended new created-face slots and termination-face ambiguity diagnostics, expanded placement/compiler/query-propagation/BREP/corpus coverage around the richer subset, and updated the permanent docs plus examples to describe the supported and unsupported workflows honestly.

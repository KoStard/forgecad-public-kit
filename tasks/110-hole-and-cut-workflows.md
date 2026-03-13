# Hole And Cut Workflows
## Problem Definition
Forge can currently express cuts through raw sketches and booleans, but it does not yet have a compiler-owned hole/cut feature family. That blocks ordinary part-design workflows and makes exact lowering coverage weaker than it should be.

## Description
Implement compiler-owned hole/cut workflows anchored to the shared face-query/workplane model.

Primary files:

- new feature module(s) for hole/cut semantics and lowering
- `src/forge/compilePlan*.ts` only for thin node/lowerer integration
- exact-export and compiler regression checks

Isolation rule:

- consume the shared query model from task 100
- do not change query semantics in this task

## Requirements
- Support a useful first subset: through hole, blind hole, and simple cutout workflows.
- Lower through both Manifold and CadQuery/OCCT from the same semantic node family.
- Add end-to-end regression coverage for exact export and runtime parity.
- Document supported and unsupported hole/cut cases honestly.

## Status and log
- 2026-03-12: Ready after task 100.
- 2026-03-12: Completed. Added compiler-owned `Shape.hole()` / `Shape.cutout()` support for the v1 subset, lowered circular through/blind holes plus `onFace()`-anchored through/blind cutouts through both backends, and covered the supported/unsupported cases with runtime, exact-export, and documentation updates.

# Richer Hole And Cut Variants
## Problem Definition
Forge now has compiler-owned hole/cut workflows for a defended ordinary subset, but daily mechanical design still needs richer variants before the architecture can honestly claim broad part-design coverage.

## Description
Extend the compiler-owned hole/cut family to cover the next everyday mechanical variants that users expect to model directly.

Primary dependencies:

- task 300

Primary files:

- `src/forge/holeCut*.ts`
- compile node/lowerer integration
- exact/runtime regression checks
- example and corpus parts

## Requirements
- Add compiler-owned support for the next defended subset of:
  - blind and through holes
  - counterbore and countersink variants
  - two-sided extents
  - drafted or tapered cuts where both lowerers can defend the behavior
  - `upToFace` style stopping for the defended descendant-query subset
- Carry thread metadata or thread-intent parameters even where modeled threads remain deferred.
- Preserve descendant ownership for floors, side walls, caps, and created edge chains in the defended subset.
- Reject unsupported cases explicitly instead of widening silently.
- Add at least one proof model such as a motor-mount or fixture plate that uses multiple hole families from the same semantic feature stack.

## Status and log
- 2026-03-13: Blocked on task 300.
- 2026-03-13: Not started.

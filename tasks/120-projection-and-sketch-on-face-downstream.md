# Projection And Sketch-On-Face Downstream
## Problem Definition
Projection-driven workflows are still not compiler-owned enough. `projectToPlane()` exists as a utility, but projection intent is not yet a first-class downstream feature path that survives through both lowerers.

## Description
Turn projection/sketch-on-face downstream flows into explicit compiler-owned semantics on top of the shared face-query backbone.

Primary files:

- projection/sketch-on-face feature modules
- `src/forge/section.ts` and related sketch placement helpers
- compiler/export regression checks

Isolation rule:

- avoid touching hole/cut feature files
- consume the shared face-query contract from task 100 instead of redefining provenance locally

## Requirements
- Make projection-driven downstream sketching inspectable in compiler diagnostics.
- Keep runtime and exact export aligned for the supported subset.
- Add regression cases that prove projection-based follow-on features survive through both lowerers.
- Update docs with what is truly supported.

## Status and log
- 2026-03-12: Ready after task 100.
- 2026-03-12: Not started.


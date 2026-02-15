# Dimension Propagation Reliability

## Problem Definition
Dimensions attached to imported components could disappear after certain API calls (for example `.color()`), causing annotations to drift or vanish in assemblies.

## Description
Make dimension propagation a core invariant of the shape system:
- dimensions must stay attached to a component through transforms/style operations
- imported dimensions must remain relative to their component instance
- propagation behavior must be centralized in one place (kernel), not patched ad-hoc in runtime

## Requirements
- Centralize dimension metadata propagation in `Shape` API implementation.
- Cover all shape-returning APIs (transform, boolean, style/copy, hull/simplify/split).
- Ensure top-level boolean helpers (`union`, `difference`, `intersection`, `hull3d`) preserve dimensions too.
- Keep import-scoped dimensions bound per imported instance.
- Remove legacy runner-level monkey-patch propagation logic.
- Add an automated invariant checker for dimension propagation.
- Add a debug CLI for rapid field diagnosis on real user scripts.

## Status and log
- 2026-02-15: Root-caused missing imported dimensions in `candidate-loft-table.forge.js` to shape metadata loss through `.color()`.
- 2026-02-15: Implemented centralized propagation in `src/forge/kernel.ts`:
  - Added shape-bound dimension storage and helpers (`setShapeDimensions`, `getShapeDimensions`).
  - Added propagation for transform/style/copy/boolean/cutting/hull/simplify methods.
  - Added propagation in global helpers (`union`, `difference`, `intersection`, `hull3d`).
- 2026-02-15: Removed runner monkey-patch propagation and switched runner to kernel APIs.
- 2026-02-15: Added `cli/check-dimensions.ts` invariant suite and script `npm run check:dimensions`.
- 2026-02-15: Added `cli/debug-dimensions.ts` and script `npm run debug:dimensions` for real-model diagnosis.
- 2026-02-15: Verified on `/Users/kostard/Projects/CAD/PersonalForgeCADProjects/candidate-loft-table.forge.js`:
  - Dimensions present and transformed correctly (`Dimensions: 14`, including imported stretchers).

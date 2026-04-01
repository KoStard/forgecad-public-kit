# Orphan Joints from Merged Assemblies

## Goal & Current State

**Problem**: When an assembly file calls `toJointsView()` and is then imported via `importAssembly()` + `mergeInto()`, the child's `toJointsView()` joints leak into the parent's global `_collected` singleton. The parent's `toJointsView()` merges on top, but the child's orphan joints remain with their unprefixed names. These orphan joints reference parts that don't exist in the parent's assembly graph, so they do nothing when the user adjusts them.

**Example**: `wooden-case.forge.js` imports `foldable_handle.forge.js`. The handle has joints "Fold Left" and "Fold Right". After merge, the case has "Handle.Fold Left" and "Handle.Fold Right" (which work). But the original "Fold Left" and "Fold Right" are still in `_collected` (they don't work).

**Root Cause**: `jointsView()` in `jointsView.ts` writes to a module-level singleton `_collected`. `executeFile()` during imports doesn't save/restore this state. The child's `toJointsView()` call pollutes the parent scope.

**Baseline**: wooden-case.forge.js has ~16 joints, roughly half are non-functional orphans.

## Architecture Summary

- `src/forge/assembly/jointsView.ts` — global `_collected: CollectedJointsView | null` singleton, mutated by `jointsView()`, read by `getCollectedJointsView()`
- `src/forge/runner.ts` — `importAssembly()` calls `executeFile()` which runs the child script; child's `toJointsView()` writes to the same global
- `jointsView()` is **additive** (merges by name via Map), so the parent's call doesn't replace the child's entries

## Fix

Save and restore `_collected` around all `executeFile()` calls in import functions (`importPart`, `importGroup`, `importAssembly`). Add `saveJointsView()` and `restoreJointsView()` to the jointsView module.

## Progress Tracker

| # | Change | Total joints | Orphan joints | Orphan couplings | Status |
|---|--------|-------------|---------------|------------------|--------|
| — | Baseline | 16 | 7 | 1 | measured |
| P1 | Save/restore jointsView around imports | 9 | 0 | 0 | ✅ |

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/assembly/jointsView.ts` | Add save/restore API |
| `src/forge/runner.ts` | Wrap executeFile calls with save/restore |

# Spectrometer Constructive Reset

## Goal

Make the spectrometer cold-start solve feel routine by constructing the obvious sketch geometry before LM begins. "Done" for this milestone means the solver has a reusable constructive layer that materially lowers cold-start error on the spectrometer and camera subproblems.

## Current State

The reattached worktree is clean because the previous uncommitted solver-reset edits were lost when the worktree disappeared. This document re-establishes the investigation from the clean branch baseline.

## Architecture Summary

The current solver has:

- staged per-constraint presolve in `solver/src/solver/mod.rs`
- a few specialized propagators for chain closure, midpoint openings, and light-locked camera placement
- no general constructive planner that recognizes solvable geometric patterns and places them directly

That leaves the spectrometer entering LM with major subsystems still underconstrained geometrically, especially the inner case and camera stack.

## Workstreams

### WS1: Constructive Core
**Deliverable**: A reusable constructive presolve module with direct geometric placements for recurring solvable patterns.
**Dependencies**: none
**Status**: done

Tasks:
- [x] Add `constructive.rs`
- [x] Implement first pattern set with isolated helpers
- [x] Wire it into `run_presolve`
- [ ] Add focused constructive tests

### WS2: Spectrometer Reconstruction
**Deliverable**: Rebuild enough constructive planning to materially improve `cold_start_with_camera` and `cold_start_full_spectrometer`.
**Dependencies**: WS1
**Status**: in progress

Tasks:
- [x] Recover point-on-line plus point-line-distance placement
- [x] Recover offset-chain and closed offset-cycle construction
- [x] Recover camera-support construction
- [x] Re-measure cold-start tests

### WS3: Commit Milestone
**Deliverable**: A verified commit containing one measured architectural improvement.
**Dependencies**: WS1, WS2
**Status**: in progress

Tasks:
- [ ] Stage verified files
- [ ] Commit with baseline and measured improvement recorded here

## Dependency Map

```text
WS1 -> WS2 -> WS3
```

## Progress Tracker

| # | Change | `cold_start_with_camera` | `cold_start_full_spectrometer` | Status |
|---|--------|--------------------------|--------------------------------|--------|
| — | Clean branch baseline | `2.930211` | `8.229009` | Baseline re-measured after worktree recovery |
| C1 | Constructive presolve module: point-line placement, offset chains, support-spanned camera | `2.209379` | `0.877097` | Spectrometer now passes; camera-only variant still underconstrained/stuck |

## Experiment Log

#### Baseline Re-Measurement (SUCCESS)
**What**: Re-ran the camera and full spectrometer cold-start tests on the clean reattached branch.  
**Result**: `cold_start_with_camera=2.930211`, `cold_start_full_spectrometer=8.229009`.  
**Why it matters**: Confirms the worktree no longer contains the earlier constructive improvements and gives us a trustworthy floor for the rebuild.  
**Lesson**: We need a committed constructive layer, not only in-memory experimentation.

#### Constructive Presolve Rebuild (SUCCESS)
**What**: Added `solver/src/solver/constructive.rs` and called it from `run_presolve`. The first pattern set directly constructs `pointOnLine + pointLineDistance`, open and closed `lineDistance` offset components, and support-spanned side lines for camera-like geometry.  
**Result**: `cold_start_full_spectrometer` improved from `8.229009` to `0.877097` and now passes its `< 1.0` expectation. `cold_start_with_camera` improved from `2.930211` to `2.209379` but still fails.  
**Why it worked**: The spectrometer stopped entering LM with the leaving point, inner case, outer camera support geometry, and inner camera shell all collapsed near the origin. The constructive layer now puts most of that geometry into the right basin before numerical optimization starts.  
**Lesson**: The architectural thesis is holding up. The next blocker is not the prism or case chain anymore; it is the camera-only underconstrained manifold and the remaining inner-camera coupling.

## Decision Log

| # | Decision | Why | Impact |
|---|----------|-----|--------|
| D1 | Rebuild the constructive layer before touching LM tuning | The failures are geometric-placement failures, not local optimizer precision failures | Keeps effort on the highest-leverage architecture |
| D2 | Recreate the work as a project/investigation doc first | The previous uncommitted work was lost | Preserves progress and measurements |
| D3 | Keep the first milestone generic instead of spectrometer-specific | The solver needs reusable constructive patterns, not a one-off demo patch | Lets the spectrometer improvement generalize to other sketches |

## Open Questions

- Which constructive pattern gives the highest leverage after prism and offset-chain placement: camera-on-support lines or inner-camera shell placement?
- Should the constructive planner become a graph pass or remain a pattern library called from presolve?
- How should we represent and solve underconstrained but valid camera-only manifolds so they land deterministically instead of stalling at `~2.21` residual?

## Files Modified

| File | Workstream | Purpose |
|------|------------|---------|
| `/Users/kostard/Projects/CAD/ForgeCAD/.agents/worktrees/solver-reset-architecture/docs/temporary/projects/2026/03/31/spectrometer-constructive-reset/PLAN.md` | WS1-WS3 | Investigation and execution tracker |
| `/Users/kostard/Projects/CAD/ForgeCAD/.agents/worktrees/solver-reset-architecture/solver/src/solver/constructive.rs` | WS1-WS2 | Constructive presolve patterns for direct geometric placement |
| `/Users/kostard/Projects/CAD/ForgeCAD/.agents/worktrees/solver-reset-architecture/solver/src/solver/mod.rs` | WS1-WS2 | Integration point for the constructive presolve pass |

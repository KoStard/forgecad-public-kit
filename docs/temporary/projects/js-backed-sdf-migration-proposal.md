# JS-Backed SDF Migration Proposal

## Summary

Current `loft()` / `sweep()` performance is dominated by JS callback SDF evaluation during `levelSet(...)` meshing. For realistic product-scale models this can take seconds to tens of seconds per regeneration.

This proposal migrates surfacing away from JS-per-sample evaluation toward native paths, while keeping compatibility with existing scripts.

## Current State

### Where time goes

- `loft()` and `sweep()` in [`src/forge/sketch/curves.ts`](/Users/kostard/Projects/CAD/ForgeCAD/src/forge/sketch/curves.ts) compile 2D loop SDFs in JS and call `levelSet(...)`.
- Per-sample SDF work includes:
  - point-in-polygon checks
  - nearest segment distance scans
  - per-segment frame checks for sweep
- This creates very high callback overhead and poor cache locality.

### Secondary costs

- High triangle counts amplify downstream costs in:
  - edge extraction (`THREE.EdgesGeometry`)
  - mesh conversion and bbox/volume union ops

## Goals

- Keep existing API (`spline2d`, `spline3d`, `loft`, `sweep`) stable.
- Deliver a large speedup for interactive regeneration (target: 5-10x on heavy curve scenes).
- Preserve fallback behavior for difficult topology cases.
- Enable quality-tiered execution (live/default/high) as a first-class concept.

## Non-Goals (for this phase)

- Full NURBS/B-rep kernel replacement.
- STEP/IGES-first workflow.
- Perfect geometric equivalence with industrial CAD surfacing in v1.

## Recommended Architecture

## 1. Add deterministic fast paths before full SDF replacement

### Loft fast path

- Preconditions:
  - all profiles have compatible winding/loop counts
  - no self-intersection after resampling
- Method:
  - normalize loops
  - resample each loop to shared vertex counts
  - stitch section strips directly into triangle bands
  - cap ends
  - feed triangles into Manifold for validity/booleans
- Fallback:
  - if preconditions fail, keep current SDF loft path

### Sweep fast path

- Preconditions:
  - profile loops valid
  - frame transport stable along path
- Method:
  - sample path in native arrays
  - generate frame-aligned profile rings
  - connect rings + cap ends
  - pass triangles to Manifold
- Fallback:
  - current SDF sweep path

Why first: this removes JS SDF callback cost for the majority of practical parts without requiring a new kernel.

## 2. Move SDF fallback evaluation out of JS

- Introduce a dedicated WASM module for field sampling + meshing:
  - input: compact profile/path arrays
  - output: mesh buffers
- Keep same API and quality knobs.
- Execute in worker when available to avoid UI stalls.

This preserves generic topology handling while avoiding JS callback overhead.

## 3. Optional long-term kernel track

- Evaluate OCCT/OpenCascade-WASM only after:
  - fast path + native fallback are shipped
  - measured gaps remain (fillet/shell/STEP-grade constraints)

This prevents a premature high-cost migration.

## Rollout Plan

### Phase A: Instrument + benchmark guardrails

- Add stage timers for:
  - profile preprocessing
  - meshing
  - manifold cleanup
- Add benchmark fixtures:
  - bottle loft shell
  - multi-profile consumer product
  - curved sweep tube with tight bends
- Add CI budget checks with regression thresholds.

### Phase B: Loft/sweep fast-path implementation

- Ship behind feature flag.
- Compare mesh validity and volume against SDF baseline.
- Auto-fallback on mismatch.

### Phase C: Native fallback mesher

- Replace JS callback SDF fallback path.
- Keep old path behind emergency flag until stable.

### Phase D: Cleanup

- Remove legacy JS fallback once parity and stability targets are met.

## Data Model Requirements

- Standardized contour representation:
  - outer loop + hole loops
  - explicit winding
  - sampled point count metadata
- Standardized path/frame representation for sweep:
  - positions
  - tangents
  - frame normals/binormals

These structures should be reusable by both fast-path and fallback meshers.

## Risks and Mitigations

- Risk: self-intersections in stitched meshes.
  - Mitigation: manifold validity checks + automatic fallback.
- Risk: visual differences vs current SDF output.
  - Mitigation: quality presets + tolerance-based comparison tests.
- Risk: large rewrite instability.
  - Mitigation: phased delivery with dual-path feature flags.

## Success Criteria

- Live regeneration of current curve-heavy examples drops from multi-second to sub-2s on typical dev hardware.
- Default-quality export is meaningfully faster than current JS SDF path.
- Fallback rate remains low on real examples.
- No regressions in manifold validity for benchmark set.

## Suggested Next Implementation Task

Start with **Loft fast path (compatible topology only)** plus automated fallback. It offers the highest immediate payoff with lowest risk and sets up reusable data structures for sweep and native fallback.

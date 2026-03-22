# OCCT Backend Purity — Eliminate Manifold Fallbacks & Opaque Plans

**Date**: 2026-03-22
**Goal**: Make the OCCT backend fully self-contained with zero Manifold dependencies. Every operation that the compile plan IR describes should be lowered to native OCCT APIs. Additionally, eliminate all `wrapOpaquePlan` usage so nothing upstream of the lowerers touches Manifold directly — everything goes through compile plan IR.

## Current State (Baseline)

`src/forge/backends/occt/lower.ts` falls back to Manifold in 5 places:

| # | Operation | Current behavior | Manifold dependency |
|---|-----------|-----------------|-------------------|
| 1 | **3D Booleans** | `hybridBooleanViaManifold()` tessellates OCCT → Manifold mesh → boolean → sentinel | `getWasm().Manifold.union/subtract/intersection` |
| 2 | **Loft** | `throw OCCTUnsupportedError('loft')` → full Manifold fallback | Caller catches, runs Manifold pipeline |
| 3 | **Sweep** | `throw OCCTUnsupportedError('sweep')` → full Manifold fallback | Caller catches, runs Manifold pipeline |
| 4 | **Hull** | `throw OCCTUnsupportedError('hull')` → full Manifold fallback | Caller catches, runs Manifold pipeline |
| 5 | **Extrude with scaleTop** | `throw OCCTUnsupportedError('extrude with scaleTop')` | Caller catches, runs Manifold pipeline |

Additionally, `wrapOpaquePlan` in `kernel.ts` wraps pre-built Manifold backends, bypassing compile plan IR:

| # | Source | Where |
|---|--------|-------|
| O1 | **library.ts** — thread(), pipe makeBend(), elbow() | Direct `getWasm().Manifold.revolve/extrude` calls |
| O2 | **kernel.ts Shape.transform()** — non-rigid matrix | Falls back to opaque when `rigidTransformStepsFromMatrix` returns null |
| O3 | **kernel.ts Shape.scale()** — degenerate scale | Falls back to opaque for zero/NaN scale |
| O4 | **kernel.ts levelSet()** — SDF function | Directly calls `wasm.Manifold.levelSet` |

## Architecture Summary

Before:
```
library.ts ──(direct Manifold calls)──> wrapOpaquePlan ──> ShapeBackend
kernel.ts  ──(transform fallback)────> wrapOpaquePlan ──> ShapeBackend
curves.ts  ──(levelSet fallback)─────> wrapOpaquePlan ──> ShapeBackend

ShapeCompilePlan (backend-agnostic IR)
    +---> occt/lower.ts ──(hybrid boolean)──> ManifoldShapeBackend sentinel
    +---> manifold/lower.ts ──> ManifoldShapeBackend
```

After:
```
All upstream code ──> ShapeCompilePlan IR (always)

ShapeCompilePlan (backend-agnostic IR)
    +---> occt/lower.ts ──> OCCTShapeBackend (always, no sentinel)
    +---> manifold/lower.ts ──> ManifoldShapeBackend
```

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline | 5 Manifold fallbacks, sentinel system, 4 opaque sources | |
| P1 | Native OCCT booleans | Removed hybrid boolean + sentinel system (~170 lines). Triggered by ams_lite_adapter.forge.js crash. Fixed multi-intersection bug (pairwise for `BRepAlgoAPI_Common`). | ✅ DONE |
| P2 | Native loft (ThruSections) | Already implemented in prior work | ✅ DONE |
| P3 | Native sweep (MakePipe) | Already implemented in prior work | ✅ DONE |
| P5 | Extrude scaleTop (ThruSections) | Already implemented in prior work | ✅ DONE |
| P4 | Hull (inline Manifold) | Throws OCCTUnsupportedError — acceptable, no OCCT convex hull API | ⚠️ DEFERRED |
| O1 | library.ts opaque removal | Rewrote thread() (twisted extrude), makeBend() (revolve), elbow() (revolve) to use compile plan IR. Added `twist`/`twistSegments` fields to extrude compile plan. | ✅ DONE |
| O2 | kernel.ts transform opaque | Replaced fragile axis/angle decomposition with `workplanePlacement` step. Non-rigid matrices now throw instead of wrapping opaque. | ✅ DONE |
| O3 | kernel.ts scale opaque | Degenerate scales now throw instead of wrapping opaque. | ✅ DONE |
| O4 | kernel.ts levelSet opaque | Removed `levelSet()` function. loft/sweep in curves.ts now require compile profile plans (throw if missing). | ✅ DONE |
| — | Remove wrapOpaquePlan | Function removed entirely — zero callers remain. | ✅ DONE |
| P6 | Remove Manifold imports from library.ts | Removed `getWasm()` and `wrapOpaquePlan` imports. | ✅ DONE |
| P7 | OCCT twist extrude | Added `lowerExtrudeWithTwist()` to OCCT lowerer using `BRepOffsetAPI_ThruSections` with rotated wire sections. | ✅ DONE |
| P8 | Backend parity tool | Created `cli/check-backend-parity.ts` — runs files with both backends, compares volume/surfaceArea/bbox, generates report. | ✅ DONE |
| — | Verification | ams_lite_adapter.forge.js: 100% parity. bolt-and-nut.forge.js: 100% parity. OCCT lowerer tests: all pass. | ✅ |

## Key Findings

### Multi-intersection bug (P1)
`BRepAlgoAPI_Common` with `SetArguments`/`SetTools` computes `A ∩ (B ∪ C)`, not `A ∩ B ∩ C`. Fixed by iterating pairwise for intersection with 3+ shapes. Caught by unit test `testBooleanMultiIntersection`.

### Transform opaque fallback (O2)
`rigidTransformStepsFromMatrix()` tried to decompose rotation matrices into axis+angle, which failed on numerical edge cases (e.g. matrices built from cross products in pipe/elbow). Fixed by using `workplanePlacement` compile plan step instead — both backends handle raw matrices natively.

### Opaque elimination principle
Nothing upstream of the lowerers should touch Manifold directly. Everything must go through compile plan IR. This ensures both backends produce equivalent results and prevents the "non-manifold OCCT mesh" error that triggered this investigation.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/backends/occt/lower.ts` | Native booleans, multi-intersection fix, twist extrude |
| `src/forge/kernel.ts` | Removed `wrapOpaquePlan`, `levelSet`; transform/scale now throw on non-rigid/degenerate |
| `src/forge/library.ts` | Rewrote thread/makeBend/elbow to use compile plan IR |
| `src/forge/compilePlan.ts` | Added `twist`/`twistSegments` to extrude plan type |
| `src/forge/backends/manifold/lower.ts` | Pass twist fields through to Manifold extrude |
| `src/forge/sketch/curves.ts` | Removed levelSet fallback, throw if compile plan missing |
| `cli/check-backend-parity.ts` | NEW — backend comparison tool |
| `cli/check-occt-lower.ts` | OCCT lowerer unit tests (68 tests) |
| `cli/forgecad.ts` | Registered backend-parity CLI command |

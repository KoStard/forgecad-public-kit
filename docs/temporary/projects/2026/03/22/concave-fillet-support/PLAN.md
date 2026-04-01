# Concave Corner Fillet Support

## Goal & Current State

**Goal**: Extend `filletCorners()` to support concave (reflex) corners, not just convex ones.

**Current state**: RESOLVED — concave fillets now work.

**Motivation**: The tape-roll-holder bracket uses waypoints at corners 2 and 6 to create an S-curve profile. These waypoints are geometrically concave, but filleting them is the intended design — the fillet adds material to smooth the inward bend.

## Architecture Summary

`filletCorners` in `src/forge/sketch/fillets.ts`:
1. Computes polygon winding (signed area)
2. For each corner spec, calls `buildCornerGeometry()` which:
   - Computes edge directions and cross product (turn)
   - Classifies as convex or concave (collinear still rejected)
   - Computes tangent points, arc center, and sweep angle
3. Replaces each sharp corner with arc points

**Key findings**:
- This is pure 2D polygon math — **nothing Manifold-specific**. Manifold has no fillet API; `filletCorners` generates arc points before any Manifold involvement.
- OCCT's `ChFi2d_FilletAlgo` handles concave corners natively, but we don't need OCCT — the math is the same for both convex and concave.
- The bisector vector `toPrev + toNext` naturally points toward the arc center for both convex and concave corners.
- Only the sweep direction differs: convex sweeps with winding, concave sweeps against it.

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline | Corner 2 throws "concave or collinear" | ❌ |
| P1 | Support concave fillets in buildCornerGeometry | sandbox.forge.js runs successfully, 4 objects, 98ms | ✅ |

## Experiment Log

#### P1: Concave fillet support (SUCCESS)
**What**: In `buildCornerGeometry()`:
1. Replaced convexity gate with convex/concave/collinear classification
2. Kept tangent point and center calculations unchanged (bisector math works for both)
3. Reversed sweep direction for concave: `sweep = -winding * interiorAngle`

**Result**:
- sandbox.forge.js renders all 4 objects (bracket + 3 dowels)
- Arc geometry verified: center is exactly `radius` distance from both tangent points
- Corner 2 (turn=-0.22, angle=167.2°) and corner 6 (turn=-0.80) both fillet correctly
- Check suite: same 7 pre-existing failures, 5 passes — no regressions

**Why it worked**: The existing math already handled concave corners correctly — only the sweep direction needed flipping. The bisector `toPrev + toNext` for a concave corner naturally points outward into the concavity (where the arc center belongs).

**Lesson**: The original convexity restriction was overly conservative. The tangent-point geometry is symmetric with respect to convexity; only the arc traversal direction differs.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/fillets.ts` | Removed convexity-only restriction, added concave sweep reversal |

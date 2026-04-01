# Architecture Purity Refactoring

**Goal**: Enforce strict backend separation — the API and IR are backend-agnostic, each backend lives in its own directory, no cross-backend conversions.

## Architecture (Target)

```
User Script (.forge.js)
    |
    v
ShapeCompilePlan IR  (src/forge/compilePlan.ts — backend-agnostic)
    |
    +---> backends/manifold/lower.ts ---> ManifoldShapeBackend
    |
    +---> backends/occt/lower.ts -------> OCCTShapeBackend
    |
    v
ShapeBackend interface  (src/forge/shapeBackend.ts — CAD operations only)
    |
    v
geometryArrays.ts  (pure math → typed arrays)
    |
    v
meshToGeometry.ts  (typed arrays → THREE.BufferGeometry)
    |
    v
Viewport.tsx  (React Three Fiber)
```

## Progress Tracker

| # | Change | Status | Commit |
|---|--------|--------|--------|
| 1 | Repo structure: `backends/manifold/` + `backends/occt/` | DONE | `a5156aa` |
| 2 | Remove `requireManifold()` from ShapeBackend interface | DONE | `7ca428e` |
| 3 | Route booleans through backend abstraction | DONE | `df6b70d` |
| 4 | Opaque compile plan + eliminate ternary fallbacks | DONE | `0bed24b` |
| 5 | Remove Manifold-only ops from public API (smoothOut, refine, warp, levelSet, minGap, simplify) | DONE | `274f02a` |
| 6 | Move WASM singleton to `backends/manifold/wasm.ts` | DONE | `5b55496` |
| 7 | Move edgeSegmentFeatures + loftStitched into backend layer | DONE | `c590bb2` |
| 8 | OCCT native loft/sweep/scaleTop + CLI --backend flag | DONE | `37555fb` |
| 9 | Clean ShapeBackend interface docs | DONE | uncommitted |
| 10 | Backend-agnostic 3MF export | IN PROGRESS | agent |
| 11 | FrozenShape backend-aware thaw | IN PROGRESS | agent |
| 12 | ProfileBackend abstraction (Sketch/CrossSection) | IN PROGRESS | agent |
| 13 | Remove backward-compat re-export shims | PENDING | — |
| 14 | Final audit: zero manifold-3d outside backends/ | PENDING | — |
| 15 | Verify Three.js viewport interactivity | PENDING | — |

## What Was Removed from Public API

These were Manifold mesh-manipulation concepts with no CAD equivalent:
- `Shape.smoothOut()` — mesh edge smoothing
- `Shape.refine()` / `refineToLength()` / `refineToTolerance()` — mesh subdivision
- `Shape.warp()` — vertex deformation
- `Shape.simplify()` — mesh decimation (Sketch.simplify kept — it's 2D path simplification)
- `levelSet()` — SDF marching cubes
- `Shape.minGap()` — Manifold-specific search parameter

## What Was Kept

Proper CAD operations that both backends implement:
- Primitives: box, cylinder, sphere
- Features: extrude, revolve, loft, sweep, fillet, chamfer, shell, hole, cut
- Booleans: union, difference, intersection
- Transforms: translate, rotate, scale, mirror, transform
- Cutting: split, splitByPlane, trimByPlane
- Hull: convex hull
- Queries: boundingBox, volume, surfaceArea, isEmpty, numTri
- Extraction: getMesh, slice, project

## Key Design Decisions

1. **Opaque compile plan** — operations that can't be represented in the IR (e.g., sheet metal bends in library.ts) use `{ kind: 'opaque', backend: ShapeBackend }`. This allows them to participate in the compile plan chain but they carry a pre-built backend.

2. **No OCCT→Manifold fallback** — if OCCT can't do an operation, it throws. No silent conversion.

3. **ShapeBackend interface is CAD-only** — no mesh manipulation methods. Mesh methods stay on the concrete backend classes.

4. **Backend dispatch in edgeSegmentFeatures** — fillet/chamfer dispatches to OCCT's BRepFilletAPI or Manifold's mesh-based approach depending on the active backend.

## Files Modified

See `git diff --stat mainline..HEAD` for full list.

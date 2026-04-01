# SDF Sharp Feature Preservation — Investigation (ABANDONED)

**Status**: Approach abandoned. Gradient-based vertex classification + planar projection works for axis-aligned boxes but breaks for any SDF involving curved surfaces. The fundamental assumption (features are locally planar) is too restrictive for general SDF.

## Goal

SDF meshes should have sharp corners and straight edges where the underlying SDF defines them (e.g., a box should have 90-degree corners, not triangulated blobs).

## Problem

Manifold's `levelSet()` (Marching Tetrahedra) places vertices at zero-crossings along grid edges. Near sharp features:
1. **Edges**: vertices are correctly ON the edge but form a staircase pattern
2. **Corners**: no vertex exists at the actual corner point — multiple vertices cluster nearby on adjacent edges

The existing Laplacian smoothing (`sdfSmooth.ts`) treats all vertices equally, rounding off edges and corners.

## Architecture Context

```
SDF Node Tree → compileSdfNode() → evaluator fn
  → Manifold.levelSet(negated, bounds, edgeLength, 0)
  → Marching Tetrahedra mesh (body-centered cubic grid)
  → smoothSdfMesh()  ← post-processing lives here
  → Final Shape
```

- `sdfEval.ts`: negative = inside, positive = outside (standard math SDF)
- `Manifold.levelSet()`: positive = inside — bridge negation in `lower.ts:451`
- `smoothSdfMesh` receives the standard-convention evaluator

## Approach Tried: Gradient Clustering + Planar Projection

Classify each mesh vertex as smooth/edge/corner by sampling the SDF gradient from 14 directions (6 axis-aligned + 8 cube corners), clustering the normals, then applying different smoothing:

- **Smooth**: full Laplacian + SDF projection (unchanged)
- **Edge**: constrain Laplacian to edge tangent direction only
- **Corner**: freeze position, project to intersection of 3 face planes (Cramer's rule)

### What Worked

- **Box corners snapped to exact positions**: `(-10, -9.9, -9.9) → (-10, -10, -10)` with dist=0.000000
- **3-plane intersection solver**: for locally planar corners (box), finding the intersection of 3 face planes via Cramer's rule gives the exact corner point
- **Linear independence check**: using cross product magnitude to distinguish edge (rank 2) from corner (rank 3) — cluster COUNT is unreliable because edge diagonals create false clusters

### Why It Failed

**The planar assumption breaks for curved surfaces.** The approach assumes:
- Edges are straight lines (intersection of 2 planes)
- Corners are points (intersection of 3 planes)

This is true for boxes but false for:
- `smoothDifference(box, sphere)` — the boolean boundary follows the sphere's curvature
- `intersection(gyroid, sphere)` — edges are curved where the sphere clips the gyroid
- Any sharp boolean between curved primitives

When applied to these cases, the planar projection straightens curved edges and creates pointy artifacts.

Attempts to fix this via tree analysis (skip feature detection for smooth-only trees) helped for pure-smooth cases but couldn't handle mixed cases like `smoothDifference(box, sphere)` where the box edges are planar but the boolean boundary is curved.

## Experiment Log

### E1: Gradient Clustering by Count (FAILED)

**What**: Cluster sampled normals. 1 cluster = smooth, 2 = edge, 3+ = corner.

**Result**: 1188 "corner" vertices — entire edges misclassified.

**Root cause**: Edge vertices produce 3 clusters (2 face normals + diagonal average). Cluster count doesn't distinguish edge diagonals from genuine third-face normals.

### E2: Linear Independence Check (PARTIAL)

**What**: Check linear independence via cross products instead of cluster count.

**Result**: Edges correctly identified, 0 corners detected.

**Root cause**: Probe radius (0.8× avgEdgeLen = 0.13mm) too small to reach the third face from near-corner vertices (0.2mm away from true corner).

### E3: Large Probe Radius 3× (REGRESSION)

**What**: Probe at 3× avgEdgeLen. Noise threshold lowered to 10%.

**Result**: Box corners perfect. **Gyroid lattice volume +19.6%** — 104K of 228K vertices misclassified as corners.

**Root cause**: Probes cross thin gyroid walls (1.2mm thickness vs 0.95mm probe). TPMS saddle points have genuine gradient direction changes that look like features.

### E4: Tree-Aware Detection + 1.5× Probe (PARTIAL)

**What**: Walk SDF node tree to detect if sharp features are possible. Skip classification for smooth-only trees. Reduce probe to 1.5×.

**Result**: Gyroid lattice fixed (within 0.15% of baseline). Box corners still perfect.

**Root cause of final failure**: `smoothDifference(box, sphere)` has the box as a child with sharp features → triggers classification → the curved boolean boundary gets projected onto planes → pointy artifacts on what should be smooth curves.

### E5: Sharp Booleans Propagate Child Sharpness (FAILED)

**What**: Changed tree walker so sharp booleans only trigger if children have sharp features.

**Result**: Gyroid lattice fully smooth. But `smoothDifference(box, sphere)` still has artifacts — the box's own edges are planar features, but the edge projection also catches the curved boolean boundary.

**Root cause**: Can't distinguish "this vertex is on a planar box edge" from "this vertex is on a curved boolean boundary" using gradient sampling alone. Both show gradient direction changes.

## Key Discoveries (preserved for future work)

1. **Marching Tet never creates corner vertices**: The grid has no edge crossing at the exact corner point. Zero-crossings are always along grid edges, which can only catch one face at a time.

2. **`sdBox` gradient at corners is the diagonal**: `grad = (±0.577, ±0.577, ±0.577)`. Gradient-based projection at corners always moves along the diagonal, never toward the actual corner. Need a different projection strategy (3-plane intersection works for boxes).

3. **Cluster count ≠ feature type**: Edge vertices produce 3 gradient clusters (2 face normals + diagonal average). Must check linear independence (cross product magnitude > 0.3), not count.

4. **Probe radius is the hardest parameter**: Too small → corners not detected. Too large → thin-wall false positives. No single value works across all mesh densities and wall thicknesses.

5. **Multiple vertices snapping to the same point**: When 10+ near-corner vertices snap to one point, creates zero-area triangles. Manifold handles this but it's topologically messy.

6. **SDF smooth operations (smin/smax) don't help**: They smooth the distance field transition but don't tell the mesher where features are. The information about "this is a sharp edge" is lost at the SDF level.

## Possible Alternative Approaches (not attempted)

1. **Dual Contouring** instead of Marching Tet: places one vertex per grid cell using QEF (Quadric Error Function) minimization. Naturally captures sharp features. Would require replacing/extending Manifold's `levelSet()`.

2. **Feature-sensitive remeshing** as a separate pass: after marching tet, detect edges via mesh dihedral angles (not SDF gradient), then remesh with edge constraints. Doesn't assume planarity.

3. **Higher resolution near features**: adaptive grid refinement near SDF edges (where `|∇SDF|` has high curvature). More expensive but doesn't change the algorithm.

4. **Hybrid approach**: use Manifold's `levelSet()` for smooth regions, B-rep for sharp features, then stitch. Complex but theoretically correct.

5. **Accept the triangulation, fix at display time**: use mesh edge detection (dihedral angle threshold) to identify sharp edges, then render with crease normals. Doesn't fix the geometry but fixes the visual appearance.

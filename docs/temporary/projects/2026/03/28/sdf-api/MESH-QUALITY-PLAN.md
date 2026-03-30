# SDF Mesh Quality Improvement — PLAN

**Status**: Deep investigation complete. Three approaches ranked by viability. Ready to implement.

---

## Problem

SDF shapes from `Manifold.levelSet()` have poor triangle quality:
- Triangles follow grid axes, not surface curvature
- Random aspect ratios (slivers mixed with large triangles)
- Staircase patterns on curved surfaces
- Uniform density everywhere — flat areas get same triangle count as curved areas

Root cause: Marching Tetrahedra on a uniform body-centered cubic grid. No post-processing.

## Failed Approach: smoothOut() + refineToLength()

**What was tried**: Coarser initial levelSet grid (3x) → `smoothOut()` → `refineToLength(edgeLength)`.

**Performance was great**: 2.3x faster, 30% fewer triangles, volumes accurate.

**Quality was BROKEN**: `smoothOut()` completely distorted the geometry. The triangles were still there but the shapes were visually wrong — `smoothOut()` generates tangent vectors that assume the mesh approximates a smooth manifold, but a raw level-set mesh has **no curvature information** baked in. The tangents interpolate between grid-aligned vertices, creating bulging/shrinking artifacts that destroy the intended SDF surface.

**Key insight**: `smoothOut()` is designed for meshes that already approximate a smooth surface (like a subdivided icosphere). A marching-tetrahedra mesh has vertices placed at zero-crossings of a grid — the vertex positions encode the SDF surface precisely, but the mesh *topology* (edge connectivity) is arbitrary grid structure. `smoothOut()` treats the topology as meaningful curvature signal, which it isn't.

## What NOT to try

- `smoothOut()` on raw level-set output — distorts geometry (proven, reverted)
- `smooth()` (static constructor) — same issue, requires a mesh with meaningful topology

---

## Genius Simplification: SDF Gradient = True Surface Normal

### The realization

`smoothOut()` failed because it **guessed** normals from grid-aligned mesh topology — garbage in, garbage out. But we already have perfect curvature information: **the SDF function itself**. The gradient of the SDF at any point on the surface IS the exact surface normal. We were sitting on the answer the whole time.

### Why this changes everything

The problem was never "Manifold can't produce smooth meshes." Manifold has excellent smoothing infrastructure (`smoothByNormals` + `refineToTolerance`). The problem was that `smoothOut()` derives normals from mesh topology — which is meaningless for a grid-aligned level-set mesh. We need to **supply** the correct normals instead of letting Manifold guess them.

### The approach

Manifold provides all the pieces:

1. **`setProperties(numProp, propFunc)`** — Calls a function for each vertex with its position. We compute the SDF gradient via finite differences at that position and store it as normal properties (channels 3, 4, 5).

2. **`smoothByNormals(normalIdx)`** — Uses the supplied per-vertex normals (not guessed from topology) to generate halfedge tangent vectors. These tangents encode the true surface curvature.

3. **`refineToTolerance(tolerance)`** — Adaptively subdivides: tight curves get more triangles, flat areas stay coarse. Because the tangent vectors now reflect the real SDF surface, the interpolated vertices land ON the true surface.

```
levelSet(coarse grid)  →  setProperties(SDF gradient normals)  →  smoothByNormals(3)  →  refineToTolerance(0.1)
     fast                    cheap (3 SDF evals/vertex)              no geometry change        adaptive subdivision
```

### Why it's the right solution

- **No custom backend**: Uses Manifold's existing API — `setProperties`, `smoothByNormals`, `refineToTolerance`. Zero new meshing code.
- **No OCCT, no NURBS**: The SDF function is the source of truth for curvature. We don't need a different representation — we need to tell Manifold what we already know.
- **Coarser initial grid = faster**: Fewer SDF evaluations in the expensive `levelSet()` step. The refinement adds vertices only where curvature demands it.
- **Correct by construction**: SDF gradient is the exact normal (for true SDFs). No heuristics, no magic numbers.
- **Pattern**: "Move the boundary" — move curvature knowledge from topology (where it's wrong) to SDF gradient (where it's exact).

## Gradient Normals Approach: Tested, Partially Failed

### Attempt 1: Coarse grid (3x) + gradient normals + refineToLength
- **Performance**: 3x faster (1,800ms vs 5,400ms)
- **Volumes**: accurate (within 1%)
- **Quality**: BROKEN for thin features. Gyroid pores disappeared because the 3x coarser grid doesn't capture thin walls at all. smoothByNormals can improve vertex placement but can't recover topology that was never captured.
- **Lesson**: Coarsening only works for shapes with features larger than the coarse grid cell. TPMS lattices with wall thickness < coarseEdge are destroyed.

### Attempt 2: Same grid + gradient normals + refine(2) (no coarsening)
- **Performance**: 3x SLOWER (15.9s vs 5.4s). refine(2) quadruples every triangle on an already-dense mesh.
- **Quality**: Not tested visually due to performance.
- **Lesson**: Adding triangles to an already-dense mesh is pure waste. The optimization must come from using fewer initial triangles, not adding more.

### Attempt 3: Same grid + calculateNormals (no SDF gradient, no refine)
- **Performance**: 2x slower (8.5s) due to calculateNormals overhead on dense mesh.
- **Quality**: Marginally better shading, but fundamentally same triangle positions.
- **Critical discovery**: The ForgeCAD renderer (`geometryArrays.ts` line 127) computes its OWN smooth normals via `computeAutoSmoothNormals()`. It does NOT use Manifold's vertex property normals. So all the `calculateNormals` / `smoothByNormals` work is invisible to the user.

### Key Learning

**Manifold's smoothing/normal pipeline is irrelevant for ForgeCAD's visual quality.** The renderer recomputes normals from triangle geometry. The only thing that matters is **vertex positions** — where the triangles actually sit. To improve visual quality, we must either:
1. Move existing vertices to better positions (e.g., Laplacian smoothing with SDF projection)
2. Use more initial vertices (finer edgeLength)
3. Use a fundamentally different meshing algorithm that produces better triangle layouts

### Why the genius simplification was wrong

The insight "SDF gradient = true surface normal → supply to Manifold" was technically correct but practically irrelevant because:
1. ForgeCAD's renderer ignores Manifold's normals (computes its own)
2. `smoothByNormals` only affects tangent vectors for future `refine()` calls — not existing vertex positions
3. Any `refine()` either quadruples cost (on full-res mesh) or destroys thin features (on coarse mesh)

The simplification treated the problem as a **normal/shading** problem. It's actually a **vertex placement** problem. Manifold's marching tetrahedra places vertices at grid-aligned zero-crossings. The resulting vertex positions are correct (on the SDF surface) but their spatial distribution (grid pattern) creates ugly triangulation regardless of normals.

## Deep Investigation (2026-03-28)

### Why Manifold produces bad SDF meshes

Manifold's `levelSet()` uses **Marching Tetrahedra on a body-centered cubic grid**. This algorithm:
1. Evaluates the SDF at every grid point
2. Finds zero-crossings along grid edges (linear interpolation)
3. Places vertices at those zero-crossings
4. Connects them into triangles using a lookup table

The vertices are mathematically correct (they lie on the SDF surface) but their **spatial distribution** is determined entirely by the grid structure — not by surface curvature. Result: axis-aligned triangle patterns, slivers, staircase artifacts on curves, uniform density everywhere.

This is not a bug — it's a fundamental property of grid-based isosurface extraction. The same issue affects Marching Cubes.

### What the industry uses instead

**libfive** (Matt Keeter, original F-rep kernel) and **Fidget** (Keeter's 2025 Rust successor) both use **Manifold Dual Contouring** — a fundamentally different algorithm that:
- Places one vertex per cell at the optimal position (minimizing QEF using SDF gradients)
- Preserves sharp features (edges, corners) naturally
- Produces dramatically better triangle quality

This is the standard approach in implicit CAD. nTop, Altair Inspire, and other commercial tools use similar algorithms.

### Critical discovery: Manifold supports mesh round-tripping

Manifold provides a **lossless mesh round-trip**: `getMesh()` → modify → `new Manifold(mesh)`. Even simpler: `manifold.warp(fn)` allows per-vertex modifications directly on the Manifold object. This means we can post-process vertex positions without leaving the Manifold ecosystem.

ForgeCAD already uses this pattern:
- `shapeBackend.ts:54-56` — `warp()` for per-vertex deformation
- `shapeBackend.ts:130-152` — `reconstructBackendFromMesh()` builds Manifold from raw mesh
- `lower.ts:319,349` — `getMesh()` for edge extraction in fillet/chamfer

### Why ForgeCAD's renderer makes this worse

`geometryArrays.ts:126` computes auto-smooth normals via `computeAutoSmoothNormals()`. This averages face normals for faces sharing a vertex within a **30° dihedral angle threshold**. On a grid-aligned mesh, many adjacent faces have dihedral angles > 30°, so the renderer treats grid artifacts as sharp creases — amplifying the visual problem. Manifold's property normals are completely ignored.

---

## Ranked Solutions

### Solution 1: Laplacian Smoothing + SDF Projection (RECOMMENDED)

**The insight**: Vertices are on the correct surface but in grid-aligned positions. Move them to better positions while keeping them on the surface.

**Algorithm** (per iteration):
1. For each vertex, compute the average position of its mesh neighbors (Laplacian)
2. Move vertex partway toward that average (damping factor λ ≈ 0.5)
3. Evaluate the SDF at the new position
4. Project back onto the SDF surface: `newPos -= sdf(newPos) * gradient(newPos)`

**2-3 iterations** should suffice. Each iteration costs ~1 SDF eval per vertex (cheap compared to the thousands of evals in `levelSet()` itself).

**Implementation**: Use `manifold.warp()` which calls a function on each vertex position in-place. After warping, the Manifold automatically validates the result. Alternatively, extract via `getMesh()`, modify the `vertProperties` Float32Array, reconstruct via `new Manifold(mesh)`.

**Pros**:
- Uses existing Manifold API — zero new dependencies
- Preserves all topology (same triangle count, same connectivity)
- Preserves thin features (unlike coarsening)
- Cheap: ~3 SDF evals per vertex × 2-3 iterations
- Can be tuned: more iterations = smoother, fewer = faster

**Cons**:
- Needs neighbor adjacency info (must extract from `triVerts`)
- `warp()` doesn't give neighbor info — may need `getMesh()` round-trip
- Won't improve triangle *count* distribution (uniform density remains)

**Estimated complexity**: ~100 lines of code.

### Solution 2: Surface Nets via `isosurface` npm package

**The insight**: Use a different isosurface extraction algorithm that produces better vertex placement natively.

The `isosurface` npm package implements **Surface Nets** (Naive Surface Nets) — an algorithm that:
- Places vertices at the centroid of edge-crossing points within each cell
- Produces naturally smoother meshes than Marching Cubes/Tetrahedra
- Fewer triangles for the same quality
- Faster than Marching Tetrahedra

**Implementation**: Replace `Manifold.levelSet()` with `isosurface.surfaceNets()` for SDF shapes, then wrap the result into a Manifold via `new Manifold(mesh)`.

**Pros**:
- Better vertex placement by design
- Existing npm package, proven in web projects
- Smaller meshes (fewer redundant triangles)

**Cons**:
- External dependency
- Surface Nets can produce non-manifold vertices (would need validation/repair)
- May not be as robust as Manifold's battle-tested implementation
- Still grid-based — better than Marching Tetrahedra but not feature-preserving

**Estimated complexity**: ~150 lines + dependency.

### Solution 3: Dual Contouring (custom implementation)

**The insight**: This is what libfive and Fidget use. It's the gold standard for SDF meshing.

**Algorithm**:
1. Evaluate SDF on a grid
2. Find sign-change edges
3. For each cell with sign changes, solve a QEF (Quadratic Error Function) using SDF gradients to find the optimal vertex position
4. Connect vertices across cell boundaries

**Pros**:
- Best theoretical quality — feature-preserving, optimal vertex placement
- Adaptive resolution possible (octree)
- Used by all serious SDF tools

**Cons**:
- Significant implementation effort (~500-1000 lines)
- QEF solver needed (SVD or eigendecomposition)
- Can produce non-manifold output — needs careful implementation
- Octree variant adds complexity

**Estimated complexity**: 500-1000 lines, or find a JS/WASM implementation to adapt.

### Not recommended

- **Finer edgeLength alone** — trades performance for quality linearly. A 2x improvement needs 8x more SDF evals (cubic). Not sustainable.
- **Manifold `tolerance` parameter** (5th arg of `levelSet()`) — only affects accuracy of zero-crossing placement, not the grid pattern.
- **`smoothOut()` / `smoothByNormals()`** — proven to fail (distorts geometry or is invisible to renderer).
- **OCCT/NURBS backend** — massive complexity for this problem. SDF is inherently non-analytic; NURBS fitting would be lossy and fragile.
- **Custom Marching Cubes/Tetrahedra** — same fundamental issue as Manifold's, just reimplemented.

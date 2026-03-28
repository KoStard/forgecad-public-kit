# Smooth Surface & Curve Capabilities

## Status

| Priority | Feature | Status | Notes |
|----------|---------|--------|-------|
| P0 | Variable-Section Sweep | Done | `variableSweep()` — interpolates between profiles along spine |
| P1 | Loft Along Spine | Done | `loftAlongSpine()` — loft profiles positioned along arbitrary 3D curve |
| P2 | Smooth Normals | Done | Auto-smooth normals for Manifold meshes based on dihedral angle |
| P3 | Surface Patch (Coons) | Done | `surfacePatch()` — fill 4 boundary curves with smooth surface |

## P0: Variable-Section Sweep

### Implementation
- Added `variableSweep(spine, sections, options)` API
- New `variableSweep` compile plan kind throughout the pipeline
- SDF interpolation: at each point along the sweep path, the arc-length t parameter determines which profile SDFs to blend between
- Uses linear interpolation of signed-distance fields between bracketing sections

### Key design decisions
- Arc-length parameterization ensures uniform blending regardless of spine curvature
- Sections sorted by `t` at API level — user can provide in any order
- Only supported on Manifold backend (level-set meshing); OCCT throws clear error

### Test result
- `variable-sweep-test.forge.js`: tapered tube along curved spine, vol=6816mm3, bbox reasonable
- Smooth transitions between small and large circular profiles

## P1: Loft Along Spine

### Implementation
- Added `loftAlongSpine(profiles, spine, tValues, options)` API
- Reuses the variable sweep infrastructure: positions each profile at its spine station point
- Each profile is oriented perpendicular to the spine tangent using the sweep frame builder

## P2: Smooth Normals for Manifold

### Implementation
- Modified `computeGeometryArrays()` in `geometryArrays.ts`
- When no B-rep vertNormals provided (Manifold path), computes smooth normals by averaging face normals at shared vertices
- Uses dihedral angle threshold (30 degrees) to detect "smooth" vs "sharp" edges
- Sharp edges (angle > threshold) keep flat normals; smooth edges average

## P3: Surface Patch (Coons Patch)

### Implementation
- Added `surfacePatch(curves, options)` that takes 4 boundary curves
- Generates interior points using bilinear Coons patch interpolation
- Triangulates the patch and creates a thin solid via offset/thickening

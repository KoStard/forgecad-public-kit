# Smooth Surface & Curve Capabilities

## Status

| Priority | Feature | Status | Notes |
|----------|---------|--------|-------|
| P0 | Variable-Section Sweep | Done | `variableSweep()` — interpolates between profiles along spine |
| P1 | Loft Along Spine | Done | `loftAlongSpine()` — loft profiles positioned along arbitrary 3D curve |
| P2 | Smooth Normals | Done | Auto-smooth normals for Manifold meshes based on dihedral angle |
| P3 | Surface Patch (Coons) | Done | `surfacePatch()` — fill 4 boundary curves with smooth surface |

## Showcase

`examples/api/smooth-surfaces-showcase.forge.js` demonstrates all 3 new APIs:
- Organic Bone (variableSweep): vol=2077mm3
- Tapered Wing (loftAlongSpine): vol=3383mm3
- Saddle Panel (surfacePatch): vol=509mm3

## P0: Variable-Section Sweep

### API
```js
variableSweep(spine, [
  { t: 0.0, profile: smallProfile },
  { t: 0.5, profile: largeProfile },
  { t: 1.0, profile: smallProfile },
], { edgeLength: 0.6, samples: 64 });
```

### Implementation
- Added `variableSweep(spine, sections, options)` API in `curves.ts`
- New `variableSweep` compile plan kind throughout the pipeline (15+ files)
- SDF interpolation in `loftSweepLowering.ts`: at each point along the sweep path, the arc-length t parameter determines which profile SDFs to blend between
- Uses linear interpolation of signed-distance fields between bracketing sections

### Key design decisions
- Arc-length parameterization ensures uniform blending regardless of spine curvature
- Sections sorted by `t` at API level — user can provide in any order
- Only supported on Manifold backend (level-set meshing); OCCT throws clear error

### Test result
- `variable-sweep-test.forge.js`: tapered tube along curved spine, vol=6816mm3
- `smooth-surfaces-showcase.forge.js`: bone-like shape, vol=2077mm3

## P1: Loft Along Spine

### API
```js
loftAlongSpine(
  [rootProfile, midProfile, tipProfile],
  spineCurve,
  [0.0, 0.5, 1.0],
  { edgeLength: 0.6 },
);
```

### Implementation
- Added `loftAlongSpine(profiles, spine, tValues, options)` API in `curves.ts`
- Thin wrapper over `variableSweep` — converts profile array + tValues to sections
- Each profile is oriented perpendicular to the spine tangent using the sweep frame builder

### Test result
- `loft-along-spine-test.forge.js`: wing-like shape, vol=8410mm3
- Works but level-set meshing can be slow for large bounding boxes (120s for wing example)

## P2: Smooth Normals for Manifold

### Implementation
- Added `computeAutoSmoothNormals()` in `geometryArrays.ts`
- When no B-rep vertNormals provided (Manifold path), computes smooth normals by averaging face normals at shared vertices
- Uses dihedral angle threshold (30 degrees): faces with angle < 30 degrees share smooth normals; faces with angle > 30 degrees keep flat normals
- Uses Manifold's merge tables for canonical vertex mapping

### Design
- Angle-based smooth groups: each (triangle, vertex) pair gets a normal that averages all adjacent triangle face normals within the smooth threshold
- This is the standard approach used by Blender, Three.js, etc.
- No user-facing API change — automatic for all Manifold-backend shapes

## P3: Surface Patch (Coons Patch)

### API
```js
surfacePatch({
  bottom: spline3d([...]),
  top: spline3d([...]),
  left: spline3d([...]),
  right: spline3d([...]),
}, { resolution: 24, thickness: 0.8 });
```

### Implementation
- Added `surfacePatch(curves, options)` in new file `sketch/surfacePatch.ts`
- Bilinear Coons patch interpolation: `P(u,v) = Lc(u,v) + Ld(u,v) - B(u,v)`
- Creates watertight solid by offsetting surface along normals (front + back + side walls)
- Direct mesh construction (no level-set) — very fast (<100ms)
- Uses `importedMesh` sentinel compile plan for downstream compatibility

### Test result
- `surface-patch-test.forge.js`: saddle-shaped panel, vol=957mm3, 50ms
- `smooth-surfaces-showcase.forge.js`: saddle panel, vol=509mm3

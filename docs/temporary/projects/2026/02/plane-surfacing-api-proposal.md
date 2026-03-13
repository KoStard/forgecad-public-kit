# Plane-Grade Surface Modeling in ForgeCAD: API Strategy

Date: 2026-02-28

## Context

Goal: make ForgeCAD capable of designing aircraft-like geometry (fuselage, wing, fillets, fairings), where forms are driven by smooth cross-sections and guide curves rather than only primitive booleans.

Current API strengths are excellent for mechanical CSG, but aerodynamic surfacing is still constrained.

## What Limits Us Today

### 1) No true profile interpolation in 3D

`Sketch` supports `extrude()` and `revolve()`, but not native loft/sweep between arbitrary sections:

- `src/forge/sketch/extrude.ts`
- `src/forge/sketch/core.ts`

This is the primary blocker for fuselage and wing design.

### 2) Sketch geometry is mostly polygonal/linear

The core 2D APIs (`polygon`, `path().lineTo()`, etc.) are strong, but there is no first-class spline/Bezier pipeline:

- `src/forge/sketch/primitives.ts`
- `src/forge/sketch/path.ts`

For aircraft surfaces, spline-backed sections and rails are mandatory.

### 3) Surface blending is approximate

Current fillet/chamfer support is intentionally approximate and limited:

- `src/forge/sketch/fillets.ts`

This is useful for mechanical edges, but not for fair aerodynamic blends.

### 4) Topology tracking drops after general booleans

Tracked naming is great for simple extrusions, but arbitrary operations clear topology:

- `src/forge/sketch/topology.ts`

For complex surfacing, we need stable naming at least for section stations/rails/features.

## Product Direction: What a Plane Workflow Needs

At minimum, a code-first aircraft workflow should support:

1. Section curves at stations (`x = 0`, `x = 500`, ...).
2. Guide/rail curves for leading/trailing edge control.
3. Lofting with continuity options.
4. Surface-first modeling (shells/panels), then optional thickening to solids.
5. Local blends/fairings between body regions.
6. Repeatable naming (stations, rails, patches) for downstream edits.

## Proposed API Evolution

## A) Curves as first-class objects

Introduce:

- `Curve2D`
- `Curve3D`

Factories:

- `spline2d(points, opts?)`
- `bezier2d(controlPoints, opts?)`
- `spline3d(points, opts?)`
- `bezier3d(controlPoints, opts?)`

Core methods:

- `.sample(count | { maxSegLen?, tolerance? })`
- `.length()`
- `.pointAt(t)`
- `.tangentAt(t)`
- `.transform(...)`

Why first: loft/sweep quality depends on robust curve sampling and parameterization.

## B) Surface as a first-class modeling target

Introduce:

- `Surface` class

Core methods:

- `.toShape({ cap?: boolean })`
- `.thicken(distance, opts?)`
- `.trimByPlane(...)`
- `.offset(distance)` (v2)
- `.analyze({ zebra?, curvature? })` (v2, optional diagnostics)

This avoids forcing every freeform operation to become a solid immediately.

## C) Loft and sweep APIs (v1)

Primary additions:

```js
loft({
  sections: Array<{ at: number; profile: Sketch | Curve2D; transform?: TransformInput }>,
  rails?: Curve3D[],
  continuity?: 'G0' | 'G1',
  closed?: boolean,
  cap?: boolean,
  sampling?: { sectionSamples?: number; railSamples?: number; adaptive?: boolean },
}): Surface
```

```js
sweep({
  profile: Sketch | Curve2D,
  path: Curve3D,
  frame?: 'frenet' | 'rmf',
  twist?: number | ((t) => number),
  scale?: number | ((t) => number),
  cap?: boolean,
  sampling?: { pathSamples?: number; profileSamples?: number; adaptive?: boolean },
}): Surface
```

Notes:

- Start with polygonized approximation over Manifold-friendly meshes.
- Keep API stable so backend can later be upgraded without user script rewrites.

## D) Domain helpers for aircraft design (v1.5)

Build thin helpers on top of loft/sweep (not in kernel):

- `airfoil(nameOrPoints, chord, opts?) -> Sketch`
- `wing({ root, tip, span, sweep, dihedral, twistDist, airfoilDist }) -> Surface`
- `fuselage({ stations, rails, symmetry? }) -> Surface`

This gives immediate practical value without bloating core primitives.

## Implementation Plan (Pragmatic, Incremental)

### Phase 1: Curves + sampling infrastructure

- New curve modules under `src/forge/sketch/curves.ts` (or `src/forge/curves/`).
- Deterministic resampling and arc-length parameterization.
- Runner export wiring (`src/forge/runner.ts`, `src/forge/headless.ts`).

### Phase 2: Basic loft (section-only)

- Loft between sampled closed sections.
- Vertex correspondence strategy:
  - Normalize winding.
  - Align seam by closest-point or angle anchor.
  - Resample to equal point count.
- Build manifold mesh via polygon strips + caps.

### Phase 3: Rail-guided loft + sweep

- Add rail constraints for section orientation and scaling along span.
- Implement RMF frame option for sweep to reduce twist artifacts.

### Phase 4: Surface thickening + blending helpers

- `Surface.thicken(...)` for manufacturable solids.
- Early blend helper (`smoothJoin`) as controlled approximation.

### Phase 5 (Optional): Hybrid backend

If precision requirements outgrow mesh-based approximations:

- Keep public ForgeCAD API unchanged.
- Add optional OCCT-backed implementations for loft/sweep/fillet/shell/STEP export.

## Example Target Workflow (Wing)

```js
const wing = loft({
  sections: [
    { at: 0.0, profile: airfoil('NACA2412', 1800) },
    { at: 0.5, profile: airfoil('NACA2410', 1100), transform: Transform.identity().rotateAxis([1,0,0], -2) },
    { at: 1.0, profile: airfoil('NACA0009', 450), transform: Transform.identity().rotateAxis([1,0,0], -5) },
  ],
  rails: [
    spline3d([[0,0,0], [220,500,60], [700,1200,120]]),        // leading edge rail
    spline3d([[1800,0,0], [1300,500,40], [450,1200,70]]),     // trailing edge rail
  ],
  continuity: 'G1',
  cap: true,
}).thicken(16);

return wing.toShape().color('#cfd8dc');
```

## Risks and Tradeoffs

1. Mesh loft quality vs CAD expectations
- Initial loft/sweep will be approximation-based.
- Needs clear tolerance knobs and predictable behavior.

2. Performance
- Adaptive sampling is required to avoid exploding triangle counts.
- Should expose “quality presets” for fast iteration vs high-quality export.

3. Topology stability
- Complex surfacing can break naive face/edge naming.
- Recommended: introduce station/rail labels and preserve them as metadata.

4. Kernel limitations
- Manifold excels at booleans/mesh ops, not native B-rep surfacing.
- API should be backend-agnostic from day one.

## Recommendation

Do not jump straight to a full kernel rewrite. The highest ROI path is:

1. Add curve primitives.
2. Add loft/sweep surface APIs with robust sampling.
3. Add domain helpers for airfoils/wing/fuselage.
4. Keep API stable and optionally upgrade backend later.

This keeps ForgeCAD fun, scriptable, and fast while unlocking genuinely “cool” airplane-grade surfaces.

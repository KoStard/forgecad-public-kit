# NURBS Curves and Surfaces

## Problem Definition

ForgeCAD's curve primitives (Catmull-Rom splines, Bezier, Hermite) are special cases of the broader B-spline family. They lack non-uniform knot spacing and rational weights, which means:

- No exact representation of conics (circles, ellipses are always approximated)
- No local knot insertion — can't add detail in one region without affecting the rest
- No weight-based shape control — can't pull a surface toward a control point without moving it
- No industry-standard surface exchange (STEP/IGES rely on NURBS)

This becomes a bottleneck for precision free-form surfaces: car body panels, turbine blades, optical lenses, medical implants — anything where engineering tolerances matter on curved geometry.

## Description

Add NURBS (Non-Uniform Rational B-Spline) curves and surfaces to ForgeCAD as a first-class primitive, usable in both 2D sketches and 3D surface operations.

### What NURBS gives us

| Capability | Today (Catmull-Rom/Bezier) | With NURBS |
|-----------|---------------------------|------------|
| Exact circles/ellipses | Approximated by segments | Mathematically exact |
| Local editing | Move 1 point, whole curve shifts | Move 1 point, only nearby region changes |
| Knot refinement | Not possible | Insert knots to add local detail |
| Degree elevation | Fixed cubic | Raise degree for more smoothness |
| Surface patches | None | Tensor-product NURBS surfaces |
| STEP/IGES export | Mesh only | Exact parametric geometry |
| Weight control | None | Pull surface toward/away from control points |

### Scope

**Phase 1 — NURBS Curves (2D & 3D)**
- `NurbsCurve` class: control points, weights, knot vector, degree
- Evaluation: `pointAt(t)`, `tangentAt(t)`, `curvatureAt(t)`
- Knot insertion, degree elevation
- Conversion from/to Bezier and Catmull-Rom
- Integration with PathBuilder and ConstrainedSketchBuilder
- `nurbsCurve2d(controlPoints, weights, knots, degree)` API function
- `nurbsCurve3d(controlPoints, weights, knots, degree)` API function

**Phase 2 — NURBS Surfaces**
- `NurbsSurface` class: 2D control point grid, weights, knot vectors (U & V), degrees
- Evaluation: `pointAt(u, v)`, `normalAt(u, v)`
- Tessellation to triangle mesh (adaptive, curvature-based)
- `nurbsSurface(controlGrid, options)` API function
- `.thicken(thickness)` to create a solid from a surface

**Phase 3 — Integration**
- OCCT backend: map to native OpenCascade NURBS (BSplineCurve, BSplineSurface)
- Manifold backend: tessellate with adaptive refinement, then use as mesh
- STEP export: write exact NURBS geometry instead of triangulated approximation
- Constrained sketch solver: NURBS point-on-curve, tangent, curvature constraints
- Fitting: `fitNurbs(points, degree, tolerance)` — approximate a point cloud with a NURBS curve

### Key design decisions

- **Degree**: Default to cubic (degree 3), support up to degree 7
- **Clamped knots**: Default to clamped (curve passes through first/last control point) — most intuitive for users
- **Weight convention**: weight = 1.0 is neutral, >1 pulls toward control point, <1 pushes away
- **Tessellation**: Curvature-adaptive — more triangles where surface bends, fewer on flat regions

## Requirements

- Pure TypeScript implementation for the math (no WASM dependency for evaluation)
- Must integrate with existing quality scaling system (`src/forge/quality.ts`)
- Must work with both OCCT and Manifold backends
- API must feel consistent with existing `spline2d`, `spline3d`, `sweep`, `loft`
- Control point editing should work in the UI (future — visual dragging of control points)

## Status and log

**Status**: Not started — future work.
**Priority**: Medium-term. Current spline/Hermite primitives cover most use cases. NURBS becomes critical when users need exact conic sections, STEP export fidelity, or precision free-form surfaces.

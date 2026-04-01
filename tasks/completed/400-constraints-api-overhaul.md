# 2D Constraints API Overhaul

## Problem Definition

The constraint solver in `src/forge/sketch/constraints.ts` has all the internal machinery but the developer-facing API is low-level, verbose, and incomplete. To add a parallel constraint today you write:

```js
sk.constrain({ type: 'parallel', a: 'ln-1', b: 'ln-2' });
```

There are no ergonomic helpers, two constraint types found in every CAD tool (midpoint, point-on-circle) are missing entirely, there is no `loop()` method for explicit point/line workflows, and a rejected constraint silently disappears with no feedback. The solver is a proud part of the codebase; the API is not.

## Description

Overhaul the public API of `ConstrainedSketchBuilder` so that adding constraints is ergonomic, self-documenting, and covers the full Fusion 360 constraint set. Preserve the existing solver and data-model exactly — this is an API layer on top of what already works.

**Changes:**

1. **Ergonomic constraint methods** — one typed method per constraint so callers never need to pass raw `{ type: '...' }` objects. All methods return `this` for chaining.

2. **Two missing constraint types:**
   - `midpoint` — a point lies at the midpoint of a line segment.
   - `pointOnCircle` — a point lies on the perimeter of a circle.

3. **`addLoop(points: PointId[])`** — explicitly register a closed polygon loop from hand-built point/line geometry (complements the existing `moveTo`/`lineTo`/`close` path-builder flow).

4. **Strict mode** — `constrainedSketch({ strict: true })` throws a descriptive error instead of silently pushing to `rejectedConstraints` when a constraint cannot be satisfied.

5. **`fix(point, x?, y?)`** convenience — if `x`/`y` are omitted, the point is fixed at its current position.

6. **Examples** covering basic and advanced use-cases.

## Requirements

- All existing exports and behaviour remain unchanged (non-breaking).
- The new methods are pure wrappers; solver logic lives only in `solveConstraints`.
- `midpoint` and `pointOnCircle` are handled in the solver, `buildLabel`, `isDimensionConstraint`, `buildConstraintDisplays`, and `computeStatus`.
- `constrainedSketch()` accepts an optional `options` bag `{ strict?: boolean }`.
- Two example files: `examples/api/constrained-sketch-basics.forge.js` and `examples/api/constrained-sketch-mechanical.forge.js`.

## Fusion 360 constraint coverage (post-overhaul)

| Constraint       | Covered? |
|-----------------|---------|
| Coincident       | ✅ |
| Collinear        | ✅ |
| Concentric       | ✅ |
| Fixed/Grounded   | ✅ |
| Parallel         | ✅ |
| Perpendicular    | ✅ |
| Horizontal       | ✅ |
| Vertical         | ✅ |
| Tangent          | ✅ |
| Equal            | ✅ |
| Symmetric        | ✅ |
| Midpoint         | ✅ (new) |
| Point on circle  | ✅ (new) |
| Smooth (G2)      | 🔜 future (needs arc primitives) |
| Distance         | ✅ |
| Length           | ✅ |
| Angle            | ✅ |
| Radius           | ✅ |
| Diameter         | ✅ |
| Horizontal dist  | ✅ |
| Vertical dist    | ✅ |

## Status and log

- [x] Task created 2026-03-16
- [x] New constraint types `midpoint` + `pointOnCircle` implemented
- [x] Ergonomic builder methods added (horizontal, vertical, parallel, perpendicular, tangent, equal, coincident, concentric, collinear, symmetric, fix, midpoint, pointOnCircle, distance, length, angle, radius, diameter, hDistance, vDistance)
- [x] `addLoop()` method added
- [x] Strict mode implemented
- [x] Examples created
- [x] Solver bugs fixed 2026-03-16:
  - `parallel` now accepts anti-parallel lines (picks closer of same/opposite direction)
  - `perpendicular` now accepts both perpendicular orientations
  - `angle` now picks the closer of the two valid orientations
  - tangent line-circle solver moves only the nearest endpoint so two tangent constraints on one line can converge
- [x] `ConstraintSketch.inspect()` diagnostic method added
- [x] Examples verified: all volumes match expected analytical values

# Curves Gap Analysis — What's Missing in ForgeCAD

## Implementation Status: COMPLETE

All three phases implemented, tested, and API refined:
1. **arcTangentArc** — G1 smooth arc-to-arc tangent constraint (Rust + TS), with auto-detection of shared endpoints
2. **Bezier primitive** — cubic Bezier entity with tessellation, profile segments, `bezier()`, `bezierTo()` builder methods
3. **smoothBlend** — high-level Bezier bridge between two arcs with weight control (entity-based API)
4. **blendTo** — path-style smooth blend from arc to point (cursor-based API)
5. **bezierTangentArc** — Bezier tangent to arc constraint (Rust + TS)

Tests: 4 new Rust solver tests all passing (67/67 non-cold-start). TS check suite: 73/74 (1 pre-existing SVG snapshot mismatch).

---

## Goal

Identify what curve capabilities are missing in ForgeCAD, specifically around:
- Connecting arcs/curves smoothly (G1/G2 continuity)
- Controlling blend weight ("keep this arc's shape longer than that one")
- Higher-order curve primitives (splines in constraints, Beziers, NURBS)

## Current State — What Existed Before

### Curve Primitives

| Primitive | Constrained Sketch | Free Sketch | 3D |
|-----------|-------------------|-------------|-----|
| Point | Yes | Yes | — |
| Line | Yes | Yes | — |
| Circle | Yes | Yes | — |
| Arc | Yes (center+start+end+radius+cw) | Yes (`arcTo`) | — |
| Catmull-Rom Spline | **No** | Yes (`spline2d`) | Yes (`Curve3D`) |
| Bezier | **No** | **No** | **No** |
| NURBS | **No** | **No** | **No** |

### Continuity Between Curves

| Continuity | Supported | How |
|------------|-----------|-----|
| G0 (positional) | Yes | `coincident` constraint |
| G1 (tangent) | Partial | `lineTangentArc` (line↔arc only), `tangent` (line↔circle, circle↔circle) |
| G2 (curvature) | **No** | — |
| G3+ (higher) | **No** | — |

### Key Gap: No Arc-to-Arc Tangency

The `tangent` constraint handles line↔circle and circle↔circle (external tangency).
`lineTangentArc` handles line↔arc at endpoints.
**There was no arc↔arc tangent constraint.** Two arcs could not be directly constrained to meet smoothly.

---

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline | No Bezier, no arc↔arc tangent, no blend API | — |
| P1 | arcTangentArc constraint (Rust + TS) | G1 arc-arc tangency works | ✅ |
| P2 | Bezier entity + tessellation + profile segments | Bezier curves in constrained sketches | ✅ |
| P3 | bezierTangentArc constraint | Bezier tangent to arc at endpoints | ✅ |
| P4 | smoothBlend (entity-based API) | Weighted Bezier bridge between two arcs | ✅ |
| P5 | Fix smoothBlend tangent direction | Correct CW/CCW tangent computation | ✅ (was major bug) |
| P6 | arcTangentArc auto-detection | No more aAtStart/bAtStart guessing | ✅ |
| P7 | blendTo (path-style API) | `sk.arcTo(...).blendTo(x, y, weight)` | ✅ |
| P8 | Fix Gothic arch example geometry | Consistent radii, correct CW sweep | ✅ |

---

## Experiment Log

### Phase 1: arcTangentArc (SUCCESS)

**What**: Added `ArcTangentArc` constraint to the Rust solver. Residual = cross product of unit radius vectors at the junction point. 1 equation enforcing collinearity of centers and junction point.

**Result**: Rust tests pass. Gothic arch example produces correct pointed-arch shape.

**Lesson**: The residual uses unit radius vectors (normalized) — without normalization, arcs with very different radii would have unbalanced residual magnitudes.

### Phase 2: Bezier Primitive (SUCCESS)

**What**: Added `Bezier` struct to Rust types, `SketchBezier` to TS types, tessellation via de Casteljau (32 segments), profile segment support for extrusion, `bezier()` and `bezierTo()` builder methods.

**Result**: Bezier curves render correctly in sketches and extrude properly.

**Key decision**: Bezier is stored as 4 PointIds (p0, p1, p2, p3). The solver doesn't directly constrain Bezier curves — it constrains the control points. This avoids adding Bezier-specific equations to the solver core.

### Phase 3: bezierTangentArc (SUCCESS)

**What**: Constraint that the Bezier tangent direction at an endpoint is perpendicular to the arc's radius at the same point. Residual = dot product of tangent vector and radius vector.

**Key design decision**: The constraint stores resolved point IDs (`tangentBase`, `tangentControl`) rather than a `BezierId`. This avoids threading `beziers: Vec<Bezier>` through 15+ function signatures in the Rust solver. The TS builder resolves the Bezier's control points at constraint creation time.

**Result**: Works correctly. The solver refines control point positions to maintain tangency.

### Phase 4: smoothBlend entity-based API (SUCCESS after fix)

**What**: High-level method `smoothBlend(arc1, arc2, { weight })` that creates a Bezier bridge between two arcs. Computes tangent directions, places control points, adds bezierTangentArc constraints.

**Result**: Creates smooth weighted blends between arcs.

### Phase 5: smoothBlend tangent direction fix (CRITICAL FIX)

**What**: The original tangent direction logic picked whichever perpendicular to the radius "pointed toward the other arc" using a dot-product test. This completely ignored arc directionality (CW vs CCW).

**Why it failed**: For a CCW arc, the tangent at a point is the radius rotated 90° CCW: `(-ry, rx)`. For CW, it's `(ry, -rx)`. The old code tried both and picked whichever pointed toward the target — but the correct tangent is determined by the arc's sweep direction, not by the target location. This caused the Bezier to curve 180° the wrong way ("nice curve, then 180 degrees back opposite arc").

**Fix**: Compute the forward tangent using the arc's `clockwise` flag, then apply sign correction based on whether we're at the arc's start or end:
- At arc's END: Bezier departs in `+t_fwd` (same direction arc was traveling)
- At arc's START: Bezier departs in `-t_fwd` (opposite to arc's departure)

**Lesson**: Arc tangent direction is NOT a choice — it's determined by the arc's geometry. Never use a "pick the better option" heuristic for something with a single correct answer.

### Phase 6: arcTangentArc auto-detection (SUCCESS)

**What**: Made `aAtStart`/`bAtStart` parameters optional. When omitted, auto-detects which endpoints are shared (same PointId), falling back to closest pair by coordinate distance.

**Why**: The old API required the user to think about whether the junction was at each arc's start or end — a common source of confusion. The constraint should figure this out automatically.

### Phase 7: blendTo path-style API (SUCCESS)

**What**: Added `blendTo(x, y, weight?)` to the path API. After an `arcTo()`, calling `blendTo()` creates a Bezier that departs tangent to the arc and arrives at the target point. Control points computed automatically.

**Why**: The entity-based `smoothBlend` requires `arcByCenter` + explicit endpoints + `addProfileLoop`. The path API (`moveTo → arcTo → blendTo → lineTo → close`) is far more intuitive for sequential profiles.

**Limitation**: `blendTo` only guarantees G1 on the departure side (tangent to the previous arc). The arrival end is not constrained to any arc. For dual-tangency, use the entity-based `smoothBlend`.

### Phase 8: Gothic arch example geometry (FAILED → FIXED)

**What**: Multiple geometry issues in the example:
1. **Inconsistent radii**: Arc center at (w,0), start at (-w,0) gives radius=2w, but end at crown gives radius=R≠2w. Fix: set R=2w (equilateral arch).
2. **Wrong sweep direction**: CCW from 180° to 120° sweeps 300° (the long way). Fix: use CW for the 60° short path.
3. **Separate center/base points**: Center construction points at (±w,0) and base points at (±w,0) were separate PointIds — the solver drifted them apart. Fix: use the same point for both center and base, and fix them.

**Lesson**: `arcByCenter` computes radius from the start point. If the end point is at a different distance from center, the solver will distort the shape trying to satisfy the inconsistency. Always verify both start and end are equidistant from center.

---

## Serde Gotcha (IMPORTANT)

Rust's `#[serde(tag = "type", rename_all = "camelCase")]` on an enum only renames the VARIANT discriminator, NOT field names within variants. Fields keep their Rust snake_case names. The TS serialization layer must explicitly convert camelCase→snake_case for fields like `arcA→arc_a`, `aAtStart→a_at_start`.

---

## Files Modified

| File | Purpose |
|------|---------|
| `solver/src/types.rs` | `Bezier` struct, `ArcTangentArc`/`BezierTangentArc` constraint variants |
| `solver/src/constraints/mod.rs` | Residual functions for new constraints |
| `solver/src/solver/mod.rs` | Entity ref counts for new constraints |
| `solver/src/solver/subgraph_detection.rs` | Point indices for new constraints |
| `solver/tests/solver_tests.rs` | 4 new tests + `beziers: vec![]` everywhere |
| `solver/tests/helpers.rs` | `beziers: vec![]` in helpers |
| `solver/tests/testkit.rs` | `beziers: vec![]` in testkit |
| `src/forge/sketch/constraints/types.ts` | `BezierId`, `SketchBezier`, profile segment types |
| `src/forge/sketch/constraints/builder.ts` | `bezier()`, `bezierTo()`, `blendTo()`, `arcTangentArc()`, `smoothBlend()`, `bezierTangentArc()`, `addProfileLoop()` |
| `src/forge/sketch/constraints/defs/arcTangentArc.ts` | Constraint definition |
| `src/forge/sketch/constraints/defs/bezierTangentArc.ts` | Constraint definition |
| `src/forge/sketch/constraints/defs/index.ts` | Import registration |
| `src/forge/sketch/constraints/sketch.ts` | Bezier tessellation, profile segment handling |
| `src/forge/sketch/constraints/solver-wasm.ts` | WASM serialization for beziers + field name conversion |
| `src/forge/sketch/constraints/registry.ts` | DisplayContext bezier support |
| `src/forge/forge-api.d.ts` | Type declarations for new methods |
| `examples/api/smooth-curve-connections.forge.js` | Main example |
| `examples/api/_test-curves-render.forge.js` | Quick test file |

---

## Remaining Gaps (Future Work)

| # | Gap | Impact | Difficulty |
|---|-----|--------|------------|
| 1 | **G2 curvature continuity** | Truly smooth connections (no curvature jump) | Medium — curvature = 1/radius at junction |
| 2 | **Constrained splines** | General smooth curves through control points | High — new entity + constraint infrastructure |
| 3 | **Variable-radius fillet** | Organic shapes | Medium — parametric radius function |
| 4 | **NURBS** | Ultimate generality | Very high — full NURBS infrastructure |
| 5 | **bezierTangentLine** | Bezier tangent to line constraint | Low — similar to bezierTangentArc |
| 6 | **Analytic Jacobian for BezierTangentArc** | Solver performance | Low — currently uses numerical Jacobian |

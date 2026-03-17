# Constraint Solver Internals

> For a new team member. This covers the solver architecture, the key design
> decisions behind it, and the pitfalls we've already hit and solved.

## Architecture overview

The constraint solver lives in `src/forge/sketch/constraints/`. Each constraint
type is a file in `defs/` that calls `registerConstraint()` at module load time.
The central registry (`registry.ts`) drives the solver.

### Solver pipeline

When the user calls `sk.solve()`, the pipeline is:

```
1.  Clone the definition (preserve originals for undo/compare)
2.  Build Maps for fast lookup (points, lines, circles, arcs, shapes)
3.  PRESOLVE — call constraint.presolve() once per constraint
4.  GS WARM-UP — 5 cheap Gauss-Seidel iterations to propagate positions
5.  NEWTON-RAPHSON — up to N iterations (if every constraint has a residual)
6.  GS FALLBACK — if NR wasn't available or didn't converge, run full GS loop
7.  Arc enforcement — scale arc endpoints to consistent radius
8.  Status — compute DOF, detect over/under constraint, find redundancies
```

### Constraint definition anatomy

Every constraint def file exports a `ConstraintDef` with these methods:

| Method | Called by | Purpose |
|---|---|---|
| `presolve` | Once, before iterations | One-shot initialisation (pin fixed points, snap angles, enforce winding) |
| `solve` | Each GS iteration | Move points to satisfy this constraint (returns error magnitude) |
| `residual` | Each NR iteration | Return equation residual(s) for Gauss-Newton step |
| `computeDof` | Status computation | Declare which points this constraint "touches" for DOF counting |
| `displayPosition` | UI rendering | Where to place the constraint label in the viewport |

## The three solver phases, and why we need all of them

### Presolve

Each constraint can optionally run a one-shot setup before any iterations.
The `fixed` constraint uses this to pin points (`pt.fixed = true`).  Angle
constraints use it to snap endpoints into the correct half-plane so NR doesn't
start near a degenerate configuration.

### GS warm-up (Gauss-Seidel)

**Why this exists:** Fresh points often start at degenerate positions (all at
`(0, 1)`, creating zero-length lines). Newton-Raphson needs a reasonable
starting point — if the Jacobian is near-singular at the starting position, NR
can't compute a useful step.

The warm-up runs 5 cheap GS iterations: for each constraint in definition
order, call `solve()` which directly pushes points toward the target. For a
chain of angle-constrained lines, this propagates positions forward:

```
GS iteration 1:
  absoluteAngle(line1, -90°)  → anchors line1.a, moves line1.b downward
  absoluteAngle(line2,   0°)  → anchors line2.a = line1.b, moves line2.b right
  absoluteAngle(line3,  90°)  → anchors line3.a = line2.b, moves line3.b up
  ...
```

After a few passes, all points are near their final positions. NR takes over
for fine convergence.

### Newton-Raphson (NR)

The main solver for precision. Uses numerical Jacobian (forward finite
differences, step = 1e-6) and Gauss-Newton least-squares with Armijo
backtracking line search. All free point coordinates are variables; all
constraint residuals form the equation system.

NR only runs if **every** constraint defines a `residual()` function.
Constraints with `equations: 0` (like `fixed` and `ccw`) return `[]` from
`residual()` — this is fine; they just don't contribute equations.

### GS fallback

If NR wasn't available (some constraint missing residual) or didn't converge
below tolerance, a full Gauss-Seidel loop runs for up to N iterations.

## Key design pitfalls (and how we handle them)

### The "modulo-180°" ambiguity

**Problem:** A line from `a` to `b` has angle `θ` from the positive X-axis.
The same line traversed from `b` to `a` has angle `θ + 180°`. A naïve residual
like `sin(angle − target) = 0` is satisfied at **both** `θ = target` and
`θ = target + 180°`, so the solver can converge to the wrong orientation.

**Solution:** Use `normalizeAngle(angle − target)` as the residual. This has:
- A unique zero at `angle = target`
- Gradient ≈ 1 everywhere (unlike `1 − cos` which has gradient 0 at the target)
- A discontinuity at `±π`, which `presolve` avoids by snapping points into the
  correct half-plane before NR starts.

We tried two other formulations before landing on this:

| Residual | Unique zero? | Gradient at target |
|---|---|---|
| `sin(angle − t)` | No (also zero at t+π) | 1 (good) |
| `1 − cos(angle − t)` | Yes | **0** (NR stalls!) |
| `normalizeAngle(angle − t)` | Yes | 1 (good) |

### The "reference-count heuristic" for which point to move

**Problem:** When `absoluteAngle.solve()` runs, it needs to decide which
endpoint to anchor and which to move. If neither point is explicitly `fixed`,
the wrong choice corrupts shared points. Example: the last line in a chain
closes back to a triangle vertex — moving the triangle vertex breaks the
triangle.

**Solution:** Count how many lines each point appears in (`pointLineRefs`).
The point referenced by more lines is more constrained by the rest of the
system — anchor it, move the other one.

```
Line closing back to triangle:
  a = chain endpoint (2 line refs)  → LESS constrained → MOVE this one
  b = triangle vertex (3 line refs) → MORE constrained → ANCHOR this
```

### The "unconditional presolve snap"

**Problem:** Fresh points often start at `(0, 1)`, creating zero-length lines.
`angleOfLine(a, b)` returns 0 for a zero-length line (atan2(0,0) = 0). If this
bogus angle happens to equal the target, presolve skips the line. Then NR starts
with a degenerate Jacobian (zero-length lines have undefined angular gradients)
and can't converge.

**Solution:** `absoluteAngle.presolve()` unconditionally snaps the free
endpoint to `(anchor + cos/sin(target) * max(len, 1))`. This ensures every
line starts with a meaningful direction and nonzero length.

### The "discrete orientation ambiguity" (CCW constraint)

**Problem:** An equilateral triangle with a fixed vertex and `absoluteAngle` on
one side has its shape fully determined — except the third vertex can be on
either side of the first line (mirror image). Both solutions satisfy all
continuous constraints. Nothing in the equation-based solver prefers one over
the other.

**Solution:** The `ccw` constraint (0 equations, presolve + solve only). It
computes the signed polygon area and, if negative (clockwise), reflects the
last non-fixed vertex across the line formed by the first two vertices. Since it
runs in presolve (before NR) and in solve (during GS), the triangle is always
pushed to CCW. NR respects this because its steps are small — it won't swing a
vertex through the opposite side in a single step.

Usage:
```js
const t = eqilateralTriangle(origin, sk.point(1, 1), sk.point(0, 5));
sk.ccw(origin, sk.point(1, 1), sk.point(0, 5)); // lock CCW winding
```

## Builder rejection protocol

When a user calls `sk.absoluteAngle(line, 90)`, the builder doesn't just
record the constraint — it does a **test solve** (30 iterations) to check
feasibility. If `maxError > tolerance × 5`, the constraint is rejected and
stored in `rejectedConstraints[]`. This is why solver convergence from cold
start matters: a constraint that is mathematically satisfiable can still get
rejected if the solver can't reach the solution in 30 iterations from the
initial point positions.

The GS warm-up phase was added specifically to address this: it gets points
close enough that NR can finish the job within the iteration budget.

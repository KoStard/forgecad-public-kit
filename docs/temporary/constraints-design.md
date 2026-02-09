# Constraints System — Design Document

## What Problem Are We Solving?

In ForgeCAD, the code IS the model. When you write `hole.translate(40, 30, 0)`, that's a hard-coded position. If you later change the base from 80mm to 100mm wide, the hole doesn't automatically re-center — you have to manually update the translate call.

In Fusion360/SolidWorks, you'd add a "centered" constraint and the solver handles it. The question: how do we get that power without losing the code-native paradigm?

---

## What Are Constraints in Traditional CAD?

Traditional CAD has two layers:

**2D Sketch constraints** (used when drawing profiles before extrusion):
- Coincident — two points share the same location
- Parallel — two lines stay parallel
- Perpendicular — two lines at 90°
- Tangent — a line meets a curve smoothly
- Equal — two segments have equal length
- Distance — fixed distance between elements
- Angle — fixed angle between lines
- Symmetric — elements mirror across an axis

**3D Assembly constraints** (used when positioning parts relative to each other):
- Mate — two faces touch
- Align — two axes line up
- Offset — fixed distance between faces

These are solved by a geometric constraint solver — a system of equations that finds positions satisfying all constraints simultaneously.

---

## The Interesting Insight for Code-Native CAD

Here's what I realized: in code-native CAD, **parameters already ARE constraints**. When you write:

```js
const width = param("Width", 80);
const hole = cylinder(10, 8).translate(width / 2, 30, 0);
```

That `width / 2` IS a "centered horizontally" constraint. It's just expressed as arithmetic rather than a GUI constraint. And it's more powerful — you can write `width / 3` or `width * 0.618` (golden ratio) just as easily.

The gap is: some spatial relationships are awkward to express as raw arithmetic. "Center this on that face" requires knowing the bounding box of "that", computing the center, etc. That's where helper functions come in.

---

## Three Approaches

### Approach 1: Code-Level Helpers (Recommended for MVP)

Add methods to Shape that express common spatial relationships:

```js
const base = box(80, 60, 5);
const hole = cylinder(10, 8).centerOn(base, 'top');
const rib = box(5, 60, 20).alignTo(base, 'top', 'left');
const feet = cylinder(3, 5).distribute(4, base, 'bottom', { margin: 10 });
```

**How it works**: Each helper queries the target shape's bounding box and computes the translation. No solver needed — it's just arithmetic wrapped in a readable API.

| Pros | Cons |
|------|------|
| Pure code — LLM can read/write it | Can't express circular dependencies |
| Zero solver complexity | Limited to what you can express as functions |
| Debuggable — just print the computed values | No visual constraint editing |
| Composable with regular transforms | User must learn the API |

**Implementation difficulty: LOW**. Each helper is ~10 lines using `boundingBox()`.

---

### Approach 2: 2D Sketch + Constraint Solver

Add a sketch mode where users draw 2D profiles with constraints, then extrude:

```js
const sketch = new Sketch()
  .line([0, 0], [80, 0])
  .line([80, 0], [80, 60])
  .line([80, 60], [0, 60])
  .close()
  .constrain('distance', line(0), 80)  // bottom edge = 80mm
  .constrain('perpendicular', line(0), line(1))
  .solve();

return sketch.extrude(5);
```

Would need a 2D geometric constraint solver. Options:
- Port FreeCAD's PlaneGCS solver (C++, would need WASM compilation)
- Use `cassowary.js` (linear constraint solver — handles distances but not angles/tangents)
- Write a custom Newton-Raphson solver for geometric constraints

| Pros | Cons |
|------|------|
| Familiar to CAD users | Large codebase addition (solver alone is 5K+ lines) |
| Handles complex constraint networks | Breaks pure-code simplicity |
| Visual sketch editing possible | Debugging constraint conflicts is painful |
| Industry-standard workflow | Over-engineering for most use cases |

**Implementation difficulty: HIGH**. The solver alone is a significant project.

---

### Approach 3: Hybrid — Declarative Constraints on 3D Shapes

```js
const base = box(80, 60, 5);
const hole = cylinder(10, 8);
const nut = lib.hexNut(10, 5, 8);

constrain({
  [hole]: { centerX: base, centerY: base, on: face(base, 'top') },
  [nut]: { coaxial: hole, stackOn: face(base, 'bottom') },
});

return base.subtract(hole).add(nut);
```

A `constrain()` function takes a map of shapes to constraint sets, solves positions, and mutates the shapes' transforms.

| Pros | Cons |
|------|------|
| Declarative and readable | Need a 3D position solver |
| Handles inter-shape relationships | Constraint conflict debugging |
| LLM-friendly syntax | More complex than Approach 1 |
| Can layer on top of Approach 1 | Circular dependencies possible |

**Implementation difficulty: MEDIUM**. Simpler than a full geometric solver since we're only solving positions/orientations, not sketch geometry.

---

## Recommendation

**Start with Approach 1.** It covers ~80% of real use cases with ~100 lines of code. The key insight: most CAD constraints are really just "position this relative to that" — and bounding-box-based helpers handle that cleanly.

If users hit limits, Approach 3 can be layered on top later without breaking anything.

---

## Implementation Plan — Approach 1

### Helper Methods to Add to Shape

#### `.centerOn(target, face?)`
Center this shape on a target shape (or a specific face of it).

```ts
centerOn(target: Shape, face: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' = 'top'): Shape {
  const tb = target.boundingBox();
  const sb = this.boundingBox();
  const tc = [(tb.min[0] + tb.max[0]) / 2, (tb.min[1] + tb.max[1]) / 2, (tb.min[2] + tb.max[2]) / 2];
  const sc = [(sb.min[0] + sb.max[0]) / 2, (sb.min[1] + sb.max[1]) / 2, (sb.min[2] + sb.max[2]) / 2];

  let z = tc[2];
  if (face === 'top') z = tb.max[2];
  else if (face === 'bottom') z = tb.min[2] - (sb.max[2] - sb.min[2]);

  return this.translate(tc[0] - sc[0], tc[1] - sc[1], z - sc[2]);
}
```

#### `.alignTo(target, options)`
Align specific edges/faces to a target.

```ts
alignTo(target: Shape, opts: {
  top?: 'top' | 'bottom',
  left?: 'left' | 'right',
  front?: 'front' | 'back',
}): Shape {
  const tb = target.boundingBox();
  const sb = this.boundingBox();
  let dx = 0, dy = 0, dz = 0;

  if (opts.left === 'left') dx = tb.min[0] - sb.min[0];
  if (opts.left === 'right') dx = tb.max[0] - sb.min[0];
  if (opts.top === 'top') dz = tb.max[2] - sb.min[2];
  if (opts.top === 'bottom') dz = tb.min[2] - sb.max[2];
  // ... etc for other combinations

  return this.translate(dx, dy, dz);
}
```

#### `.stackOn(target, face)`
Place this shape on top of (or below, beside) a target.

#### `.distribute(count, along, spacing)`
Create `count` copies distributed along an axis with given spacing.

#### `.inset(target, face, margin)`
Position inset from the edges of a target face by a margin.

---

## What About Visual Constraint Editing?

Future possibility: click a face in the viewport, click another face, choose "align" from a context menu. This would generate the corresponding `.alignTo()` code and insert it into the editor. The constraint lives in code — the UI is just a shortcut for writing it.

This keeps the code-native paradigm intact while adding visual editing convenience.

---

## What's Actually Hard (Honest Assessment)

- **Circular dependencies**: If A is constrained to B and B to A, code-level helpers just compute sequentially — no solver to detect conflicts. User has to think about order.
- **Over-constrained systems**: With a solver (Approach 2/3), you can detect "these constraints conflict". With code helpers, you just get wrong positions silently.
- **Tangent/angle constraints**: These need actual geometric computation beyond bounding boxes. Would need face/edge queries from Manifold, which exist but are more complex to use.
- **Assembly constraints**: When you have 20 parts that all reference each other, the code gets verbose. This is where Approach 3 starts to shine.

For a single-part parametric design tool (which is 90% of what people 3D print), Approach 1 is more than enough.

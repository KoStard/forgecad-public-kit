# Blueprint-First Philosophy

## Code Should Read Like a Mechanical Blueprint

ForgeCAD is a **mechanical compiler**. The user inputs design intent — dimensions, constraints, relationships — and the engine handles the geometry. If a mechanical feature can be dimensioned on a 2D drawing without explicit X/Y coordinates, a user should be able to model it in ForgeCAD without calculating those coordinates.

We are building a geometry engine, not a math test.

## The Trigonometry Tax

Every time a user writes `Math.sin()` or `Math.cos()` to place a bolt hole, position a circular pattern, or compute a tangent point, our API has failed them. This is the **Trigonometry Tax** — the cost of translating declarative engineering intent into imperative Cartesian math.

The tax is real and measurable. In our own example library, ~40 of 250+ files contain manual trig. The same patterns repeat: circular positioning, polygon vertex layout, rotation result computation, polar-to-cartesian conversion. Each one is a place where the API should have provided an abstraction but didn't.

## The Core Pillars

### Pillar I: Intent-Driven Constraints over Explicit Coordinates

Legacy CAD-as-code requires calculating exact center points and intersections. ForgeCAD uses **constraint-driven pathing** — users define the knowns (radii, angles, distances), and the solver calculates the implicit intersections.

```javascript
// The old way — calculating tangent arc intercepts by hand
const cx = r1 * Math.cos(angle) + offset * Math.sin(angle);
const cy = r1 * Math.sin(angle) - offset * Math.cos(angle);

// The ForgeCAD way — declare intent, solver handles geometry
sketch.route([
  { tangent: circleA },
  { fillet: 17 },
  { tangent: circleB },
]);
```

### Pillar II: Topological Selection

Hardcoding vertex indices or exact 3D coordinates to apply fillets makes models brittle. If a base dimension changes, the coordinates change, and the build breaks. ForgeCAD borrows from the DOM: **select geometry via topological queries, not hardcoded indices.**

```javascript
// Brittle — breaks if topology changes
body.fillet(5, edgeIndex[14]);

// ForgeCAD — semantic edge selection
fillet(body, 5, { parallel: [0, 0, 1], convex: true });
fillet(body, 3, selectEdges(body, { atZ: 0 }));
```

### Pillar III: Mechanical First-Class Citizens

Primitives should not be limited to circles, rectangles, and polygons. Mechanical engineering relies on standard features that are tedious to build from scratch. If a machinist has a specific tool bit for it, the API should have a specific primitive for it.

```javascript
// Holes with real mechanical features — not raw boolean subtraction
shape.hole('top', { diameter: 11, depth: 20,
  counterbore: { diameter: 18, depth: 5 },
  thread: { designation: 'M10' },
});

// Standard mechanical profiles
slot(30, 10);
arcSlot({ pitchRadius: 50, sweep: 60, width: 12 });
lib.spurGear({ module: 2, teeth: 24 });
```

### Pillar IV: Relative Workplanes

Everything in mechanical design is relative. You don't drill a hole at `[15.5, 30.2, 100.0]` in global space. You drill a hole on the top face of the flange, centered on the lug. The API must support dynamic coordinate systems that attach to existing geometry.

```javascript
// Global coordinates — fragile, unreadable
const hole = circle2d(5).extrude(20).translate(15.5, 30.2, 100.0);

// Relative to geometry — moves with the parent
circle2d(5).onFace(flange, 'top', { u: 10, v: 0 }).extrude(-20);
```

### Pillar V: No Manual Math for Standard Layout

If a user has to import `Math.sin` to place elements in a circle, compute `Math.sqrt(3)` for an equilateral triangle, or manually convert degrees to radians, our API has a gap. Standard layout operations are first-class:

```javascript
// Circular layout — no trig
const positions = circularLayout(12, radius);

// Polygon vertex positions — no sqrt(3)
const vertices = polygonVertices(3, radius);

// Polar positioning — no sin/cos
shape.translatePolar(radius, angleDeg);
```

## The Anti-Patterns

### 1. No sin/cos in user code for standard layout
If a user imports `Math.sin` to place a bolt hole, we have a missing abstraction. We provide polar coordinates, patterns, and layout helpers natively.

### 2. No magic shrinkwraps without explicit control
Connections between shapes must be explicit. "Connect Shape A to Shape B with a tangent arc of R15" — not a black-box convex hull that guesses intent.

### 3. No silent failures
If a fillet radius is too large, or a tangent route can't be solved, the API throws a descriptive mechanical error — not a generic engine crash. (See also: CLAUDE.md "No Silent Fallbacks" rule.)

### 4. No coordinate math for relative positioning
If a feature is defined relative to another feature (a hole on a face, a boss centered on a lug), the API must express that relationship directly — not force the user to compute the absolute position.

## Design Gate

**Every new public API method must pass this test:**

> Can the user accomplish this without `Math.sin`, `Math.cos`, `Math.atan2`, manual degree-to-radian conversion, or computing intermediate Cartesian coordinates from polar/angular intent?

If the answer is no, the API needs a higher-level alternative. The raw math path can still exist for power users, but the common case must be trig-free.

## Ergonomics in JavaScript

JavaScript lacks Python's `with` statement, so ForgeCAD relies on **method chaining** and **callback scopes** for clean, fluid modeling:

```javascript
// Fluid chaining — sketch to solid to features
const part = circle2d(50)
  .extrude(15)
  .fillet(5, { atZ: 0 });

// Callback workplane — scoped 2D ops on a 3D face
shape.onFace('top', (face) => {
  face.subtract(
    circularPattern(circle2d(5.5), 6, { radius: 32.5 })
  );
});
```

## Architecture Constraints

- **TypeScript native.** Autocomplete and compile-time checking for mechanical parameters are mandatory.
- **B-Rep capable.** Topological naming and precise filleting require a real CAD kernel (Manifold for mesh, OCCT for B-Rep).
- **Immutable geometry, mutable builders.** Underlying geometry is immutable for predictable undo/redo. Builder classes maintain state for ergonomic chaining.
- **Degrees at the API boundary.** All user-facing angles are in degrees. Radians are an internal implementation detail.

## Summary

We are not building a 3D drawing tool. We are building a **mechanical compiler**. The user inputs the blueprint's design intent, and our API handles the geometry.

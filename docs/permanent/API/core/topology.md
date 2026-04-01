# Entity-Based API

Named geometric entities with stable identity, topology tracking, and constraint integration.

## 2D Entities

### `point(x, y)` / `new Point2D(x, y)`
A named 2D point.

```javascript
const p = point(10, 20);
p.distanceTo(point(30, 40));  // distance
p.midpointTo(point(30, 40));  // midpoint
p.translate(5, 5);            // new point
p.toTuple();                  // [10, 20]
```

### `line(x1, y1, x2, y2)` / `Line2D`
A named 2D line segment.

```javascript
const l = line(0, 0, 50, 0);
l.length;      // 50
l.midpoint;    // Point2D
l.angle;       // degrees
l.direction;   // [1, 0]
l.parallel(10); // parallel line offset by 10

// Line-line intersection (infinite lines)
const l2 = line(25, -10, 25, 40);
l.intersect(l2);        // Point2D(25, 0) — treats as infinite lines
l.intersectSegment(l2); // Point2D or null — only if segments actually cross

// Construction methods
Line2D.fromCoordinates(0, 0, 50, 0);
Line2D.fromPointAndAngle(point(0, 0), 45, 100);
Line2D.fromPointAndDirection(point(0, 0), [1, 1], 50);
```

### `circle(cx, cy, radius)` / `Circle2D`
A named 2D circle.

```javascript
const c = circle(0, 0, 25);
c.diameter;        // 50
c.circumference;   // ~157
c.area;            // ~1963
c.pointAtAngle(90); // Point2D at top

// Extrude to cylinder with topology
const cyl = c.extrude(30);
cyl.face('top');    // FaceRef (planar)
cyl.face('side');   // FaceRef (curved, planar === false)

// Construction methods
Circle2D.fromCenterAndRadius(point(0, 0), 25);
Circle2D.fromDiameter(point(0, 0), 50);
```

### `rectangle(x, y, w, h)` / `Rectangle2D`
A rectangle with named sides and vertices.

```javascript
const r = rectangle(0, 0, 100, 60);

// Named sides
r.side('top');     // Line2D
r.side('bottom');  // Line2D
r.side('left');    // Line2D
r.side('right');   // Line2D
r.sideAt(0);       // bottom (by index)

// Named vertices
r.vertex('top-left');      // Point2D
r.vertex('bottom-right');  // Point2D

// Properties
r.width;   // 100
r.height;  // 60
r.center;  // Point2D

// Diagonals — returns [bl-tr, br-tl] as Line2D pair
const [d1, d2] = r.diagonals();
const center = d1.intersect(d2);  // Point2D at center

// Convert to Sketch for rendering
r.toSketch();

// Extrude to 3D with topology tracking
const tracked = r.extrude(20);  // TrackedShape

// Construction methods
Rectangle2D.fromDimensions(0, 0, 100, 60);
Rectangle2D.fromCenterAndDimensions(point(50, 30), 100, 60);
Rectangle2D.from2Corners(point(0, 0), point(100, 60));
Rectangle2D.from3Points(p1, p2, p3);  // free-angle rectangle
```

## 3D Topology (TrackedShape)

When you extrude a `Rectangle2D`, you get a `TrackedShape` that knows its faces and edges by name.

```javascript
const rect = Rectangle2D.fromCenterAndDimensions(point(0, 0), 100, 60);
const box = rect.extrude(20);

// Named faces
box.face('top');          // FaceRef { normal, center, planar, uAxis, vAxis }
box.face('bottom');
box.face('side-left');
box.face('side-right');
box.face('side-top');     // the side from rect's top edge
box.face('side-bottom');  // the side from rect's bottom edge

// Named edges
box.edge('top-left');     // EdgeRef { start, end } — top face, left side
box.edge('bottom-right'); // bottom face, right side
box.edge('vert-bl');      // vertical edge at bottom-left corner

// List all
box.faceNames();  // ['top', 'bottom', 'side-bottom', 'side-right', 'side-top', 'side-left']
box.edgeNames();  // all 12 edges

// Use the underlying Shape for booleans
const result = box.toShape().subtract(cylinder(25, 10));

// Translate preserves topology
const moved = box.translate(50, 0, 0);
moved.face('top').center;  // shifted by [50, 0, 0]

// Duplicate preserves topology metadata too
const copy = box.clone();
copy.face('side-left');
```

## Constrained Sketches

Parametric 2D sketches driven by geometric constraints and a nonlinear solver. Create geometry, apply constraints, solve, then extrude to 3D.

### Basic workflow

```javascript
const sk = constrainedSketch();

// Create geometry
const p1 = sk.point(0, 0);
const p2 = sk.point(50, 0);
const p3 = sk.point(50, 30);
const l1 = sk.line(p1, p2);
const l2 = sk.line(p2, p3);

// Apply constraints (fluent — all return `this`)
sk.fix(p1, 0, 0);
sk.horizontal(l1);
sk.vertical(l2);
sk.length(l1, 50);
sk.length(l2, 30);

const result = sk.solve();
return result.extrude(10);
```

### Concepts — high-level shape factories

Instead of creating points and lines individually, use concept factories that create structurally-constrained shapes and return typed handles:

```javascript
const sk = constrainedSketch();

// Rectangle: 4 points, 4 sides, horizontal/vertical constraints, CCW winding
// Returns handle with .top, .bottom, .left, .right (LineIds),
// .bottomLeft, .topRight, etc. (PointIds), .center, .shape
const r = sk.rect({ x: 0, y: 0, width: 100, height: 50 });
sk.fix(r.bottomLeft, 0, 0);
sk.length(r.bottom, 120);  // override initial width

// Regular polygon: n equal sides, CCW winding, center point
const hex = sk.regularPolygon({ sides: 6, radius: 25 });
sk.fix(hex.center, 0, 0);
sk.length(hex.side(0), 30);  // all sides change (equal constraint)

// General polygon: n vertices from coordinates, CCW winding
const tri = sk.addPolygon({ points: [[0,0], [100,0], [50,80]] });
sk.fix(tri.vertex(0), 0, 0);
sk.length(tri.side(0), 100);
```

### Available constraints

**Geometric** (no value parameter):
`horizontal`, `vertical`, `parallel`, `perpendicular`, `equal`, `coincident`, `collinear`, `symmetric`, `midpoint`, `pointOnLine`, `pointOnCircle`, `tangent`, `concentric`, `equalRadius`, `ccw`

**Dimensional** (with `value`):
`length`, `distance`, `angle`, `absoluteAngle`, `angleBetween`, `radius`, `diameter`, `hDistance`, `vDistance`, `lineDistance`, `pointLineDistance`, `arcLength`, `shapeWidth`, `shapeHeight`, `shapeArea`, `shapeCentroidX`, `shapeCentroidY`

**Pinning:**
`fix(point, x?, y?)` — pins a point at coordinates (or current position if omitted)

### Construction geometry

Pass `true` as the third argument to `sk.line()` to create construction lines. These participate in constraints but don't appear in the solved sketch output.

```javascript
// Axis of symmetry (construction line)
const axis = sk.line(sk.point(0, -50), sk.point(0, 50), true);
sk.symmetric(p1, p2, axis);  // p1 mirrors to p2 across axis
```

### Path drawing (turtle-style)

```javascript
const sk = constrainedSketch();
sk.moveTo(0, 0)
  .lineTo(50, 0)
  .lineTo(50, 30)
  .arcTo(25, 40, 15)  // arc with radius 15
  .lineTo(0, 30)
  .close();
// Constraints can reference lines/points by index:
sk.length(sk.lineAt(0), 50);
```

### Solver results

```javascript
const result = sk.solve();

// Check solve quality
result.constraintMeta.status;   // 'fully' | 'under' | 'over' | 'over-redundant'
result.constraintMeta.dof;      // 0 = fully constrained
result.constraintMeta.maxError; // residual — should be < 1e-6

// Diagnostics
result.inspect();  // human-readable summary

// Update a dimension without rebuilding the sketch
const updated = result.withUpdatedConstraint('cst-5', 120);
```

### Importing external geometry

```javascript
const sk = constrainedSketch();
const r = rectangle(0, 0, 100, 60);
const sides = sk.importRectangle(r);
// sides.bottom, sides.right, sides.top, sides.left are LineIds
sk.length(sides.bottom, 100);
```

Constraint methods also accept `Point2D`/`Line2D` directly — they auto-import:

```javascript
const sk = constrainedSketch();
const myLine = line(0, 0, 50, 0);
sk.horizontal(myLine);  // auto-imported into the sketch
```

### Troubleshooting

**Constraint silently ignored?** All arguments are validated at call time. Passing a wrong entity type (e.g., a LineId where a PointId is expected) throws immediately with available entity IDs listed. Passing `NaN`/`Infinity` as a dimension value also throws.

**Under-constrained (dof > 0)?** The sketch has free degrees of freedom. Add `fix()`, `length()`, or other dimensional constraints. Check `result.constraintMeta.dof` for how many DOF remain.

**Over-constrained?** Conflicting constraints are auto-rejected. Check `result.constraintMeta.constraints` for conflict flags and `result.inspect()` for details.


## Patterns

### `linearPattern(shape, count, dx, dy, dz?)`
Repeat a shape along a direction vector, returning the union.

```javascript
const bolt = cylinder(10, 3);
const row = linearPattern(bolt, 5, 20, 0);  // 5 bolts, 20mm apart along X
```

### `circularPattern(shape, count, centerX?, centerY?)`
Repeat a shape around the Z axis, returning the union.

```javascript
const hole = cylinder(12, 4).translate(30, 0, -1);
const holes = circularPattern(hole, 8);  // 8 holes evenly spaced
```

### `mirrorCopy(shape, normal)`
Mirror a shape and union with the original.

```javascript
const half = box(50, 30, 10);
const full = mirrorCopy(half, [1, 0, 0]);  // Mirror across YZ plane
```

For compile-covered source shapes, repeated instances created by `linearPattern`, `circularPattern`, `Shape.mirror()`, and `mirrorCopy()` keep distinct compiler owner lineage. Supported boolean unions now preserve owner-scoped canonical face queries for those repeated descendants, so later compiler inspections can still trace which repeated instance a preserved face came from. Durable post-merge face identity is still narrower than full CAD-style topology naming: reusing the same owner lineage twice without a fresh mirror/pattern owner is reported as ambiguous, and downstream subtract/intersect rewrites still record split descendants explicitly instead of guessing.

## Utility Functions

### `degrees(deg)` / `radians(rad)`
Angle conversion helpers for readability:

```javascript
degrees(45);              // 45 (identity — just for clarity)
radians(Math.PI / 4);    // 45 (converts radians to degrees)
```

## Fillets & Chamfers

### `filletEdge(shape, edge, radius, quadrant?, segments?)`
Compiler-owned edge fillet for the current tracked-edge subset.

Supported today:
- tracked vertical edges from compile-covered `box()` bodies
- tracked vertical edges from `rectangle(...).extrude(...)`
- rigid transforms between the tracked source body and the target shape
- untouched sibling tracked vertical edges after earlier supported `filletEdge(...)` / `chamferEdge(...)` rewrites on the same body
- preserved propagated vertical-edge queries after those supported edge-finish rewrites when a later supported boolean union keeps one defended edge lineage

Still out of subset today:
- the selected edge after an earlier `filletEdge(...)` / `chamferEdge(...)` rewrite as a new single finish target, because Forge now records that path as an explicit descendant edge-chain rather than pretending it stayed one edge
- edge descendants after shell, hole/cut, trim, boolean difference/intersection, or boolean unions that did not already record one supported propagated edge lineage for the selection
- generic sketch extrudes, tapered extrudes, and arbitrary feature-created edges

Canonical quadrants for the supported rectangle/box edges:
- `vert-bl` -> `[1, -1]`
- `vert-br` -> `[-1, -1]`
- `vert-tr` -> `[-1, 1]`
- `vert-tl` -> `[1, 1]`

```javascript
const b = rectangle(0, 0, 50, 50).extrude(20);
const filleted = filletEdge(b.toShape(), b.edge('vert-br'), 5, [-1, -1]);
```

### `chamferEdge(shape, edge, size, quadrant?)`
Compiler-owned edge chamfer for the same tracked vertical-edge subset as `filletEdge(...)`.

```javascript
const b = rectangle(0, 0, 50, 50).extrude(20);
const chamfered = chamferEdge(b.toShape(), b.edge('vert-br'), 3, [-1, -1]);
```

## Arc Bridge

### `arcBridgeBetweenRects(rectA, rectB, segments?)`
Build a smooth arc surface connecting two rectangular areas. Automatically finds the closest pair of parallel edges and bridges them with a semicircular arc.

**Parameters:**
- `rectA` — `Rectangle2D` or `{ corners: [[x,y,z], [x,y,z], [x,y,z], [x,y,z]] }`
- `rectB` — same format as rectA
- `segments` (number, optional) — Arc smoothness. Default: 12

**Returns:** `Shape` — thin arc solid

```javascript
// 2D rectangles (z=0)
const base = rectangle(0, 0, 300, 200);
const screen = rectangle(0, 200, 300, 200);
const hinge = arcBridgeBetweenRects(base, screen, 16);
```

```javascript
// 3D corners for non-planar rectangles
const hinge = arcBridgeBetweenRects(
  { corners: [[0,0,0], [300,0,0], [300,200,0], [0,200,0]] },
  { corners: [[0,200,15], [300,200,15], [300,400,15], [0,400,15]] },
  16,
);
```

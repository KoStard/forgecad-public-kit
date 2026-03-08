---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .sketch.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when Codex needs to build or modify ForgeCAD geometry, structure multi-file projects, run notebook cells, validate scripts, or use ForgeCAD export/render tooling.
---

# ForgeCAD

## Overview

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows with the documented API and examples in this file. Prefer the documented ForgeCAD primitives, import rules, placement strategies, and CLI commands over inventing new APIs or geometry conventions.

## Workflow

1. Identify the target artifact first: `.forge.js`, `.sketch.js`, `.forge-notebook.json`, SVG asset, or a CLI/export task.
2. Read the model-building docs in order when geometry behavior matters: core reference, coordinate system, geometry conventions, positioning, entities, assembly, then sketch modules.
3. Use multi-file imports deliberately: `importPart()` for parts, `importSketch()` for sketches or SVGs, explicit `paramOverrides`, and `.withReferences()` plus `.placeReference()` for reusable placement.
4. Use notebooks when the task benefits from stateful iteration, iterative development or debugging; remember cells share state, `show()` pins visible geometry, and notebooks can be exported to plain `.forge.js`. You can later convert it to a forge.js file.
5. Validate through the CLI with `npm run test-run -- <file>`; add `--debug-imports` when import chains or overrides might be wrong.
6. Reuse patterns from `examples/api/` (already included) before inventing a modeling recipe from scratch.

## Included Sources

Keep this skill self-contained by relying on the inlined source corpus below. Usually you won't need further exploration in the codebase and can directly go into the task.

## docs/permanent/API/model-building

### docs/permanent/API/model-building/README.md

````markdown
# Model-Building Docs

This is the complete reading set for writing ForgeCAD models. If the task is "build or modify a model", read every file below before coding.

## Required Files

1. [reference.md](reference.md) - core script contract, 3D API, imports, library helpers, return formats
2. [coordinate-system.md](coordinate-system.md) - axis conventions and standard views
3. [geometry-conventions.md](geometry-conventions.md) - winding, transform order, revolve axis, frame composition
4. [positioning.md](positioning.md) - preferred placement strategy for parts and sketches
5. [entities.md](entities.md) - named 2D entities, tracked topology, fillet/chamfer helpers, patterns
6. [assembly.md](assembly.md) - assembly graphs, joints, couplings, sweep/collision validation
7. [sketch-core.md](sketch-core.md) - `Sketch` basics, queries, anchors
8. [sketch-primitives.md](sketch-primitives.md) - `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`
9. [sketch-path.md](sketch-path.md) - path builder and stroke generation
10. [sketch-transforms.md](sketch-transforms.md) - 2D transforms
11. [sketch-booleans.md](sketch-booleans.md) - sketch boolean operations
12. [sketch-operations.md](sketch-operations.md) - offset, selective sketch fillets, hull, simplify, warp
13. [sketch-on-face.md](sketch-on-face.md) - attach sketches to standard 3D faces
14. [sketch-extrude.md](sketch-extrude.md) - extrusion and revolve
15. [sketch-anchor.md](sketch-anchor.md) - 2D anchor-based positioning

## Intentionally Excluded

These files are still part of the ForgeCAD API, but they are not required for baseline model building:

- `../runtime/` for viewport-only behavior
- `../output/` for reporting/export behavior
- `../guides/` for recipes and troubleshooting
- `../internals/` for engine notes
````

### docs/permanent/API/model-building/assembly.md

````markdown
# Assembly + Mechanism API

Use this API when your model is a mechanism, not a single booleaned solid.

## Mental model
- `Part` = manufacturable object (shape + metadata)
- `Joint` = relationship between parent and child part
- `State` = current joint values
- `Solve` = compute world transforms for all parts
- `Validate` = collisions / clearances / sweep checks

## Quick start

```javascript
const mech = assembly("Arm")
  .addPart("base", box(80, 80, 20, true), {
    metadata: { material: "PETG", process: "FDM", qty: 1 },
  })
  .addPart("link", box(140, 24, 24).translate(0, -12, -12))
  .addJoint("shoulder", "revolute", "base", "link", {
    axis: [0, 1, 0],
    min: -30,
    max: 120,
    default: 25,
    frame: Transform.identity().translate(0, 0, 20),
  });

const solved = mech.solve();
return solved.toScene();
```

## Ergonomic helpers
- `addFrame(name, { transform? })` adds a virtual reference frame (no geometry)
- `addRevolute(name, parent, child, opts)` shorthand for `addJoint(..., "revolute", ...)`
- `addPrismatic(name, parent, child, opts)` shorthand for `addJoint(..., "prismatic", ...)`
- `addFixed(name, parent, child, opts)` shorthand for `addJoint(..., "fixed", ...)`
- `addJointCoupling(jointName, { terms, offset? })` links joints with linear relationships
- `addGearCoupling(drivenJoint, driverJoint, opts)` links revolute joints using gear ratios

## Joint couplings

Use couplings when one joint should be derived from other joints.

Formula:
- `driven = offset + Σ(ratio_i * source_i)`

Example:

```javascript
const mech = assembly("Differential")
  .addFrame("Base")
  .addFrame("Turret")
  .addFrame("Wheel")
  .addFrame("TopInput")
  .addRevolute("Steering", "Base", "Turret", { axis: [0, 0, 1] })
  .addRevolute("WheelDrive", "Turret", "Wheel", { axis: [1, 0, 0] })
  .addRevolute("TopGear", "Base", "TopInput", { axis: [0, 0, 1] })
  .addJointCoupling("TopGear", {
    terms: [
      { joint: "Steering", ratio: 1 },
      { joint: "WheelDrive", ratio: 20 / 14 },
    ],
  });
```

Notes:
- Coupled joints ignore direct values in `solve(state)` and emit a warning.
- Coupling cycles are rejected.
- `sweepJoint(...)` cannot sweep a coupled target; sweep one of its source joints instead.

## Gear couplings

Use this helper to connect two **revolute** joints as a gear mesh without manually writing `addJointCoupling(...)`.

```javascript
const pair = lib.gearPair({
  pinion: { module: 1.25, teeth: 14, faceWidth: 8 },
  gear: { module: 1.25, teeth: 42, faceWidth: 8 },
});

const mech = assembly("Spur Stage")
  .addFrame("Base")
  .addFrame("PinionPart")
  .addFrame("GearPart")
  .addRevolute("Pinion", "Base", "PinionPart", { axis: [0, 0, 1] })
  .addRevolute("Driven", "Base", "GearPart", { axis: [0, 0, 1] })
  .addGearCoupling("Driven", "Pinion", { pair }); // uses pair.jointRatio
```

`addGearCoupling(...)` ratio sources (choose exactly one):
- `ratio` (explicit multiplier)
- `pair` (`lib.gearPair(...)`, `lib.bevelGearPair(...)`, or `lib.faceGearPair(...)` result using `pair.jointRatio`)
- `driverTeeth` + `drivenTeeth` (auto ratio; `internal` mesh is positive, `external`/`bevel`/`face` are negative)

For bevel/face stages, pairing helpers also return placement aids:
- `pinionAxis`, `gearAxis`
- `pinionCenter`, `gearCenter`

These vectors are useful when wiring joints in `jointsView(...)` or setting up assembly joint frames.

## Joint frames

`frame` is a transform from the **parent part frame** to the **joint frame at zero state**.

For a child part:

Matrix form:
- `childWorld = parentWorld * frame * motion(value) * childBase`

Forge chain form:
- `childWorld = composeChain(childBase, motion(value), frame, parentWorld)`

This keeps kinematic chains declarative and avoids repeated manual pivot math.

## Validation helpers
- `solved.collisionReport()` returns overlapping part pairs and volume
- `solved.minClearance("PartA", "PartB", 10)` computes minimum gap
- `assembly.sweepJoint("elbow", -20, 140, 24)` samples motion and reports collisions

## Common pitfalls
- If parts vanish in the viewport, check whether a cut plane is active before debugging kinematics. The viewer-side APIs live in [../runtime/viewport.md](../runtime/viewport.md).
- If a returned object is empty, Forge logs a warning in script output.

## Metadata
- `addPart(..., { metadata })` attaches per-part metadata to an assembly part.
- BOM/report helpers such as `solved.bom()` and `solved.bomCsv()` live in [../output/bom.md](../output/bom.md).

## Robot export

Use `robotExport({...})` when an assembly should become a simulator package instead of only a viewport scene.

```javascript
const rover = assembly("Scout")
  .addPart("Chassis", box(300, 220, 50, true))
  .addPart("Left Wheel", cylinder(30, 60, undefined, 48, true).pointAlong([0, 1, 0]))
  .addPart("Right Wheel", cylinder(30, 60, undefined, 48, true).pointAlong([0, 1, 0]))
  .addRevolute("leftWheel", "Chassis", "Left Wheel", {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(90, 140, 60),
    effort: 20,
    velocity: 1080,
  })
  .addRevolute("rightWheel", "Chassis", "Right Wheel", {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(90, -140, 60),
    effort: 20,
    velocity: 1080,
  });

robotExport({
  assembly: rover,
  modelName: "Scout",
  links: {
    Chassis: { massKg: 10 },
    "Left Wheel": { massKg: 0.8 },
    "Right Wheel": { massKg: 0.8 },
  },
  plugins: {
    diffDrive: {
      leftJoints: ["leftWheel"],
      rightJoints: ["rightWheel"],
      wheelSeparationMm: 280,
      wheelRadiusMm: 60,
    },
  },
  world: {
    generateDemoWorld: true,
  },
});
```

Notes:
- Revolute joint `velocity` values are expressed in degrees/second in Forge; the SDF exporter converts them to radians/second.
- Prismatic distances are authored in millimeters and exported in meters.
- `massKg` is preferred for demo robots; `densityKgM3` is a decent fallback when mass is unknown.
````

### docs/permanent/API/model-building/coordinate-system.md

````markdown
# Coordinate System Convention

ForgeCAD uses a **Z-up** right-handed coordinate system.

## Axes

| Axis | Direction       | Positive |
|------|-----------------|----------|
| X    | Left / Right    | Right    |
| Y    | Forward / Back  | Forward  |
| Z    | Up / Down       | Up       |

## Standard Views

| View   | Camera position direction | Sees plane | Camera up |
|--------|--------------------------|------------|-----------|
| Front  | −Y (camera at −Y)        | XZ         | Z         |
| Back   | +Y (camera at +Y)        | XZ         | Z         |
| Right  | +X (camera at +X)        | YZ         | Z         |
| Left   | −X (camera at −X)        | YZ         | Z         |
| Top    | +Z (camera at +Z)        | XY         | +Y        |
| Bottom | −Z (camera at −Z)        | XY         | −Y        |
| Iso    | +X −Y +Z (diagonal)      | —          | Z         |

## GizmoViewcube Face Mapping

Three.js BoxGeometry material indices (cube face order):

| Index | Three.js direction | ForgeCAD label |
|-------|--------------------|----------------|
| 0     | +X                 | Right          |
| 1     | −X                 | Left           |
| 2     | +Y                 | Front          |
| 3     | −Y                 | Back           |
| 4     | +Z                 | Top            |
| 5     | −Z                 | Bottom         |

Default drei labels are `['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back']` (Y-up).
For Z-up we pass `faces={['Right', 'Left', 'Front', 'Back', 'Top', 'Bottom']}`.

## Grid

The ground plane is XY (Z = 0). The grid lies on this plane.
````

### docs/permanent/API/model-building/entities.md

````markdown
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

## Constraint Helpers

```javascript
const sketch = constrainedSketch();
const p1 = sketch.point(0, 0, true);
const p2 = sketch.point(50, 0);
const p3 = sketch.point(50, 30);
const l1 = sketch.line(p1, p2);
const l2 = sketch.line(p2, p3);

Constraint.horizontal(sketch, l1);
Constraint.vertical(sketch, l2);
Constraint.length(sketch, l1, 50);
Constraint.perpendicular(sketch, l1, l2);

const result = sketch.close().solve();
```

### Entity-aware constraints

Constraint functions accept `Point2D`/`Line2D` directly — they auto-import into the builder:

```javascript
const sketch = constrainedSketch();
const myLine = line(0, 0, 50, 0);
const myRect = rectangle(10, 10, 40, 30);

// Pass Line2D directly — auto-imported
Constraint.makeParallel(sketch, myLine, myRect.side('top'));
Constraint.horizontal(sketch, myLine);
```

### Importing entities into a constrained sketch

```javascript
const sketch = constrainedSketch();
const r = rectangle(0, 0, 100, 60);
const sides = sketch.importRectangle(r);
// sides.bottom, sides.right, sides.top, sides.left are LineIds
// sides.points is [bl, br, tr, tl] PointIds

Constraint.horizontal(sketch, sides.bottom);
Constraint.length(sketch, sides.bottom, 100);
```


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

## Utility Functions

### `degrees(deg)` / `radians(rad)`
Angle conversion helpers for readability:

```javascript
degrees(45);              // 45 (identity — just for clarity)
radians(Math.PI / 4);    // 45 (converts radians to degrees)
```

## Fillets & Chamfers

### `filletEdge(shape, edge, radius, quadrant?, segments?)`
Fillet a vertical edge (subtract corner, add quarter-cylinder).

```javascript
const b = rectangle(0, 0, 50, 50).extrude(20);
const filleted = filletEdge(b, b.edge('vert-br'), 5, [-1, -1]);
```

### `chamferEdge(shape, edge, size, quadrant?)`
Chamfer a vertical edge (subtract triangular prism).

```javascript
const b = rectangle(0, 0, 50, 50).extrude(20);
const chamfered = chamferEdge(b, b.edge('vert-br'), 3, [-1, -1]);
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
````

### docs/permanent/API/model-building/geometry-conventions.md

````markdown
# Geometry Conventions

ForgeCAD wraps Manifold (a mesh kernel) and Three.js (a Y-up renderer). These libraries have their own conventions that conflict with each other and with CAD norms. This doc captures every convention mismatch and how ForgeCAD resolves it.

**Core principle: the user script should never need to know about kernel or renderer internals.** If the user writes something geometrically reasonable, it should work. All convention translation happens inside ForgeCAD's layer.

## Winding Order

**What it is:** The order of vertices in a 2D polygon determines its "direction" — counter-clockwise (CCW) = positive area, clockwise (CW) = negative/zero area in Manifold's `CrossSection`.

**The problem:** Manifold silently produces empty geometry for CW polygons. A user writing `polygon([[0,0], [50,0], [50,30]])` vs `polygon([[0,0], [50,30], [50,0]])` gets either a triangle or nothing, with no error.

**ForgeCAD's fix:** All entry points that accept raw points auto-fix winding:
- `polygon(points)` — computes signed area, reverses if CW
- `path().close()` — same fix

**Signed area test** (shoelace formula):
```
signedArea = Σ (x₂ - x₁)(y₂ + y₁)
```
If `signedArea > 0` → CW → reverse to make CCW.

**Implementation:** `src/forge/sketch/primitives.ts` (polygon), `src/forge/sketch/path.ts` (close).

**Rule for new code:** Any function that takes user-provided point arrays and creates a `CrossSection` MUST auto-fix winding. Never pass raw user points to Manifold without this check.

## Coordinate System (Z-up vs Y-up)

**The problem:** Three.js uses Y-up. CAD convention (and ForgeCAD) uses Z-up.

**ForgeCAD's fix:** We set `camera.up = (0, 0, 1)` everywhere. Geometry coordinates are native Z-up — no matrix swizzling. The camera orientation handles the visual mapping.

**Where this matters:**
- `camera.up.set(0, 0, 1)` in `sceneBuilder.ts` and `render.ts`
- GizmoViewcube face labels remapped (see coordinate-system.md)
- Grid plane is XY (Z=0)
- Extrusion goes along +Z
- Revolution axis is Y (sketch plane), result maps to Z-up space

**Rule for new code:** Never swap Y/Z in geometry. Always fix it at the camera/renderer level.

## Revolution Axis

**What it is:** `CrossSection.revolve()` in Manifold revolves around the Y axis. The sketch profile must be in the X-Y plane with X = radius (distance from axis) and Y = height.

**The mapping:**
- Profile X coordinate → radial distance from center
- Profile Y coordinate → height (becomes Z after revolution)
- Profile must be on the positive X side (X > 0) for valid geometry

**Rule for new code:** Document which axis any new sweep/revolution operation uses. If it differs from user expectation, add a transform wrapper.

## Boolean Winding (3D)

**What it is:** Manifold requires consistent face normals (outward-pointing) for boolean operations. Manifold handles this internally for its own primitives, but imported meshes or degenerate operations can produce inside-out faces.

**ForgeCAD's fix:** We only create meshes through Manifold's own constructors (`extrude`, `revolve`, `cylinder`, `sphere`, etc.), which guarantee correct normals. No raw mesh import path exists yet.

**Rule for new code:** If adding mesh import (STL, OBJ), run `Manifold.asOriginal()` or validate manifoldness before allowing booleans.

## Transform Order

**What it is:** Transforms are applied in call order (left to right in the chain). `shape.translate(10,0,0).rotate(0,0,45)` first moves, then rotates around origin — so the shape orbits.

**Convention:** This matches the standard "post-multiply" convention. No surprises here, but worth noting because some systems (OpenSCAD) apply transforms in reverse order.

For explicit transform objects:
- `A.mul(B)` means **apply A, then B**.
- `composeChain(A, B, C)` means **A -> B -> C**.

**Rule for new code:** Keep this chain order everywhere. Document any operation that deviates.

## Assembly Frame Composition

This is where regressions are most likely if convention is unclear.

For a point in child geometry-local coordinates:
- local -> `childBase` -> `jointMotion(value)` -> `jointFrame` -> `parentWorld`

In Forge chain notation:
```ts
childWorld = composeChain(childBase, jointMotion, jointFrame, parentWorld)
```

Equivalent matrix-style equation (for reference):
```txt
T_world_child = T_parent_world * T_joint_frame * T_joint_motion * T_child_base
```

**Rule for new code:** In kinematics/assembly code, prefer `composeChain(...)` over manual `.mul(...).mul(...)` sequences to avoid order mistakes.

## Summary of Shield Points

These are the places where ForgeCAD translates between "what the user means" and "what the kernel needs":

| Convention | User sees | Kernel needs | Where we fix it |
|---|---|---|---|
| Winding | Any point order | CCW | `polygon()`, `path().close()` |
| Up axis | Z-up | Y-up (Three.js) | `camera.up`, gizmo labels |
| Revolution | "revolve this profile" | Profile in X-Y, X>0 | Documented, not auto-fixed |
| Face normals | Doesn't think about it | Outward-pointing | Manifold constructors |
| Transform order | Left-to-right chain | Post-multiply | Native match, no fix needed |

When adding new geometry operations, check this table. If the operation introduces a new convention mismatch between user intent and kernel requirement, either auto-fix it (preferred) or document it clearly in the API docs.
````

### docs/permanent/API/model-building/positioning.md

````markdown
# Positioning Strategy

**This is the most important page for building multi-part assemblies.** Most positioning bugs come from manual coordinate arithmetic. Use the methods below in priority order.

## Priority Order

### 1. `attachTo()` — Default choice for child-on-parent positioning

When placing a part relative to another part, use `attachTo()`. It reads as English: "put my bottom on your top."

```javascript
const base = box(100, 100, 10);

// Column stands on top of base, centered
const column = cylinder(50, 8).attachTo(base, 'top', 'bottom');

// Button sticks out from front face, near top-right corner
const button = box(10, 4, 6, true)
  .attachTo(panel, 'top-front-right', 'top-back-right', [5, -2, -10]);
```

**How to read it:** `child.attachTo(parent, parentAnchor, selfAnchor, offset)`
- `parentAnchor` = "where on the parent do I want to attach?"
- `selfAnchor` = "which part of myself aligns to that point?"
- `offset` = "then shift by this much" (optional)

**Common patterns:**
| Intent | parentAnchor | selfAnchor | Why |
|--------|-------------|------------|-----|
| Stack on top | `'top'` | `'bottom'` | Bottom of child meets top of parent |
| Hang below | `'bottom'` | `'top'` | Top of child meets bottom of parent |
| Stick out from front | `'front'` | `'back'` | Back of child flush with front of parent |
| Protrude from side | `'left'` | `'right'` | Right face of child meets left face of parent |

### 2. `pointAlong()` — Orient cylinders/extrusions before positioning

Cylinders default to Z-up. Instead of `rotate(90, 0, 0)` (which is confusing), use `pointAlong()`:

```javascript
// Pipe running along Y axis
const pipe = cylinder(100, 5).pointAlong([0, 1, 0]);

// Axle along X
const axle = cylinder(80, 3).pointAlong([1, 0, 0]);
```

**Always call `pointAlong()` BEFORE `attachTo()` or `translate()`** — it reorients around the origin.

```javascript
// Correct: orient first, then position
const grille = cylinder(4, 30)
  .pointAlong([0, 1, 0])
  .attachTo(outdoorUnit, 'back', 'front', [0, 2, 0]);
```

### 3. `moveToLocal()` — Position relative to another shape's corner

When you need to place something at a specific offset from another shape's bounding box origin (min corner):

```javascript
const base = box(100, 100, 10);
const part = box(20, 20, 30).moveToLocal(base, 10, 10, 10);
```

### 4. `translate()` — Only for simple offsets or connecting independently-positioned parts

Use `translate()` when:
- Moving a shape by a known fixed amount
- Positioning between two shapes whose locations you've already computed via `boundingBox()`

```javascript
// Pipe spanning between two independently-positioned units
const bb1 = indoor.boundingBox();
const bb2 = outdoor.boundingBox();
const pipeLen = bb2.min[1] - bb1.max[1];
const pipe = cylinder(pipeLen, 5)
  .pointAlong([0, 1, 0])
  .translate(40, (bb1.max[1] + bb2.min[1]) / 2, bb1.min[2] + 15);
```

### 5. `placeReference()` / named import references — For reusable multi-file parts

When a part will be imported elsewhere, define semantic placement references once in the source file:

```javascript
// widget.forge.js
return union(base, post).withReferences({
  points: {
    mount: [0, -16, -4],
  },
  objects: {
    post,
  },
});
```

Then consume them in the importing file:

```javascript
const widget = importPart("widget.forge.js")
  .placeReference("mount", [120, 40, 0]);

const cap = box(18, 18, 8, true)
  .attachTo(widget, "objects.post.top", "bottom");
```

Use this when manual coordinate math starts to feel like assembly bookkeeping.

## Common Mistakes

### ❌ Manual center-offset math
```javascript
// BAD: easy to get wrong, hard to read
const child = box(w, d, h, true)
  .translate(0, -parentThickness/2 - d/2 - 5, parentHeight/2 - h/2 - 20);
```

### ✅ Anchor-based positioning
```javascript
// GOOD: intent is clear, no arithmetic
const child = box(w, d, h, true)
  .attachTo(parent, 'top-front', 'top-back', [0, -5, -20]);
```

### ❌ rotate() for cylinder orientation
```javascript
// BAD: which axis? what happens to center?
const pipe = cylinder(100, 5).rotate(90, 0, 0).translate(x, y, z);
```

### ✅ pointAlong() for cylinder orientation
```javascript
// GOOD: reads as "pipe pointing along Y"
const pipe = cylinder(100, 5).pointAlong([0, 1, 0]).translate(x, y, z);
```

## Anchor Reference

See the [main API doc](API.md#3d-anchor-positioning) for the full list of 26 anchor names. Quick mental model:

- **1 word** = face center: `'top'`, `'front'`, `'left'`...
- **2 words** = edge midpoint: `'top-front'`, `'back-left'`...
- **3 words** = corner: `'top-front-left'`, `'bottom-back-right'`...
````

### docs/permanent/API/model-building/reference.md

````markdown
# ForgeCAD Model-Building Reference

This file covers the script authoring surface for geometry, sketches, topology, assemblies, imports, and reusable parts.

It intentionally excludes:
- viewport-only APIs in [../runtime/viewport.md](../runtime/viewport.md)
- report/export APIs in [../output/bom.md](../output/bom.md), [../output/dimensions.md](../output/dimensions.md), and [../output/brep-export.md](../output/brep-export.md)
- implementation notes in [../internals/manifold.md](../internals/manifold.md)

## Core Concepts

ForgeCAD scripts are JavaScript code that returns geometry. The forge API is globally available — no imports needed.

### Basic Structure
```javascript
// 1. Declare parameters (creates UI sliders)
const width = param("Width", 50, { min: 20, max: 100, unit: "mm" });

// 2. Create geometry
const shape = box(width, 30, 10);

// 3. Return the final shape
return shape;
```

### Execution Model
- Scripts execute on every parameter change (400ms debounce)
- All operations are **immutable** — they return new shapes, never modify in place
- Must return one of:
  - A `Shape` (3D solid)
  - A `Sketch` (2D profile — rendered flat on XY plane)
  - A `TrackedShape` (3D solid with named faces/edges — auto-unwrapped)
  - A `ShapeGroup` (multiple shapes/sketches grouped for joint transforms)
  - An `Array` of shapes/sketches/groups (multi-object scene)
  - An `Array` of `{ name, shape?, sketch?, color? }` objects (named multi-object scene)

### ⚠️ Important: Unions Remove Colors

When you use `union()` to combine shapes, the result becomes a single solid mesh with only one color. Individual colors assigned to the original shapes are lost:

```javascript
// ❌ BAD: Colors are lost after union!
const red = box(30, 30, 30).color('#ff0000');
const blue = box(20, 20, 20).translate(30, 0, 0).color('#0066ff');
return union(red, blue);  // Result is all one color (red)
```

**Solution**: Return objects as a composite response instead:

```javascript
// ✅ GOOD: Each object keeps its color
const red = box(30, 30, 30).color('#ff0000');
const blue = box(20, 20, 20).translate(30, 0, 0).color('#0066ff');

// Return as named objects to preserve individual colors and materials
return [
  { "label": red },    // Each gets its own color, toggle, and controls
  { "label": blue }
];
```

Each object in the returned array stays independently colorable and selectable, which is the main alternative to booleaning everything into one solid.

### Coordinate System
ForgeCAD uses **Z-up** right-handed coordinates:
- **X** = left/right
- **Y** = forward/back
- **Z** = up/down

See [coordinate-system.md](coordinate-system.md) for view mapping details.

## Parameters

### `param(name, default, options?)`
Declares a parameter and creates a UI slider.

**Parameters:**
- `name` (string) - Display name in UI
- `default` (number) - Initial value
- `options` (object, optional):
  - `min` (number) - Minimum value (default: 0)
  - `max` (number) - Maximum value (default: default * 4)
  - `step` (number) - Slider increment (auto-calculated if not provided)
  - `unit` (string) - Display unit like "mm", "°", "%"
  - `integer` (boolean) - If true, value is always rounded to whole number. Step defaults to 1. Use for counts, quantities, sides, etc.

**Returns:** Current parameter value (number)

**Examples:**
```javascript
const width = param("Width", 50);
const angle = param("Angle", 45, { min: 0, max: 180, unit: "°" });
const thick = param("Thickness", 2, { min: 0.5, max: 10, step: 0.5, unit: "mm" });
const count = param("Count", 5, { min: 1, max: 20, integer: true });
```

## Colors

Both Shape and Sketch support colors via `.color()`:

```javascript
const red = box(50, 50, 50).color('#ff0000');
const blue = circle2d(25).color('#0066ff');
```

Colors are preserved through transforms and boolean operations (the first operand's color wins).

When returning multiple objects, colors can also be set per-object:

```javascript
return [
  { name: "Base", shape: box(100, 100, 5), color: "#888888" },
  { name: "Column", shape: cylinder(50, 10).translate(50, 50, 5), color: "#4488cc" },
];
```

## 3D Primitives

### `box(x, y, z, center?)`
Creates a rectangular box with named faces and edges.

**Parameters:**
- `x, y, z` (number) - Dimensions
- `center` (boolean, optional) - If true, centers at origin. Default: false (corner at origin)

**Returns:** `TrackedShape` (with faces: top, bottom, side-left, side-right, side-top, side-bottom; edges: vert-bl, vert-br, vert-tr, vert-tl, etc.)

```javascript
const cube = box(50, 50, 50, true);  // Centered cube
const plate = box(100, 80, 5);        // Corner at origin
plate.face('top');                     // FaceRef { normal, center, planar, uAxis, vAxis }
plate.edge('vert-bl');                 // EdgeRef { start, end }
```

### `cylinder(height, radius, radiusTop?, segments?, center?)`
Creates a cylinder or cone with named faces and edges.

**Parameters:**
- `height` (number) - Height along Z axis
- `radius` (number) - Bottom radius
- `radiusTop` (number, optional) - Top radius. If different from radius, creates a cone. Default: same as radius
- `segments` (number, optional) - Number of sides. Default: auto (smooth circle)
- `center` (boolean, optional) - If true, centers along Z. Default: false

**Returns:** `TrackedShape` (with faces: top, bottom, side; edges: top-rim, bottom-rim)

```javascript
const cyl = cylinder(50, 10);              // Cylinder
const cone = cylinder(50, 20, 5);          // Cone (tapered)
const hex = cylinder(10, 15, 15, 6);       // Hexagonal prism
cyl.face('top');                            // FaceRef (planar)
cyl.face('side');                           // FaceRef (curved, planar === false)
```

### `sphere(radius, segments?)`
Creates a sphere.

**Parameters:**
- `radius` (number) - Sphere radius
- `segments` (number, optional) - Tessellation detail. Default: auto (smooth)

**Returns:** `Shape`

```javascript
const ball = sphere(25);
const lowPoly = sphere(25, 8);  // Octahedron-like
```

## 3D Transforms

All transforms are **chainable** and **immutable** (return new shapes).
The core 3D transform set uses the same names/signatures on `Shape`, `TrackedShape`, and `ShapeGroup`.
For mixed groups that include `Sketch` children, `transform` / `rotateAround` / `pointAlong` are 3D-only.

### `.clone()` / `.duplicate()`
Create an explicit copy handle of a shape (same geometry/color) so you can branch variants clearly.

```javascript
const bracket = box(60, 20, 8);
const left = bracket.clone().translate(-40, 0, 0);
const right = bracket.duplicate().translate(40, 0, 0);
```

### `.translate(x, y, z)`
Moves the shape relative to its current position.

```javascript
const moved = box(10, 10, 10).translate(50, 0, 0);
```

### `.moveTo(x, y, z)`
Positions the shape so its bounding box min corner is at the given global coordinate.

```javascript
// Place a box at exactly (100, 50, 0) in world space
const placed = box(30, 30, 10).moveTo(100, 50, 0);
```

### `.moveToLocal(target, x, y, z)`
Positions the shape relative to another shape's local coordinate system (bounding box min corner).

**Parameters:**
- `target` (Shape | TrackedShape) — The reference shape
- `x, y, z` (number) — Offset from target's bounding box min corner

```javascript
const base = box(100, 100, 10);
const part = box(20, 20, 30);

// Place part at (10, 10, 10) relative to base's origin corner
const placed = part.moveToLocal(base, 10, 10, 10);
```

### `.rotate(x, y, z)`
Rotates using Euler angles in **degrees**.

**Parameters:**
- `x, y, z` (number) - Rotation in degrees around each axis

```javascript
const rotated = box(50, 20, 10).rotate(0, 0, 45);  // 45° around Z
const tilted = cylinder(50, 10).rotate(90, 0, 0);  // Lay on side
```

### `.scale(v)`
Scales the shape.

**Parameters:**
- `v` (number | [number, number, number]) - Uniform scale or per-axis scale

```javascript
const bigger = sphere(10).scale(2);           // 2x larger
const stretched = box(10, 10, 10).scale([2, 1, 0.5]);  // Non-uniform
```

### `.mirror(normal)`
Mirrors across a plane defined by its normal vector.

**Parameters:**
- `normal` ([number, number, number]) - Plane normal (doesn't need to be unit length)

```javascript
const mirrored = shape.mirror([1, 0, 0]);  // Mirror across YZ plane
```

### `.transform(m)`
Applies a custom 4x4 transform matrix or `Transform` object.

**Parameters:**
- `m` (`number[] | Transform`) - 4x4 column-major matrix (`number[16]`) or a `Transform`

```javascript
const T = Transform.identity()
  .translate(0, 0, 1.5)
  .rotateAxis([1, 0, 0], 35, [0, hingeY, 0]);

const moved = lid.transform(T);
```

### `.rotateAround(axis, angleDeg, pivot?)`
Rotates around an arbitrary axis through a pivot point.

**Parameters:**
- `axis` ([number, number, number]) - Rotation axis direction
- `angleDeg` (number) - Rotation angle in degrees
- `pivot` ([number, number, number], optional) - Pivot point. Default: origin

```javascript
// Rotate a door 45° around Z axis at the hinge position
const opened = door.rotateAround([0, 0, 1], 45, [hingeX, hingeY, 0]);
```

### `.pointAlong(direction)`
Reorients a shape so its primary axis (Z) points along the given direction. Useful for laying cylinders and extrusions along X or Y without thinking about Euler angles.

**Parameters:**
- `direction` ([number, number, number]) - Target direction vector

```javascript
// Lay a cylinder along the X axis
const axle = cylinder(100, 5).pointAlong([1, 0, 0]);

// Symmetric hinges pointing outward from center
const hingeL = cylinder(40, 5).pointAlong([-1, 0, 0]).translate(-50, 0, 0);
const hingeR = cylinder(40, 5).pointAlong([1, 0, 0]).translate(50, 0, 0);
```

### `Transform` primitives (for kinematic chains)
Use `Transform` when manual pivot math becomes hard to maintain.

```javascript
const T = Transform.identity()
  .translate(0, 0, 120)
  .rotateAxis([0, 0, 1], 35);

const p = T.point([10, 0, 0]);   // transform a point
const v = T.vector([1, 0, 0]);   // transform a direction (no translation)
```

Core methods:
- `Transform.identity()`
- `Transform.translation(x, y, z)`
- `Transform.rotationAxis(axis, angleDeg, pivot?)`
- `Transform.scale(v)`
- `T.mul(other)` (chain-composition order)
- `composeChain(a, b, c, ...)` explicit left-to-right chain composition
- `T.inverse()`
- `shape.transform(T)` / `trackedShape.transform(T)` / `group.transform(T)`

## Joints

### `joint(name, shape, pivot, opts?)`
Create a revolute (hinge) joint. Auto-creates a param slider and rotates the shape.

**Parameters:**
- `name` (string) - Display name for the angle parameter
- `shape` (Shape) - The shape to rotate
- `pivot` ([number, number, number]) - The pivot point
- `opts` (object, optional):
  - `axis` ([number, number, number]) - Rotation axis. Default: [0, 0, 1] (Z axis)
  - `min` (number) - Minimum angle. Default: 0
  - `max` (number) - Maximum angle. Default: 360
  - `default` (number) - Initial angle. Default: 0
  - `unit` (string) - Display unit. Default: "°"

**Returns:** `Shape` (rotated by the current slider value)

```javascript
// One line: creates a "Lid Angle" slider and rotates the lid around the hinge
const openLid = joint("Lid Angle", lid, [0, boxDepth, boxHeight], {
  axis: [1, 0, 0],
  max: 120,
  default: 45,
});
```

## Assembly Graph (Mechanisms)

See also: `assembly.md`.

### `assembly(name?)`
Creates an assembly container with named parts + joints.

```javascript
const mech = assembly("Two-Link Arm")
  .addPart("base", box(80, 80, 20, true))
  .addPart("link1", box(120, 24, 24).translate(0, -12, -12))
  .addPart("link2", box(100, 20, 20).translate(0, -10, -10))
  .addJoint("shoulder", "revolute", "base", "link1", {
    axis: [0, 1, 0],
    min: -30, max: 120, default: 20,
    frame: Transform.identity().translate(0, 0, 20),
  })
  .addJoint("elbow", "revolute", "link1", "link2", {
    axis: [0, 1, 0],
    min: -20, max: 140, default: 40,
    frame: Transform.identity().translate(120, 0, 0),
  });

const solved = mech.solve();
return solved.toScene();
```

Linked joint example:

```javascript
mech
  .addJointCoupling("Top Gear", {
    terms: [
      { joint: "Steering", ratio: 1 },
      { joint: "Wheel Drive", ratio: 20 / 14 },
    ],
  })
  .addJointCoupling("Motor 1", {
    terms: [{ joint: "Top Gear", ratio: -2 }],
  });
```

Gear helper example:

```javascript
const pair = lib.gearPair({
  pinion: { module: 1.25, teeth: 14, faceWidth: 8 },
  gear: { module: 1.25, teeth: 42, faceWidth: 8 },
});

mech.addGearCoupling("Driven", "Pinion", { pair }); // uses pair.jointRatio
```

Bevel/face helper example:

```javascript
const bevel = lib.bevelGearPair({
  pinion: { module: 1.5, teeth: 18, faceWidth: 10 },
  gear: { module: 1.5, teeth: 36, faceWidth: 9 },
  shaftAngleDeg: 90,
});

const face = lib.faceGearPair({
  pinion: { module: 1.5, teeth: 16, faceWidth: 8 },
  gear: { module: 1.5, teeth: 48, faceWidth: 7, toothHeight: 1.2 },
});

mech.addGearCoupling("Bevel Driven", "Bevel Driver", { pair: bevel });
mech.addGearCoupling("Face Driven", "Face Driver", { pair: face });
```

Key methods:
- `addPart(name, shape, { transform?, metadata? })`
- `addFrame(name, { transform? })` for virtual mechanism frames
- `addJoint(name, type, parent, child, opts)` where `type` is `'fixed' | 'revolute' | 'prismatic'`
- `addRevolute(...)`, `addPrismatic(...)`, `addFixed(...)` shorthand helpers
- `addJointCoupling(jointName, { terms, offset? })` for linked joints:
  - `jointName`: driven joint
  - `terms`: `[{ joint, ratio? }, ...]` where each source contributes `ratio * sourceValue` (default ratio `1`)
  - `offset`: additive bias after term sum (default `0`)
- `addGearCoupling(drivenJoint, driverJoint, opts)` for revolute gear meshes:
  - ratio source (exactly one): `ratio`, `pair` (`pair.jointRatio`), or `driverTeeth + drivenTeeth`
  - `mesh`: `'external' | 'internal' | 'bevel' | 'face'` (teeth mode only, default `'external'`; `bevel`/`face` follow external sign)
  - `offset`: additive bias after gear ratio
- `solve(state?)` with per-joint value overrides
- `sweepJoint(jointName, from, to, steps, baseState?, collisionOptions?)`

Solved assembly helpers:
- `solved.toScene()` for rendering
- `solved.collisionReport()` for interference checks
- `solved.minClearance(partA, partB, searchLength?)`
- `solved.bom()` / `solved.bomCsv()`
- `bomToCsv(rows)` (standalone helper)

### `robotExport(options)`
Declares that the current script should also export an `assembly(...)` as a robot package for the SDF CLI.

Key fields:
- `assembly`: required source assembly graph
- `modelName`: simulator-facing model name
- `links.<part>.massKg` or `densityKgM3`: inertial hints
- `joints.<joint>.effort|velocity|damping|friction`: simulator tuning
- `plugins.diffDrive`: diff-drive plugin wiring for Gazebo
- `world.generateDemoWorld`: emit a simple obstacle-course world alongside the model

Example:

```javascript
robotExport({
  assembly: mech,
  modelName: "Forge Scout",
  links: {
    Base: { massKg: 12 },
  },
  plugins: {
    diffDrive: {
      leftJoints: ["leftFront", "leftRear"],
      rightJoints: ["rightFront", "rightRear"],
      wheelSeparationMm: 320,
      wheelRadiusMm: 72,
    },
  },
});
```

## 3D Boolean Operations

### `union(...shapes)`
Combines shapes (additive).

```javascript
const combined = union(
  box(50, 50, 10),
  cylinder(20, 15).translate(25, 25, 10)
);
```

### `difference(...shapes)`
Subtracts shapes[1..n] from shapes[0].

```javascript
const plate = box(100, 100, 5);
const hole = cylinder(6, 10);
const result = difference(plate, hole.translate(50, 50, 0));

// Or using method syntax:
const result = plate.subtract(hole.translate(50, 50, 0));
```

### `intersection(...shapes)`
Keeps only overlapping volume.

```javascript
const overlap = intersection(
  sphere(30),
  box(40, 40, 40, true)
);
```

### Method Syntax
Shapes also have boolean methods:

```javascript
shape.add(other)       // Same as union(shape, other)
shape.subtract(other)  // Same as difference(shape, other)
shape.intersect(other) // Same as intersection(shape, other)
```

## Group

### `group(...items)`
Groups multiple shapes/sketches for joint transforms without merging them into a single mesh. Unlike `union`, colors and individual identities are preserved.

**Parameters:**
- `...items` (Shape | Sketch | TrackedShape | ShapeGroup) - Items to group (nested groups allowed)

**Returns:** `ShapeGroup`

```javascript
const base = box(100, 100, 5).color('#888888');
const column = cylinder(40, 5).translate(50, 50, 5).color('#4488cc');

// Group them — they stay separate but transform together
const assembly = group(base, column).translate(200, 0, 0);
return assembly;
```

### ShapeGroup Methods
All transforms are chainable and return a new ShapeGroup:

```javascript
group.translate(x, y, z)
group.moveTo(x, y, z)
group.moveToLocal(target, x, y, z)
group.rotate(x, y, z)
group.rotateAround(axis, angleDeg, pivot?)
group.pointAlong(direction)
group.transform(m)
group.scale(v)
group.mirror(normal)
group.color(hex)  // applies to all children
group.clone()
group.duplicate() // alias
```

`group.rotateAround(...)` is convenience sugar for `group.transform(Transform.rotationAxis(...))`.
`group.pointAlong(...)` is convenience sugar for a group-wide axis rotation from Z to `direction`.

```javascript
const hingeY = 40;
const lid = group(shell, logo);

const openedA = lid.rotateAround([1, 0, 0], 35, [0, hingeY, 0]); // sugar
const openedB = lid.transform(Transform.rotationAxis([1, 0, 0], 35, [0, hingeY, 0])); // equivalent

const laidDown = lid.pointAlong([1, 0, 0]); // same intent as Shape/TrackedShape.pointAlong
```

When a ShapeGroup is returned from a script, each child becomes a separate viewport object with its own visibility/color controls.

## 3D Anchor Positioning

### `.attachTo(target, targetAnchor, selfAnchor?, offset?)`
Position a shape relative to another using named 3D anchor points based on bounding boxes.

Available on both `Shape` and `TrackedShape`.

**Parameters:**
- `target` (Shape | TrackedShape) — The shape to attach to
- `targetAnchor` (Anchor3D) — Point on target
- `selfAnchor` (Anchor3D, optional) — Point on this shape to align. Default: 'center'
- `offset` ([number, number, number], optional) — Additional offset after alignment

**Anchor3D values:**
- `'center'` — bounding box center
- Face centers (1 axis pinned): `'front'` (−Y), `'back'` (+Y), `'left'` (−X), `'right'` (+X), `'top'` (+Z), `'bottom'` (−Z)
- Edge midpoints (2 axes pinned): `'front-left'`, `'front-right'`, `'back-left'`, `'back-right'`, `'top-front'`, `'top-back'`, `'top-left'`, `'top-right'`, `'bottom-front'`, `'bottom-back'`, `'bottom-left'`, `'bottom-right'`
- True corners (3 axes pinned): `'top-front-left'`, `'top-front-right'`, `'top-back-left'`, `'top-back-right'`, `'bottom-front-left'`, `'bottom-front-right'`, `'bottom-back-left'`, `'bottom-back-right'`

Anchor word order is flexible for built-ins: `'front-left'` and `'left-front'` are treated the same.

**Returns:** Same type as caller (Shape or TrackedShape)

```javascript
const base = box(100, 100, 10);
const column = cylinder(50, 8);

// Place column on top of base, centered
const placed = column.attachTo(base, 'top', 'bottom');

// Stack boxes: place b on top of a, aligned at back-left corner
const a = box(50, 50, 20);
const b = box(30, 30, 10);
const stacked = b.attachTo(a, 'top-back-left', 'bottom-back-left');

// Place with offset: center on top, then shift 10mm right
const shifted = column.attachTo(base, 'top', 'bottom', [10, 0, 0]);
```

### `.onFace(parent, face, opts?)`
Place a shape on a specific face of a parent shape. Think of it like sticking a label on a box surface.

**Parameters:**
- `parent` (Shape | TrackedShape) — The parent shape
- `face` ('front' | 'back' | 'left' | 'right' | 'top' | 'bottom') — Which face to place on
- `opts` (object, optional):
  - `u` (number) — Horizontal offset within the face (from center). Default: 0
  - `v` (number) — Vertical offset within the face (from center). Default: 0
  - `protrude` (number) — How far the child sticks out from the face. Default: 0

**Face coordinate mapping (u, v):**
- front/back: u = left/right (X), v = up/down (Z)
- left/right: u = forward/back (Y), v = up/down (Z)
- top/bottom: u = left/right (X), v = forward/back (Y)

**Returns:** Same type as caller

```javascript
const body = box(100, 40, 60, true);

// Vent on front face, centered, 15mm below center, protruding 2mm
const vent = box(80, 2, 12, true).color('#333')
  .onFace(body, 'front', { v: -15, protrude: 2 });

// Display near top-right of front face
const display = box(35, 1.5, 8, true).color('#00ddee')
  .onFace(body, 'front', { u: 20, v: 15, protrude: 1 });

// Fan on top, protruding 5mm
const fan = cylinder(10, 40).color('#333')
  .onFace(body, 'top', { protrude: 5 });

// Side vent on left face
const sideVent = box(2, 30, 40, true).color('#666')
  .onFace(body, 'left', { protrude: 1 });
```

**When to use `onFace()` vs `attachTo()`:**
- `onFace()` — placing surface details (vents, displays, buttons, labels) on a parent body
- `attachTo()` — stacking independent parts (column on base, unit on wall)

## Advanced 3D Operations

### `hull3d(...args)`
Convex hull of multiple shapes and/or points.

```javascript
const hull = hull3d(
  sphere(10),
  sphere(10).translate(50, 0, 0),
  [25, 0, 30],  // bare point
);
```

### `levelSet(sdf, bounds, edgeLength, level?)`
Create a shape from a signed distance function (SDF). Positive = inside.

```javascript
const gyroid = levelSet(
  ([x, y, z]) => Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x),
  { min: [-10, -10, -10], max: [10, 10, 10] },
  0.5,  // edge length (resolution)
);
```

### Smoothing

```javascript
// Mark edges for smoothing, then subdivide
const smooth = box(50, 50, 50, true)
  .smoothOut(60)     // edges sharper than 60° get smoothed
  .refine(4);        // subdivide 4 times

// Or refine by edge length / tolerance
shape.refineToLength(2);      // max edge length 2mm
shape.refineToTolerance(0.1); // max deviation 0.1mm from smooth surface
```

### Cutting

```javascript
// Split by another shape → [inside, outside]
const [inside, outside] = shape.split(cutter);

// Split by infinite plane → [below, above]
const [below, above] = shape.splitByPlane([0, 0, 1], 10);  // Z=10 plane

// Trim: keep only one side
const trimmed = shape.trimByPlane([0, 0, 1], 10);
```

### Warping

```javascript
// Deform vertices with arbitrary function
const warped = box(50, 50, 50, true).warp(([x, y, z]) => {
  // Twist around Z axis
  const angle = z * 0.05;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const nx = x * cos - y * sin;
  const ny = x * sin + y * cos;
  return [nx, ny, z];
});
```

### Plane Operations

```javascript
// Cross-section: intersect shape with a plane → Sketch
const section = intersectWithPlane(shape, { plane: 'XY', offset: 10 });

// Project: flatten shape onto a plane → Sketch
const shadow = projectToPlane(shape, { origin: [0, 0, 0], normal: [0, 0, 1] });
```

## 2D Sketches

Sketches are 2D profiles that can be extruded or revolved into 3D.

### 2D Primitives

#### `rect(width, height, center?)`
Rectangle.

```javascript
const r = rect(50, 30);
const centered = rect(50, 30, true);
```

#### `circle2d(radius, segments?)`
Circle.

```javascript
const c = circle2d(25);
const octagon = circle2d(25, 8);
```

#### `roundedRect(width, height, radius, center?)`
Rectangle with rounded corners.

```javascript
const rounded = roundedRect(60, 40, 5);
```

#### `polygon(points)`
Polygon from array of [x, y] points.

```javascript
const triangle = polygon([[0, 0], [50, 0], [25, 40]]);
```

#### `ngon(sides, radius)`
Regular polygon (equilateral).

```javascript
const hex = ngon(6, 25);
const triangle = ngon(3, 30);
```

#### `ellipse(rx, ry, segments?)`
Ellipse.

```javascript
const oval = ellipse(40, 20);
```

#### `slot(length, width)`
Oblong shape (rectangle with semicircle ends).

```javascript
const oblong = slot(60, 20);
```

#### `star(points, outerRadius, innerRadius)`
Star shape.

```javascript
const star5 = star(5, 30, 15);
```

### Path Builder

Fluent API for tracing 2D outlines point by point.

#### `path()`
Creates a new path builder.

```javascript
const triangle = path()
  .moveTo(0, 0)
  .lineH(50)
  .lineV(30)
  .close();
```

**Methods:**
- `.moveTo(x, y)` — Set starting point
- `.lineTo(x, y)` — Line to absolute position
- `.lineH(dx)` — Horizontal line (relative)
- `.lineV(dy)` — Vertical line (relative)
- `.lineAngled(length, degrees)` — Line at angle (0°=right, 90°=up)
- `.close()` — Close path into a `Sketch` (auto-fixes winding)
- `.stroke(width, join?)` — Thicken path into solid profile (see below)

### Stroke

Thicken a polyline (centerline) into a solid profile with uniform width. Proper miter joins at vertices.

#### `path().stroke(width, join?)`
#### `stroke(points, width, join?)`

**Parameters:**
- `width` (number) — Profile thickness
- `join` ('Square' | 'Round', optional) — Corner style. Default: 'Square' (miter)

**Returns:** `Sketch`

```javascript
// Fluent path builder
const bracket = path()
  .moveTo(0, 0)
  .lineH(50)
  .lineV(-70)
  .lineAngled(20, 235)
  .stroke(4);

// Or with point array
const bracket = stroke([[0, 0], [50, 0], [50, -70]], 4);

// Rounded corners
const rounded = stroke([[0, 0], [50, 0], [50, -50]], 4, 'Round');
```

### Curves & Surfacing

#### `spline2d(points, options?)`
Build a smooth Catmull-Rom spline sketch from 2D control points.

**Options:**
- `closed` (boolean) - Default: `true`
- `tension` (number, 0..1) - Default: `0.5`
- `samplesPerSegment` (number) - Default: `16`
- `strokeWidth` (number) - Required when `closed: false` (creates a stroked solid)
- `join` (`'Round' | 'Square'`) - Stroke corner style for open splines. Default: `'Round'`

```javascript
const closed = spline2d([[20,0],[12,10],[0,12],[-12,10],[-20,0],[0,-14]]);
const openRail = spline2d([[0,0],[30,20],[70,10]], { closed: false, strokeWidth: 3 });
```

#### `spline3d(points, options?)` / `Curve3D`
Create a reusable 3D spline curve object.

`Curve3D` methods:
- `.sample(count?)`
- `.sampleBySegment(samplesPerSegment?)`
- `.pointAt(t)` where `t` is `[0..1]`
- `.tangentAt(t)`
- `.length(samples?)`

```javascript
const rail = spline3d(
  [[0,0,0], [20,10,30], [40,0,60]],
  { tension: 0.45 }
);
```

#### `loft(profiles, heights, options?)`
Loft between multiple sketches along Z stations.

This implementation interpolates signed-distance fields and meshes via level-set extraction, so profiles can differ in vertex count/topology.

Performance note: `loft()` is significantly heavier than primitive/extrude/revolve paths. Use loft only when profile interpolation is required. If your part is axis-symmetric (bottles, vases, knobs, lathe-style parts), prefer `revolve()` for much faster generation.

**Parameters:**
- `profiles` (`Sketch[]`) - At least 2
- `heights` (`number[]`) - Same length as `profiles`, strictly increasing
- `options`:
  - `edgeLength` (number) - Mesh resolution
  - `boundsPadding` (number) - Extra level-set bounds padding

```javascript
const body = loft(
  [circle2d(20), roundedRect(30, 24, 6, true), circle2d(10)],
  [0, 40, 70],
  { edgeLength: 1.0 }
);
```

#### `sweep(profile, path, options?)`
Sweep a 2D profile along a 3D path (`Curve3D` or point polyline).

Performance note: `sweep()` also uses level-set meshing internally. Prefer direct primitives/extrude/revolve when they can express the same shape.

**Parameters:**
- `profile` (`Sketch`) - Local cross-section in XY plane
- `path` (`Curve3D | [x,y,z][]`)
- `options`:
  - `samples` (number) - Sampling count for `Curve3D` paths (default `48`)
  - `edgeLength` (number) - Mesh resolution
  - `boundsPadding` (number) - Extra level-set bounds padding
  - `up` (`[x,y,z]`) - Preferred frame-up vector

```javascript
const tubePath = spline3d([[0,0,0], [20,0,20], [40,10,30]]);
const tube = sweep(circle2d(3), tubePath, { samples: 36, edgeLength: 0.7 });
```

### Anchor Positioning

#### `.attachTo(target, targetAnchor, selfAnchor?, offset?)`
Position a sketch relative to another using named anchor points.

**Parameters:**
- `target` (Sketch) — The sketch to attach to
- `targetAnchor` (Anchor) — Point on target: 'center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right'
- `selfAnchor` (Anchor, optional) — Point on this sketch to align. Default: 'center'
- `offset` ([number, number], optional) — Additional offset after alignment

**Returns:** `Sketch`

```javascript
const plate = rect(50, 4);
const arm = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left');
return union2d(plate, arm);

// With offset: attach then shift 5mm right
const shifted = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left', [5, 0]);
```

#### `.onFace(parent, face, opts?)`
Place a sketch on a canonical or tracked planar 3D face so it renders there and extrudes along that face normal.

**Parameters:**
- `parent` (`Shape | TrackedShape`)
- `face` (`'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | string | FaceRef`)
- `opts` (object, optional):
  - `u` (number) - face-local horizontal offset from face center
  - `v` (number) - face-local vertical offset from face center
  - `protrude` (number) - offset along the face normal. Positive = outward
  - `selfAnchor` (`Anchor`) - 2D anchor to align to the face center. Default: `'center'`

**Returns:** `Sketch`

```javascript
const panel = box(120, 60, 40, true);

const logo = roundedRect(26, 10, 2, true)
  .onFace(panel, 'front', { v: 8 })
  .extrude(2);
```

Tracked planar faces can also be addressed by name or passed directly:

```javascript
const angled = Rectangle2D.from3Points(
  point(-30, -18),
  point(28, -6),
  point(18, 24),
).extrude(16);

const badge = roundedRect(18, 8, 2, true)
  .onFace(angled, 'side-right', { protrude: 0.05 })
  .extrude(1.2);

const cap = circle2d(5)
  .onFace(angled.face('top'), { u: 10, protrude: 0.05 })
  .extrude(1);
```

Curved tracked faces such as `cylinder(30, 10).face('side')` are not valid sketch targets.

#### `.rotateAround(degrees, pivot)`
Rotate around a specific point instead of origin.

```javascript
const hook = rect(4, 20).rotateAround(-35, [2, 0]);
```

### 2D Transforms

Same as 3D but in 2D:

```javascript
sketch.translate(x, y?)
sketch.rotate(degrees)
sketch.scale(v)  // v can be number or [x, y]
sketch.mirror([nx, ny])
sketch.clone()
sketch.duplicate() // alias
```

### 2D Boolean Operations

```javascript
union2d(...sketches)
difference2d(...sketches)
intersection2d(...sketches)
hull2d(...sketches)  // Convex hull

// Or method syntax:
sketch.add(other)
sketch.subtract(other)
sketch.intersect(other)
sketch.hull()
```

### 2D Operations

#### `.offset(delta, join?)`
Inflate (positive) or deflate (negative) the contour.

**Parameters:**
- `delta` (number) - Offset distance. Positive = outward, negative = inward
- `join` ('Square' | 'Round' | 'Miter', optional) - Corner style. Default: 'Round'

```javascript
const outer = rect(50, 30).offset(5);      // Expand by 5mm
const inner = circle2d(20).offset(-2);     // Shrink by 2mm
const sharp = ngon(6, 20).offset(3, 'Miter');
```

Use `offset(-r).offset(+r)` when you want to round **all convex corners** of a closed sketch.

#### `filletCorners(points, corners)`
Round only specific convex corners of a polygon point list.

```javascript
const roofPoints = [
  [0, 0],
  [90, 0],
  [90, 44],
  [66, 74],
  [45, 86],
  [24, 74],
  [0, 44],
];

const roof = filletCorners(roofPoints, [
  { index: 3, radius: 19 },
  { index: 4, radius: 19 },
  { index: 5, radius: 19 },
]);
```

Rules of thumb:
- `offset(-r).offset(+r)` rounds every convex corner in a closed profile
- `stroke(points, width, 'Round')` is for thickening a centerline, not for selectively rounding a polygon
- `hull2d()` of circles gives a blended convex cap/capsule silhouette
- `filletCorners(points, ...)` is the right choice when some corners stay sharp

#### `.simplify(epsilon?)`
Removes vertices that don't significantly affect the shape.

```javascript
const simplified = complexSketch.simplify(0.1);
```

### 2D → 3D Conversion

#### `.extrude(height, options?)`
Extrudes sketch along Z axis.

**Parameters:**
- `height` (number) - Extrusion height
- `options` (object, optional):
  - `twist` (number) - Twist angle in degrees
  - `divisions` (number) - Number of twist steps (needed for twist)
  - `scaleTop` (number | [number, number]) - Scale factor at top
  - `center` (boolean) - Center along Z axis

**Returns:** `TrackedShape` (with faces: top, bottom, side)

```javascript
const simple = rect(50, 30).extrude(10);

const twisted = ngon(6, 20).extrude(60, {
  twist: 90,
  divisions: 32
});

const tapered = circle2d(20).extrude(50, {
  scaleTop: 0.5
});
```

#### `.revolve(degrees?, segments?)`
Revolves sketch around Y axis (becomes Z in result).

Performance tip: for rotationally symmetric parts, `revolve()` should be the default choice. It is typically much faster and more stable than approximating the same form with multiple loft sections.

**Parameters:**
- `degrees` (number, optional) - Rotation angle. Default: 360 (full revolution)
- `segments` (number, optional) - Number of segments. Default: auto

**Returns:** `Shape`

```javascript
// Vase profile
const profile = polygon([[20, 0], [25, 30], [20, 60]]);
const vase = profile.revolve();

// Partial revolution (C-shape)
const partial = rect(5, 40).translate(20, 0).revolve(270);
```

## Named Entities & Topology

ForgeCAD provides first-class geometric entities with stable identity and named parts.

### Point2D
```javascript
const p = point(10, 20);
p.distanceTo(point(30, 40));
p.midpointTo(point(30, 40));
p.translate(5, 5);
p.toTuple();  // [10, 20]
```

### Line2D
```javascript
const l = line(0, 0, 50, 0);
l.length;       // 50
l.midpoint;     // Point2D
l.angle;        // degrees
l.direction;    // [1, 0]
l.parallel(10); // offset line

// Line-line intersection (infinite lines)
const l2 = line(25, -10, 25, 40);
l.intersect(l2);        // Point2D(25, 0) — treats as infinite lines
l.intersectSegment(l2); // Point2D or null — only if segments actually cross
```

### Circle2D
```javascript
const c = circle(0, 0, 25);
c.diameter;          // 50
c.pointAtAngle(90);  // Point2D at top
c.toSketch();        // convert to Sketch
c.extrude(30);       // TrackedShape with top/bottom/side faces
```

### Rectangle2D
```javascript
const r = rectangle(0, 0, 100, 60);
r.side('top');              // Line2D
r.vertex('bottom-left');    // Point2D
r.width; r.height; r.center;

// Diagonals — returns [bl-tr, br-tl] as Line2D pair
const [d1, d2] = r.diagonals();
const center = d1.intersect(d2);  // Point2D at center

r.toSketch();               // convert to Sketch
r.extrude(20);              // TrackedShape with named faces/edges
```

### TrackedShape (3D with topology)
```javascript
const box = rectangle(0, 0, 100, 60).extrude(20);

box.face('top');           // FaceRef { normal, center, planar, uAxis, vAxis }
box.face('side-left');     // side face from rect's left edge
box.edge('vert-bl');       // vertical edge at bottom-left corner
box.faceNames();           // all face names
box.edgeNames();           // all edge names

box.translate(50, 0, 0);  // preserves topology
box.rotate(0, 0, 15);     // same 3D transform surface as Shape
box.rotateAround([0, 0, 1], 45, [0, 0, 0]);
box.pointAlong([1, 0, 0]);
box.transform(Transform.translation(10, 0, 0));
box.scale([1.2, 1, 1]);
box.mirror([1, 0, 0]);
box.rotateAroundEdge('top-bottom', 90);  // rotate around named edge
box.geometryInfo();       // backend/representation/topology summary
box.toShape();             // unwrap to plain Shape for booleans
box.clone();               // explicit duplicate with topology
```

### Utility Functions
```javascript
degrees(45);    // 45 (identity — for readability)
radians(Math.PI / 4);  // 45 (converts radians to degrees)
```

## Patterns

### `linearPattern(shape, count, dx, dy, dz?)`
Repeat a shape along a direction vector.

```javascript
const row = linearPattern(cylinder(10, 3), 5, 20, 0);
```

### `circularPattern(shape, count, centerX?, centerY?)`
Repeat a shape around the Z axis.

```javascript
const holes = circularPattern(cylinder(12, 4).translate(30, 0, -1), 8);
```

### `mirrorCopy(shape, normal)`
Mirror and union with original.

```javascript
const full = mirrorCopy(box(50, 30, 10), [1, 0, 0]);
```

## Fillets & Chamfers

`filletCorners()` handles selective 2D polygon corners. The helpers below approximate 3D fillets and chamfers for vertical edges using topology references.

### `filletEdge(shape, edge, radius, quadrant?, segments?)`
```javascript
const b = rectangle(0, 0, 50, 50).extrude(20);
const filleted = filletEdge(b, b.edge('vert-br'), 5, [-1, -1]);
```

### `chamferEdge(shape, edge, size, quadrant?)`
```javascript
const chamfered = chamferEdge(b, b.edge('vert-br'), 3, [-1, -1]);
```

The `quadrant` parameter `[signX, signY]` indicates which direction the material is relative to the edge. `[-1, -1]` means material is in the −X, −Y direction.

## Arc Bridge

### `arcBridgeBetweenRects(rectA, rectB, segments?)`
Build a smooth arc surface connecting two rectangular areas via their closest parallel edges.

```javascript
const base = rectangle(0, 0, 300, 200);
const screen = rectangle(0, 200, 300, 200);
const hinge = arcBridgeBetweenRects(base, screen, 16);
```

## Constrained Sketches

Declarative constraint-based 2D sketching with automatic solving.

```javascript
const sketch = constrainedSketch();
const p1 = sketch.point(0, 0, true);  // fixed point
const p2 = sketch.point(50, 0);
const p3 = sketch.point(50, 30);
const l1 = sketch.line(p1, p2);
const l2 = sketch.line(p2, p3);

sketch.close();

Constraint.horizontal(sketch, l1);
Constraint.vertical(sketch, l2);
Constraint.length(sketch, l1, 50);

const result = sketch.solve();
// result is a ConstraintSketch (extends Sketch)
// result.constraintMeta.status → 'under' | 'fully' | 'over'
```

### Available Constraints
`Constraint.horizontal`, `Constraint.vertical`, `Constraint.makeParallel`, `Constraint.perpendicular`, `Constraint.equalLength`, `Constraint.distance`, `Constraint.length`, `Constraint.enforceAngle`, `Constraint.fix`, `Constraint.coincident`

Constraints accept both string IDs and entity objects (Point2D, Line2D) — entities are auto-imported into the builder.

## Multi-File Projects

ForgeCAD supports multi-file projects. Files are either **sketches** (`.sketch.js`, return a `Sketch`), **parts** (`.forge.js`, return a `Shape` or `TrackedShape`), or **SVG assets** (`.svg`, parsed into a `Sketch`).

### File Types
- `*.sketch.js` — 2D sketch file, must return a `Sketch`
- `*.forge.js` — 3D part file, must return a `Shape` or `TrackedShape`
- `*.svg` — vector artwork file, imported as sketch geometry

### Import Path Resolution
- `./file.forge.js`, `./file.sketch.js`, `./asset.svg` (and `../...`) resolve relative to the file that calls imports
- Bare paths like `api/bracket.forge.js` resolve from the opened project root
- Leading `/` is treated as project-root relative

### `importSketch(fileName, paramOverridesOrSvgOptions?)`
Imports a sketch and returns `Sketch`.

- For `*.sketch.js`: executes the file (must return `Sketch`)
- For `*.svg`: parses vector geometry into a `Sketch`

**Parameters:**
- `fileName` (string) — Import path (e.g. `"./profile.sketch.js"` or `"api/profile.sketch.js"`)
- `paramOverridesOrSvgOptions` (optional object)
  - For `*.sketch.js`: import-time param overrides by param name
  - For `*.svg`: SVG import options (see `importSvgSketch`)

**Returns:** `Sketch`

```javascript
// In a .forge.js file:
const profile = importSketch("bracket-profile.sketch.js", {
  "Width": 42,
  "Height": 18,
});
return profile.extrude(50);
```

```javascript
// Import SVG and keep only the largest connected region
const logo = importSketch("assets/logo.svg", {
  include: "auto",
  regionSelection: "largest",
  flattenTolerance: 0.25,
});
return logo.extrude(2);
```

### `importSvgSketch(fileName, options?)`
Parses an SVG file and returns a `Sketch`.

**Parameters:**
- `fileName` (string) — Import path to an `.svg`
- `options` (optional object):
  - `include`: `'auto' | 'fill' | 'stroke' | 'fill-and-stroke'` (default: `'auto'`)
  - `regionSelection`: `'all' | 'largest'` (default: `'all'`)
  - `maxRegions`: number (largest-first cap)
  - `minRegionArea`: number
  - `minRegionAreaRatio`: number (fraction of largest region area)
  - `flattenTolerance`: number (curve discretization tolerance)
  - `arcSegments`: number (minimum arc segment count)
  - `scale`: number (uniform scale factor)
  - `maxWidth`: number (uniformly downscale to keep final sketch width within this limit)
  - `maxHeight`: number (uniformly downscale to keep final sketch height within this limit)
  - `centerOnOrigin`: boolean (default: `false`, recenters final sketch bounds center to `(0, 0)`)
  - `simplify`: number (final simplify tolerance, default: `0`)
  - `invertY`: boolean (default: `true`, converts SVG Y-down to CAD Y-up)

**Returns:** `Sketch`

```javascript
const badge = importSvgSketch("assets/badge.svg", {
  include: "fill-and-stroke",
  minRegionAreaRatio: 0.001,
  maxRegions: 8,
  maxWidth: 120,
  maxHeight: 80,
  centerOnOrigin: true,
});
return badge;
```

### `importPart(fileName, paramOverrides?)`
Executes another file and returns its result as a `Shape`. The target file may return either `Shape` or `TrackedShape` (tracked results are auto-unwrapped to `Shape`).

**Parameters:**
- `fileName` (string) — Import path (e.g. `"./bracket.forge.js"` or `"api/bracket.forge.js"`)
- `paramOverrides` (optional object) — Import-time parameter overrides by param name

**Returns:** `Shape` (chainable)

```javascript
// Assembly: import parts and position them
const bracket = importPart("bracket.forge.js", { "Thickness": 4 });
const bracket2 = importPart("bracket.forge.js", { "Thickness": 8 })
  .translate(100, 0, 0)
  .rotate(0, 0, 180);

return union(bracket, bracket2);
```

Imported parts can also carry named placement references:

```javascript
// widget.forge.js
return union(base, post).withReferences({
  points: {
    mount: [0, -16, -4],
  },
  objects: {
    post,
  },
});
```

```javascript
// assembly.forge.js
const widget = importPart("widget.forge.js")
  .placeReference("mount", [120, 40, 0]);

const cap = box(18, 18, 8, true)
  .attachTo(widget, "objects.post.top", "bottom");

return [widget, cap];
```

### Import Rules
- Circular imports are detected and throw an error
- Imported files can be instantiated multiple times
- `paramOverrides` only affects that import call (other imports are independent)
- Params supplied through `paramOverrides` are treated as fixed arguments for that import call
- Relative imports (`./` / `../`) are resolved from the current file path
- `importPart()` accepts imported `Shape` or `TrackedShape` results and always returns a chainable `Shape`
- Source files can attach placement references with `.withReferences({ points, edges, surfaces, objects })`
- Imported tracked solids keep their named faces/edges as `surfaces.<faceName>` and `edges.<edgeName>` references
- SVG import supports deterministic region filtering (`regionSelection`, `maxRegions`, area thresholds)
- The returned `Shape` or `Sketch` is fully chainable — use `.translate()`, `.rotate()`, `.subtract()`, etc.

### Placement References

### `.withReferences({ points?, edges?, surfaces?, objects? })`
Attach named placement references to a `Shape` or `TrackedShape`. These references survive normal transforms and `importPart()`.

**Reference kinds:**
- `points`: exact 3D coordinates
- `edges`: `{ start, end }` segments; default reference point is the midpoint
- `surfaces`: `{ center, normal }`; default reference point is the center
- `objects`: bounding boxes derived from another shape/group or explicit `{ min, max }`

```javascript
const part = union(base, post).withReferences({
  points: {
    mount: [0, -16, -4],
  },
  edges: {
    postAxis: { start: [12, 0, 4], end: [12, 0, 30] },
  },
  surfaces: {
    mountingFace: { center: [0, -16, 0], normal: [0, -1, 0] },
  },
  objects: {
    base,
    post,
  },
});
```

### `.referenceNames(kind?)`
Lists named placement references on a shape.

```javascript
part.referenceNames();          // ['edges.postAxis', 'objects.base', 'objects.post', 'points.mount', ...]
part.referenceNames('points');  // ['mount']
```

### `.referencePoint(ref)`
Resolve a placement reference to a world-space point.

Supported forms:
- `mount` or `points.mount`
- `edges.postAxis`
- `edges.postAxis.start`
- `surfaces.mountingFace`
- `objects.post.top`

```javascript
const p = part.referencePoint("objects.post.top");
```

### `.placeReference(ref, [x, y, z], offset?)`
Translate a shape so the given placement reference lands on a target coordinate.

```javascript
const placed = importPart("widget.forge.js")
  .placeReference("mount", [120, 40, 0]);
```

### `attachTo()` with named references

`attachTo()` still accepts the built-in 3D anchors, but it can now also consume named placement references:

```javascript
const cap = box(18, 18, 8, true)
  .attachTo(widget, "objects.post.top", "bottom");
```

### Typical Project Structure
```
my-project/
├── base-profile.sketch.js    ← 2D cross-section
├── bracket.forge.js           ← extrudes the sketch, adds holes
└── assembly.forge.js          ← imports multiple parts, positions them
```

## Part Library

Pre-built parametric parts available via `lib.xxx()`. No imports needed.

### `lib.boltHole(diameter, depth)`
Through-hole cylinder (centered).

### `lib.fastenerHole(opts)`
Standardized metric hole helper with fits and optional counterbore/countersink.

```javascript
const m4 = lib.fastenerHole({
  size: "M4",
  fit: "normal",   // close | normal | loose | tap
  depth: 12,
  counterbore: { depth: 3.5 }, // diameter auto from size unless provided
});
```

### `lib.counterbore(holeDia, boreDia, boreDepth, totalDepth)`
Through-hole with wider recess at top.

### `lib.tube(outerX, outerY, outerZ, wall)`
Rectangular hollow tube.

### `lib.pipe(height, outerRadius, wall, segments?)`
Hollow cylinder.

### `lib.hexNut(acrossFlats, height, holeDia)`
Hex nut via intersection of 3 rotated slabs, with center bore.

### `lib.roundedBox(x, y, z, radius)`
Approximate rounded box via union of axis-aligned slabs.

### `lib.bracket(width, height, depth, thick, holeDia?)`
L-shaped mounting bracket with optional holes.

### `lib.holePattern(rows, cols, spacingX, spacingY, holeDia, depth)`
Grid of cylindrical holes.

### `lib.spurGear(options)`
Involute external spur gear with optional bore.

**Options:**
- `module` (number) - Metric module (pitch diameter / tooth count)
- `teeth` (integer) - Tooth count (>= 6)
- `faceWidth` (number) - Extrusion width along Z
- `pressureAngleDeg` (number, optional) - Default: `20`
- `backlash` (number, optional) - Tangential backlash at pitch circle. Default: `0`
- `clearance` (number, optional) - Root clearance. Default: `0.25 * module`
- `addendum` (number, optional) - Tooth addendum. Default: `module`
- `dedendum` (number, optional) - Tooth dedendum. Default: `addendum + clearance`
- `boreDiameter` (number, optional) - Center bore diameter
- `center` (boolean, optional) - Center extrusion around Z=0. Default: `true`
- `segmentsPerTooth` (number, optional) - Involute sampling quality. Default: `10`

```javascript
const pinion = lib.spurGear({
  module: 1.25,
  teeth: 14,
  faceWidth: 8,
  boreDiameter: 5,
});
```

### `lib.ringGear(options)`
Internal ring gear with involute-derived tooth spaces.

**Options:**
- `module` (number)
- `teeth` (integer, >= 12)
- `faceWidth` (number)
- `pressureAngleDeg` (number, optional) - Default: `20`
- `backlash` (number, optional) - Default: `0`
- `clearance` (number, optional) - Default: `0.25 * module`
- `addendum` (number, optional) - Default: `module`
- `dedendum` (number, optional) - Default: `addendum + clearance`
- `rimWidth` (number, optional) - Radial ring thickness outside tooth roots
- `outerDiameter` (number, optional) - Overrides `rimWidth` if provided
- `center` (boolean, optional) - Default: `true`
- `segmentsPerTooth` (number, optional) - Default: `10`

```javascript
const ring = lib.ringGear({
  module: 1.25,
  teeth: 58,
  faceWidth: 10,
  rimWidth: 4,
});
```

### `lib.rackGear(options)`
Linear rack gear with pressure-angle flanks.

**Options:**
- `module` (number)
- `teeth` (integer, >= 2)
- `faceWidth` (number)
- `pressureAngleDeg` (number, optional) - Default: `20`
- `backlash` (number, optional) - Default: `0`
- `clearance` (number, optional) - Default: `0.25 * module`
- `addendum` (number, optional) - Default: `module`
- `dedendum` (number, optional) - Default: `addendum + clearance`
- `baseHeight` (number, optional) - Rack body thickness behind root line
- `center` (boolean, optional) - Default: `true`

```javascript
const rack = lib.rackGear({
  module: 1.25,
  teeth: 24,
  faceWidth: 8,
  baseHeight: 3.5,
});
```

### `lib.bevelGear(options)`
Conical bevel gear generated from a tapered involute extrusion.

**Options:**
- `module` (number)
- `teeth` (integer, >= 6)
- `faceWidth` (number)
- `pressureAngleDeg` (number, optional) - Default: `20`
- `backlash` (number, optional) - Default: `0`
- `clearance` (number, optional) - Default: `0.25 * module`
- `addendum` (number, optional) - Default: `module`
- `dedendum` (number, optional) - Default: `addendum + clearance`
- `boreDiameter` (number, optional)
- pitch cone setup (choose one):
  - `pitchAngleDeg` (number, optional), or
  - `mateTeeth` (+ optional `shaftAngleDeg`, default `90`) for auto pitch-angle derivation
- `center` (boolean, optional) - Default: `true`
- `segmentsPerTooth` (number, optional) - Default: `10`

```javascript
const bevelPinion = lib.bevelGear({
  module: 1.5,
  teeth: 18,
  faceWidth: 10,
  mateTeeth: 36,
  shaftAngleDeg: 90,
  boreDiameter: 5,
});
```

### `lib.faceGear(options)`
Face/crown-style gear: radial teeth on the top face of a disk.

**Options:**
- `module` (number)
- `teeth` (integer, >= 8)
- `faceWidth` (number) - Base disk thickness
- `pressureAngleDeg` (number, optional) - Default: `20`
- `backlash` (number, optional) - Default: `0`
- `clearance` (number, optional) - Default: `0.25 * module`
- `addendum` (number, optional) - Default: `module`
- `dedendum` (number, optional) - Default: `addendum + clearance`
- `toothHeight` (number, optional) - Axial tooth protrusion above disk
- `rimWidth` (number, optional) - Extra radius outside tooth tips
- `boreDiameter` (number, optional)
- `center` (boolean, optional) - Default: `true`
- `segmentsPerTooth` (number, optional) - Default: `10`

```javascript
const face = lib.faceGear({
  module: 1.5,
  teeth: 48,
  faceWidth: 7,
  toothHeight: 1.2,
  boreDiameter: 10,
});
```

### `lib.gearPair(options)`
Build or validate a spur-gear pair and return ratio/backlash/mesh diagnostics.

Accepts either:
- spur gear shapes produced by `lib.spurGear(...)`, or
- analytical specs (`{ module, teeth, ... }`) for each member

**Options:**
- `pinion` (`Shape | GearPairSpec`) - input gear
- `gear` (`Shape | GearPairSpec`) - mating output gear
- `backlash` (number, optional) - target backlash used for auto center distance
- `centerDistance` (number, optional) - override center distance directly
- `place` (boolean, optional) - auto-place `gear` at +X center distance. Default: `true`
- `phaseDeg` (number, optional) - additional Z rotation applied to placed gear before translation

**Returns:** `GearPairResult` with:
- `pinion`, `gear` (shapes)
- `jointRatio`, `speedReduction`
- `centerDistance`, `centerDistanceNominal`, `backlash`
- `pressureAngleDeg`, `workingPressureAngleDeg`, `contactRatio`
- `diagnostics[]` and `status` (`ok | warn | error`)

```javascript
const pair = lib.gearPair({
  pinion: { module: 1.25, teeth: 14, faceWidth: 8, boreDiameter: 5 },
  gear: { module: 1.25, teeth: 42, faceWidth: 8, boreDiameter: 8 },
  backlash: 0.05,
});

if (pair.status !== 'ok') {
  console.warn(pair.diagnostics);
}

return [pair.pinion, pair.gear];
```

### `lib.bevelGearPair(options)`
Build or validate a bevel-gear pair and return ratio diagnostics plus recommended joint placement vectors.

Accepts either:
- bevel gear shapes produced by `lib.bevelGear(...)`, or
- analytical specs (`{ module, teeth, ... }`) for each member

**Options:**
- `pinion` (`Shape | GearPairSpec`)
- `gear` (`Shape | GearPairSpec`)
- `shaftAngleDeg` (number, optional) - Default: `90`
- `backlash` (number, optional)
- `place` (boolean, optional) - Apply recommended transforms to returned shapes. Default: `true`
- `phaseDeg` (number, optional) - Extra phase on the placed driven bevel gear

**Returns:** `BevelGearPairResult` with:
- `pinion`, `gear` (shapes)
- `jointRatio`, `speedReduction`
- `shaftAngleDeg`, `pinionPitchAngleDeg`, `gearPitchAngleDeg`, `coneDistance`
- `pinionAxis`, `gearAxis`, `pinionCenter`, `gearCenter` (joint setup helpers)
- `diagnostics[]` and `status` (`ok | warn | error`)

```javascript
const bevelPair = lib.bevelGearPair({
  pinion: { module: 1.5, teeth: 18, faceWidth: 10 },
  gear: { module: 1.5, teeth: 36, faceWidth: 9 },
  shaftAngleDeg: 90,
});
```

### `lib.faceGearPair(options)`
Build or validate a face-gear stage (face gear + pinion) and return ratio diagnostics plus recommended joint placement vectors.

Accepts:
- `pinion`: spur/bevel gear shape or `GearPairSpec`
- `gear`: face gear shape or `FaceGearPairSpec`

**Options:**
- `pinion` (`Shape | GearPairSpec`)
- `gear` (`Shape | FaceGearPairSpec`)
- `shaftAngleDeg` (number, optional) - Default: `90` (`90` is the calibrated auto-placement case)
- `backlash` (number, optional)
- `place` (boolean, optional) - Apply recommended transforms to returned shapes. Default: `true`
- `phaseDeg` (number, optional) - Extra phase around pinion axis

**Returns:** `FaceGearPairResult` with:
- `pinion`, `gear` (shapes)
- `jointRatio`, `speedReduction`
- `shaftAngleDeg`, `meshRadius`
- `pinionAxis`, `gearAxis`, `pinionCenter`, `gearCenter` (joint setup helpers)
- `diagnostics[]` and `status` (`ok | warn | error`)

```javascript
const facePair = lib.faceGearPair({
  pinion: { module: 1.5, teeth: 16, faceWidth: 8 },
  gear: { module: 1.5, teeth: 48, faceWidth: 7, toothHeight: 1.2 },
});
```

### `lib.tSlotProfile(options?)`
Build a 2D T-slot cross-section sketch.

This is a generic, tunable T-slot generator.

**Options:**
- `size` (number) - Outer profile size. Default: `20`
- `slotWidth` (number) - Slot mouth width. Default: `6`
- `slotInnerWidth` (number) - Wider interior slot cavity width. Default: `10.4`
- `slotDepth` (number) - Slot depth from outer face. Default: `6`
- `slotNeckDepth` (number) - Narrow mouth depth before widening. Default: `1.6`
- `wall` (number) - Outer shell thickness. Default: `1.4`
- `web` (number) - Central cross-web thickness. Default: `2.1`
- `centerBossDia` (number) - Center boss diameter. Default: `8.2`
- `centerBoreDia` (number) - Center bore diameter. Default: `4.2`
- `outerCornerRadius` (number) - Outer corner radius. Default: `1`
- `segments` (number) - Circle smoothness for 2D bores/bosses. Default: `36`

**Returns:** `Sketch`

```javascript
const profile = lib.tSlotProfile();
return profile; // 2D drawing-ready cross-section
```

### `lib.tSlotExtrusion(length, options?)`
Build a 3D extrusion from `lib.tSlotProfile(...)`.

**Parameters:**
- `length` (number) - Extrusion length along Z
- `options` - Same options as `lib.tSlotProfile(...)` plus:
  - `center` (boolean) - Center the length around Z=0. Default: `false`

**Returns:** `Shape`

```javascript
const rail = lib.tSlotExtrusion(300, { center: true });
```

### `lib.profile2020BSlot6Profile(options?)`
Profile-accurate 2D helper for a 20x20 B-type slot 6 section.

Defaults target common B-type 20x20 conventions:
- slot width `6.0`
- slot depth `5.5`
- center bore `5.5`
- center boss `8.4`
- diagonal web width `4.4`
- no edge pocket holes (only central bore is cut)

**Options:**
- `slotWidth` (number) - Default: `6.0`
- `slotInnerWidth` (number) - Default: `8.2`
- `slotDepth` (number) - Default: `5.5`
- `slotNeckDepth` (number) - Default: `1.8`
- `centerBoreDia` (number) - Default: `5.5` (set `0` to disable)
- `centerBossDia` (number) - Default: `8.4`
- `diagonalWebWidth` (number) - Default: `4.4`
- `outerCornerRadius` (number) - Default: `1.0`
- `segments` (number) - Default: `40`

```javascript
const profile2d = lib.profile2020BSlot6Profile();
```

### `lib.profile2020BSlot6(length, options?)`
3D extrusion helper built from `lib.profile2020BSlot6Profile(...)`.

Use `options` to override supplier-specific tolerances.
- Supports all profile options above
- Plus `center` (boolean) to center length about Z=0

```javascript
const profile = lib.profile2020BSlot6(500, { center: true });
```

### Exploded-view helpers
For scene-layout helpers such as `lib.explode(...)` and viewport explode overrides, see [../runtime/viewport.md](../runtime/viewport.md).

### `lib.pipeRoute(points, radius, options?)`
Route a pipe through 3D waypoints with smooth torus bends at corners.

**Parameters:**
- `points` ([number, number, number][]) - Array of 3D waypoints
- `radius` (number) - Pipe outer radius
- `options` (object, optional):
  - `bendRadius` (number) - Radius of bends at corners. Default: `radius * 4`
  - `wall` (number) - Wall thickness for hollow pipe. If omitted, pipe is solid
  - `segments` (number) - Circumferential segments. Default: 32

**Returns:** `Shape`

```javascript
// Solid copper pipe with 90° bends
const refrigPipe = lib.pipeRoute(
  [[0, 0, 0], [100, 0, 0], [100, 80, 0], [100, 80, 60]],
  4,
  { bendRadius: 20 }
).color('#B87333');

// Hollow drain pipe
const drainPipe = lib.pipeRoute(
  [[0, 0, 20], [60, 0, 20], [60, 80, 20]],
  3,
  { bendRadius: 15, wall: 1 }
).color('#CCCCCC');
```

### `lib.elbow(pipeRadius, bendRadius, angle?, options?)`
Curved pipe section (torus arc) for connecting two pipe directions. Creates a bend at the origin.

**Parameters:**
- `pipeRadius` (number) - Pipe outer radius
- `bendRadius` (number) - Centerline bend radius
- `angle` (number, optional) - Bend angle in degrees. Default: 90

**Options:**
- `wall` (number) - Wall thickness for hollow pipe
- `segments` (number) - Circumferential segments. Default: 32
- `from` ([number, number, number]) - Incoming direction vector
- `to` ([number, number, number]) - Outgoing direction vector (overrides angle)

**Alternative call:** `lib.elbow(pipeRadius, bendRadius, { from, to, wall, segments })`

```javascript
// Simple 90° elbow
const bend = lib.elbow(5, 20, 90);

// 45° hollow elbow
const bend45 = lib.elbow(5, 20, 45, { wall: 1.5 });

// Direction-based: connect Z-up pipe to X-right pipe
const bend = lib.elbow(5, 20, { from: [0, 0, 1], to: [1, 0, 0] });
```

### `lib.thread(diameter, pitch, length, options?)`
External thread (helical ridge) via twisted extrusion. Returns a threaded cylinder along +Z.

**Options:**
- `depth` (number) - Thread depth. Default: `pitch * 0.35`
- `segments` (number) - Circumferential segments. Default: 36

```javascript
const m8thread = lib.thread(8, 1.25, 30);
const smooth = lib.thread(8, 1.0, 30, { segments: 48 });
```

### `lib.bolt(diameter, length, options?)`
Hex bolt with real helical threads. Head at z=0, shaft extends along −Z.

**Options:**
- `pitch` (number) - Thread pitch. Default: `diameter * 0.15`
- `headHeight` (number) - Default: `diameter * 0.65`
- `headAcrossFlats` (number) - Default: `diameter * 1.6`
- `threadLength` (number) - Threaded portion. Default: full length
- `segments` (number) - Circumferential segments. Default: 36

```javascript
const m8bolt = lib.bolt(8, 30);
const custom = lib.bolt(10, 40, { pitch: 1.5, headHeight: 7 });
```

### `lib.nut(diameter, options?)`
Hex nut with bore, centered at origin.

**Options:**
- `pitch` (number) - Default: `diameter * 0.15`
- `height` (number) - Default: `diameter * 0.8`
- `acrossFlats` (number) - Default: `diameter * 1.6`
- `segments` (number) - Circumferential segments. Default: 36

```javascript
const m8nut = lib.nut(8);
const m8nut2 = lib.nut(8, { height: 6.5, acrossFlats: 13 });
```

## Query Methods

### 3D Shape Queries
```javascript
shape.volume()           // Volume in mm³
shape.surfaceArea()      // Surface area in mm²
shape.boundingBox()      // { min: [x,y,z], max: [x,y,z] }
shape.isEmpty()          // true if no geometry
shape.numTri()           // Triangle count
shape.minGap(other, 50)  // Minimum distance to another shape (within search radius)
shape.geometryInfo()     // { backend, representation, fidelity, topology, sources }
```

`geometryInfo()` is the current contract boundary for future hybrid kernels. Today most results are `manifold` + `mesh-solid`; `loft()` / `sweep()` report `sampled`, and tracked extrusions report `topology: 'synthetic'`. A future OCCT/BREP backend can change these values without forcing a language rewrite.

For the maintained exact STEP/BREP support matrix, see [../output/brep-export.md](../output/brep-export.md).

### 2D Sketch Queries
```javascript
sketch.area()         // Area in mm²
sketch.bounds()       // { min: [x,y], max: [x,y] }
sketch.isEmpty()      // true if no area
sketch.numVert()      // Vertex count
```

## Returning Multiple Objects

Scripts can return arrays to display multiple objects in the viewport:

```javascript
// Simple array — auto-named "Object 1", "Object 2", etc.
return [
  box(50, 50, 10),
  cylinder(20, 8).translate(25, 25, 10),
];

// Named objects with colors
return [
  { name: "Base Plate", shape: box(100, 100, 5), color: "#888888" },
  { name: "Column", shape: cylinder(50, 10).translate(50, 50, 5), color: "#4488cc" },
  { name: "Profile", sketch: circle2d(20), color: "#ff6600" },
];
```

Each object gets its own visibility toggle, opacity slider, and color picker in the View Panel.

### Assembly Groups

For complex assemblies, use nested groups to organize related parts:

```javascript
return [
  { name: "Bed Assembly", group: [
    { name: "Bed Plate", shape: bedPlate },
    { name: "Glass Bed", shape: glass },
    { name: "Heater", shape: heater },
  ]},
  { name: "Gantry", group: [
    { name: "Left Rail", shape: leftRail },
    { name: "Right Rail", shape: rightRail },
    { name: "Cross Bar", shape: crossBar },
  ]},
];
```

**Benefits:**
- **Spatial analysis** skips intra-group collision checks (intentional overlaps)
- **Group-level summary** reports relationships between assemblies
- **Object listing** shows group tags: `Bed Plate [Bed Assembly]`
- **Parameter validation** (`param-check` CLI) ignores collisions within groups

## Guides and Examples

See [../guides/modeling-recipes.md](../guides/modeling-recipes.md) for patterns, best practices, debugging, and sample snippets.

For runnable end-to-end models, read `examples/api/`.
````

### docs/permanent/API/model-building/sketch-anchor.md

````markdown
# Sketch Anchor Positioning

Position sketches relative to each other using named anchor points.

## Methods

### `.attachTo(target, targetAnchor, selfAnchor?, offset?)`
Position a sketch relative to another using named anchor points.

**Parameters:**
- `target` (Sketch) — The sketch to attach to
- `targetAnchor` (Anchor) — Point on target: 'center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right'
- `selfAnchor` (Anchor, optional) — Point on this sketch to align. Default: 'center'
- `offset` ([number, number], optional) — Additional offset after alignment

**Returns:** `Sketch`

```javascript
const plate = rect(50, 4);
const arm = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left');
return union2d(plate, arm);

// With offset: attach then shift 5mm right
const shifted = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left', [5, 0]);
```

## Anchor Points

Available anchor positions:
- `'center'` — geometric center
- `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'` — corners
- `'top'`, `'bottom'`, `'left'`, `'right'` — edge midpoints
````

### docs/permanent/API/model-building/sketch-booleans.md

````markdown
# Sketch Booleans

2D boolean operations for combining, subtracting, and intersecting sketches.

## Methods

### `.add(other)`
Combines two sketches (union).

```javascript
const combined = rect(50, 30).add(circle2d(20).translate(25, 15));
```

### `.subtract(other)`
Subtracts another sketch from this one.

```javascript
const plate = rect(100, 80);
const hole = circle2d(10);
const result = plate.subtract(hole.translate(50, 40));
```

### `.intersect(other)`
Keeps only the overlapping area.

```javascript
const overlap = rect(50, 50).intersect(circle2d(30).translate(25, 25));
```

## Functions

### `union2d(...sketches)`
Combines multiple sketches into one.

```javascript
const combined = union2d(
  rect(50, 30),
  circle2d(20).translate(25, 15),
  ngon(6, 15).translate(75, 15)
);
```

### `difference2d(...sketches)`
Subtracts sketches[1..n] from sketches[0].

```javascript
const plate = rect(100, 80);
const hole1 = circle2d(10).translate(25, 40);
const hole2 = circle2d(10).translate(75, 40);
const result = difference2d(plate, hole1, hole2);
```

### `intersection2d(...sketches)`
Keeps only the area where all sketches overlap.

```javascript
const overlap = intersection2d(
  rect(50, 50),
  circle2d(30).translate(25, 25)
);
```

### `hull2d(...sketches)`
Creates the convex hull of multiple sketches.

```javascript
const hull = hull2d(
  circle2d(10),
  circle2d(10).translate(50, 0),
  circle2d(10).translate(25, 40)
);
```

`hull2d()` is best for intentionally blended convex silhouettes. If you need true corner fillets while keeping some neighboring corners sharp, use `filletCorners(...)` instead.

## Performance Note

The multi-argument functions (`union2d`, `difference2d`, `intersection2d`) use Manifold's batch operations internally, which are faster than chaining `.add()` / `.subtract()` calls one by one. Prefer them when combining many sketches.

```javascript
// Fast — single batch operation
const combined = union2d(s1, s2, s3, s4, s5);

// Slower — sequential pairwise operations
const combined = s1.add(s2).add(s3).add(s4).add(s5);
```
````

### docs/permanent/API/model-building/sketch-core.md

````markdown
# Sketch Core

The `Sketch` class is an immutable wrapper around Manifold's `CrossSection` that provides a chainable 2D API.

## Class: Sketch

Represents a 2D profile that can be transformed, combined with other sketches, or converted to 3D.

### Color

#### `.color(hex: string): Sketch`
Set the display color of this sketch. Returns a new Sketch.

```javascript
const red = rect(50, 30).color('#ff0000');
const blue = circle2d(25).color('#0066ff');
```

Colors are preserved through transforms and boolean operations.

#### `.clone()` / `.duplicate()`
Create an explicit duplicate of a sketch wrapper.

```javascript
const base = rect(50, 30);
const a = base.clone();
const b = base.duplicate().translate(60, 0);
```

### Query Methods

#### `.area(): number`
Returns the area of the sketch.

```javascript
const sq = rect(50, 50);
console.log(sq.area()); // 2500
```

#### `.bounds()`
Returns the bounding box: `{ min: [x, y], max: [x, y] }`.

```javascript
const c = circle2d(25);
const b = c.bounds();
// b.min ≈ [-25, -25], b.max ≈ [25, 25]
```

#### `.isEmpty(): boolean`
Returns true if the sketch has no area.

#### `.numVert(): number`
Returns the number of vertices in the contour.

#### `.toPolygons()`
Returns raw polygon contours for rendering (internal use).

## Type: Anchor

Anchor points for positioning sketches:
- `'center'` — geometric center
- `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'` — corners
- `'top'`, `'bottom'`, `'left'`, `'right'` — edge midpoints

## Dimensions

Use `dim()` / `dimLine()` for visual measurement callouts and report annotations.
See [../output/dimensions.md](../output/dimensions.md) for options and ownership behavior.
````

### docs/permanent/API/model-building/sketch-extrude.md

````markdown
# Sketch Extrude & Revolve

Convert 2D sketches into 3D shapes through extrusion or revolution. The sketch's color (if set) is carried over to the resulting Shape.

If a sketch has been placed with [`onFace()`](sketch-on-face.md), extrusion follows that face normal instead of the global Z axis.

## Methods

### `.extrude(height, options?)`
Extrudes sketch along Z axis.

**Parameters:**
- `height` (number) - Extrusion height
- `options` (object, optional):
  - `twist` (number) - Twist angle in degrees
  - `divisions` (number) - Number of twist steps (needed for twist)
  - `scaleTop` (number | [number, number]) - Scale factor at top
  - `center` (boolean) - Center along Z axis

**Returns:** `TrackedShape` (with faces: top, bottom, side)

```javascript
const simple = rect(50, 30).extrude(10);

const twisted = ngon(6, 20).extrude(60, {
  twist: 90,
  divisions: 32
});

const tapered = circle2d(20).extrude(50, {
  scaleTop: 0.5
});

const badge = roundedRect(28, 10, 2, true)
  .onFace(box(120, 60, 40, true), 'front', { v: 8 })
  .extrude(2);
```

### `.revolve(degrees?, segments?)`
Revolves sketch around Y axis (becomes Z in result).

Performance tip: prefer `revolve()` over `loft()` whenever the part is rotationally symmetric. Loft is for profile interpolation and is substantially heavier.

**Parameters:**
- `degrees` (number, optional) - Rotation angle. Default: 360 (full revolution)
- `segments` (number, optional) - Number of segments. Default: auto

**Returns:** `Shape`

```javascript
// Vase profile
const profile = polygon([[20, 0], [25, 30], [20, 60]]);
const vase = profile.revolve();

// Partial revolution (C-shape)
const partial = rect(5, 40).translate(20, 0).revolve(270);
```
````

### docs/permanent/API/model-building/sketch-on-face.md

````markdown
# Sketch On Face

Attach a 2D sketch to a 3D face so it renders in-place and extrudes along that face normal.

This supports:
- canonical body faces: `front`, `back`, `left`, `right`, `top`, `bottom`
- tracked planar faces on `TrackedShape`, like `side-left`
- direct `FaceRef` targets from `tracked.face('top')`

## `.onFace(parent, face, opts?)`

Places a sketch onto a parent face using face-local coordinates.

**Parameters:**
- `parent` (`Shape | TrackedShape`) - target body
- `face` (`'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | string | FaceRef`)
- `opts` (object, optional):
  - `u` (number) - face-local horizontal offset from the face center
  - `v` (number) - face-local vertical offset from the face center
  - `protrude` (number) - offset along the face normal. Positive = outward
  - `selfAnchor` (`Anchor`) - which 2D sketch anchor aligns to the face center. Default: `'center'`

**Returns:** `Sketch`

## `.onFace(faceRef, opts?)`

Places a sketch directly from a tracked planar `FaceRef`.

This is useful when the script has already selected a face semantically:

```javascript
const panel = Rectangle2D.from3Points(
  point(-30, -18),
  point(28, -6),
  point(18, 24),
).extrude(16);

const cap = circle2d(5)
  .onFace(panel.face('top'), { u: 12, protrude: 0.05 })
  .extrude(1.2);
```

```javascript
const body = box(120, 60, 40, true).color('#d8dce3');

const badge = roundedRect(28, 10, 2, true)
  .onFace(body, 'front', { v: 8 })
  .extrude(2)
  .color('#1d2733');

return [
  { name: 'Body', shape: body },
  { name: 'Badge', shape: badge },
];
```

## Face-local coordinates

- Canonical faces:
  - `front` / `back`: `u = X`, `v = Z`
  - `left` / `right`: `u` runs across the face, `v = Z`
  - `top` / `bottom`: `u = X`, `v` runs across the face
- Tracked planar faces use their own stored local frame:
  - side faces of extruded rectangles: `u` follows the source edge, `v = Z`
  - tracked `top` / `bottom` faces follow the source sketch axes
  - direct `FaceRef` placement uses that face's `uAxis` / `vAxis`

The sketch's local `+Z` becomes the face normal, so `extrude(positive)` goes outward from that face.

## Notes

- This is a planar face-placement feature, not arbitrary curved-surface projection.
- Tracked curved faces like `cylinder(...).face('side')` are rejected because they do not have a planar sketch frame.
- The placed sketch still supports normal 2D operations like `translate`, `rotate`, `scale`, and sketch booleans before extrusion.
- If multiple sketches share the same face placement, their 2D booleans preserve that shared placement.
- If booleans mix sketches with different 3D placements, the result drops back to an unplaced sketch.
- Extruding a placed sketch keeps the tracked `top` / `bottom` / `side` metadata from that extrusion, transformed into world space.
````

### docs/permanent/API/model-building/sketch-operations.md

````markdown
# Sketch Operations

2D operations for modifying sketch contours.

## Methods

All operations preserve the sketch's color.

### `.offset(delta, join?)`
Inflate (positive) or deflate (negative) the contour.

**Parameters:**
- `delta` (number) - Offset distance. Positive = outward, negative = inward
- `join` ('Square' | 'Round' | 'Miter', optional) - Corner style. Default: 'Round'

```javascript
const outer = rect(50, 30).offset(5);      // Expand by 5mm
const inner = circle2d(20).offset(-2);     // Shrink by 2mm
const sharp = ngon(6, 20).offset(3, 'Miter');
```

Use the common `offset(-r).offset(+r)` pattern when you want to round **every convex corner** of a closed sketch.

### `filletCorners(points, corners)`
Round only specific convex corners of a polygon point list.

**Parameters:**
- `points` (([number, number] | Point2D)[]) - Closed polygon vertices in order
- `corners` (`{ index: number, radius: number, segments?: number }[]`) - Which vertices to fillet

**Returns:** `Sketch`

```javascript
const roofPoints = [
  [0, 0],
  [90, 0],
  [90, 44],
  [66, 74],
  [45, 86],
  [24, 74],
  [0, 44],
];

const roof = filletCorners(roofPoints, [
  { index: 3, radius: 19 },
  { index: 4, radius: 19 },
  { index: 5, radius: 19 },
]);
```

Notes:
- only convex corners are supported
- if two neighboring fillets would overlap on the same edge, the function throws
- compare `polygon(points)` and `filletCorners(points, ...)` before extruding when debugging mixed sharp-and-rounded outlines

## Choosing A Rounding Strategy

- `offset(-r).offset(+r)` rounds all convex corners of an existing closed profile
- `stroke(points, width, 'Round')` thickens a centerline path; use it for ribs, traces, and wire-like geometry
- `hull2d()` of circles creates a blended convex silhouette, closer to a capsule or cap than a true corner fillet
- `filletCorners(points, ...)` is the right tool when some corners stay sharp and others need true tangent fillets
- See `examples/api/sketch-rounding-strategies.forge.js` for a side-by-side comparison

### `.hull()`
Returns the convex hull of this sketch.

```javascript
const hull = complexShape.hull();
```

### `.simplify(epsilon?)`
Removes vertices that don't significantly affect the shape.

**Parameters:**
- `epsilon` (number, optional) - Tolerance for vertex removal. Default: 1e-6

```javascript
const simplified = complexSketch.simplify(0.1);
```

### `.warp(fn)`
Warp vertices with an arbitrary function.

**Parameters:**
- `fn` ((vert: [number, number]) => void) - Function that modifies vertex coordinates in-place

```javascript
const warped = rect(50, 50).warp(([x, y]) => {
  // Modify x and y in place
  x += Math.sin(y * 0.1) * 5;
});
```
````

### docs/permanent/API/model-building/sketch-path.md

````markdown
# Sketch Path Builder

Fluent API for tracing 2D outlines point by point.

## Class: PathBuilder

### `path()`
Creates a new path builder.

```javascript
const triangle = path()
  .moveTo(0, 0)
  .lineH(50)
  .lineV(30)
  .close();
```

### Methods

#### `.moveTo(x, y)`
Set starting point.

#### `.lineTo(x, y)`
Line to absolute position.

#### `.lineH(dx)`
Horizontal line (relative).

#### `.lineV(dy)`
Vertical line (relative).

#### `.lineAngled(length, degrees)`
Line at angle (0°=right, 90°=up).

#### `.close()`
Close path into a `Sketch` (auto-fixes winding).

#### `.stroke(width, join?)`
Thicken path into solid profile (see below).

## Stroke

Thicken a polyline (centerline) into a solid profile with uniform width. Proper miter joins at vertices.

### `path().stroke(width, join?)`
### `stroke(points, width, join?)`

**Parameters:**
- `width` (number) — Profile thickness
- `join` ('Square' | 'Round', optional) — Corner style. Default: 'Square' (miter)

**Returns:** `Sketch`

```javascript
// Fluent path builder
const bracket = path()
  .moveTo(0, 0)
  .lineH(50)
  .lineV(-70)
  .lineAngled(20, 235)
  .stroke(4);

// Or with point array
const bracket = stroke([[0, 0], [50, 0], [50, -70]], 4);

// Rounded corners
const rounded = stroke([[0, 0], [50, 0], [50, -50]], 4, 'Round');
```

Use `stroke(..., 'Round')` for centerline-based geometry such as ribs, traces, and wire-like profiles. It is not the same as rounding selected corners of an existing closed polygon. For mixed sharp-and-rounded outlines, build the polygon first and use `filletCorners(...)`.
````

### docs/permanent/API/model-building/sketch-primitives.md

````markdown
# Sketch Primitives

2D primitive shapes for creating sketches.

## Functions

### `rect(width, height, center?)`
Creates a rectangle.

**Parameters:**
- `width` (number) - Width
- `height` (number) - Height
- `center` (boolean, optional) - If true, centers at origin. Default: false (corner at origin)

```javascript
const r = rect(50, 30);
const centered = rect(50, 30, true);
```

### `circle2d(radius, segments?)`
Creates a circle.

**Parameters:**
- `radius` (number) - Circle radius
- `segments` (number, optional) - Number of segments. Default: auto (smooth)

```javascript
const c = circle2d(25);
const octagon = circle2d(25, 8);
```

### `roundedRect(width, height, radius, center?)`
Creates a rectangle with rounded corners.

**Parameters:**
- `width` (number) - Width
- `height` (number) - Height
- `radius` (number) - Corner radius
- `center` (boolean, optional) - If true, centers at origin. Default: false

```javascript
const rounded = roundedRect(60, 40, 5);
```

### `polygon(points)`
Creates a polygon from an array of [x, y] points or Point2D objects.

**Parameters:**
- `points` (([number, number] | Point2D)[]) - Array of vertex coordinates or Point2D objects

```javascript
const triangle = polygon([[0, 0], [50, 0], [25, 40]]);

// Also accepts Point2D objects
const p1 = point(0, 0), p2 = point(50, 0), p3 = point(25, 40);
const triangle2 = polygon([p1, p2, p3]);
```

### `ngon(sides, radius)`
Creates a regular polygon (equilateral).

**Parameters:**
- `sides` (number) - Number of sides
- `radius` (number) - Radius from center to vertex

```javascript
const hex = ngon(6, 25);
const triangle = ngon(3, 30);
```

### `ellipse(rx, ry, segments?)`
Creates an ellipse.

**Parameters:**
- `rx` (number) - X radius
- `ry` (number) - Y radius
- `segments` (number, optional) - Number of segments. Default: 64

```javascript
const oval = ellipse(40, 20);
```

### `slot(length, width)`
Creates an oblong shape (rectangle with semicircle ends).

**Parameters:**
- `length` (number) - Total length
- `width` (number) - Width

```javascript
const oblong = slot(60, 20);
```

### `star(points, outerRadius, innerRadius)`
Creates a star shape.

**Parameters:**
- `points` (number) - Number of star points
- `outerRadius` (number) - Outer radius (tip of points)
- `innerRadius` (number) - Inner radius (between points)

```javascript
const star5 = star(5, 30, 15);
```
````

### docs/permanent/API/model-building/sketch-transforms.md

````markdown
# Sketch Transforms

2D transformations for sketches. All transforms are **chainable** and **immutable** (return new sketches). Colors are preserved through all transforms.

## Methods

### `.clone()` / `.duplicate()`
Create an explicit copy handle of a sketch (same profile/color) so variants are easy to branch.

```javascript
const profile = rect(40, 20);
const left = profile.clone().translate(-30, 0);
const right = profile.duplicate().translate(30, 0);
```

### `.translate(x, y?)`
Moves the sketch.

```javascript
const moved = rect(50, 30).translate(100, 50);
```

### `.rotate(degrees)`
Rotates around the origin.

```javascript
const rotated = rect(50, 30).rotate(45);
```

### `.rotateAround(degrees, pivot)`
Rotates around a specific point instead of origin.

**Parameters:**
- `degrees` (number) — Rotation angle
- `pivot` ([number, number]) — Point to rotate around

```javascript
const hook = rect(4, 20).rotateAround(-35, [2, 0]);
```

### `.scale(v)`
Scales the sketch.

**Parameters:**
- `v` (number | [number, number]) — Uniform scale or per-axis scale

```javascript
const bigger = circle2d(10).scale(2);
const stretched = rect(10, 10).scale([2, 0.5]);
```

### `.mirror(normal)`
Mirrors across a line defined by its normal vector.

**Parameters:**
- `normal` ([number, number]) — Line normal (doesn't need to be unit length)

```javascript
const mirrored = sketch.mirror([1, 0]); // Mirror across Y axis
```
````

## docs/permanent/CLI.md

````markdown
# ForgeCAD CLI

## Architecture

All CLI tools share the **same forge engine** as the browser UI. There is one source of truth for geometry logic — no code duplication.

```
src/forge/headless.ts    ← Single entry point for all contexts
  ├── kernel.ts          ← Manifold WASM wrapper (Shape, box, cylinder, sphere, etc.)
  ├── runner.ts          ← Script sandbox (Function() with full forge API injected)
  ├── section.ts         ← Plane intersection / projection
  ├── sketch/            ← Complete 2D sketch system (primitives, transforms, booleans,
  │                         constraints, entities, topology, patterns, fillets, arc bridge)
  ├── params.ts          ← Parameter system
  ├── library.ts         ← Part library
  ├── meshToGeometry.ts  ← Manifold mesh → Three.js BufferGeometry
  └── sceneBuilder.ts    ← Three.js scene setup (lighting, camera, materials)
```

**Browser** imports via `src/forge/index.ts` → re-exports from `headless.ts`.
**CLI tools** import directly from `src/forge/headless.ts`.

The key function is `runScript(code, fileName, allFiles)` — it wraps user code in a `Function()` sandbox with the entire forge API injected. CLI scripts just call `init()` + `runScript()` and work with the results.

## Available Commands

### Notebook Cells (server-backed)

Forge notebooks live in `.forge-notebook.json` files and behave like lightweight Jupyter notebooks for ForgeCAD code cells.

The browser and CLI both use the Vite server for notebook execution. The CLI does not run Forge locally for notebook cells; it auto-starts or reuses the Forge server, sends the cell code, then prints the returned output summary.

Append a new code cell and run it immediately in one command:

```bash
npm run notebook -- examples/demo.forge-notebook.json --code "show(box(40, 20, 10));"
```

If the target notebook file does not exist yet, append mode auto-creates it first with the default ForgeCAD notebook structure, then adds the new cell.

Or pipe a larger cell in through stdin:

```bash
cat /tmp/cell.js | npm run notebook -- examples/demo.forge-notebook.json
```

Re-run the last preview cell, or a specific cell id:

```bash
npm run notebook -- examples/demo.forge-notebook.json
npm run notebook -- run examples/demo.forge-notebook.json <cell-id>
```

`run` expects the notebook file to already exist. Auto-creation only applies to append flows (`--code`, `--file`, stdin, or the explicit `append` subcommand).

Export a notebook into a plain `.forge.js` script:

```bash
npm run notebook -- export examples/demo.forge-notebook.json
npm run notebook -- export examples/demo.forge-notebook.json out/demo-from-notebook.forge.js
```

If you already have a Forge server running, point the CLI at it:

```bash
npm run notebook -- examples/demo.forge-notebook.json --server http://localhost:5173 --code "show(box(40, 20, 10));"
```

Notebook paths are resolved from the shell working directory before the CLI calls the server, so the server's opened project root does not add an extra path prefix.

Notebook cell behavior:

- Cells share state top-to-bottom
- `show(value)` pins the geometry that should stay visible in the viewport
- A trailing expression is also treated as the cell value
- Cell outputs are written back into the notebook JSON, similar to Jupyter

### Script Validation

```bash
npm run test-run -- examples/cup.forge.js
npm run test-run -- --debug-imports examples/cup.forge.js
```

Runs a `.forge.js` or `.sketch.js` file in the real runtime and prints object stats, diagnostics, and execution time.

`--debug-imports` adds an import trace (source file, target file, overrides, return type, success/error phase), useful when debugging `importPart()`/`importSketch()` behavior.

### SVG Export (no browser needed)

```bash
npm run svg -- examples/frame.sketch.js [output.svg]

# Or directly:
npx tsx cli/forge-svg.ts examples/frame.sketch.js
npx tsx cli/forge-svg.ts examples/frame.sketch.js output.svg
```

Runs a `.sketch.js` script in Node.js using the real forge engine and outputs SVG. No browser, no Puppeteer — pure Node.

**How it works:** Initializes the Manifold WASM kernel, runs the script through `runScript()`, extracts the Sketch result, converts polygons to SVG paths.

### STEP / BREP Export (exact subset, Python + CadQuery)

```bash
npm run step -- examples/api/brep-exportable.forge.js
npm run brep -- examples/api/brep-exportable.forge.js

# Optional overrides:
npm run step -- --output out/demo.step examples/api/brep-exportable.forge.js
npm run step -- --python 3.11 examples/api/brep-exportable.forge.js
npm run step -- --uv /custom/path/to/uv examples/api/brep-exportable.forge.js
```

This exporter is `uv`-first. `cli/forge-brep-export.py` carries inline dependency metadata, so `uv run` provisions CadQuery automatically for the exporter environment.

This exporter is intentionally exact-subset only. It does **not** try to convert arbitrary triangle meshes back into fake BREP. Instead, Forge records an exact export plan only for operations that can be replayed robustly in OpenCascade via CadQuery.

The maintained feature matrix lives in [`docs/permanent/API/output/brep-export.md`](API/output/brep-export.md).

If any returned solid object falls outside the exact subset, the CLI fails with a reason instead of silently exporting degraded geometry. When a scene mixes solids and 2D sketches, the exact solids export and the sketch-only objects are skipped with a warning.

For coverage runs across many examples, use the `uv` matrix scripts:

```bash
uv run scripts/brep/matrix.py --format step examples
uv run scripts/brep/matrix.py --format brep examples
uv run scripts/brep/rerun_failures.py tmp/brep-matrix-step-20260306T120000Z.json
```

These scripts use the repo-local `.venv-brep/.venv/bin/python` by default, run exports through a bounded parallel worker pool, and write JSON reports under `tmp/`.

### SDF Robot Export (Gazebo package)

```bash
npm run sdf -- examples/api/sdf-rover-demo.forge.js

# Optional output directory:
npm run sdf -- --output out/forge_scout examples/api/sdf-rover-demo.forge.js
```

This exporter writes a Gazebo-friendly package workspace:

- `models/<model-name>/model.sdf`
- `models/<model-name>/model.config`
- `models/<model-name>/meshes/*.stl`
- `worlds/<world-name>.sdf` when the script requests a demo world
- `manifest.json` with topic names, link/joint mappings, and exporter warnings

The script must call `robotExport({...})` with an `assembly(...)` graph. The exporter uses the declared parts + joints directly; it does **not** try to infer a robot from flattened scene meshes.

Current behavior:

- Per-link geometry is exported as STL mesh assets
- Collision geometry reuses the same mesh unless `collision: 'none'` is set on a link
- Link mass comes from `massKg`, else `densityKgM3 * volume`, else a default density
- Inertia is an approximate box fit based on link bounds
- Coupled joints are currently rejected
- Parts without geometry are currently rejected

### PNG Render (requires Chrome)

```bash
npm run render -- examples/cup.forge.js [output.png]
```

Renders 3D shapes to PNG images from multiple camera angles. Uses Puppeteer to launch headless Chrome with WebGL for Three.js rendering.

**How it works:**
1. `cli/forge-render.mjs` — Node launcher script. Auto-starts Vite dev server if not running, launches Puppeteer.
2. `cli/render.html` + `cli/render.ts` — Loaded in the browser by Puppeteer. Imports from `src/forge/headless.ts`, runs the script, builds a Three.js scene, renders from multiple angles.
3. Screenshots are captured as base64 PNG and saved to disk.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGE_ANGLES` | `front,side,top,iso` | Camera angles to render |
| `FORGE_SIZE` | `1024` | Image size in pixels |
| `FORGE_PORT` | `5173` | Vite dev server port |
| `CHROME_PATH` | Auto-detected | Chrome/Chromium executable path |

**Camera angles:** `front` (−Y), `back` (+Y), `side` (+X), `top` (+Z), `iso` (diagonal)

### Orbit GIF Render (requires Chrome)

```bash
npm run gif -- examples/cup.forge.js [output.gif]

# Or directly:
npx tsx cli/forge-gif.ts examples/cup.forge.js
npx tsx cli/forge-gif.ts examples/cup.forge.js output.gif --size 768 --fps 20 --frames-per-turn 72
```

Creates one animated GIF with two full 360° passes:
1. Solid pass (regular shaded view)
2. Wireframe pass (same orbit path)

**How it works:**
1. Auto-starts (or reuses) the Vite dev server.
2. Loads `cli/render.html` in headless Chrome.
3. Runs the script once, then captures orbit frames from the same scene for both render modes.
4. Encodes all frames into a single GIF file (pure JS encoder, no ffmpeg/ImageMagick required).

**Options:**
- `--size <px>` — frame resolution (default `720`)
- `--fps <n>` — GIF frame rate (default `18`)
- `--frames-per-turn <n>` — frames per full orbit pass (default `54`)
- `--hold-frames <n>` — freeze frames before each pass (default `4`)
- `--pitch <deg>` — camera elevation angle (default `18`)
- `--background <color>` — background color (default `#252526`)
- `--port <n>` — Vite port (default `5173`)
- `--chrome-path <path>` — Chrome executable path override

**Environment variables:**
- `FORGE_GIF_SIZE`
- `FORGE_GIF_FPS`
- `FORGE_GIF_FRAMES_PER_TURN`
- `FORGE_GIF_HOLD_FRAMES`
- `FORGE_GIF_PITCH_DEG`
- `FORGE_GIF_BACKGROUND`
- `FORGE_PORT`
- `CHROME_PATH`

### PDF Report (2D drawing pack)

```bash
npm run report -- examples/cup.forge.js [output.pdf]
npm run report -- examples/cup.forge.js [output.pdf] --dim-angle-tol 18
```

Generates a searchable-text PDF report with multiple projected drawing views:
- Bill of Materials page (auto-summed from script `bom()` entries)
- Combined model page (front/right/top/isometric)
- Disassembled component pages (same view set per returned component)
- Auto-generated detail continuation pages for elongated/high-detail views (separate pages, not overlayed)
- `dim()` annotations included per view only when their axis aligns with that view's projection plane axes

BOM aggregation rules:
- Each `bom(quantity, description, { unit })` call contributes one raw entry
- Report export groups by `key` (if provided) else by normalized `description + unit`
- Quantities are summed per group and rendered as line items in the BOM table

Component dimension ownership for disassembled pages:
- Preferred: explicit binding via `dim(..., { component: \"Part Name\" })`
- Imported-part ownership: `dim(..., { currentComponent: true })` to pin to the owning returned component instance (no bbox heuristic)
- Other-component ownership: `dim(..., { component: \"Tabletop\" })`
- If multiple owners are bound (e.g. `currentComponent: true` plus another component), it is treated as shared and stays on the overview page
- Fallback: automatic ownership only when both dimension endpoints are unambiguously inside exactly one returned component bounding box
- Ambiguous dimensions are intentionally skipped for disassembled pages

Optional report flag:
- `--dim-angle-tol <degrees>`: include dimensions whose projected direction is within this many degrees of the nearest view axis (default: `12`)

### STL Export (from browser)

STL export is available in the browser UI via the Export panel. Binary STL format.

### Parameter Validation

```bash
npm run param-check -- examples/shoe-rack-doors.forge.js [--samples 10]
```

Samples each parameter across its range and checks for runtime errors, degenerate geometry (volume ≈ 0), and new collisions between parts. Skips intra-group collisions when assembly groups are used.

**Options:**
- `--samples N` — Number of sample points per parameter (default: 8)

**Output example:**
```
✓ Baseline: 6 objects, 12 params
✓ Checked 91 parameter samples (8 per param)

⚠ Found 8 issues across 4 parameters:

  Parameter "Bottom Left Door":
    💥 New collision at values: -120.0, -102.9
       Bottom Left Door ∩ Frame (shared vol: 2561.9mm³)
```

### Transform/Assembly Invariant Check

```bash
npm run check:transforms
```

Runs fast math-level invariants to catch transform order and frame composition regressions before they leak into examples.

### Dimension Propagation Invariant Check

```bash
npm run check:dimensions
```

Runs shape-level invariants for dimension metadata propagation across:
- transform APIs (`translate`, `rotate`, `transform`, `scale`, `mirror`, `rotateAround`)
- copy/style APIs (`clone`, `color`, `setColor`, `smooth/refine/simplify`)
- boolean APIs (`add/subtract/intersect`, plus `union/difference/intersection/hull3d`)
- import runtime path (`importPart(...).color(...).translate(...)`)

### Dimension Debugger

```bash
npm run debug:dimensions -- /path/to/file.forge.js [--all]
npm run debug:dimensions -- /path/to/file.forge.js [--all] [--dim-angle-tol 12]

# Fallback runner (if npx/registry access is unavailable)
bun cli/debug-dimensions.ts /path/to/file.forge.js [--all] [--dim-angle-tol 12]
```

Prints:
- total object count
- total dimension count
- per-view visibility counts (`front/right/top/iso`) using report angle tolerance
- report ownership routing (`combined` vs `component:<name>`) per dimension
- per-object approximate dimension ownership (both endpoints inside object bbox)
- a dimension coordinate list (first 20 by default, `--all` for full dump)

## Adding New CLI Commands

1. Create `cli/your-command.ts`
2. Import from `../src/forge/headless`
3. Call `await init()` to load the WASM kernel
4. Use `runScript(code, fileName, allFiles)` to execute user scripts
5. Add a script to `package.json`: `"your-command": "npx tsx cli/your-command.ts"`

### Minimal Example

```typescript
#!/usr/bin/env node
import { readFileSync } from 'fs';
import { init, runScript } from '../src/forge/headless';

const code = readFileSync(process.argv[2], 'utf-8');

await init();
const result = runScript(code, 'main.forge.js', {});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

for (const obj of result.objects) {
  if (obj.shape) {
    console.log(`${obj.name}: volume=${obj.shape.volume().toFixed(1)}mm³`);
  }
  if (obj.sketch) {
    console.log(`${obj.name}: area=${obj.sketch.area().toFixed(1)}mm²`);
  }
}
```

### Cross-file imports

When running scripts that use `importSketch()` / `importSvgSketch()` / `importPart()`, pass all project files (or at least all files reachable by imports), keyed by project-relative path. This supports root-relative and relative imports, including `.svg` assets (`./assets/logo.svg`):

```typescript
import { readdirSync, readFileSync } from 'fs';

const allFiles: Record<string, string> = {};
for (const f of readdirSync(scriptDir)) {
  if (f.endsWith('.forge.js') || f.endsWith('.sketch.js') || f.endsWith('.svg')) {
    allFiles[f] = readFileSync(join(scriptDir, f), 'utf-8');
  }
}

const result = runScript(code, 'main.forge.js', allFiles);
```

## Dependencies

| Package | Purpose | Context |
|---------|---------|---------|
| `tsx` | Run TypeScript CLI scripts directly | Dev dependency |
| `puppeteer-core` | Headless Chrome for PNG rendering | Dev dependency |
| `manifold-3d` | Geometry kernel (WASM) | Works in both Node and browser |
| `three` | 3D rendering (used by render.ts) | Loaded in browser context by Puppeteer |
````

## examples/api

### examples/api/assembly-gear-coupling.forge.js

````javascript
// Assembly + gear coupling demo
// Uses addGearCoupling(...) so the driven joint follows pinion motion automatically.

const pinionDeg = param("Pinion Angle", 20, { min: -180, max: 180, step: 1, unit: "°" });

const pair = lib.gearPair({
  pinion: { module: 1.25, teeth: 14, faceWidth: 8, boreDiameter: 5 },
  gear: { module: 1.25, teeth: 42, faceWidth: 8, boreDiameter: 8 },
  backlash: 0.05,
  place: false,
});

const mech = assembly("Gear Coupling Demo")
  .addFrame("Base")
  .addPart("Pinion", pair.pinion.color("#d5a15f"))
  .addPart("Driven", pair.gear.color("#9ab3ca"), {
    transform: Transform.identity().translate(pair.centerDistance, 0, 0),
  })
  .addRevolute("Pinion", "Base", "Pinion", {
    axis: [0, 0, 1],
    min: -720,
    max: 720,
  })
  .addRevolute("Driven", "Base", "Driven", {
    axis: [0, 0, 1],
    min: -720,
    max: 720,
  })
  .addGearCoupling("Driven", "Pinion", { pair });

const solved = mech.solve({ Pinion: pinionDeg });
return solved.toScene();
````

### examples/api/assembly-mechanism.forge.js

````javascript
// Assembly + mechanism demo
// Shows Transform composition, assembly joints, BOM metadata, and collision checks.

const baseYaw = param("Base Yaw", 20, { min: -170, max: 170, unit: "°" });
const shoulder = param("Shoulder", 30, { min: -30, max: 110, unit: "°" });
const elbow = param("Elbow", 45, { min: -20, max: 135, unit: "°" });
const open = param("Gripper Open", 28, { min: 0, max: 55, unit: "mm" });

const upperLen = 180;
const foreLen = 160;

const basePlate = box(180, 140, 10, true).translate(0, 0, 5);
const tower = cylinder(20, 36).translate(0, 0, 10);

const m4 = lib.fastenerHole({ size: "M4", fit: "normal", depth: 14, counterbore: { depth: 4 } });
const mountHoles = [
  m4.translate(55, 40, 7),
  m4.translate(-55, 40, 7),
  m4.translate(55, -40, 7),
  m4.translate(-55, -40, 7),
];

const base = difference(union(basePlate, tower), ...mountHoles).color("#6e7b88");

const upperArm = box(upperLen, 28, 28)
  .translate(0, -14, -14)
  .subtract(cylinder(32, 8).pointAlong([0, 1, 0]).translate(0, 0, 0))
  .color("#5f87c6");

const forearm = box(foreLen, 24, 24)
  .translate(0, -12, -12)
  .subtract(cylinder(28, 7).pointAlong([0, 1, 0]).translate(0, 0, 0))
  .color("#6fa2d6");

const wristHub = cylinder(26, 10).pointAlong([1, 0, 0]).translate(0, 0, 0);
const palm = box(34, 44, 16, true).translate(16, 0, 0);
const toolBody = union(wristHub, palm).color("#b8c5d3");

const fingerLen = 50;
const finger = box(fingerLen, 8, 10).translate(8, -4, -5).color("#414952");
const fingerLeft = finger.translate(18, 8 + open * 0.5, 0);
const fingerRight = finger.translate(18, -8 - open * 0.5, 0);
const gripper = group(toolBody, fingerLeft, fingerRight);

const mech = assembly("Robot Arm Demo")
  .addPart("Base", base, {
    metadata: { material: "PETG", process: "FDM", tolerance: "+/-0.2mm", qty: 1 },
  })
  .addPart("Upper Arm", upperArm, {
    metadata: { material: "PETG-CF", process: "FDM", qty: 1 },
  })
  .addPart("Forearm", forearm, {
    metadata: { material: "PETG-CF", process: "FDM", qty: 1 },
  })
  .addPart("Gripper", gripper, {
    metadata: { material: "PETG", process: "FDM", notes: "Print fingers in TPU for compliance", qty: 1 },
  })
  .addJoint("baseYaw", "revolute", "Base", "Upper Arm", {
    axis: [0, 0, 1],
    min: -170,
    max: 170,
    frame: Transform.identity().translate(0, 0, 46),
  })
  .addJoint("shoulder", "revolute", "Upper Arm", "Forearm", {
    axis: [0, -1, 0],
    min: -30,
    max: 110,
    frame: Transform.identity().translate(upperLen + 8, 0, 0),
  })
  .addJoint("elbow", "revolute", "Forearm", "Gripper", {
    axis: [0, -1, 0],
    min: -20,
    max: 135,
    frame: Transform.identity().translate(foreLen + 12, 0, 0),
  });

const solved = mech.solve({
  baseYaw,
  shoulder,
  elbow,
});

const collisions = solved.collisionReport({
  minOverlapVolume: 0.5,
  ignorePairs: [
    ["Upper Arm", "Forearm"],
    ["Forearm", "Gripper"],
  ],
});

if (collisions.length > 0) {
  console.warn("Assembly collisions:", collisions);
}

const elbowSweep = mech.sweepJoint("elbow", -20, 135, 16, {
  baseYaw,
  shoulder,
});
const sweptCollisions = elbowSweep.filter(step => step.collisions.length > 0).length;
if (sweptCollisions > 0) {
  console.info(`Elbow sweep has collisions in ${sweptCollisions}/${elbowSweep.length} steps`);
}

console.log("BOM", solved.bom());
console.log("BOM CSV\n" + solved.bomCsv());

return solved.toScene();
````

### examples/api/attachTo-basics.forge.js

````javascript
// attachTo() — the primary way to position parts relative to each other.
//
// Mental model: child.attachTo(parent, parentAnchor, selfAnchor, offset)
//   "Put my [selfAnchor] at the parent's [parentAnchor], then shift by [offset]"
//
// Anchor names:
//   1 word  = face center:  'top', 'bottom', 'front', 'back', 'left', 'right'
//   2 words = edge midpoint: 'top-front', 'back-left', etc.
//   3 words = corner:        'top-front-left', 'bottom-back-right', etc.

const baseW = param("Base Width", 100, { min: 50, max: 200, unit: "mm" });
const baseD = param("Base Depth", 80, { min: 40, max: 150, unit: "mm" });
const baseH = param("Base Height", 10, { min: 5, max: 30, unit: "mm" });

const base = box(baseW, baseD, baseH, true).color('#888888');

// Stack on top: column's bottom face meets base's top face
const column = cylinder(40, 8).color('#4488cc')
  .attachTo(base, 'top', 'bottom');

// Protrude from front: button's back face meets base's front face
const button = box(20, 6, 10, true).color('#cc4444')
  .attachTo(base, 'front', 'back');

// Hang below: bracket's top face meets base's bottom face
const bracket = box(30, 30, 5, true).color('#44cc44')
  .attachTo(base, 'bottom', 'top');

// Attach to side with offset: panel's left face meets base's right face,
// then shift 0mm on X, 0mm on Y, 10mm up on Z
const sidePanel = box(4, 40, 25, true).color('#cc8844')
  .attachTo(base, 'right', 'left', [0, 0, 10]);

// Corner alignment: small cube at top-front-right corner of base
const corner = box(8, 8, 8, true).color('#8844cc')
  .attachTo(base, 'top-front-right', 'bottom-back-left');

return [
  { name: "Base", shape: base },
  { name: "Column (top→bottom)", shape: column },
  { name: "Button (front→back)", shape: button },
  { name: "Bracket (bottom→top)", shape: bracket },
  { name: "Side Panel (right→left, +10Z)", shape: sidePanel },
  { name: "Corner Cube", shape: corner },
];
````

### examples/api/benchy-style-hull.forge.js

````javascript
// Benchy-style hull concept using reusable curve/surface APIs.
// Not an exact #3DBenchy clone; this shows the modeling workflow:
// sections -> loft hull, sweep rails/chimney, simple superstructure.

const length = param("Length", 92, { min: 60, max: 150, unit: "mm" });
const beam = param("Beam", 42, { min: 24, max: 70, unit: "mm" });
const hullH = param("Hull Height", 34, { min: 18, max: 60, unit: "mm" });
const deckDrop = param("Deck Drop", 6, { min: 2, max: 12, unit: "mm" });

const mkSection = (w, h, keel = 0, chine = 0) => spline2d([
  [w * 0.5, 0],
  [w * 0.45, h * 0.28 + chine],
  [w * 0.25, h * 0.5 + chine],
  [0, h * 0.58 + keel],
  [-w * 0.25, h * 0.5 + chine],
  [-w * 0.45, h * 0.28 + chine],
  [-w * 0.5, 0],
  [-w * 0.45, -h * 0.18],
  [-w * 0.23, -h * 0.32],
  [0, -h * 0.36 - deckDrop],
  [w * 0.23, -h * 0.32],
  [w * 0.45, -h * 0.18],
], {
  closed: true,
  samplesPerSegment: 10,
  tension: 0.45,
});

const z0 = 0;
const z1 = length * 0.22;
const z2 = length * 0.56;
const z3 = length * 0.88;
const z4 = length;

let hull = loft(
  [
    mkSection(beam * 0.52, hullH * 0.72, 2, 1), // stern
    mkSection(beam * 0.94, hullH * 0.95, 3, 1.5),
    mkSection(beam, hullH, 3.5, 1.2),           // max beam
    mkSection(beam * 0.58, hullH * 0.82, 1.5, 0.5),
    mkSection(beam * 0.18, hullH * 0.35, 0, 0), // bow tip
  ],
  [z0, z1, z2, z3, z4],
  { edgeLength: 0.95 },
);
hull = hull.smoothOut(72, 0.28).refine(2);

// Orient hull so length goes along X, beam along Y, height along Z.
hull = hull
  .rotate(0, 90, 0) // Z (loft stations) -> X
  .rotate(90, 0, 0) // Y (section height) -> Z
  .translate(-length * 0.5, 0, hullH * 0.58);

// Deckhouse and cabin
const houseW = beam * 0.48;
const houseD = length * 0.26;
const houseH = hullH * 0.62;
const house = roundedRect(houseW, houseD, 4, true).extrude(houseH)
  .translate(length * 0.04, 0, hullH * 0.82);

const cabinCut = roundedRect(houseW * 0.68, houseD * 0.56, 2.2, true).extrude(houseH * 0.7)
  .translate(length * 0.04, 0, hullH * 1.08);

// Chimney via sweep
const stackPath = spline3d(
  [
    [length * 0.02, 0, hullH * 1.45],
    [length * 0.02, 0, hullH * 1.72],
    [length * 0.08, 0, hullH * 1.84],
  ],
  { tension: 0.5 },
);
const stack = sweep(circle2d(3.8, 26), stackPath, {
  samples: 28,
  edgeLength: 0.55,
});
const stackInner = sweep(circle2d(2.2, 22), stackPath, {
  samples: 28,
  edgeLength: 0.55,
});

const cabin = house.subtract(cabinCut);
const chimney = stack.subtract(stackInner);

return [
  { name: "Hull", shape: hull.color('#ce6f4e') },
  { name: "Cabin", shape: cabin.color('#f0eee9') },
  { name: "Chimney", shape: chimney.color('#3d4854') },
];
````

### examples/api/bill-of-materials.forge.js

````javascript
// API demo: script-declared bill of materials that gets auto-summed in report export

const frameWidth = param('Frame Width', 900, { min: 300, max: 1800, unit: 'mm' });
const frameDepth = param('Frame Depth', 500, { min: 200, max: 1200, unit: 'mm' });
const legHeight = param('Leg Height', 720, { min: 300, max: 1200, unit: 'mm' });
const tubeW = param('Tube Width', 30, { min: 15, max: 80, unit: 'mm' });
const tubeH = param('Tube Height', 20, { min: 10, max: 80, unit: 'mm' });

const frontBolts = param('Front Bolts', 8, { min: 0, max: 64, integer: true });
const rearBolts = param('Rear Bolts', 8, { min: 0, max: 64, integer: true });
const boltLength = param('Bolt Length', 16, { min: 6, max: 60, unit: 'mm' });

const wall = 2;
const longTubeMm = frameWidth * 2;
const shortTubeMm = frameDepth * 2;
const legTubeMm = legHeight * 4;
const totalTubeMm = longTubeMm + shortTubeMm + legTubeMm;

// Physical materials are authored by code, not inferred from mesh primitives.
bom(totalTubeMm, `iron tube with dimensions ${tubeW} x ${tubeH}`, { unit: 'mm' });

// These two lines intentionally share the same descriptor so report export sums them.
bom(frontBolts, `M4 bolt of ${boltLength} mm length`, { unit: 'pieces' });
bom(rearBolts, `M4 bolt of ${boltLength} mm length`, { unit: 'pieces' });

const railFront = box(frameWidth, tubeW, tubeH).color('#778da9');
const railBack = box(frameWidth, tubeW, tubeH).translate(0, frameDepth - tubeW, 0).color('#778da9');
const railLeft = box(tubeW, frameDepth, tubeH).color('#778da9');
const railRight = box(tubeW, frameDepth, tubeH).translate(frameWidth - tubeW, 0, 0).color('#778da9');

const legSize = Math.min(tubeW, tubeH);
const legA = box(legSize, legSize, legHeight).translate(0, 0, tubeH).color('#415a77');
const legB = box(legSize, legSize, legHeight).translate(frameWidth - legSize, 0, tubeH).color('#415a77');
const legC = box(legSize, legSize, legHeight).translate(0, frameDepth - legSize, tubeH).color('#415a77');
const legD = box(legSize, legSize, legHeight).translate(frameWidth - legSize, frameDepth - legSize, tubeH).color('#415a77');

return [
  { name: 'Front Rail', shape: railFront },
  { name: 'Back Rail', shape: railBack },
  { name: 'Left Rail', shape: railLeft },
  { name: 'Right Rail', shape: railRight },
  { name: 'Leg A', shape: legA },
  { name: 'Leg B', shape: legB },
  { name: 'Leg C', shape: legC },
  { name: 'Leg D', shape: legD },
];
````

### examples/api/boolean-operations.forge.js

````javascript
// Boolean operations — union, difference, intersection.
//
// union(a, b)        → combined volume
// difference(a, b)   → a minus b (subtract b from a)
// intersection(a, b) → only the overlapping volume
//
// Method syntax: a.add(b), a.subtract(b), a.intersect(b)

const size = param("Size", 30, { min: 15, max: 50, unit: "mm" });
const overlap = param("Overlap", 15, { min: 0, max: 30, unit: "mm" });
const spacing = 80;

// Two overlapping shapes for each demo
function makePair(offsetX) {
  const a = box(size, size, size, true).translate(offsetX, 0, 0).color('#4488cc');
  const b = sphere(size * 0.6).translate(offsetX + size - overlap, 0, 0).color('#cc4444');
  return [a, b];
}

// 1. Union — combined
const [u1, u2] = makePair(0);
const unioned = union(u1, u2).color('#8866cc');

// 2. Difference — box minus sphere
const [d1, d2] = makePair(spacing);
const diffed = d1.subtract(d2);

// 3. Intersection — only overlap
const [i1, i2] = makePair(2 * spacing);
const intersected = intersection(i1, i2).color('#cc8844');

// Show the original shapes (translucent-ish via separate objects) for reference
const refA = box(size, size, size, true).translate(3 * spacing, 0, 0).color('#4488cc');
const refB = sphere(size * 0.6).translate(3 * spacing + size - overlap, 0, 0).color('#cc4444');

return [
  { name: "Union", shape: unioned },
  { name: "Difference (box - sphere)", shape: diffed },
  { name: "Intersection", shape: intersected },
  { name: "Original Box", shape: refA },
  { name: "Original Sphere", shape: refB },
];
````

### examples/api/bounding-box-visualizer.forge.js

````javascript
// Visualize bounding boxes — useful for debugging positioning.
//
// boundingBox() returns { min: [x,y,z], max: [x,y,z] }.
// This example draws thin cylinders along the 12 edges of the bbox.

const edgeR = 0.5; // wireframe edge radius

function vizBBox(shape) {
  const bb = shape.boundingBox();
  const [x0, y0, z0] = bb.min;
  const [x1, y1, z1] = bb.max;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;

  const edges = [];
  // 4 edges along X (at each combination of Y,Z corners)
  for (const y of [y0, y1]) {
    for (const z of [z0, z1]) {
      edges.push(cylinder(dx, edgeR).pointAlong([1, 0, 0]).translate(x0, y, z));
    }
  }
  // 4 edges along Y
  for (const x of [x0, x1]) {
    for (const z of [z0, z1]) {
      edges.push(cylinder(dy, edgeR).pointAlong([0, 1, 0]).translate(x, y0, z));
    }
  }
  // 4 edges along Z
  for (const x of [x0, x1]) {
    for (const y of [y0, y1]) {
      edges.push(cylinder(dz, edgeR).translate(x, y, z0));
    }
  }
  return union(...edges);
}

// --- Demo shapes ---

// A rotated box — bbox is larger than the shape itself
const angle = param("Rotation", 30, { min: 0, max: 90, unit: "°" });
const rotBox = box(40, 30, 20, true).rotate(0, 0, angle).color('#4488cc');
const rotBBox = vizBBox(rotBox).color('#cc4444');

// A sphere — bbox is a perfect cube around it
const sph = sphere(20).translate(80, 0, 0).color('#44cc44');
const sphBBox = vizBBox(sph).color('#cc4444');

// A tilted cylinder — bbox shows the extent
const tiltCyl = cylinder(50, 10).rotate(30, 0, 0).translate(0, 80, 0).color('#cc88ff');
const cylBBox = vizBBox(tiltCyl).color('#cc4444');

return [
  { name: "Rotated Box", shape: rotBox },
  { name: "Box BBox", shape: rotBBox },
  { name: "Sphere", shape: sph },
  { name: "Sphere BBox", shape: sphBBox },
  { name: "Tilted Cylinder", shape: tiltCyl },
  { name: "Cylinder BBox", shape: cylBBox },
];
````

### examples/api/brep-exportable.forge.js

````javascript
// Exact-exportable subset demo for STEP/BREP.
// Run: npm run step -- examples/api/brep-exportable.forge.js

const plate = rect(120, 80, true).extrude(10).color('#748b99');
const boss = cylinder(24, 18).translate(0, 0, 10).color('#b7c4cc');

const leftHole = cylinder(18, 5).translate(-34, 0, -4);
const rightHole = cylinder(18, 5).translate(34, 0, -4);
const centerBore = cylinder(34, 8).translate(0, 0, 6);

const exactPart = union(plate.toShape(), boss)
  .subtract(leftHole)
  .subtract(rightHole)
  .subtract(centerBore)
  .color('#9db1bd');

return [
  { name: 'Exact Export Demo', shape: exactPart },
];
````

### examples/api/center-true-vs-false.forge.js

````javascript
// center=true vs center=false — the #1 source of positioning confusion.
//
// box(w, d, h)        → corner at origin, extends into +X, +Y, +Z
// box(w, d, h, true)  → centered at origin
//
// Same applies to cylinder(h, r) vs cylinder(h, r, r, undefined, true).

const w = 40, d = 30, h = 20;

// --- Side-by-side comparison ---

// Left: center=false (default). Red sphere marks the origin [0,0,0].
const cornerBox = box(w, d, h).color('#4488cc').translate(-60, 0, 0);
const cornerOrigin = sphere(2).color('#cc0000').translate(-60, 0, 0);

// Right: center=true. Red sphere marks the origin [0,0,0].
const centeredBox = box(w, d, h, true).color('#44cc88').translate(60, 0, 0);
const centeredOrigin = sphere(2).color('#cc0000').translate(60, 0, 0);

// --- Practical impact: placing a cylinder on top of a base ---

// With center=false: cylinder must go to (w/2, d/2, h)
const base1 = box(w, d, h).color('#888888').translate(-60, 60, 0);
const cyl1 = cylinder(15, 6).color('#cc8844').translate(-60 + w/2, 60 + d/2, h);

// With center=true + attachTo: no math needed
const base2 = box(w, d, h, true).color('#888888').translate(60, 60 + d/2, h/2);
const cyl2 = cylinder(15, 6).color('#cc8844')
  .attachTo(base2, 'top', 'bottom');

return [
  { name: "Corner Box (center=false)", shape: cornerBox },
  { name: "Corner Origin ●", shape: cornerOrigin },
  { name: "Centered Box (center=true)", shape: centeredBox },
  { name: "Centered Origin ●", shape: centeredOrigin },
  { name: "Base (corner)", shape: base1 },
  { name: "Cylinder (manual math)", shape: cyl1 },
  { name: "Base (centered)", shape: base2 },
  { name: "Cylinder (attachTo)", shape: cyl2 },
];
````

### examples/api/clone-duplicate.forge.js

````javascript
// clone() / duplicate() — explicit copy helpers for Shape, TrackedShape, Sketch, and ShapeGroup.

const spacing = param("Spacing", 90, { min: 40, max: 180, unit: "mm" });

// --- Shape clone ---
const block = box(36, 20, 12, true).color("#4a90e2");
const blockL = block.clone().translate(-spacing / 2, 0, 0);
const blockR = block.duplicate().translate(spacing / 2, 0, 0);

// --- TrackedShape clone (topology preserved) ---
const post = cylinder(36, 6).color("#49b675");
const postCopy = post.clone().translate(0, 45, 0);

// --- Sketch clone ---
const slotProfile = slot(30, 10).color("#e98b39");
const slotL = slotProfile.clone().translate(-spacing / 2, -35);
const slotR = slotProfile.duplicate().translate(spacing / 2, -35);

// --- ShapeGroup clone ---
const module = group(block, post.attachTo(block, "top", "bottom"));
const moduleL = module.clone().translate(-spacing / 2, 95, 0);
const moduleR = module.duplicate().translate(spacing / 2, 95, 0).color("#c85a54");

return [
  { name: "Shape clone/duplicate", group: [
    { name: "Block L", shape: blockL },
    { name: "Block R", shape: blockR },
  ] },
  { name: "TrackedShape clone", shape: postCopy },
  { name: "Sketch clone/duplicate", group: [
    { name: "Slot L", sketch: slotL },
    { name: "Slot R", sketch: slotR },
  ] },
  { name: "ShapeGroup clone/duplicate", group: [
    { name: "Module L", shape: moduleL },
    { name: "Module R", shape: moduleR },
  ] },
];
````

### examples/api/colors-union-vs-array.forge.js

````javascript
// Colors: union() vs returning separate objects.
//
// ❌ union() merges into one mesh → only the first shape's color survives.
// ✅ Returning an array of {name, shape} → each keeps its own color.

const size = 25;
const gap = 5;

// --- Three colored boxes ---
const red   = box(size, size, size, true).color('#cc4444');
const green = box(size, size, size, true).color('#44cc44').translate(size + gap, 0, 0);
const blue  = box(size, size, size, true).color('#4444cc').translate(2 * (size + gap), 0, 0);

// BAD: union kills individual colors — result is all red (first shape's color)
const merged = union(red, green, blue).translate(-80, 0, 0);

// GOOD: separate objects keep their colors
const redSep   = box(size, size, size, true).color('#cc4444').translate(80, 0, 0);
const greenSep = box(size, size, size, true).color('#44cc44').translate(80 + size + gap, 0, 0);
const blueSep  = box(size, size, size, true).color('#4444cc').translate(80 + 2 * (size + gap), 0, 0);

return [
  { name: "❌ Union (all one color)", shape: merged },
  { name: "✅ Red (separate)", shape: redSep },
  { name: "✅ Green (separate)", shape: greenSep },
  { name: "✅ Blue (separate)", shape: blueSep },
];
````

### examples/api/coordinate-system.forge.js

````javascript
// Coordinate system — ForgeCAD uses Z-up, right-handed.
//   X = right (+X), left (-X)
//   Y = forward (+Y), back (-Y)
//   Z = up (+Z), down (-Z)
//
// "front" = -Y face (camera default looks from -Y toward +Y)
// "back"  = +Y face

const axisLen = 80;
const shaftR = 2;
const tipH = 10;
const tipR = 5;

// X axis — red, pointing right
const xShaft = cylinder(axisLen, shaftR).pointAlong([1, 0, 0]).color('#cc4444');
const xTip = cylinder(tipH, tipR, 0).pointAlong([1, 0, 0]).translate(axisLen, 0, 0).color('#cc4444');
const xMark = sphere(4).translate(axisLen + tipH + 5, 0, 0).color('#cc4444');

// Y axis — green, pointing forward
const yShaft = cylinder(axisLen, shaftR).pointAlong([0, 1, 0]).color('#44cc44');
const yTip = cylinder(tipH, tipR, 0).pointAlong([0, 1, 0]).translate(0, axisLen, 0).color('#44cc44');
const yMark = box(7, 7, 7, true).translate(0, axisLen + tipH + 5, 0).color('#44cc44');

// Z axis — blue, pointing up
const zShaft = cylinder(axisLen, shaftR).color('#4444cc');
const zTip = cylinder(tipH, tipR, 0).translate(0, 0, axisLen).color('#4444cc');
const zMark = cylinder(4, 4, 4, 6).translate(0, 0, axisLen + tipH + 5).color('#4444cc');

// Origin
const origin = sphere(3).color('#ffffff');

// Reference box to show face names
const ref = box(30, 20, 15, true).translate(40, 40, 0).color('#888888');
// "front" face is at -Y, "right" face is at +X, "top" face is at +Z
const frontDot = sphere(3).color('#ffaa00')
  .attachTo(ref, 'front', 'center', [0, -5, 0]);
const topDot = sphere(3).color('#ffaa00')
  .attachTo(ref, 'top', 'center', [0, 0, 5]);

return [
  { name: "X shaft (right)", shape: xShaft },
  { name: "X tip", shape: xTip },
  { name: "X mark ●", shape: xMark },
  { name: "Y shaft (forward)", shape: yShaft },
  { name: "Y tip", shape: yTip },
  { name: "Y mark ■", shape: yMark },
  { name: "Z shaft (up)", shape: zShaft },
  { name: "Z tip", shape: zTip },
  { name: "Z mark ⬡", shape: zMark },
  { name: "Origin", shape: origin },
  { name: "Reference Box", shape: ref },
  { name: "Front dot (−Y)", shape: frontDot },
  { name: "Top dot (+Z)", shape: topDot },
];
````

### examples/api/curves-surfacing-basics.forge.js

````javascript
// Curves + Surfacing basics
// Demonstrates reusable APIs for everyday products:
// - spline2d() for smooth section sketches
// - loft() for section-driven solids
// - spline3d() + sweep() for curved tubes/handles/details

const height = param("Bottle Height", 170, { min: 110, max: 260, unit: "mm" });
const bodyW = param("Body Width", 72, { min: 45, max: 110, unit: "mm" });
const bodyD = param("Body Depth", 48, { min: 30, max: 90, unit: "mm" });
const neckW = param("Neck Width", 28, { min: 18, max: 45, unit: "mm" });
const neckD = param("Neck Depth", 24, { min: 14, max: 40, unit: "mm" });
const corner = param("Corner Round", 8, { min: 2, max: 20, unit: "mm" });

const sectionAt = (w, d, pinch = 0) => spline2d([
  [w * 0.5, 0],
  [w * 0.42, d * 0.45],
  [w * 0.2, d * 0.5 + pinch],
  [0, d * 0.52 + pinch],
  [-w * 0.2, d * 0.5 + pinch],
  [-w * 0.42, d * 0.45],
  [-w * 0.5, 0],
  [-w * 0.42, -d * 0.45],
  [-w * 0.2, -d * 0.5 + pinch],
  [0, -d * 0.52 + pinch],
  [w * 0.2, -d * 0.5 + pinch],
  [w * 0.42, -d * 0.45],
], {
  closed: true,
  samplesPerSegment: 10,
  tension: 0.42,
}).offset(corner * 0.08, 'Round');

const z0 = 0;
const z1 = height * 0.25;
const z2 = height * 0.62;
const z3 = height * 0.9;
const z4 = height;

const body = loft(
  [
    sectionAt(bodyW * 0.86, bodyD * 0.84, -2),
    sectionAt(bodyW, bodyD, 0),
    sectionAt(bodyW * 0.92, bodyD * 0.94, 1),
    sectionAt(neckW * 1.25, neckD * 1.2, 0.5),
    sectionAt(neckW, neckD, 0),
  ],
  [z0, z1, z2, z3, z4],
  { edgeLength: 1.1 },
);

// Hollow interior by lofting smaller inner sections.
const wall = 2.4;
const inner = loft(
  [
    sectionAt(bodyW * 0.78, bodyD * 0.76, -2.2),
    sectionAt(bodyW - wall * 2, bodyD - wall * 2, -0.6),
    sectionAt(bodyW * 0.86 - wall * 2, bodyD * 0.88 - wall * 2, 0.2),
    sectionAt(neckW * 1.06 - wall, neckD * 1.06 - wall, 0),
    sectionAt(neckW - wall, neckD - wall, 0),
  ],
  [z0 + 3, z1, z2, z3, z4 + 2],
  { edgeLength: 1.1 },
);

let bottle = body.subtract(inner);
// Mild smoothing to reduce voxel-like artifacts on curved sections.
bottle = bottle.smoothOut(70, 0.25).refine(2);

// Curved spout/tube detail using sweep.
const spoutPath = spline3d(
  [
    [0, 0, z4 - 8],
    [12, 0, z4 + 8],
    [26, 0, z4 + 24],
    [36, 0, z4 + 16],
  ],
  { tension: 0.45 },
);
const spout = sweep(circle2d(2.8, 20), spoutPath, {
  samples: 36,
  edgeLength: 0.65,
});

const topCap = circle2d(Math.max(neckW, neckD) * 0.34, 40).extrude(9)
  .translate(0, 0, z4 - 1.5);

return [
  { name: "Bottle Body", shape: bottle.color('#d8e5ec') },
  { name: "Spout", shape: spout.color('#c0ccd4') },
  { name: "Cap", shape: topCap.color('#4f5f70') },
];
````

### examples/api/dimensioned-bracket.forge.js

````javascript
// Dimensioned L-bracket — shows how to add dimension annotations

const w = param("Width", 80, { min: 40, max: 150, unit: "mm" });
const h = param("Height", 60, { min: 30, max: 100, unit: "mm" });
const d = param("Depth", 40, { min: 20, max: 80, unit: "mm" });
const t = param("Thickness", 5, { min: 2, max: 15, unit: "mm" });

// Build the L-bracket
const base = box(w, d, t);
const wall = box(t, d, h).translate(0, 0, t);
const bracket = union(base, wall);

// Add dimensions — purely visual annotations
dim([0, 0, 0], [w, 0, 0], { label: "Width" });
dim([0, 0, 0], [0, d, 0], { label: "Depth", offset: 12 });
dim([0, 0, 0], [0, 0, h + t], { label: "Height", offset: 15 });
dim([0, 0, 0], [t, 0, 0], { label: "Wall", offset: -8, color: "#ffaa44" });

return bracket;
````

### examples/api/elbow-test.forge.js

````javascript
// Test lib.elbow() — pipe bend primitive
const pipeR = param("Pipe Radius", 5, { min: 2, max: 15, unit: "mm" });
const bendR = param("Bend Radius", 25, { min: 10, max: 60, unit: "mm" });
const angle = param("Angle", 90, { min: 15, max: 180, unit: "°" });

// Basic elbow at default orientation
const basic = lib.elbow(pipeR, bendR, angle).color('#B87333');

// Elbow with from/to directions
const oriented = lib.elbow(pipeR, bendR, {
  from: [0, 0, 1],
  to: [1, 0, 0],
}).translate(80, 0, 0).color('#4488cc');

// Hollow elbow
const hollow = lib.elbow(pipeR, bendR, angle, { wall: 1.5 })
  .translate(0, 80, 0).color('#888888');

return [
  { name: "Basic 90° Elbow", shape: basic },
  { name: "Oriented Elbow (Z→X)", shape: oriented },
  { name: "Hollow Elbow", shape: hollow },
];
````

### examples/api/exploded-view.forge.js

````javascript
// Standard-library exploded view: staged offsets + per-part direction overrides.

const explodeAmt = param("Explode", 0, { min: 0, max: 36, unit: "mm" });

const base = box(120, 80, 10, true).color('#5f6d7a');
const pedestal = box(70, 40, 20, true).translate(0, 0, 15).color('#6f7f8f');

const motorBody = cylinder(55, 16, 16, 40, true)
  .pointAlong([1, 0, 0])
  .translate(0, 0, 32)
  .color('#8f9eab');
const shaft = cylinder(80, 4, 4, 24, true)
  .pointAlong([1, 0, 0])
  .translate(0, 0, 32)
  .color('#d1d7de');
const rotorCap = cylinder(8, 18, 18, 36, true)
  .pointAlong([1, 0, 0])
  .translate(31, 0, 32)
  .color('#9eacb9');

const boltTemplate = lib.bolt(6, 26).rotate(180, 0, 0).color('#d8dde3');
const bolts = [
  boltTemplate.translate(-45, -25, 10),
  boltTemplate.translate(45, -25, 10),
  boltTemplate.translate(-45, 25, 10),
  boltTemplate.translate(45, 25, 10),
];

const explodedParts = [
  { name: "Base", shape: base },
  { name: "Pedestal", shape: pedestal, explode: { stage: 0.35, direction: [0, 0, 1] } },
  {
    name: "Drive",
    group: [
      { name: "Motor Body", shape: motorBody },
      { name: "Rotor Cap", shape: rotorCap, explode: { stage: 1.1, direction: [1, 0, 0] } },
      { name: "Shaft", shape: shaft },
    ],
  },
  {
    name: "Fasteners",
    group: bolts.map((b, i) => ({
      name: `Bolt ${i + 1}`,
      shape: b,
      explode: { stage: 0.9, direction: 'z' },
    })),
  },
];

cutPlane("Center Section", [0, 1, 0], 0);

return lib.explode(explodedParts, {
  amount: explodeAmt,
  stages: [0.35, 0.7, 1.0],
  mode: 'radial',
  byName: {
    "Shaft": { direction: [1, 0, 0], stage: 1.4 },
    "Fasteners": { axisLock: 'z', stage: 0.45 },
  },
});
````

### examples/api/extrude-options.forge.js

````javascript
// Extrude options — twist, taper, center.
//
// .extrude(height) is the basic form.
// Options: { twist, divisions, scaleTop, center }

const r = param("Radius", 20, { min: 10, max: 40, unit: "mm" });
const h = param("Height", 60, { min: 20, max: 120, unit: "mm" });
const twist = param("Twist", 90, { min: 0, max: 360, unit: "°" });
const taper = param("Taper", 0.5, { min: 0.1, max: 1.0 });
const spacing = 60;

// 1. Plain extrude
const plain = ngon(6, r).extrude(h)
  .color('#4488cc');

// 2. Twisted extrude — needs divisions for smooth twist
const twisted = ngon(6, r).extrude(h, { twist: twist, divisions: 32 })
  .translate(spacing, 0, 0)
  .color('#cc8844');

// 3. Tapered extrude — scaleTop shrinks the top face
const tapered = circle2d(r).extrude(h, { scaleTop: taper })
  .translate(2 * spacing, 0, 0)
  .color('#44cc88');

// 4. Centered extrude — shape is centered along Z instead of starting at Z=0
const centered = rect(r * 1.5, r, true).extrude(h, { center: true })
  .translate(3 * spacing, 0, 0)
  .color('#cc44cc');

// 5. Combined: twist + taper
const combo = star(5, r, r * 0.5).extrude(h, {
  twist: twist,
  scaleTop: taper,
  divisions: 32,
}).translate(4 * spacing, 0, 0).color('#cccc44');

return [
  { name: "Plain", shape: plain },
  { name: "Twisted", shape: twisted },
  { name: "Tapered", shape: tapered },
  { name: "Centered (Z)", shape: centered },
  { name: "Twist + Taper", shape: combo },
];
````

### examples/api/gears-bevel-face-joints.forge.js

````javascript
// Bevel + face gear demo with runtime joint couplings.
// Use the "Joints" section in the View Panel to drive both stages.

const moduleSize = param("Module", 1.4, { min: 0.8, max: 3.0, step: 0.05 });
const bevelInput = param("Bevel Driver", 30, { min: -360, max: 360, step: 1, unit: "°" });
const faceInput = param("Face Driver", 20, { min: -360, max: 360, step: 1, unit: "°" });
const shaftAngle = param("Bevel Shaft", 90, { min: 60, max: 120, step: 1, unit: "°" });

const bevelStage = lib.bevelGearPair({
  pinion: {
    module: moduleSize,
    teeth: 16,
    faceWidth: 10,
    boreDiameter: 5,
  },
  gear: {
    module: moduleSize,
    teeth: 32,
    faceWidth: 9,
    boreDiameter: 8,
  },
  shaftAngleDeg: shaftAngle,
  place: true,
});

const faceStage = lib.faceGearPair({
  pinion: {
    module: moduleSize,
    teeth: 14,
    faceWidth: 8,
    boreDiameter: 5,
  },
  gear: {
    module: moduleSize,
    teeth: 44,
    faceWidth: 7,
    toothHeight: moduleSize * 0.9,
    boreDiameter: 10,
  },
  place: true,
});

for (const d of [...bevelStage.diagnostics, ...faceStage.diagnostics]) {
  const tag = `[${d.level}] ${d.code}`;
  if (d.level === "error") console.error(tag, d.message);
  else if (d.level === "warn") console.warn(tag, d.message);
  else console.info(tag, d.message);
}

const addOffset = (point, offset) => [
  point[0] + offset[0],
  point[1] + offset[1],
  point[2] + offset[2],
];

const bevelOffset = [-110, 0, 0];
const faceOffset = [110, 0, 0];

const bevelPinionPivot = addOffset(bevelStage.pinionCenter, bevelOffset);
const bevelGearPivot = addOffset(bevelStage.gearCenter, bevelOffset);
const facePinionPivot = addOffset(faceStage.pinionCenter, faceOffset);
const faceGearPivot = addOffset(faceStage.gearCenter, faceOffset);

jointsView({
  joints: [
    {
      name: "Bevel Driver",
      child: "Bevel Pinion",
      type: "revolute",
      axis: bevelStage.pinionAxis,
      pivot: bevelPinionPivot,
      min: -1080,
      max: 1080,
      default: bevelInput,
      unit: "°",
    },
    {
      name: "Bevel Driven",
      child: "Bevel Gear",
      type: "revolute",
      axis: bevelStage.gearAxis,
      pivot: bevelGearPivot,
      min: -1080,
      max: 1080,
      default: 0,
      unit: "°",
    },
    {
      name: "Face Driver",
      child: "Face Pinion",
      type: "revolute",
      axis: faceStage.pinionAxis,
      pivot: facePinionPivot,
      min: -1080,
      max: 1080,
      default: faceInput,
      unit: "°",
    },
    {
      name: "Face Driven",
      child: "Face Gear",
      type: "revolute",
      axis: faceStage.gearAxis,
      pivot: faceGearPivot,
      min: -1080,
      max: 1080,
      default: 0,
      unit: "°",
    },
  ],
  couplings: [
    {
      joint: "Bevel Driven",
      terms: [{ joint: "Bevel Driver", ratio: bevelStage.jointRatio }],
    },
    {
      joint: "Face Driven",
      terms: [{ joint: "Face Driver", ratio: faceStage.jointRatio }],
    },
  ],
  animations: [
    {
      name: "Dual Spin",
      duration: 2.4,
      loop: true,
      keyframes: [
        { at: 0.0, values: { "Bevel Driver": 0, "Face Driver": 0 } },
        { at: 0.5, values: { "Bevel Driver": 180, "Face Driver": 120 } },
        { at: 1.0, values: { "Bevel Driver": 360, "Face Driver": 240 } },
      ],
    },
  ],
  defaultAnimation: "Dual Spin",
});

return [
  {
    name: "Bevel Pinion",
    shape: bevelStage.pinion.translate(bevelOffset[0], bevelOffset[1], bevelOffset[2]).color("#d7a25e"),
  },
  {
    name: "Bevel Gear",
    shape: bevelStage.gear.translate(bevelOffset[0], bevelOffset[1], bevelOffset[2]).color("#8ea8be"),
  },
  {
    name: "Face Pinion",
    shape: faceStage.pinion.translate(faceOffset[0], faceOffset[1], faceOffset[2]).color("#c98f5a"),
  },
  {
    name: "Face Gear",
    shape: faceStage.gear.translate(faceOffset[0], faceOffset[1], faceOffset[2]).color("#6f8795"),
  },
];
````

### examples/api/gears-tier1.forge.js

````javascript
// Tier 1 gears demo: spur pair + ring gear + rack gear

const moduleSize = param("Module", 1.25, { min: 0.6, max: 3.0, step: 0.05 });
const pinionTeeth = param("Pinion Teeth", 14, { min: 8, max: 28, integer: true });
const drivenTeeth = param("Driven Teeth", 42, { min: 16, max: 90, integer: true });
const backlash = param("Backlash", 0.05, { min: 0, max: 0.2, step: 0.01, unit: "mm" });
const faceWidth = param("Face Width", 10, { min: 4, max: 18, unit: "mm" });

const pair = lib.gearPair({
  pinion: {
    module: moduleSize,
    teeth: pinionTeeth,
    pressureAngleDeg: 20,
    faceWidth,
    boreDiameter: 5,
  },
  gear: {
    module: moduleSize,
    teeth: drivenTeeth,
    pressureAngleDeg: 20,
    faceWidth,
    boreDiameter: 8,
  },
  backlash,
});

for (const d of pair.diagnostics) {
  const tag = `[${d.level}] ${d.code}`;
  if (d.level === "error") console.error(tag, d.message);
  else if (d.level === "warn") console.warn(tag, d.message);
  else console.info(tag, d.message);
}

const ring = lib.ringGear({
  module: moduleSize,
  teeth: Math.max(30, drivenTeeth + pinionTeeth + 4),
  pressureAngleDeg: 20,
  faceWidth,
  backlash,
  rimWidth: moduleSize * 3,
}).translate(0, 95, 0);

const rack = lib.rackGear({
  module: moduleSize,
  teeth: 22,
  pressureAngleDeg: 20,
  faceWidth,
  backlash,
  baseHeight: moduleSize * 2,
}).translate(0, -95, 0);

return [
  { name: "Spur Pinion", shape: pair.pinion.color("#d5a15f") },
  { name: "Spur Gear", shape: pair.gear.color("#9ab3ca") },
  { name: "Ring Gear", shape: ring.color("#71808d") },
  { name: "Rack Gear", shape: rack.color("#6f9272") },
];
````

### examples/api/geometry-info.forge.js

````javascript
// Geometry provenance inspection.
// Run with: npm run test-run -- examples/api/geometry-info.forge.js
// The CLI now prints backend/representation/fidelity/topology for each object.

const base = rectangle(-35, -20, 70, 40).extrude(18).color('#5f7c8a');

const cutter = circle2d(11, 36).extrude(26).translate(0, 0, -4);
const machined = base
  .toShape()
  .subtract(cutter)
  .color('#9eb4bf')
  .translate(0, 72, 0);

const station = (w, d) => spline2d([
  [w * 0.5, 0],
  [w * 0.32, d * 0.46],
  [0, d * 0.55],
  [-w * 0.32, d * 0.46],
  [-w * 0.5, 0],
  [-w * 0.32, -d * 0.46],
  [0, -d * 0.55],
  [w * 0.32, -d * 0.46],
], {
  closed: true,
  samplesPerSegment: 9,
  tension: 0.35,
});

const lofted = loft(
  [
    station(26, 18),
    station(48, 28),
    station(34, 22),
  ],
  [0, 20, 46],
  { edgeLength: 0.85 },
)
  .translate(110, 18, 0)
  .color('#d8b36a');

console.info('Tracked extrude', base.geometryInfo());
console.info('Boolean cut', machined.geometryInfo());
console.info('Lofted body', lofted.geometryInfo());

return [
  { name: 'Tracked Extrude', shape: base },
  { name: 'Boolean Cut', shape: machined },
  { name: 'Lofted Body', shape: lofted },
];
````

### examples/api/group-test.forge.js

````javascript
// Test assembly grouping — nested group format
const baseW = param("Base Width", 100, { min: 60, max: 200, unit: "mm" });
const baseD = param("Base Depth", 80, { min: 40, max: 150, unit: "mm" });

// Bed assembly
const bedPlate = box(baseW, baseD, 5).color('#666666');
const glass = box(baseW - 10, baseD - 10, 3).translate(5, 5, 5).color('#aaddff');
const heater = box(baseW - 20, baseD - 20, 1).translate(10, 10, -1).color('#cc4444');

// Gantry
const leftRail = box(5, baseD, 60).translate(-10, 0, 8).color('#888888');
const rightRail = box(5, baseD, 60).translate(baseW + 5, 0, 8).color('#888888');
const crossBar = box(baseW + 20, 5, 5).translate(-10, baseD / 2, 63).color('#aaaaaa');

// Extruder (intentionally overlaps crossbar — intra-group collision)
const nozzle = cylinder(15, 4).translate(baseW / 2, baseD / 2, 48).color('#ff8800');
const heatsink = box(20, 20, 10, true).translate(baseW / 2, baseD / 2, 60).color('#cccccc');

return [
  { name: "Bed Assembly", group: [
    { name: "Bed Plate", shape: bedPlate },
    { name: "Glass Bed", shape: glass },
    { name: "Heater", shape: heater },
  ]},
  { name: "Gantry", group: [
    { name: "Left Rail", shape: leftRail },
    { name: "Right Rail", shape: rightRail },
    { name: "Cross Bar", shape: crossBar },
  ]},
  { name: "Extruder", group: [
    { name: "Nozzle", shape: nozzle },
    { name: "Heatsink", shape: heatsink },
  ]},
];
````

### examples/api/group-vs-union.forge.js

````javascript
// group() vs union() — when to use which.
//
// union(a, b)  → merges into ONE mesh. Colors lost. Good for boolean operand.
// group(a, b)  → keeps separate. Colors preserved. Transforms together.
//
// Use union when you need a single solid (e.g., to subtract from something).
// Use group when you want parts to move together but stay visually distinct.

const base = box(60, 60, 5, true).color('#888888');
const col = cylinder(30, 5).color('#cc4444')
  .attachTo(base, 'top', 'bottom');

// --- group: colors preserved, transforms together ---
const grouped = group(base, col).translate(-50, 0, 0);

// --- union: one solid, one color ---
const unioned = union(base, col).translate(50, 0, 0).color('#4488cc');

return [
  grouped,  // each child becomes a separate viewport object
  { name: "Union (single solid)", shape: unioned },
];
````

### examples/api/import-args-unit.forge.js

````javascript
const w = param("Width", 30, { min: 10, max: 80, unit: "mm" });
const h = param("Height", 20, { min: 10, max: 80, unit: "mm" });
const d = param("Depth", 10, { min: 4, max: 40, unit: "mm" });

return box(w, d, h, true);
````

### examples/api/import-args.forge.js

````javascript
const left = importPart("api/import-args-unit.forge.js", {
  "Width": 24,
  "Height": 24,
  "Depth": 8,
}).translate(-20, 0, 0);

const right = importPart("api/import-args-unit.forge.js", {
  "Width": 52,
  "Height": 16,
  "Depth": 12,
}).translate(20, 0, 0);

return [
  { name: "Left", shape: left, color: "#5c88da" },
  { name: "Right", shape: right, color: "#d97c45" },
];
````

### examples/api/import-dimensions-follow.forge.js

````javascript
const left = importPart("api/dimensioned-bracket.forge.js", {
  "Width": 55,
  "Height": 45,
  "Depth": 28,
  "Thickness": 4,
}).translate(-80, 0, 0);

const right = importPart("api/dimensioned-bracket.forge.js", {
  "Width": 55,
  "Height": 45,
  "Depth": 28,
  "Thickness": 4,
}).translate(80, 0, 0).rotate(0, 0, 180);

return [
  { name: "Left Bracket", shape: left, color: "#6a7bd1" },
  { name: "Right Bracket", shape: right, color: "#d18a5a" },
];
````

### examples/api/import-placement-references.forge.js

````javascript
// Placement references let imported parts define semantic attachment points.

const left = importPart("api/import-placement-widget-source.forge.js")
  .placeReference("mount", [-90, 0, 0]);

const right = importPart("api/import-placement-widget-source.forge.js", {
  "Post Height": 40,
}).attachTo(left, "objects.post.top", "mount", [90, 0, 0]);

const cap = box(18, 18, 8, true)
  .attachTo(right, "objects.post.top", "bottom")
  .color("#384b5f");

return [
  { name: "Left", shape: left, color: "#5b7c8d" },
  { name: "Right", shape: right, color: "#d38b4d" },
  { name: "Cap", shape: cap },
];
````

### examples/api/import-placement-widget-source.forge.js

````javascript
const postHeight = param("Post Height", 26, { min: 12, max: 60, unit: "mm" });

const base = box(48, 32, 8, true);
const post = cylinder(postHeight, 5, undefined, 48, true)
  .translate(12, 0, 4 + postHeight / 2);

return union(base, post)
  .withReferences({
    points: {
      mount: [0, -16, -4],
      postCenter: [12, 0, 4 + postHeight / 2],
    },
    edges: {
      postAxis: {
        start: [12, 0, 4],
        end: [12, 0, 4 + postHeight],
      },
    },
    surfaces: {
      mountingFace: {
        center: [0, -16, 0],
        normal: [0, -1, 0],
      },
    },
    objects: {
      base,
      post,
    },
  })
  .color("#5b7c8d");
````

### examples/api/import-relative-paths.forge.js

````javascript
// Relative import paths: ./ resolves from this file's folder.

const left = importPart("./import-args-unit.forge.js", {
  "Width": 26,
  "Height": 22,
  "Depth": 9,
}).translate(-24, 0, 0);

const right = importPart("./import-args-unit.forge.js", {
  "Width": 46,
  "Height": 18,
  "Depth": 12,
}).translate(24, 0, 0);

return [
  { name: "Left (./)", shape: left, color: "#5f87c6" },
  { name: "Right (./)", shape: right, color: "#d18a5a" },
];
````

### examples/api/import-svg-sketch-shape.svg

````xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
  <path
    fill="#111111"
    fill-rule="evenodd"
    d="M 8 8 H 72 V 72 H 8 Z M 28 28 H 52 V 52 H 28 Z"
  />
  <circle cx="100" cy="16" r="7" fill="#111111" />
  <polyline
    points="88,46 100,60 112,46"
    fill="none"
    stroke="#111111"
    stroke-width="5"
    stroke-linejoin="round"
  />
</svg>
````

### examples/api/import-svg-sketch.forge.js

````javascript
// SVG import demo:
// - Filled regions (all vs largest only)
// - Stroke-only import
// - importSketch(...) overload for .svg

const allFill = importSvgSketch("api/import-svg-sketch-shape.svg", {
  include: "fill",
  regionSelection: "all",
});

const largestFill = importSketch("api/import-svg-sketch-shape.svg", {
  include: "fill",
  regionSelection: "largest",
  maxWidth: 35,
  maxHeight: 35,
  centerOnOrigin: true,
});

const strokeOnly = importSvgSketch("api/import-svg-sketch-shape.svg", {
  include: "stroke",
  flattenTolerance: 0.2,
});

return [
  { name: "Fill (all regions)", shape: allFill.extrude(4).translate(-55, 0, 0).color("#5f87c6") },
  { name: "Fill (largest region)", shape: largestFill.extrude(4).color("#d08f5b") },
  { name: "Stroke geometry", shape: strokeOnly.extrude(4).translate(55, 0, 0).color("#66b38d") },
];
````

### examples/api/patterns.forge.js

````javascript
// Patterns — linearPattern and circularPattern for repeating shapes.

const count = param("Count", 6, { min: 2, max: 12, integer: true });
const spacing = param("Spacing", 20, { min: 10, max: 40, unit: "mm" });
const radius = param("Ring Radius", 40, { min: 20, max: 80, unit: "mm" });

// --- linearPattern: repeat along a direction ---
const peg = cylinder(15, 4).color('#4488cc');
const row = linearPattern(peg, count, spacing, 0);

// --- circularPattern: repeat around Z axis ---
const hole = cylinder(8, 3).translate(radius, 0, 0).color('#cc4444');
const ring = circularPattern(hole, count);

// --- mirrorCopy: mirror + union with original ---
const halfBracket = box(40, 10, 20).color('#44cc88');
const fullBracket = mirrorCopy(halfBracket, [1, 0, 0]).translate(0, 0, 40);

// Show a base plate with the circular holes subtracted
const plate = cylinder(10, radius + 15).color('#888888').translate(0, 80, 0);
const holeRing = circularPattern(
  cylinder(12, 3).translate(radius, 0, -1),
  count
).translate(0, 80, 0);
const drilled = plate.subtract(holeRing);

return [
  { name: "Linear Pattern", shape: row },
  { name: "Circular Pattern", shape: ring },
  { name: "Mirror Copy", shape: fullBracket },
  { name: "Drilled Plate", shape: drilled },
];
````

### examples/api/pointAlong-orientation.forge.js

````javascript
// pointAlong() — orient a cylinder's axis without thinking about Euler angles.
//
// Cylinders default to Z-up. To lay one along X or Y:
//   ❌ cylinder(80, 5).rotate(90, 0, 0)   — which axis? confusing
//   ✅ cylinder(80, 5).pointAlong([0, 1, 0]) — "point along Y"
//
// After pointAlong, the cylinder starts at origin and extends in that direction.
// Always call pointAlong BEFORE translate/attachTo.

const len = param("Length", 80, { min: 30, max: 150, unit: "mm" });
const r = param("Radius", 5, { min: 2, max: 15, unit: "mm" });
const spacing = 40;

// Default: along +Z (up)
const zCyl = cylinder(len, r).color('#4444cc')
  .translate(0, 0, 0);
const zTip = sphere(r * 1.5).color('#6666ff')
  .translate(0, 0, len);

// Along +X (right)
const xCyl = cylinder(len, r).color('#cc4444')
  .pointAlong([1, 0, 0])
  .translate(0, spacing, 0);
const xTip = sphere(r * 1.5).color('#ff6666')
  .translate(len, spacing, 0);

// Along +Y (forward)
const yCyl = cylinder(len, r).color('#44cc44')
  .pointAlong([0, 1, 0])
  .translate(0, 0, 0)
  .translate(spacing, 0, 0);
const yTip = sphere(r * 1.5).color('#66ff66')
  .translate(spacing, len, 0);

// Along diagonal [1, 1, 1]
const dCyl = cylinder(len, r).color('#cccc44')
  .pointAlong([1, 1, 1])
  .translate(spacing, spacing, 0);
const dLen = len / Math.sqrt(3); // projected length per axis
const dTip = sphere(r * 1.5).color('#ffff66')
  .translate(spacing + dLen, spacing + dLen, dLen);

return [
  { name: "Z-axis (default)", shape: zCyl },
  { name: "Z tip", shape: zTip },
  { name: "X-axis (pointAlong [1,0,0])", shape: xCyl },
  { name: "X tip", shape: xTip },
  { name: "Y-axis (pointAlong [0,1,0])", shape: yCyl },
  { name: "Y tip", shape: yTip },
  { name: "Diagonal (pointAlong [1,1,1])", shape: dCyl },
  { name: "Diagonal tip", shape: dTip },
];
````

### examples/api/profile-2020-b-slot6.forge.js

````javascript
// 20x20 B-type slot 6 profile extrusion.
// Demonstrates:
// - algorithmic 2D profile generation (`lib.tSlotProfile`)
// - direct 3D helper (`lib.profile2020BSlot6`)
// - parameterized technical dimensions

const length = param("Length", 220, { min: 40, max: 800, unit: "mm" });
const slotDepth = param("Slot Depth", 5.5, { min: 4.6, max: 6.6, step: 0.1, unit: "mm" });
const slotInner = param("Slot Inner Width", 8.2, { min: 7, max: 10.5, step: 0.1, unit: "mm" });
const centerBore = param("Center Bore", 5.5, { min: 0, max: 6.5, step: 0.1, unit: "mm" });

const profile2d = lib.profile2020BSlot6Profile({
  slotInnerWidth: slotInner,
  slotDepth,
  centerBoreDia: centerBore,
});

const extrusion = lib.profile2020BSlot6(length, {
  center: true,
  slotDepth,
  slotInnerWidth: slotInner,
  centerBoreDia: centerBore,
}).color('#98a7b8');

// Visual dimensions
dim([-10, -10, 0], [10, -10, 0], { label: "20 mm", offset: -8, color: "#ffaa44" });
dim([10, -10, 0], [10, 10, 0], { label: "20 mm", offset: 10, color: "#ffaa44" });
dim([0, 0, -length / 2], [0, 0, length / 2], { label: "Length", offset: 16, color: "#66ccff" });
if (centerBore > 0) {
  dim([-centerBore / 2, 0, 0], [centerBore / 2, 0, 0], { label: "Center bore", offset: -14, color: "#88dd88" });
}

return [
  { name: "2D Profile", sketch: profile2d.translate(-34, 0), color: "#f3c98b" },
  { name: "3D Extrusion", shape: extrusion.translate(36, 0, 0), color: "#98a7b8" },
];
````

### examples/api/runtime-joints-view.forge.js

````javascript
// Runtime joints demo
// Move the "Joints" sliders in the View Panel for smooth articulation,
// or use the Animation controls (play/pause + scrub), all without recompute.
// Demonstrates linked joints via couplings (Ankle is driven by Hip + Knee).

const body = box(150, 70, 36, true).translate(0, 0, 40).color('#6e7b88');

const upperLen = 84;
const lowerLen = 86;
const footLen = 48;

const upper = box(upperLen, 18, 18).translate(0, -9, -9).color('#7da2d6');
const lower = box(lowerLen, 16, 16).translate(0, -8, -8).color('#8db3e4');
const foot = box(footLen, 24, 10, true).translate(footLen * 0.5 - 8, 0, -10).color('#9dbfe8');

const leg = assembly('Leg Runtime Demo')
  .addPart('Body', body)
  .addPart('Upper Leg', upper)
  .addPart('Lower Leg', lower)
  .addPart('Foot', foot)
  .addRevolute('hip', 'Body', 'Upper Leg', {
    axis: [0, -1, 0],
    frame: Transform.identity().translate(34, 24, 40),
  })
  .addRevolute('knee', 'Upper Leg', 'Lower Leg', {
    axis: [0, -1, 0],
    frame: Transform.identity().translate(upperLen, 0, 0),
  })
  .addRevolute('ankle', 'Lower Leg', 'Foot', {
    axis: [0, -1, 0],
    frame: Transform.identity().translate(lowerLen, 0, 0),
  });

const solved = leg.solve({
  hip: 0,
  knee: 0,
  ankle: 0,
});

viewConfig({
  jointOverlay: {
    axisColor: '#13dfff',
    arcColor: '#ff7a1a',
    zeroColor: '#ffe26a',
    axisArrowLengthScale: 0.16,
    axisArrowRadiusScale: 0.052,
    arcArrowLengthScale: 0.12,
    arcArrowRadiusScale: 0.038,
    arcLineRadiusScale: 0.02,
  },
});

jointsView({
  joints: [
    {
      name: 'Hip',
      child: 'Upper Leg',
      parent: 'Body',
      type: 'revolute',
      axis: [0, -1, 0],
      pivot: [34, 24, 40],
      min: -50,
      max: 80,
      default: 10,
    },
    {
      name: 'Knee',
      child: 'Lower Leg',
      parent: 'Upper Leg',
      type: 'revolute',
      axis: [0, -1, 0],
      pivot: [34 + upperLen, 24, 40],
      min: -5,
      max: 125,
      default: 40,
    },
    {
      name: 'Ankle',
      child: 'Foot',
      parent: 'Lower Leg',
      type: 'revolute',
      axis: [0, -1, 0],
      pivot: [34 + upperLen + lowerLen, 24, 40],
      min: -40,
      max: 55,
      default: -10,
    },
  ],
  couplings: [
    {
      joint: 'Ankle',
      terms: [
        { joint: 'Knee', ratio: -0.35 },
        { joint: 'Hip', ratio: 0.18 },
      ],
      offset: 6,
    },
  ],
  animations: [
    {
      name: 'Step',
      duration: 1.8,
      loop: true,
      keyframes: [
        { at: 0.0, values: { Hip: 18, Knee: 42 } },
        { at: 0.25, values: { Hip: -20, Knee: 22 } },
        { at: 0.5, values: { Hip: 8, Knee: 86 } },
        { at: 0.75, values: { Hip: 24, Knee: 34 } },
        { at: 1.0, values: { Hip: 18, Knee: 42 } },
      ],
    },
  ],
  defaultAnimation: 'Step',
});

return solved.toScene();
````

### examples/api/sdf-rover-demo.forge.js

````javascript
// SDF export demo: four-wheel differential-drive rover with a demo world.
// Run:
//   npm run sdf -- examples/api/sdf-rover-demo.forge.js

const chassisLength = 430;
const chassisWidth = 260;
const chassisHeight = 58;
const roofLength = 210;
const roofWidth = 150;
const roofHeight = 46;
const bumperLength = 150;
const bumperWidth = 300;
const bumperDepth = 24;

const wheelRadius = 72;
const wheelWidth = 34;
const wheelTrack = 320;
const wheelbase = 250;
const groundClearance = 26;
const bodyZ = wheelRadius + groundClearance + chassisHeight * 0.5;

const baseDeck = box(chassisLength, chassisWidth, chassisHeight, true)
  .translate(0, 0, bodyZ);

const roofPod = box(roofLength, roofWidth, roofHeight, true)
  .translate(20, 0, bodyZ + 40);

const bumper = hull3d(
  box(54, bumperWidth, bumperDepth, true).translate(chassisLength * 0.5 - 18, 0, wheelRadius + 6),
  box(bumperLength, bumperWidth - 42, bumperDepth * 0.7, true).translate(chassisLength * 0.5 + 46, 0, wheelRadius - 10),
).color('#c8742b');

const sensorMast = union(
  cylinder(92, 10, undefined, 40, true).translate(58, 0, bodyZ + 78),
  box(78, 34, 26, true).translate(88, 0, bodyZ + 126),
).color('#d7dee8');

const chassis = union(baseDeck, roofPod)
  .color('#60707d');

const wheelTire = difference(
  cylinder(wheelWidth, wheelRadius, undefined, 64, true).pointAlong([0, 1, 0]),
  cylinder(wheelWidth + 2, wheelRadius * 0.56, undefined, 48, true).pointAlong([0, 1, 0]),
).color('#1d2329');

const wheelRim = union(
  cylinder(wheelWidth * 0.86, wheelRadius * 0.52, undefined, 40, true).pointAlong([0, 1, 0]),
  cylinder(wheelWidth * 1.02, wheelRadius * 0.16, undefined, 28, true).pointAlong([0, 1, 0]),
).color('#b8c5d3');

const wheel = group(wheelTire, wheelRim);

const rover = assembly('Forge Scout Rover')
  .addPart('Chassis', group(chassis, bumper, sensorMast), {
    metadata: {
      material: 'PETG-CF',
      process: 'FDM',
      massKg: 13.5,
      notes: 'Battery bay lives under the roof pod.',
    },
  })
  .addPart('Front Left Wheel', wheel, {
    metadata: { material: 'TPU + PLA hub', massKg: 0.95 },
  })
  .addPart('Front Right Wheel', wheel, {
    metadata: { material: 'TPU + PLA hub', massKg: 0.95 },
  })
  .addPart('Rear Left Wheel', wheel, {
    metadata: { material: 'TPU + PLA hub', massKg: 0.95 },
  })
  .addPart('Rear Right Wheel', wheel, {
    metadata: { material: 'TPU + PLA hub', massKg: 0.95 },
  })
  .addRevolute('frontLeftWheel', 'Chassis', 'Front Left Wheel', {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(wheelbase * 0.5, wheelTrack * 0.5, wheelRadius),
    effort: 22,
    velocity: 1320,
    damping: 0.12,
    friction: 0.03,
  })
  .addRevolute('frontRightWheel', 'Chassis', 'Front Right Wheel', {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(wheelbase * 0.5, -wheelTrack * 0.5, wheelRadius),
    effort: 22,
    velocity: 1320,
    damping: 0.12,
    friction: 0.03,
  })
  .addRevolute('rearLeftWheel', 'Chassis', 'Rear Left Wheel', {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(-wheelbase * 0.5, wheelTrack * 0.5, wheelRadius),
    effort: 22,
    velocity: 1320,
    damping: 0.12,
    friction: 0.03,
  })
  .addRevolute('rearRightWheel', 'Chassis', 'Rear Right Wheel', {
    axis: [0, 1, 0],
    frame: Transform.identity().translate(-wheelbase * 0.5, -wheelTrack * 0.5, wheelRadius),
    effort: 22,
    velocity: 1320,
    damping: 0.12,
    friction: 0.03,
  });

robotExport({
  assembly: rover,
  modelName: 'Forge Scout Rover',
  links: {
    Chassis: { massKg: 13.5 },
    'Front Left Wheel': { massKg: 0.95 },
    'Front Right Wheel': { massKg: 0.95 },
    'Rear Left Wheel': { massKg: 0.95 },
    'Rear Right Wheel': { massKg: 0.95 },
  },
  plugins: {
    diffDrive: {
      leftJoints: ['frontLeftWheel', 'rearLeftWheel'],
      rightJoints: ['frontRightWheel', 'rearRightWheel'],
      wheelSeparationMm: wheelTrack,
      wheelRadiusMm: wheelRadius,
      maxLinearVelocity: 1.8,
      maxAngularVelocity: 2.8,
      linearAcceleration: 1.6,
      angularAcceleration: 3.2,
    },
    jointStatePublisher: {
      enabled: true,
      updateRate: 30,
    },
  },
  world: {
    generateDemoWorld: true,
    name: 'Forge Scout Trial',
    spawnPose: [-1800, 0, 120, 0, 0, 0],
    keyboardTeleop: {
      enabled: true,
      linearStep: 0.9,
      angularStep: 1.35,
    },
  },
});

return rover.solve().toScene();
````

### examples/api/section-plane-visualization.forge.js

````javascript
// Section Plane Visualization — renderer-side guides for active cut planes.
//
// How to use:
// 1) Toggle planes in View Panel -> Cut Planes
// 2) Adjust View Panel -> Section Visuals (fill, border, normal axis)
// 3) "Probe" is excluded from both cuts, so it stays intact for alignment checks.
//
// No helper solids are needed in your model. Guides are viewport-only overlays.

const width = param("Width", 120, { min: 80, max: 180, unit: "mm" });
const depth = param("Depth", 80, { min: 50, max: 140, unit: "mm" });
const height = param("Height", 70, { min: 40, max: 120, unit: "mm" });
const wall = param("Wall", 8, { min: 3, max: 16, unit: "mm" });

const cutX = param("Cut X", 0, { min: -80, max: 80, unit: "mm" });
const cutZ = param("Cut Z", 10, { min: -30, max: 80, unit: "mm" });

cutPlane("Internal X", [1, 0, 0], cutX, { exclude: "Probe" });
cutPlane("Internal Z", [0, 0, 1], cutZ, { exclude: "Probe" });

const shell = box(width, depth, height, true);
const cavity = box(width - wall * 2, depth - wall * 2, height - wall * 1.6, true).translate(0, 0, wall * 0.2);
const passX = cylinder(width + 8, Math.min(depth, height) * 0.12, undefined, 48, true).rotate(0, 90, 0);
const passY = cylinder(depth + 8, Math.min(width, height) * 0.09, undefined, 48, true).rotate(90, 0, 0).translate(0, 0, 12);
const probe = cylinder(height + 20, 2.5, undefined, 36, true)
  .translate(width * 0.22, depth * 0.18, 0)
  .color("#f3a847");

const housing = shell
  .subtract(cavity)
  .subtract(passX)
  .subtract(passY)
  .color("#8aa7c8");

return [
  { name: "Housing", shape: housing },
  { name: "Probe", shape: probe },
];
````

### examples/api/sketch-basics.forge.js

````javascript
// 2D sketch basics — primitives, booleans, offset, then extrude to 3D.

const wall = param("Wall", 3, { min: 1, max: 8, unit: "mm" });
const height = param("Height", 30, { min: 10, max: 80, unit: "mm" });

// --- Sketch primitives ---
const r = rect(40, 30);
const c = circle2d(15).translate(20, 15);
const hex = ngon(6, 12).translate(70, 15);
const rounded = roundedRect(40, 30, 5).translate(100, 0);
const oblong = slot(40, 15).translate(0, -30);

// --- 2D booleans ---
// Subtract circle from rectangle → plate with hole
const plateSketch = rect(50, 40).subtract(circle2d(10).translate(25, 20));

// --- Offset: inflate/deflate contours ---
const outer = ngon(6, 20);
const inner = outer.offset(-wall);
const shellSketch = outer.subtract(inner); // hollow hexagon

// --- Extrude to 3D ---
const plate3d = plateSketch.extrude(height).translate(0, 60, 0).color('#4488cc');
const shell3d = shellSketch.extrude(height).translate(70, 60, 0).color('#cc8844');

// --- Path builder ---
const bracket = path()
  .moveTo(0, 0)
  .lineH(30)
  .lineV(40)
  .lineH(-10)
  .lineV(-30)
  .lineH(-20)
  .close()
  .extrude(5)
  .translate(130, 60, 0)
  .color('#44cc88');

return [
  { name: "Rect", sketch: r },
  { name: "Circle", sketch: c },
  { name: "Hexagon", sketch: hex },
  { name: "Rounded Rect", sketch: rounded },
  { name: "Slot", sketch: oblong },
  { name: "Plate (extruded)", shape: plate3d },
  { name: "Shell (offset + extrude)", shape: shell3d },
  { name: "Bracket (path + extrude)", shape: bracket },
];
````

### examples/api/sketch-on-face.forge.js

````javascript
// Sketch on face — place 2D profiles onto canonical or tracked planar faces,
// then extrude along that face normal.

const body = box(140, 70, 44, true).color('#d5dbe3');

const frontBadge = roundedRect(30, 12, 2.5, true)
  .subtract(circle2d(2.5).translate(-8, 0))
  .subtract(circle2d(2.5).translate(8, 0))
  .onFace(body, 'front', { v: 10, protrude: 0.05 })
  .extrude(2.4)
  .color('#1d2733');

const topVent = union2d(
  rect(56, 6, true),
  rect(56, 6, true).translate(0, 10),
  rect(56, 6, true).translate(0, -10),
)
  .onFace(body, 'top', { v: 8, protrude: 0.05 })
  .extrude(1.5)
  .color('#55697e');

const sidePort = roundedRect(22, 10, 3, true)
  .onFace(body, 'right', { u: -8, v: 0, protrude: 0.05 })
  .extrude(3)
  .color('#20262e');

const trackedPanel = Rectangle2D.from3Points(
  point(-34, -18),
  point(30, -6),
  point(18, 26),
)
  .extrude(18)
  .translate(0, 92, 0)
  .color('#c4ccd6');

const trackedSideBadge = roundedRect(22, 8, 2, true)
  .onFace(trackedPanel, 'side-right', { v: -2, protrude: 0.05 })
  .extrude(1.4)
  .color('#27313c');

const trackedTopCap = circle2d(5)
  .onFace(trackedPanel.face('top'), { u: 12, protrude: 0.05 })
  .extrude(1.2)
  .color('#5a6c7c');

cutPlane('Center X', [1, 0, 0], 0);

return [
  { name: 'Body', shape: body },
  { name: 'Front Badge', shape: frontBadge },
  { name: 'Top Vent', shape: topVent },
  { name: 'Side Port', shape: sidePort },
  { name: 'Tracked Panel', shape: trackedPanel },
  { name: 'Tracked Side Badge', shape: trackedSideBadge },
  { name: 'Tracked Top Cap', shape: trackedTopCap },
];
````

### examples/api/sketch-rounding-strategies.forge.js

````javascript
// Compare common sketch-rounding strategies on the same roof profile.
// Only the selective fillet keeps the lower roof corners sharp.

const radius = param("Radius", 14, { min: 4, max: 24, unit: "mm" });
const gap = 120;
const bodyWidth = 90;
const bodyHeight = 44;
const shoulderInset = 24;
const shoulderRise = 30;
const peakRise = 42;

const roofPoints = [
  [0, 0],
  [bodyWidth, 0],
  [bodyWidth, bodyHeight],
  [bodyWidth - shoulderInset, bodyHeight + shoulderRise],
  [bodyWidth / 2, bodyHeight + peakRise],
  [shoulderInset, bodyHeight + shoulderRise],
  [0, bodyHeight],
];

const roofRidge = [
  [0, bodyHeight],
  [shoulderInset, bodyHeight + shoulderRise],
  [bodyWidth / 2, bodyHeight + peakRise],
  [bodyWidth - shoulderInset, bodyHeight + shoulderRise],
  [bodyWidth, bodyHeight],
];

const rawProfile = polygon(roofPoints).color('#7b858c');
const roundedAllCorners = rawProfile.offset(-radius, 'Round').offset(radius, 'Round').color('#d4862d');
const strokedCenterline = union2d(
  rect(bodyWidth, bodyHeight),
  stroke(roofRidge, radius * 2, 'Round'),
).color('#2a9d8f');
const hulledCircles = union2d(
  rect(bodyWidth, bodyHeight),
  hull2d(
    circle2d(radius).translate(shoulderInset, bodyHeight + shoulderRise),
    circle2d(radius).translate(bodyWidth / 2, bodyHeight + peakRise),
    circle2d(radius).translate(bodyWidth - shoulderInset, bodyHeight + shoulderRise),
  ),
).color('#7f5af0');
const selectiveFillet = filletCorners(roofPoints, [
  { index: 3, radius },
  { index: 4, radius },
  { index: 5, radius },
]).color('#e63946');

return [
  { name: "Raw polygon", sketch: rawProfile },
  { name: "offset(-r).offset(+r)", sketch: roundedAllCorners.translate(gap, 0) },
  { name: "stroke(..., 'Round')", sketch: strokedCenterline.translate(gap * 2, 0) },
  { name: "hull2d() of circles", sketch: hulledCircles.translate(gap * 3, 0) },
  { name: "filletCorners()", sketch: selectiveFillet.translate(gap * 4, 0) },
];
````

### examples/api/spatial-recipes.forge.js

````javascript
// Spatial Recipes — common arrangements for multi-part assemblies.
//
// ForgeCAD coordinate system:
//   X = left/right    (+X = right)
//   Y = forward/back  (+Y = forward, −Y = back toward camera)
//   Z = up/down       (+Z = up)
//
// "front" anchor = −Y face (faces the camera in default view)
// "back"  anchor = +Y face
//
// These recipes show how to position parts relative to each other
// using attachTo() and onFace() so you never need manual coordinate math.

const recipe = param("Recipe", 1, { min: 1, max: 3, integer: true });

if (recipe === 1) {
  // ─── Recipe 1: Wall separating two spaces ───
  // Wall is thin along Y. Indoor side = −Y. Outdoor side = +Y.

  const wallThick = 15;
  const wall = box(200, wallThick, 150, true).color('#C4A77D');

  // Indoor unit: its back face meets the wall's front face
  const indoor = box(120, 30, 50, true).color('#F5F5F5')
    .attachTo(wall, 'front', 'back', [0, -5, 0]);

  // Outdoor unit: its front face meets the wall's back face
  const outdoor = box(140, 40, 60, true).color('#888888')
    .attachTo(wall, 'back', 'front', [0, 5, -10]);

  // Pipe hole through wall — orient along Y (same as wall thickness)
  const hole = cylinder(wallThick + 2, 10).pointAlong([0, 1, 0]);
  const wallWithHole = wall.subtract(hole);

  // Pipe spanning both sides — also along Y, centered at same XZ as hole
  const pipe = cylinder(100, 4).pointAlong([0, 1, 0]).color('#B87333');

  return [
    { name: "Wall", shape: wallWithHole },
    { name: "Indoor Unit", shape: indoor },
    { name: "Outdoor Unit", shape: outdoor },
    { name: "Pipe", shape: pipe },
  ];
}

if (recipe === 2) {
  // ─── Recipe 2: Surface details using onFace() ───
  // onFace(parent, face, {u, v, protrude}) places a child on a parent's face.
  //   u, v = position within the face (from center)
  //   protrude = how far it sticks out (positive = outward)
  //
  // Face coordinate mapping:
  //   front/back: u = left/right (X), v = up/down (Z)
  //   left/right: u = forward/back (Y), v = up/down (Z)
  //   top/bottom: u = left/right (X), v = forward/back (Y)

  const body = box(100, 40, 60, true).color('#F5F5F5');

  // Vent slits on front face, near bottom
  const vent = box(80, 2, 12, true).color('#333333')
    .onFace(body, 'front', { v: -15, protrude: 2 });

  // Display panel on front face, near top-right
  const display = box(35, 1.5, 8, true).color('#00ddee')
    .onFace(body, 'front', { u: 20, v: 15, protrude: 1 });

  // Button on front face, top-left area
  const button = box(6, 2, 6, true).color('#44cc44')
    .onFace(body, 'front', { u: -30, v: 18, protrude: 2 });

  // Side vent on left face
  const sideVent = box(2, 30, 40, true).color('#666666')
    .onFace(body, 'left', { protrude: 1 });

  // Fan on top, protruding 5mm
  const fan = cylinder(10, 40).color('#333333')
    .onFace(body, 'top', { protrude: 5 });

  return [
    { name: "Body", shape: body },
    { name: "Front Vent", shape: vent },
    { name: "Display", shape: display },
    { name: "Button", shape: button },
    { name: "Side Vent", shape: sideVent },
    { name: "Top Fan", shape: fan },
  ];
}

if (recipe === 3) {
  // ─── Recipe 3: Full AC outdoor condenser ───
  // Combines attachTo() for stacking and onFace() for surface details

  const body = box(140, 50, 70, true).color('#888888');

  // Fan housing on top — cylinder defaults to Z-up, correct for top placement
  const fan = cylinder(10, 50).color('#333333')
    .onFace(body, 'top', { protrude: 2 });

  // Fan grill (flat disc on top of fan)
  const grill = cylinder(2, 52).color('#777777')
    .attachTo(fan, 'top', 'bottom');

  // Pipe ports on front face — orient along Y (pointing outward from front)
  const pipe1 = cylinder(20, 5).pointAlong([0, -1, 0]).color('#B87333')
    .onFace(body, 'front', { u: -15, v: -10, protrude: 2 });

  const pipe2 = cylinder(20, 3).pointAlong([0, -1, 0]).color('#B87333')
    .onFace(body, 'front', { u: 15, v: -10, protrude: 2 });

  // Side louvers on right face
  const louver = box(2, 3, 50, true).color('#666666')
    .onFace(body, 'right', { protrude: 1 });

  // Feet on bottom
  const foot = box(20, 15, 5, true).color('#222222');
  const footL = foot.attachTo(body, 'bottom-left', 'top-left', [10, 5, -1]);
  const footR = foot.attachTo(body, 'bottom-right', 'top-right', [-10, 5, -1]);

  return [
    { name: "Body", shape: body },
    { name: "Fan", shape: fan },
    { name: "Grill", shape: grill },
    { name: "Pipe 1", shape: pipe1 },
    { name: "Pipe 2", shape: pipe2 },
    { name: "Louver", shape: louver },
    { name: "Foot L", shape: footL },
    { name: "Foot R", shape: footR },
  ];
}
````


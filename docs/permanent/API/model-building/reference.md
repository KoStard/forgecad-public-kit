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

### `.rotateAroundTo(axis, pivot, movingPoint, targetPoint, opts?)`
Solves the rotation around an axis that makes `movingPoint` reach the target line/plane implied by `targetPoint`.

**Parameters:**
- `axis` ([number, number, number]) - Rotation axis direction
- `pivot` ([number, number, number]) - Point on the rotation axis
- `movingPoint` (`[number, number, number] | string`) - World-space point or this shape's anchor/reference
- `targetPoint` (`[number, number, number] | string`) - World-space point or this shape's anchor/reference
- `opts` (object, optional)
  - `mode` (`'plane' | 'line'`) - Default: `'plane'`

Modes:
- `'plane'` — rotate until `movingPoint` lies in the plane defined by `axis` + `targetPoint`
- `'line'` — rotate until `movingPoint` lies on the infinite line from `pivot` through `targetPoint`; throws if the geometry makes that impossible

```javascript
const arm = box(80, 8, 8, true)
  .translate(40, 0, 0)
  .withReferences({ points: { tip: [80, 0, 0] } });

const aimed = arm.rotateAroundTo(
  [0, 0, 1],
  [0, 0, 0],
  "tip",
  [30, 30, 20],
);
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
- `Transform.rotateAroundTo(axis, pivot, movingPoint, targetPoint, opts?)`
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
  face: { module: 1.5, teeth: 44, faceWidth: 7, toothHeight: 1.2, side: 'top' },
  vertical: { module: 1.5, teeth: 16, faceWidth: 8 },
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

const parts = [
  box(50, 50, 10),
  cylinder(20, 15).translate(25, 25, 10),
];
const combinedFromArray = union(parts);
```

### `difference(...shapes)`
Subtracts shapes[1..n] from shapes[0].

```javascript
const plate = box(100, 100, 5);
const hole1 = cylinder(6, 10).translate(25, 50, 0);
const hole2 = cylinder(6, 10).translate(75, 50, 0);
const result = difference(plate, hole1, hole2);
const resultFromArray = difference([plate, hole1, hole2]);

// Or using method syntax:
const result = plate.subtract(hole1, hole2);
const sameResult = plate.subtract([hole1, hole2]);
```

### `intersection(...shapes)`
Keeps only overlapping volume.

```javascript
const overlap = intersection(
  sphere(30),
  box(40, 40, 40, true)
);

const overlapFromArray = intersection([
  sphere(30),
  box(40, 40, 40, true),
]);
```

### Method Syntax
Shapes also have boolean methods:

```javascript
shape.add(other1, other2)
shape.add([other1, other2])
shape.subtract(other1, other2)
shape.subtract([other1, other2])
shape.intersect(other1, other2)
shape.intersect([other1, other2])
```

## Group

### `group(...items)`
Groups multiple shapes/sketches for joint transforms without merging them into a single mesh. Unlike `union`, colors and individual identities are preserved.

**Parameters:**
- `...items` (Shape | Sketch | TrackedShape | ShapeGroup | `{ name, shape? | sketch? | group? }`) - Items to group (nested groups allowed)

**Returns:** `ShapeGroup`

```javascript
const base = box(100, 100, 5).color('#888888');
const column = cylinder(40, 5).translate(50, 50, 5).color('#4488cc');

// Group them — they stay separate but transform together
const assembly = group(base, column).translate(200, 0, 0);
return assembly;
```

Named child descriptors are useful when the group will be flattened later, especially inside assemblies:

```javascript
const shell = box(80, 60, 24).color('#6e7b88');
const lid = box(80, 60, 4).translate(0, 0, 24).color('#c9d2db');

const housing = group(
  { name: 'Shell', shape: shell },
  { name: 'Lid', shape: lid },
);
```

When that group is returned directly, each named child keeps its own viewport object. When the group is used as an assembly part, Forge uses those child names to produce labels such as `Base Assembly.Lid` instead of `Base Assembly.2`.

### ShapeGroup Methods
All transforms are chainable and return a new ShapeGroup:

```javascript
group.translate(x, y, z)
group.moveTo(x, y, z)
group.moveToLocal(target, x, y, z)
group.rotate(x, y, z)
group.rotateAround(axis, angleDeg, pivot?)
group.rotateAroundTo(axis, pivot, movingPoint, targetPoint, opts?)
group.pointAlong(direction)
group.transform(m)
group.scale(v)
group.mirror(normal)
group.color(hex)  // applies to all children
group.clone()
group.duplicate() // alias
```

`group.rotateAround(...)` is convenience sugar for `group.transform(Transform.rotationAxis(...))`.
`group.rotateAroundTo(...)` is convenience sugar for `group.transform(Transform.rotateAroundTo(...))`.
`group.pointAlong(...)` is convenience sugar for a group-wide axis rotation from Z to `direction`.

```javascript
const hingeY = 40;
const lid = group(shell, logo);

const openedA = lid.rotateAround([1, 0, 0], 35, [0, hingeY, 0]); // sugar
const openedB = lid.transform(Transform.rotationAxis([1, 0, 0], 35, [0, hingeY, 0])); // equivalent

const laidDown = lid.pointAlong([1, 0, 0]); // same intent as Shape/TrackedShape.pointAlong
```

When a ShapeGroup is returned from a script, each child becomes a separate viewport object with its own visibility/color controls. Named children keep those names in the viewport/object tree.

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

This file intentionally avoids repeating full 2D API signatures that already live in dedicated docs.

Use these canonical files:

- [sketch-core.md](sketch-core.md) - `Sketch` basics, queries, anchors, color, clone/duplicate
- [sketch-primitives.md](sketch-primitives.md) - `rect`, `circle2d`, `roundedRect`, `polygon`, `ngon`, `ellipse`, `slot`, `star`
- [sketch-path.md](sketch-path.md) - `path()` builder and `stroke(...)`
- [sketch-transforms.md](sketch-transforms.md) - translate/rotate/scale/mirror for sketches
- [sketch-booleans.md](sketch-booleans.md) - `union2d`/`difference2d`/`intersection2d`/`hull2d` and method forms
- [sketch-operations.md](sketch-operations.md) - `offset`, `filletCorners`, `simplify`, `warp`, hull
- [sketch-on-face.md](sketch-on-face.md) - sketch placement on planar faces
- [sketch-extrude.md](sketch-extrude.md) - `extrude` and `revolve`
- [sketch-anchor.md](sketch-anchor.md) - 2D anchor-based positioning
- [entities.md](entities.md) - constrained sketches, named entities, topology-aware utilities

Integration rule: start with the smallest relevant doc set and add more only when the task expands.

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

## Entities, Constraints, and Patterns

`reference.md` delegates detailed entity/constraint coverage to [entities.md](entities.md) to avoid duplication.

Use [entities.md](entities.md) for:

- `Point2D`, `Line2D`, `Circle2D`, `Rectangle2D`
- `TrackedShape` topology access (`face`, `edge`, `faceNames`, `edgeNames`, `toShape`)
- `constrainedSketch()` and `Constraint.*`
- `linearPattern`, `circularPattern`, `mirrorCopy`
- `filletEdge`, `chamferEdge`, `arcBridgeBetweenRects`
- Utility helpers like `degrees(...)` and `radians(...)`

## Multi-File Projects

ForgeCAD supports multi-file projects. Files are either **sketches** (`.sketch.js`, return a `Sketch`), **parts** (`.forge.js`, return a `Shape` or `TrackedShape`), or **SVG assets** (`.svg`, parsed into a `Sketch`).

### File Types
- `*.sketch.js` — 2D sketch file; when used with `importSketch()`, must return a `Sketch`
- `*.forge.js` — 3D Forge file; when used with `importPart()`, must return a `Shape` or `TrackedShape`
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

### Plain JS Module Imports
Alongside `importPart()` / `importSketch()`, regular JS `import` / `require(...)` is supported for utility modules.

- If a module uses `export` / `module.exports`, that export value is used.
- If a module has no explicit exports and uses a top-level `return`, that return value becomes the module value (including arrays).
- Do not mix explicit exports with top-level `return` in the same module; this throws an error.

```javascript
// scene-items.js
import { box, cylinder } from "forgecad";

return [
  { name: "Plate", shape: box(20, 12, 2, true) },
  { name: "Pin", shape: cylinder(14, 3, undefined, undefined, true).translate(0, 0, 8) },
];
```

```javascript
// main.forge.js
import items from "./scene-items.js";

return items.map((entry, index) => ({
  name: entry.name,
  shape: entry.shape.translate(index === 0 ? -20 : 20, 0, 0),
}));
```

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

### `lib.faceGear(options)`
Face gear (crown style) where teeth are on one face (`top` or `bottom`) instead of the outer rim.

Uses the same involute tooth sizing inputs as `lib.spurGear(...)`, then projects the tooth band axially from one side.

**Options:**
- all `lib.spurGear(...)` options, plus:
- `side` (`'top' | 'bottom'`, optional) - Which face gets the teeth. Default: `'top'`
- `toothHeight` (number, optional) - Tooth projection height from the selected face. Default: `module`

```javascript
const face = lib.faceGear({
  module: 1.25,
  teeth: 36,
  faceWidth: 8,
  toothHeight: 1.2,
  side: 'top',
  boreDiameter: 8,
});
```

`lib.sideGear(...)` is kept as a compatibility alias.

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
Build or validate a perpendicular pair between a face gear and a vertical spur gear.

Accepts either:
- face gear shapes produced by `lib.faceGear(...)` or face-gear specs (`{ module, teeth, ... }`)
- vertical spur shapes produced by `lib.spurGear(...)` or spur specs (`{ module, teeth, ... }`)

**Options:**
- `face` (`Shape | FaceGearSpec`) - face/crown gear member
- `vertical` (`Shape | GearPairSpec`) - mating perpendicular spur gear
- `backlash` (number, optional) - target radial backlash for auto center distance
- `centerDistance` (number, optional) - override center distance directly
- `meshPlaneZ` (number, optional) - override the Z plane where the vertical gear is placed
- `place` (boolean, optional) - auto-place `vertical`. Default: `true`
- `phaseDeg` (number, optional) - phase rotation applied before perpendicular placement

**Returns:** `FaceGearPairResult` with:
- `face`, `vertical` (shapes)
- `jointRatio`, `speedReduction`
- `centerDistance`, `centerDistanceNominal`, `backlash`
- `meshPlaneZ`, `radialOverlap`
- `diagnostics[]` and `status` (`ok | warn | error`)

```javascript
const pair = lib.faceGearPair({
  face: { module: 1.25, teeth: 36, faceWidth: 8, toothHeight: 1.2, side: 'top' },
  vertical: { module: 1.25, teeth: 12, faceWidth: 8 },
  backlash: 0.05,
});

if (pair.status !== 'ok') {
  console.warn(pair.diagnostics);
}

return [pair.face, pair.vertical];
```

`lib.sideGearPair(...)` is kept as a compatibility alias.

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

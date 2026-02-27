**Important**: See [colors-and-unions.md](colors-and-unions.md) for a crucial guide on preserving colors when returning multiple objects vs. using `union()`.

# ForgeCAD API Reference

**For AI Agents**: This document contains everything needed to write parametric CAD code in ForgeCAD.

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

Each object in the array gets its own visibility toggle, opacity control, and color picker in the View Panel.

See [colors-and-unions.md](colors-and-unions.md) for complete details on when to union vs. return separate objects.

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

## Cut Planes

### `cutPlane(name, normal, offset?)`
Defines a named section plane for inspection. Appears as a toggle in the View Panel. When enabled, geometry on one side of the plane is clipped away, revealing the interior.

**Parameters:**
- `name` (string) - Display name in View Panel
- `normal` ([number, number, number]) - Direction vector pointing toward the side that gets removed
- `offset` (number, optional) - Distance from origin along the normal where the cut happens. Default: 0

**Returns:** void (side effect: registers the plane for UI toggle)

**Examples:**
```javascript
// Horizontal section at Z=30 — removes everything above
cutPlane("Top Section", [0, 0, 1], 30);

// Vertical section at Y=0 — removes the front half
cutPlane("Front Section", [0, -1, 0], 0);

// Diagonal cut
cutPlane("Diagonal", [1, 1, 0], 20);

// Parametric cut position
const cutZ = param("Cut Height", 10, { min: -50, max: 50, unit: "mm" });
cutPlane("Horizontal", [0, 0, 1], cutZ);
```

**How it works:**
- Cut planes are GPU-accelerated (Three.js clipping planes) — instant on any geometry complexity
- Multiple planes can be defined and toggled independently
- Planes are per-script — they reset on each execution
- Toggle state persists in the UI across parameter changes
- Active planes can be visualized with built-in viewport guides (no model geometry required)
  - `Show guides` toggles renderer-side plane visuals
  - `Fill` + `Opacity` controls translucent section fill
  - `Border` toggles plane outline
  - `Normal axis` shows orientation direction (the clipped side points along the plane normal)

**Use cases:**
- Inspect internal features (holes, cavities, wall thickness)
- Verify alignment of hidden parts
- Create section views for documentation
- Debug boolean operation results

See `examples/api/section-plane-visualization.forge.js` for a focused multi-plane setup.

## View Explode Overrides

### `explodeView(options?)`
Overrides default viewport exploded-view behavior. The View Panel explode slider is always available; this API only changes how the slider is interpreted for the current script.

**Parameters:**
- `options` (object, optional):
  - `enabled` (boolean) - Set `false` to disable viewport explode offsets for this script.
  - `amountScale` (number) - Multiplies the UI explode amount.
  - `mode` (`'radial' | 'x' | 'y' | 'z' | [x, y, z]`) - Global default direction.
  - `axisLock` (`'x' | 'y' | 'z'`) - Global axis lock.
  - `byName` (`Record<string, { stage?, direction?, axisLock? }>`)- Per-object overrides by final object name.

**Returns:** `void` (side effect: registers view behavior for this run)

```javascript
explodeView({
  amountScale: 1.2,
  mode: 'radial',
  byName: {
    "Shaft": { direction: [1, 0, 0], stage: 1.6 },
    "Housing": { stage: 0.4 },
  },
});
```

```javascript
// Disable global explode offsets for this model
explodeView({ enabled: false });
```

## Runtime Joint View

### `jointsView(options?)`
Registers viewport-only mechanism joints. Unlike `param()`-driven geometry edits, these controls animate object transforms in the View Panel without re-running the script.

**Parameters:**
- `options` (object, optional):
  - `enabled` (boolean) - Set `false` to hide/disable runtime joint controls.
  - `joints` (array) - Joint definitions keyed by `name`:
    - `name` (string) - Control label shown in the View Panel.
    - `child` (string) - Object name to move (must match returned object `name`).
    - `parent` (string, optional) - Parent object name for chained kinematics.
    - `type` (`'revolute' | 'prismatic'`) - Default: `'revolute'`.
    - `axis` (`[x, y, z]`) - Motion axis (default `[0, 0, 1]`).
    - `pivot` (`[x, y, z]`) - Revolute pivot in model coordinates (default `[0, 0, 0]`).
    - `min`, `max` (number, optional) - UI clamp limits.
    - `default` (number, optional) - Initial slider value (clamped to limits).
    - `unit` (string, optional) - Display unit. Defaults to `°` for revolute, `mm` for prismatic.

**Returns:** `void` (side effect: registers runtime view controls for this run)

```javascript
jointsView({
  joints: [
    {
      name: "Shoulder",
      child: "Upper Arm",
      parent: "Base",
      type: "revolute",
      axis: [0, -1, 0],
      pivot: [0, 0, 46],
      min: -30,
      max: 110,
      default: 15,
    },
    {
      name: "Slide",
      child: "Forearm",
      parent: "Upper Arm",
      type: "prismatic",
      axis: [1, 0, 0],
      min: 0,
      max: 80,
      default: 20,
      unit: "mm",
    },
  ],
});
```

## Bill of Materials

### `bom(quantity, description, opts?)`
Registers a bill-of-materials entry for report export. Use this for real-world parts/materials that cannot be inferred from geometry alone.

**Parameters:**
- `quantity` (number) - Amount to add (must be finite and `>= 0`). `0` is ignored.
- `description` (string) - Human-readable item description.
- `opts` (object, optional):
  - `unit` (string) - Unit label such as `"mm"`, `"pieces"`, `"kg"` (default: `"pieces"`)
  - `key` (string) - Explicit aggregation key. Use this when descriptions vary but should still sum to one line item.

**Returns:** `void` (side effect: registers BOM item for report generation)

**Examples:**
```javascript
const tubeLen = param("Tube Length", 1200, { min: 300, max: 4000, unit: "mm" });
const tubeW = param("Tube Width", 30, { min: 10, max: 100, unit: "mm" });
const tubeH = param("Tube Height", 20, { min: 10, max: 100, unit: "mm" });
const boltCount = param("Bolt Count", 16, { min: 0, max: 200, integer: true });
const boltLength = param("Bolt Length", 16, { min: 6, max: 80, unit: "mm" });

bom(tubeLen, `iron tube with dimensions ${tubeW} x ${tubeH}`, { unit: "mm" });
bom(boltCount, `M4 bolt of ${boltLength} mm length`, { unit: "pieces" });
```

**Auto-summing behavior in report export:**
- Entries with the same normalized `description + unit` are summed into one row
- `key` overrides default grouping when you need custom merge behavior
- Summed rows are rendered on a dedicated **Bill of Materials** page in the generated PDF report

See `examples/api/bill-of-materials.forge.js` for a complete parametric example.

## Dimension Annotations

Dimension annotations are visual callouts for measurement/reporting.
They are **not constraints** and do not drive geometry.

### `dim(from, to, opts?)`
Adds a dimension annotation between two points.

**Parameters:**
- `from` (`[number, number] | [number, number, number] | Point2D`) - Start point
- `to` (`[number, number] | [number, number, number] | Point2D`) - End point
- `opts` (object, optional):
  - `offset` (number) - Visual offset from geometry (default: `10`)
  - `label` (string) - Override label text
  - `color` (string) - Annotation color (hex)
  - `component` (`string | string[]`) - Explicit report ownership target(s) by returned object name
  - `currentComponent` (boolean) - Bind ownership to the current returned component instance (especially useful inside `importPart()` files)

**Returns:** `void` (side effect: registers dimension annotation)

```javascript
dim([0, 0, 0], [200, 0, 0], { label: "Width" });
dim([0, 0, 0], [0, 0, 50], { label: "Height", offset: 15, color: "#ffaa44" });
```

Ownership examples:
```javascript
// Own the dimension by the current imported instance (deterministic)
dim([0, 0, 0], [0, 80, 0], { label: "Leg Width", currentComponent: true });

// Route dimension to another named component page
dim([0, 0, 0], [0, 0, 18], { label: "Top Gap", component: "Tabletop" });
```

### `dimLine(line, opts?)`
Adds a dimension annotation along a `Line2D`.

**Parameters:**
- `line` (`Line2D`) - Source line
- `opts` (same as `dim`)

**Returns:** `void`

```javascript
const a = point(0, 0);
const b = point(120, 0);
dimLine(line(a, b), { label: "Span", offset: -12 });
```

### Report Ownership Behavior
- `component: "Name"` assigns to that returned object when the name resolves uniquely
- `currentComponent: true` assigns to the owning returned component instance
- If multiple owners are bound (for example `currentComponent: true` plus another component), the dimension is treated as shared and stays on the assembly overview page
- Without explicit ownership, report export falls back to automatic bbox-based inference

See `examples/api/dimensioned-bracket.forge.js` for baseline dimension usage.

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
plate.face('top');                     // FaceRef { normal, center }
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
cyl.face('top');                            // FaceRef
cyl.face('side');                           // FaceRef
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
  - `max` (number) - Maximum angle. Default: 180
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

Key methods:
- `addPart(name, shape, { transform?, metadata? })`
- `addFrame(name, { transform? })` for virtual mechanism frames
- `addJoint(name, type, parent, child, opts)` where `type` is `'fixed' | 'revolute' | 'prismatic'`
- `addRevolute(...)`, `addPrismatic(...)`, `addFixed(...)` shorthand helpers
- `solve(state?)` with per-joint value overrides
- `sweepJoint(jointName, from, to, steps, baseState?, collisionOptions?)`

Solved assembly helpers:
- `solved.toScene()` for rendering
- `solved.collisionReport()` for interference checks
- `solved.minClearance(partA, partB, searchLength?)`
- `solved.bom()` / `solved.bomCsv()`
- `bomToCsv(rows)` (standalone helper)

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

box.face('top');           // FaceRef { normal, center }
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

Approximate fillets and chamfers for vertical edges using topology references.

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

ForgeCAD supports multi-file projects. Files are either **sketches** (`.sketch.js`, return a `Sketch`) or **parts** (`.forge.js`, return a `Shape` or `TrackedShape`).

### File Types
- `*.sketch.js` — 2D sketch file, must return a `Sketch`
- `*.forge.js` — 3D part file, must return a `Shape` or `TrackedShape`

### Import Path Resolution
- `./file.forge.js` and `../file.forge.js` resolve relative to the file that calls `importSketch()` / `importPart()`
- Bare paths like `api/bracket.forge.js` resolve from the opened project root
- Leading `/` is treated as project-root relative

### `importSketch(fileName, paramOverrides?)`
Executes another file and returns its result as a `Sketch`. The target file must return a `Sketch`.

**Parameters:**
- `fileName` (string) — Import path (e.g. `"./profile.sketch.js"` or `"api/profile.sketch.js"`)
- `paramOverrides` (optional object) — Import-time parameter overrides by param name

**Returns:** `Sketch`

```javascript
// In a .forge.js file:
const profile = importSketch("bracket-profile.sketch.js", {
  "Width": 42,
  "Height": 18,
});
return profile.extrude(50);
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

### Import Rules
- Circular imports are detected and throw an error
- Imported files can be instantiated multiple times
- `paramOverrides` only affects that import call (other imports are independent)
- Params supplied through `paramOverrides` are treated as fixed arguments for that import call
- Relative imports (`./` / `../`) are resolved from the current file path
- `importPart()` accepts imported `Shape` or `TrackedShape` results and always returns a chainable `Shape`
- The returned `Shape` or `Sketch` is fully chainable — use `.translate()`, `.rotate()`, `.subtract()`, etc.

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

### `lib.explode(items, options?)`
Apply deterministic exploded-view offsets to assembly structures while preserving names, colors, and nesting.

Works with:
- arrays of shapes/sketches/named items
- named nested `{ name, group: [...] }` assembly trees
- `ShapeGroup` outputs (including nested `group(...)`)

**Parameters:**
- `items` (`ExplodeItem[] | ShapeGroup`) - Assembly structure to explode
- `options` (object, optional):
  - `amount` (number) - Base explode distance. Default: `10`
  - `stages` (number[]) - Per-depth multipliers (`depth 1 = stages[0]`). If depth exceeds list, last value is reused
  - `mode` (`'radial' | 'x' | 'y' | 'z' | [x, y, z]`) - Default direction mode. Default: `'radial'`
  - `axisLock` (`'x' | 'y' | 'z'`) - Optional global axis lock
  - `byName` (`Record<string, { stage?, direction?, axisLock? }>`)- Per-part/group overrides by item name
  - `byPath` (`Record<string, { stage?, direction?, axisLock? }>`)- Low-level overrides by traversal path

Named items may also include an inline override:
`{ name: "Bolt A", shape: bolt, explode: { stage: 1.5, direction: [1, 0, 0] } }`

**Returns:** Same structure type as input, with translated geometry.

```javascript
const explodeAmt = param("Explode", 0, { min: 0, max: 40, unit: "mm" });

const assembly = [
  { name: "Body", shape: box(80, 50, 30, true).color('#6c7a89') },
  { name: "Drive", group: [
    { name: "Shaft", shape: cylinder(60, 4, undefined, undefined, true).pointAlong([1, 0, 0]).color('#c7d0d8') },
    { name: "Rotor", shape: cylinder(20, 12, undefined, undefined, true).color('#8897a8') },
  ]},
];

return lib.explode(assembly, {
  amount: explodeAmt,
  stages: [0.4, 0.8],
  mode: 'radial',
  byName: {
    "Shaft": { direction: [1, 0, 0], stage: 1.4 },
  },
});
```

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

## Common Patterns

### Parametric Box with Holes
```javascript
const w = param("Width", 80, { min: 40, max: 150, unit: "mm" });
const h = param("Height", 60, { min: 30, max: 100, unit: "mm" });
const t = param("Thickness", 5, { min: 2, max: 10, unit: "mm" });
const holeD = param("Hole Diameter", 8, { min: 4, max: 20, unit: "mm" });

const base = box(w, h, t);
const hole = cylinder(t + 2, holeD / 2).translate(w / 2, h / 2, -1);

return base.subtract(hole);
```

### Hollow Shell (Wall Thickness)
```javascript
const outer = param("Outer Size", 50, { min: 20, max: 100, unit: "mm" });
const wall = param("Wall", 3, { min: 1, max: 10, unit: "mm" });

const outerBox = box(outer, outer, outer, true);
const innerBox = box(outer - 2 * wall, outer - 2 * wall, outer - 2 * wall, true);

return outerBox.subtract(innerBox);
```

### Array/Pattern
```javascript
const count = param("Count", 5, { min: 2, max: 10 });
const spacing = param("Spacing", 15, { min: 5, max: 30, unit: "mm" });

let shapes = [];
for (let i = 0; i < count; i++) {
  shapes.push(cylinder(10, 5).translate(i * spacing, 0, 0));
}

return union(...shapes);
```

### Sketch-Based Design
```javascript
const sides = param("Sides", 6, { min: 3, max: 12 });
const radius = param("Radius", 25, { min: 10, max: 50, unit: "mm" });
const height = param("Height", 60, { min: 20, max: 120, unit: "mm" });
const wall = param("Wall", 3, { min: 1, max: 8, unit: "mm" });

const outer = ngon(sides, radius);
const inner = ngon(sides, radius - wall);
const profile = outer.subtract(inner);

return profile.extrude(height, { twist: 45, divisions: 32 });
```

### Rounded Edges
```javascript
// Use offset on 2D sketch before extruding
const base = rect(50, 30).offset(-3, 'Round').offset(3, 'Round');
return base.extrude(10);
```

### Chamfers and Fillets
```javascript
// Chamfer: subtract angled box
const part = box(50, 50, 20);
const chamfer = box(10, 60, 10)
  .rotate(0, 45, 0)
  .translate(50, -5, 15);

return part.subtract(chamfer);
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
```

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

## Best Practices

### Performance
- Boolean operations are expensive - minimize them
- Use parameters for values that might change
- Avoid deep nesting of operations in loops

### Readability
```javascript
// Good: Named intermediate shapes
const base = box(100, 100, 10);
const hole = cylinder(12, 8);
const result = base.subtract(hole.translate(50, 50, 0));
return result;

// Avoid: Deep nesting
return box(100, 100, 10).subtract(cylinder(12, 8).translate(50, 50, 0));
```

### Units
- All dimensions are in millimeters by default
- Angles are in degrees
- Use `unit` parameter option for clarity

### Centering
```javascript
// Centered primitives are easier to position
const centered = box(50, 50, 50, true).translate(x, y, z);

// Corner-based requires offset calculation
const corner = box(50, 50, 50).translate(x - 25, y - 25, z - 25);
```

## Debugging

### Console Output
```javascript
console.log("Width:", width);
console.log("Volume:", shape.volume());
```

### Incremental Building
```javascript
// Build up complex shapes step by step
const base = box(50, 50, 10);
// return base;  // Uncomment to see just the base

const withHole = base.subtract(cylinder(12, 5).translate(25, 25, 0));
// return withHole;  // Uncomment to see with hole

return withHole.add(cylinder(20, 3).translate(25, 25, 10));
```

## Error Handling

Common errors:
- **"Kernel not initialized"** - Internal error, reload page
- **"Cannot read property of undefined"** - Check variable names and parameter declarations
- **Invalid geometry** - Usually from degenerate shapes (zero dimensions, self-intersecting sketches)
- **Script execution error** - Check console for JavaScript errors

## Complete Examples

### Parametric Phone Stand
```javascript
const width = param("Width", 80, { min: 40, max: 150, unit: "mm" });
const depth = param("Depth", 60, { min: 30, max: 100, unit: "mm" });
const thick = param("Thickness", 5, { min: 2, max: 15, unit: "mm" });
const backH = param("Back Height", 40, { min: 20, max: 80, unit: "mm" });
const cableD = param("Cable Hole", 8, { min: 4, max: 15, unit: "mm" });

const base = box(width, depth, thick);
const back = box(width, thick, backH).translate(0, depth - thick, thick);
const lip = box(width, 10, 8).translate(0, 0, thick);
const hole = cylinder(thick + 2, cableD / 2)
  .rotate(90, 0, 0)
  .translate(width / 2, depth / 2, -1);

return union(base, back, lip).subtract(hole);
```

### Multi-Object Scene with Colors
```javascript
const base = box(100, 100, 5).color('#888888');
const col1 = cylinder(40, 5).translate(20, 20, 5).color('#cc4444');
const col2 = cylinder(40, 5).translate(80, 20, 5).color('#4444cc');
const col3 = cylinder(40, 5).translate(50, 80, 5).color('#44cc44');
const top = box(100, 100, 3).translate(0, 0, 45).color('#888888');

return [
  { name: "Base", shape: base },
  { name: "Column A", shape: col1 },
  { name: "Column B", shape: col2 },
  { name: "Column C", shape: col3 },
  { name: "Top", shape: top },
];
```

### Entity-Based Design with Topology
```javascript
const baseRect = rectangle(0, 0, 80, 60);
const base = baseRect.extrude(20);

// Fillet two corners
let result = filletEdge(base, base.edge('vert-br'), 8, [-1, -1]);
result = filletEdge(result, base.edge('vert-bl'), 8, [1, -1]);

// Subtract hole pattern
const holes = circularPattern(
  cylinder(25, 4).translate(40, 30, -1),
  4, 40, 30,
);

return result.toShape().subtract(holes);
```

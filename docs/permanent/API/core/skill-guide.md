# ForgeCAD Skill Guide — Concepts & Patterns

Conceptual knowledge that complements the auto-generated API index. The API index covers every function signature; this file covers the patterns, gotchas, and composition strategies that signatures alone cannot convey.

## Core Concepts

ForgeCAD scripts are JavaScript code that returns geometry. The forge API is globally available — no imports needed.

### Basic Structure
```javascript
const width = param("Width", 50, { min: 20, max: 100, unit: "mm" });
const shape = box(width, 30, 10);
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

### Unions Remove Colors

`union()` merges into a single solid — individual colors are lost. Return an array of named objects instead:

```javascript
// BAD: colors lost after union
return union(red, blue);

// GOOD: each object keeps its color
return [
  { name: "Red Box", shape: red, color: '#ff0000' },
  { name: "Blue Box", shape: blue, color: '#0066ff' },
];
```

### Coordinate System
Z-up right-handed: X = left/right, Y = forward/back, Z = up/down.

## Returning Multiple Objects

```javascript
return [
  { name: "Base", shape: box(100, 100, 5), color: "#888888" },
  { name: "Column", shape: cylinder(50, 10).translate(50, 50, 5), color: "#4488cc" },
];
```

Each object must have `name` (string) and `shape` or `sketch`. Optional `color` sets display color.

## 3D Anchor Positioning

### `.attachTo(target, targetAnchor, selfAnchor?, offset?)`

Position shapes relative to each other using bounding-box anchor points.

**Anchor3D values:**
- Face centers: `'front'` (−Y), `'back'` (+Y), `'left'` (−X), `'right'` (+X), `'top'` (+Z), `'bottom'` (−Z)
- Edge midpoints: `'front-left'`, `'top-right'`, `'bottom-back'`, etc.
- Corners: `'top-front-left'`, `'bottom-back-right'`, etc.

Word order is flexible: `'front-left'` = `'left-front'`.

```javascript
const base = box(100, 100, 10);
const column = cylinder(50, 8);
const placed = column.attachTo(base, 'top', 'bottom');
```

### `.onFace(parent, face, opts?)`

Place a shape on a specific face of a parent. Face-local coordinates: `u`/`v` offset from center, `protrude` outward.

```javascript
const vent = box(80, 2, 12, true)
  .onFace(body, 'front', { v: -15, protrude: 2 });
```

**When to use:** `onFace()` for surface details (vents, displays). `attachTo()` for stacking independent parts.

## Multi-File Projects

### File Types
- `.forge.js` — parametric part/assembly script
- `.forge-notebook.json` — multi-cell notebook
- `.svg` — vector artwork, imported as sketch geometry

### Import Function

Use `require(path, paramOverrides?)` to import any `.forge.js` file. The second argument is optional param overrides.

```javascript
const bracket = require("./bracket.forge.js");
const bracket2 = require("./bracket.forge.js", { Width: 100, Thickness: 3 });
```

The return value matches what the imported file exports:
- File `return`s a `Shape` → you get a `Shape`
- File `return`s an `Assembly` → you get an `ImportedAssembly`
- File `return`s a `ShapeGroup` → you get a `ShapeGroup`
- File uses `exports.name = value` → you get an object with named properties

Use `importSvgSketch()` for SVG files (separate function — SVG is a file format loader, not a module import).

### Import Rules
- Paths: `./file.forge.js` resolves relative to caller; bare paths resolve from project root
- Param overrides only affect that import call
- Circular imports throw an error
- Each import call is a fresh execution

### Placement References

Attach named reference points/edges/surfaces to shapes for precise cross-file positioning:

```javascript
// In part file:
return union(base, post).withReferences({
  points: { mount: [0, -16, -4] },
  surfaces: { mountingFace: { center: [0, -16, 0], normal: [0, -1, 0] } },
  objects: { base, post },
});

// In assembly file:
const widget = require("./widget.forge.js")
  .placeReference("mount", [120, 40, 0]);
const cap = box(18, 18, 8, true)
  .attachTo(widget, "objects.post.top", "bottom");
```

References survive transforms and import round-trips.

### Plain JS Module Imports

Regular `import`/`require()` works for utility modules. Don't mix explicit exports with top-level `return` in the same module.

### Typical Project Structure
```
my-project/
├── base-profile.forge.js     ← 2D cross-section (returns Sketch)
├── bracket.forge.js           ← extrudes the sketch, adds holes
└── assembly.forge.js          ← imports multiple parts, positions them
```

## Compiler-Owned Operations

### `shape.shell(thickness, options?)`
Hollows out a solid. Supports `box()`, `cylinder()`, straight `extrude()`. Optional `openFaces: ['top' | 'bottom']`.

```javascript
const cup = roundedRect(80, 50, 6, true)
  .extrude(30).shell(2.5, { openFaces: ['top'] });
```

### `shape.hole(face, options)`
Circular hole anchored to a face. `depth` omitted = through-hole. Supports `counterbore`/`countersink`, `upToFace`, two-sided `extent`.

```javascript
const body = block
  .hole('front', { diameter: 8, u: 0, v: 2 })
  .hole('top', { diameter: 6, u: -18, v: 10, depth: 10 })
  .hole('top', { diameter: 5, u: 18, v: 10, upToFace: exitFace,
    counterbore: { diameter: 9, depth: 4 } });
```

### `shape.cutout(sketch, options?)`
Cut-extrude using a sketch placed with `Sketch.onFace(...)`. Same extent options as `hole()`. Supports `taperScale` on circle/rect/roundedRect profiles.

### `sheetMetal(options)`
Sheet-metal builder: base panel → `.flange()` → `.cutout()` → `.folded()` or `.flatPattern()`.

## Group Patterns

`group()` combines shapes without merging — colors and identities preserved.

```javascript
const housing = group(
  { name: 'Shell', shape: shell },
  { name: 'Lid', shape: lid },
).withReferences({
  points: { mountCenter: [0, 30, 20] },
});
```

ShapeGroup supports all transforms, placement references, and child access (`.child("Name")`).

# ForgeCAD Core Concepts

ForgeCAD scripts are JavaScript code that returns geometry. The forge API is globally available — no imports needed.

## Basic Structure

```javascript
// 1. Declare parameters (creates UI sliders)
const width = param("Width", 50, { min: 20, max: 100, unit: "mm" });

// 2. Create geometry
const shape = box(width, 30, 10);

// 3. Return the final shape
return shape;
```

## Execution Model

- Scripts re-execute on every parameter change (400ms debounce)
- All operations are **immutable** — they return new shapes, never modify in place
- Must return one of:
  - A `Shape` (3D solid)
  - A `Sketch` (2D profile — rendered flat on XY plane)
  - A `TrackedShape` (3D solid with named faces/edges — auto-unwrapped)
  - A `ShapeGroup` (multiple shapes/sketches grouped for joint transforms)
  - An `Array` of shapes/sketches/groups (multi-object scene)
  - An `Array` of `{ name, shape?, sketch?, color? }` objects (named multi-object scene)

## Colors

Both `Shape` and `Sketch` support colors via `.color()`:

```javascript
const red = box(50, 50, 50).color('#ff0000');
const blue = circle2d(25).color('#0066ff');
```

Colors are preserved through transforms. In boolean operations the first operand's color wins.

When returning multiple objects, set color per-object:

```javascript
return [
  { name: "Base", shape: box(100, 100, 5), color: "#888888" },
  { name: "Column", shape: cylinder(50, 10).translate(50, 50, 5), color: "#4488cc" },
];
```

## ⚠️ Unions Remove Colors

`union()` merges shapes into one solid mesh — individual colors are lost:

```javascript
// ❌ BAD: Colors are lost after union
const red = box(30, 30, 30).color('#ff0000');
const blue = box(20, 20, 20).translate(30, 0, 0).color('#0066ff');
return union(red, blue); // Result is all one color
```

Return as named objects instead to keep each color:

```javascript
// ✅ GOOD: Each object keeps its color
return [
  { name: "Red Box", shape: box(30, 30, 30), color: '#ff0000' },
  { name: "Blue Box", shape: box(20, 20, 20).translate(30, 0, 0), color: '#0066ff' },
];
```

## Coordinate System

ForgeCAD uses **Z-up** right-handed coordinates:
- **X** = left/right
- **Y** = forward/back
- **Z** = up/down

See [coordinate-system.md](../guides/coordinate-system.md) for view mapping details.

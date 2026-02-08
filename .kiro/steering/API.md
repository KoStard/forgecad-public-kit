# ForgeCAD API Reference

**For AI Agents**: This document contains everything needed to write parametric CAD code in ForgeCAD.

## Core Concepts

ForgeCAD scripts are JavaScript/TypeScript code that returns a 3D shape. The forge API is globally available.

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
- All operations are **immutable** - they return new shapes
- The returned shape is rendered in the 3D viewport
- Must return a `Shape` object (3D) or `Sketch` (2D that gets auto-extruded)

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

**Returns:** Current parameter value (number)

**Examples:**
```javascript
const width = param("Width", 50);
const angle = param("Angle", 45, { min: 0, max: 180, unit: "°" });
const thick = param("Thickness", 2, { min: 0.5, max: 10, step: 0.5, unit: "mm" });
```

## 3D Primitives

### `box(x, y, z, center?)`
Creates a rectangular box.

**Parameters:**
- `x, y, z` (number) - Dimensions
- `center` (boolean, optional) - If true, centers at origin. Default: false (corner at origin)

**Returns:** `Shape`

```javascript
const cube = box(50, 50, 50, true);  // Centered cube
const plate = box(100, 80, 5);        // Corner at origin
```

### `cylinder(height, radius, radiusTop?, segments?, center?)`
Creates a cylinder or cone.

**Parameters:**
- `height` (number) - Height along Z axis
- `radius` (number) - Bottom radius
- `radiusTop` (number, optional) - Top radius. If different from radius, creates a cone. Default: same as radius
- `segments` (number, optional) - Number of sides. Default: auto (smooth circle)
- `center` (boolean, optional) - If true, centers along Z. Default: false

**Returns:** `Shape`

```javascript
const cyl = cylinder(50, 10);              // Cylinder
const cone = cylinder(50, 20, 5);          // Cone (tapered)
const hex = cylinder(10, 15, 15, 6);       // Hexagonal prism
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

### `.translate(x, y, z)`
Moves the shape.

```javascript
const moved = box(10, 10, 10).translate(50, 0, 0);
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

### 2D Transforms

Same as 3D but in 2D:

```javascript
sketch.translate(x, y?)
sketch.rotate(degrees)
sketch.scale(v)  // v can be number or [x, y]
sketch.mirror([nx, ny])
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

**Returns:** `Shape`

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
shape.volume()        // Returns volume in mm³
shape.boundingBox()   // Returns { min: [x,y,z], max: [x,y,z] }
```

### 2D Sketch Queries
```javascript
sketch.area()         // Returns area
sketch.bounds()       // Returns bounding box
sketch.isEmpty()      // Returns boolean
sketch.numVert()      // Returns vertex count
```

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

## Complete Example

```javascript
// Parametric Phone Stand with Cable Management

// Parameters
const width = param("Width", 80, { min: 40, max: 150, unit: "mm" });
const depth = param("Depth", 60, { min: 30, max: 100, unit: "mm" });
const thick = param("Thickness", 5, { min: 2, max: 15, unit: "mm" });
const backH = param("Back Height", 40, { min: 20, max: 80, unit: "mm" });
const cableD = param("Cable Hole", 8, { min: 4, max: 15, unit: "mm" });

// Base plate
const base = box(width, depth, thick);

// Back support
const back = box(width, thick, backH)
  .translate(0, depth - thick, thick);

// Phone lip (prevents sliding)
const lip = box(width, 10, 8)
  .translate(0, 0, thick);

// Cable management hole
const hole = cylinder(thick + 2, cableD / 2)
  .rotate(90, 0, 0)
  .translate(width / 2, depth / 2, -1);

// Combine everything
const stand = union(base, back, lip);
const final = stand.subtract(hole);

return final;
```

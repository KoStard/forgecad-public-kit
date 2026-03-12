# Modeling Recipes

This file collects patterns, best practices, debugging tips, and example snippets that are useful once you already know the model-building API.

## Iteration Bias

- For unfamiliar or high-risk geometry work, start in a notebook and keep setup, experiments, and validation in separate cells until the structure is obvious.
- Default to a buildable first pass instead of a long proposal when the user clearly wants geometry changed.
- Replace a broken or incoherent model wholesale when that is faster and cleaner than incremental patching.
- Keep printed hardware structurally honest: use it for guides, spacers, retainers, and moderate-load mechanisms; use wood or metal for primary strength.
- Validate early with `forgecad run <file>` and refine from the actual runtime result.
- Prefer a few clean part files over one giant script once a design has repeated hardware or a small mechanism.

Notebook helpers worth using during iteration:

- `show(...)` pins the current intermediate geometry in the viewport
- `forgecad notebook view <file> preview` prints the preview cell with stored outputs in the terminal
- `forgecad run <file>.forge-notebook.json` validates the preview cell and runs the usual spatial analysis

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

### Rounded Profiles
```javascript
const base = rect(50, 30).offset(-3, 'Round').offset(3, 'Round');
return base.extrude(10);
```

Use that pattern when every convex corner should round. For mixed sharp-and-rounded outlines, fillet only the intended vertices instead:

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

return roof.extrude(12);
```

### Chamfers and Fillets
```javascript
const part = box(50, 50, 20);
const chamfer = box(10, 60, 10)
  .rotate(0, 45, 0)
  .translate(50, -5, 15);

return part.subtract(chamfer);
```

### Choosing the right sketch-rounding tool

- `offset(-r).offset(+r)` for rounding every convex corner of a closed outline
- `stroke(points, width, 'Round')` for centerline-based geometry such as ribs or traces
- `hull2d()` of circles for a blended cap/capsule silhouette
- `filletCorners(points, ...)` for selective true-corner fillets on mixed profiles

## Best Practices

### Performance
- Boolean operations are expensive; minimize them
- Use parameters for values that might change
- Avoid deep nesting of operations in loops

### Readability
```javascript
const base = box(100, 100, 10);
const hole = cylinder(12, 8);
const result = base.subtract(hole.translate(50, 50, 0));
return result;
```

Prefer named intermediate values over deeply nested one-liners.

### Units
- All dimensions are millimeters by default
- Angles are degrees
- Use the `unit` parameter option when it helps the reader

### Centering
```javascript
const centered = box(50, 50, 50, true).translate(x, y, z);
const corner = box(50, 50, 50).translate(x - 25, y - 25, z - 25);
```

Centered primitives are usually easier to position.

## Debugging

### Console Output
```javascript
console.log("Width:", width);
console.log("Volume:", shape.volume());
```

### Incremental Building
```javascript
const base = box(50, 50, 10);
// return base;

const withHole = base.subtract(cylinder(12, 5).translate(25, 25, 0));
// return withHole;

return withHole.add(cylinder(20, 3).translate(25, 25, 10));
```

For sketch-heavy work, compare the raw profile and the rounded profile before extruding:

```javascript
const raw = polygon(roofPoints);
const rounded = filletCorners(roofPoints, [
  { index: 3, radius: 19 },
  { index: 4, radius: 19 },
  { index: 5, radius: 19 },
]);

return [
  { name: "Raw", sketch: raw },
  { name: "Rounded", sketch: rounded.translate(120, 0) },
];
```

## Error Handling

Common errors:
- `"Kernel not initialized"` - internal/runtime issue, reload the app
- `"Cannot read property of undefined"` - usually a bad variable name or missing declaration
- invalid geometry - commonly caused by zero dimensions or self-intersecting sketches
- script execution error - inspect the JS error in console output

## Example Snippets

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

const result = filletEdge(base.toShape(), base.edge('vert-br'), 8, [-1, -1])
  .hole(base.face('top'), { diameter: 6, u: -16, v: 10, depth: 8 });

const holes = circularPattern(
  cylinder(25, 4).translate(40, 30, -1),
  4, 40, 30,
);

return result.subtract(holes);
```

Use the original tracked body (`base`) when you need semantic faces after edge finishing, and keep using its untouched sibling vertical tracked edges if you apply another supported fillet/chamfer later. The currently selected finished edge is still recorded as a merged descendant set, so Forge does not claim a new durable tracked edge for that rewritten corner yet.

For larger runnable examples, read `examples/api/`.

---
skill-group: recipes
skill-order: 1
---

# Modeling Recipes

## Iteration Bias

- Default to a buildable first pass instead of a long proposal.
- Replace a broken model wholesale when that is faster than incremental patching.
- Validate early with `forgecad run <file>`.

## Common Patterns

### Hollow Shell
```javascript
const innerSize = outer - 2 * wall;
const outerBox = box(outer, outer, outer).placeReference('center', [0, 0, 0]);
const innerBox = box(innerSize, innerSize, innerSize).placeReference('center', [0, 0, 0]);
return outerBox.subtract(innerBox);
```

### Sketch-Based Twist
```javascript
const outer = ngon(sides, radius);
const inner = ngon(sides, radius - wall);
return outer.subtract(inner).extrude(height, { twist: 45, divisions: 32 });
```

### Rounded Profiles
```javascript
// All convex corners — offset trick
const base = rect(50, 30).offset(-3, 'Round').offset(3, 'Round');

// Selected corners only
const roof = filletCorners(roofPoints, [
  { index: 3, radius: 19 },
  { index: 4, radius: 19 },
  { index: 5, radius: 19 },
]);
```

### Choosing the right sketch-rounding tool

- `offset(-r).offset(+r)` — round every convex corner of a closed outline
- `stroke(points, width, 'Round')` — centerline-based geometry (ribs, traces)
- `filletCorners(points, ...)` — selective true-corner fillets on mixed profiles

## Best Practices

- All dimensions in millimeters; angles in degrees.
- Primitives are centered on XY, base at Z=0. Use `placeReference('center', [0,0,0])` to center on all axes.
- Prefer named intermediate values over deeply nested one-liners.
- `union2d`, `difference2d`, `intersection2d` batch faster than chained `.add()` / `.subtract()`.

## Debugging

```javascript
console.log("Volume:", shape.volume());
```

For sketch-heavy work, compare the raw profile and rounded profile side-by-side before extruding:

```javascript
return [
  { name: "Raw", sketch: polygon(roofPoints) },
  { name: "Rounded", sketch: filletCorners(roofPoints, [...]).translate(120, 0) },
];
```

## Common Errors

- `"Kernel not initialized"` — internal/runtime issue, reload the app
- zero dimensions or self-intersecting sketches → invalid geometry
- wrong variable name → `"Cannot read property of undefined"`

For deeper API coverage, load the relevant generated doc group from the skill source map instead of reaching for repo examples by default.

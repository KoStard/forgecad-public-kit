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
Round specific corners of a polygon point list (both convex and concave).

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
- both convex and concave corners are supported; convex fillets cut the corner, concave fillets fill the concavity
- collinear corners (straight edges) cannot be filleted
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

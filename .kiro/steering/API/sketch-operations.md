# Sketch Operations

2D operations for modifying sketch contours.

## Methods

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

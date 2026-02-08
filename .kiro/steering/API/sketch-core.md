# Sketch Core

The `Sketch` class is an immutable wrapper around Manifold's `CrossSection` that provides a chainable 2D API.

## Class: Sketch

Represents a 2D profile that can be transformed, combined with other sketches, or converted to 3D.

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

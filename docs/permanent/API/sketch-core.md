# Sketch Core

The `Sketch` class is an immutable wrapper around Manifold's `CrossSection` that provides a chainable 2D API.

## Class: Sketch

Represents a 2D profile that can be transformed, combined with other sketches, or converted to 3D.

### Color

#### `.color(hex: string): Sketch`
Set the display color of this sketch. Returns a new Sketch.

```javascript
const red = rect(50, 30).color('#ff0000');
const blue = circle2d(25).color('#0066ff');
```

Colors are preserved through transforms and boolean operations.

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

# Sketch Path Builder

Fluent API for tracing 2D outlines point by point.

## Class: PathBuilder

### `path()`
Creates a new path builder.

```javascript
const triangle = path()
  .moveTo(0, 0)
  .lineH(50)
  .lineV(30)
  .close();
```

### Methods

#### `.moveTo(x, y)`
Set starting point.

#### `.lineTo(x, y)`
Line to absolute position.

#### `.lineH(dx)`
Horizontal line (relative).

#### `.lineV(dy)`
Vertical line (relative).

#### `.lineAngled(length, degrees)`
Line at angle (0°=right, 90°=up).

#### `.close()`
Close path into a `Sketch` (auto-fixes winding).

#### `.stroke(width, join?)`
Thicken path into solid profile (see below).

## Stroke

Thicken a polyline (centerline) into a solid profile with uniform width. Proper miter joins at vertices.

### `path().stroke(width, join?)`
### `stroke(points, width, join?)`

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

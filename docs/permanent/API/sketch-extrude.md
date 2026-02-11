# Sketch Extrude & Revolve

Convert 2D sketches into 3D shapes through extrusion or revolution. The sketch's color (if set) is carried over to the resulting Shape.

## Methods

### `.extrude(height, options?)`
Extrudes sketch along Z axis.

**Parameters:**
- `height` (number) - Extrusion height
- `options` (object, optional):
  - `twist` (number) - Twist angle in degrees
  - `divisions` (number) - Number of twist steps (needed for twist)
  - `scaleTop` (number | [number, number]) - Scale factor at top
  - `center` (boolean) - Center along Z axis

**Returns:** `TrackedShape` (with faces: top, bottom, side)

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

### `.revolve(degrees?, segments?)`
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

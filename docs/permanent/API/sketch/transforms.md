# Sketch Transforms

2D transformations for sketches. All transforms are **chainable** and **immutable** (return new sketches). Colors are preserved through all transforms.

## Methods

### `.clone()` / `.duplicate()`
Create an explicit copy handle of a sketch (same profile/color) so variants are easy to branch.

```javascript
const profile = rect(40, 20);
const left = profile.clone().translate(-30, 0);
const right = profile.duplicate().translate(30, 0);
```

### `.translate(x, y?)`
Moves the sketch.

```javascript
const moved = rect(50, 30).translate(100, 50);
```

### `.rotate(degrees)`
Rotates around the origin.

```javascript
const rotated = rect(50, 30).rotate(45);
```

### `.rotateAround(degrees, pivot)`
Rotates around a specific point instead of origin.

**Parameters:**
- `degrees` (number) — Rotation angle
- `pivot` ([number, number]) — Point to rotate around

```javascript
const hook = rect(4, 20).rotateAround(-35, [2, 0]);
```

### `.scale(v)`
Scales the sketch.

**Parameters:**
- `v` (number | [number, number]) — Uniform scale or per-axis scale

```javascript
const bigger = circle2d(10).scale(2);
const stretched = rect(10, 10).scale([2, 0.5]);
```

### `.mirror(normal)`
Mirrors across a line defined by its normal vector.

**Parameters:**
- `normal` ([number, number]) — Line normal (doesn't need to be unit length)

```javascript
const mirrored = sketch.mirror([1, 0]); // Mirror across Y axis
```

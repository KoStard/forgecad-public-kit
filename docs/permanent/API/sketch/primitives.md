# Sketch Primitives

2D primitive shapes for creating sketches.

## Functions

### `rect(width, height, center?)`
Creates a rectangle.

**Parameters:**
- `width` (number) - Width
- `height` (number) - Height
- `center` (boolean, optional) - If true, centers at origin. Default: false (corner at origin)

```javascript
const r = rect(50, 30);
const centered = rect(50, 30, true);
```

### `circle2d(radius, segments?)`
Creates a circle.

**Parameters:**
- `radius` (number) - Circle radius
- `segments` (number, optional) - Number of segments. Default: auto (smooth)

```javascript
const c = circle2d(25);
const octagon = circle2d(25, 8);
```

### `roundedRect(width, height, radius, center?)`
Creates a rectangle with rounded corners.

**Parameters:**
- `width` (number) - Width
- `height` (number) - Height
- `radius` (number) - Corner radius
- `center` (boolean, optional) - If true, centers at origin. Default: false

```javascript
const rounded = roundedRect(60, 40, 5);
```

### `polygon(points)`
Creates a polygon from an array of [x, y] points or Point2D objects.

**Parameters:**
- `points` (([number, number] | Point2D)[]) - Array of vertex coordinates or Point2D objects

```javascript
const triangle = polygon([[0, 0], [50, 0], [25, 40]]);

// Also accepts Point2D objects
const p1 = point(0, 0), p2 = point(50, 0), p3 = point(25, 40);
const triangle2 = polygon([p1, p2, p3]);
```

### `ngon(sides, radius)`
Creates a regular polygon (equilateral).

**Parameters:**
- `sides` (number) - Number of sides
- `radius` (number) - Radius from center to vertex

```javascript
const hex = ngon(6, 25);
const triangle = ngon(3, 30);
```

### `ellipse(rx, ry, segments?)`
Creates an ellipse.

**Parameters:**
- `rx` (number) - X radius
- `ry` (number) - Y radius
- `segments` (number, optional) - Number of segments. Default: 64

```javascript
const oval = ellipse(40, 20);
```

### `slot(length, width)`
Creates an oblong shape (rectangle with semicircle ends).

**Parameters:**
- `length` (number) - Total length
- `width` (number) - Width

```javascript
const oblong = slot(60, 20);
```

### `star(points, outerRadius, innerRadius)`
Creates a star shape.

**Parameters:**
- `points` (number) - Number of star points
- `outerRadius` (number) - Outer radius (tip of points)
- `innerRadius` (number) - Inner radius (between points)

```javascript
const star5 = star(5, 30, 15);
```

### `text2d(content, options?)`
Renders a string as a filled 2D sketch using the built-in "Forge Mono" geometric font — a clean, angular, monoline typeface designed to extrude and engrave crisply.  Supports A–Z (case-insensitive), 0–9, and common punctuation.

**Parameters:**
- `content` (string) - Text to render
- `options.size` (number) - Cap height in model units. Default: `10`
- `options.letterSpacing` (number) - Extra spacing between characters in model units. Default: `0`
- `options.align` (`'left' | 'center' | 'right'`) - Horizontal alignment relative to x = 0. Default: `'left'`
- `options.baseline` (`'baseline' | 'center' | 'top'`) - Vertical alignment relative to y = 0. Default: `'baseline'`

**Returns:** `Sketch`

```javascript
// Extruded nameplate
text2d('FORGE CAD', { size: 8 }).extrude(1.5)

// Centered label
text2d('V 2.0', { size: 6, align: 'center', baseline: 'center' }).extrude(0.8)

// Engraved into a face
myPart.cut(text2d('A-001', { size: 4 }).onFace(myPart, 'top'), { depth: 0.5 })
```

### `textWidth(content, options?)`
Returns the rendered advance width of a string in model units, using the same metrics as `text2d`.

**Parameters:**
- `content` (string) - Text to measure
- `options.size` (number) - Cap height in model units. Default: `10`
- `options.letterSpacing` (number) - Extra spacing between characters. Default: `0`

**Returns:** `number`

```javascript
const w = textWidth('HELLO', { size: 10 }); // total advance width
```

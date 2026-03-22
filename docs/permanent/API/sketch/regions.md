# Sketch Regions

Decompose complex sketches into their individual filled areas. This is essential when a sketch operation produces multiple disconnected regions and you need to work with them independently.

## `sketch.regions()`

Decompose a sketch into its distinct filled regions, returned largest-first by area.

A single sketch can contain several disconnected filled areas (e.g., two separate rectangles, a ring shape, or the result of a boolean that leaves islands). This method enumerates all top-level connected regions as independent `Sketch` objects.

**Returns:** `Sketch[]` — Array of region sketches, sorted by area (largest first)

```javascript
// Two disconnected rectangles — get each one separately
const pair = union2d(rect(40, 40), rect(40, 40).translate(60, 0));
const [larger, smaller] = pair.regions();
larger.extrude(10);
smaller.extrude(5);

// Ring shape — one region containing the ring
const ring = circle2d(50).subtract(circle2d(30));
const [ringRegion] = ring.regions();
ringRegion.extrude(8);
```

## `sketch.region(seed)`

Select the single filled region that contains a given 2D point. This lets you pick any enclosed area by pointing at it instead of sorting through all regions.

**Parameters:**
- `seed` (`[number, number]`) — A 2D point `[x, y]` strictly inside the desired region

**Returns:** `Sketch` — The region containing the seed point

**Throws:** If the seed is outside all regions, on a boundary edge, or inside a hole.

```javascript
// Donut — select the ring area at radius 40
const donut = circle2d(50).subtract(circle2d(30));
const ring = donut.region([40, 0]);
ring.extrude(10);

// Complex boolean result — pick a specific island
const complex = union2d(rect(40, 40), rect(40, 40).translate(60, 0));
const rightBox = complex.region([80, 20]);  // seed inside right box
```

> **Callout:** The seed point must be strictly inside the filled area — not on the boundary. If you're unsure where the regions are, use `.regions()` first to enumerate them. Each returned region has a `.bounds()` you can inspect.

## Constrained Sketch Regions

`ConstraintSketch` (from `constrainedSketch().solve()`) provides two additional methods for working with the line arrangement formed by its edges:

### `cs.detectArrangement()`

Enumerate all bounded regions formed by the non-construction line arrangement. Returns `Sketch[]` sorted largest-first.

```javascript
const sk = constrainedSketch();
// ... add geometry and constraints ...
const cs = sk.solve();
const regions = cs.detectArrangement();
regions[0].extrude(5);  // extrude the largest region
```

### `cs.detectArrangementRegion(seed)`

Select a single arrangement region by seed point. Same semantics as `sketch.region(seed)` but operates on the constraint sketch's line arrangement (DCEL face detection).

```javascript
const region = cs.detectArrangementRegion([10, 10]);
region.extrude(3);
```

> **Callout:** `detectArrangement()` and `detectArrangementRegion()` use the raw line/arc geometry from the constraint solver, not the boolean profile. This means construction lines are excluded and the regions are formed by the geometric arrangement of edges — useful when you need to select specific enclosed areas from a complex constrained sketch.

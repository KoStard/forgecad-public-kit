# Edge Queries

Select and operate on edges of any 3D shape by geometric properties — direction, position, angle, convexity. This is the primary way to apply fillets and chamfers to specific edges without needing tracked topology.

## Selecting Edges

### `selectEdges(shape, query?)`

Find all edges that match a geometric query. Edges are extracted from the mesh as sharp features (dihedral angle > 1°).

**Parameters:**
- `shape` (Shape | TrackedShape) — The solid to query
- `query` (EdgeQuery, optional) — Filters to apply (see below)

**Returns:** `EdgeSegment[]` — Matching edge segments

### `selectEdge(shape, query?)`

Find the single best-matching edge. When `near` is specified, returns the closest match. Throws if no edges match.

**Parameters:** Same as `selectEdges()`

**Returns:** `EdgeSegment` — The best-matching edge

**Throws:** If no edges match the query

### EdgeQuery Filters

| Filter | Type | Description |
|--------|------|-------------|
| `near` | `[x, y, z]` | Sort by proximity to this point (closest first) |
| `parallel` | `[x, y, z]` | Edge direction ~parallel to this vector |
| `perpendicular` | `[x, y, z]` | Edge direction ~perpendicular to this vector |
| `convex` | `boolean` | Only convex (outside corner) edges |
| `concave` | `boolean` | Only concave (inside corner) edges |
| `minAngle` | `number` | Minimum dihedral angle (degrees) |
| `maxAngle` | `number` | Maximum dihedral angle (degrees) |
| `minLength` | `number` | Minimum edge length |
| `maxLength` | `number` | Maximum edge length |
| `within` | `BoundingRegion` | Edge midpoint must be inside this box |
| `atZ` | `number` | Edge midpoint Z ≈ this value (shorthand for `within`) |
| `tolerance` | `number` | Position tolerance. Default: `1.0` |
| `angleTolerance` | `number` | Angular tolerance in degrees. Default: `10` |

**BoundingRegion:** `{ xMin?, xMax?, yMin?, yMax?, zMin?, zMax? }` — any combination of axis bounds.

```javascript
const part = box(50, 30, 20);

// All vertical edges
const verticals = selectEdges(part, { parallel: [0, 0, 1] });

// Top-face edges only
const topEdges = selectEdges(part, { atZ: 20 });

// Nearest convex edge to a point
const nearest = selectEdge(part, { near: [50, 30, 20], convex: true });
```

### `coalesceEdges(segments, tolerance?)`

Merge collinear edge segments into longer logical edges. Mesh tessellation often splits a single geometric edge into multiple short segments — this function recombines them.

**Parameters:**
- `segments` (EdgeSegment[]) — Edge segments to merge
- `tolerance` (number) — Collinearity tolerance. Default: `0.01`

**Returns:** `EdgeSegment[]` — Merged edge segments

```javascript
const edges = selectEdges(shape, { parallel: [0, 0, 1] });
const merged = coalesceEdges(edges);
// merged has fewer, longer edges
```

## Applying Features

### `filletEdgeSegment(shape, segment, radius, segments?)`

Apply a fillet (rounded edge) to a mesh-selected edge. Works on any straight edge — not limited to tracked topology.

**Parameters:**
- `shape` (Shape | TrackedShape) — The solid to modify
- `segment` (EdgeSegment) — From `selectEdge()` / `selectEdges()`
- `radius` (number) — Fillet radius
- `segments` (number) — Arc segments. Default: `16`

**Returns:** `Shape` — New shape with fillet applied

### `chamferEdgeSegment(shape, segment, size)`

Apply a chamfer (beveled edge) to a mesh-selected edge.

**Parameters:**
- `shape` (Shape | TrackedShape) — The solid to modify
- `segment` (EdgeSegment) — From `selectEdge()` / `selectEdges()`
- `size` (number) — Chamfer distance from edge

**Returns:** `Shape` — New shape with chamfer applied

```javascript
const part = box(50, 30, 20);

// Fillet all top edges
const topEdges = selectEdges(part, { atZ: 20, perpendicular: [0, 0, 1] });
let result = part;
for (const edge of coalesceEdges(topEdges)) {
  result = filletEdgeSegment(result, edge, 2);
}

// Chamfer a single bottom edge
const bottomEdge = selectEdge(part, { near: [25, 0, 0], atZ: 0 });
result = chamferEdgeSegment(result, bottomEdge, 1.5);
```

> **Callout:** These functions work alongside the tracked-topology `filletEdge()` and `chamferEdge()` (which take an `EdgeRef` from a `TrackedShape`). Use edge queries when you don't have tracked topology — e.g., after boolean operations that strip topology, or on imported shapes.

## Comparison: Edge Queries vs. Tracked Topology

| Approach | Input | When to use |
|----------|-------|-------------|
| `filletEdge(shape, edge, radius)` | `EdgeRef` from `TrackedShape` | Simple boxes/cylinders, before booleans |
| `filletEdgeSegment(shape, segment, radius)` | `EdgeSegment` from `selectEdge()` | After booleans, complex shapes, imported geometry |

Both produce the same result — the query-based approach is more flexible but requires describing the edge geometrically instead of by name.

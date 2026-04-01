# Face Query API — Production-Grade Face Selection for Complex Models

## Goal

Make `shape.face()` work reliably on any model — not just boxes — by treating face references as geometric queries rather than string names. The canonical names (`'top'`, `'bottom'`, etc.) remain as shorthand for the common case. Complex models use richer query objects. The mesh-based detector is the primary selection mechanism, not a fallback.

**Done looks like:** A user can pocket/boss/sketch on any planar face of any model (post-boolean, imported, multi-feature) using either string names or query objects, with deterministic results that survive upstream model changes.

---

## Architecture: The Core Insight

**A face "name" is a geometric predicate.**

`'top'` = "the planar face cluster with normal ≈ [0,0,1] whose centroid has the highest Z"

This is what `meshFaceDetect.ts` already computes for 6 canonical directions. The generalization:

1. **Compile-plan resolution** stays as-is — it serves BREP export and construction-history tracking (different job)
2. **Mesh-based selection** becomes the primary query engine for `shape.face(query)`
3. **String names** desugar to canonical queries (backward-compatible, zero migration)
4. **Query objects** express any geometric predicate the mesh detector can evaluate

```
shape.face('top')                                    // canonical shorthand
shape.face({ normal: [0, 0, 1] })                   // any upward face
shape.face({ normal: [0, 0, 1], nearest: [50, 50] }) // disambiguate by position
shape.face({ at: [50, 50, 20] })                     // face containing point
shape.faces({ normal: [0, 0, 1] })                   // all upward faces
```

### Current System (Two-Tier Resolution)

```
shape.face(name: string)
  ├─ [1] Compile-plan lookup (resolveShapeFace) → FaceRef | null
  ├─ [2] Mesh fallback (detectFaceByName) → FaceRef | null  (6 canonical names only)
  └─ [3] Error with available face list
```

### Target System (Query-First Resolution)

```
shape.face(selector: string | FaceQuery)
  ├─ [1] If string: compile-plan lookup (preserves tracked-face lineage for BREP)
  │   └─ If found → return (with query metadata for downstream compiler)
  ├─ [2] Mesh query engine:
  │   ├─ If string: desugar to canonical query, evaluate
  │   └─ If FaceQuery object: evaluate directly
  └─ [3] Error with diagnostic (what faces exist, what the query matched)

shape.faces(selector?: FaceQuery)  → FaceRef[]
  └─ Returns ALL matching faces (no pick/disambiguate step)
```

---

## Workstreams

### WS1: FaceQuery Type and Selector Parsing
**Deliverable**: Type definitions for `FaceQuery` and a function that converts string names + query objects into a normalized internal representation.
**Dependencies**: none
**Status**: not started

The query object vocabulary:

```typescript
interface FaceQuery {
  /** Filter by face normal direction (cosine similarity > 0.9998) */
  normal?: [number, number, number];

  /** Pick the face whose centroid is nearest to this world point (XYZ or XY shorthand) */
  nearest?: [number, number] | [number, number, number];

  /** Pick the face that contains (or is nearest to) this world point.
   *  Uses triangle-level proximity — finds the face whose mesh is closest to the point. */
  at?: [number, number, number];

  /** Disambiguation when multiple faces match the normal filter */
  pick?: 'largest'    // by triangle area sum
       | 'smallest'   // by triangle area sum
       | 'max-x' | 'max-y' | 'max-z'   // by centroid
       | 'min-x' | 'min-y' | 'min-z';  // by centroid

  /** Only match faces with area within this range (mm²) */
  area?: { min?: number; max?: number };

  /** Only match planar faces (default: true for face ops) */
  planar?: boolean;
}
```

Canonical name desugaring:

| Name | Equivalent Query |
|------|-----------------|
| `'top'` | `{ normal: [0,0,1], pick: 'max-z' }` |
| `'bottom'` | `{ normal: [0,0,-1], pick: 'min-z' }` |
| `'front'` | `{ normal: [0,-1,0], pick: 'min-y' }` |
| `'back'` | `{ normal: [0,1,0], pick: 'max-y' }` |
| `'left'` | `{ normal: [-1,0,0], pick: 'min-x' }` |
| `'right'` | `{ normal: [1,0,0], pick: 'max-x' }` |

Tasks:
- [ ] Define `FaceQuery` type in `src/forge/face-tracking/faceQuery.ts`
- [ ] Implement `canonicalQuery(name: string): FaceQuery | null` — returns null for non-canonical names
- [ ] Implement `normalizeFaceSelector(selector: string | FaceQuery): { compilePlanName: string | null, query: FaceQuery }`
- [ ] Unit-level verification: canonical round-trips, invalid inputs rejected

---

### WS2: Enrich Mesh Face Detector with Query Evaluation
**Deliverable**: `meshFaceDetect.ts` gains `queryFaces(shape, query): FaceRef[]` and `queryFace(shape, query): FaceRef | null` that evaluate any `FaceQuery`.
**Dependencies**: WS1 (FaceQuery type)
**Status**: not started

Currently `meshFaceDetect.ts` has:
- `clusterMeshFaces(shape)` → `FaceCluster[]` — groups triangles by (normal, planeOffset)
- `detectFaceByName(shape, name)` → `FaceRef | null` — hardcoded canonical lookup

Refactor to:
- `clusterMeshFaces(shape)` — unchanged (core clustering algorithm)
- `queryMeshFaces(shape, query: FaceQuery): FaceRef[]` — evaluate query against clusters
- `queryMeshFace(shape, query: FaceQuery): FaceRef | null` — single-result convenience (pick logic)
- `detectFaceByName(shape, name)` — becomes thin wrapper: `canonicalQuery(name) → queryMeshFace()`

New capabilities needed:
- **Area computation**: sum triangle areas per cluster (cross product magnitude / 2, already computed for normals)
- **`nearest` filtering**: project query point onto each cluster's plane, check centroid distance
- **`at` filtering**: for each cluster, find the triangle nearest to the point, pick the cluster with minimum distance
- **`pick` logic**: generalized from the current max/min centroid selection

Tasks:
- [ ] Add `area` field to `FaceCluster` (sum of triangle areas)
- [ ] Implement `filterClusters(clusters, query)` — apply normal, area, planar filters
- [ ] Implement `pickCluster(candidates, query)` — apply nearest/at/pick disambiguation
- [ ] Implement `queryMeshFaces()` and `queryMeshFace()` public API
- [ ] Rewrite `detectFaceByName()` as wrapper
- [ ] Verification: query `{ normal: [0,0,1] }` on a box returns one cluster; on a pocketed box returns two; `pick: 'largest'` selects the larger one

---

### WS3: Integrate into Shape.face() and Add Shape.faces()
**Deliverable**: `Shape.face()` accepts `string | FaceQuery`. New `Shape.faces()` returns all matching faces. TrackedShape gets same API.
**Dependencies**: WS1, WS2
**Status**: not started

```typescript
// Shape class additions
face(selector: string | FaceQuery): FaceRef;    // single face, throws if none/ambiguous
faces(selector?: FaceQuery): FaceRef[];          // all matching, empty array if none

// TrackedShape same API
```

Resolution logic for `face()`:
1. If `selector` is a string AND compile plan has it → return (preserves tracked lineage)
2. Normalize selector to FaceQuery → `queryMeshFace(this, query)`
3. If null → error with diagnostics

For `faces()`:
1. Normalize selector to FaceQuery → `queryMeshFaces(this, query)`

Tasks:
- [ ] Update `Shape.face()` signature to accept `string | FaceQuery`
- [ ] Update resolution logic (compile plan first for strings, then query engine)
- [ ] Add `Shape.faces(query?)` method
- [ ] Add `TrackedShape.face()` overload for FaceQuery (bypass topology map, go to mesh)
- [ ] Add `TrackedShape.faces()` method
- [ ] Update `faceOps.ts` pocket/boss to accept `string | FaceQuery` for faceName parameter
- [ ] Update TypeScript declarations (forge-api.d.ts will auto-regenerate)

---

### WS4: Update faceOps and Downstream Consumers
**Deliverable**: pocket/boss/faceProfile accept query objects. PlaneSpec accepts FaceQuery.
**Dependencies**: WS3
**Status**: not started

```typescript
// Updated signatures
shape.pocket('top', 8)                                  // string name (unchanged)
shape.pocket({ normal: [0, 0, 1], nearest: [50, 50] }, 8)  // query object
shape.boss({ normal: [0, 0, 1], pick: 'largest' }, 5)       // query object

faceProfile(shape, 'top')                                // string name
faceProfile(shape, { normal: [0, 0, 1] })               // query object
```

PlaneSpec extension:
```typescript
type PlaneSpec =
  | { origin: Vec3; normal: Vec3 }
  | { plane: 'XY' | 'XZ' | 'YZ'; offset?: number }
  | { face: FaceRef }
  | { faceQuery: FaceQuery; shape: Shape };  // NEW: resolve at use site
```

Tasks:
- [ ] Update pocket/boss prototype methods to accept `string | FaceQuery`
- [ ] Update `faceProfile()` to accept `string | FaceQuery`
- [ ] Consider PlaneSpec extension (may defer — users can call `shape.face(query)` first)
- [ ] Runner context: no changes needed (methods, not free functions)

---

### WS5: Integration Test Model
**Deliverable**: `examples/face-query-test.forge.js` demonstrating query-based face selection on a complex multi-feature model.
**Dependencies**: WS4
**Status**: not started

Test scenarios:
1. Box with two pockets on top → `{ normal: [0,0,1], pick: 'largest' }` finds the remaining top surface, not the pocket floor
2. Box with pocket → query the pocket floor by `{ normal: [0,0,1], pick: 'smallest' }`
3. L-shaped body (union of two boxes) → multiple upward faces at different heights → `nearest` disambiguates
4. Cylinder → `{ normal: [0,0,1] }` finds the top cap
5. Imported/boolean result → no compile plan → queries still work
6. `shape.faces({ normal: [0,0,1] })` returns ALL upward faces

Tasks:
- [ ] Create test model with multi-feature body
- [ ] Verify each query scenario produces correct geometry
- [ ] Add to example manifest
- [ ] Run check suite — no new failures

---

### WS6: Error Diagnostics and DX
**Deliverable**: When a face query matches zero or multiple faces, the error message is helpful — shows what faces exist and what the query matched.
**Dependencies**: WS3
**Status**: not started

Current error: `Face "top" not found. Available: bottom, side-left, ...`

Target errors:
```
Face query { normal: [0,0,1] } matched 3 faces. Use 'pick' or 'nearest' to disambiguate.
  Candidates:
    - centroid [50, 50, 20], area 10000mm², normal [0, 0, 1]
    - centroid [50, 50, 12], area 8100mm², normal [0, 0, 1]  (pocket floor)
    - centroid [30, 30, 20], area 900mm², normal [0, 0, 1]   (boss top)

Face query { normal: [1, 1, 0] } matched 0 faces.
  Nearest normals found:
    - [0.707, 0.707, 0] (45° chamfer), centroid [80, 80, 10]
    - [1, 0, 0] (right face), centroid [100, 50, 10]
```

Tasks:
- [ ] Implement `explainQueryResult(shape, query, candidates)` diagnostic formatter
- [ ] Show centroid, area, normal for each candidate
- [ ] When 0 matches: suggest nearest-normal faces
- [ ] When >1 matches (and no pick/nearest): list candidates with hint to disambiguate

---

## Dependency Map

```
WS1 (FaceQuery type)
  ↓
WS2 (Mesh query engine)
  ↓
WS3 (Shape.face/faces integration)
  ↓
WS4 (pocket/boss/faceProfile update)
  ↓
WS5 (Integration tests)

WS6 (Error diagnostics) depends on WS3, can be parallel with WS4/WS5
```

```
WS1 ──→ WS2 ──→ WS3 ──→ WS4 ──→ WS5
                   │
                   └──→ WS6 (parallel with WS4/WS5)
```

## Progress Tracker

| Workstream | Status | Milestone | Notes |
|------------|--------|-----------|-------|
| WS1: FaceQuery type | not started | — | Foundation type, blocks everything |
| WS2: Mesh query engine | not started | — | Enriches existing meshFaceDetect.ts |
| WS3: Shape integration | not started | — | Public API change |
| WS4: faceOps update | not started | — | Pocket/boss accept queries |
| WS5: Integration tests | not started | — | Complex multi-feature model |
| WS6: Error diagnostics | not started | — | Can parallel WS4/WS5 |

## Decision Log

| # | Decision | Why | Impact |
|---|----------|-----|--------|
| D1 | Mesh-based query is primary, compile-plan is for lineage | Compile plans serve BREP export, not face selection. Mesh approach is universal, robust to upstream changes, works on imports. | Simplifies architecture — one query engine, not two competing systems |
| D2 | String names preserved as canonical shorthand | Backward compatible, good DX for simple cases | Zero migration needed |
| D3 | `face()` returns single FaceRef, `faces()` returns array | `face()` is the common case (pocket/boss need exactly one). `faces()` is the power-user escape hatch. | Clean API split |
| D4 | Query object vocabulary is minimal (normal, nearest, at, pick, area, planar) | Cover 95% of real-world cases. Can extend later. Over-designing the query language now would be premature. | Small surface area to implement and test |
| D5 | Prototype methods (not free functions) for face ops | Avoids namespace collision with user `const pocket = ...` variables | Discovered during implementation of face-operations-gap |

## Open Questions

- **Should `faces()` be added to the runner context as a global?** Since pocket/boss are methods, `shape.faces()` is natural. But `faceProfile(shape, query)` is a free function — should there also be a free `faces(shape, query)` or is `shape.faces(query)` sufficient?
- **CadQuery-style string shorthand?** E.g., `'>Z'` for `{ normal: [0,0,1], pick: 'max-z' }`. Nice DX but adds parsing complexity. Could be a follow-up.
- **Should `at` use ray-casting or nearest-triangle?** Ray-casting is more intuitive ("the face at this point") but requires the point to be exactly on the surface. Nearest-triangle is more forgiving. Lean toward nearest-triangle with a reasonable distance threshold.
- **Face area computation cost**: Computing all triangle areas adds ~O(n) work per query. For large meshes this could be slow. Consider caching clusters per shape (WeakMap). Profile before optimizing.

## Files Modified

| File | Workstream | Purpose |
|------|------------|---------|
| `src/forge/face-tracking/faceQuery.ts` | WS1 | FaceQuery type + canonical desugaring |
| `src/forge/face-tracking/meshFaceDetect.ts` | WS2 | Query evaluation engine |
| `src/forge/kernel.ts` | WS3 | Shape.face/faces overloads |
| `src/forge/sketch/topology.ts` | WS3 | TrackedShape.face/faces overloads |
| `src/forge/faceOps.ts` | WS4 | pocket/boss accept FaceQuery |
| `src/forge/section.ts` | WS4 | faceProfile accepts FaceQuery |
| `src/forge/forge-public-api.ts` | WS3 | Export FaceQuery type |
| `examples/face-query-test.forge.js` | WS5 | Integration test model |
| `cli/example-manifest/experimental.ts` | WS5 | Manifest entry |

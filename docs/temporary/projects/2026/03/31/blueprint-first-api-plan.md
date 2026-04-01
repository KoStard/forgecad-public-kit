# Blueprint-First API — Implementation Plan

**Goal:** Eliminate the "trigonometry tax" from ForgeCAD's public API. Users should never need `Math.sin`/`Math.cos` for standard mechanical layout.

**Branch:** `worktree-blueprint-first-api`
**Started:** 2026-03-31

---

## Workstream 1: Layout Helpers (P0 — highest impact)

These three functions eliminate the most common trig patterns across ~30 example files.

### 1.1 `circularLayout(count, radius, options?)`
- **Returns:** `Array<{x: number, y: number}>` — evenly spaced points on a circle
- **Options:** `{ startDeg?: number, centerX?: number, centerY?: number }`
- **Eliminates:** `for (i=0; i<N; i++) { angle = i*360/N; x = r*cos(angle); y = r*sin(angle); }`
- **Location:** `src/forge/sketch/layout.ts` (new file)
- **Export from:** `forge-public-api.ts`

### 1.2 `polygonVertices(sides, radius, options?)`
- **Returns:** `Array<{x: number, y: number}>` — vertices of a regular polygon
- **Options:** `{ startDeg?: number, centerX?: number, centerY?: number }`
- **Eliminates:** `Math.sqrt(3)/2` for equilateral triangles, manual vertex computation
- **Location:** `src/forge/sketch/layout.ts`
- **Export from:** `forge-public-api.ts`

### 1.3 `translatePolar(radius, angleDeg, z?)` on Shape
- **What:** Add `.translatePolar()` method to Shape class
- **Eliminates:** `shape.translate(r * Math.cos(deg * Math.PI/180), r * Math.sin(deg * Math.PI/180), z)`
- **Location:** `src/forge/kernel.ts` — add method to Shape class
- **Also:** `polar(radius, angleDeg)` already exists; ensure it returns `{x, y}` usable in translate

---

## Workstream 2: Pattern Enhancement (P1)

### 2.1 `circularPattern` with arbitrary axis and origin
- **Current:** Only works in XY plane at Z=0
- **New:** `circularPattern(shape, count, { axis?: Vec3, origin?: Vec3 })`
- **Eliminates:** Manual `rotateAround` loops for non-XY patterns
- **Location:** `src/forge/sketch/patterns.ts`

---

## Workstream 3: Documentation & Design Gate (P1)

### 3.1 Philosophy doc
- **Location:** `docs/permanent/project/blueprint-first.md`
- **Content:** The manifesto adapted for ForgeCAD's existing API

### 3.2 CLAUDE.md design rule
- Add the "no trig tax" design gate to CLAUDE.md
- Every new public method must pass: can the user do this without sin/cos?

---

## Workstream 4: Future Work (not in this PR)

These are captured for future implementation but out of scope for this branch.

### 4.1 Construction line helpers in constrained sketch
- `parallelTo(lineId, offset)`, `perpendicularThrough(pointId, lineId)`
- Reduces manual position calculation in constrained sketches

### 4.2 `Transform.apply(point)` ergonomics
- Make it obvious how to compute "where does this point end up after rotation?"
- Reduces manual rotation matrix math in kinematic examples

### 4.3 `gearPair()` metadata improvements
- Return `centerDistance`, `meshPoint` so users don't reverse-engineer positioning

### 4.4 `offsetPlane(face, distance)` for workplane creation
- Define sketch planes offset from existing faces without manual Z math

### 4.5 Domain-specific helpers
- `nacaAirfoil()`, `spiralLayout()`, `gridLayout()`
- These serve niche use cases but would dramatically simplify specific examples

### 4.6 Lint rule for Math.sin/cos in .forge.js
- Warning (not error) that flags trig in user scripts as potential API gaps

---

## Completion Criteria

- [ ] `circularLayout`, `polygonVertices` exported and typed
- [ ] `Shape.translatePolar` works
- [ ] `circularPattern` accepts axis/origin options
- [ ] Philosophy doc committed
- [ ] CLAUDE.md updated with design gate
- [ ] `npm run refresh` passes
- [ ] Types generate correctly

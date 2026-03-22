# Sketch Backend Entanglement — Investigation

## Goal & Current State

**Goal**: Understand how entangled the sketch/constrained-sketch system is with Manifold, and plan extraction so sketches go through the same compiler → backend-specific lowering pipeline as shapes.

**Current state**: Shapes have a clean `ShapeBackend` interface with backend-agnostic compile plans lowered by `backends/manifold/lower.ts` or `backends/occt/lower.ts`. Sketches do NOT have this — they directly call Manifold's `CrossSection` API from 10 files in `src/forge/sketch/`.

## Architecture Summary

### What shapes do (the good pattern)

```
User code → Shape operations → ShapeCompilePlan (IR) → buildShapeFromCompilePlan()
                                                           ├── manifold/lower.ts → ManifoldShapeBackend
                                                           └── occt/lower.ts     → OCCTShapeBackend
```

Shape operations produce a **backend-agnostic IR** (`ShapeCompilePlan`), lowered at runtime by the active backend.

### What sketches do (the problem)

```
User code → Sketch operations → asCrossSection(sketch.cross).doManifoldThing()
                                     ↑
                             Direct Manifold API call
```

`ProfileBackend` is declared as `type ProfileBackend = unknown` — nominally opaque, but every sketch operation immediately casts it to `CrossSection` via `asCrossSection()` and calls Manifold methods directly.

There is **no `ProfileBackend` interface** analogous to `ShapeBackend`. No compile plan IR for profile operations. No lowering step.

## Entanglement Inventory

### 10 sketch files with direct Manifold backend imports

| File | What it does with Manifold | Imports |
|------|---------------------------|---------|
| `core.ts` | `area()`, `bounds()`, `isEmpty()`, `numVert()`, `toPolygons()`, `offset()`, `hull()`, `simplify()`, `warp()`, materializes compile plans via `lowerProfileCompilePlanToCrossSection()` | `getWasm`, `asCrossSection`, `fromCrossSection`, `lowerProfileCompilePlanToCrossSection` |
| `booleans.ts` | `union()`, `difference()`, `intersection()`, `hull()` on CrossSections | `getWasm`, `asCrossSection`, `fromCrossSection` |
| `transforms.ts` | `translate()`, `rotate()`, `scale()`, `mirror()` on CrossSections | `asCrossSection`, `fromCrossSection` |
| `operations.ts` | `offset()`, `hull()`, `simplify()`, `warp()` | `asCrossSection`, `fromCrossSection` |
| `extrude.ts` | Direct `CrossSection.extrude()` and `.revolve()` fallback paths | `asCrossSection` |
| `entities.ts` | `CrossSection.circle()`, polygon construction | `getWasm`, `fromCrossSection` |
| `constraints/sketch.ts` | `CrossSection.circle()`, `CrossSection.square()`, `CrossSection.difference()` | `getWasm`, `fromCrossSection` |
| `svgImport.ts` | `new CrossSection(loops)` | `getWasm`, `fromCrossSection` |
| `text.ts` | Boolean subtract for text holes | `asCrossSection`, `fromCrossSection` |
| `regions.ts` | Uses `CrossSection` type in signatures | `CrossSection` type |

### Pattern analysis

Every sketch file follows the same anti-pattern:

```ts
// Cast opaque ProfileBackend → Manifold CrossSection
const cs = asCrossSection(sketch.cross);
// Call Manifold API directly
const result = cs.someManifoldMethod(...);
// Cast back to opaque ProfileBackend
const profile = fromCrossSection(result);
// Wrap in Sketch
return new Sketch(profile, color);
```

This is exactly what shapes did before the backend purity refactor — and the fix is the same.

### What's NOT entangled (already clean)

- **Loft/sweep lowering** (`loftSweepLowering.ts`) — pure geometry, no Manifold imports
- **Constraint solver** — pure math, no backend dependency
- **Arrangement/regions algorithm** — pure computational geometry
- **DXF/SVG/PDF export** — work from polygons, not CrossSections
- **Workplane/placement** — pure transforms

## What needs to happen

### Phase 1: Create `ProfileBackend` interface (analogous to `ShapeBackend`)

Replace `type ProfileBackend = unknown` with a real interface:

```ts
export interface ProfileBackend {
  // Queries
  area(): number;
  bounds(): Rect;
  isEmpty(): boolean;
  numVert(): number;
  toPolygons(): SimplePolygon[];

  // Transforms
  translate(x: number, y: number): ProfileBackend;
  rotate(degrees: number): ProfileBackend;
  scale(v: Vec2 | number): ProfileBackend;
  mirror(ax: Vec2): ProfileBackend;

  // Operations
  offset(delta: number, joinType: JoinType): ProfileBackend;
  hull(): ProfileBackend;
  simplify(epsilon: number): ProfileBackend;
  warp(fn: (v: Vec2) => Vec2): ProfileBackend;

  // Booleans
  union(others: ProfileBackend[]): ProfileBackend;
  difference(others: ProfileBackend[]): ProfileBackend;
  intersection(others: ProfileBackend[]): ProfileBackend;

  // Conversion
  extrude(height: number, ...): ShapeBackend;
  revolve(segments: number, degrees: number): ShapeBackend;
}
```

### Phase 2: Create `ProfileCompilePlan` for profile operations

Some profile ops already have compile plans (transforms, booleans). Extend this to cover all operations so they can be lowered by either backend.

### Phase 3: Implement `ManifoldProfileBackend`

Move all `asCrossSection()` calls into a `ManifoldProfileBackend` class under `backends/manifold/`.

### Phase 4: Create profile constructors in backend layer

Factory functions for creating profiles from primitives (circle, polygon, SVG paths) — currently done inline with `getWasm().CrossSection.circle(...)`.

### Phase 5: Remove all Manifold imports from `src/forge/sketch/`

After phases 1-4, sketch files should only reference `ProfileBackend` (the interface), never Manifold specifics.

## Effort estimate

~35 call sites across 10 files. The pattern is repetitive (cast → call → cast back), so extraction is mechanical but touches a lot of surface area.

## Progress Tracker

| # | Change | Manifold imports in sketch/ | Status |
|---|--------|-----------------------------|--------|
| — | Baseline | 10 files, ~35 call sites | ✅ Measured |
| P1 | ProfileBackend interface | — | ✅ Done |
| P2 | ManifoldProfileBackend impl | — | ✅ Done |
| P3 | Profile factory functions (profileOps.ts) | — | ✅ Done |
| P4 | Remove Manifold from sketch/ | 0 files, 0 call sites | ✅ Done |
| P5 | Delete profileCast.ts | — | ✅ Done |
| P3 | ManifoldProfileBackend impl | — | Pending |
| P4 | Profile factory functions | — | Pending |
| P5 | Remove Manifold from sketch/ | 0 files, 0 call sites | Pending |

## Experiment Log

#### Baseline Audit (SUCCESS)
**What**: Searched all sketch files for Manifold backend imports.
**Result**: 10 files, ~35 direct Manifold API call sites. `ProfileBackend = unknown` is a hollow abstraction.
**Lesson**: The sketch layer has the same problem shapes had before the backend purity refactor — direct backend calls instead of going through an interface + lowering.

## Files Modified

| File | Purpose |
|------|---------|
| (none yet) | Investigation only |

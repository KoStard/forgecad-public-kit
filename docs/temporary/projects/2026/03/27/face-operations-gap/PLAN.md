# Face Operations Gap Analysis

**Date:** 2026-03-27
**Branch:** worktree-face-operations-api
**Goal:** Identify what's missing in ForgeCAD to support: (1) get a face, shrink it, push it inside to create an inset; (2) get a face, scale it, extrude it, boolean diff against the parent.

---

## The Two Workflows

### Workflow A — Inset / Emboss
> Get a surface, duplicate, make smaller, push inside → angled inset pocket

```js
// What the user wants to write:
const result = base.pocket('top', 8, { inset: 5 });
// → shrink the top face by 5mm, push 8mm into the solid
```

### Workflow B — Clone–Scale–Diff
> Get a surface, clone, scale, extrude, boolean difference with parent

```js
// What the user wants to write:
const profile = faceProfile(base, 'top');
const pocket = profile.scale(0.8).extrude(8);
const result = base.subtract(pocket.onFace(base, 'top', { protrude: -8 }));
```

---

## What Already Exists

| Primitive | API | Works? |
|-----------|-----|--------|
| Extract face cross-section as Sketch | `intersectWithPlane(shape, plane)` | ✅ |
| Target a face as a plane | `PlaneSpec = { face: FaceRef }` | ✅ |
| Get a FaceRef by name | `shape.face('top')` | ✅ |
| Shrink/grow a 2D Sketch profile | `sketch.offset(delta)` | ✅ |
| Extrude a Sketch to 3D | `sketch.extrude(height)` | ✅ |
| Boolean difference | `shape.subtract(other)` | ✅ |
| Place sketch on a face | `sketch.onFace(parent, 'top', { protrude })` | ✅ |
| Scale a Sketch | `sketch.scale(factor)` | ? (needs verification) |

### The surprising finding

`PlaneSpec` already accepts `{ face: FaceRef }` and `resolvePlaneFrame` handles it correctly. So this is actually valid today:

```js
const faceRef = base.face('top');
const profile = intersectWithPlane(base, { face: faceRef });
const smaller = profile.offset(-5);
// ... then position and subtract manually
```

Both workflows are *technically possible* today. The building blocks exist.

---

## What's Actually Missing

### The Gap: No Ergonomic Face-Based Operations API

The primitives compose correctly but the workflow is:
1. **Non-obvious** — no one will discover `intersectWithPlane(shape, { face: shape.face('top') })` by reading examples
2. **Fragile positioning** — after `sketch.extrude(depth)`, you must manually `protrude: -depth` with the right sign and value; one slip produces geometry floating above the model
3. **No single operation** — Fusion 360's PressPull does this in one gesture. ForgeCAD requires 4+ steps.
4. **The `sketch.scale()` question** — it's not clear if scaling a sketch obtained from `intersectWithPlane` gives a result that extrudes correctly in face-local coords (needs verification)

---

## The Missing API — Priority Order

### P1: `faceProfile(shape, faceName)` — the single most important thing

A standalone function that wraps the non-obvious incantation:

```typescript
// Currently requires:
intersectWithPlane(shape, { face: shape.face('top') })

// Should be:
faceProfile(shape, 'top')
```

Why this is THE most important:
- It makes both workflows writable today without new geometry primitives
- It's 3 lines of implementation (literally wrap existing code)
- It unlocks the pattern: `faceProfile → .offset() → .extrude() → boolean`
- It names the concept: "give me the 2D boundary of this face"

### P2: `shape.pocket(faceName, depth, opts?)` — compound operation

```typescript
shape.pocket('top', 8)              // pocket using full face
shape.pocket('top', 8, { inset: 5 }) // pocket with 5mm inset (shrunk face)
shape.boss('top', 8)                // boss (protrusion) instead of pocket
shape.boss('top', 8, { inset: 5 }) // protrusion with inset
```

This is one call that handles: face extraction → optional shrink → extrude → boolean → return.

The design goal: **prevent parameter hacking**. User expresses intent (`pocket`) not mechanics (`intersectWithPlane + offset + extrude + subtract`).

### P3: `sketch.scale(factor, opts?)` on sketches from face profiles

If `sketch.scale()` doesn't correctly preserve centroid anchoring, face-based scaling workflows will produce off-center pockets. Needs a test.

### P4 (secondary): Mesh-based face selection for post-boolean shapes

After `base.subtract(cutter)`, the result is a raw mesh. `face('top')` will fail. For the full Fusion-360-like experience, arbitrary faces on any solid need to be selectable. This is harder — requires either OCCT B-rep topology or mesh region detection. Lower priority.

---

## Implementation: P1 `faceProfile`

### Location
`src/forge/section.ts` — alongside `intersectWithPlane` and `projectToPlane`

### Code (draft)

```typescript
/**
 * Extract the 2D boundary profile of a named face as a Sketch.
 * The returned sketch is in face-local 2D coordinates.
 *
 * @example
 * const profile = faceProfile(box(100, 100, 20), 'top');
 * const pocket = profile.offset(-5).extrude(8);
 * const result = base.subtract(pocket.onFace(base, 'top', { protrude: -8 }));
 */
export function faceProfile(shape: Shape, faceName: string): Sketch {
  const face = shape.face(faceName);
  return intersectWithPlane(shape, { face });
}
```

Export from `forge-public-api.ts` alongside `intersectWithPlane`.

### What this unlocks (today, without P2)

```js
// Workflow A: inset pocket
const base = box(100, 100, 20);
const profile = faceProfile(base, 'top');
const pocket = profile.offset(-5).extrude(8);
const result = base.subtract(pocket.onFace(base, 'top', { protrude: -8 }));

// Workflow B: scale + diff
const base = box(100, 100, 20);
const pocket = faceProfile(base, 'top').scale(0.8).extrude(8);
const result = base.subtract(pocket.onFace(base, 'top', { protrude: -8 }));
```

---

## Implementation: P2 `shape.pocket()` / `shape.boss()`

Compound operation, higher value. Lives in `src/forge/kernel.ts` (as Shape method) or as standalone in `src/forge/faceOps.ts`.

```typescript
interface PocketOptions {
  inset?: number;     // shrink face boundary by this much (default: 0)
  scale?: number;     // alternatively, scale the face profile (default: 1)
  join?: 'Round' | 'Square' | 'Miter';  // for inset offset
}

function pocket(shape: TrackedShape | Shape, faceName: string, depth: number, opts?: PocketOptions): Shape {
  const face = shape.face(faceName);
  let profile = intersectWithPlane(shape, { face });

  if (opts?.inset) profile = profile.offset(-opts.inset, opts.join ?? 'Round');
  if (opts?.scale && opts.scale !== 1) profile = profile.scale(opts.scale);

  const tool = profile.extrude(depth).onFace(shape, faceName, { protrude: -depth });
  return shape.subtract(tool);
}
```

---

## Files to Touch

| File | Change |
|------|--------|
| `src/forge/section.ts` | Add `faceProfile()` |
| `src/forge/forge-public-api.ts` | Export `faceProfile` |
| `src/forge/forge-api.d.ts` | Type declaration |
| `src/forge/runner.ts` | Register in runner context |
| `src/forge/kernel.ts` or `src/forge/faceOps.ts` | Add `pocket()` / `boss()` (P2) |

---

## Progress Tracker

| # | Change | Status | Notes |
|---|--------|--------|-------|
| — | Baseline: gap identified | ✅ | Primitives exist, ergonomics missing |
| P1 | Add `faceProfile()` | 🔲 | 3-line wrapper, high value |
| P1a | Verify `sketch.scale()` works with face profiles | 🔲 | Need a test model |
| P2 | Add `shape.pocket()` / `shape.boss()` | 🔲 | Compound operation |
| P4 | Post-boolean face selection | 🔲 | Hard, OCCT or mesh topology work |

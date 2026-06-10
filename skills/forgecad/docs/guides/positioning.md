---
skill-group: geometry
skill-order: 3
---

# Positioning Decision Ladder

Most positioning bugs come from manual coordinate arithmetic. Pick the **highest applicable rung**; drop down only when the rung above doesn't fit.

## 1. Connectors + `matchTo()` — every real part-to-part interface

**Rule 0:** if parts are meant to stay in contact, define connectors and `matchTo()` — including *static* assemblies (furniture, enclosures, fixtures, toys), not just mechanisms. Connectors win because they are **stable** (don't shift on fillet/chamfer/boolean), **semantic** (type/gender), **oriented** (full frame), **queryable** (`verify.connectorDistance`), and **explode-aware**.

```javascript
const shelf = box(200, 120, 10).withConnectors({
  tab: connector.male("dovetail", { origin: [-100, 0, 5], axis: [-1, 0, 0], up: [0, 0, 1] }),
});
const placed = shelf.matchTo(panel, "tab", "shelf_slot");
```

Alignment semantics, dictionary form, and dotted group paths: see `matchTo()` JSDoc. For cross-file part alignment, prefer connectors over `withReferences()` placement points.

## 2. `group()` — local coordinates for multi-part assemblies

Build sub-parts at the **local origin**, group them, then translate the group **once** — never add a parent's global offset to every sub-part. Groups nest; each level has its own local origin. Groups cannot be booleaned: do subtract/intersect first in local coordinates, then group the result. Worked example: `group()` JSDoc.

## 3. `pointAlong()` — orient before positioning

Always call `pointAlong()` **before** `matchTo()`/`translate()` — it reorients around the origin.

## 4. `attachTo()` — rough bounding-box placement only

Anchor points shift after fillet/chamfer/boolean: fine for quick prototyping, fragile for assembly interfaces — promote real interfaces to connectors.

## 5. `placeReference()` — land a named anchor on a world coordinate

Grounding, centering, edge alignment, custom reference points: see `placeReference()` JSDoc.

## 6. Last resort: `rotateAroundTo()`, `moveToLocal()`, `translate()`

For computed offsets and free-floating or exploratory layout. Raw `translate()`/`rotate()` is correct only when parts are intentionally unrelated.

## Mechanisms

Link graphs (`link()`, `edgeBetweenLinks()`) solve **point positions** (closed loops); connector-frame joints (`assembly().connect()`) **orient physical parts**. Frame semantics and mirrored-revolute rules: assembly docs; joint geometry: `guides/joint-design.md`.

## Primitive placement

Box and cylinder sit base-at-Z=0, centered on XY; sphere and torus are fully centered. There is no OpenSCAD-style `center: true` — placement is fixed; use `placeReference('center', [0, 0, 0])` to fully center. Exact per-axis extents: primitive JSDoc.

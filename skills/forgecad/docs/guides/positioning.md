---
skill-group: geometry
skill-order: 3
---

# Positioning Strategy

## Rule 0: if parts should touch, use connectors first

For any fixed assembly where parts are meant to stay in contact in the final model, start with connectors + `matchTo()`. This applies to furniture, fixtures, toys, enclosures, sleds, and any other static multi-part object, not only mechanisms.

Use raw `translate()` and `rotate()` when parts are intentionally free-floating or when you are doing quick exploratory layout. Use `attachTo()` for rough bounding-box placement. But if the relationship is a real interface, make it explicit with connectors.

## Primitive origin convention

All 3D primitives are **centered on XY, base at Z=0**:

| Primitive | X range | Y range | Z range |
|-----------|---------|---------|---------|
| `box(60, 40, 20)` | [-30, 30] | [-20, 20] | [0, 20] |
| `cylinder(50, 10)` | [-10, 10] | [-10, 10] | [0, 50] |
| `sphere(15)` | [-15, 15] | [-15, 15] | [-15, 15] |
| `torus(20, 5)` | [-25, 25] | [-25, 25] | [-5, 5] |

Sphere and torus are fully centered (symmetric in Z). Box and cylinder sit on the XY ground plane — **Z goes up from zero, never negative**.

This means `box(w, d, h).translate(0, 0, -h / 2)` is the manual way to "center on Z" — it moves the box from `[0, h]` to `[-h / 2, h / 2]`. Prefer `box(w, d, h).placeReference('center', [0, 0, 0])` when you want full XYZ centering.

Do not assume `center: true` or a positional `true` gives OpenSCAD-style full XYZ centering. Primitive placement is fixed unless the primitive docs explicitly say otherwise.

---

Most positioning bugs come from manual coordinate arithmetic. Use these methods in priority order.

## 1. Connectors + `matchTo()` — default for mating interfaces

Define connectors on parts; `matchTo()` provides automatic 6-DOF alignment. The child translates and rotates so its connector aligns with the target's — origins coincide, axes oppose (plug-in model).

```javascript
const shelf = box(200, 120, 10).translate(0, 0, -5).withConnectors({
  left_tab: connector.male("dovetail", { origin: [-100, 0, 0], axis: [-1, 0, 0] }),
});
const panel = box(12, 120, 200).translate(0, 0, -100).withConnectors({
  shelf_0: connector.female("dovetail", { origin: [6, 0, -50], axis: [1, 0, 0] }),
});
const placed = shelf.matchTo(panel, "left_tab", "shelf_0");
// Dictionary form for multiple pairs on same target:
const placed2 = shelf.matchTo(panel, { left_tab: "shelf_0" });
// Named group children bubble connectors via dotted paths:
const cabinet = group({ name: "Left", shape: panel });
shelf.matchTo(cabinet, "left_tab", "Left.shelf_0");
```

**Why connectors first:** stable (don't shift on fillet/chamfer/boolean), semantic (carry type/gender), oriented (full frame), queryable (`shape.connectorDistance('a','b')`), explode-aware.

For a non-mechanism fixed-assembly example, see `examples/api/static-assembly-connectors.forge.js`.

## 2. `group()` — local coordinates for multi-part assemblies

The most common positioning bug: manually adding a parent's global offset to every sub-part. One wrong sign or forgotten variable and parts float into space. **Use `group()` to build parts in local coordinates (at the origin), then position the group once.**

```javascript
// BAD — every sub-part repeats the parent's global position
const unitY = -18, unitZ = 70;
const body = lib.roundedBox(100, 20, 32, 4).translate(0, unitY, unitZ);
const panel = box(98, 2, 18).translate(0, unitY - 12, unitZ + 4);
const louver = box(88, 2, 6).translate(0, unitY - 14, unitZ - 11);
const led = sphere(1.2).translate(35, unitY - 12, unitZ + 9);

// GOOD — build at local origin, group, translate once
const body = lib.roundedBox(100, 20, 32, 4);
const panel = box(98, 2, 18).translate(0, -12, 4);        // relative to local origin
const louver = box(88, 2, 6).translate(0, -14, -11);      // relative to local origin
const led = sphere(1.2).translate(35, -12, 9);             // relative to local origin
const indoorUnit = group(
  { name: 'Body', shape: body },
  { name: 'Panel', shape: panel },
  { name: 'Louver', shape: louver },
  { name: 'LED', shape: led },
).translate(0, -18, 70);  // ONE translate for the whole assembly
```

**Groups nest.** Build sub-assemblies as groups, then group those into larger assemblies — each level has its own local origin.

```javascript
const fan = group(hub, ...blades).translate(0, 25, 0);  // fan assembly
const outdoorUnit = group(
  { name: 'Body', shape: casing },
  { name: 'Fan', shape: fan },             // already a group
  { name: 'Grille', shape: grille },
).translate(0, 23, -42);                    // position the whole outdoor unit
```

**When to use something else:** `group()` preserves individual shapes — you can't boolean (subtract/intersect) a group. If a sub-part needs a boolean with the parent body, do that boolean first in local coordinates, then group the result.

## 3. `pointAlong()` — orient cylinders before positioning

```javascript
// BAD
const pipe = cylinder(100, 5).rotateX(90).translate(x, y, z);
// GOOD — reads as "pipe pointing along Y"
const pipe = cylinder(100, 5).pointAlong([0, 1, 0]).translate(x, y, z);
```

**Always call `pointAlong()` BEFORE `matchTo()` or `translate()`** — it reorients around the origin.

## 4. `attachTo()` — quick bounding-box positioning

```javascript
const column = cylinder(50, 8).attachTo(base, 'top', 'bottom');
```

`child.attachTo(parent, parentAnchor, selfAnchor, offset)`. Anchor points shift on fillet/chamfer/boolean — fragile for assembly interfaces, fine for quick prototyping.

## 5. `rotateAroundTo()` — aim a point around a hinge/axis

```javascript
const aimed = arm.rotateAroundTo([0, 0, 1], [0, 0, 0], "tip", [30, 30, 20]);
// Exact line solve:
const lineHit = arm.rotateAroundTo([0, 0, 1], [0, 0, 0], "tip", [30, 30, 0], { mode: 'line' });
```

## 6. `moveToLocal()` — offset from another shape's min corner

```javascript
const part = box(20, 20, 30).moveToLocal(base, 10, 10, 10);
```

## 7. `translate()` — for simple offsets or bridging computed locations

```javascript
const pipeLen = bb2.min[1] - bb1.max[1];
const pipe = cylinder(pipeLen, 5).pointAlong([0, 1, 0]).translate(40, (bb1.max[1] + bb2.min[1]) / 2, bb1.min[2] + 15);
```

## 8. `placeReference()` — align any anchor to a world coordinate

Place a shape so a named anchor point lands exactly where you want it. Accepts all built-in anchors (`'bottom'`, `'center'`, `'top-front-left'`, etc.) plus custom references from `withReferences()`.

```javascript
// Ground a shape — bottom face center at Z = 0
const grounded = shape.placeReference('bottom', [0, 0, 0])

// Center at the world origin
const centered = shape.placeReference('center', [0, 0, 0])

// Align left edge to X = 10
const aligned = shape.placeReference('left', [10, 0, 0])
```

Also works with custom placement references for cross-file parts:

```javascript
// widget.forge.js — define once
return union(base, post).withReferences({ points: { mount: [0, -16, -4] } });

// importer — consume
const widget = require("./widget.forge.js").placeReference("mount", [120, 40, 0]);
```

For cross-file parts needing proper alignment, prefer connectors over placement references.

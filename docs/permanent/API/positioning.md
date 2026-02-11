# Positioning Strategy

**This is the most important page for building multi-part assemblies.** Most positioning bugs come from manual coordinate arithmetic. Use the methods below in priority order.

## Priority Order

### 1. `attachTo()` — Default choice for child-on-parent positioning

When placing a part relative to another part, use `attachTo()`. It reads as English: "put my bottom on your top."

```javascript
const base = box(100, 100, 10);

// Column stands on top of base, centered
const column = cylinder(50, 8).attachTo(base, 'top', 'bottom');

// Button sticks out from front face, near top-right corner
const button = box(10, 4, 6, true)
  .attachTo(panel, 'top-front-right', 'top-back-right', [5, -2, -10]);
```

**How to read it:** `child.attachTo(parent, parentAnchor, selfAnchor, offset)`
- `parentAnchor` = "where on the parent do I want to attach?"
- `selfAnchor` = "which part of myself aligns to that point?"
- `offset` = "then shift by this much" (optional)

**Common patterns:**
| Intent | parentAnchor | selfAnchor | Why |
|--------|-------------|------------|-----|
| Stack on top | `'top'` | `'bottom'` | Bottom of child meets top of parent |
| Hang below | `'bottom'` | `'top'` | Top of child meets bottom of parent |
| Stick out from front | `'front'` | `'back'` | Back of child flush with front of parent |
| Protrude from side | `'left'` | `'right'` | Right face of child meets left face of parent |

### 2. `pointAlong()` — Orient cylinders/extrusions before positioning

Cylinders default to Z-up. Instead of `rotate(90, 0, 0)` (which is confusing), use `pointAlong()`:

```javascript
// Pipe running along Y axis
const pipe = cylinder(100, 5).pointAlong([0, 1, 0]);

// Axle along X
const axle = cylinder(80, 3).pointAlong([1, 0, 0]);
```

**Always call `pointAlong()` BEFORE `attachTo()` or `translate()`** — it reorients around the origin.

```javascript
// Correct: orient first, then position
const grille = cylinder(4, 30)
  .pointAlong([0, 1, 0])
  .attachTo(outdoorUnit, 'back', 'front', [0, 2, 0]);
```

### 3. `moveToLocal()` — Position relative to another shape's corner

When you need to place something at a specific offset from another shape's bounding box origin (min corner):

```javascript
const base = box(100, 100, 10);
const part = box(20, 20, 30).moveToLocal(base, 10, 10, 10);
```

### 4. `translate()` — Only for simple offsets or connecting independently-positioned parts

Use `translate()` when:
- Moving a shape by a known fixed amount
- Positioning between two shapes whose locations you've already computed via `boundingBox()`

```javascript
// Pipe spanning between two independently-positioned units
const bb1 = indoor.boundingBox();
const bb2 = outdoor.boundingBox();
const pipeLen = bb2.min[1] - bb1.max[1];
const pipe = cylinder(pipeLen, 5)
  .pointAlong([0, 1, 0])
  .translate(40, (bb1.max[1] + bb2.min[1]) / 2, bb1.min[2] + 15);
```

## Common Mistakes

### ❌ Manual center-offset math
```javascript
// BAD: easy to get wrong, hard to read
const child = box(w, d, h, true)
  .translate(0, -parentThickness/2 - d/2 - 5, parentHeight/2 - h/2 - 20);
```

### ✅ Anchor-based positioning
```javascript
// GOOD: intent is clear, no arithmetic
const child = box(w, d, h, true)
  .attachTo(parent, 'top-front', 'top-back', [0, -5, -20]);
```

### ❌ rotate() for cylinder orientation
```javascript
// BAD: which axis? what happens to center?
const pipe = cylinder(100, 5).rotate(90, 0, 0).translate(x, y, z);
```

### ✅ pointAlong() for cylinder orientation
```javascript
// GOOD: reads as "pipe pointing along Y"
const pipe = cylinder(100, 5).pointAlong([0, 1, 0]).translate(x, y, z);
```

## Anchor Reference

See the [main API doc](API.md#3d-anchor-positioning) for the full list of 26 anchor names. Quick mental model:

- **1 word** = face center: `'top'`, `'front'`, `'left'`...
- **2 words** = edge midpoint: `'top-front'`, `'back-left'`...
- **3 words** = corner: `'top-front-left'`, `'bottom-back-right'`...

# ForgeCAD 2D Sketch Primitives — Vision

## The Problem

Simple shapes like an L-bracket with an angled hook should take 30 seconds, not hours of debugging angle math. The current path builder requires tracing both inner and outer edges manually — fragile, error-prone, and doesn't parametrically adapt.

## How Fusion 360 Does It

In Fusion 360, you'd model the headphone hanger like this:
1. Draw a polyline (centerline): horizontal plate → vertical arm → angled hook
2. Use "Offset" to give it uniform thickness
3. Or: draw 3 rectangles, position them, fillet the joints

The key insight: **you describe the skeleton, not the outline**.

## What We Need

### Tier 1: Stroke (highest impact, solves 80% of bracket/frame shapes)

```javascript
// Draw the centerline, then thicken it
const hanger = stroke(
  [[0, 0], [50, 0],    // plate centerline
   [50, -70],           // arm
   [40, -85]],          // hook
  4                     // thickness
);
```

Under the hood: create a rectangle for each segment, union them all. Joints are automatically filled by the union. Optional: round joints via offset.

This is the single most impactful primitive we're missing. It turns a 20-line path trace into a 1-liner.

### Tier 1b: Stroke with path builder syntax

```javascript
const hanger = path()
  .moveTo(0, 0)
  .lineH(50)
  .lineV(-70)
  .lineAngled(20, 235)
  .stroke(4);           // instead of .close()
```

### Tier 2: Fillet & Chamfer on 2D sketches

```javascript
const profile = stroke([[0,0], [50,0], [50,-70], [40,-85]], 4);
const rounded = profile.fillet(3);    // round all convex corners
const chamfered = profile.chamfer(2); // 45° cut on all corners
```

Fusion 360's fillet/chamfer is per-vertex. For code-first CAD, "fillet all" with optional vertex selection is the right default.

Implementation: offset negative then positive (for rounding convex), or custom vertex manipulation.

### Tier 3: Patterns & Arrays

```javascript
// Linear pattern
const holes = circle2d(3).array(5, [15, 0]);  // 5 copies, 15mm apart

// Circular pattern
const bolts = circle2d(2).polarArray(6, 20);   // 6 copies at radius 20

// Mirror
const half = stroke(...);
const full = half.add(half.mirror([1, 0]));
```

### Tier 4: Constraints (long-term)

Real constraint solvers (tangent, coincident, perpendicular) are complex. But we can add simple declarative helpers:

```javascript
// Align
sketch.alignTo(other, 'center-x');  // align X centers
sketch.alignTo(other, 'bottom');    // align bottom edges

// Distribute
distributeH([a, b, c], spacing);    // equal horizontal spacing
```

## Priority Order

| # | Feature | Impact | Effort | Example |
|---|---------|--------|--------|---------|
| 1 | `stroke()` | Huge — solves brackets, frames, pipes | Small | L-bracket, hanger, shelf bracket |
| 2 | `path().stroke(t)` | Huge — fluent API for stroke | Tiny (builds on stroke) | Same as above but cleaner |
| 3 | `fillet()` / `chamfer()` | High — every real part needs rounded edges | Medium | Any manufactured part |
| 4 | `.array()` / `.polarArray()` | Medium — hole patterns, bolt circles | Small | Mounting plates, flanges |
| 5 | `alignTo()` / `distribute()` | Medium — positioning without math | Small | Assemblies, multi-part sketches |
| 6 | Constraint solver | Low priority — complex, diminishing returns in code-first | Large | Over-constrained sketches |

## Headphone Hanger With Stroke

```javascript
const plateW = param("Plate Width", 50);
const t = param("Thickness", 4);
const armLen = param("Arm Length", 70);
const hookLen = param("Hook Length", 20);
const hookAngle = param("Hook Angle", 35);

return path()
  .moveTo(0, 0)
  .lineH(plateW)
  .lineV(-armLen)
  .lineAngled(hookLen, 270 - hookAngle)
  .stroke(t);
```

5 lines. No angle math. No winding issues. Fully parametric.

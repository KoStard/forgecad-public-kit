# Ideal CAD API for Simple Shapes

## The Problem
Current headphone hanger sketch requires either:
- 8-point polygon with manual coordinate math
- Union of 3 rectangles with transforms

Both obscure the design intent: "L-shaped bracket with angled hook"

## What's Missing

### 1. Path/Polyline Builder (Most Natural)
```javascript
const profile = path()
  .moveTo(0, 0)
  .lineH(plateW)           // horizontal line
  .lineV(-t)               // vertical down
  .lineH(-(plateW - t))    // back left
  .lineV(-armLen)          // arm down
  .lineAngled(hookLen, hookAngle)  // hook at angle
  .lineV(t)                // thickness inward
  .lineAngled(-hookLen, hookAngle) // back along hook
  .lineV(armLen)           // back up arm
  .close();                // close to start
```

**Why better:** Traces the outline like drawing. Relative moves. No coordinate math.

### 2. Sketch Constraints (CAD-native)
```javascript
const profile = sketch()
  .rect(plateW, t)                    // plate at origin
  .rect(t, armLen).below().alignLeft() // arm attached below
  .rect(t, hookLen).below().rotate(hookAngle).alignLeft(); // hook
```

**Why better:** Declarative relationships. "Below" and "alignLeft" handle positioning.

### 3. Offset Contours (For Constant-Thickness Shapes)
```javascript
// Centerline of the hanger
const centerline = path()
  .moveTo(plateW/2, 0)
  .lineV(-armLen)
  .lineAngled(hookLen, hookAngle);

const profile = centerline.offset(t/2);
```

**Why better:** Thickness is a single parameter. Centerline is the design intent.

### 4. Composite Primitives
```javascript
const profile = lShape(plateW, t, armLen, t)
  .addHook(hookLen, hookAngle, t);
```

**Why better:** Domain-specific. "L-shape" and "hook" are named concepts.

### 5. Sketch Operations (Like Inkscape/Illustrator)
```javascript
const plate = rect(plateW, t);
const arm = rect(t, armLen).attachTo(plate, 'bottom-left');
const hook = rect(t, hookLen).rotate(hookAngle).attachTo(arm, 'bottom-left');

return union2d(plate, arm, hook);
```

**Why better:** `.attachTo(shape, anchor)` handles positioning. No manual translate math.

## Ranking by Implementation Effort

1. **Path builder** — ~50 lines, huge ergonomic win
2. **Offset contours** — Already have `.offset()`, just need path support
3. **Sketch operations** — Need anchor point system
4. **Constraints** — Requires constraint solver
5. **Composite primitives** — Library of domain shapes

## Recommendation

Add **path builder** first. It's how humans think about 2D profiles:
- "Start here, go right, go down, angle this way..."
- Relative moves eliminate coordinate math
- Works for any profile, not just this one

The current polygon API forces you to think in absolute coordinates and compute every vertex. Path builder lets you think in steps.

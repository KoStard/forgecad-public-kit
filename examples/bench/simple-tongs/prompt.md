# Task: Simple Tongs

Build a pair of tongs (gripping tool).

## Requirements

The model must return an **assembly** with:

- Two arm parts named `ArmA` and `ArmB`
- A **revolute** joint named `pivot` connecting them
- The pivot axis should be along Z (vertical)
- Joint range must include at least 0 to 30 degrees

## Functional expectations

- **Gripping**: When closed (pivot = 0), the jaw ends of both arms should be close together (gap < 5mm) so the tongs can grip objects.
- **Opening**: When opened (pivot = 30), the jaw ends should be far enough apart (gap > 20mm) to accept objects.
- **Smooth motion**: No self-collision during the full 0-30 degree sweep.
- **Physical realizability**: The arms must be physically close at the pivot — the joint must be geometrically plausible, not just a kinematic abstraction.
- **Reasonable proportions**: Each arm should have meaningful geometry (volume > 1000 mm cubed), and the overall assembly should fit within a reasonable bounding box.

## API reference (subset)

```javascript
assembly(name)                                    // create assembly
  .addPart(name, shape, options)                  // add a part
  .addRevolute(name, parent, child, options)       // add revolute joint
  .solve(state)                                    // solve at joint values

box(x, y, z)                                      // box primitive
cylinder(height, radius)                           // cylinder primitive
Transform.identity().translate(x, y, z)           // transform for joint frame
```

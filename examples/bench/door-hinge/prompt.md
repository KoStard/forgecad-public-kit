# Task: Door Hinge

Build a simple door hinge mechanism.

## Requirements

Return an **assembly** with:
- Two plate parts named `Frame` and `Door`
- A **revolute** joint named `hinge` connecting them
- The hinge axis should be along Z (vertical)
- Joint range: at least 0 to 90 degrees

## Functional expectations

- **Closed position (0 deg)**: Both plates should be roughly coplanar (in the same XY plane region)
- **Open position (90 deg)**: The Door plate should be perpendicular to the Frame plate
- **No collision** during the full 0-90 degree sweep
- **Physical realizability**: Both plates must have geometry near the hinge axis
- **Reasonable proportions**: Each plate should be at least 40mm in its longest dimension

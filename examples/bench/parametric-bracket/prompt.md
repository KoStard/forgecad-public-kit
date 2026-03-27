# Task: Parametric L-Bracket

Build an L-shaped mounting bracket that works for different bolt sizes.

## Requirements

Return a single **Shape** (not an assembly). The script receives a parameter:

```javascript
const boltDiam = param("Bolt Diameter", 5, { min: 3, max: 10 });
```

The bracket must:
- Be L-shaped (two perpendicular flat plates joined at a right angle)
- Have a mounting hole in each plate, sized for the bolt (hole diameter = boltDiam + 0.5mm clearance)
- Wall thickness at least 2x the bolt diameter
- Each plate at least 3x the bolt diameter in width and height

## Functional expectations

- **L-shape**: The bounding box should have significant extent in at least 2 axes
- **Mounting holes**: The bracket volume should be LESS than a solid L of the same bounding box (material removed)
- **Scales correctly**: When boltDiam=3, the bracket is small. When boltDiam=10, it's larger. The volume should scale roughly with bolt size.
- **Reasonable proportions**: Not paper-thin, not a solid cube
- **Manifold**: The shape should not be empty

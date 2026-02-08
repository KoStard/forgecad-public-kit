# Project / Intersect with Plane → 2D Sketch

Create a feature that slices or projects a 3D shape onto a plane, producing a live 2D sketch that stays parametrically linked.

## Core Concept
A 2D sketch file that declares itself as a projection or intersection of a 3D shape at a given plane. When the upstream 3D parameters change, the 2D path regenerates automatically.

## Requirements

### Plane Definition
- Define a cutting/projection plane by origin + normal, or by picking a standard plane (XY, XZ, YZ) at an offset.
- Interactive plane positioning in the viewport (drag to move, handles to rotate).

### Intersection Mode
- Slice the 3D shape with the plane → produces a 2D cross-section contour.
- Output is a closed path (or multiple paths if the cross-section has islands/holes).

### Projection Mode
- Project the 3D shape silhouette onto the plane along the plane's normal.
- Output is the outer boundary of the projected shadow.

### Parametric Link
- The resulting 2D sketch stays connected to the source 3D shape and plane definition.
- When source parameters change → 2D path regenerates.
- The sketch file itself should encode the relationship, e.g.:
  ```javascript
  // This sketch is an intersection of "main" at plane Z=15
  const section = intersectWithPlane(mainShape, { origin: [0, 0, 15], normal: [0, 0, 1] });
  return section;
  ```

### 2D Editing
- After generation, the 2D sketch should be editable (add construction lines, dimensions, trim, extend).
- Edits layer on top of the generated base path — regeneration replaces the base but preserves user edits where possible (or flags conflicts).

### Output Uses
- Export as SVG / DXF for laser cutting or CNC.
- Use as a sketch input for further 3D operations (extrude the cross-section, etc.).

### Nice to Have
- Multiple simultaneous section planes with a "section view" panel.
- Hatch pattern fill for cross-section visualization.
- Animated sweep of the plane through the model to visualize internal structure.

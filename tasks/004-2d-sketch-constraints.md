# 2D Sketch Constraint System

Make 2D editing feel like real drafting — driven by geometric constraints and dimensions, not raw coordinate manipulation.

## Core Idea
When editing a 2D sketch, users think in terms of "these two lines are parallel", "this angle is 90°", "this length is 25mm". The sketch solver should take these declarations and figure out the coordinates.

## Requirements

### Geometric Constraints
- **Coincident** — two points share the same location
- **Horizontal / Vertical** — lock a line segment to H or V
- **Parallel** — two lines stay parallel
- **Perpendicular** — two lines meet at 90°
- **Tangent** — a line meets a curve smoothly
- **Equal length** — two segments maintain the same length
- **Symmetric** — points mirrored across an axis
- **Concentric** — two arcs/circles share a center
- **Collinear** — points lie on the same line
- **Fixed** — lock a point or entity in place

### Dimensional Constraints
- **Distance** — set length of a segment or distance between two points
- **Angle** — set angle between two lines
- **Radius / Diameter** — constrain arc or circle size
- **Horizontal / Vertical distance** — constrain delta-x or delta-y between points

### Constraint Solver
- Under-constrained sketch: remaining degrees of freedom are draggable.
- Fully constrained: sketch turns a different color (green convention) to signal "locked down".
- Over-constrained: highlight conflicting constraints in red, refuse to add the conflicting one.
- Solver runs in real-time as user drags geometry — other constrained entities follow.

### Visual Feedback
- Constraint icons on the sketch (small symbols for parallel, perpendicular, equal, etc.).
- Dimension labels editable inline — click a dimension, type a new value.
- Color coding: under-constrained (blue), fully constrained (green), over-constrained (red).
- Highlight which entities a constraint connects when hovering it.

### Interaction
- Select two lines → right-click → "Make Parallel" / "Make Perpendicular" / "Set Angle..."
- Click a segment → type a length to add a distance constraint.
- Drag a point — solver moves everything that's connected while respecting constraints.
- Delete a constraint to free up degrees of freedom.

### Construction Geometry
- Construction lines/circles (dashed) that help define constraints but don't appear in the final sketch.
- Centerlines, reference points.

### Nice to Have
- Auto-detect intent: if user draws a line nearly horizontal, offer to constrain it horizontal.
- Constraint list panel showing all active constraints with ability to edit/delete.
- Import constraints from DXF/SVG if they carry dimension info.
- Undo/redo that respects constraint history.

# Measure Tool Overhaul

Make the measure tool precise, intuitive, and CAD-grade.

## Current Problems
- Rotating the viewport registers as a click and places a marker — must distinguish between orbit gestures and intentional clicks.
- Markers are static once placed, no way to adjust.

## Requirements

### Input Handling Fix
- Distinguish between click (mousedown + mouseup with minimal movement) and orbit/drag (mousedown + significant movement + mouseup).
- Only place markers on intentional clicks, not on viewport rotation.

### Drag & Move
- Placed measurement points should be draggable.
- Click and drag an existing marker to reposition it.
- Visual feedback (highlight, cursor change) when hovering a draggable marker.

### Snap / Magnetic Behavior
- Snap to vertices — when cursor is near a mesh vertex, snap the marker to it.
- Snap to edges — snap to the nearest point on an edge.
- Snap to face centers / midpoints of edges.
- Visual indicator showing what the cursor is snapping to (vertex dot, edge highlight, etc.).
- Configurable snap distance threshold.

### Display
- Show distance value inline between the two points.
- Support multiple active measurements simultaneously.
- Clear all / clear individual measurements.

### Nice to Have
- Angle measurement (3-point).
- Cumulative path measurement (multi-point chain).
- Coordinate readout of each marker.

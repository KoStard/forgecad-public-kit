# Sketch Mode Overhaul — From MVP to Lovable Product

## Goal

Transform the sketch drawing mode from a bare-bones MVP (4 tools, no constraints, rough UX) into a professional-grade 2D sketch editor that competes with Fusion 360's sketching capabilities. Code remains the source of truth — all GUI actions generate readable ConstrainedSketchBuilder code.

## Current State (Baseline)

**What works:**
- 4 drawing tools: Point, Line, Rectangle, Circle
- Snap to existing points, axis alignment, grid snap
- Rubber-band preview for all tools
- Auto H/V constraint detection for lines
- Code generation and live re-evaluation
- Undo (last action)

**What's broken/missing:**
1. **Point markers are huge** — `circleGeometry args={[2, 16]}` uses 2mm world-space radius; looks enormous when zoomed in
2. **Escape exits draw mode** — should deactivate current tool first; second Escape should exit (with confirmation if work exists)
3. **No re-entry** — once you leave, can't continue drawing
4. **No constraint tools** — only auto-detected H/V; no way to manually add distance, parallel, perpendicular, tangent, etc.
5. **Tiny toolset** — missing arc, polyline, construction lines, trim, mirror, offset, ellipse, slot, polygon, spline, fillet/chamfer
6. **No dimension input** — can't type exact values during drawing
7. **No entity selection in draw mode** — needed for applying constraints to existing geometry
8. **No continuous drawing** — line tool requires re-clicking; no chain mode

## Architecture Summary

```
DrawToolbar.tsx  ─── tool selection, keyboard shortcuts, constraint palette
DrawCanvas.tsx   ─── Three.js hit plane, snap indicators, rubber-band preview, entity selection
drawStore.ts     ─── Zustand state: tools, pending clicks, snap, entity tracking
codegen.ts       ─── Statement generators → generateSketchCode() → file sync
```

All draw actions flow: user click → drawStore.handleClick() → create statements → syncCodeToFile() → execute().

## Progress Tracker

| # | Change | Scope | Status |
|---|--------|-------|--------|
| — | Baseline | — | 4 tools, broken UX |
| P1 | Zoom-independent point markers | DrawCanvas | DONE |
| P2 | Fix Escape behavior (deactivate tool → confirm exit) | DrawToolbar, drawStore | DONE |
| P3 | Constraint tools (15 types: horizontal, vertical, length, distance, angle, radius, parallel, perpendicular, coincident, tangent, equal, fixed, midpoint, symmetric, concentric) | DrawToolbar, drawStore, codegen, DrawCanvas | DONE |
| P4 | New drawing tools (arc, polyline, polygon + construction mode) | DrawToolbar, drawStore, codegen, DrawCanvas | DONE |
| P5 | Continuous line chain mode (polyline) | drawStore | DONE |
| P6 | Dimension input popup | DrawToolbar (inline) | DONE |
| P7 | Entity selection in draw mode (select tool + constraint click) | DrawCanvas, drawStore | DONE |
| P8 | Trim, extend, mirror, offset tools | — | FUTURE |
| P9 | General UX polish (sectioned toolbar, shortcut hints, status bar, exit dialog) | DrawToolbar | DONE |

## Implementation Phases

### Stream A: Core UX Fixes (P1, P2, P5)
- Zoom-independent markers using camera zoom
- Escape → deactivate tool first, then confirm exit if dirty
- Continuous line chain mode (click-click-click, double-click/Escape to finish)

### Stream B: Constraint System (P3, P6, P7)
- Entity selection mode (click to select points/lines/circles)
- Constraint palette with context-aware options
- Dimension input popup for numeric constraints
- 12+ constraint types matching ConstrainedSketchBuilder API

### Stream C: Extended Drawing Tools (P4)
- Arc (3-point and center+start+end)
- Polyline (multi-segment continuous path)
- Ellipse, Slot, Regular Polygon
- Construction line toggle

### Stream D: Advanced Edit Tools (P8)
- Trim (click segment between intersections to remove)
- Mirror (select entities + axis)
- Offset (select entity + distance)

### Stream E: UX Polish (P9)
- Improved toolbar layout with sections
- Better icons
- Keyboard shortcut overlay
- Status bar improvements
- Tool-specific cursor changes

## Experiment Log

(Updated as work progresses)

## Files Modified

| File | Purpose |
|------|---------|
| `src/components/DrawCanvas.tsx` | Hit plane, preview geometry, entity selection, zoom-independent rendering |
| `src/components/DrawToolbar.tsx` | Tool palette, constraint palette, keyboard shortcuts |
| `src/draw/drawStore.ts` | State management, all tool handlers, constraint application |
| `src/draw/codegen.ts` | Code generation for new entities and constraints |
| `src/components/DimensionInput.tsx` | NEW — popup for numeric constraint values |

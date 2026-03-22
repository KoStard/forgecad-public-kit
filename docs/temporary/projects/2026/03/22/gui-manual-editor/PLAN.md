# GUI Manual Editor — Architecture Exploration

## Goal

Design a GUI-based manual editor for ForgeCAD that lets human users draw geometry, apply constraints, and perform 3D operations visually — while keeping code as the source of truth. The GUI generates code that appends into the active file.

## Current State (Baseline)

ForgeCAD is **code-first**. Users write `.forge.js`/`.sketch.js` files in Monaco. The viewport is view-only with:
- Sketch entity selection/hover (nearest-entity detection via `findNearestSketchEntity()`)
- Constraint visualization (color-coded status, dimension annotations)
- 3D shape picking and face-level interaction
- No entity creation, no drawing, no interactive constraint placement

**What already exists that we can build on:**
- Three.js viewport with React Three Fiber + OrbitControls
- Sketch entity hover/selection with raycasting
- 39 constraint types with visual annotations
- ConstrainedSketchBuilder with clean, chainable API
- Web Worker execution pipeline (code → eval → geometry → render)
- Zustand store managing all UI state
- Surface/region detection via arrangement algorithm

## Core Design Decision: Append-Only Code Generation

**Why not bidirectional sync?** Bidirectional (GUI edits ↔ code edits) is an order-of-magnitude harder problem. It requires parsing arbitrary JS, maintaining AST ↔ GUI entity mapping, handling user-written logic/loops, etc. OpenSCAD tried and mostly failed. SolidWorks has bidirectional but no code at all.

**Append-only is the sweet spot:**
- User draws in GUI → system generates code → appends to file
- Code remains the canonical representation
- User can always hand-edit the generated code
- No need to parse/understand existing code
- Each GUI session produces a readable code block

This is similar to how Jupyter notebooks work: you can type code OR use widgets, and the result is always a cell of code.

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                    ForgeCAD App                          │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Monaco   │  │   Viewport   │  │   Mode Controller │  │
│  │  Editor   │  │  (Three.js)  │  │                   │  │
│  │           │  │              │  │  [Code] [Draw]    │  │
│  │  ← append │  │  ← interact │  │                   │  │
│  │           │  │              │  │  Tool palette:    │  │
│  │           │  │  click/drag  │  │  • Point          │  │
│  │           │  │  to create   │  │  • Line           │  │
│  │           │  │  entities    │  │  • Circle          │  │
│  │           │  │              │  │  • Arc             │  │
│  │           │  │  click to    │  │  • Rectangle       │  │
│  │           │  │  constrain   │  │  • Constraint...   │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │              Code Generator                       │    │
│  │  GUI Action → ConstrainedSketchBuilder API call   │    │
│  │  → formatted code string → append to editor       │    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Proposed Interaction Modes

### Mode 1: 2D Sketch Drawing (MVP)

User enters "Draw" mode on a sketch. The viewport switches to orthographic 2D view. A tool palette appears.

**Entity creation tools:**
| Tool | Interaction | Generated Code |
|------|-------------|----------------|
| Point | Click on canvas | `const p1 = sk.point(x, y)` |
| Line | Click start, click end | `const p1 = sk.point(x1,y1); const p2 = sk.point(x2,y2); const l1 = sk.line(p1, p2)` |
| Line (from existing) | Click existing point, click new | `const p2 = sk.point(x2,y2); const l1 = sk.line(p1, p2)` |
| Rectangle | Click corner, drag to opposite | `const rect = addGroupRect(sk, {x, y, width: w, height: h})` |
| Circle | Click center, drag radius | `const c1 = sk.point(cx,cy); const circ = sk.circle(c1, r)` |
| Arc | Click 3 points | `sk.arcByCenter(...)` |

**Constraint tools:**
| Tool | Interaction | Generated Code |
|------|-------------|----------------|
| Horizontal | Select line | `sk.horizontal(l1)` |
| Vertical | Select line | `sk.vertical(l1)` |
| Distance | Select 2 points, type value | `sk.distance(p1, p2, 25)` |
| Length | Select line, type value | `sk.length(l1, 50)` |
| Coincident | Click 2 points | `sk.coincident(p1, p2)` |
| Parallel | Select 2 lines | `sk.parallel(l1, l2)` |
| Perpendicular | Select 2 lines | `sk.perpendicular(l1, l2)` |
| Tangent | Select line + circle/arc | `sk.tangent(l1, c1)` |
| Equal | Select 2 lines | `sk.equal(l1, l2)` |
| Fixed | Select point | `sk.fixed(p1)` |

**Smart snapping:**
- Snap to existing points (coincident)
- Snap to horizontal/vertical from existing points
- Snap to midpoints, intersections
- Grid snap (optional)
- Snapping auto-generates constraint code (e.g., snapping to an existing point generates `sk.coincident(...)` instead of a new point)

### Mode 2: 3D Operations (Phase 2)

After a sketch is defined, user can:
- Select a sketch face → right-click → "Extrude" → drag or type height → generates `.extrude(height)`
- Select a sketch → "Revolve" → generates `.revolve(degrees)`
- Select edges → "Fillet" → generates fillet code

### Mode 3: Assembly (Phase 3)

- Drag parts into position
- Select faces → "Flush" / "Align" / "Concentric" → generates 3D constraint code

## Code Generation Strategy

### Session-Based Code Blocks

Each "Draw" session generates a cohesive code block:

```javascript
// --- GUI Draw Session (2026-03-22 14:30) ---
const sk = constrainedSketch((sk) => {
  const p1 = sk.point(0, 0);
  const p2 = sk.point(50, 0);
  const p3 = sk.point(50, 30);
  const p4 = sk.point(0, 30);
  const l1 = sk.line(p1, p2);
  const l2 = sk.line(p2, p3);
  const l3 = sk.line(p3, p4);
  const l4 = sk.line(p4, p1);
  sk.horizontal(l1);
  sk.horizontal(l3);
  sk.vertical(l2);
  sk.vertical(l4);
  sk.length(l1, 50);
  sk.length(l2, 30);
  sk.fixed(p1);
});
return sk.extrude(10);
```

### Variable Naming

- Auto-generate sequential names: `p1, p2, ...`, `l1, l2, ...`, `c1, c2, ...`
- User can rename in code after generation
- Track name → entity mapping during the session

### Incremental Append

As user draws, code appends incrementally:
1. User clicks to place a point → `const p1 = sk.point(12.5, 8.3);` appears in editor
2. User clicks another point → `const p2 = sk.point(40, 8.3);` appends
3. User connects them → `const l1 = sk.line(p1, p2);` appends
4. The sketch re-evaluates after each append (existing behavior)

This means the user sees the code grow in real-time and the viewport updates live.

## Technical Implementation Plan

### Phase 1: Infrastructure (2-3 days)

1. **Mode system**: Add `editorMode: 'code' | 'draw'` to forgeStore
2. **Tool palette component**: Floating toolbar when in draw mode
3. **Canvas click-to-world**: Convert mouse clicks to sketch-plane coordinates (already have raycasting infrastructure)
4. **Code insertion API**: Programmatically insert text at cursor/end of Monaco editor

### Phase 2: Point & Line Drawing (3-4 days)

1. **Point tool**: Click → create point, append code
2. **Line tool**: Click-click → create line between points, append code
3. **Snap engine**: Detect proximity to existing points/lines, generate constraints
4. **Visual feedback**: Preview line while drawing (rubber-band), snap indicators
5. **Undo**: Remove last appended code block (simple text deletion)

### Phase 3: Constraints (3-4 days)

1. **Constraint palette**: Show available constraints based on selection
2. **Smart constraint detection**: When user draws a nearly-horizontal line, offer to constrain it
3. **Dimension input**: Click constraint → popup for value entry
4. **Live solver feedback**: Show constraint status as user adds constraints

### Phase 4: More Entities (2-3 days)

1. **Rectangle tool**: Click-drag with live preview
2. **Circle tool**: Click-drag from center
3. **Arc tool**: Three-point arc creation
4. **Construction lines**: Toggle construction mode

### Phase 5: 3D Operations (3-4 days)

1. **Extrude**: Select sketch → drag height or type value
2. **Revolve**: Select sketch → choose axis → set angle
3. **Code generation for 3D ops**

## Key Design Questions to Resolve

### Q1: Where does the generated code go?

**Option A: Append to end of file** — simplest, but may break if file has a return statement
**Option B: Insert at cursor position** — flexible but user must position cursor
**Option C: Replace a marked region** — `// GUI-START` ... `// GUI-END` block that gets regenerated
**Option D: New code cell in notebook mode** — cleanest, each draw session = new cell

**Recommendation: Option D for notebooks, Option A for .forge.js files** (with smart detection of where to insert before `return`).

### Q2: Can user edit generated code and then continue drawing?

Yes — the system should re-evaluate the file after each edit, rebuild the entity map from the running sketch's state, and allow further GUI interaction. The mapping is: `variable name in code → entity ID in solved sketch`. This works because we can track which variable names map to which entities during evaluation.

### Q3: How to handle coordinate systems?

2D drawing should use the sketch plane's coordinate system. When the user clicks, we project the 3D click point onto the sketch plane. The existing `getSketchWorldMatrix()` provides the transform.

### Q4: Should snapping auto-generate constraints?

**Yes.** If a user draws a line and the endpoint snaps to an existing point, we should generate `sk.coincident(newPoint, existingPoint)` rather than creating a new point at the same coordinates. This matches how real CAD tools work.

### Q5: What about the path-building API (`moveTo`/`lineTo`)?

The path API is more concise for continuous outlines. We could detect when the user is drawing a continuous path and switch to `moveTo`/`lineTo` syntax. But for MVP, the explicit `point()`/`line()` API is clearer and easier to map GUI actions to.

## Competitive Analysis

| Tool | Approach | Code? | Bidirectional? |
|------|----------|-------|----------------|
| **SolidWorks** | Full GUI | No | N/A |
| **FreeCAD** | GUI + Python console | Yes (after) | No |
| **OpenSCAD** | Code only | Yes | N/A |
| **CadQuery** | Code + CQ-editor | Viewer only | No |
| **Onshape** | Full GUI | FeatureScript | Partial |
| **ForgeCAD (proposed)** | Code-first + GUI append | Yes (primary) | Append-only |

ForgeCAD's position is unique: code is always the source of truth, GUI is a convenient input method that generates code. This avoids the complexity of bidirectional sync while giving humans a familiar drawing experience.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Coordinate precision (floating point noise in generated code) | High | Low | Round to reasonable precision (e.g., 0.1mm) |
| Variable name collisions across sessions | Medium | Medium | Namespace per session or continue counter |
| User confusion about code vs draw mode | Medium | Medium | Clear mode indicator, smooth transitions |
| Performance with many entities | Low | Medium | Already handle complex sketches |
| Scope creep toward full bidirectional | High | High | Strict append-only discipline |

## Success Metrics

1. **User can draw a rectangle** with 4 lines, constrain dimensions, and extrude — entirely via GUI
2. **Generated code is readable** — a programmer would write similar code by hand
3. **Roundtrip works** — user can draw, edit code, draw more, without breaking
4. **No new bugs** in existing code-only workflow

## Experiment Log

### Experiment 0: Feasibility Check (PENDING)

**What**: Verify that we can programmatically insert code into Monaco, trigger re-evaluation, and map solved entities back to variable names.
**Why**: This is the critical path — if any of these three pieces don't work, the whole approach needs rethinking.
**Plan**:
1. Test Monaco API for programmatic text insertion
2. Test that inserted code triggers the eval worker
3. Test entity-to-variable-name mapping during evaluation

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/store/drawModeStore.ts` | Draw mode state (active tool, snap state, pending entity) |
| `src/components/DrawToolbar.tsx` | Tool palette component |
| `src/components/DrawCanvas.tsx` | Click handlers for draw mode (overlay on viewport) |
| `src/codegen/sketchCodegen.ts` | GUI action → code string generation |
| `src/codegen/snapEngine.ts` | Snap detection and constraint inference |
| `src/components/Viewport.tsx` | Add draw-mode interaction handlers |
| `src/components/CodeEditor.tsx` | Add programmatic text insertion API |
| `src/store/forgeStore.ts` | Add editorMode state |

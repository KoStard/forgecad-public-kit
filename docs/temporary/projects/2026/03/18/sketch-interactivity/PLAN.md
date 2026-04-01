# 2D Sketch Interactivity Overhaul

## Goal

Transform the 2D sketch editor from a "flat dump of geometry" into an interactive, navigable workspace on par with the 3D viewer's UX. Users working on complex constrained sketches should be able to:
- Instantly identify what each surface region represents and where it came from
- Select, hover, and highlight individual sketch entities and surfaces
- Show/hide layers of sketch content (construction, constraints, surfaces, individual entities)
- Get rich contextual info about any element on hover or click
- Navigate complex sketches without getting lost

## Current State (Baseline)

### What exists today

| Feature | 3D Viewer | 2D Sketch |
|---------|-----------|-----------|
| **Selection** | Single + multi-focus with dimming | Single constraint only |
| **Hover feedback** | Tooltip with object name + highlight | Nearest-entity detection (no visual feedback) |
| **Entity highlight** | Yellow highlight on constraint selection | Yellow highlight on constraint selection |
| **Surface identification** | Face names + transformation history | Color-coded fills, index + area in sidebar |
| **Visibility control** | Per-object checkbox + opacity slider | None for individual entities |
| **Tree structure** | Hierarchical object tree + construction tree | Flat constraint list |
| **Context menu** | Right-click with face info, visibility | None |
| **Info panel** | Entity properties popup on click | Basic entity info (length/radius) |
| **Layers** | N/A | No concept of layers |
| **Surface hover** | Face name on hover | Nothing — can't tell surfaces apart visually |

### Pain points (from user)
1. "I don't even know which surface came from where" — surfaces are colored but not labeled in the viewport
2. No hide/show for sketch elements — everything rendered at once
3. No highlight of selected/hovered surface
4. No good interactivity on sketch entities
5. Complex sketches become a visual soup with no navigation aids

## Architecture Summary

- **Rendering**: Three.js via React Three Fiber in `Viewport.tsx` (~4700 lines)
- **Sketch data**: `SketchConstraintMeta` from constraint solver, consumed in `SketchObject` function
- **State**: Zustand store in `forgeStore.ts` — has `selectedConstraintId`, `hoveredObjectId`, etc.
- **Panel**: `ViewPanel.tsx` — constraints section shows flat list + surfaces list
- **Entity types**: lines, circles, arcs, points (with IDs), plus construction variants
- **Surfaces**: Detected via arrangement/DCEL, rendered as semi-transparent ShapeGeometry fills

## Proposed Improvements

### P1: Surface Interactivity (Highest Impact)

**Problem**: Surfaces are colored but not identifiable — you can't hover, click, or understand what a surface is.

**Changes**:
1. **Surface hover highlight**: When mouse enters a surface fill, brighten its opacity from 0.15 → 0.45 and show a tooltip with `[index] area` info
2. **Surface click selection**: Click a surface to select it — show a bright outline, display its properties in the sidebar (area, centroid, bounding box, seed point, which edges bound it)
3. **Surface labels in viewport**: Render small index labels at each surface centroid (toggleable)
4. **Surface → edge tracing**: When a surface is selected, highlight the edges that form its boundary

**Implementation approach**:
- Enable raycasting on surface fill meshes (currently `raycast={() => null}`)
- Add `hoveredSurfaceIndex` and `selectedSurfaceIndex` to store
- On hover: increase opacity + show Html tooltip at centroid
- On click: set selectedSurfaceIndex, highlight boundary edges
- Surface polygon data already includes vertices — can derive boundary edge IDs by matching against edge geometry

### P2: Entity Hover & Selection

**Problem**: Entities can be hovered (nearest-entity detection exists) but there's no visual feedback — no highlight, no tooltip.

**Changes**:
1. **Hover highlight**: When `hoveredEntity` is set, render that entity with a brighter/thicker line (glow effect or color change to cyan `#4aa3ff`)
2. **Hover tooltip**: Show entity type + key property (e.g., "Line L1 — 25.4mm", "Circle C3 — r=10mm") near the cursor
3. **Click to select entity**: Click an entity to select it — show its full properties in a panel, list all constraints that reference it
4. **Multi-select**: Shift+click to select multiple entities — useful for understanding constraint groups

**Implementation approach**:
- `hoveredEntity` state already exists (`SketchHoveredEntity`) — extend to include entity ID
- Render a second "highlight" line/circle on top of hovered entity with higher z-offset and distinct color
- Add `selectedSketchEntityIds: Set<string>` to store
- In sidebar: show selected entity properties + linked constraints

### P3: Sketch Element Tree (Sidebar)

**Problem**: The sidebar shows a flat constraint list but no structured view of sketch geometry.

**Changes**:
1. **Sketch Element Tree**: Collapsible tree showing:
   - **Edges** (lines, circles, arcs) — with visibility toggles
   - **Points** — grouped or shown count
   - **Construction** — separate group with toggle
   - **Surfaces** — clickable list with color swatches
   - **Constraints** — existing list (already works)
2. **Visibility toggles**: Per-element-type and per-entity hide/show
3. **Selection sync**: Click in tree → highlight in viewport and vice versa
4. **DOF indicator per entity**: Show which entities still have free degrees of freedom

**Implementation approach**:
- New `SketchTreePanel` component (or section within ViewPanel)
- Store: `sketchVisibility: { construction: boolean, surfaces: boolean, constraintLabels: boolean, hiddenEntityIds: Set<string> }`
- Tree data derived from `constraintMeta.edges`, `constraintMeta.construction`, `constraintMeta.surfaces`

### P4: Layer System / Display Modes

**Problem**: Everything renders at once — on complex sketches, it's visual overload.

**Changes**:
1. **Toggle layers**: Construction geometry, constraint labels, surface fills, points, dimension annotations
2. **Opacity per layer**: Not just on/off but adjustable opacity
3. **"Focus mode"**: Select an entity/surface → dim everything else (like 3D focus mode)
4. **Constraint filter**: Show only conflicting/redundant constraints, or filter by type

**Implementation approach**:
- Extend the Display section in ViewPanel with layer toggles
- Add `sketchDisplayLayers` to store
- In SketchObject rendering, conditionally skip layers based on visibility state
- Focus mode: when entity selected, reduce opacity of non-related geometry to 0.15

### P5: Context Menu & Advanced Info

**Problem**: No right-click menu, no way to discover actions or get detailed info.

**Changes**:
1. **Right-click on entity**: Show menu with "Select", "Hide", "Show constraints", "Focus"
2. **Right-click on surface**: "Select", "Copy seed point", "Show boundary edges", "Use as extrude profile"
3. **Right-click on constraint**: "Edit value", "Delete", "Show entities"
4. **Keyboard shortcuts**: `H` to hide selected, `Shift+H` to show all, `F` to focus

## Progress Tracker

| # | Change | Metric | Status |
|---|--------|--------|--------|
| -- | Baseline (current) | No surface hover, no entity highlight, no hide/show, flat sidebar | Measured |
| P1 | Surface interactivity | Surfaces hoverable, clickable, labeled at centroids | Done |
| P2 | Entity hover & selection | Hover tooltip + color, click selection, related constraints | Done |
| P3 | Sketch element tree | Structured sidebar with edges/points/construction + entity selection | Done |
| P4 | Layer system | Toggle/dim sketch layers independently | Planned |
| P5 | Context menu | Right-click actions on entities/surfaces/constraints | Planned |

## Experiment Log

#### P1: Surface Interactivity (DONE)
**What**: Added `pointInPolygon` + `findHoveredSurface` helpers. Surface fills now respond to hover (opacity 0.15→0.35) and selection (0.45). Centroid labels show `S{idx} {area}mm²` at each surface. Sidebar surfaces are clickable with expanded detail (centroid, bounds, seed).
**Result**: Surfaces are fully interactive — hover, click, visual feedback, and sidebar sync.
**Key files**: Viewport.tsx (SketchObject), ViewPanel.tsx, forgeStore.ts

#### P2: Entity Hover & Selection (DONE)
**What**: Extended `SketchHoveredEntity` type to carry entity ID. Entity edges/points change color on hover (#7ec8ff) and selection (#4aa3ff). Hover shows tooltip with entity ID + measurement. Click selects entity — sidebar shows constraints referencing it. Entity info popup now shows entity ID and related constraints.
**Result**: Full entity interactivity with bidirectional sidebar sync.
**Key files**: Viewport.tsx (findNearestSketchEntity, SketchObject, entity info panel), ViewPanel.tsx, forgeStore.ts

#### P3: Sketch Element Tree (DONE)
**What**: Added "Sketch Geometry" section in ViewPanel above Constraints. Shows Edges (lines, circles, arcs with measurements), Points (with coords), and Construction elements. Each item is clickable to select, syncing with viewport highlight.
**Result**: Structured navigation of all sketch elements from the sidebar.
**Key files**: ViewPanel.tsx

## Files to Modify

| File | Purpose |
|------|---------|
| `src/components/Viewport.tsx` | SketchObject rendering — hover, selection, highlight, surface interactivity |
| `src/components/ViewPanel.tsx` | Sketch sidebar — element tree, visibility toggles, entity properties |
| `src/store/forgeStore.ts` | New state: selectedSurfaceIndex, selectedSketchEntityIds, sketchVisibility, etc. |
| `src/forge/sketch/constraints/types.ts` | Possibly extend SurfaceDisplay with boundary edge IDs |

## Key Decisions

1. **Surface boundary edges**: The `SurfaceDisplay` already has polygon vertices — we can match these back to edge IDs by comparing endpoints. Alternatively, extend the arrangement detection to output edge IDs directly (cleaner but more invasive).

2. **Entity ID on hover**: The current `SketchHoveredEntity` type stores geometry (a/b coords) but not the entity ID. Need to extend `findNearestSketchEntity` to also return the matched entity ID for proper highlight/selection.

3. **Performance**: Complex sketches could have 100+ entities. Using Html overlays (React Three Fiber `<Html>`) for every point is already done — need to ensure hover/selection doesn't add expensive per-frame work. Keep highlight geometry in a single instanced mesh if needed.

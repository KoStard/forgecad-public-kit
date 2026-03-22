# Sketch Mode UX — Investigation & Fixes

## Goal
Fix 10 sketch mode issues spanning rendering z-order, interaction, side panel UX, cache, and developer API.

## Architecture Summary

**Rendering stack** (Viewport.tsx, ~5700 lines):
- Sketch is rendered via `<SketchObject>` inside a Three.js scene
- Z-layer ordering: surface fills (z=-0.01) → edges (z=0) → points (z=0.05) → annotations (z=0.08) → labels (z=0.12)
- Two dimension systems: `DimensionAnnotation` (from `dim()` API) and constraint annotations (from solver)
- Click detection via `findNearestSketchEntity()` on a fill mesh or transparent hit plane

**Side panel** (ViewPanel.tsx, ~1270 lines):
- Lists: Edges (id + measurement), Points (id + coords), Construction, Constraints (editable values), Surfaces
- No collapsible sections, no hide/show toggles

**Cache** (forgeStore.ts):
- Module-level LRU Map (max 8 entries), keyed by `filePath::backend`
- Invalidates on code/params/quality/backend change
- NOT persisted — browser refresh destroys it

## Issues & Plan

### Issue 1: Dimension z-order — dims appear under surfaces
**Root cause**: `DimensionAnnotation` renders lines/arrows at z=0 with default depthTest/depthWrite. Surface fills at z=-0.01 with `depthWrite: false`. Three.js transparent object sorting can cause incorrect layering.
**Fix**: Add `renderOrder`, `depthTest: false`, `depthWrite: false` to all DimensionAnnotation elements. Similarly ensure constraint annotation lines/triangles have higher renderOrder than surface fills.

### Issue 2: No surface hide/show toggle
**Root cause**: No toggle exists in the store or UI.
**Fix**: Add `surfacesVisible` boolean to forgeStore. Add toggle button in ViewPanel surfaces section. Conditionally render surface fills in Viewport.

### Issue 3: Refresh destroys render — cache not persisted
**Root cause**: `runResultCache` is a module-level `Map` — lost on page refresh.
**Fix**: Persist cache to `sessionStorage` (simpler). Fall back to IndexedDB only if size limits become an issue.

### Issue 4: Clicking outside border edges doesn't work
**Root cause**: Click detection requires ray-mesh intersection. When `fillGeo` exists, clicks outside the fill shape don't hit any mesh. The transparent hit plane (2000x2000) only renders when `!fillGeo`. The `hitPlaneBounds` mesh (line 2525) has no click handler.
**Fix**: Always render a transparent hit plane with the same pointer handlers as the fill mesh, behind the fill, so clicks near border edges are detected even outside the fill geometry.

### Issue 5: File naming — .sketch.js vs .forge.js
**Decision**: Unify to `.forge.js`. The sketch vs. forge distinction is an internal concern, not a file type concern. Rename all `.sketch.js` files and update detection logic in forgeStore.ts.

### Issue 6: Edge names are indescriptive in side panel
**Root cause**: Edges use auto-generated IDs like `L0`, `L1`, `C0`. These are meaningless to the user.
**Fix**: Two-pronged: (1) Support optional `name` param on edges (e.g., `line(p1, p2, { name: 'top-edge' })`). (2) Auto-name edges from higher-level constructs (e.g., `rect()` → `rect-top`, `rect-bottom`, `rect-left`, `rect-right`). Show name if available, fall back to ID. Separate named edges from auto-named ones.

### Issue 7: Point coordinates not useful in side panel
**Root cause**: Points listed as `P0 (12.5, 34.7)` — coordinates are noise for most users.
**Fix**: Remove coordinate display from the default point listing. Show coords only when a point is selected/expanded.

### Issue 8: Constraints shouldn't be manually editable + sections not collapsible
**Root cause**: Constraint values have `<input type="number">` allowing manual edits. No collapsible sections exist.
**Fix**: Remove editable input from constraints. Add collapsible section headers for Edges, Points, Construction, Constraints, Surfaces.

### Issue 9: Dims go inside the body instead of outside
**Root cause**: `DimensionAnnotation` hardcodes offset direction: X-aligned → −Y, Y-aligned → −X. This doesn't consider body geometry — works for bottom/left edges but goes inside for top/right edges. Constraint annotation dims use small fixed offsets (0 or 3) with perpendicular computed as `(-dy, dx) * offset` — direction depends on edge winding.
**Fix**: For `DimensionAnnotation`: compute body centroid from sketch geometry, push offset away from centroid. For constraint annotations: detect which side has more "body" and flip offset sign if needed.

### Issue 10: Add programmatic highlight API for debugging
**Root cause**: No API exists to highlight arbitrary edges/surfaces/objects from code.
**Fix**: Add `highlight(entityId, options?)` function to the sketch API. Store highlighted entities in sketchMeta. Render with distinctive styling (glow, color override). Support 3D objects too via a global highlight store.

## Progress Tracker

| # | Issue | Status |
|---|-------|--------|
| — | Baseline | Current state documented |
| 1 | Dim z-order | Done — renderOrder + depthTest=false |
| 2 | Surface hide/show | Done — surfacesVisible toggle |
| 3 | Cache persistence | Done — sessionStorage with TypedArray conversion |
| 4 | Border edge click | Done — always render hit plane |
| 5 | File naming | Done — unified to .forge.js |
| 6 | Edge names | Done — optional name + rect auto-naming |
| 7 | Point coords | Done — show only when selected |
| 8 | Constraints + collapsible | Done — read-only + CollapsibleSection |
| 9 | Dims inside body | Done — centroid-based outward flip |
| 10 | Highlight API | Done — highlight() with color/label/pulse |

## Work Streams

**Stream A — Rendering fixes** (Viewport.tsx): Issues 1, 4, 9
**Stream B — Side panel UX** (ViewPanel.tsx): Issues 2, 6, 7, 8
**Stream C — Cache persistence** (forgeStore.ts): Issue 3
**Stream D — Highlight API** (sketch API + Viewport + store): Issue 10
**Stream E — File naming** (forgeStore.ts + examples): Issue 5

## Files Modified

| File | Purpose |
|------|---------|
| `src/components/Viewport.tsx` | Rendering: z-order, hit planes, dim placement, highlights |
| `src/components/ViewPanel.tsx` | Side panel: collapsible, hide/show, edge names, point coords, constraints |
| `src/store/forgeStore.ts` | Cache persistence, surface visibility toggle, highlight store |
| `src/forge/sketch/dimensions.ts` | Dim offset direction improvement |
| `src/forge/sketch/constraints/types.ts` | Edge name field, highlight metadata |
| `src/forge/sketch/constraints/defs/*.ts` | Constraint annotation offset improvements |

# Interactive Section Explorer

## Goal

Add an interactive clipping plane gizmo to the ForgeCAD 3D viewer that lets users explore model interiors by dragging a plane through the scene — no code changes, no recompilation, instant GPU clipping.

## Architecture

### Key Insight
GPU fragment clipping is essentially free — it's a shader `discard`. The expensive CPU boolean trimming (for hatched section surfaces) is skipped for the interactive plane. The section explorer uses GPU-only clipping for instant drag feedback.

### Design

**"Section Explorer"** in the View Panel:
1. Toggle enables a translucent clipping plane in the viewport
2. PivotControls gizmo lets users drag (translate) and rotate the plane freely
3. Quick axis-preset buttons (X/Y/Z) reset the plane to an axis-aligned orientation
4. Flip checkbox reverses which side gets clipped

### State Architecture

Store state in `forgeStore.ts`:
- `sectionExplorerEnabled: boolean` — feature toggle
- `sectionExplorerNormal: [number, number, number]` — plane orientation
- `sectionExplorerOffset: number` — distance from origin along normal
- `sectionExplorerFlip: boolean` — reverse clip direction
- `sectionExplorerResetKey: number` — bumped by axis-preset buttons to remount the gizmo

Persisted to localStorage via `ViewPreferencesState`.

### Component Architecture

```
Viewport.tsx
├── ClippingManager (existing — activated when any planes are active)
├── SectionExplorerGizmo (NEW)
│   ├── PivotControls from @react-three/drei
│   ├── Translucent plane mesh + border + normal arrow
│   └── onDrag → updates store normal/offset
├── ForgeObject (existing — receives merged clipping planes)
│   ├── CPU trimming: script-defined planes only (no explorer)
│   └── GPU clipping: ALL planes including explorer (always applied)
└── ViewPanel (existing — added Section Explorer controls)
```

### Integration Points

1. **useViewportState.ts** — merges explorer plane into `activeCutPlaneDefs` as `__section_explorer__`
2. **objectCutPlanesById** — excludes explorer (no CPU trimming for smooth drag)
3. **objectClippingPlanesById** — includes explorer (GPU clipping is instant)
4. **ForgeObject.tsx** — always applies GPU clipping planes (not just on CPU fallback)
5. **SectionPlaneGuides** — explorer plane filtered out (gizmo IS the visual)

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| 1 | Store state + ViewPreferences | Done |
| 2 | SectionExplorerGizmo component | Done |
| 3 | ViewPanel controls (toggle, axis presets, flip) | Done |
| 4 | Integration with clipping pipeline | Done |
| 5 | ForgeObject: GPU clipping always-on | Done |

## Files Modified

| File | Change |
|------|--------|
| `src/store/executionHelpers.ts` | Added section explorer fields to `ViewPreferencesState` |
| `src/store/forgeStore.ts` | Added section explorer state, setters, and `resetSectionExplorerPlane` |
| `src/components/viewport/SectionExplorerGizmo.tsx` | **NEW** — PivotControls gizmo |
| `src/components/viewport/useViewportState.ts` | Merge explorer into active planes, separate CPU/GPU plane lists |
| `src/components/viewport/useViewPanelState.ts` | Expose section explorer state to ViewPanel |
| `src/components/ViewPanel.tsx` | Section Explorer UI section |
| `src/components/Viewport.tsx` | Render SectionExplorerGizmo, filter explorer from guides |
| `src/components/viewport/ForgeObject.tsx` | Always apply GPU clipping (not just on CPU fallback) |

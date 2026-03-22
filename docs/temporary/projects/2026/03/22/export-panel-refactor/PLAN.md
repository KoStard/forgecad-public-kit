# Export Panel Refactor — Investigation & Implementation Plan

## Goal

Refactor the export panel from a single monolithic dialog into a clean, context-aware export experience:

1. **Separate 2D and 3D export panels** — sketch-only scenes get a dedicated 2D panel; 3D scenes get a dedicated 3D panel
2. **Add new 3D formats** — OBJ (mesh), STEP/BREP (exact via OCCT WASM, no Python)
3. **3MF quality choices always visible** — don't hide quality behind format selection
4. **Clean up format presentation** — organized by category (mesh vs exact geometry)
5. **Remove format clutter** — present formats clearly with purpose descriptions

## Current State (Baseline)

### Export Panel (`ExportPanel.tsx`, 516 lines)
- Single monolithic component for everything
- Format selector: 3MF / STL radio buttons
- Quality selector: Default / Live / High (always visible, good)
- Filename input
- Orbit GIF section (3D only)
- Report PDF section (3D only)
- 2D Sketch section: SVG / DXF / PDF buttons (only when `hasSketches`)
- **Problem**: When viewing a sketch, ALL 3D sections still render (disabled). Messy.

### Export Actions (`exportActions.ts`, 243 lines)
- `MeshExportFormat = '3mf' | 'stl'` — needs OBJ, STEP, BREP
- `exportMeshFromStore()` — drives 3MF/STL
- `exportSketchFromStore()` — drives SVG/DXF/PDF
- No STEP/BREP browser export (only via Python CLI)

### Export Mesh (`exportMesh.ts`, 311 lines)
- `build3mfBlob()` / `buildBinaryStl()` — pure implementations
- No OBJ builder yet

### OCCT STEP Export Capability
- **Proven in test** (`test-occt.mjs` P8): `STEPControl_Writer_1` → 32.8KB STEP in 81ms
- OCCT shapes accessible via `OCCTShapeBackend.shape` (TopoDS_Shape)
- WASM virtual FS for file I/O: `oc.FS.readFile()`
- **No BREP writer tested yet** but `BRepTools.Write()` should work the same way

## Architecture Summary

```
ExportPanel.tsx (UI)
  ├── exportActions.ts (orchestration: store access, quality re-run, download trigger)
  │     ├── exportMesh.ts (3MF, STL builders — pure mesh → bytes)
  │     ├── exportSvg.ts / exportDxf.ts / exportSketchPdf.ts (2D sketch → bytes)
  │     └── [NEW] exportStep.ts / exportBrep.ts / exportObj.ts
  └── forgeStore (state: result, activeFile, objectSettings)
```

**Key insight**: OCCT shapes are available at runtime when `activeBackend === 'occt'`. The `OCCTShapeBackend.shape` property gives the raw `TopoDS_Shape` needed for `STEPControl_Writer`. For Manifold backend, STEP/BREP export is unavailable (mesh-only formats work).

## Progress Tracker

| # | Change | Files | Status |
|---|--------|-------|--------|
| — | Baseline (current state documented) | — | ✅ |
| P1 | Add OBJ mesh builder | `exportMesh.ts` | ✅ |
| P2 | Add browser-native STEP exporter | `exportStep.ts` (new) | ✅ |
| P3 | Add browser-native BREP exporter | `exportBrepNative.ts` (new) | ✅ |
| P4 | Split ExportPanel into 2D/3D subcomponents | `ExportPanel.tsx` + `Export3DPanel.tsx` + `ExportSketchPanel.tsx` | ✅ |
| P5 | Add OBJ/STEP/BREP to export actions + UI | `exportActions.ts`, panel components | ✅ |
| P6 | Quality selector always visible for mesh formats | `Export3DPanel.tsx` | ✅ |
| P7 | Type-check + build verification | — | ✅ (only pre-existing solver-wasm error) |
| P8 | Fix UI GIF export quality | `Viewport.tsx` | ✅ (960px, 2x pixelRatio, 24fps, 72 frames) |
| P9 | Sketch PDF auto font scaling | `exportSketchPdf.ts` | ✅ (auto-scale from bounds, configurable) |

## Implementation Plan

### Phase 1: New Export Formats (P1–P3) — Independent, parallelizable

**P1: OBJ Builder** (`exportMesh.ts`)
- Add `buildObjString(objects: MeshExportObject[]): string`
- Wavefront OBJ: `v x y z`, `vn nx ny nz`, `f v//vn` per triangle
- Per-object `g objectName` groups
- Optional `.mtl` file for colors (or vertex colors)
- Simple format, ~50 lines

**P2: Browser STEP Export** (new `src/forge/exportStep.ts`)
- Import `initOCCT` and `OCCTShapeBackend`
- `buildStepBlob(objects: {name: string, shape: OCCTShapeBackend, color?: string}[]): Promise<Blob>`
- Use `STEPControl_Writer_1` → `Transfer` → `Write` to virtual FS → `oc.FS.readFile()` → Blob
- Only available when shapes are OCCT-backed

**P3: Browser BREP Export** (new `src/forge/exportBrep.ts` or combined)
- `BRepTools.Write()` to virtual FS → read → Blob
- Simpler than STEP (no assembly/color), single compound shape

### Phase 2: UI Refactor (P4–P6) — Sequential, depends on Phase 1

**P4: Split Panel**
- `Export3DPanel` — mesh formats (3MF, STL, OBJ) + exact formats (STEP, BREP) + quality + GIF + Report
- `ExportSketchPanel` — SVG, DXF, PDF
- `ExportPanel` becomes a thin wrapper that renders the right panel based on scene content
- When both exist, show tabs or sections

**P5: Wire new formats into actions + UI**
- Extend `MeshExportFormat` to include `'obj'`
- Add new `ExactExportFormat = 'step' | 'brep'`
- New `exportExactFromStore()` in exportActions
- UI: two sections in 3D panel — "Mesh Formats" and "Exact Geometry"
- STEP/BREP buttons disabled with explanation when backend !== 'occt'

**P6: Quality always visible**
- Quality selector sits at the top of 3D panel, applies to all mesh exports
- Exact formats (STEP/BREP) don't need quality (they export exact B-rep)

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/exportMesh.ts` | Add OBJ builder |
| `src/forge/exportStep.ts` (new) | Browser-native STEP export via OCCT WASM |
| `src/forge/exportBrep.ts` (new) | Browser-native BREP export via OCCT WASM |
| `src/components/ExportPanel.tsx` | Refactor into wrapper + subcomponents |
| `src/components/Export3DPanel.tsx` (new) | 3D export panel |
| `src/components/ExportSketchPanel.tsx` (new) | 2D sketch export panel |
| `src/components/exportActions.ts` | Add OBJ, STEP, BREP export orchestration |

## Experiment Log

(Will be populated as experiments run)

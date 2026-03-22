# Mobile Frontend for ForgeCAD

## Goal & Current State

**Goal**: Create a lightweight, mobile-first frontend that works on phones/tablets without crashing. Automatically detect mobile devices and serve this simplified UI.

**Current state**: ForgeCAD crashes on mobile devices — likely due to memory pressure from loading both WASM backends (~16MB combined), Monaco editor, and the full desktop UI simultaneously. No responsive design exists. The desktop UI has three side-by-side panels (file explorer, code editor, 3D viewport) that don't collapse on small screens.

**Key constraints from user**:
1. Code and model are never visible simultaneously — tab/toggle between them
2. Model viewer is passive: rotate, zoom, pan only (no face selection, measurements, context menus)
3. Load only Manifold backend (skip OCCT ~13MB WASM)
4. Exports limited to mesh formats (3MF, STL, OBJ) — no STEP/BREP

## Architecture Summary

### Current Desktop Architecture
```
App.tsx
├── isEmbedMode() → EmbedViewer (viewport-only, loads both backends)
└── FullApp
    ├── Toolbar (share, github star, etc.)
    ├── FileExplorer (resizable panel)
    ├── CodeEditor (Monaco, resizable panel)
    └── ViewPanel (3D viewport + controls, resizable panel)

initKernel() → parallel: initManifoldWasm() + initOCCT()
evalWorker  → runs user scripts, serializes mesh to typed arrays
```

### Proposed Mobile Architecture
```
App.tsx
├── isEmbedMode() → EmbedViewer
├── isMobileDevice() → MobileApp (NEW)
└── FullApp (desktop, unchanged)

MobileApp
├── Top bar (file name, tab toggle)
├── Tab: Code (simple textarea or lightweight editor)
├── Tab: Model (passive Viewport — orbit/zoom only)
├── Bottom bar (Run, Export)

initKernelManifoldOnly() → initManifoldWasm() only (skip OCCT)
```

### Memory Savings Estimate
| Component | Desktop | Mobile |
|-----------|---------|--------|
| OCCT WASM | ~13MB | 0 (skipped) |
| Monaco Editor | ~5MB | 0 (use textarea or CodeMirror mobile) |
| Solver WASM | ~2MB | ~2MB (needed for sketches) |
| Manifold WASM | ~3MB | ~3MB |
| Three.js + R3F | ~1MB | ~1MB |
| **Total estimate** | ~24MB | ~6MB |

## Progress Tracker

| # | Change | What | Status |
|---|--------|------|--------|
| — | Baseline | Desktop app crashes on mobile | Measured |
| M1 | Mobile detection + routing | `isMobile` + query overrides → MobileApp | Done |
| M2 | Manifold-only kernel init | `initKernelManifoldOnly()` skips OCCT | Done |
| M3 | MobileApp shell | Tab-based UI (code vs model) + bottom bar | Done |
| M4 | Passive viewport | Orbit/zoom/pan only, no selection/measures | Done |
| M5 | Mobile code editor | Plain textarea, monospace, 0KB overhead | Done |
| M6 | Mobile export | 3MF/STL/OBJ via bottom sheet | Done |
| M7 | Mobile file picker | Bottom sheet file list | Done |
| M8 | Touch optimization | 44px targets, dvh, viewport-fit=cover, safe areas | Done |

## Experiment Log

### M1: Mobile Detection + Routing

**What**: Add `isMobile()` detection and route to `MobileApp` component in `App.tsx`.

**Approach**: Use a combination of:
- `navigator.maxTouchPoints > 0` + screen width < 768px (avoid false positives on laptops with touch)
- Allow `?mobile=1` query param to force mobile mode (for testing)
- Allow `?desktop=1` to force desktop mode (escape hatch)

**Files to modify**:
- `src/App.tsx` — add mobile routing
- `src/mobile/MobileApp.tsx` — new component (shell)
- `src/mobile/isMobile.ts` — detection utility

### M2: Manifold-Only Kernel Init

**What**: Create `initKernelManifoldOnly()` that skips OCCT.

**Approach**: The current `initKernel()` in `kernel.ts` does `Promise.all([initManifoldWasm(), initOCCT()])`. For mobile:
- Export a new function that only calls `initManifoldWasm()`
- Mobile worker should never import OCCT code paths
- This alone saves ~13MB memory + significant init time

**Files to modify**:
- `src/forge/kernel.ts` — add `initKernelManifoldOnly()`
- Mobile worker setup — only load manifold

### M3: MobileApp Shell

**What**: Tab-based mobile UI with code/model toggle.

**Design**:
```
┌─────────────────────────┐
│ [filename.forge.js]  ▼  │  ← top bar with file picker
├─────────────────────────┤
│                         │
│   [Code] or [Model]    │  ← full-screen content area
│                         │
│                         │
├─────────────────────────┤
│ [Code] [Model]  [▶ Run] │  ← bottom tab bar + run button
└─────────────────────────┘
```

- Two tabs: Code, Model
- Run button always visible in bottom bar
- When running: show spinner, auto-switch to Model tab on completion
- File picker: bottom sheet or simple dropdown

### M4: Passive Viewport

**What**: Simplified viewport — orbit, zoom, pan only.

**Strip out**:
- Face/edge/vertex selection (raycasting)
- Context menus
- Measurement tool
- GIF recording
- Performance monitor overlay
- Cut planes
- Joint animation controls
- Exploded view controls

**Keep**:
- OrbitControls with touch gestures (already configured)
- Grid
- Lighting/environment
- Basic mesh rendering
- Camera perspective/ortho toggle

### M5: Mobile Code Editor

**What**: Replace Monaco with a lightweight editor.

**Options** (in order of preference):
1. **Plain `<textarea>`** with monospace font — simplest, works everywhere, ~0KB
2. **CodeMirror 6** mobile mode — syntax highlighting, ~50KB, good mobile support
3. **Monaco** — too heavy (~5MB), poor mobile support

Start with `<textarea>` for M5, upgrade to CodeMirror later if needed.

### M6: Mobile Export

**What**: Mesh-only exports (3MF, STL, OBJ).

**Approach**: Reuse existing `exportMesh.ts` functions. No STEP/BREP since OCCT isn't loaded.
- Simple export button/menu in bottom bar or as a sheet
- Download triggers via the same `triggerDownload()` utility

### M7: Mobile File Browser

**What**: Simple file list for switching between files.

**Approach**: Bottom sheet or modal with flat file list. No drag-drop, no multi-select, no folder creation. Just tap to open.

### M8: Touch Optimization

**What**: Ensure touch targets are ≥44px, viewport fills screen, no accidental gestures.

## Files Modified

| File | Purpose |
|------|---------|
| `src/App.tsx` | Add mobile detection + routing |
| `src/mobile/MobileApp.tsx` | New: mobile app shell |
| `src/mobile/MobileViewport.tsx` | New: passive 3D viewport |
| `src/mobile/MobileCodeEditor.tsx` | New: lightweight code editor |
| `src/mobile/MobileExport.tsx` | New: mesh export UI |
| `src/mobile/MobileFilePicker.tsx` | New: simple file picker |
| `src/mobile/isMobile.ts` | New: mobile detection |
| `src/mobile/mobile.css` | New: mobile-specific styles |
| `src/forge/kernel.ts` | Add `initKernelManifoldOnly()` |

## Design Decisions

### Why not responsive CSS on the existing UI?
The desktop UI is fundamentally wrong for mobile — three side-by-side panels, Monaco editor, complex interactions. Making it "responsive" would mean maintaining two layouts in one codebase with increasing complexity. A separate, simple mobile app component is cleaner and lighter.

### Why skip OCCT entirely (not lazy-load)?
OCCT is ~13MB WASM. Even lazy-loaded, it would crash many phones when eventually loaded. The mobile use case is "view and share models" — mesh exports (3MF/STL/OBJ) are sufficient. Users needing STEP/BREP can use desktop.

### Why textarea over CodeMirror initially?
Zero bundle cost, works perfectly on mobile keyboards, and for the "view/tweak a parameter" use case it's sufficient. Can upgrade later if users want syntax highlighting.

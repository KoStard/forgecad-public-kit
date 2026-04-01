# Clean Code Audit — ForgeCAD

**Date**: 2026-03-24
**Goal**: Identify structural problems, design a multi-agent refactoring strategy, and define enforceable standards.

---

## Current State (Baseline)

| Metric | Value |
|--------|-------|
| Total source files | 287 |
| Total lines of code | 76,742 |
| Files > 1000 lines | 20 (7%) |
| Files 500–1000 lines | 18 (6%) |
| Files in `src/forge/` root (flat) | **82 files**, 35,526 lines |
| Files in `src/forge/sketch/` | 87 files |
| Files in `src/components/` | 49 files |
| Longest function (estimated) | **1,366 lines** — `builder.ts` (nearly the entire file) |

---

## Problem 1: Monster Files

20 files exceed 1,000 lines. The worst offenders:

| File | Lines | What it does |
|------|-------|-------------|
| `forge-api.d.ts` | 3,761 | Generated type declarations — acceptable |
| `library.ts` | 2,848 | All user-facing API functions (gears, fasteners, pipes, profiles, explode) |
| `report.ts` | 2,206 | Scene reporting / BOM / dimension layout / PDF rendering |
| `forgeStore.ts` | 1,973 | Zustand store — 9 state slices, 80+ actions |
| `runner.ts` | 1,757 | Script execution engine |
| `drawStore.ts` | 1,599 | 2D drawing store |
| `shapeFaces.ts` | 1,544 | Face query propagation through operations |
| `builder.ts` | 1,529 | Constrained sketch builder — 12 method categories, 80+ methods |
| `svgImport.ts` | 1,423 | SVG path parsing + import |
| `Viewport.tsx` | 1,421 | 3D viewport — 50+ store selectors |
| `ViewPanel.tsx` | 1,366 | Side panel UI — 75+ store selectors |
| `kernel.ts` | 1,382 | Shape kernel — **central hub**, imports from 17+ files, 20+ importers |
| `assembly.ts` | 1,209 | Assembly model logic |
| `compilePlan.ts` | 1,200 | Compile plan generation — **31+ importers** |
| `lower.ts` | 1,153 | OCCT lowering |
| `SketchObject.tsx` | 1,150 | Sketch rendering in viewport |
| `MeasureTool.tsx` | 1,103 | Measurement overlay |
| `sdfExport.ts` | 1,077 | SDF export — 95% code duplication with urdfExport.ts |
| `solver-wasm.ts` | 1,043 | Constraint solver |
| `edgeFeatureResolution.ts` | 942 | Edge feature resolution |

---

## Problem 2: Overcrowded Folders

| Folder | Files | Issue |
|--------|-------|-------|
| `src/forge/` (root, flat) | **82** | No grouping. Exports, compilation, query propagation, edge features, mesh, kernel — all siblings. |
| `src/forge/sketch/constraints/defs/` | 41 | One file per constraint def — fine (small, focused). |
| `src/forge/sketch/` | 31 | Mix of sketch operations, topology, export, SVG import |
| `src/components/` | 25 | Could use subdirectories for panels, toolbar, dialogs |
| `src/components/viewport/` | 24 | Already extracted from Viewport.tsx — reasonable |

---

## Problem 3: Long Methods

| Lines | Location | What |
|-------|----------|------|
| 1,366 | `builder.ts:43` | Entire `ConstrainedSketchBuilder` class |
| 552 | `kernel.ts:656` | Large kernel dispatch method |
| 492 | `shapeFaces.ts:939` | Face tracking through operations |
| 476 | `runner.ts:930` | Script execution logic |
| 455 | `assembly.ts:552` | Assembly resolution |
| 431 | `MeasureTool.tsx:469` | Measurement rendering |
| 401 | `gcode.ts:151` | G-code generation |

---

## Problem 4: Naming / Documentation Gaps

- `shapeFaces.ts` → really face *tracking* through operations
- `queryPropagation*.ts` (3 files) — unclear boundaries between them
- `sdfExport.ts` / `urdfExport.ts` — 95% duplicated code, shared XML utils copy-pasted
- Five `*CompilePlan.ts` files hint at missing abstraction

---

# Dependency Graph Analysis

## The Coupling Map

```
                    ┌──────────────────────────────────────────────┐
                    │              src/forge/  (82 files)          │
                    │                                              │
                    │   ┌─────────┐     ┌──────────────┐          │
                    │   │ kernel  │◄────│ compilePlan   │          │
                    │   │ (1382L) │     │ (1200L)       │          │
                    │   │ 17 in   │     │ 31 importers  │          │
                    │   │ 20+ out │     │               │          │
                    │   └────┬────┘     └──────┬───────┘          │
                    │        │                 │                   │
                    │   ┌────▼────┐    ┌───────▼──────┐           │
                    │   │ query   │    │ face-tracking │           │
                    │   │ cluster │    │ cluster       │           │
                    │   │ (4 files│    │ (4 files)     │           │
                    │   └────┬────┘    └──────┬────────┘          │
                    │        │                │                   │
                    │   ┌────▼────┐    ┌──────▼────────┐          │
                    │   │assembly │    │ edge-features  │          │
                    │   │ cluster │    │ cluster        │          │
                    │   │(6 files)│    │ (4 files)      │          │
                    │   └────┬────┘    └───────────────┘          │
                    │        │                                    │
                    │   ┌────▼────────────────────────┐           │
                    │   │       export cluster         │           │
                    │   │  (9 files, mostly leaf)      │           │
                    │   └─────────────────────────────┘           │
                    │                                              │
                    │   ┌──────────┐  ┌──────────┐  ┌─────────┐  │
                    │   │  mesh    │  │  scene   │  │ library │  │
                    │   │ (5 files)│  │ (4 files)│  │ (2848L) │  │
                    │   │ 0 internal│ │ 0 imports│  │ 7 groups│  │
                    │   └──────────┘  └──────────┘  └─────────┘  │
                    └──────────────────────────────────────────────┘
```

## Independence Ranking (most → least independent)

| Rank | Cluster | Files | Internal deps | Inbound deps | Verdict |
|------|---------|-------|---------------|-------------|---------|
| 1 | **Scene** | 4 | scene.ts + viewConfig.ts have **zero** forge imports | 3 importers | Trivially movable |
| 2 | **Mesh** | 5 | Zero internal cross-deps | 7 importers | Trivially movable |
| 3 | **Export** | 9 | gcode, exportStep, exportBrepNative have zero forge deps | Mostly leaf | Move all at once |
| 4 | **Assembly** | 6 | Clean internal chain, no circular deps | 10 importers | Self-contained subsystem |
| 5 | **Edge features** | 4 | Tight internal coupling (move together) | 5 importers | One-way dep on mesh |
| 6 | **Query** | 4 | Moderate coupling to compilePlan | 9 importers | Bridge layer |
| 7 | **Face tracking** | 4 | Heavy compilePlan + queryModel deps | 3 importers | Entangled with compile |
| 8 | **Compile** | 7 | **Hub** — 31+ importers of compilePlan.ts | Everything | Most entangled, move last |
| 9 | **Kernel** | 4 | **Central hub** — 17 inbound, 20+ outbound | Everything | The core, don't move far |

---

# Scaling Strategy: Multi-Agent Refactoring

## Core Principle: Worktree Isolation

Each agent works in a **git worktree** — an isolated copy of the repo. This means:
- No merge conflicts between concurrent agents
- Each agent produces a clean, independently-reviewable branch
- A project manager agent merges results sequentially

## Agent Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PROJECT MANAGER (PM)                       │
│  - Owns mainline branch                                      │
│  - Merges completed worktree branches in dependency order     │
│  - Runs `forgecad check suite` after each merge              │
│  - Resolves merge conflicts (rare due to independence)        │
└──────────┬──────────┬──────────┬──────────┬─────────────────┘
           │          │          │          │
     ┌─────▼──┐ ┌────▼───┐ ┌───▼────┐ ┌───▼────┐
     │Agent A │ │Agent B │ │Agent C │ │Agent D │
     │worktree│ │worktree│ │worktree│ │worktree│
     │export/ │ │mesh/   │ │assemb/ │ │scene/  │
     └────────┘ └────────┘ └────────┘ └────────┘
```

## What Each Agent Does (The Recipe)

Every file-move agent follows this **exact protocol**:

1. **Create target folder** with `index.ts` barrel
2. **Move files** with `git mv` (preserves history)
3. **Update barrel** — re-export all public symbols from `index.ts`
4. **Fix imports** — find every importer of moved files, update paths
5. **Run type-check** — `npx tsc --noEmit`
6. **Run check suite** — `node dist-cli/forgecad.js check suite`
7. **Commit** with descriptive message

Every file-split agent follows this protocol:

1. **Read the file** — identify natural boundaries
2. **Create sub-files** — extract functions/types with their helpers
3. **Create barrel** — `index.ts` re-exports everything (public API unchanged)
4. **Fix internal imports** — sub-files import shared types from siblings
5. **Fix external imports** — update importers to use barrel or direct sub-path
6. **Type-check + check suite**
7. **Commit**

---

# Execution Plan: 4 Waves

## Wave 1: Independent Leaf Clusters (Parallel — 4 agents)

These clusters have minimal coupling and can be moved simultaneously without conflicts.

### Agent 1A: `forge/export/`
**Files to move** (9):
- `gcode.ts` (zero forge deps — completely independent)
- `exportMesh.ts` (depends only on Shape type)
- `exportBrepNative.ts` (only OCCT backend init)
- `exportStep.ts` (only OCCT backend init)
- `brepExport.ts` (depends on compiledScene, kernel, runner types)
- `robotExport.ts` (depends on assembly types)
- `urdfExport.ts` (depends on assembly, exportMesh, meshInertia, robotExport, transform)
- `sdfExport.ts` (nearly identical to urdfExport — 95% shared code)
- `cuttingLayout.ts` (depends on pdfUtils, sheetStock)

**Also move** (supporting files):
- `pdfUtils.ts` (only used by cuttingLayout)
- `sheetStock.ts` (only used by cuttingLayout)

**Bonus cleanup**: Extract shared XML utils from sdfExport/urdfExport into `export/robotExportUtils.ts`

**Import updates needed**: `runner.ts`, `headless.ts`, `forge-public-api.ts`, `components/exportActions.ts`, `workers/evalWorker.ts`

**Estimated**: ~40 import path changes

### Agent 1B: `forge/mesh/`
**Files to move** (5):
- `meshEdgeExtraction.ts` (depends only on transform)
- `meshInertia.ts` (depends only on shapeBackend)
- `meshParsers.ts` (depends only on fflate)
- `meshToGeometry.ts` (depends on three, frozenShape, kernel)
- `geometryArrays.ts` (zero dependencies — pure math)

**Import updates needed**: `runner.ts`, `report.ts`, `sceneBuilder.ts`, `serializeRunResult.ts`, `sdfExport.ts`, `urdfExport.ts`, `edgeSegmentFeatures.ts`, `edgeQuery.ts`, `fillet.ts`

**Estimated**: ~12 import path changes

### Agent 1C: `forge/assembly/`
**Files to move** (6):
- `assembly.ts` (depends on kernel, constraints3d, placement, transform, group)
- `joint.ts` (depends on kernel, params)
- `jointAnimation.ts` (depends on jointsView)
- `jointsView.ts` (zero forge deps — pure definitions)
- `explodeCore.ts` (zero forge deps — pure utility)
- `explodeView.ts` (depends on explodeCore)

**Import updates needed**: `runner.ts`, `forge-public-api.ts`, `headless.ts`, `library.ts`, `urdfExport.ts`, `sdfExport.ts`, `robotExport.ts`

**Estimated**: ~15 import path changes

### Agent 1D: `forge/scene/`
**Files to move** (4):
- `scene.ts` (zero forge imports — pure config types)
- `viewConfig.ts` (zero forge imports — pure config types)
- `sceneBuilder.ts` (depends on scene, meshToGeometry)
- `compiledScene.ts` (depends on cadqueryPlan, compilerDiagnostics, compilerReport, kernel, runner)

**Import updates needed**: `runner.ts`, `headless.ts`, `forge-public-api.ts`, `brepExport.ts`

**Estimated**: ~10 import path changes

### Wave 1 Merge Order
```
PM merges: 1D (scene) → 1B (mesh) → 1C (assembly) → 1A (export)
```
Export last because it depends on mesh (meshInertia) and assembly (robotExport).

---

## Wave 2: Coupled Clusters (Parallel — 2 agents)

Requires Wave 1 complete (import paths settled).

### Agent 2A: `forge/edge-features/`
**Files to move** (4):
- `edgeFeatureModel.ts` (depends on transform)
- `edgeFeatureResolution.ts` (depends on compilePlan, descendantResolution, queryModel, transform)
- `edgeSegmentFeatures.ts` (depends on mesh/meshEdgeExtraction, kernel, backends/manifold, transform)
- `edgeFeatures.ts` (depends on compilePlan, kernel, queryModel, queryPropagation)

**Cross-cluster dep**: `edgeSegmentFeatures → mesh/meshEdgeExtraction` (type-only, clean)

**Import updates needed**: `compilePlan.ts`, `compilePlanCadQuery.ts`, `descendantResolution.ts`, `runner.ts`, `forge-public-api.ts`, `fillet.ts`

**Estimated**: ~10 import path changes

### Agent 2B: `forge/query/`
**Files to move** (4):
- `queryPropagationCore.ts` (depends on queryModel — types only)
- `queryPropagation.ts` (depends on compilePlan, queryModel, shapeFaces, sketch/workplaneModel)
- `booleanQueryPropagation.ts` (depends on compilePlan, queryModel, queryPropagationCore)
- `edgeQuery.ts` (depends on kernel, mesh/meshEdgeExtraction, sketch/topology, transform)

**Import updates needed**: `kernel.ts`, `runner.ts`, `holeCut.ts`, `forge-public-api.ts`, `fillet.ts`, `edgeFeatures.ts`, `compilerReport.ts`

**Estimated**: ~12 import path changes

### Wave 2 Merge Order
```
PM merges: 2A (edge-features) → 2B (query)
```
Edge features first since query depends on edgeFeatures indirectly.

---

## Wave 3: File Splits (Parallel — 4 agents)

Now the folder structure is clean. Split the monster files.

### Agent 3A: Split `library.ts` → `forge/lib/`

**7 extraction targets** (from dependency analysis):

```
forge/lib/
├── index.ts              # barrel re-export (preserves public API)
├── basic-fasteners.ts    # boltHole, fastenerHole, counterbore, tube, pipe, hexNut,
│                         # roundedBox, bracket, holePattern + METRIC_HOLE_TABLE (140 lines)
├── tslot.ts              # tSlotProfile, tSlotExtrusion + helpers (170 lines)
├── profiles-2020.ts      # profile2020BSlot6Profile, profile2020BSlot6 + helpers (130 lines)
├── pipe-routing.ts       # pipeRoute, elbow + vector math helpers (350 lines)
├── explode.ts            # explode + bounds helpers (210 lines)
├── gears/
│   ├── index.ts          # barrel
│   ├── infrastructure.ts # GearMeta, GearKind, EPSILON, involuteFn, flankAngleAtRadius,
│   │                     # addArcPoints, attachGearMeta, readGearMeta (90 lines)
│   ├── spur.ts           # spurGear + normalizeSpurGearOptions, buildSpurGearProfile (170 lines)
│   ├── ring.ts           # ringGear + createRingSpaceSketch (160 lines)
│   ├── rack.ts           # rackGear (100 lines)
│   ├── side-face.ts      # sideGear, faceGear + helpers (130 lines)
│   ├── bevel.ts          # bevelGear + helpers (130 lines)
│   └── pairs/
│       ├── index.ts      # barrel
│       ├── spur-pair.ts  # gearPair (210 lines)
│       ├── bevel-pair.ts # bevelGearPair (245 lines)
│       ├── side-pair.ts  # sideGearPair (150 lines)
│       └── face-pair.ts  # faceGearPair (140 lines)
└── fasteners/
    ├── index.ts          # barrel
    ├── thread.ts         # thread (55 lines)
    ├── bolt.ts           # bolt (42 lines)
    ├── nut.ts            # nut (50 lines)
    ├── washer.ts         # washer + WASHER_TABLE (50 lines)
    └── set.ts            # fastenerSet + FastenerSetOptions (75 lines)
```

**Critical extraction order** (due to shared helpers):
1. `gears/infrastructure.ts` first (shared by all gears)
2. `gears/spur.ts` second (shared by side, face, bevel)
3. Everything else can be parallel

**Import updates**: `runner.ts`, `headless.ts`, `forge-public-api.ts` import the barrel

### Agent 3B: Split `report.ts` → `forge/report/`

```
forge/report/
├── index.ts               # barrel — single generateReportPdf export
├── types.ts               # ReportViewId, ReportObject, ViewFrame, etc. (177 lines)
├── mathUtils.ts           # Vec3/Vec2 primitives (80 lines)
├── bomProcessing.ts       # collectBomRows, splitBomRowsIntoPages (60 lines)
├── geometryCollection.ts  # collectShapeTriangles, collectShapeEdges (80 lines)
├── dimensionLayout.ts     # assignCrowdedDimensionColors, layoutDimensionLabels (600 lines — the complex core)
├── pdfRendering.ts        # renderViewCell, renderBomPage, buildPages (500 lines)
└── report.ts              # generateReportPdf orchestration (400 lines)
```

### Agent 3C: Split `forgeStore.ts` → `src/store/`

```
src/store/
├── index.ts               # combine all slices into useForgeStore
├── fileSlice.ts           # File management + save/load (500 lines)
├── executionSlice.ts      # Run results, caching, evaluation (800 lines)
├── viewSlice.ts           # Rendering, grid, camera prefs (250 lines)
├── objectSlice.ts         # Selection, visibility, focus (350 lines)
├── measureSlice.ts        # Measurement mode (150 lines)
├── uiSlice.ts             # Modals, navigation, theme (150 lines)
└── parameterSlice.ts      # Param overrides, joint animation (200 lines)
```

**Pattern**: Zustand slice pattern with `StateCreator<AllState, [], [], SliceState>`.

### Agent 3D: Split `builder.ts` → `forge/sketch/constraints/`

```
forge/sketch/constraints/
├── builder.ts             # Core: session, solve, entity registration (300 lines)
├── builder-path.ts        # Path fluent API: moveTo, lineTo, arcTo, bezier, close (200 lines)
├── builder-geometric.ts   # tangent, equal, coincident, concentric, collinear, etc. (200 lines)
├── builder-dimensional.ts # distance, length, angle, radius, diameter, etc. (150 lines)
├── builder-reference.ts   # Cross-sketch references, importPoint, importLine (100 lines)
├── builder-shapes.ts      # Shape/group definition, shapeWidth, shapeHeight (130 lines)
└── index.ts               # barrel re-exports ConstrainedSketchBuilder
```

**Pattern**: Mixin methods — already wired via `ConstraintBuilderMethods` interface.

### Wave 3 Merge Order
```
PM merges: 3D (builder) → 3B (report) → 3C (store) → 3A (library)
```
Builder first (least external impact). Library last (most touched by other files).

---

## Wave 4: Component Splits + Enforcement (Parallel — 3 agents)

### Agent 4A: Split `Viewport.tsx` + `ViewPanel.tsx`

**Viewport.tsx** (1,421 lines) → extract:
- `viewport/viewportSelectors.ts` — 50 store selectors + memos (150 lines)
- `viewport/viewportInteraction.ts` — context menu, face info, click handlers (200 lines)
- `viewport/viewportTransforms.ts` — matrix/bounds computations (100 lines)
- `Viewport.tsx` core — canvas + rendering loop (970 lines, focused)

**ViewPanel.tsx** (1,366 lines) → extract:
- `components/ObjectTree.tsx` — tree building + rendering (250 lines)
- `components/JointControls.tsx` — joint sliders + animation (180 lines)
- `components/ConstraintPanel.tsx` — sketch constraint editing (200 lines)
- `ViewPanel.tsx` core — scene export, layout orchestration (640 lines)

### Agent 4B: Long Method Decomposition

Target the top 5 god-methods:
- `kernel.ts:656` — 552-line method → extract named phases
- `shapeFaces.ts:939` — 492-line method → extract per-operation-type handlers
- `runner.ts:930` — 476-line method → extract parse/execute/postProcess phases
- `MeasureTool.tsx:469` — 431-line component → extract measurement renderers
- `assembly.ts:552` — 455-line method → extract resolution steps

### Agent 4C: Lint Rules + Enforcement

1. **Biome config** — add `complexity.maxFileLines: { warn: 500, error: 800 }`
2. **ESLint** — add `max-lines-per-function: [warn, { max: 80 }]`
3. **CLAUDE.md update** — add module boundary guidelines:
   ```
   ## Module Structure
   - New forge functionality goes in the appropriate domain folder
   - No new files directly in src/forge/ root
   - Each domain folder has an index.ts barrel
   - File limit: 500 lines soft, 800 hard
   - Function limit: 80 lines
   ```
4. **Folder READMEs** — one-paragraph description in each domain folder
5. **Pre-commit hook** — fail on files >800 lines (new files only, exclude existing)

---

## Encapsulation Rules (How Agents Stay Out of Each Other's Way)

### Rule 1: Barrel Isolation
Every new domain folder exposes a **single barrel `index.ts`**. External code imports from the barrel, never from internal files:
```ts
// GOOD — imports from barrel
import { buildBinaryStl } from './export';

// BAD — reaches into internal structure
import { buildBinaryStl } from './export/exportMesh';
```

This means Agent 1A (export) and Agent 1B (mesh) don't conflict — they each create their own barrel and consumers import from the barrel.

### Rule 2: No Shared File Edits Within a Wave
Within each wave, agents must not edit the same file. The file-move protocol naturally ensures this because:
- Each agent moves a **disjoint set of files**
- Import path updates touch different lines in shared consumers (e.g., `runner.ts`)

**Exception**: `runner.ts`, `headless.ts`, and `forge-public-api.ts` are imported by almost everything. Solution: the PM agent resolves import conflicts during sequential merge.

### Rule 3: Public API Never Changes
The barrel `index.ts` re-exports the exact same symbols. No renaming, no removed exports. From the consumer's perspective, `import { gcode } from './forge'` still works — the barrel chain handles the new paths internally.

### Rule 4: Type-Check Gate
Every agent runs `npx tsc --noEmit` before committing. If it fails, the agent fixes the issue. The PM runs `forgecad check suite` after each merge.

---

## Merge Strategy

```
Wave 1 (4 agents, parallel worktrees):
  scene ──merge──▶ mesh ──merge──▶ assembly ──merge──▶ export ──merge──▶ mainline
                                                                            │
Wave 2 (2 agents, parallel worktrees):                                      │
  edge-features ──merge──▶ query ──merge──────────────────────────────▶ mainline
                                                                            │
Wave 3 (4 agents, parallel worktrees):                                      │
  builder ──merge──▶ report ──merge──▶ store ──merge──▶ library ──merge──▶ mainline
                                                                            │
Wave 4 (3 agents, parallel worktrees):                                      │
  components ──merge──▶ methods ──merge──▶ lint-rules ──merge──────────▶ mainline
```

**Between waves**: PM rebases all Wave N+1 worktrees onto latest mainline, so agents in the next wave see the updated folder structure.

**Conflict resolution**: Since each agent touches a disjoint set of files, conflicts are limited to:
- `runner.ts` import lines (different lines, auto-resolvable)
- `headless.ts` re-exports (different lines, auto-resolvable)
- `forge-public-api.ts` re-exports (different lines, auto-resolvable)

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Import path conflicts in `runner.ts` | High | Low | PM merges sequentially; git auto-resolves different-line changes |
| Circular dependency introduced | Low | High | Each agent runs `madge --circular` before commit |
| Broken runtime (type-check passes but runtime fails) | Medium | High | `forgecad check suite` after every merge |
| Library.ts split breaks `forge-api.d.ts` generation | Medium | High | Run type declaration generation in Agent 3A's verification step |
| Store split breaks React component memos | Medium | High | Agent 3C must verify all useMemo/useCallback deps still work |
| Long methods extract changes behavior | Low | Medium | Extract as pure functions, preserve exact logic |

---

## Enforcement: Keeping It Clean After Refactoring

### Automated (CI / Pre-commit)

| Check | Tool | Threshold | Applies to |
|-------|------|-----------|-----------|
| File length | Biome `maxFileLines` | warn 500, error 800 | All `.ts`/`.tsx` |
| Function length | ESLint `max-lines-per-function` | warn 80 | All `.ts`/`.tsx` |
| Circular deps | `madge --circular` | 0 allowed | `src/forge/` |
| No flat forge files | Custom lint script | No new files in `src/forge/` root | Pre-commit hook |
| Import style | Biome `organizeImports` | Sorted, grouped | All `.ts`/`.tsx` |

### Structural (CLAUDE.md + Folder READMEs)

Each domain folder gets a one-paragraph `README.md`:
```markdown
# forge/export/
Export formats: G-code, STL, 3MF, OBJ, STEP, BREP, SDF, URDF, cutting layout PDF.
Add new export formats here. Each exporter is a standalone function that takes
a Shape/Assembly and returns bytes/string.
```

CLAUDE.md updated with:
```markdown
## Module Boundaries
- New forge functionality goes in the appropriate domain folder under src/forge/
- No new files directly in src/forge/ root (only runner.ts, index.ts, forge-api.d.ts)
- Each domain folder has an index.ts barrel — import from the barrel, not internal files
- File limit: 500 lines soft, 800 hard
- Function limit: 80 lines
```

### Cultural (PR Review Checklist)

- [ ] New file is in the correct domain folder
- [ ] No new files in `src/forge/` root
- [ ] File under 500 lines
- [ ] No function over 80 lines
- [ ] Imports use barrel paths

---

## Progress Tracker

| # | Change | Commit | Status |
|---|--------|--------|--------|
| — | Baseline audit + dependency analysis | — | ✅ |
| W1.D | Scene module (`forge/scene/`) | `98649de` | ✅ |
| W1.B | Mesh module (`forge/mesh/`) | `ab9ec3c` | ✅ |
| W1.C | Assembly module (`forge/assembly/`) | `588ae3a` | ✅ |
| W1.A | Export module (`forge/export/`) | `47bfa59` | ✅ |
| W2.A | Edge features module (`forge/edge-features/`) | `87b52ee` | ✅ |
| W2.B | Query module (`forge/query/`) | `54de2f4` | ✅ |
| W3.A | Split `library.ts` → `forge/lib/` | `c94a025` | ✅ |
| W3.B | Split `report.ts` → `forge/report/` | `21a67e2` | ✅ |
| W3.C | Split `forgeStore.ts` → action helpers | `7366ec8` | ✅ |
| W3.D | Split `builder.ts` → method modules | `401b6d6` | ✅ |
| W4.A | Split `gears.ts` → `forge/lib/gears/` | `ffe764f` | ✅ |
| W4.B | Split `runner.ts` → `forge/runner/` | `4e7a3b0` | ✅ |
| W4.C | Move face-tracking cluster | `964194a` | ✅ |
| W4.D | Extract more forgeStore helpers | `0709296` | ✅ |
| W5.A | Lint rules + enforcement | — | 🔲 |
| W5.B | Split Viewport.tsx + ViewPanel.tsx | — | 🔲 |

## Final Metrics (after 14 commits)

| Metric | Before | After |
|--------|--------|-------|
| Files in `src/forge/` root | 82 | 44 |
| Domain subfolders | 3 | **14** |
| `library.ts` | 2,848 lines | 11 lines (barrel) |
| `report.ts` | 2,206 lines | 6 lines (barrel) |
| `builder.ts` | 1,529 lines | 749 lines |
| `forgeStore.ts` | 1,973 lines | 1,317 lines |
| `gears.ts` | 1,514 lines | split into 8 files |
| New tsc errors introduced | — | **0** |

---

## Appendix: Detailed File → Folder Mapping

### After all waves complete, `src/forge/` becomes:

```
src/forge/
├── assembly/           # 6 files: assembly, joint, jointAnimation, jointsView, explodeCore, explodeView
├── backends/           # (unchanged) manifold/, occt/
├── compile/            # 7 files: compilePlan, compilePlanBrep, compilePlanCadQuery, holeCutCompilePlan,
│                       #          shellCompilePlan, compilerDiagnostics, compilerReport
├── constraints3d/      # (unchanged)
├── edge-features/      # 4 files: edgeFeatureModel, edgeFeatureResolution, edgeSegmentFeatures, edgeFeatures
├── export/             # 11 files: gcode, exportMesh, exportStep, exportBrepNative, brepExport, robotExport,
│                       #           urdfExport, sdfExport, cuttingLayout, pdfUtils, sheetStock, robotExportUtils
├── face-tracking/      # 4 files: shapeFaces, faceHistory, descendantResolution, repetitionOwnership
├── lib/                # library.ts split: basic-fasteners, tslot, profiles-2020, pipe-routing, explode,
│                       #                   gears/{infrastructure,spur,ring,rack,side-face,bevel,pairs/*},
│                       #                   fasteners/{thread,bolt,nut,washer,set}
├── mesh/               # 5 files: meshEdgeExtraction, meshInertia, meshParsers, meshToGeometry, geometryArrays
├── query/              # 4 files: queryPropagation, booleanQueryPropagation, queryPropagationCore, edgeQuery
├── report/             # 7 files: types, mathUtils, bomProcessing, geometryCollection, dimensionLayout,
│                       #          pdfRendering, report
├── scene/              # 4 files: scene, sceneBuilder, compiledScene, viewConfig
├── sketch/             # (unchanged)
│
├── runner.ts           # stays — top-level orchestrator
├── kernel.ts           # stays — central hub (split methods, not file)
├── forge-api.d.ts      # stays — generated
├── forge-public-api.ts # stays — re-exports
├── headless.ts         # stays — CLI entry
├── index.ts            # stays — barrel
│
│ # ~15 remaining small files that don't cluster:
├── anchors.ts, apiArgs.ts, brepPlan.ts, cadqueryPlan.ts,
├── cutPlane.ts, frozenShape.ts, frozenSketch.ts, group.ts,
├── holeCut.ts, fillet.ts, params.ts, placement.ts,
├── planeFrame.ts, quality.ts, queryModel.ts, section.ts,
├── serializeRunResult.ts, deserializeRunResult.ts,
├── shapeBackend.ts, profileBackend.ts, profileOps.ts,
├── transform.ts, units.ts, verification.ts
└── fonts/
```

**Result**: `src/forge/` root drops from **82 files → ~25 files** (plus 10 domain folders with barrels).

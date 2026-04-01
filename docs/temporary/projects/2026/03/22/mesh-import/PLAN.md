# Investigation: 3D File Import (STL / 3MF / STEP / OBJ) into ForgeCAD

## Goal

Enable importing external 3D files into ForgeCAD scripts so users can:
1. Load an existing mesh (STL, 3MF, OBJ) or CAD model (STEP)
2. Apply boolean operations (cut, union, intersect) with parametric ForgeCAD geometry
3. Color, transform, and export the result

**Inspiration**: Import an organic mesh (e.g. a sculpture), boolean-subtract a slat/grid pattern from it, assign colors to each piece, and export as multi-color 3MF for printing.

## Current State (Baseline)

| Capability | Status |
|-----------|--------|
| **STL export** | ✅ Binary STL with color (RGB555) |
| **3MF export** | ✅ ZIP-based with per-object color groups |
| **OBJ export** | ✅ Wavefront with normals |
| **STEP export** | ✅ Via OCCT STEPControl_Writer |
| **SVG import** (2D) | ✅ Full — profiles only |
| **importPart()** | ✅ Cross-file .forge.js import |
| **STL/3MF/OBJ import** | ❌ Not implemented |
| **STEP import** | ❌ Not implemented (OCCT has STEPControl_Reader available) |
| **Boolean ops** | ✅ union, difference, intersection via Manifold + OCCT |
| **Mesh → Manifold** | ✅ Internal `reconstructBackendFromMesh()` exists — not exposed |

## Architecture: Compile Plan IR + Backend Lowering

ForgeCAD has a **compiler architecture** with a backend-agnostic IR:

```
User Script (.forge.js)
        ↓
  kernel functions (box(), union(), etc.)
        ↓
  ShapeCompilePlan (IR tree)      ← backend-agnostic
        ↓
  buildShapeFromCompilePlan()
        ↓
  ┌─────────┴──────────┐
  │ if manifold:       │ if occt:
  │ lowerToManifold()  │ lowerToOCCT()
  │     → Manifold     │     → TopoDS_Shape
  └─────────┬──────────┘
        ↓
  ShapeBackend → Shape
```

### Design Principle: The IR Captures Intent, Not Resolved Data

**The compile plan IR describes *what to build*, not *the built result*.** Each node captures the minimum specification needed for any backend to produce the geometry independently.

Examples of this principle in existing nodes:
- `{ kind: 'box', x: 10, y: 20, z: 30 }` — not the 12 triangles of a box
- `{ kind: 'sphere', radius: 5 }` — not tessellated vertices
- `{ kind: 'extrude', profile, height: 10 }` — not the extruded mesh
- `{ kind: 'loft', profiles, heights }` — not the interpolated surface

The backend decides *how* to realize the intent. Manifold produces a mesh. OCCT produces a B-rep. Both start from the same compact specification.

**Putting resolved data (parsed triangles, tessellated geometry) into the IR violates this principle.** It makes the IR a data-blob carrier instead of an operation description. It also prevents backends from choosing their own optimal strategy — e.g., OCCT's own STL reader, or a future backend that handles meshes differently.

For imported files, the intent is: **"load this file."** The file path *is* the specification — just like `radius: 5` is the specification for a sphere.

### Why Not `opaque`

`opaque` wraps a pre-built `ShapeBackend` directly. It:
- Skips all lowering (both Manifold AND OCCT)
- Breaks cross-backend compilation (locked to whichever backend built it)
- Cannot be replayed, serialized, or optimized
- No topology tracking (face queries, edge queries all fail)

**We do NOT use `opaque` for mesh import.** We need proper IR nodes that each backend can lower independently.

---

## Design: File-Reference IR Nodes

### `importedMesh` — for STL, OBJ, 3MF

```typescript
// In compilePlan.ts — new ShapeCompilePlan variant:
| {
    kind: 'importedMesh';
    /** Resolved absolute path to the mesh file */
    filePath: string;
    /** Detected or explicit format */
    format: 'stl' | 'obj' | '3mf';
  }
```

Lightweight — just a path and format tag. The backend lowering phase handles:
1. Reading the file (binary I/O)
2. Parsing the format
3. Vertex welding / mesh repair
4. Constructing the native geometry

### `importedStep` — for STEP/IGES

```typescript
| {
    kind: 'importedStep';
    /** Resolved absolute path to the STEP file */
    filePath: string;
  }
```

Same principle. OCCT reads STEP natively via `STEPControl_Reader`. Manifold needs tessellation (cross-backend or throw unsupported).

### The Full Pipeline

```
                        ┌─────────────────────┐
                        │   .stl / .obj / .3mf │  (file on disk)
                        └─────────┬───────────┘
                                  ↓
                        ┌─────────────────────┐
                        │  importMesh()        │  (runner.ts)
                        │  Resolve path        │  No parsing here —
                        │  Detect format       │  just build the IR node
                        └─────────┬───────────┘
                                  ↓
                        ┌─────────────────────┐
                        │  ShapeCompilePlan    │  IR node:
                        │  kind:'importedMesh' │  { filePath, format }
                        │                      │  (lightweight intent)
                        └─────────┬───────────┘
                                  ↓
                  buildShapeFromCompilePlan()
                                  ↓
              ┌───────────────────┴───────────────────┐
              │                                       │
    ┌─────────────────┐                   ┌─────────────────────┐
    │ Manifold Lower  │                   │ OCCT Lower          │
    │                 │                   │                     │
    │ 1. Parse STL    │                   │ Not supported —     │
    │ 2. Weld verts   │                   │ throws clear error  │
    │ 3. new Mesh()   │                   │ directing user to   │
    │ 4. new Manifold │                   │ switch to Manifold  │
    │                 │                   │ backend.            │
    │ Full boolean    │                   │                     │
    │ support         │                   │ Future: could use   │
    └────────┬────────┘                   │ BRepBuilderAPI_     │
             │                            │ Sewing to create    │
             ↓                            │ B-rep from mesh.    │
         Manifold solid                   └─────────────────────┘
         (booleans, transforms,
          export all work)
```

### STEP Import Pipeline

```
                        ┌─────────────────────┐
                        │   .step / .stp       │  (file on disk)
                        └─────────┬───────────┘
                                  ↓
                        ┌─────────────────────┐
                        │  ShapeCompilePlan    │  { kind: 'importedStep',
                        │                      │    filePath }
                        └─────────┬───────────┘
                                  ↓
              ┌───────────────────┴───────────────────┐
              │                                       │
    ┌─────────────────┐                   ┌─────────────────────┐
    │ Manifold Lower  │                   │ OCCT Lower          │
    │                 │                   │                     │
    │ Needs OCCT to   │                   │ STEPControl_Reader  │
    │ tessellate →    │                   │ → TopoDS_Shape      │
    │ cross-backend   │                   │                     │
    │ or throw        │                   │ Native B-rep —      │
    │ unsupported     │                   │ full fidelity       │
    └─────────────────┘                   └─────────────────────┘
```

### Shared Parsing Utilities

Even though parsing happens in the backend, the actual STL/OBJ parsers are **shared utility code** — not backend-specific. The lowering function calls a shared parser, then feeds the result to the backend-specific constructor:

```typescript
// src/forge/meshParsers.ts — shared, no WASM dependency
export function parseStlBinary(data: ArrayBuffer): ParsedMesh { ... }
export function parseStlAscii(text: string): ParsedMesh { ... }
export function parseObj(text: string): ParsedMesh { ... }
export function parse3mf(data: ArrayBuffer): ParsedMesh { ... }
export function weldVertices(mesh: ParsedMesh, epsilon?: number): WeldedMesh { ... }

// Manifold lower.ts
case 'importedMesh': {
  const data = readBinaryFile(plan.filePath);
  const parsed = parseStlBinary(data);       // shared parser
  const welded = weldVertices(parsed);        // shared utility
  return new wasm.Manifold(new wasm.Mesh(welded));  // backend-specific
}

// OCCT lower.ts (Phase 4)
case 'importedMesh': {
  const data = readBinaryFile(plan.filePath);
  const parsed = parseStlBinary(data);       // same shared parser
  return sewTrianglesToSolid(oc, parsed);    // backend-specific
}
```

---

## Proposed API

```javascript
// Import mesh file — returns a Shape
const bunny = importMesh("stanford-bunny.stl");

// With options
const model = importMesh("part.3mf", {
  scale: 25.4,        // unit conversion
  center: true,       // center at origin
});

// Import STEP file (future Phase 3)
const bracket = importStep("bracket.step");

// Full composability with ForgeCAD ops:
const slats = /* parametric grid pattern */;
const carved = difference(bunny, slats);
carved.color = "#cc3333";
return union(slats.setColor("#222"), carved);
```

### Where `importMesh()` Lives

In `runner.ts`, alongside `importPart()` and `importSvgSketch()`:

```typescript
const importMesh = (name: string, options?: MeshImportOptions): Shape => {
  const resolvedPath = resolveImportPath(name);
  const ext = resolvedPath.split('.').pop()?.toLowerCase();
  const format = ext === 'stl' ? 'stl' : ext === 'obj' ? 'obj' : ext === '3mf' ? '3mf' : null;
  if (!format) throw new Error(`importMesh: unsupported format ".${ext}"`);

  // IR node — just the intent, no parsing
  let plan: ShapeCompilePlan = { kind: 'importedMesh', filePath: resolvedPath, format };

  // Options become transform nodes wrapping the import
  if (options?.scale) {
    const s = options.scale;
    plan = { kind: 'transform', base: plan, steps: [{ kind: 'scale', x: s, y: s, z: s }] };
  }
  if (options?.center) {
    // Centering needs bbox — resolved at lowering time, not here
    // Could be a dedicated transform step or post-processing
  }

  return buildShapeFromCompilePlan(
    createOwnedShapeCompilePlan(plan, 'importedMesh')!,
    undefined,
    { fidelity: 'sampled', sources: ['imported'] }
  );
};
```

---

## Implementation Plan

### Phase 1: STL Import (MVP)

| Step | File | What |
|------|------|------|
| 1 | `src/forge/compilePlan.ts` | Add `importedMesh` node to `ShapeCompilePlan` union type + clone logic |
| 2 | `src/forge/meshParsers.ts` | **NEW** — STL parser (binary + ASCII) + vertex welding. Pure math, no WASM. |
| 3 | `src/forge/backends/manifold/lower.ts` | Add `case 'importedMesh'`: read file → parse → weld → `new Manifold()` |
| 4 | `src/forge/backends/occt/lower.ts` | Add `case 'importedMesh'`: throw `OCCTUnsupportedError` (falls back to Manifold) |
| 5 | `src/forge/runner.ts` | Add `importMesh()` to script sandbox |
| 6 | Binary file I/O | Browser: `/api/read-binary` endpoint. CLI: `fs.readFileSync()` |
| 7 | All switch cases on `kind` | Add `'importedMesh'` to ~12 switch statements (follow `'opaque'` pattern) |
| 8 | `src/forge/forge-public-api.ts` | Export types for Monaco intellisense |

### Phase 2: OBJ + 3MF Parsers
Add to `meshParsers.ts`. Same IR node (`importedMesh`), different parsers selected by `format` field. OBJ needs quad triangulation. 3MF needs `fflate.unzipSync()`.

### Phase 3: STEP Import
New IR node `importedStep`. OCCT lowers natively via `STEPControl_Reader`. Manifold lowering either cross-calls OCCT for tessellation or throws unsupported.

### Phase 4: OCCT Mesh Lowering
Implement `BRepBuilderAPI_Sewing` path for `importedMesh` in OCCT lowering. Enables STEP export of imported meshes with proper topology.

---

## Switch Statement Audit

Every place that switches on `ShapeCompilePlan.kind` needs the new `'importedMesh'` case. Current `'opaque'` handling shows the pattern — `importedMesh` should behave similarly for topology/query features (no tracking available for imported geometry):

| File | Function | Behavior for `importedMesh` |
|------|----------|----------------------------|
| `compilePlan.ts` | `cloneShapeCompilePlan()` | Clone `{ kind, filePath, format }` |
| `compilePlan.ts` | `getProfilePlanFromShape()` | Return `null` |
| `compilePlan.ts` | `visitShapeCompilePlan()` | Return (leaf node) |
| `compilePlan.ts` | `extractExtrusion()` | Return `null` |
| `backends/manifold/lower.ts` | `lowerShapeCompilePlanToManifold()` | Read → parse → weld → Manifold |
| `backends/occt/lower.ts` | `_lowerShapeCompilePlanToOCCTInner()` | Throw `OCCTUnsupportedError` |
| `shellCompilePlan.ts` | shell lowering | Return unsupported |
| `booleanQueryPropagation.ts` | boolean query | Return `null` |
| `queryPropagation.ts` | query propagation (2 places) | Return `undefined` / `null` |
| `queryPropagation.ts` | visit query | Return |
| `edgeFeatureResolution.ts` | edge feature (3 places) | Return unsupported |
| `projectionCompile.ts` | projection replay | Return unsupported |
| `shapeFaces.ts` | face table | Return `emptyFaceTable()` |
| `compilePlanCadQuery.ts` | CadQuery export | Return unsupported |

---

## Key Risks

1. **Non-manifold meshes**: Real-world STLs are often broken. Manifold's constructor rejects them. Need vertex welding + graceful error messages.
2. **File I/O at lowering time**: Backend lowering now needs file system access. Currently it's pure computation. Need to thread a file-reader through the lowering context.
3. **Binary file I/O in browser**: Current browser file system is text-only. Need new `/api/read-binary` endpoint.
4. **OCCT fallback**: Phase 1 throws `OCCTUnsupportedError` for mesh import. Users with OCCT as active backend get auto-switched to Manifold. Acceptable.
5. **Caching**: If the same file is referenced multiple times, each lowering re-reads and re-parses. Could cache parsed results keyed by `filePath` + mtime.

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Baseline (no import) | ✅ Documented |
| — | Architecture analysis (IR + backends) | ✅ Documented |
| — | Design decision: file-ref IR (intent, not resolved data) | ✅ Documented |
| E1 | STL parser + `importedMesh` IR node + Manifold lowering | ✅ Working |
| E1a | Cube STL import + boolean subtract cylinder | ✅ vol=718mm³, 25ms |
| E1b | 16K-tri sphere STL import + 16 slat intersections | ✅ vol=5632mm³, 113ms |
| E1c | Import → boolean → 3MF export roundtrip | ✅ 176 triangles |
| E2 | Vertex welding validation on real-world STLs | 🔲 Not started |
| E3 | STEP import via `importedStep` IR + OCCT lowering | 🔲 Not started |
| E4 | Performance benchmarks (large meshes) | 🔲 Not started |
| E5 | End-to-end slat-cut workflow with external model | 🔲 Not started |

## Experiment Log

### E1: STL Import + Boolean Operations (SUCCESS)

**What**: Implemented full STL import pipeline: binary/ASCII parser with spatial-hash vertex welding, `importedMesh` IR node, Manifold lowering, OCCT fallback (throws OCCTUnsupportedError).

**Result**:
- Cube (12 tri) import + boolean subtract: 25ms, correct volume
- Sphere (16K tri) import + 16 boolean intersections: 113ms
- Full roundtrip: STL import → boolean → 3MF export works

**Design refinement during implementation**:
- Originally planned to store raw `fileData: ArrayBuffer` in IR (not parsed mesh).  Compromise: file is read at IR construction time (runner), stored as raw bytes. Each backend parses independently at lowering time. This avoids threading file-reader through lowering functions while keeping backends independent.
- Vertex welding simplified: full dedup means `mergeFromVert`/`mergeToVert` are empty. Manifold gets clean indexed mesh directly.

**Lesson**: ForgeCAD-exported STLs reimport cleanly. Real-world STLs from other tools may have winding/manifold issues — need E2 validation.

### Files Created/Modified

| File | Change |
|------|--------|
| `src/forge/compilePlan.ts` | Added `importedMesh` to `ShapeCompilePlan` union + clone |
| `src/forge/meshParsers.ts` | **NEW** — STL binary/ASCII parser + vertex welding |
| `src/forge/backends/manifold/lower.ts` | `importedMesh` → parse → `new Manifold()` |
| `src/forge/backends/occt/lower.ts` | `importedMesh` → `OCCTUnsupportedError` |
| `src/forge/runner.ts` | `importMesh()` in script sandbox + `readBinaryFile` callback |
| `src/forge/kernel.ts` | Added `'imported'` to `GeometrySource` |
| `src/forge/forge-public-api.ts` | `importMesh()` declaration for Monaco |
| `src/forge/headless.ts` | Export `MeshImportOptions` type |
| `cli/collect-files.ts` | Added `readBinaryFile` to `collectProjectFiles()` return |
| `cli/forge-mesh.ts` | Pass `readBinaryFile` to `runScript()` |
| `cli/test-run.ts` | Pass `readBinaryFile` to `runScript()` |
| 12 files | Added `'importedMesh'` to switch statements (query propagation, edge features, projection, shell, faces, CadQuery) |

### Browser Support: Deferred

The browser eval worker (`evalWorker.ts`) does not yet pass `readBinaryFile`. It runs in a web worker where synchronous file reading requires either sync XHR or pre-loading binary assets. This is a separate task.

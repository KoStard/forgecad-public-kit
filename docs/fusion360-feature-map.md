# Fusion360 Feature Mapping & Multi-File Architecture

## Why This Document

Fusion360 is the benchmark. Not because we want to clone it — we want to understand which of its features map naturally to code-native CAD, which ones are possible but hard, and which ones don't make sense for our paradigm. This also drives the multi-file architecture: what kinds of files does a real project need?

---

## Multi-File Architecture

### The Problem with Single-File

Right now everything lives in one script. That works for a phone stand. It falls apart when you have:
- A 2D profile that gets reused in multiple parts
- An assembly of 10 parts that reference each other
- A library of custom fasteners for your project
- A sketch that defines a complex outline, then gets extruded in the main file

### Proposed File Structure

A ForgeCAD project is a directory:

```
my-enclosure/
├── forge.json              ← project manifest
├── main.forge.js           ← entry point (what gets rendered)
├── sketches/
│   ├── front-panel.sketch.js   ← 2D profile
│   └── pcb-cutout.sketch.js
├── parts/
│   ├── top-shell.forge.js
│   ├── bottom-shell.forge.js
│   └── button-cap.forge.js
└── lib/
    ├── standoffs.forge.js  ← project-specific reusable parts
    └── snap-fits.forge.js
```

### How Imports Work

The runner needs to resolve `load()` calls against the project directory:

```js
// main.forge.js
const topShell = load("./parts/top-shell.forge.js");
const bottomShell = load("./parts/bottom-shell.forge.js");
const buttonCap = load("./parts/button-cap.forge.js");

return union(
  topShell,
  bottomShell.translate(0, 0, -2),  // 2mm gap for assembly view
  buttonCap.translate(30, 15, 22),
);
```

```js
// parts/top-shell.forge.js
const outline = loadSketch("../sketches/front-panel.sketch.js");
const shell = outline.extrude(20).shell(2);
const buttonHole = cylinder(5, 6).centerOn(shell, 'top');
return shell.subtract(buttonHole);
```

```js
// sketches/front-panel.sketch.js — returns a 2D CrossSection
const w = param("Panel Width", 100);
const h = param("Panel Height", 60);
const r = param("Corner Radius", 5);
return roundedRect(w, h, r);
```

### Implementation

Two levels:

**Level 1 — In-memory multi-file (browser only):**
The store holds a `Map<string, string>` of filename → code. A file picker sidebar lets you switch between files. `load()` resolves against this map. No server needed.

**Level 2 — Local server (Jupyter-style):**
A tiny Node server (`forge serve ./my-enclosure/`) watches the directory, serves files via HTTP, and the browser fetches them. `load()` becomes a fetch call. This enables using any external editor (VS Code, vim) alongside the browser viewport.

Level 1 is the MVP. Level 2 comes when the project concept matures.

---

## Fusion360 Feature Map

### Sketch & 2D Operations

| Fusion360 Feature | What It Does | ForgeCAD Status | Feasibility | Notes |
|---|---|---|---|---|
| **Sketch mode** | Draw 2D profiles on a plane | 🟡 Possible | Medium | Manifold has `CrossSection` for 2D. We'd expose `rect()`, `circle()`, `polygon()`, `roundedRect()` that return CrossSection objects. No visual sketch editor needed — code defines the profile. |
| **Sketch constraints** | Coincident, parallel, tangent, etc. | 🔴 Not planned | Hard | See constraints-design.md. Code-level helpers cover 80%. |
| **Extrude** | Push a 2D profile into 3D | 🟢 Easy | Low | `CrossSection.extrude(height)` already exists in Manifold. Just expose it. |
| **Revolve** | Spin a 2D profile around an axis | 🟢 Easy | Low | `CrossSection.revolve(segments, degrees)` exists in Manifold. |
| **Sweep** | Move a 2D profile along a 3D path | 🔴 Not available | Hard | Manifold doesn't have sweep. Would need custom implementation or OpenCascade. |
| **Loft** | Blend between two 2D profiles | 🔴 Not available | Hard | Same — not in Manifold. |
| **Offset** | Offset a 2D profile inward/outward | 🟢 Easy | Low | `CrossSection.offset(delta)` exists. |
| **Trim / Extend** | Cut or extend sketch lines | 🟡 Possible | Medium | Would need 2D boolean ops on CrossSections — Manifold supports this. |
| **Mirror sketch** | Mirror a 2D profile | 🟢 Easy | Low | `CrossSection.mirror()` exists. |
| **Pattern (circular/rectangular)** | Repeat sketch elements | 🟢 Easy | Low | Just a loop in code. More natural than GUI. |

### 3D Modeling

| Fusion360 Feature | What It Does | ForgeCAD Status | Feasibility | Notes |
|---|---|---|---|---|
| **Boolean (union/subtract/intersect)** | Combine/cut solids | ✅ Done | — | Core feature. |
| **Fillet / Chamfer** | Round or bevel edges | 🔴 Not available | Hard | Manifold doesn't have fillet. This is the single biggest gap. Workarounds: `smoothOut()` + `refine()` for approximate rounding, or Minkowski sum (expensive). Real fillets need OpenCascade or a custom implementation. |
| **Shell** | Hollow out a solid with uniform wall thickness | 🟡 Possible | Medium | Can approximate with `shape.subtract(shape.scale(factor))` for simple shapes. True shell (offset surface) needs more work. |
| **Draft angle** | Taper walls for mold release | 🟡 Possible | Medium | Could implement via `warp()` function that applies a taper transform. |
| **Split body** | Cut a body into two pieces | 🟢 Easy | Low | `Manifold.split()` and `trimByPlane()` exist. |
| **Mirror body** | Mirror a 3D shape | ✅ Done | — | `.mirror([1,0,0])` etc. |
| **Pattern (3D)** | Circular/rectangular array of features | 🟢 Easy | Low | Loop + translate/rotate in code. More flexible than GUI. |
| **Combine bodies** | Merge multiple bodies | ✅ Done | — | `union()`. |
| **Move / Align** | Position bodies relative to each other | 🟡 Partial | Low | `.translate()` works. `.centerOn()` / `.alignTo()` planned (see constraints doc). |
| **Physical material** | Assign material properties (density, etc.) | 🟡 Possible | Low | Metadata only — `material("ABS")` that stores density for mass calculation. |
| **Section analysis** | Cut-away view to see inside | 🟡 Possible | Medium | `trimByPlane()` in viewport as a visual-only toggle. |
| **Measure** | Distance, angle, area between elements | 🟢 Partial | — | Point-to-point distance done. Face area / angle measurement would need face picking. |

### Assembly

| Fusion360 Feature | What It Does | ForgeCAD Status | Feasibility | Notes |
|---|---|---|---|---|
| **Components** | Separate parts in one design | 🟡 Possible | Medium | Multi-file architecture. Each `.forge.js` is a component. `load()` brings them together. |
| **Joints** | Constrain how parts move relative to each other | 🔴 Not planned | Hard | Needs a constraint solver + motion simulation. Way beyond MVP. |
| **Motion study** | Animate joint movement | 🔴 Not planned | Hard | — |
| **Exploded view** | Spread parts apart for visualization | 🟢 Easy | Low | Just add offsets to translates. Could be a `explode(factor)` helper. |
| **Bill of materials** | List all parts with quantities | 🟡 Possible | Low | Parse the project files, count `load()` calls. |
| **Interference check** | Detect if parts overlap | 🟡 Possible | Medium | `intersection(a, b).volume() > 0` — already possible with current API. |

### Manufacturing & Export

| Fusion360 Feature | What It Does | ForgeCAD Status | Feasibility | Notes |
|---|---|---|---|---|
| **STL export** | Triangle mesh for 3D printing | ✅ Done | — | Binary STL export working. |
| **STEP export** | Industry-standard CAD exchange | 🔴 Not available | Hard | Needs OpenCascade WASM (opencascade.js exists, ~15MB). Big dependency but doable. |
| **3MF export** | Modern 3D print format (color, multi-material) | 🟡 Possible | Medium | It's XML + mesh data. Could build from Manifold mesh. |
| **DXF export** | 2D drawings for laser cutting | 🟡 Possible | Medium | From CrossSection → DXF. Libraries exist. |
| **G-code** | Direct machine control | 🔴 Not planned | Hard | Use a slicer (PrusaSlicer, Cura) instead. |
| **2D drawing** | Engineering drawings with dimensions | 🔴 Not planned | Hard | Entire sub-system. Not worth building. |
| **Mesh refinement** | Control triangle density | 🟢 Easy | Low | `Manifold.refine(n)` and `refineToLength(len)` exist. |

### Rendering & Visualization

| Fusion360 Feature | What It Does | ForgeCAD Status | Feasibility | Notes |
|---|---|---|---|---|
| **Orbit / Pan / Zoom** | Navigate 3D view | ✅ Done | — | OrbitControls. |
| **Visual styles** | Wireframe, shaded, realistic | 🟡 Possible | Low | Toggle material/wireframe in viewport. |
| **Appearance** | Per-face colors/materials | 🟡 Possible | Medium | Manifold supports per-face properties. Would need to map to vertex colors in Three.js. |
| **Section view** | Live cut-away plane | 🟡 Possible | Medium | Clipping plane in Three.js + `trimByPlane()` for accurate section. |
| **Named views** | Save camera positions | 🟢 Easy | Low | Store camera state, recall on click. |

---

## The Big Gaps (Honest Assessment)

Three features that Fusion360 has and we fundamentally can't match without major new dependencies:

### 1. Fillet / Chamfer
This is the #1 most-requested CAD operation after booleans. Manifold doesn't support it. Options:
- **Approximate**: `smoothOut(minSharpAngle, smoothness)` + `refine(n)` — gives rounded edges but not precise radius control
- **Minkowski sum**: Dilate with a sphere — correct but extremely slow for complex shapes
- **OpenCascade WASM**: The nuclear option. Adds ~15MB but gives real fillets, STEP export, and everything else. Project: [opencascade.js](https://github.com/nicholasgasior/opencascade.js)
- **Hybrid**: Use Manifold for fast booleans, call out to OpenCascade only for fillet operations

### 2. Sweep / Loft
Moving a profile along a path, or blending between profiles. These are fundamentally NURBS/B-rep operations that mesh-based kernels (Manifold) can't do precisely. Same answer: OpenCascade if needed.

### 3. 2D Constraint Solver
For a proper sketch mode with geometric constraints. See constraints-design.md.

---

## What We're Actually Better At

Things where code-native beats Fusion360:

| Advantage | Why |
|---|---|
| **Parametric everything** | Every dimension is a variable by default. In Fusion you have to explicitly parameterize. |
| **Version control** | `git diff` on a `.forge.js` file shows exactly what changed. Try that with a `.f3d` file. |
| **LLM collaboration** | "Add 4 mounting holes in a grid pattern" → LLM writes a for-loop. In Fusion, that's 16 clicks. |
| **Programmatic patterns** | Fibonacci spirals, fractal structures, algorithmic geometry — trivial in code, impossible in GUI. |
| **Reproducibility** | The file IS the recipe. No hidden state, no feature tree order dependencies. |
| **Composability** | `load()` a part, modify it, combine it. Like importing a function. |
| **Batch generation** | Loop over a CSV of dimensions, generate 50 variants. One script. |
| **Zero cost** | No subscription. Runs in a browser. |

---

## Recommended Roadmap

### Phase 1 — Now
What we have: primitives, booleans, transforms, params, STL export, measurement, part library.

### Phase 2 — Multi-file + 2D Sketches
- Multi-file project with `load()` / `loadSketch()`
- 2D primitives: `rect()`, `circle()`, `polygon()`, `roundedRect()`
- `extrude()`, `revolve()` from 2D to 3D
- File sidebar in UI
- `forge.json` project manifest

### Phase 3 — Constraint Helpers + Polish
- `.centerOn()`, `.alignTo()`, `.stackOn()` helpers
- Section view toggle
- Visual style toggle (shaded/wireframe/x-ray)
- 3MF export
- Named camera views

### Phase 4 — OpenCascade Integration (Optional)
- Fillet / chamfer with real radius control
- STEP export
- Sweep / loft operations
- This is a big decision point — adds ~15MB to bundle but unlocks professional CAD features

### Phase 5 — Local Server Mode
- `forge serve ./project/` — watches filesystem
- Use VS Code or any editor alongside the browser viewport
- Hot reload on file save
- Project-level operations (export all parts, BOM generation)

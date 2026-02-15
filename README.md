# ⚒ ForgeCAD

Parametric CAD that brings Fusion360-level modeling to code.

**TypeScript IS the file format. The browser IS the CAD system.**

## Vision

ForgeCAD is a parametric modeling environment built on top of [Manifold](https://github.com/elalish/manifold), a fast WASM geometry kernel. Manifold handles the hard part — boolean operations, mesh math, extrusion. ForgeCAD adds everything above that:

- **Constraint-driven sketches** — declare geometric relationships (parallel, tangent, equal length, fixed distance), and a solver figures out the positions. Same paradigm as Fusion360's sketch environment.
- **Named entities and topology** — rectangles know their sides, extruded shapes know their faces and edges. You write `shape.face('top')` or `rect.side('left')`, not raw coordinates.
- **Code-as-format** — scripts are plain JS/TS files. Version control, diffing, LLM generation all work naturally. Every `param()` call becomes a live slider.
- **Multi-file composition** — split sketches and parts across files, import and assemble them.

The goal is not to reimplement Manifold. It's to build the parametric modeling layer that Manifold doesn't provide — the same layer that makes Fusion360 productive for real design work. Constraints, sketch fillets, shell operations, patterns, sketch-on-face — all the things that turn a geometry kernel into a CAD system.

### Architecture

```
User Script (.forge.js / .sketch.js)
        ↓
ForgeCAD Modeling Layer
  ├── Constraint solver (2D sketch constraints)
  ├── Named entities (Rectangle2D, Circle2D, Line2D)
  ├── Topology tracking (TrackedShape with face/edge names)
  ├── Patterns (linear, circular, mirror)
  ├── Sketch operations (fillet, offset, hull, boolean)
  └── 3D operations (smooth, shell, chamfer)
        ↓
Manifold WASM (geometry kernel)
  ├── Boolean ops (union, subtract, intersect)
  ├── Extrude, revolve
  ├── Mesh smoothing (smoothOut + refine)
  └── SDF level sets
        ↓
Three.js (rendering) + Monaco (editor)
```

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` — you'll see a split-pane editor + 3D viewport.

### Open a project folder

```bash
npm run open ./examples
```

Loads all `.forge.js` and `.sketch.js` files from the given directory into the editor. Without a path, opens with a blank file.

### CLI Render

Render a script to PNG without opening the browser:

```bash
npm run render path/to/file.forge.js [output.png]
```

Renders front, side, top, and isometric views. Output filenames are auto-suffixed (`_front.png`, `_side.png`, etc.). Works with both `.forge.js` (3D) and `.sketch.js` (2D, auto-extruded) files.

Environment variables:
- `FORGE_ANGLES=front,side,top,iso` — which angles to render (default: all four)
- `FORGE_SIZE=1024` — image size in pixels
- `FORGE_PORT=5173` — dev server port

Requires Chrome/Chromium installed (uses Puppeteer for headless rendering).

### SVG Export

Export a 2D sketch to SVG (no browser needed, runs in Node directly):

```bash
npm run svg path/to/file.sketch.js [output.svg]
```

### PDF Report Export

Generate a drawing/report PDF from `.forge.js` scripts:

```bash
npm run report -- path/to/file.forge.js [output.pdf]
npm run report -- path/to/file.forge.js [output.pdf] --dim-angle-tol 18
```

The report includes combined multi-angle views and per-component disassembled pages, with searchable text labels for dimensions.
For elongated or dense edge-detail parts, the report automatically adds separate detail continuation pages with zoomed views.

## How It Works

Write JavaScript/TypeScript in the left panel. The forge API is available globally:

```javascript
const width = param("Width", 80, { min: 40, max: 150, unit: "mm" });
const base = box(width, 60, 5);
const hole = cylinder(10, 8).translate(width / 2, 30, 0);
return base.subtract(hole);
```

- Every `param()` call creates a live slider
- Code auto-executes on change (400ms debounce)
- The 3D view updates in real-time
- Export to STL for 3D printing

## API Reference

### Primitives
- `box(x, y, z, center?)` — rectangular box
- `cylinder(height, radius, radiusTop?, segments?, center?)` — cylinder/cone
- `sphere(radius, segments?)` — geodesic sphere

### Booleans
- `union(...shapes)` — combine shapes
- `difference(...shapes)` — subtract shapes[1..n] from shapes[0]
- `intersection(...shapes)` — keep only overlapping volume

### Sections / Projections
- `intersectWithPlane(shape, plane)` — slice a 3D shape with a plane and return a 2D Sketch
- `projectToPlane(shape, plane)` — project a 3D shape onto a plane and return a 2D Sketch

Plane spec (either form):
- `{ origin: [x, y, z], normal: [nx, ny, nz] }`
- `{ plane: 'XY' | 'XZ' | 'YZ', offset?: number }`

### Transforms (chainable)
- `.translate(x, y, z)`
- `.rotate(x, y, z)` — Euler angles in degrees
- `.scale(v)` — uniform or `[x, y, z]`
- `.mirror([nx, ny, nz])` — mirror over plane
- `.clone()` / `.duplicate()` — explicit copy before branching variants

### Parameters
- `param(name, default, { min?, max?, step?, unit? })` — declares a slider

## Architecture

```
Monaco Editor  ←→  Forge Runtime  ←→  Three.js Viewport
                       ↓
               Manifold (WASM)
              geometry kernel
```

~5 source files, ~500 lines of actual application code. Everything else is off-the-shelf:
Monaco, Three.js, Manifold WASM, React, Zustand.

## Tech Stack

- **Geometry**: [Manifold](https://github.com/elalish/manifold) (WASM) — fast boolean ops
- **Rendering**: Three.js via @react-three/fiber
- **Editor**: Monaco (VS Code's editor)
- **State**: Zustand
- **Build**: Vite

# ForgeCAD

Code-first parametric CAD for the browser and CLI.

ForgeCAD combines a JavaScript/TypeScript modeling API, live parameters, constraints, and assembly tooling on top of the [Manifold](https://github.com/elalish/manifold) WASM geometry kernel.

TypeScript is the file format. The browser is the CAD system.

[API Reference](docs/permanent/API/API.md) • [CLI Docs](docs/permanent/CLI.md) • [Vision](docs/permanent/VISION.md) • [Examples](examples)

## Start Here

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

`npm run dev` opens the `./examples` project by default, so you can edit and save files immediately.

## Why ForgeCAD

Most geometry kernels are powerful but low-level. ForgeCAD adds the missing CAD layer:

- Constraint-driven sketch workflows
- Named entities and topology-aware operations
- Parametric design via `param(...)` sliders
- Multi-file composition with `importPart(...)` and `importSketch(...)`
- Assembly + mechanism modeling with joints, sweeps, and collision checks
- Script-authored BOM + dimension annotations for report export

The result is a CAD workflow that is version-control friendly, AI-editable, and still practical for real mechanical modeling.

## Highlights

- Browser CAD IDE with Monaco editor + real-time 3D viewport
- 2D sketch API: primitives, path builder, booleans, transforms, offsets, constraints
- 3D API: booleans, transforms, hull, level set/SDF workflows, cut planes
- Named shapes, face/edge references, fillet/chamfer helpers
- Reusable part library (`lib`) with fasteners, tubes, brackets, threads, patterns, exploded-view helpers
- Assembly graph API with revolute/prismatic/fixed joints
- Drawing/report pipeline: dimensions, BOM, multi-view PDF generation
- CLI tools that run the same engine as the browser runtime

## Quick Start

### Prerequisites

- Node.js 20+ (recommended)
- npm
- Chrome/Chromium installed (only required for PNG rendering CLI)

### Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

This starts ForgeCAD with the `./examples` folder loaded.

### Open your own project folder

```bash
npm run open -- /path/to/your/project
```

Use `--` before the path. ForgeCAD loads `.forge.js` and `.sketch.js` files from that folder, with disk-backed save.

### Blank scratch mode (optional)

```bash
npm run dev:blank
```

Starts ForgeCAD without a project folder (single in-memory scratch file).

## Your first script

Drop this into a `.forge.js` file:

```javascript
const width = param("Width", 120, { min: 60, max: 220, unit: "mm" });
const depth = param("Depth", 80, { min: 40, max: 160, unit: "mm" });
const height = param("Height", 12, { min: 6, max: 40, unit: "mm" });

const base = roundedRect(width, depth, 10).extrude(height).color("#5f87c6");
const pocket = roundedRect(width - 24, depth - 24, 8)
  .extrude(height - 3)
  .translate(12, 12, 3);

const part = base.subtract(pocket);

dim([0, 0, 0], [width, 0, 0], { label: "Width" });
dim([0, 0, 0], [0, depth, 0], { label: "Depth", offset: 14 });
cutPlane("Center Section", [1, 0, 0], width / 2);

return part;
```

Notes:

- The Forge API is globally available inside scripts (no imports required).
- `param(...)` values become live sliders in the UI.
- Return a `Shape`, `Sketch`, `ShapeGroup`, array of objects, or assembly scene.

## CLI Workflows

All CLI tools use the same runtime as the browser (`src/forge/headless.ts`), so behavior is consistent across environments.

| Task | Command |
| --- | --- |
| Validate a script | `npm run test-run -- examples/cup.forge.js` |
| Render PNG views | `npm run render -- examples/cup.forge.js` |
| Export sketch SVG | `npm run svg -- examples/frame.sketch.js` |
| Generate report PDF | `npm run report -- examples/cup.forge.js` |
| Parameter robustness scan | `npm run param-check -- examples/shoe-rack-doors.forge.js --samples 10` |
| Transform invariants | `npm run check:transforms` |
| Dimension propagation invariants | `npm run check:dimensions` |

### CLI details

- `render` outputs multi-angle PNGs (`front`, `side`, `top`, `iso`) by default.
- `svg` runs fully in Node (no browser/Puppeteer).
- `report` generates searchable-text PDF pages (overview, components, BOM, dimensions).
- `param-check` samples parameter ranges and reports runtime errors, degenerates, and new collisions.

## Start with these examples

- `examples/api/sketch-basics.forge.js`: sketch primitives, offset, path, extrude
- `examples/api/boolean-operations.forge.js`: union/difference/intersection behavior
- `examples/api/assembly-mechanism.forge.js`: joints, sweeps, collisions, BOM
- `examples/api/dimensioned-bracket.forge.js`: dimension annotations
- `examples/api/bill-of-materials.forge.js`: script-authored BOM aggregation
- `examples/api/exploded-view.forge.js`: exploded layouts + cut-plane visualization

## Core architecture

```text
User script (.forge.js / .sketch.js)
        |
        v
ForgeCAD modeling layer
  - params, constraints, sketch entities
  - topology-aware operations
  - assembly + reporting helpers
        |
        v
Manifold WASM geometry kernel
  - booleans, extrusion, mesh operations
        |
        +--> Browser app (Monaco + Three.js)
        +--> CLI tools (headless runtime)
```

## Project status

ForgeCAD is under active development. The API is usable today, but some advanced CAD features are still being built for deeper parity with mature desktop CAD tooling.

Planned/ongoing areas include:

- richer sketch editing primitives (fillets, arc-first workflows, trim/extend)
- shell and advanced feature operations
- sketch-on-face and higher-level surfacing/transition tools
- broader mechanical modeling ergonomics

See [Vision](docs/permanent/VISION.md) for the longer-term direction.

## Contributing

Contributions are welcome. Good first contributions:

- API docs improvements in `docs/permanent/API/`
- focused examples in `examples/api/`
- runtime and CLI correctness checks

Suggested local validation before opening a PR:

```bash
npm run test-run -- examples/cup.forge.js
npm run check:transforms
npm run check:dimensions
```

If your change is parametric-heavy, also run:

```bash
npm run param-check -- path/to/your-example.forge.js --samples 10
```

## Additional docs

- API: [`docs/permanent/API/API.md`](docs/permanent/API/API.md)
- CLI: [`docs/permanent/CLI.md`](docs/permanent/CLI.md)
- Vision: [`docs/permanent/VISION.md`](docs/permanent/VISION.md)
- Coding notes: [`docs/permanent/CODING.md`](docs/permanent/CODING.md)

## License

No license file is currently published in this repository.

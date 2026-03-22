# ForgeCAD

![Robot Hand V2](<https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/Robot%20Hand%20V2.gif>)

Code-first parametric CAD for JavaScript/TypeScript, in the browser and CLI.

ForgeCAD is a multi-backend CAD system with a JavaScript/TypeScript modeling API, live parameters, constraints, assemblies, reports, and exact STEP/BREP export. Interactive browser modeling currently uses [Manifold](https://github.com/elalish/manifold) for fast geometry work, while exact export runs through CadQuery/OpenCascade and the public modeling layer stays backend-aware rather than tied to one kernel.

TypeScript is the file format. The browser is the CAD system.

[**Try it in your browser →**](https://kostard.github.io/ForgeCAD) • [API Reference](docs/permanent/API/README.md) • [CLI Docs](docs/permanent/CLI.md) • [Vision](docs/permanent/VISION.md) • [Examples](examples)

## Install

```bash
npm install -g forgecad
forgecad studio /path/to/your/project
```

Or without a project folder to start from a blank scratch file:

```bash
forgecad studio --blank
```

## Start Here (contributors)

```bash
npm install
npm link
forgecad studio
```

Then open `http://localhost:5173`.

`forgecad studio` opens the packaged `./examples` project by default, so you can edit and save files immediately.

## Why ForgeCAD

Most geometry kernels are powerful but low-level. ForgeCAD adds the missing CAD layer:

- Constraint-driven sketch workflows
- Named entities and topology-aware operations
- Parametric design via `param(...)` sliders
- Multi-file composition with `importPart(...)`, `importSketch(...)`, and plain `.js` utility modules
- Assembly + mechanism modeling with joints, sweeps, and collision checks
- Script-authored BOM + dimension annotations for report export
- Exact STEP/BREP export for the maintained replayable subset

The result is a CAD workflow that is version-control friendly, AI-editable, and still practical for real mechanical modeling.

### JS utility modules

ForgeCAD model files (`.forge.js`) can now use standard JS imports for shared helpers:

```javascript
import { buildAssembly } from "./assembly-utils.js";
export default buildAssembly();
```

Utility modules can use `export` / `export default`, `require(...)`, and explicit ForgeCAD runtime imports:

```javascript
import { box, union } from "forgecad";
```

Modules can also use top-level `return` (including arrays) as the module value, as long as they do not also define exports in the same file.

Use `importPart()` / `importSketch()` when you want the specialized model/sketch import behavior (parameter scoping, SVG parsing, dimension propagation). Use plain JS modules for reusable functions, classes, and constants. See [examples/api/js-module-imports.forge.js](examples/api/js-module-imports.forge.js).

## Seamless AI integration

ForgeCAD is built to work cleanly with coding agents. Your CAD models are plain code, and the repository already includes the context agents need to be useful immediately:

- `docs/permanent/` explains the modeling API and workflows
- `examples/api/` provides concrete model patterns to copy and adapt
- browser + CLI run the same engine, so AI-generated scripts behave consistently
- the generated Codex skill is rebuilt with `npm run build:skill:forgecad`

### Agent skill (Claude Code, Codex, OpenCode, …)

Install a self-contained ForgeCAD skill for coding agents that support the `~/.agents/skills/` convention (all API docs inlined — no repo required):

```bash
forgecad skill install
```

This copies a pre-built `SKILL.md` to `~/.agents/skills/forgecad/SKILL.md`. Reload your agent to activate. Run again after upgrading ForgeCAD to pick up updated docs.

### Chat UI (Claude.ai, ChatGPT, Gemini, …)

No CLI agent? Generate a single self-contained context file with all ForgeCAD API docs and paste it into any chat session:

```bash
forgecad skill one-file ~/Desktop/forgecad-context.md
```

The file includes a preamble explaining the chat-UI setup: the AI has no shell access, so it will ask you to run commands like `forgecad run <file>` and paste back the output for validation and iteration.

### Instructions for AI model generation

When an AI model is asked to generate ForgeCAD models, require this workflow:

1. Read `docs/permanent/API/model-building/README.md` first.
2. Read every file listed there.
3. Read the relevant files in `examples/api/` next.
4. If the task is exploratory, unfamiliar, or likely to need debugging, start in a `.forge-notebook.json` and iterate there first.
5. Only then stabilize the result as `.forge.js`, or keep using the notebook when iteration is still active.
6. Read `docs/permanent/API/runtime/` or `docs/permanent/API/output/` only if the task explicitly needs viewport behavior, reporting, or export.

Use this instruction in prompts to avoid missing API capabilities or producing invalid model code:

```text
Before generating any ForgeCAD model code, read docs/permanent/API/model-building/README.md, then every file it lists, then the relevant files in examples/api/. If the task is exploratory, unfamiliar, or likely to need debugging, start in a .forge-notebook.json and iterate there first. Only read docs/permanent/API/runtime/ or docs/permanent/API/output/ if the task explicitly needs those areas. Then generate a runnable model using only documented ForgeCAD APIs and patterns from those files.
```

Example AI workflows:

```bash
aider --read docs/permanent/ --read examples/api/ --model openrouter/google/gemini-3-flash-preview --reasoning-effort xhigh
kiro-cli chat
codex
```

This lets you iterate with AI on real `.forge.js` model files without custom glue code or one-off prompt scaffolding.

<!-- BENCHMARKS:START -->
## LLM Benchmarks

Latest benchmark iterations from `ForgeCADBenchmark/results/*` (`version_{n}.forge.js` with highest `n` per run folder).

| model name | prompt | GIF |
| --- | --- | --- |
| `3dprinter-gpt52codex`<br><sub>2026-02-13 14-36-06 • v2</sub> | Make a detailed home 3D printer, showing the internal details of how it should work. Add some params for controlling positions, etc. | ![3dprinter-gpt52codex](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/3dprinter-gpt52codex-2026-02-13-14-36-06-v2.gif) |
| `amazon-nova-2-lite-v1`<br><sub>2026-02-13 00-15-44 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![amazon-nova-2-lite-v1](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/amazon-nova-2-lite-v1-2026-02-13-00-15-44-v1.gif) |
| `amazon-nova-premier-v1`<br><sub>2026-02-13 00-36-50 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | _GIF generation failed (script runtime error)._ |
| `aurora_alpha`<br><sub>2026-02-12 15-19-30 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | _GIF generation failed (script runtime error)._ |
| `bytedance-seed-seed-1.6`<br><sub>2026-02-13 00-14-02 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![bytedance-seed-seed-1.6](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/bytedance-seed-seed-1.6-2026-02-13-00-14-02-v3.gif) |
| `deepseek-deepseek-v3.2`<br><sub>2026-02-13 00-30-04 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![deepseek-deepseek-v3.2](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/deepseek-deepseek-v3.2-2026-02-13-00-30-04-v3.gif) |
| `gemini3flash`<br><sub>2026-02-12 23-53-27 • v5</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![gemini3flash](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/gemini3flash-2026-02-12-23-53-27-v5.gif) |
| `glm5`<br><sub>2026-02-12 14-58-52 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![glm5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/glm5-2026-02-12-14-58-52-v3.gif) |
| `glm5`<br><sub>2026-02-12 23-04-12 • v4</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![glm5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/glm5-2026-02-12-23-04-12-v4.gif) |
| `google-gemini-3-pro-preview`<br><sub>2026-02-13 00-36-12 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![google-gemini-3-pro-preview](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/google-gemini-3-pro-preview-2026-02-13-00-36-12-v2.gif) |
| `gpt52codex`<br><sub>2026-02-13 00-04-30 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![gpt52codex](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/gpt52codex-2026-02-13-00-04-30-v2.gif) |
| `gpt52codex`<br><sub>2026-02-13 12-40-31 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Include as many details as you safely can. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![gpt52codex](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/gpt52codex-2026-02-13-12-40-31-v2.gif) |
| `haiku_4_5`<br><sub>2026-02-12 21-49-51 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![haiku_4_5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/haiku_4_5-2026-02-12-21-49-51-v1.gif) |
| `haiku_4_5`<br><sub>2026-02-12 21-54-22 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![haiku_4_5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/haiku_4_5-2026-02-12-21-54-22-v3.gif) |
| `kimi25`<br><sub>2026-02-12 13-50-22 • v4</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![kimi25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/kimi25-2026-02-12-13-50-22-v4.gif) |
| `kimi25`<br><sub>2026-02-12 14-58-53 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![kimi25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/kimi25-2026-02-12-14-58-53-v3.gif) |
| `manual-gemini-flash`<br><sub>2026-02-12 23-44-23 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![manual-gemini-flash](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/manual-gemini-flash-2026-02-12-23-44-23-v3.gif) |
| `minimax25`<br><sub>2026-02-12 14-32-24 • v5</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![minimax25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/minimax25-2026-02-12-14-32-24-v5.gif) |
| `minimax25`<br><sub>2026-02-12 23-05-17 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![minimax25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/minimax25-2026-02-12-23-05-17-v3.gif) |
| `minimax25`<br><sub>2026-02-13 12-37-52 • v4</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![minimax25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/minimax25-2026-02-13-12-37-52-v4.gif) |
| `openai-gpt-oss-120b`<br><sub>2026-02-13 00-38-15 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![openai-gpt-oss-120b](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/openai-gpt-oss-120b-2026-02-13-00-38-15-v1.gif) |
| `opus_4_6`<br><sub>2026-02-13 11-47-54 • v5</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![opus_4_6](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/opus_4_6-2026-02-13-11-47-54-v5.gif) |
| `prime-intellect-intellect-3`<br><sub>2026-02-13 00-31-28 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![prime-intellect-intellect-3](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/prime-intellect-intellect-3-2026-02-13-00-31-28-v1.gif) |
| `qwen3.5-397b-a17b`<br><sub>2026-02-16 14-29-22 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![qwen3.5-397b-a17b](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/qwen3.5-397b-a17b-2026-02-16-14-29-22-v3.gif) |
| `qwen3maxthinking`<br><sub>2026-02-12 23-16-41 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![qwen3maxthinking](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/qwen3maxthinking-2026-02-12-23-16-41-v2.gif) |
| `robot-hand-gpt52codex`<br><sub>2026-02-14 00-51-41 • v1</sub> | Make a fully functional robot hand. Should be easy to build, maybe even at home with some good tools. Show all the mechanics. Should be able to hold arbitrary shape objects. Don't be a perfectionist, but be an artist and an engineer. As this is a complex task, break it down to simpler ones, solve them, combine, iterate. | ![robot-hand-gpt52codex](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/robot-hand-gpt52codex-2026-02-14-00-51-41-v1.gif) |
| `sonnet_4_5`<br><sub>2026-02-12 21-58-26 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![sonnet_4_5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/sonnet_4_5-2026-02-12-21-58-26-v3.gif) |
| `x-ai-grok-4.1-fast`<br><sub>2026-02-13 00-26-36 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![x-ai-grok-4.1-fast](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/x-ai-grok-4.1-fast-2026-02-13-00-26-36-v2.gif) |
<!-- BENCHMARKS:END -->

## Highlights

- Browser CAD IDE with Monaco editor + real-time 3D viewport
- 2D sketch API: primitives, path builder, booleans, transforms, offsets, constraints
- 3D API: booleans, transforms, hull, level set/SDF workflows, cut planes
- Named shapes, face/edge references, fillet/chamfer helpers
- Reusable part library (`lib`) with fasteners, tubes, brackets, threads, patterns, exploded-view helpers
- Assembly graph API with revolute/prismatic/fixed joints and joint couplings
- Drawing/report pipeline: dimensions, BOM, multi-view PDF generation with duplicate-part page collapsing
- CLI tools that run the same engine as the browser runtime

## Quick Start

### Prerequisites

- Node.js 20+ (recommended)
- npm
- Chrome/Chromium installed (only required for PNG rendering CLI)

### Install and run

```bash
npm install
npm link          # puts forgecad in PATH
npm run build:cli # build the CLI (~2s, needed after CLI changes)
forgecad studio   # opens ./examples by default
```

Open `http://localhost:5173`.

`npm run build:cli` is the fast daily-driver build. Run `npm run build` (20s+) only when you need the production SPA in `dist/` — e.g. before publishing or testing the production server path.

### Troubleshooting

**`wasm32-unknown-unknown target not found` during solver build**

The solver compiles to WebAssembly via `wasm-pack`, which requires the `wasm32-unknown-unknown` Rust target. If you installed Rust through Homebrew (`brew install rust`), this target isn't available and the build will fail.

Fix: switch to [rustup](https://rustup.rs), which manages targets natively:

```bash
brew uninstall rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env        # or: source ~/.cargo/env.fish
rustup target add wasm32-unknown-unknown
```

Then re-run `npm run build`.

### Open your own project folder

```bash
forgecad studio /path/to/your/project
```

ForgeCAD loads `.forge.js` files from that folder, with disk-backed save.

### Blank scratch mode (optional)

```bash
forgecad studio --blank
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
- `cutPlane(...)` supports exclusions: `cutPlane("Section", [0,0,1], z, { exclude: ["Probe"] })`.
- Return a `Shape`, `Sketch`, `ShapeGroup`, array of objects, or assembly scene.

## CLI Workflows

All CLI tools use the same runtime as the browser (`src/forge/headless.ts`), so behavior is consistent across environments.

| Task | Command |
| --- | --- |
| Validate a script | `forgecad run examples/cup.forge.js` |
| Validate a notebook preview | `forgecad run examples/api/notebook-iteration.forge-notebook.json` |
| Inspect notebook cells in the terminal | `forgecad notebook view examples/api/notebook-iteration.forge-notebook.json preview` |
| Render PNG views | `forgecad render examples/cup.forge.js` |
| Render a notebook preview | `forgecad render examples/api/notebook-iteration.forge-notebook.json` |
| Render orbit GIF (solid + wireframe) | `forgecad capture gif examples/cup.forge.js` |
| List notebook capture options | `forgecad capture gif examples/api/notebook-assembly-debug.forge-notebook.json --list` |
| Export sketch SVG | `forgecad export svg examples/constraints/01-fully-constrained-rect.forge.js` |
| Export exact STEP (supported subset only) | `forgecad export step examples/api/brep-exportable.forge.js` |
| Export exact BREP (supported subset only) | `forgecad export brep examples/api/brep-exportable.forge.js` |
| Generate report PDF | `forgecad export report examples/cup.forge.js` |
| Parameter robustness scan | `forgecad check params examples/shoe-rack-doors.forge.js --samples 10` |
| Install agent skill (Claude Code, Codex, OpenCode…) | `forgecad skill install` |
| Export all docs as a single file for chat-UI paste | `forgecad skill one-file ~/Desktop/forgecad-context.md` |
| Prune merged local-only branches | `uv run cli/forge-prune-local-branches.py` |
| Transform invariants | `forgecad check transforms` |
| Dimension propagation invariants | `forgecad check dimensions` |

### CLI details

- `render` outputs multi-angle PNGs (`front`, `side`, `top`, `iso`) by default.
- For `forgecad run`, `forgecad render`, `forgecad capture gif`, and `forgecad capture mp4`, passing a `.forge-notebook.json` uses that notebook's preview cell.
- `capture gif` outputs a single orbit animation with a full solid pass, then full wireframe pass.
- `export svg` runs fully in Node (no browser/Puppeteer).
- `export report` generates searchable-text PDF pages (overview, unique components, BOM, dimensions).
- `check params` samples parameter ranges and reports runtime errors, degenerates, and new collisions.
- `uv run cli/forge-prune-local-branches.py` is a `uv` + Rich utility that reviews local-only branches already merged into `mainline`, removes linked worktrees first, and asks before each deletion.

## Start with these examples

- `examples/api/sketch-basics.forge.js`: sketch primitives, offset, path, extrude
- `examples/api/boolean-operations.forge.js`: union/difference/intersection behavior
- `examples/api/assembly-mechanism.forge.js`: joints, sweeps, collisions, BOM
- `examples/api/gears-tier1.forge.js`: spur/ring/rack gears + pair diagnostics
- `examples/api/gears-bevel-face-joints.forge.js`: bevel/face gears + runtime joint couplings
- `examples/api/face-gears.forge.js`: face gear + perpendicular vertical gear pair
- `examples/api/dimensioned-bracket.forge.js`: dimension annotations
- `examples/api/bill-of-materials.forge.js`: script-authored BOM aggregation
- `examples/api/exploded-view.forge.js`: exploded layouts + cut-plane visualization
- `examples/api/brep-exportable.forge.js`: exact-exportable STEP/BREP subset demo
- `examples/api/geometry-info.forge.js`: inspect backend/provenance info for solids
- `examples/api/notebook-iteration.forge-notebook.json`: stateful part exploration with pinned intermediate geometry
- `examples/api/notebook-assembly-debug.forge-notebook.json`: assembly collision and sweep investigation in notebook cells

BREP export support is intentionally tracked as a living parity table in [docs/permanent/API/output/brep-export.md](docs/permanent/API/output/brep-export.md).

## Core architecture

```text
User script (.forge.js)
        |
        v
ForgeCAD modeling layer
  - params, constraints, sketch entities
  - topology-aware operations
  - assembly + reporting helpers
        |
        v
Geometry backends
  - Manifold WASM for fast browser modeling and mesh-domain operations
  - CadQuery/OpenCascade replay for exact STEP/BREP export
  - backend/provenance contract for future hybrid kernels
        |
        +--> Browser app (Monaco + Three.js)
        +--> CLI tools (headless runtime and exact export)
```

## Project status

ForgeCAD is under active development. The API is usable today, but some advanced CAD features are still being built for deeper parity with mature desktop CAD tooling.

Planned/ongoing areas include:

- richer sketch editing primitives (fillets, arc-first workflows, trim/extend)
- shell and advanced feature operations
- sketch-on-face and higher-level surfacing/transition tools
- broader mechanical modeling ergonomics

See [Vision](docs/permanent/VISION.md) for the longer-term direction.

## Publishing to npm

```bash
npm login          # first time only
npm version patch  # or minor / major
npm publish        # runs npm run build automatically before publishing
```

Verify what gets included before publishing:

```bash
npm pack --dry-run
```

The build produces `dist/` (browser SPA), `dist-cli/` (CLI bundle), and `dist-skill/` (self-contained Claude Code skill). All three are included in the published package. End users get a fast production server; contributors without a built `dist/` automatically fall back to the Vite dev server.

## Contributing

Contributions are welcome. Good first contributions:

- API docs improvements in `docs/permanent/API/`
- focused examples in `examples/api/`
- runtime and CLI correctness checks

Suggested local validation before opening a PR:

```bash
forgecad run examples/cup.forge.js
forgecad check transforms
forgecad check dimensions
```

If your change is parametric-heavy, also run:

```bash
forgecad check params path/to/your-example.forge.js --samples 10
```

## Additional docs

- API: [`docs/permanent/API/README.md`](docs/permanent/API/README.md)
- CLI: [`docs/permanent/CLI.md`](docs/permanent/CLI.md)
- Vision: [`docs/permanent/VISION.md`](docs/permanent/VISION.md)
- Coding notes: [`docs/permanent/CODING.md`](docs/permanent/CODING.md)
- Benchmark maintenance SOP: [`docs/processes/README_BENCHMARK_SOP.md`](docs/processes/README_BENCHMARK_SOP.md)

## License

[Business Source License 1.1](LICENSE) — free for non-production use. Converts to MIT on 2030-02-18.

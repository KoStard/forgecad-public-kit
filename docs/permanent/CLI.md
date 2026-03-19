# ForgeCAD CLI

## Architecture

All CLI tools share the **same forge engine** as the browser UI. There is one source of truth for geometry logic — no code duplication. See [CODING.md → Project Structure](CODING.md#project-structure) for the full source tree.

**Browser** imports via `src/forge/index.ts` → re-exports from `headless.ts`.
**CLI tools** import directly from `src/forge/headless.ts`.

The key function is `runScript(code, fileName, allFiles)` — it wraps user code in a `Function()` sandbox with the entire forge API injected, and transpiles project files so standard JS `import` / `export` / `require(...)` work for shared utility modules. CLI scripts just call `init()` + `runScript()` and work with the results.

## When to use what

ForgeCAD has two overlapping interfaces. Use the right one for each context.

| Context | Use | Avoid |
|---------|-----|-------|
| **Using ForgeCAD as a tool** | `forgecad *` commands | `npm run *` |
| **Developing ForgeCAD itself** | `npm run dev` (live reload), `npm run build` (prod) | — |
| **CI / publishing** | `npm run build && npm run test` | forgecad CLI (not installed in CI) |
| **AI agents in this repo** | `forgecad *` commands only | `npm run build`, `npm run build:cli` |

The CLI is always available after `npm install` — no explicit build step needed.

### Dev server vs production server

| Command | What it does | Requires |
|---------|-------------|---------|
| `forgecad dev [path]` | Vite dev server, live reload | nothing beyond `npm install` |
| `forgecad studio [path]` | Fast static server for the production build | `dist/` built via `npm run build` |
| `npm run dev` | Same as `forgecad dev` — standard JS project entry point | nothing |

Use `forgecad dev` during active development of forge scripts. Use `forgecad studio` to verify the production build or serve it to others.

## Install

Install the package and link the local binary once:

```bash
npm install
npm link
```

After that, use `forgecad ...` directly from your shell.

### Shell Autocomplete

ForgeCAD now ships shell completion scripts in the usual modern-tool style:

```bash
forgecad completion bash
forgecad completion zsh
forgecad completion fish
```

Quick install:

```bash
# bash
echo 'source <(forgecad completion bash)' >> ~/.bashrc

# zsh
mkdir -p ~/.zsh/completions
forgecad completion zsh > ~/.zsh/completions/_forgecad
echo 'fpath=(~/.zsh/completions $fpath)' >> ~/.zshrc
echo 'autoload -Uz compinit && compinit' >> ~/.zshrc

# fish
mkdir -p ~/.config/fish/completions
forgecad completion fish > ~/.config/fish/completions/forgecad.fish
```

The completions are contextual:

- nested subcommands such as `forgecad notebook view` and `forgecad export step`
- command-specific flags and common enum values
- ForgeCAD file suggestions where a command expects `.forge.js`, `.sketch.js`, or `.forge-notebook.json`

## Available Commands

### Studio & Dev Server

```bash
# Development — Vite dev server, live reload, no build needed
forgecad dev
forgecad dev ~/cad/gearbox
forgecad dev --blank --port 4173

# Production — static server, requires dist/ (npm run build)
forgecad studio
forgecad studio ~/cad/gearbox
forgecad studio --blank --port 4173

# Web / embeddable mode — always dev server, no filesystem
forgecad web
forgecad web --open
```

Both `forgecad dev` and `forgecad studio` accept the same options:
- `--blank` — open without any project folder
- `--port <n>` — bind to a specific port (default: 5173)
- `--host [host]` — expose on the network
- `--open` — open a browser tab automatically
- `--strict-port` — fail if the port is already in use

`forgecad open` is an alias for `forgecad studio`.

### Notebook Cells (server-backed)

Forge notebooks live in `.forge-notebook.json` files and behave like lightweight Jupyter notebooks for ForgeCAD code cells.

The browser and CLI both use the Vite server for notebook execution. The CLI does not run Forge locally for notebook cells; it auto-starts or reuses the Forge server, sends the cell code, then prints the returned output summary.

Append a new code cell and run it immediately in one command:

```bash
forgecad notebook examples/demo.forge-notebook.json --code "show(box(40, 20, 10));"
```

If the target notebook file does not exist yet, append mode auto-creates it first with the default ForgeCAD notebook structure, then adds the new cell.

Or pipe a larger cell in through stdin:

```bash
cat /tmp/cell.js | forgecad notebook examples/demo.forge-notebook.json
```

Re-run the last preview cell, or a specific cell id:

```bash
forgecad notebook examples/demo.forge-notebook.json
forgecad notebook run examples/demo.forge-notebook.json <cell-id>
```

View the notebook in the terminal without dumping raw JSON:

```bash
forgecad notebook view examples/demo.forge-notebook.json
forgecad notebook view examples/demo.forge-notebook.json preview
forgecad notebook view examples/demo.forge-notebook.json 2
```

`view` is local-only. It parses the notebook JSON and renders notebook metadata, numbered source lines, and stored outputs for each cell. The optional selector accepts a 1-based cell number, an exact cell id, or `preview`.

`run`/`view` expect the notebook file to already exist. Auto-creation only applies to append flows (`--code`, `--file`, stdin, or the explicit `append` subcommand).

Export a notebook into a plain `.forge.js` script:

```bash
forgecad notebook export examples/demo.forge-notebook.json
forgecad notebook export examples/demo.forge-notebook.json out/demo-from-notebook.forge.js
```

If you already have a Forge server running, point the CLI at it:

```bash
forgecad notebook examples/demo.forge-notebook.json --server http://localhost:5173 --code "show(box(40, 20, 10));"
```

Notebook paths are resolved from the shell working directory before the CLI calls the server, so the server's opened project root does not add an extra path prefix.

Notebook cell behavior:

- Cells share state top-to-bottom
- `show(value)` pins the geometry that should stay visible in the viewport
- A trailing expression is also treated as the cell value
- Cell outputs are written back into the notebook JSON, similar to Jupyter

For the `forgecad` entrypoints below, passing a `.forge-notebook.json` uses that notebook's preview cell. That means you can inspect with `view`, validate with `run`, and render or capture the current preview without exporting first.

### Script Validation

```bash
forgecad run examples/cup.forge.js
forgecad run examples/api/notebook-iteration.forge-notebook.json
forgecad run examples/cup.forge.js --debug-imports
```

Runs a `.forge.js`, `.sketch.js`, or notebook preview cell in the real runtime and prints object stats, diagnostics, and execution time.

`--debug-imports` adds an import trace (source file, target file, overrides, return type, success/error phase), useful when debugging `importPart()`/`importSketch()` behavior.

### SVG Export (no browser needed)

```bash
forgecad export svg examples/frame.sketch.js [output.svg]
```

Runs a `.sketch.js` script in Node.js using the real forge engine and outputs SVG. No browser, no Puppeteer — pure Node.

**How it works:** Initializes the Manifold WASM kernel, runs the script through `runScript()`, extracts the Sketch result, converts polygons to SVG paths.

### STEP / BREP Export (exact subset, Python + CadQuery)

```bash
forgecad export step examples/api/brep-exportable.forge.js
forgecad export brep examples/api/brep-exportable.forge.js

# Optional overrides:
forgecad export step examples/api/brep-exportable.forge.js --output out/demo.step
forgecad export step examples/api/brep-exportable.forge.js --python 3.11
forgecad export step examples/api/brep-exportable.forge.js --uv /custom/path/to/uv
forgecad export step examples/chess-set.forge.js --allow-faceted
```

This exporter is `uv`-first. `cli/forge-brep-export.py` carries inline dependency metadata, so `uv run` provisions CadQuery automatically for the exporter environment.

By default this exporter is exact-subset only. It does **not** silently convert arbitrary triangle meshes back into fake BREP. Instead, Forge lowers compile-covered geometry into the `cadquery-occt` compiler target and exports that exact subset through CadQuery/OpenCascade.

If you pass `--allow-faceted`, unsupported closed mesh solids are exported as explicit faceted OCCT solids. This keeps hull-heavy designs exportable to STEP/BREP, but that fallback is tessellation-driven rather than exact replay.

The maintained feature matrix lives in [`docs/permanent/API/output/brep-export.md`](API/output/brep-export.md).

If any returned solid object falls outside the exact subset, the CLI fails with a reason instead of silently exporting degraded geometry. When a scene mixes solids and 2D sketches, the exact solids export and the sketch-only objects are skipped with a warning.

With `--allow-faceted`, mesh-solid blockers that still lack an exact replay plan are exported as faceted solids instead of failing. The CLI prints which objects used the fallback.

For coverage runs across many examples, use the `uv` matrix scripts:

```bash
uv run scripts/brep/matrix.py --format step examples
uv run scripts/brep/matrix.py --format brep examples
uv run scripts/brep/rerun_failures.py tmp/brep-matrix-step-20260306T120000Z.json
```

These scripts use the repo-local `.venv-brep/.venv/bin/python` by default, run exports through a bounded parallel worker pool, and write JSON reports under `tmp/`.

### SDF Robot Export (Gazebo package)

```bash
forgecad export sdf examples/api/sdf-rover-demo.forge.js

# Optional output directory:
forgecad export sdf examples/api/sdf-rover-demo.forge.js --output out/forge_scout
```

This exporter writes a Gazebo-friendly package workspace:

- `models/<model-name>/model.sdf`
- `models/<model-name>/model.config`
- `models/<model-name>/meshes/*.stl`
- `worlds/<world-name>.sdf` when the script requests a demo world
- `manifest.json` with topic names, link/joint mappings, and exporter warnings

The script must call `robotExport({...})` with an `assembly(...)` graph. The exporter uses the declared parts + joints directly; it does **not** try to infer a robot from flattened scene meshes.

When `world.generateDemoWorld` and `world.keyboardTeleop.enabled` are on, the exported world includes both:

- Gazebo's GUI `KeyPublisher` plugin
- server-side `TriggeredPublisher` bindings that map arrow keys to the diff-drive `cmd_vel` topic

Recommended launch flow:

```bash
export GZ_SIM_RESOURCE_PATH="$PWD/out/forge_scout/models${GZ_SIM_RESOURCE_PATH:+:$GZ_SIM_RESOURCE_PATH}"

# Terminal 1: server
gz sim -s -r out/forge_scout/worlds/forge_scout_trial.sdf

# Terminal 2: GUI client using the same world layout
gz sim -g out/forge_scout/worlds/forge_scout_trial.sdf
```

Notes:

- On macOS, use the split `-s` / `-g` flow above. `gz sim <world.sdf>` is not supported there.
- Click the 3D view so it has keyboard focus, then use `W` / `X` for forward / reverse, `A` / `D` to rotate, `Q` / `E` / `Z` / `C` for diagonals, and `S` or `Space` to stop.
- For older exports created before the GUI plugin was added, load `Key Publisher` manually from the Gazebo GUI plugins menu.

Current behavior:

- Per-link geometry is exported as STL mesh assets
- Collision geometry reuses the same mesh unless `collision: 'none'` is set on a link
- Link mass comes from `massKg`, else `densityKgM3 * volume`, else a default density
- Inertia is an approximate box fit based on link bounds
- Coupled joints are currently rejected
- Parts without geometry are currently rejected

### PNG Render (requires Chrome)

```bash
forgecad render examples/cup.forge.js [output.png]
forgecad render examples/api/notebook-iteration.forge-notebook.json [output.png]
forgecad render examples/cup.forge.js out/scene.png --scene '{"camera":{"projectionMode":"perspective","position":[200,-160,120],"target":[0,0,20],"up":[0,0,1]},"objects":{"obj-2":{"visible":false},"obj-3":{"opacity":0.35}}}'
```

Renders 3D shapes to PNG images from multiple camera angles. Uses Puppeteer to launch headless Chrome with WebGL for Three.js rendering.

When the input is a notebook, `forgecad render` renders the notebook's preview cell.

**How it works:**
1. `cli/forge-render.mjs` — Node launcher script. Auto-starts Vite dev server if not running, launches Puppeteer.
2. `cli/render.html` + `cli/render.ts` — Loaded in the browser by Puppeteer. Imports from `src/forge/headless.ts`, runs the script, builds a Three.js scene, renders from multiple angles.
3. Screenshots are captured as base64 PNG and saved to disk.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGE_ANGLES` | `front,side,top,iso` | Camera angles to render |
| `FORGE_SIZE` | `1024` | Image size in pixels |
| `FORGE_PORT` | `5173` | Vite dev server port |
| `CHROME_PATH` | Auto-detected | Chrome/Chromium executable path |

**CLI options:**
- `--angles <front,side,top,iso>` — standard angles to render
- `--size <px>` — output size override
- `--port <n>` — Vite port override
- `--camera <spec>` — exact camera pose, e.g. `proj=perspective;pos=120,80,120;target=0,0,0;up=0,0,1`
- `--scene <json>` — full scene state copied from the viewport, including camera plus object visibility/opacity/color overrides
- `--background <color>` — background override
- `--chrome-path <path>` — Chrome executable path override

**Camera angles:** `front` (−Y), `back` (+Y), `side` (+X), `top` (+Z), `iso` (diagonal)

### Animated Capture (GIF or MP4, requires Chrome)

```bash
forgecad capture gif examples/cup.forge.js [output.gif]
forgecad capture mp4 examples/cup.forge.js [output.mp4]
forgecad capture gif examples/api/notebook-assembly-debug.forge-notebook.json --list
forgecad capture mp4 examples/api/runtime-joints-view.forge.js out/step.mp4 --capture animation --animation Step
forgecad capture gif examples/3d-printer.forge.js out/section.gif --cut-plane "Front Section"
```

Creates high-quality animated captures from the real Forge viewport renderer:
- Orbit captures with optional wireframe pass
- Fixed-camera animation captures for `jointsView()` clips
- Named cut-plane captures
- Exact camera replay via `--camera`
- Full viewport scene replay via `--scene`

When the input is a notebook, `forgecad capture gif` / `forgecad capture mp4` capture the notebook's preview cell.

**How it works:**
1. Auto-starts (or reuses) the Vite dev server.
2. Loads `cli/render.html` in headless Chrome.
3. Runs the script once, then captures frames from the same scene while applying the selected animation, cut planes, and camera pose.
4. Encodes with `ffmpeg` when available:
   - GIF: palettegen/paletteuse for much better colors
   - MP4: H.264 via `libx264`
5. Falls back to the pure-JS GIF encoder only when `ffmpeg` is unavailable.

**Options:**
- `--format <gif|mp4>` — output format
- `--capture <orbit|animation>` — moving orbit camera or fixed animation camera
- `--animation <name>` — select one `jointsView()` clip
- `--animation-loops <n>` — repeat the chosen clip
- `--cut-plane <name>` — enable a named cut plane (repeatable)
- `--camera <spec>` — exact camera pose, e.g. `proj=perspective;pos=120,80,120;target=0,0,0;up=0,0,1`
- `--scene <json>` — full scene state copied from the viewport, including camera plus object visibility/opacity/color overrides
- `--render-mode <solid|wireframe>` — primary render mode
- `--include-wireframe-pass` / `--no-wireframe-pass` — control the extra wireframe pass
- `--size <px>` — output frame resolution (default `960`)
- `--pixel-ratio <n>` — render supersampling factor (default `2`)
- `--fps <n>` — capture frame rate (default `24`)
- `--frames-per-turn <n>` — frames per full orbit pass (default `72`)
- `--hold-frames <n>` — freeze frames before each pass (default `6`)
- `--pitch <deg>` — orbit elevation override
- `--background <color>` — background color (default `#252526`)
- `--quality <default|live|high>` — Forge geometry quality preset for export (default `high`)
- `--encoder <auto|ffmpeg|js>` — GIF encoder strategy
- `--crf <n>` — MP4 quality for `libx264` (default `18`)
- `--list` — print the script's available animation clips and cut planes
- `--port <n>` — Vite port (default `5173`)
- `--chrome-path <path>` — Chrome executable path override
- `--ffmpeg-path <path>` — ffmpeg executable path override

**Environment variables:**
- `FORGE_CAPTURE_SIZE`
- `FORGE_CAPTURE_PIXEL_RATIO`
- `FORGE_CAPTURE_FPS`
- `FORGE_CAPTURE_FRAMES_PER_TURN`
- `FORGE_CAPTURE_HOLD_FRAMES`
- `FORGE_CAPTURE_PITCH_DEG`
- `FORGE_CAPTURE_BACKGROUND`
- `FORGE_CAPTURE_QUALITY`
- `FORGE_CAPTURE_ANIMATION_LOOPS`
- `FORGE_CAPTURE_CRF`
- `FFMPEG_PATH`
- Legacy `FORGE_GIF_*` vars are still honored as fallbacks
- `FORGE_PORT`
- `CHROME_PATH`

**UI scene handoff:**
- The View Panel exposes a `Camera` section.
- Use `Copy CLI --scene` to grab the current viewport framing plus per-object scene overrides and paste it directly into `render`, `capture gif`, or `capture mp4`.

### PDF Report (2D drawing pack)

```bash
forgecad export report examples/cup.forge.js [output.pdf]
forgecad export report examples/cup.forge.js [output.pdf] --dim-angle-tol 18
```

Generates a searchable-text PDF report with multiple projected drawing views:
- Bill of Materials page (auto-summed from script `bom()` entries)
- Combined model page (front/right/top/isometric)
- Disassembled component pages (same view set per unique component geometry; repeated identical items collapse into one page)
- Auto-generated detail continuation pages for elongated/high-detail views (separate pages, not overlayed)
- `dim()` annotations included per view only when their axis aligns with that view's projection plane axes

BOM aggregation rules:
- Each `bom(quantity, description, { unit })` call contributes one raw entry
- Report export groups by `key` (if provided) else by normalized `description + unit`
- Quantities are summed per group and rendered as line items in the BOM table

Component dimension ownership for disassembled pages:
- Preferred: explicit binding via `dim(..., { component: \"Part Name\" })`
- Imported-part ownership: `dim(..., { currentComponent: true })` to pin to the owning returned component instance (no bbox heuristic)
- Other-component ownership: `dim(..., { component: \"Tabletop\" })`
- If multiple owners are bound (e.g. `currentComponent: true` plus another component), it is treated as shared and stays on the overview page
- Fallback: automatic ownership only when both dimension endpoints are unambiguously inside exactly one returned component bounding box
- Ambiguous dimensions are intentionally skipped for disassembled pages

Optional report flag:
- `--dim-angle-tol <degrees>`: include dimensions whose projected direction is within this many degrees of the nearest view axis (default: `12`)

### STL Export (from browser)

STL export is available in the browser UI via the Export panel. Binary STL format.

### Parameter Validation

```bash
forgecad check params examples/shoe-rack-doors.forge.js [--samples 10]
```

Samples each parameter across its range and checks for runtime errors, degenerate geometry (volume ≈ 0), and new collisions between parts. Skips intra-group collisions when assembly groups are used.

**Options:**
- `--samples N` — Number of sample points per parameter (default: 8)

**Output example:**
```
✓ Baseline: 6 objects, 12 params
✓ Checked 91 parameter samples (8 per param)

⚠ Found 8 issues across 4 parameters:

  Parameter "Bottom Left Door":
    💥 New collision at values: -120.0, -102.9
       Bottom Left Door ∩ Frame (shared vol: 2561.9mm³)
```

### Transform/Assembly Invariant Check

```bash
forgecad check transforms
```

Runs fast math-level invariants to catch transform order and frame composition regressions before they leak into examples.

### Compiler Snapshot Check

```bash
forgecad check compiler
forgecad check compiler --case segmented-runtime-hints
forgecad check compiler --update
```

Runs curated compiler regression cases and compares them against committed snapshots.
This is a unit-style invariant check, not just a debugger convenience.
The ordinary multi-feature part corpus lives in [`examples/compiler-corpus/README.md`](../../examples/compiler-corpus/README.md).

Each snapshot records:
- Forge compile plans
- CadQuery/OCCT lowerings
- export routing decisions
- quantized runtime Manifold mesh summaries
- quantized compiler-lowered Manifold mesh summaries

This check also fails if:
- a plan-covered shape or sketch no longer matches its compiler-lowered runtime output
- export manifests drift away from the per-object compiler routing decisions
- exact/faceted support claims stop matching the lowered artifacts and diagnostics

### Query Propagation Snapshot Check

```bash
forgecad check query-propagation
forgecad check query-propagation --case hull-runtime-boundary
forgecad check query-propagation --update
```

Runs focused topology-rewrite query-propagation snapshots without dumping the
entire compiler scene. This keeps supported, ambiguous, and intentionally
unsupported rewrite semantics reviewable as the propagation layer evolves.

Each snapshot records:
- the propagated shape objects that actually carry topology-rewrite metadata
- exact versus faceted routing outcomes for those objects
- deterministic rewrite-operation ordering
- preserved and created query summaries
- explicit ambiguity/unsupported diagnostic codes

This check also fails if:
- a defended propagation case loses the expected preserved or created query shape
- a known unsupported rewrite stops reporting its explicit diagnostic boundary
- a multi-feature corpus part stops surfacing the expected rewrite ordering

### Example Architecture Gate

```bash
forgecad check examples
forgecad check examples --family api-parts --family compiler-corpus
forgecad check examples --example examples/api/brep-exportable.forge.js
```

Runs the checked example manifest for the entire `examples/` tree.

The manifest currently lives in `cli/example-manifest/` and covers every:

- `.forge.js`
- `.sketch.js`
- `.forge-notebook.json`

The command always verifies manifest coverage first, so it fails if:

- a new example file was added without classification
- a checked manifest entry points at a missing file
- an example's assigned validation path fails
- a `part` example's declared route expectation no longer matches the compiler report

Current example classes:

- `part`: runtime execution plus optional exact/faceted route assertions on the selected primary shapes
- `assembly`: runtime solve + scene emission, not exact-route parity
- `runtime-scene`: viewport/report/runtime examples that still need to execute successfully
- `sketch`: sketch payload validation via the sketch export path
- `notebook`: preview-cell validation for `.forge-notebook.json`
- `experimental`: temporary fenced examples that still have to run

The gate dispatches by declared validation path, not just by class label:

- `part-runtime`: execute and then enforce any declared exact/faceted route contract
- `assembly-runtime`: execute and validate solved-scene/assembly-owned runtime behavior
- `runtime-scene`: execute as a viewport/report/runtime scene without treating it as part-route evidence
- `sketch-svg`: render returned sketch payloads through the sketch SVG path
- `notebook-preview`: materialize and execute the notebook preview cell
- `experimental-runtime`: execute only, while the example stays outside the active architecture claim

For non-part entries, the manifest can also pin specific runtime surfaces that
must remain available to repo checks, such as BOM entries, cut planes,
`jointsView()` controls, grouped scene structure, or collected
`robotExport(...)` data.

Current part route states:

- `exact`: selected primary shapes must stay on the exact compiler route
- `faceted`: exact must stay blocked and allow-faceted must succeed with diagnostics
- `holdout`: runtime-checked, but intentionally outside the exact-route claim because the example still mixes route outcomes or depends on a documented unsupported capability; this is a temporary recovery state and should normally trend back to zero

Successful runs also print the current temporary fence list, including each
remaining `holdout` or `experimental` entry's blocker and follow-up task, so
the command output can be used directly in a phase-entry review.

Use `--family` when a task owns only one manifest lane, and `--example` when you
want to debug a single checked artifact.

### Invariant Test Suite

```bash
forgecad check suite
npm test
npm run test:examples
npm run test:compiler
npm run test:compiler:update
npm run test:query-propagation
npm run test:query-propagation:update
```

ForgeCAD's current unit-test surface is assertion-based CLI checks, not a separate Vitest/Jest harness.

The important entrypoints are:
- `npm test` runs the repo invariant suite (`transforms`, `dimensions`, `placement`, `js-modules`, `brep`, `compiler`, `query-propagation`, `examples`, `api`)
- `npm run test:examples` runs the example architecture gate across the checked `examples/` manifest
- `npm run test:compiler` runs just the compiler snapshot/invariant suite
- `npm run test:compiler:update` refreshes committed compiler snapshots after an intentional change
- `npm run test:query-propagation` runs the focused topology-rewrite query-propagation snapshots
- `npm run test:query-propagation:update` refreshes those query-propagation snapshots after an intentional change
- `forgecad check suite` is the CLI equivalent of the invariant suite runner

### Dimension Propagation Invariant Check

```bash
forgecad check dimensions
```

Runs shape-level invariants for dimension metadata propagation across:
- transform APIs (`translate`, `rotate`, `transform`, `scale`, `mirror`, `rotateAround`)
- copy/style APIs (`clone`, `color`, `setColor`, `smooth/refine/simplify`)
- boolean APIs (`add/subtract/intersect`, plus `union/difference/intersection/hull3d`)
- import runtime path (`importPart(...).color(...).translate(...)`)

### Dimension Debugger

```bash
forgecad debug dimensions /path/to/file.forge.js [--all]
forgecad debug dimensions /path/to/file.forge.js [--all] [--dim-angle-tol 12]
```

Prints:
- total object count
- total dimension count
- per-view visibility counts (`front/right/top/iso`) using report angle tolerance
- report ownership routing (`combined` vs `component:<name>`) per dimension
- per-object approximate dimension ownership (both endpoints inside object bbox)
- a dimension coordinate list (first 20 by default, `--all` for full dump)

### Compiler Debugger

```bash
forgecad debug compiler /path/to/file.forge.js
forgecad debug compiler /path/to/file.forge.js --compact
```

Prints JSON for the current script's compiler state, including:
- per-object compile plans
- CadQuery/OCCT lowering diagnostics and lowered plans
- faceted fallback eligibility
- runtime Manifold summaries
- compiler-lowered Manifold summaries

### Local Branch Cleanup

```bash
uv run cli/forge-prune-local-branches.py
uv run cli/forge-prune-local-branches.py --dry-run
uv run cli/forge-prune-local-branches.py --base mainline
```

This is a `uv`-backed Python utility for repository housekeeping. It finds local branches with no matching remote branch that are already merged into the selected base ref, shows them in a Rich terminal UI, then prompts one by one before deleting anything.

Behavior:
- Deletes with `git branch -d`, not force-delete
- Removes linked worktrees first when the branch is checked out in a secondary worktree
- Requires an explicit `force` choice if one of those linked worktrees is dirty
- Refuses to touch the current worktree, the primary worktree, or prunable/missing worktree entries
- `--path` lets you point at any location inside the target repository

## Adding New CLI Commands

1. Create or extend a module under `cli/`
2. Import from `../src/forge/headless`
3. Call `await init()` to load the WASM kernel
4. Use `runScript(code, fileName, allFiles)` to execute user scripts
5. Register the new subcommand in `cli/forgecad.ts`

### Minimal Example

```typescript
#!/usr/bin/env node
import { readFileSync } from 'fs';
import { init, runScript } from '../src/forge/headless';

const code = readFileSync(process.argv[2], 'utf-8');

await init();
const result = runScript(code, 'main.forge.js', {});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

for (const obj of result.objects) {
  if (obj.shape) {
    console.log(`${obj.name}: volume=${obj.shape.volume().toFixed(1)}mm³`);
  }
  if (obj.sketch) {
    console.log(`${obj.name}: area=${obj.sketch.area().toFixed(1)}mm²`);
  }
}
```

### Cross-file imports

When running scripts that use `importSketch()` / `importSvgSketch()` / `importPart()` or plain JS module imports, pass all project files (or at least all files reachable by imports), keyed by project-relative path. This supports root-relative and relative imports, utility `.js` modules, and `.svg` assets (`./assets/logo.svg`):

```typescript
import { readdirSync, readFileSync } from 'fs';

const allFiles: Record<string, string> = {};
for (const f of readdirSync(scriptDir)) {
  if (f.endsWith('.forge.js') || f.endsWith('.sketch.js') || f.endsWith('.js') || f.endsWith('.svg')) {
    allFiles[f] = readFileSync(join(scriptDir, f), 'utf-8');
  }
}

const result = runScript(code, 'main.forge.js', allFiles);
```

For utility modules that want explicit ForgeCAD imports instead of globals, use the virtual runtime module:

```javascript
import { box, union } from "forgecad";
```

Keep using `importPart()` / `importSketch()` for model/sketch files when you want ForgeCAD-specific behavior like param override scopes or SVG parsing.

## Dependencies

| Package | Purpose | Context |
|---------|---------|---------|
| `forgecad` | Installable CLI binary (`forgecad ...`) | Runtime package |
| `puppeteer-core` | Headless Chrome for PNG/GIF/MP4 rendering | Runtime dependency |
| `manifold-3d` | Geometry kernel (WASM) | Works in both Node and browser |
| `three` | 3D rendering (used by render.ts) | Loaded in browser context by Puppeteer |

---
skill-group: cli
skill-order: 1
---

# ForgeCAD CLI

Create projects, open local studios, run, inspect, export, publish, and sync `.forge.js` models from your terminal. Licensing tiers are summarized once in [Setup & Licensing](#setup--licensing).

## Quick Start

```bash
# 1. Install
npm install -g forgecad

# 2. Sign in and create a dedicated project folder
forgecad login
mkdir spool-adapter
cd spool-adapter
forgecad project init "Spool Adapter" --visibility private

# 3. Create a first model file
forgecad new adapter --template part

# 4. Open the local editor
forgecad studio .

# 5. Validate, export, and push to the browser
forgecad run adapter.forge.js
forgecad export stl adapter.forge.js
forgecad project push
forgecad project open
```

Local modeling, inspection, export, and skill-install commands do not require a ForgeCAD account. Hosted project sync, publishing, token management, and license activation require sign-in: run `forgecad login` and choose email/password or API token (for GitHub/Google accounts, create a token in Settings > API Tokens first). Use `FORGECAD_TOKEN=fc_pat_... forgecad <hosted-command>` only for CI/CD and one-off automation. `forgecad studio` always requires an explicit project path; use `.` for the current project.

You can also start from the hosted starter project with `forgecad project clone start-here`, then `cd start-here` and `forgecad studio .`.

## Editor

ForgeCAD includes a local editor. Open it around a dedicated project folder, edit a `.forge.js` file, save, and the 3D view updates — parameters become interactive sliders.

| Command | Description |
|---------|-------------|
| `studio <project-path> [project-path ...]` | Open the installed local editor around one or more project folders. |
| `dev <project-path> [project-path ...]` | Start the Vite dev server for ForgeCAD source development. |
| `web` | Start a local dev server in web/playground mode (no filesystem, localStorage only). |

`forgecad studio <project-path>` is the normal installed-CLI command for users. `forgecad dev <project-path>` starts the Vite dev server and is mainly for ForgeCAD source development.

Keep one long-running `forgecad studio <project-path> [project-path ...]` process open with every active project folder listed in its arguments; the user opens the single printed localhost port once, and AI agents should only create or edit files under those folders so the browser updates live without starting more servers.

<details>
<summary>Common flags for studio / dev</summary>

| Option | Description |
|--------|-------------|
| `--port <n>` | Bind to a specific port |
| `--host [host]` | Expose the server on the network |
| `--open` | Open a browser window automatically |
| `--strict-port` | Fail instead of selecting another port |

</details>

## Run & Render

Execute scripts and produce images headless — no browser window. Renders use Chrome under the hood.

### `forgecad run`

Execute a Forge script quickly and print the inner-loop build summary: build count, verification results, parameters, and timing.

The fast validation command: runs the script with the real geometry kernel (no browser) and reports build status, object count, `verify.*` pass/fail with expected vs actual values (non-fatal — the model still renders), parameter values, script logs, and timing. Run it frequently while editing.

A bare `forgecad run` skips expensive diagnostics. Opt in with `--details` (volumes/bounds), `--history` (construction tree), `--features` (feature tallies), `--solver-profile` (constraint solver timing), or `--connectivity` (physical connected components — bbox contact is evidence, exact geometry is checked by default). `--quality live|default|high` selects the same geometry quality profile as the editor and export tools; `live` is fastest for large models.

Direct `.stl`/`.obj`/`.3mf`/`.step`/`.stp` inputs are imported automatically; STEP/STP auto-selects OCCT unless you pass `--backend`. For deeper confidence gates, prefer `inspect mechanical-integrity`, `check print`, or `inspect fit interference` instead of turning `run` into a catch-all audit command.

```bash
forgecad run model.forge.js
forgecad run model.forge.js other-model.forge.js --quality live
```

### `forgecad ls`

List targetable scene objects for a model.

Runs the model headlessly and prints the exact object paths that CLI tools can target. Use this before focused renders or inspections when object names, groups, or assembly paths are not obvious.

The default output is a compact line-oriented list. Use `--tree` for an indented hierarchy, `--long` for geometry metrics, or `--json` for automation.

```bash
forgecad ls model.forge.js
forgecad ls model.forge.js --tree
```

### `forgecad show`

Render a quick target-focused viewport PNG.

The main quick visual path for agents. Pass a model and, optionally, a target path from `forgecad ls`; ForgeCAD resolves the target and renders that object or group through the existing viewport renderer. Use `--from` for fast camera directions, or pass the lower-level render camera flags when you need exact reproducibility.

Without a target, `show` renders the whole scene and behaves like a shorter, intent-first wrapper around `render 3d`.

```bash
forgecad show model.forge.js
forgecad show model.forge.js --target Bench
```

### Object Filtering: `--focus` and `--hide`

`render 3d`, `render wireframe`, `inspect <family> <mode>`, `capture`, and `check print` can filter the visible object set without changing model code. Use `forgecad ls model.forge.js` to list exact object paths, then pass names or globs:

```bash
forgecad render 3d model.forge.js --output bench.png --focus "Bench.*"
forgecad inspect visual objects model.forge.js --hide "Bench.Slat0,Bench.Slat1" --camera iso
```

- `--focus name1,name2` shows only matching objects; a bare `--focus` (no value) hides mock objects and keeps real ones.
- `--hide name1,name2` removes matching objects. `--focus` and `--hide` are mutually exclusive.
- Matching is case-insensitive with `*` / `?` globs against returned object names — use child names or globs like `Bench.*` for grouped children. Parts unioned into one returned shape cannot be isolated.
- Filtering happens after the script runs (the full model is always evaluated). Filtered renders fail when no renderable objects remain, and exact cameras report visible objects partially or fully outside the frame.

### `forgecad inspect`

Inspect a model by asking for one explicit kind of evidence.

`forgecad inspect` is the evidence-first inspection surface. Pick the job you want to verify, then choose the view like you would with `render 3d`.

- `inspect sketch` — returned sketch/profile regions, selector dry-runs, and extrusion compatibility
- `inspect history` — final-object feature recipes and feedback anchors
- `inspect design-trace` — raw construction DAG, source spans, and cache diagnostics
- `inspect section` — agent-native one-off section probe with optional ray rulers and replay JSON
- `inspect replay` — rerun a saved section probe on the same or another source
- `inspect visual image|cutaway|depth|normals|rig|objects` — visual context, clipped 3D cutaways, depth, normals, rig skeletons, and identity evidence
- `inspect surface zebra|roughness` — surface continuity and roughness evidence
- `inspect physical components|floating|gaps` — physical component graph evidence
- `inspect fit interference` — positive-volume overlap evidence
- `inspect manufacture thickness` — wall-thickness evidence
- `inspect compare overlay` — candidate-vs-reference visual mismatch evidence
- `inspect sections at|stack|sample` — exact section evidence for precise cuts, dense scans, or sparse samples
- `inspect mechanical-integrity` — model-focused integrity audit for generated assemblies

```bash
forgecad inspect history main.forge.js --object "Left Leg" --level object
forgecad inspect design-trace main.forge.js --query feature:hole
```

### `forgecad inspect sketch`

Inspect returned sketches and profile regions used by returned shapes.

External inspection: runs the model, then reads returned `Sketch`/`ConstraintSketch` objects and profile-bearing shape compile plans (extrude, cut, revolve) — model code never calls an inspection API. Reports filled selectable regions (sorted largest-first, run-local ids like `R0`) and excluded hole interiors. `--seed x,y` is the stable selection mechanism (not region ids): it dry-runs which region a point selector would consume, and seed failures exit nonzero (outside every region, on a boundary, inside a hole, ambiguous, or incompatible operation). `--operation extrude` checks only whether the selected filled region can be consumed by extrusion.

```bash
forgecad inspect sketch model.forge.js
forgecad inspect sketch model.forge.js --json --object "Body" --seed 45,15 --operation extrude
```

The full `inspect sketch` JSON contract (`targets[]`/`regions[]`/`holes[]`/`selection`/`profileTree` semantics) lives in [guides/inspection-bundles.md](guides/inspection-bundles.md).

### `forgecad render`

Render a Forge scene. Use a subcommand — `3d`, `views`, `section`, `wireframe`, `sketch`, or `hq`.

`forgecad render` is a group of rendering subcommands. Pick one based on what you want:

- `render 3d` — standard viewport PNG, the usual way to visually verify geometry
- `render views` — list named cameras declared with `scene({ views })`
- `render wireframe` — edges only, no shading
- `render section` — 2D cross-section cut by a plane (SVG or PNG)
- `render sketch` — 2D sketch script to PNG
- `render hq` — path-traced via Blender Cycles, for documentation and marketing shots

```bash
forgecad render 3d model.forge.js
forgecad render section model.forge.js --plane XZ
```

### `forgecad render 3d`

Render a Forge scene to PNG using the real viewport renderer.

Launches headless Chrome, renders the scene with the same WebGL viewport as the editor, and saves a PNG. The output path defaults to `<script-name>.png` next to the input; the input can be a `.forge.js` script or a direct `.stl`/`.obj`/`.3mf`/`.step`/`.stp` asset.

`--camera` accepts built-in views (`front`, `top`, `iso`), `azimuth:elevation` angles, or an exact `proj/pos/target/up/fov` camera spec — pass it multiple times to render several viewpoints in one run. `--view` selects a named camera declared in `scene({ views })`; `--camera-json <file>` or `--scene <file>` give exact reproducible cameras without shell escaping. `--focus`/`--hide` filter visible objects; `--edges=<off|thin|bold>` controls the edge overlay.

This is the standard way to visually verify geometry from the CLI or in agent workflows. For path-traced quality use `render hq`; for edges only use `render wireframe`.

```bash
forgecad render 3d model.forge.js
forgecad render 3d model.forge.js --camera front --camera side --edges bold
```

### `forgecad render views`

List named camera views declared by a model with `scene({ views })`.

Runs the script headlessly and prints every named render view with an exact camera spec that can be passed back to `render 3d`, `render hq`, or `capture`.

```bash
forgecad render views model.forge.js
forgecad render views model.forge.js reference.step
```

### `forgecad render wireframe`

Render a Forge scene as a wireframe (edges only, no shading).

Same as `render 3d` but renders only the edge geometry — no shaded surfaces. Useful for construction-style documentation or highlighting structural features without material detail.

```bash
forgecad render wireframe model.forge.js
forgecad render wireframe model.forge.js --camera iso
```

### `forgecad render hq` **\[Pro\]**

High-quality render via Blender Cycles — path-traced, HDRI, material presets.

Exports the scene to Blender and renders with Cycles (path tracer); requires Blender on PATH. Output defaults to `<script-name>-hq.png`.

`--preset` picks the look (`studio`, `dramatic`, `clay`, `glass`, `metallic`, `toon`, `xray`, `normals`, `silhouette`, and more); `--samples` (default 256) trades quality vs speed; `--transparent` gives a compositing-ready background. Camera control (`--view`, `--camera`, `--camera-json`, `--scene <file>`) matches `render 3d`.

```bash
forgecad render hq model.forge.js
forgecad render hq model.forge.js --output hero.png --preset dramatic --samples 1024
```

### `forgecad capture gif|mp4` **\[Pro\]**

Animated orbit, section sweep, or named joint playback.

Renders an animated sequence: `--capture orbit` (default) for a turntable, `--capture animation --animation <name>` for a named joint clip, or `--capture section-sweep` to move a clipping plane through the model. `--cut-plane` keeps a static cross-section visible while animating; the orbit base or fixed camera comes from `--view`, `--camera`, `--camera-json`, or `--scene <file>`.

```bash
forgecad capture gif model.forge.js
forgecad capture gif model.forge.js other-model.forge.js
```

### `forgecad render section`

Render a 2D cross-section of a 3D model (cut by a plane) to SVG or PNG.

Cuts all shapes in the scene with an axis-aligned plane and produces a 2D cross-section drawing. The default plane is XY at Z=0. Use `--plane XZ` or `--plane YZ` for other orientations, and `--offset` to shift the cut position.

Output defaults to `.svg`; pass `--format png` or a single-input `--output *.png` path for a rasterized PNG at `--size` pixels. Use `--edges=<off|thin|bold>` to control the outline stroke on cut shapes.

Useful for verifying internal geometry, wall thicknesses, and fit checks that aren't visible in 3D renders.

```bash
forgecad render section model.forge.js
forgecad render section model.forge.js --output out/section.svg --plane XZ --offset 10
```

| Command | Description |
|---------|-------------|
| `render sketch` | Render a 2D sketch .forge.js to PNG. |

### Behavioral notes

- Each render starts a private renderer server by default, so parallel renders do not collide. When sharing one server via `--port`, run renders sequentially — concurrent renders against a shared Vite server race and time out.
- Direct `.step` / `.stp` inputs auto-select the OCCT backend unless `--backend` is passed.
- Passing `--camera` several times writes one PNG per camera named `<output>_<camera>.png`; a single camera writes exactly the given output path. If a multi-camera run does not emit the PNGs you expect, rerun one camera at a time with explicit output paths.

### Cross-cutting flags

These flags work across script-backed run, render, export, capture, inspect, and check commands that evaluate `.forge.js` files. Use `--param Key=Value` for parameter overrides; repeat it for multiple parameters.

| Option | Description |
|--------|-------------|
| `--param <Key=Value>` | Override a parameter value (Key=Value). Repeatable. |
| `--joint <JointName=Value>` | Override a Motion tab joint value (JointName=Value). Repeatable. |
| `--focus <names>` | Focus: no arg hides mocks; comma-separated names/globs show only those |
| `--hide <names>` | Hide comma-separated object names/globs |
| `--camera <front\|back\|side\|right\|top\|iso\|az:el\|az:el:dist\|spec>` | Camera preset, spherical (az:el), or full spec such as `proj=perspective;pos=x,y,z;target=x,y,z;up=x,y,z;fov=45`. Repeatable. |
| `--view <name>` | Named camera view declared by the model with scene({ views }) |
| `--size <px>` | Image size in pixels |
| `--backend <manifold\|occt\|truck\|sdf>` | Geometry backend (default: manifold; STEP inputs default to OCCT) |
| `--quality <default\|live\|high>` | Mesh quality preset |
| `--json` | Print machine-readable JSON |

Every command has more — Blender-only `render hq` flags (`--preset`, `--samples`, `--engine`, `--hdri`, `--transparent`, `--video`) and capture-only flags (`--capture`, `--animation`, `--cut-plane`, `--sweep-*`, `--fps`) among them. Run `forgecad <command> --help` for the full list.

## Export

Export to every format you need.

| Command | Format | Use case |
|---------|--------|----------|
| `cut-list` **\[Production\]** | Terminal | Grouped sheet-material cut list from `sheetStock()` |
| `export svg` | SVG | 2D vector output from sketches |
| `export sketch-pdf` **\[Production\]** | PDF | Sketch with dimensions and constraints |
| `export step` **\[Production\]** | STEP | CAD interchange (exact geometry) |
| `export brep` **\[Production\]** | BREP | Boundary representation |
| `export 3mf` | 3MF | 3D printing (color, multi-part) |
| `export stl` | STL | 3D printing |
| `export gcode` **\[Production\]** | G-code | Toolpath (scripted, not sliced) |
| `export sdf` **\[Production\]** | SDF package | Gazebo robot simulation |
| `export mjcf` **\[Production\]** | MJCF package | MuJoCo / MJX robot simulation |
| `export urdf` **\[Production\]** | URDF package | ROS / PyBullet / MuJoCo |
| `export usd` **\[Production\]** | USD package | Isaac Sim / OpenUSD simulation |
| `export report` **\[Production\]** | PDF report | Multi-view report with BOM and dimensions |
| `export cutting-layout` **\[Production\]** | PDF/DXF | Sheet cutting layout with cut sequence |
| `link` | URL | Share link from a GitHub Gist URL or ID (copied to clipboard) |

```bash
# Sheet material
forgecad cut-list shelf.forge.js --param Material=plywood
forgecad export cutting-layout shelf.forge.js --sheet-width 420 --sheet-height 594 --kerf 3
forgecad export cutting-layout shelf.forge.js --output out/layout.dxf

# 3D printing
forgecad check print bracket.forge.js
forgecad export stl bracket.forge.js --param Width=42
forgecad export 3mf bracket.forge.js --quality high

# CAD interchange
forgecad export step bracket.forge.js --param Width=42

# Technical drawings
forgecad export report bracket.forge.js --output out/report.pdf

# Robot simulation
forgecad export sdf rover.forge.js --output out/forge_scout
forgecad export mjcf rover.forge.js --param Wheelbase=180 --output out/forge_scout_mjcf
forgecad export usd rover.forge.js --output out/forge_scout_usd
```

Script-backed exports accept repeatable `--param Key=Value` overrides before the model is evaluated. The MuJoCo/MJX package export command is `export mjcf`.

<details>
<summary>Export flags</summary>

| Option | Description |
|--------|-------------|
| `--param <Key=Value>` | Override a parameter value (Key=Value). Repeatable. |
| `-p <Key=Value>` | Shorthand for --param |
| `--joint <JointName=Value>` | Override a Motion tab joint value (JointName=Value). Repeatable. |
| `--output <path>` | Output SVG path for a single input |
| `--backend <occt\|truck>` | Exact BREP exporter: occt (default) or truck (native analytic kernel) |
| `--quality <default\|live\|high>` | Forge quality preset |
| `-o <path>` | Shorthand for --output |
| `--format <json\|webgpu-brick>` | Implicit artifact format |
| `-q <live\|default\|high>` | Shorthand for --quality |
| `--workgroup-size <x>x<y>x<z>` | WebGPU compute workgroup size |
| `--dim-angle-tol <deg>` | Dimension routing tolerance in degrees |
| `--out <path>` | Alias for --output |
| `--sheet-width <mm>` | Stock sheet width in mm |
| `--sheet-height <mm>` | Stock sheet height in mm |
| `--kerf <mm>` | Cutting clearance (saw blade width) in mm |

</details>

## Projects & Publishing

ForgeCAD has a hosted platform at [forgecad.io](https://forgecad.io). The CLI connects a dedicated local project folder to it.

A project is a local folder linked to the hosted app by `forgecad.json`. Use `forgecad project clone <slug>` to download an existing hosted project into a local folder, or run `forgecad project init` inside a folder that should become a new ForgeCAD project. Open local projects with `forgecad studio <project-path>`.

Keep the project root small and intentional. Do not run the editor from `~`, downloads, desktop, or a huge source tree. ForgeCAD scans project files such as `.forge.js`, `.js`, `.svg`, and `.dxf`; broad roots make local workflows and AI-agent context slow and confusing.

First-time setup (login, init, studio) is the [Quick Start](#quick-start) sequence above. `forgecad project init` creates the remote project, writes `forgecad.json`, pushes any existing local source files, and records server file IDs. `forgecad project push` syncs an already initialized project; it does not create a remote project from an arbitrary folder.

### Sync

```bash
forgecad project push          # Upload local changes
forgecad project pull          # Download remote changes
forgecad project status        # See what's different
```

### Publish

```bash
forgecad project publish adapter.forge.js --title "AMS Lite Adapter"
```

Shares are live references — always the current version, not a snapshot.

<details>
<summary>All project commands</summary>

**Authentication**

| Command | Description |
|---------|-------------|
| `login` | Authenticate with ForgeCAD interactively. |
| `logout` | Clear stored authentication credentials. |
| `whoami` | Show the current user, server, and license status. |

**Projects**

| Command | Description |
|---------|-------------|
| `project init` | Initialize the current directory as a ForgeCAD project and create it on the server. |
| `project clone` | Download a remote project into a new local directory. |
| `project pull` | Download remote changes into the current project. |
| `project push` | Upload local changes to the remote project. |
| `project status` | Show differences between local and remote project files. |
| `project list` | List your remote projects. |
| `project open` | Open the current project in the browser. |
| `project info` | Show details of the current project (name, visibility, files, URL). |
| `project rename` | Rename the current project. |
| `project set-visibility` | Change project visibility. |
| `project delete` | Permanently delete the current project and all its files on the server. |

**Members**

| Command | Description |
|---------|-------------|
| `project members` | List members of the current project. |
| `project add-member` | Add a member to the current project. |
| `project remove-member` | Remove a member from the current project. |
| `project set-role` | Change a member's role. |

**Remote files**

| Command | Description |
|---------|-------------|
| `project file list` | List remote files in the current project. |
| `project file read` | Read a remote file and print its contents. |
| `project file save` | Create or update a remote file. Reads from local file, --content, or --stdin. |
| `project file delete` | Delete a remote file. |
| `project file rename` | Rename or move a remote file. |
| `project file mkdir` | Create a directory in the remote project. |
| `project file copy` | Copy a file from another project into the current one. |

**Shares**

| Command | Description |
|---------|-------------|
| `project publish` | Publish a model and get a shareable link. Auto-syncs project if inside one. |
| `project shares list` | List your published models. |
| `project shares delete` | Unpublish a shared model. |

**API Tokens**

| Command | Description |
|---------|-------------|
| `token create` | Create a new API token for CLI and CI/CD access. |
| `token list` | List your API tokens. |
| `token revoke` | Revoke an API token. |

**Scaffolding**

| Command | Description |
|---------|-------------|
| `new` | Create a new .forge.js file from a template. |

</details>

## AI Integration

ForgeCAD files are plain JavaScript. AI coding agents should work inside an initialized project folder, write and iterate on local files, and use the CLI for evidence. See [AI Usage](AI/usage.md) for approved models, project-first setup, installable skills, quality prompts, and completion criteria.

```bash
# Install the full public ForgeCAD skill library (--target claude|opencode for a specific agent)
forgecad skill install

# Or export a single context file for chat UIs (Claude.ai, ChatGPT, ...)
forgecad skill one-file ~/Desktop/forgecad-context.md

# Or export one flattened Markdown file per bundled skill
forgecad skill flattened-files ~/Desktop/forgecad-skills
```

> **Workflow:** Agent writes the model -> `forgecad run` validates it -> `forgecad inspect mechanical-integrity` catches disconnected AI-slop patterns -> `forgecad check print` catches printability risks -> `forgecad inspect fit interference` or another targeted inspection command produces visual evidence -> export ships the result. All in the terminal.

## Validation

Check printability, simulation readiness, and focused model integrity.

### `forgecad compare 3d`

Score geometric similarity between two ForgeCAD scripts or imported 3D assets.

Runs both inputs headlessly, samples their triangle surfaces, feature edges, bounds, and volume. Use this to grade a reconstructed `.forge.js` model against a reference `.stl`, `.obj`, `.3mf`, `.step`, or `.stp` file. The overall 0-100 score uses multi-threshold bidirectional surface F-scores, sharp/boundary feature-edge F-scores, dimension agreement, volume IoU, and hard caps; JSON output includes threshold, feature, cap, and distance metrics for automation.

```bash
forgecad compare 3d reference.stl reconstruction.forge.js
forgecad compare 3d reference.step reconstruction.forge.js --json --samples 3000
```

### `forgecad check print`

Run fast 3D-print readiness checks for collisions, mesh health, walls, overhangs, and bed contact.

Runs a Forge script with the headless kernel and emits a slicer-adjacent printability report without launching a browser. The check is designed for agents: JSON is stable, failures name the specific print risk, and the default profile is conservative for FDM PLA on a 0.4mm nozzle.

Checks include script `verify.*` results, exact positive-volume object collisions, physical component count, mesh topology, sampled wall thickness, unsupported overhang budget, and bed-contact area. Use `--json` for automation and `--output` to save the full report while keeping the readable terminal summary.

```bash
forgecad check print model.forge.js
forgecad check print model.forge.js other-model.forge.js
```

### `forgecad check simready`

Validate source-authored robot and physics metadata before simulation export.

Runs a Forge script and checks the returned `assembly(...).withSimulation(...)` contract without Isaac Sim, OpenUSD, or NVIDIA validators. The gate validates Sim.body metadata, explicit colliders, contact connectors, controller joints, numeric physics values, and the robot joint graph.

```bash
forgecad check simready model.forge.js
forgecad check simready model.forge.js other-model.forge.js
```

### `forgecad inspect mechanical-integrity`

Inspect generated ForgeCAD models for mechanical integrity failures.

Scans a Forge script or a folder of generated projects and flags timeouts, runtime errors, missing `verify.*` checks, missing executed mechanical-interface checks, fragmented named groups, uncontracted manual assemblies, and (when requested) positive-volume collisions and excessive physical component counts. Details suggest concrete repair patterns. With `--collisions`, the largest overlapping object pairs are listed by volume so the highest-risk interfaces get repaired first; exhausting the exact-check pair or time budget fails the file instead of silently passing a partial check, and truncated script-side joint-sweep validation fails explicitly. Script `console.warn()` diagnostics are reported as warnings; use `verify.*` checks or `console.error()` for gate-failing contracts.

```bash
forgecad inspect mechanical-integrity path/to/generated-models
forgecad inspect mechanical-integrity model.forge.js --min-verifications 2
```

<details>
<summary>Debug commands (ForgeCAD development)</summary>

| Command | Description |
|---------|-------------|
| `debug compiler` | Inspect compiler routes, lowered plans, and runtime snapshots for a script. |
| `debug dimensions` | Inspect report-dimension routing for a script. |
| `debug faces` | Inspect face transformation histories for a script. |

</details>

## Setup & Licensing

| Command | Description |
|---------|-------------|
| `completion` | Generate shell completion scripts for bash, zsh, or fish. |
| `whoami` | Show the current user, server, and license status. |
| `new` | Create a new .forge.js file from a template. |
| `doctor` | Check system dependencies for all CLI features. |

### Licensing

The CLI is free for personal non-commercial use. Pro covers human-operated commercial CAD work, including designing models for customers. Enterprise covers backend, hosted, embedded, or application workflows that call ForgeCAD automatically.

| Free | Production outputs | Pro | Enterprise |
|------|--------------------|-----|------------|
| `run`, `dev`, `studio`, `render 3d`, `export stl`, `export 3mf`, `export svg`, `compare 3d`, `check print`, `inspect fit interference`, `inspect mechanical-integrity` for personal non-commercial use | `cut-list`, `export sketch-pdf`, `export step`, `export brep`, `export gcode`, `export implicit`, `export sdf`, `export mjcf`, `export urdf`, `export usd`, `export report`, `export cutting-layout` are free to run for personal non-commercial use; Pro covers human-operated commercial CAD work | `render hq`, `capture gif`, `capture mp4` plus commercial coverage for client/customer work | Backend, hosted, embedded, or application workflows that call ForgeCAD automatically |

```bash
forgecad license                    # Check local license status
forgecad license activate           # Activate Pro for the signed-in account
forgecad license deactivate         # Remove license
```

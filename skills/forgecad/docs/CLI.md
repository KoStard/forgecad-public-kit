---
skill-group: cli
skill-order: 1
---

# ForgeCAD CLI

Create projects, open local studios, run, inspect, export, publish, and sync `.forge.js` models from your terminal. Core workflows are included with a free ForgeCAD account; advanced exports and rendering are Pro.

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

Most CLI commands require a ForgeCAD account. Use `forgecad login` for email/password accounts, `forgecad login --token` for GitHub/Google web-auth accounts, or `FORGECAD_TOKEN=fc_pat_... forgecad <command>` for CI/CD. `forgecad studio` always requires an explicit project path; use `.` for the current project.

You can also start from the hosted starter project with `forgecad project clone start-here`, then `cd start-here` and `forgecad studio .`.

## Editor

ForgeCAD includes a local editor. Open it around a dedicated project folder, edit a `.forge.js` file, save, and the 3D view updates — parameters become interactive sliders.

| Command | Description |
|---------|-------------|
| `studio <project-path> [project-path ...]` | Open the installed local editor around one or more project folders. |
| `dev <project-path> [project-path ...]` | Start the Vite dev server for ForgeCAD source development. |
| `web` | Start a local dev server in web/playground mode (no filesystem, localStorage only). |
| `open <project-path> [project-path ...]` | Alias for `forgecad studio`. |

`forgecad studio <project-path>` is the normal installed-CLI command for users. `forgecad dev <project-path>` starts the Vite dev server and is mainly for ForgeCAD source development.

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

Execute a Forge script and print full geometry diagnostics — object summary, collision detection, spatial analysis, verification results, and solver profiling.

The primary validation command. Runs your script with the real geometry kernel (no browser needed) and prints a comprehensive report:

**Object summary** — lists every named shape with its volume, bounding box, and body count. For constrained sketches, shows solver status (FULLY / UNDER / OVER constrained), DOF, and error residuals. Problematic constraints (conflicting, redundant, or high-residual) are flagged individually.

**Construction history** — shows the build sequence for each shape (primitives, operations, modifications) so you can verify the modeling intent.

**Feature summary** — tallies geometry features across all objects (e.g. `3 extrude, 2 fillet, 1 chamfer`).

**Verification results** — runs any `verify.*` checks in the script and reports pass/fail with expected vs actual values.

**Automatic collision detection** — performs an all-pairs collision check on every named shape. For each pair whose bounding boxes overlap, computes the boolean intersection and reports overlap above 0.1 mm³:

```
⚠ COLLISION: bolt ∩ base (shared vol: 42.3mm³)
```

Intra-group pairs (same assembly group) and mock-to-mock pairs are skipped. If a part passes through a boolean-subtracted hole, no collision is reported — the material is gone.

**Spatial analysis** — reports directional relationships and gap distances between nearby objects (e.g. `bracket is ABOVE base (gap: 5mm)`). When no issues are found: `(no collisions, all objects well-separated)`.

**Physical connectivity** — pass `--connectivity` to list physically connected components across visible objects. Overlapping or touching bboxes are joined within `--connectivity-tolerance` (default `0.05` model units); use collision inspection for exact positive-volume overlaps. This helps answer whether the model is one continuous assembly or several separate islands.

**Parameters** — lists all declared parameters with their current values. Overridden values are marked with `*`.

**Solver profiling** — when constraint solving occurs, shows timing breakdown (clone, solve, redundancy detection, surface building) and solver internals.

```bash
forgecad run examples/cup.forge.js
forgecad run examples/cup.forge.js --focus
forgecad run examples/cup.forge.js --focus bracket,hinge
forgecad run examples/cup.forge.js --hide "wall,bolt"
forgecad run examples/cup.forge.js --connectivity
forgecad run examples/cup.forge.js --journeys
forgecad run examples/cup.forge.js --backend occt
forgecad run examples/cup.forge.js --debug-imports
forgecad run examples/cup.forge.js -p "Wall Thickness=3" -p "Body Height=200"
forgecad run examples/constraints/06-complex-spectrogram.forge.js --solver-debug-out tmp/spectrogram-debug
```

### `forgecad render`

Render a Forge scene. Use a subcommand — `3d`, `inspect`, `section`, `wireframe`, `sketch`, or `hq`.

`forgecad render` is a group of rendering subcommands. Pick one based on what you want:

- `render 3d` — standard viewport PNG, the usual way to visually verify geometry
- `render inspect` — machine-readable inspection bundle with geometry channels and a manifest
- `render wireframe` — edges only, no shading
- `render section` — 2D cross-section cut by a plane (SVG or PNG)
- `render sketch` — 2D sketch script to PNG
- `render hq` — path-traced via Blender Cycles, for documentation and marketing shots

```bash
forgecad render 3d examples/cup.forge.js
forgecad render inspect examples/api/static-assembly-connectors.forge.js --channels rgb,mask
forgecad render wireframe examples/cup.forge.js
forgecad render section examples/furniture/01-table.forge.js --plane XZ
forgecad render hq examples/cup.forge.js --preset dramatic
```

### `forgecad render 3d`

Render a Forge scene to PNG using the real viewport renderer.

Launches a headless Chrome instance, renders the scene with the same WebGL viewport as the editor, and saves a PNG. The output path defaults to `<script-name>.png` next to the input file.

Use `--focus` to isolate specific parts (hides everything else) or `--hide` to remove clutter like mock objects. The `--view` flag selects a named camera declared in `scene({ views })`. The `--camera` flag accepts built-in views (`front`, `top`, `iso`), `azimuth:elevation` angles, or an exact `proj/pos/target/up/fov` camera spec — pass `--camera` multiple times to render several viewpoints in one run.

Use `--edges=<off|thin|bold>` to control the edge overlay. For a pure wireframe look, use `render wireframe` instead.

This is the standard way to visually verify geometry from the CLI or in agent workflows. For higher quality (path-traced, materials, HDRI lighting), use `render hq` instead.

```bash
forgecad render 3d examples/cup.forge.js
forgecad render 3d examples/cup.forge.js --focus
forgecad render 3d examples/cup.forge.js --focus bracket
forgecad render 3d examples/cup.forge.js --hide "wall,bolt"
forgecad render 3d model.forge.js --view hero
forgecad render 3d model.forge.js --camera 45:30
forgecad render 3d model.forge.js --camera "proj=perspective;pos=200,-160,120;target=0,0,20;up=0,0,1;fov=38"
forgecad render 3d model.forge.js --camera front --camera side
forgecad render 3d model.forge.js --edges bold
forgecad render 3d model.forge.js --edges off
```

### `forgecad render inspect`

Render a machine-readable inspection bundle with geometry channels and a manifest.

Launches the headless viewport renderer and writes a directory bundle for agent and automation workflows. Every channel is opt-in with `--channels`; there is no default bundle. Selected channels emit canonical `front`, `right`, `top`, and `iso` views for RGB, depth, normals, object masks, physical connectivity, rooted component distance, collisions, and wall thickness, or a principal-plane section atlas, plus a root `manifest.json` with scene metadata, filters, object visibility, and relative file paths.

Use `--focus` to isolate specific parts or hide mocks, and `--hide` to remove named clutter. Output defaults to `<script-name>-inspect/` next to the input file.

For bundle layout, channel encodings, and manifest semantics, see [Inspection Bundles](guides/inspection-bundles.md).

```bash
forgecad render inspect examples/api/static-assembly-connectors.forge.js --channels rgb,mask
forgecad render inspect examples/api/static-assembly-connectors.forge.js out/bench-inspect --channels collisions --focus Bench
forgecad render inspect examples/api/static-assembly-connectors.forge.js --channels rgb,mask,collisions --hide "Bench.Slat0" --force
```

### `forgecad render wireframe`

Render a Forge scene as a wireframe (edges only, no shading).

Same as `render 3d` but renders only the edge geometry — no shaded surfaces. Useful for construction-style documentation or highlighting structural features without material detail.

```bash
forgecad render wireframe examples/cup.forge.js
forgecad render wireframe examples/cup.forge.js --camera iso
```

### `forgecad render hq` **\[Pro\]**

High-quality render via Blender Cycles — path-traced, HDRI, material presets.

Exports the scene to Blender and renders with Cycles (path tracer). Requires Blender installed and on PATH.

Choose a `--preset` for the look: `studio` (neutral product shot), `dramatic` (high-contrast), `clay` (matte, no color), `glass`, `metallic`, `toon`, `xray`, `normals`, `silhouette`, and more. Control quality vs speed with `--samples` (default 256). Use `--transparent` for a transparent background (compositing-ready).

Output defaults to `<script-name>-hq.png`. Great for documentation, marketing renders, and social media.

```bash
forgecad render hq examples/cup.forge.js
forgecad render hq examples/cup.forge.js hero.png --preset dramatic --samples 1024
forgecad render hq examples/cup.forge.js --preset clay --size 2048
forgecad render hq examples/cup.forge.js --transparent --preset glass
```

### `forgecad capture gif|mp4` **\[Pro\]**

Animated orbit or joint playback.

Renders an animated sequence by either orbiting the camera around the model or playing back a `jointsView` animation. Use `--capture orbit` (default) for a turntable rotation, `--capture animation --animation <name>` to play a named joints clip, or `--capture section-sweep` to move a clipping plane through the model. Supports `--cut-plane` to animate with a static cross-section visible.

```bash
forgecad capture gif examples/cup.forge.js
forgecad capture gif examples/3d-printer.forge.js out/section.gif --cut-plane "Front Section"
forgecad capture gif model.forge.js out/raw.gif --param "Output=raw-sdf"
forgecad capture gif examples/3d-printer.forge.js out/sweep.gif --capture section-sweep --sweep-plane YZ
forgecad capture mp4 examples/cup.forge.js
forgecad capture mp4 examples/api/runtime-joints-view.forge.js out/step.mp4 --capture animation --animation Step
forgecad capture mp4 model.forge.js out/raw.mp4 --param "Output=raw-sdf"
forgecad capture mp4 examples/3d-printer.forge.js out/sweep.mp4 --capture section-sweep --sweep-plane YZ --sweep-frames 180
```

### `forgecad render section`

Render a 2D cross-section of a 3D model (cut by a plane) to SVG or PNG.

Cuts all shapes in the scene with an axis-aligned plane and produces a 2D cross-section drawing. The default plane is XY at Z=0. Use `--plane XZ` or `--plane YZ` for other orientations, and `--offset` to shift the cut position.

Output format is determined by the file extension: `.svg` (default, vector) or `.png` (rasterized at `--size` pixels). Use `--edges=<off|thin|bold>` to control the outline stroke on cut shapes.

Useful for verifying internal geometry, wall thicknesses, and fit checks that aren't visible in 3D renders.

```bash
forgecad render section examples/furniture/01-table.forge.js
forgecad render section examples/furniture/01-table.forge.js out/section.svg --plane XZ --offset 10
forgecad render section examples/furniture/01-table.forge.js out/section.png --size 2048
forgecad render section examples/furniture/01-table.forge.js out/bold.svg --edges bold
```

| Command | Description |
|---------|-------------|
| `render sketch` | Render a 2D sketch .forge.js to PNG. |

<details>
<summary>All render / capture flags</summary>

| Option | Description |
|--------|-------------|
| `--focus <names>` | Focus: no arg hides mocks; comma-separated names shows only those |
| `--hide <names>` | Hide comma-separated object names |
| `--camera <front\|back\|side\|right\|top\|iso\|az:el\|az:el:dist\|spec>` | Camera preset, spherical (az:el), or full spec such as `proj=perspective;pos=x,y,z;target=x,y,z;up=x,y,z;fov=45`. Repeatable. |
| `--view <name>` | Named camera view declared by the model with scene({ views }) |
| `--size <px>` | Image size in pixels |
| `--scene <json>` | Viewport scene state JSON |
| `--background <color>` | Canvas background override |
| `--render-mode <solid\|wireframe>` | Shaded solid (default) or wireframe only |
| `--edges <off\|thin\|bold>` | Edge overlay preset in solid mode (default: thin) |
| `--render-style <classic\|studio\|fast\|glass>` | Visual render style (default: classic) |
| `--port <n>` | Vite dev server port |
| `--chrome-path <path>` | Chrome or Chromium executable path |
| `--output <path>` | Output file path |
| `--channels <rgb,depth,normals,mask,connectivity,distance,collisions,thickness,section>` | Required inspection channels to emit; no default |
| `--quality <default\|live\|high>` | Mesh/render quality |
| `--force` | Replace an existing bundle directory |
| `--min-thickness <mm>` | Critical thickness threshold in model units |
| `--warn-thickness <mm>` | Warning thickness threshold in model units |
| `--max-thickness <mm>` | Thick/blue heatmap threshold in model units |
| `--thickness-samples <n>` | Maximum sampled triangles per object |
| `--preset <name>` | Material/lighting preset |
| `--width <px>` | Output width in pixels |
| `--height <px>` | Output height in pixels |
| `--samples <n>` | Render samples (more = higher quality, slower) |
| `--engine <cycles\|eevee>` | Render engine |
| `--transparent` | Transparent background (RGBA) |
| `--no-denoise` | Disable denoising |
| `--hdri <path.hdr>` | Custom HDRI environment map path |
| `--video` | Render orbit turntable video (MP4) |
| `--frames <n>` | Video frames per revolution |
| `--fps <n>` | Video frame rate |
| `--pitch <deg>` | Camera pitch angle in degrees |
| `--backend <manifold\|occt>` | Geometry backend |
| `--format <gif\|mp4>` | Output format |
| `--capture <orbit\|animation\|section-sweep>` | Capture preset |
| `--animation <name>` | Named jointsView animation clip |
| `--animation-loops <n>` | Repeat the selected animation clip |
| `--cut-plane <name>` | Enable a named cut plane |
| `--param <Key=Value>` | Override a parameter value (Key=Value). Repeatable. |
| `-p <Key=Value>` | Shorthand for --param |
| `--sweep-plane <XY\|XZ\|YZ>` | Moving plane for section-sweep |
| `--sweep-normal <x,y,z>` | Custom section-sweep normal |
| `--sweep-from <min\|max\|offset>` | Section-sweep start offset |
| `--sweep-to <min\|max\|offset>` | Section-sweep end offset |
| `--sweep-padding <n>` | Auto sweep range padding in model units |
| `--sweep-frames <n>` | Moving frames for section-sweep |
| `--sweep-ease <linear\|smoothstep>` | Section-sweep interpolation |
| `--section-style <hatched\|clean>` | Section cap style for sweep captures |
| `--wireframe-pass` | Enable an extra wireframe pass (off by default) |
| `--no-wireframe-pass` | Disable the extra wireframe pass |
| `--pixel-ratio <n>` | Render supersampling factor |
| `--frames-per-turn <n>` | Frames for one orbit turn |
| `--hold-frames <n>` | Freeze frames before each pass |
| `--encoder <auto\|ffmpeg\|js>` | GIF encoder strategy |
| `--crf <n>` | ffmpeg/libx264 quality |
| `--ffmpeg-path <path>` | ffmpeg executable path |
| `--list` | Print available animations and cut planes |

</details>

## Export

Export to every format you need. Export actions are free to run; production outputs carry commercial-use guidance.

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
| `export urdf` **\[Production\]** | URDF package | ROS / PyBullet / MuJoCo |
| `export report` **\[Production\]** | PDF report | Multi-view report with BOM and dimensions |
| `export cutting-layout` **\[Production\]** | PDF | Sheet cutting layout with cut sequence |
| `link` | URL | Generate a ForgeCAD share link from a GitHub Gist URL or ID and copy it to clipboard. |

```bash
# Sheet material
forgecad cut-list examples/api/sheet-stock-cut-list.forge.js
forgecad export cutting-layout examples/api/sheet-stock-cut-list.forge.js --sheet-width 420 --sheet-height 594 --kerf 3

# 3D printing
forgecad export stl bracket.forge.js
forgecad export 3mf bracket.forge.js --quality high

# CAD interchange
forgecad export step bracket.forge.js
forgecad export step bracket.forge.js --allow-faceted

# Technical drawings
forgecad export report bracket.forge.js out/report.pdf

# Robot simulation
forgecad export sdf rover.forge.js --output out/forge_scout
```

<details>
<summary>Export flags</summary>

| Option | Description |
|--------|-------------|
| `--output <path>` | Output STEP path |
| `--python <path>` | Python interpreter for uv |
| `--uv <path>` | uv executable path |
| `--allow-faceted` | Allow faceted fallback for closed mesh solids |
| `--quality <default\|live\|high>` | Forge quality preset |
| `--backend <manifold\|occt>` | Geometry backend |
| `-o <path>` | Output file path |
| `--dim-angle-tol <deg>` | Dimension routing tolerance in degrees |
| `--sheet-width <mm>` | Stock sheet width in mm |
| `--sheet-height <mm>` | Stock sheet height in mm |
| `--kerf <mm>` | Cutting clearance (saw blade width) in mm |

</details>

## Projects & Publishing

ForgeCAD has a hosted platform at [forgecad.io](https://forgecad.io). The CLI connects a dedicated local project folder to it.

A project is a local folder linked to the hosted app by `forgecad.json`. Use `forgecad project clone <slug>` to download an existing hosted project into a local folder, or run `forgecad project init` inside a folder that should become a new ForgeCAD project. Open local projects with `forgecad studio <project-path>`.

Keep the project root small and intentional. Do not run the editor from `~`, downloads, desktop, or a huge source tree. ForgeCAD scans project files such as `.forge.js`, `.js`, and `.svg`; broad roots make local workflows and AI-agent context slow and confusing.

### Get started

```bash
forgecad login
mkdir spool-adapter
cd spool-adapter
forgecad project init "Spool Adapter"
forgecad new adapter --template part
forgecad studio .

# or clone an existing hosted project:
forgecad project clone start-here
cd start-here
forgecad studio .
```

`forgecad login` prompts for email/password. If your account was created through GitHub or Google, create an API token in Settings > API Tokens and run `forgecad login --token`; it prompts securely when the token is omitted. Use `FORGECAD_TOKEN=fc_pat_...` instead for CI/CD and one-off automation. See [Platform authentication](platform/auth.md#cli-auth-for-oauth-accounts) for details.

`forgecad project init` creates the remote project, writes `forgecad.json`, pushes any existing local source files, and records server file IDs. `forgecad project push` syncs an already initialized project; it does not create a remote project from an arbitrary folder.

### Sync

```bash
forgecad project push          # Upload local changes
forgecad project pull          # Download remote changes
forgecad project status        # See what's different
```

### Publish

```bash
forgecad publish adapter.forge.js --title "AMS Lite Adapter"
```

Shares are live references — always the current version, not a snapshot.

<details>
<summary>All project commands</summary>

**Authentication**

| Command | Description |
|---------|-------------|
| `login` | Authenticate with ForgeCAD by email/password or API token. |
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

**Files (remote)**

| Command | Description |
|---------|-------------|
| `file list` | List remote files in the current project. |
| `file read` | Read a remote file and print its contents. |
| `file save` | Create or update a remote file. Reads from local file, --content, or --stdin. |
| `file delete` | Delete a remote file. |
| `file rename` | Rename or move a remote file. |
| `file mkdir` | Create a directory in the remote project. |
| `file copy` | Copy a file from another project into the current one. |

**Shares**

| Command | Description |
|---------|-------------|
| `publish` | Publish a model and get a shareable link. Auto-syncs project if inside one. |
| `shares list` | List your published models. |
| `shares delete` | Unpublish a shared model. |

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
# Install the full public ForgeCAD skill library
forgecad skill install

# Target a specific local agent skill directory when needed
forgecad skill install --target claude
forgecad skill install --target opencode

# Or export a single context file for chat UIs (Claude.ai, ChatGPT, ...)
forgecad skill one-file ~/Desktop/forgecad-context.md

# Or export one flattened Markdown file per bundled skill
forgecad skill flattened-files ~/Desktop/forgecad-skills
```

> **Workflow:** Agent writes the model -> `forgecad run` validates it -> `forgecad render inspect` produces evidence -> `forgecad check params` sweeps the parameter range -> export ships the result. All in the terminal.

## Validation

Test parameter ranges and run invariant suites.

### `forgecad check params`

Sweep parameter ranges and report runtime failures, degeneracy, and new collisions.

For each declared parameter, samples `N` values evenly across its `[min, max]` range (default 8) while holding all other parameters at their defaults. At each sample, checks for:

1. **Runtime errors** — script crashes at certain parameter values
2. **Degenerate geometry** — shapes with near-zero volume (collapsed geometry)
3. **New collisions** — part pairs that collide at the sampled value but not at the default

Baseline collisions (those present at default parameter values) are listed but not flagged as issues — only *new* collisions introduced by parameter changes are reported. Results are grouped by parameter with the problematic value ranges shown.

```bash
forgecad check params examples/shoe-rack-doors.forge.js
forgecad check params path/to/model.forge.js --samples 12
```

<details>
<summary>All check commands (CI / development)</summary>

| Command | Description |
|---------|-------------|
| `check suite` | Run the repo invariant suite, with smoke and full profiles for the fast merge lane vs the broader regression sweep. |
| `check runtime-globals` | Ensure the script sandbox does not add new lowercase injected globals. |
| `check transforms` | Run transform and assembly invariants. |
| `check dimensions` | Run dimension propagation invariants. |
| `check placement` | Run placement reference invariants. |
| `check js-modules` | Run JavaScript module import invariants. |
| `check brep` | Run exact BREP export invariants. |
| `check constraints` | Run constraint solver invariants and snapshot regression tests. |
| `check compiler` | Run compiler routing snapshots and runtime-vs-lowered invariants. |
| `check query-propagation` | Run focused topology-rewrite query-propagation snapshots and invariants. |
| `check examples` | Run the example architecture gate, with smoke and full profiles for the maintained fast lane vs the full example catalog. |
| `check api` | Run script API contract invariants. |
| `check text` | Run text2d geometry contract tests. |
| `check occt-lower` | Run OCCT lowerer geometry invariant tests. |
| `check backend-parity` | Compare Manifold vs OCCT backend outputs across example files. |

</details>

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

The CLI is free for core workflows and exports. Production outputs are free to run; Pro covers commercial use. High-value render and capture tools require Pro.

| Free | Production outputs | Pro |
|------|--------------------|-----|
| `run`, `dev`, `studio`, `render 3d`, `export stl`, `export 3mf`, `export svg`, `check params`, `check suite` | `cut-list`, `export sketch-pdf`, `export step`, `export brep`, `export gcode`, `export sdf`, `export urdf`, `export report`, `export cutting-layout` are free to run; Pro covers commercial use. | `render hq`, `capture gif`, `capture mp4` |

```bash
forgecad license                    # Check signed-in account status
forgecad license activate           # Activate Pro for the signed-in account
forgecad license deactivate         # Remove license
```

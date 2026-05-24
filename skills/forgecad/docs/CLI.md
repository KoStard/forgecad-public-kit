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

Most CLI commands require a ForgeCAD account. Run `forgecad login` and choose email/password or API token when prompted. Use `FORGECAD_TOKEN=fc_pat_... forgecad <command>` only for CI/CD and one-off automation. `forgecad studio` always requires an explicit project path; use `.` for the current project.

You can also start from the hosted starter project with `forgecad project clone start-here`, then `cd start-here` and `forgecad studio .`.

## Editor

ForgeCAD includes a local editor. Open it around a dedicated project folder, edit a `.forge.js` file, save, and the 3D view updates — parameters become interactive sliders.

| Command | Description |
|---------|-------------|
| `studio <project-path> [project-path ...]` | Open the installed local editor around one or more project folders. |
| `dev <project-path> [project-path ...]` | Start the Vite dev server for ForgeCAD source development. |
| `web` | Start a local dev server in web/playground mode (no filesystem, localStorage only). |

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

Execute a Forge script quickly and print the inner-loop build summary: returned objects, verification results, parameters, and timing.

The fast validation command. Runs your script with the real geometry kernel (no browser needed) and reports whether it built, which objects came back, any `verify.*` results, parameter values, script logs, and elapsed script time. This is the command agents should run frequently while editing a model.

**Fast by default** — a bare `forgecad run model.forge.js` does not compute per-object volumes, bounding boxes, construction history, feature tallies, spatial relationships, collision intersections, or solver profiles. Those diagnostics are useful, but they are no longer part of the hot path.

**Opt-in diagnostics** — use `--details` for volume/bounding-box/object geometry summaries, `--history` for the construction tree, `--features` for feature tallies, `--solver-profile` for constraint solver timing, or `--full` for the legacy rich report. Use `--spatial bounded|exact` only when you want directional relationships and collision intersections from the run command itself.

**Verification results** — runs any `verify.*` checks in the script and reports pass/fail with expected vs actual values. Verification failures remain non-fatal so the model can still render and be inspected.

**Physical connectivity** — pass `--connectivity` to list physically connected components across visible objects. Overlapping bbox candidates are checked with exact geometry by default, while bbox-only contact is treated as evidence rather than proof of one connected component. This helps answer whether the model is one continuous assembly or several separate islands.

**Quality preset** — pass `--quality live|default|high` to select the same geometry quality profile used by the editor and export tools. `live` is the fastest preset for large audit models.

**Direct CAD inputs** — pass `.stl`, `.obj`, `.3mf`, `.step`, or `.stp` directly when you just want to inspect an external asset. Mesh files are imported with `importMesh(...)`; STEP/STP files are imported with `importStep(...)` and auto-select OCCT unless you pass `--backend`.

For deeper confidence gates, prefer `forgecad inspect mechanical-integrity`, `forgecad check print`, or targeted evidence commands such as `forgecad inspect collisions` instead of turning `run` back into a catch-all audit command.

```bash
forgecad run examples/api/static-assembly-connectors.forge.js
forgecad run examples/api/static-assembly-connectors.forge.js --focus
forgecad run examples/api/static-assembly-connectors.forge.js --focus "Bench.Slat*"
forgecad run examples/api/static-assembly-connectors.forge.js --hide "Bench.Slat0,Bench.Slat1"
forgecad run examples/api/static-assembly-connectors.forge.js --details --history
forgecad run examples/api/static-assembly-connectors.forge.js --spatial bounded
forgecad run examples/api/static-assembly-connectors.forge.js --full
forgecad run examples/products/cup.forge.js --connectivity
forgecad run examples/products/cup.forge.js --journeys
forgecad run examples/products/cup.forge.js --backend occt
forgecad run examples/products/cup.forge.js --backend truck --quality live
forgecad run examples/products/cup.forge.js --debug-imports
forgecad run examples/products/cup.forge.js -p "Wall Thickness=3" -p "Body Height=200"
forgecad run examples/constraints/06-complex-spectrogram.forge.js --solver-debug-out tmp/spectrogram-debug
```

### Object Filtering: `--focus` and `--hide`

Several CLI commands can filter the visible object set without changing model code: `run`, `render 3d`, `render wireframe`, `inspect <evidence>`, `capture`, and `check print`.

Use `forgecad run model.forge.js --quality live` to list returned object names quickly, then pass those names to `--focus` or `--hide`.

```bash
forgecad run examples/api/static-assembly-connectors.forge.js --quality live
forgecad render 3d examples/api/static-assembly-connectors.forge.js bench.png --focus "Bench.*"
forgecad render 3d examples/api/static-assembly-connectors.forge.js slats.png --focus "Bench.Slat*"
forgecad inspect collisions examples/api/static-assembly-connectors.forge.js --focus "Bench.*"
forgecad inspect objects examples/api/static-assembly-connectors.forge.js out/bench-objects --hide "Bench.Slat0,Bench.Slat1" --camera iso --force
```

Rules:

- A bare `--focus` hides mock objects and keeps real objects.
- `--focus name1,name2` renders only matching objects.
- `--hide name1,name2` removes matching objects from the visible scene.
- Matching is case-insensitive and supports `*` / `?` globs.
- `--focus` and `--hide` are mutually exclusive.
- Filtering happens after the script runs; it does not avoid evaluating the full model.
- Filtering works on returned object names. For grouped children, use concrete child names or globs like `Bench.*`.
- If a model unions many parts into one returned shape, the original parts cannot be isolated by CLI filtering.

### `forgecad inspect`

Inspect a model by asking for one explicit kind of evidence.

`forgecad inspect` is the evidence-first inspection surface. Pick the thing you want to see or verify, then choose the view like you would with `render 3d`.

- `inspect image` — Capture the normal shaded viewport image evidence.
- `inspect depth` — Capture visible surface depth evidence.
- `inspect normals` — Capture surface normal evidence.
- `inspect zebra` — Capture Zebra stripe surface-continuity evidence.
- `inspect roughness` — Capture mesh roughness and sharp-feature evidence.
- `inspect objects` — Capture object identity evidence.
- `inspect connectivity` — Capture physical connectivity evidence.
- `inspect floating` — Capture floating-body evidence.
- `inspect distance` — Capture rooted component distance evidence.
- `inspect comparison` — Capture candidate-vs-reference comparison evidence.
- `inspect collisions` — Capture collision evidence.
- `inspect thickness` — Capture wall-thickness evidence.
- `inspect sections` — Capture internal section evidence.
- `inspect mechanical-integrity` — model-focused integrity audit for generated assemblies

```bash
forgecad inspect collisions main.forge.js --camera iso
forgecad inspect objects main.forge.js --camera front --camera right
forgecad inspect thickness main.forge.js --min 1.6 --warn 2.4
forgecad inspect comparison candidate.forge.js --with reference.3mf
```

| Command | Description |
|---------|-------------|
| `inspect image` | Capture the normal shaded viewport image evidence. |
| `inspect objects` | Capture object identity evidence. |
| `inspect collisions` | Capture collision evidence. |
| `inspect thickness` | Capture wall-thickness evidence. |
| `inspect sections` | Capture internal section evidence. |
| `inspect comparison` | Capture candidate-vs-reference comparison evidence. |
| `inspect evidence` | List available inspect evidence commands. |

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
forgecad render 3d examples/products/cup.forge.js
forgecad inspect collisions examples/api/static-assembly-connectors.forge.js --camera iso
forgecad render views examples/products/cup.forge.js
forgecad render wireframe examples/products/cup.forge.js
forgecad render section examples/furniture/01-table.forge.js --plane XZ
forgecad render hq examples/products/cup.forge.js --preset dramatic
```

### `forgecad render 3d`

Render a Forge scene to PNG using the real viewport renderer.

Launches a headless Chrome instance, renders the scene with the same WebGL viewport as the editor, and saves a PNG. The output path defaults to `<script-name>.png` next to the input file.

The input can be a `.forge.js` script or a direct `.stl`, `.obj`, `.3mf`, `.step`, or `.stp` asset. Direct STEP/STP rendering auto-selects OCCT unless you pass `--backend`.

Use `--focus` to isolate specific parts (hides everything else) or `--hide` to remove clutter like mock objects. The `--view` flag selects a named camera declared in `scene({ views })`. The `--camera` flag accepts built-in views (`front`, `top`, `iso`), `azimuth:elevation` angles, or an exact `proj/pos/target/up/fov` camera spec — pass `--camera` multiple times to render several viewpoints in one run. Use `--camera-json <file>` or `--scene <file>` for exact reproducible viewport cameras without shell escaping.

Use `--edges=<off|thin|bold>` to control the edge overlay. For a pure wireframe look, use `render wireframe` instead.

This is the standard way to visually verify geometry from the CLI or in agent workflows. For higher quality (path-traced, materials, HDRI lighting), use `render hq` instead.

```bash
forgecad render 3d examples/products/cup.forge.js
forgecad render 3d examples/api/static-assembly-connectors.forge.js --focus
forgecad render 3d examples/api/static-assembly-connectors.forge.js --focus "Bench.Slat*"
forgecad render 3d examples/api/static-assembly-connectors.forge.js --hide "Bench.Slat0,Bench.Slat1"
forgecad render 3d model.forge.js --view hero
forgecad render 3d model.forge.js --camera 45:30
forgecad render 3d model.forge.js --camera "proj=perspective;pos=200,-160,120;target=0,0,20;up=0,0,1;fov=38"
forgecad render 3d model.forge.js --camera-json camera.json
forgecad render 3d model.forge.js --scene scene.json
forgecad render 3d model.forge.js --camera front --camera side
forgecad render 3d model.forge.js --edges bold
forgecad render 3d model.forge.js --edges off
forgecad render 3d bracket.3mf bracket.png
```

### `forgecad render views`

List named camera views declared by a model with `scene({ views })`.

Runs the script headlessly and prints every named render view with an exact camera spec that can be passed back to `render 3d`, `render hq`, or `capture`.

```bash
forgecad render views model.forge.js
forgecad render views model.forge.js --json
```

### `forgecad render wireframe`

Render a Forge scene as a wireframe (edges only, no shading).

Same as `render 3d` but renders only the edge geometry — no shaded surfaces. Useful for construction-style documentation or highlighting structural features without material detail.

```bash
forgecad render wireframe examples/products/cup.forge.js
forgecad render wireframe examples/products/cup.forge.js --camera iso
```

### `forgecad render hq` **\[Pro\]**

High-quality render via Blender Cycles — path-traced, HDRI, material presets.

Exports the scene to Blender and renders with Cycles (path tracer). Requires Blender installed and on PATH.

Choose a `--preset` for the look: `studio` (neutral product shot), `dramatic` (high-contrast), `clay` (matte, no color), `glass`, `metallic`, `toon`, `xray`, `normals`, `silhouette`, and more. Control quality vs speed with `--samples` (default 256). Use `--view`, `--camera`, `--camera-json`, or `--scene <file>` for still camera control, matching `render 3d`. Use `--transparent` for a transparent background (compositing-ready).

Output defaults to `<script-name>-hq.png`. Great for documentation, marketing renders, and social media.

```bash
forgecad render hq examples/products/cup.forge.js
forgecad render hq examples/products/cup.forge.js hero.png --preset dramatic --samples 1024
forgecad render hq examples/products/cup.forge.js hero.png --view hero
forgecad render hq examples/products/cup.forge.js hero.png --camera-json camera.json
forgecad render hq examples/products/cup.forge.js --preset clay --size 2048
forgecad render hq examples/products/cup.forge.js --transparent --preset glass
```

### `forgecad capture gif|mp4` **\[Pro\]**

Animated orbit or joint playback.

Renders an animated sequence by either orbiting the camera around the model or playing back a `jointsView` animation. Use `--capture orbit` (default) for a turntable rotation, `--capture animation --animation <name>` to play a named joints clip, or `--capture section-sweep` to move a clipping plane through the model. Supports `--cut-plane` to animate with a static cross-section visible. Use `--view`, `--camera`, `--camera-json`, or `--scene <file>` to choose the orbit base camera or the fixed camera for animations and section sweeps.

```bash
forgecad capture gif examples/products/cup.forge.js
forgecad capture gif examples/3d-printer.forge.js out/section.gif --cut-plane "Front Section"
forgecad capture gif model.forge.js out/raw.gif --param "Output=raw-sdf"
forgecad capture gif model.forge.js out/front.gif --camera front
forgecad capture gif model.forge.js out/hero.gif --view hero
forgecad capture gif examples/3d-printer.forge.js out/sweep.gif --capture section-sweep --sweep-plane YZ
forgecad capture mp4 examples/products/cup.forge.js
forgecad capture mp4 examples/api/runtime-joints-view.forge.js out/step.mp4 --capture animation --animation Step
forgecad capture mp4 model.forge.js out/raw.mp4 --param "Output=raw-sdf"
forgecad capture mp4 model.forge.js out/front.mp4 --camera front
forgecad capture mp4 model.forge.js out/hero.mp4 --view hero
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
| `--focus <names>` | Focus: no arg hides mocks; comma-separated names/globs show only those |
| `--hide <names>` | Hide comma-separated object names/globs |
| `--camera <front\|back\|side\|right\|top\|iso\|az:el\|az:el:dist\|spec>` | Camera preset, spherical (az:el), or full spec such as `proj=perspective;pos=x,y,z;target=x,y,z;up=x,y,z;fov=45`. Repeatable. |
| `--camera-json <file>` | Exact viewport camera JSON file |
| `--view <name>` | Named camera view declared by the model with scene({ views }) |
| `--size <px>` | Image size in pixels |
| `--scene <json\|file>` | Viewport scene state JSON or JSON file |
| `--background <color>` | Canvas background override |
| `--render-mode <solid\|wireframe>` | Shaded solid (default) or wireframe only |
| `--edges <off\|thin\|bold>` | Edge overlay preset in solid mode (default: off) |
| `--render-style <classic\|studio\|fast\|glass\|precision\|hybrid>` | Visual render style (default: classic) |
| `--port <n>` | Vite dev server port |
| `--fresh-server` | Start a fresh renderer instead of reusing an existing one |
| `--chrome-path <path>` | Chrome or Chromium executable path |
| `--output <path>` | Output file path |
| `--json` | Print machine-readable JSON |
| `--quality <default\|live\|high>` | Mesh quality preset |
| `--backend <manifold\|occt\|truck>` | Geometry backend (default: manifold) |
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
forgecad check print bracket.forge.js
forgecad export stl bracket.forge.js
forgecad export 3mf bracket.forge.js --quality high

# CAD interchange
forgecad export step bracket.forge.js

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
| `--quality <default\|live\|high>` | Forge quality preset |
| `--backend <manifold\|occt\|truck>` | Geometry backend (default: manifold) |
| `-o <path>` | Shorthand for --output |
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

`forgecad login` asks how you want to sign in, then prompts for either email/password or an API token. If your account was created through GitHub or Google, create an API token in Settings > API Tokens, run `forgecad login`, and choose API token. Use `FORGECAD_TOKEN=fc_pat_...` only for CI/CD and one-off automation. See [Platform authentication](platform/auth.md#cli-auth-for-oauth-accounts) for details.

`forgecad project init` creates the remote project, writes `forgecad.json`, pushes any existing local source files, and records server file IDs. `forgecad project push` syncs an already initialized project; it does not create a remote project from an arbitrary folder.

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

> **Workflow:** Agent writes the model -> `forgecad run` validates it -> `forgecad inspect mechanical-integrity` catches disconnected AI-slop patterns -> `forgecad check print` catches printability risks -> `forgecad inspect collisions` or another targeted evidence command produces visual evidence -> export ships the result. All in the terminal.

## Validation

Check printability and run focused model integrity reviews.

### `forgecad score reconstruction`

Score a reconstruction against its compareWith() reference.

Runs the same geometric scorer as `forgecad compare 3d`, but reads the reference from the candidate model's `compareWith()` directive. Use this as the default reconstruction submission command: one candidate path in, one 0-100 score out. Pass `--reference` only when scoring a raw CAD asset or overriding the declared target.

```bash
forgecad score reconstruction reconstruction.forge.js
forgecad score reconstruction reconstruction.forge.js --score-only
forgecad score reconstruction candidate.3mf --reference source.3mf --json --samples 3000
```

### `forgecad compare 3d`

Score geometric similarity between two ForgeCAD scripts or imported 3D assets.

Runs both inputs headlessly, samples their triangle surfaces, feature edges, bounds, and volume. Use this to grade a reconstructed `.forge.js` model against a reference `.stl`, `.obj`, `.3mf`, `.step`, or `.stp` file. The overall 0-100 score uses multi-threshold bidirectional surface F-scores, sharp/boundary feature-edge F-scores, dimension agreement, volume IoU, and hard caps; JSON output includes threshold, feature, cap, and distance metrics for automation.

```bash
forgecad compare 3d reference.stl reconstruction.forge.js
forgecad compare 3d reference.step reconstruction.forge.js --json --samples 3000
forgecad compare 3d source.3mf candidate.3mf --align center --tolerance-mm 0.5 --fail-under 90
```

### `forgecad check print`

Run fast 3D-print readiness checks for collisions, mesh health, walls, overhangs, and bed contact.

Runs a Forge script with the headless kernel and emits a slicer-adjacent printability report without launching a browser. The check is designed for agents: JSON is stable, failures name the specific print risk, and the default profile is conservative for FDM PLA on a 0.4mm nozzle.

Checks include script `verify.*` results, exact positive-volume object collisions, physical component count, mesh topology, sampled wall thickness, unsupported overhang budget, and bed-contact area. Use `--json` for automation and `--output` to save the full report while keeping the readable terminal summary.

```bash
forgecad check print examples/api/attachTo-basics.forge.js
forgecad check print examples/api/verification-demo.forge.js --json
forgecad check print model.forge.js --min-wall 1.2 --warn-wall 2
forgecad check print model.forge.js --expect-components 1 -p "Wall Thickness=3"
```

### `forgecad inspect mechanical-integrity`

Inspect generated ForgeCAD models for mechanical integrity failures.

Scans a Forge script or a folder of generated projects and runs a mechanical integrity inspection. The inspection flags timeouts, runtime errors, missing `verify.*` checks, missing executed mechanical-interface checks, fragmented named groups, uncontracted manual assemblies, optional positive-volume object collisions, and excessive physical component counts when requested. Markdown details include suggested repair patterns such as connector-authored mates, bolted service covers, pinned levers, captured slides, hinges, clevis joints, retained shafts, and seated bearings. When `--collisions` is enabled, the Markdown details list the largest overlapping object pairs by volume so agents can repair the highest-risk interfaces first. Exact collision checks use a default 40-pair bbox-overlap budget and 30s exact-check time budget; exhausting either budget fails the file instead of silently passing a partial check.

```bash
forgecad inspect mechanical-integrity path/to/generated-models
forgecad inspect mechanical-integrity path/to/model/main.forge.js --min-verifications 2
forgecad inspect mechanical-integrity path/to/model/main.forge.js --collisions
forgecad inspect mechanical-integrity path/to/generated-models --collisions --collision-pair-limit 250
forgecad inspect mechanical-integrity path/to/generated-models --json --timeout-ms 40000 --jobs 4
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

The CLI is free for core workflows and exports. Production outputs are free to run; Pro covers commercial use. High-value render and capture tools require Pro.

| Free | Production outputs | Pro |
|------|--------------------|-----|
| `run`, `dev`, `studio`, `render 3d`, `export stl`, `export 3mf`, `export svg`, `score reconstruction`, `compare 3d`, `check print`, `inspect collisions`, `inspect mechanical-integrity` | `cut-list`, `export sketch-pdf`, `export step`, `export brep`, `export gcode`, `export sdf`, `export urdf`, `export report`, `export cutting-layout` are free to run; Pro covers commercial use. | `render hq`, `capture gif`, `capture mp4` |

```bash
forgecad license                    # Check signed-in account status
forgecad license activate           # Activate Pro for the signed-in account
forgecad license deactivate         # Remove license
```

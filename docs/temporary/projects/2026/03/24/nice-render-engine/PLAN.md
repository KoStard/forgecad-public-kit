# High-Quality CLI Render Engine for ForgeCAD

## Goal

Add a CLI-based rendering pipeline that produces stunning, high-quality images from ForgeCAD models — raytracing, path tracing, HDRI lighting, artistic shaders — without touching the existing browser renderer.

## Current State

- **Browser rendering**: Three.js + WebGL via React-Three-Fiber. PBR materials (MeshPhysicalMaterial), basic post-processing (bloom, vignette, grain). No raytracing.
- **CLI rendering**: Puppeteer + headless Chrome captures the browser renderer to PNG/GIF/MP4. Quality ceiling = WebGL rasterization.
- **Exports available**: OBJ, STL, 3MF, STEP, glTF — all readable by external renderers.
- **Scene API**: `scene()` function configures camera, lights, environment, post-processing.

## Architecture: Two-Tier Render Strategy

### Tier 1: Blender/Cycles (Photorealistic)

**Why Blender wins:**
- Cycles is a production path tracer (used in feature films)
- Reads OBJ/STL/glTF natively — ForgeCAD already exports these
- `blender --background --python render.py` — one `child_process.spawn()` call
- Massive material/HDRI ecosystem (Poly Haven, BlenderKit)
- GPL-2.0 but we just spawn it — no linking, no license issues
- Headless on macOS ARM and Linux, no GPU required (CPU fallback)

**Integration plan:**
1. Export model to OBJ/glTF (already implemented)
2. Write a Python render script (~50-100 lines) that:
   - Imports the mesh
   - Applies materials (map from ForgeCAD scene config)
   - Sets up HDRI environment lighting
   - Configures camera (map from ForgeCAD camera presets)
   - Renders with Cycles
3. New CLI command: `forgecad render-hq <script.forge.js> [output.png]`
4. Pass scene configuration as JSON argument to the Python script

### Tier 2: glslViewer (Artistic/Stylized)

**Why glslViewer:**
- `glslViewer model.obj shader.frag --headless -s 1 -o output.png` — one line
- Compatible with Shadertoy's ~100K community shaders
- Great for toon shading, wireframe art, matcap, procedural textures
- BSD-3-Clause, headless on macOS/Linux

**Integration plan:**
1. Export model to OBJ (already implemented)
2. Ship a few built-in GLSL shaders (toon, matcap, wireframe-art, etc.)
3. New CLI command: `forgecad render-art <script.forge.js> --shader toon [output.png]`
4. Allow `--shader path/to/custom.frag` for user shaders

## Options Considered and Rejected

| Engine | Why rejected |
|--------|-------------|
| Three.js + headless-gl | WebGL 1.0 only, no raytracing, fragile on macOS ARM |
| Mitsuba 3 | Excellent quality but academic — no material ecosystem, NVIDIA-only for GPU |
| LuxCoreRender | Great quality but poor format support, best used through Blender anyway |
| Google Filament | Real-time PBR only (no GI), C++ integration, designed for mobile |
| Intel OSPRay | Scientific visualization, not photorealism |
| POV-Ray | Dated quality, no modern PBR |
| Babylon.js headless | Same headless-gl problems, ForgeCAD already uses Three.js |
| USD + Hydra | Enormous integration cost, overkill |
| Open3D | Basic PBR only, no path tracing |
| WGPU/Dawn | Write a renderer from scratch — maximum effort |

## Progress Tracker

| # | Change | Quality | Effort | Status |
|---|--------|---------|--------|--------|
| — | Baseline (Puppeteer WebGL) | WebGL raster | — | Current |
| P1 | Blender/Cycles integration | Path-traced photorealistic | 1 session | ✅ Done |
| P2 | Material presets | 7 presets: studio/outdoor/dramatic/clay/wireframe/glass/metallic | included in P1 | ✅ Done |
| P3 | HDRI environment support | Custom .hdr/.exr via --hdri flag | included in P1 | ✅ Done |
| P4 | glslViewer artistic shaders | Stylized/artistic | ~1 day | Planned |
| P5 | User-provided GLSL shaders | Unlimited artistic | +0.5 day | Planned |

## Experiment Log

### P1: Blender/Cycles Integration (SUCCESS)

**What**: Added `forgecad render-hq` command that:
1. Evaluates the .forge.js script to get geometry
2. Exports to a temp OBJ file
3. Spawns `blender --background --python render.py -- <config.json>`
4. Returns the rendered PNG

**Results**: Working end-to-end. Tested with cup (1 object), propeller (2 objects), 3D printer (34 objects), bathroom (11 objects). Metal GPU rendering on macOS, Cycles path tracer, auto-framing camera, scale-aware 3-point lighting, shadow catcher ground plane.

**Key decisions made:**
- OBJ for transfer (simpler, already exported, Blender imports it natively with Z-up)
- Blender detection: `which blender` → common macOS/Linux paths → helpful install instructions
- Scene config passed as JSON temp file (simpler than stdin, debuggable)
- Default: 256 samples (fast preview), user can set --samples for quality

**Gotchas fixed:**
- Blender 5.1 removed `NISHITA` sky type → use `HOSEK_WILKIE`
- Blender 5.1 deprecated `Material.use_nodes` → nodes enabled by default, removed the call
- `World.node_tree` can be None → added `ensure_world_nodes()` helper
- Lighting must scale with model size → compute bounding box, scale positions and energy
- OBJ Z-up import: pass `up_axis='Z', forward_axis='NEGATIVE_Y'` to `wm.obj_import`
- Python script path resolution: bundled `dist-cli/` doesn't include .py files → resolve relative to project root

**Files created:**
- `cli/forge-render-hq.ts` — CLI command handler (parses args, runs script, exports OBJ, spawns Blender)
- `cli/blender/render.py` — Blender Python render script (materials, lighting, camera, render)
- `cli/forgecad.ts` — registered `render-hq` command with tab completion

## References

- [blender-cli-rendering](https://github.com/yuki-koyama/blender-cli-rendering) — copy-pasteable Blender CLI examples
- [BlenderProc2](https://github.com/DLR-RM/BlenderProc) — higher-level Blender automation
- [Poly Haven](https://polyhaven.com/) — free HDRI environments and PBR materials
- [glslViewer](https://github.com/patriciogonzalezvivo/glslViewer) — Shadertoy-compatible CLI renderer
- [Shadertoy](https://www.shadertoy.com/) — ~100K community GLSL shaders

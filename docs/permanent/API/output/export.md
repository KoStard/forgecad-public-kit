# Mesh Export

ForgeCAD supports exporting 3D geometry to several mesh formats. Export is available both from the CLI and programmatically in the browser.

## CLI Export

The CLI provides the primary export workflow. See [`../../cli.md`](../../cli.md) for full details.

```bash
# STL export (binary)
forgecad export stl model.forge.js -o output.stl

# 3MF export (with colors and metadata)
forgecad export 3mf model.forge.js -o output.3mf

# STEP/BREP export (exact geometry via OCCT)
forgecad export step model.forge.js -o output.step
forgecad export brep model.forge.js -o output.brep
```

## Browser-Side Export Functions

These functions are available in the browser runtime for programmatic export. They operate on mesh data and return binary buffers.

### `buildBinaryStl(objects)`

Generate a binary STL file from an array of shape objects.

**Parameters:**
- `objects` — Array of `{ name: string, shape: Shape, color?: string }`
  - `color` is a hex string (`'#RRGGBB'`) for per-object coloring

**Returns:** `ArrayBuffer` — Binary STL data

> **Callout:** STL supports per-facet color via the legacy VisCAM/SolidView RGB555 convention (bit 15 flag). Not all slicers read this — for reliable color export, prefer 3MF.

### `build3mfBuffer(objects, options?)`

Generate a 3MF archive from an array of shape objects. 3MF is the recommended format for 3D printing — it preserves colors, metadata, and multiple objects in a single file.

**Parameters:**
- `objects` — Array of `{ name: string, shape: Shape, color?: string }`
- `options` (optional):
  - `title` (string) — Metadata title. Default: `'ForgeCAD model'`
  - `application` (string) — Application name. Default: `'ForgeCAD'`
  - `description` (string) — Metadata description. Default: same as title

**Returns:** `Promise<Uint8Array>` — 3MF archive as binary data

> **Callout:** This is a pure JavaScript implementation — no native dependencies needed. Colors are encoded as 3MF material resources with automatic grouping to minimize file size.

## 2D Sketch Export

Sketches can be exported to vector formats:

### `sketchToSvg(sketch, options?)`

Export a 2D sketch to an SVG string.

### `sketchToDxf(sketch, options?)`

Export a 2D sketch to a DXF string.

See the auto-generated [API reference](../../generated/api-reference.md) for full signatures.

## G-code Toolpath Export

ForgeCAD also supports direct G-code authoring for FDM printing by returning a `GCodeBuilder` from a `.forge.js` script.

This is a separate workflow from mesh export:
- mesh export: model geometry, then slice elsewhere
- G-code mode: script the toolpaths directly

Use `forgecad export gcode script.forge.js -o output.gcode` for machine output.

See [`gcode.md`](gcode.md) for the dedicated G-code mode guide, including:
- the `gcode(profile?)` factory
- the full `GCodeBuilder` API
- viewport behavior
- limitations and safety notes
- recommended authoring patterns for continuous and non-planar prints

## Robot Export (SDF / URDF)

Assemblies with `robotExport({...})` can be exported as simulation-ready packages. See the [Assembly docs](../assembly/assembly.md#robot-export) for the full `robotExport()` API.

```bash
# SDF package (Gazebo/Ignition)
forgecad export sdf model.forge.js [--output dir]

# URDF package (ROS / PyBullet / MuJoCo)
forgecad export urdf model.forge.js [--output dir]
```

Both formats produce:
- Per-link STL meshes (visual + separate collision meshes)
- Inertia tensors computed from actual mesh geometry
- Joint limits, dynamics, and mimic (from joint couplings)
- Manifest JSON with link/joint mappings

SDF additionally supports: demo world generation, diff-drive plugin, joint state publisher, keyboard teleop.

## Exact Geometry Export (STEP/BREP)

For exact geometry (no tessellation), ForgeCAD uses the OCCT backend. See [`brep-export.md`](brep-export.md) for the parity matrix showing which operations produce exact vs. mesh geometry.

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

ForgeCAD supports direct G-code generation for FDM 3D printing via the `GCodeBuilder` API. Instead of modeling a solid and slicing it, you script the toolpaths directly — giving full control over every movement, extrusion rate, and speed.

### CLI Export

```bash
forgecad export gcode script.forge.js -o output.gcode
```

### `gcode(profile?)`

Factory function that creates a new `GCodeBuilder`. Available as a global in `.forge.js` scripts.

**Parameters:**
- `profile` (optional) — `PrinterProfile` object:
  - `nozzle` (number) — Nozzle diameter in mm. Default: `0.4`
  - `filament` (number) — Filament diameter in mm. Default: `1.75`
  - `layerHeight` (number) — Layer height in mm. Default: `0.2`
  - `printSpeed` (number) — Print speed in mm/min. Default: `1800`
  - `travelSpeed` (number) — Travel speed in mm/min. Default: `7200`
  - `retractionDistance` (number) — Retraction distance in mm. Default: `1.0`
  - `retractionSpeed` (number) — Retraction speed in mm/min. Default: `2700`
  - `bedX`, `bedY`, `bedZ` (number) — Bed dimensions in mm. Default: `220×220×250`

**Returns:** `GCodeBuilder`

### GCodeBuilder Methods

#### Movement

| Method | Description |
|--------|-------------|
| `extrudeTo(x, y, z)` | Extrude to absolute position. Auto-calculates E value and unretracts if needed. |
| `extrudeBy(dx, dy, dz)` | Extrude by relative displacement. |
| `travelTo(x, y, z)` | Travel (no extrusion) to position. Auto-retracts. |
| `travelBy(dx, dy, dz)` | Travel by relative displacement. |

#### Configuration

| Method | Description |
|--------|-------------|
| `setSpeed(mmPerSec)` | Set print speed in mm/s. |
| `setSpeedMmMin(mmPerMin)` | Set print speed in mm/min. |
| `setLayerHeight(mm)` | Set layer height for subsequent extrusion calculations. |
| `setFan(speed)` | Set fan speed (0–255, or 0.0–1.0). |
| `fanOff()` | Turn fan off. |

#### Preamble / Postamble

| Method | Description |
|--------|-------------|
| `preheat({ hotend?, bed? })` | Emit start G-code: units, homing, heating. Defaults: 200°C / 60°C. |
| `cooldown()` | Emit end G-code: retract, cool down, present print, disable steppers. |

#### Raw G-code

| Method | Description |
|--------|-------------|
| `comment(text)` | Insert a comment. |
| `raw(line)` | Insert raw G-code. |

#### Query

| Method | Description |
|--------|-------------|
| `getPosition()` | Returns current `[x, y, z]` position. |
| `toGCode()` | Returns the complete G-code string. |

### Example

```js
const g = gcode({ nozzle: 0.4, layerHeight: 0.2 });
g.preheat({ hotend: 200, bed: 60 });

// Continuous spiral vase
const cx = 110, cy = 110;
for (let z = 0.2; z < 80; z += 0.002) {
  const a = (z / 0.2) * Math.PI * 2 / 120;
  const r = 25 + 8 * Math.sin(z * 0.3);
  g.extrudeTo(cx + r * Math.cos(a), cy + r * Math.sin(a), z);
}

g.cooldown();
export default g;
```

### Viewport Rendering

When a script returns a `GCodeBuilder`, the viewport renders the toolpath as colored line segments:
- **Extrusion moves**: green (slow) → red (fast) gradient based on speed
- **Travel moves**: semi-transparent blue

> **Note:** This is a toolpath scripting API, not a slicer. It does not slice solid models — you define the toolpaths directly in code. For conventional slicing, export to STL/3MF and use PrusaSlicer, Cura, or OrcaSlicer.

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

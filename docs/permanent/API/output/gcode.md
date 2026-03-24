# G-code Toolpath Mode

ForgeCAD can generate FDM G-code directly by returning a `GCodeBuilder` from a `.forge.js` script.

This is a toolpath authoring surface, not a slicer.

Use it when you want:
- continuous spiral paths
- non-planar or mathematically defined surfaces
- lattice / string / ornamental structures that are really "paths in space"
- direct control of speed, fan, travel, and extrusion sequencing

Do not use it when you want automatic perimeters, infill, supports, or ordinary part slicing. Export STL or 3MF and use a slicer for that workflow.

## Workflow

1. Write a `.forge.js` script that creates a builder with `gcode(...)`.
2. Emit moves with `travelTo(...)` and `extrudeTo(...)`.
3. `export default g;`
4. Validate with:

```bash
forgecad run script.forge.js
```

5. Export machine code with:

```bash
forgecad export gcode script.forge.js -o output.gcode
```

When a script returns a `GCodeBuilder`, ForgeCAD's interactive viewport renders the toolpath as colored line segments:
- extrusion moves: green to red by speed
- travel moves: translucent blue

Current limitation:
- `forgecad render ...` currently expects shape outputs and does not render `GCodeBuilder` scenes to PNG. Use the interactive viewport for visual inspection and `forgecad export gcode` for final output.

## `gcode(profile?)`

Factory function available as a global in `.forge.js` scripts.

```js
const g = gcode({ nozzle: 0.4, layerHeight: 0.2 });
```

### `PrinterProfile`

| Field | Meaning | Default |
| --- | --- | --- |
| `bedX` | Bed width in mm | `220` |
| `bedY` | Bed depth in mm | `220` |
| `bedZ` | Max build height in mm | `250` |
| `nozzle` | Nozzle diameter in mm | `0.4` |
| `filament` | Filament diameter in mm | `1.75` |
| `layerHeight` | Extrusion height used for bead-area math | `0.2` |
| `printSpeed` | Default print speed in mm/min | `1800` |
| `travelSpeed` | Travel speed in mm/min | `7200` |
| `retractionDistance` | Retraction distance in mm | `1.0` |
| `retractionSpeed` | Retraction speed in mm/min | `2700` |

Important:
- bed dimensions are currently profile metadata only; the builder does not clamp or reject out-of-bounds moves
- temperatures passed to `preheat()` are emitted directly; there is no printer-specific safety layer

## Builder API

### Movement

| Method | Meaning |
| --- | --- |
| `travelTo(x, y, z)` | Retract if needed, then move without extrusion |
| `travelBy(dx, dy, dz)` | Relative travel |
| `extrudeTo(x, y, z)` | Unretract if needed, then extrude to an absolute point |
| `extrudeBy(dx, dy, dz)` | Relative extrusion |

### Configuration

| Method | Meaning |
| --- | --- |
| `setSpeed(mmPerSec)` | Set print speed in mm/s |
| `setSpeedMmMin(mmPerMin)` | Set print speed in mm/min |
| `setLayerHeight(mm)` | Change the layer height used for subsequent extrusion math |
| `setFan(speed)` | Set part cooling fan, either `0..255` or `0.0..1.0` |
| `fanOff()` | Turn fan off |

### Start / End

| Method | Meaning |
| --- | --- |
| `preheat({ hotend?, bed? })` | Emit units, absolute modes, heat, wait, home, and extruder reset |
| `cooldown()` | Emit retract, cool-down, presentation move, and motor disable |

### Raw / Query / Output

| Method | Meaning |
| --- | --- |
| `comment(text)` | Insert a G-code comment |
| `raw(line)` | Insert raw G-code text |
| `getPosition()` | Return current `[x, y, z]` |
| `build()` | Return `ToolpathData` with segments, bounds, estimates, and raw G-code |
| `toGCode()` | Return the raw G-code string |

## Behavioral Notes

- `travelTo(...)` records a travel segment only after the first explicit move. The initial move from home to your start point is intentionally not rendered as a line from `[0, 0, 0]`.
- `extrudeTo(...)` computes extrusion from traveled distance using a simple bead-area model:

```text
E increment = (layerHeight * nozzle * moveDistance) / filamentCrossSectionArea
```

- `setLayerHeight(...)` affects only future extrusion calculations. It does not retroactively change prior moves.
- `raw(...)` and `comment(...)` modify the emitted G-code text, but they do not create viewport segments or contribute to the builder's time / bounds estimates.
- The exported stats shown by `forgecad export gcode` are derived from tracked travel/extrude segments. They do not include heater wait time or arbitrary raw commands.

## Recommended Authoring Patterns

### 1. Start with an adhesion strategy

Direct G-code mode does not generate first layers for you. If the piece needs a base disc, raft-like pad, or anchoring lines, script them explicitly.

### 2. Prefer continuous paths

The most compelling results usually come from one long extrusion path or a very small number of travels. This reduces seams and makes the piece feel intentionally "computed" instead of sliced.

### 3. Keep Z changes smooth

Non-planar toolpaths are the point of this mode, but abrupt Z jumps can become collisions or under-extrusion in the real machine. Bias toward gradual ramps and dense sampling.

### 4. Treat speed and fan as part of the design

These scripts control process behavior directly. Slow first layers, selective fan increases, and lower speeds on steep or delicate regions are part of the model, not post-processing.

### 5. Stay inside your printer envelope yourself

ForgeCAD stores bed dimensions in the profile, but the builder does not currently enforce bounds, acceleration limits, temperature caps, or nozzle-clearance safety.

## Example

```js
const radius = 24;
const height = 42;
const layerHeight = 0.22;

const g = gcode({ nozzle: 0.4, layerHeight, printSpeed: 1800 });
const cx = 110;
const cy = 110;

g.preheat({ hotend: 205, bed: 55 });
g.setFan(0);

// Small spiral base
g.travelTo(cx + 0.4, cy, layerHeight);
g.setSpeed(16);
for (let i = 0; i <= 1200; i += 1) {
  const u = i / 1200;
  const angle = u * Math.PI * 18;
  const r = 0.4 + u * radius;
  g.extrudeTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle), layerHeight);
}

// Continuous sculpted wall
g.setFan(1);
g.setSpeed(30);
const stepsPerTurn = 160;
const totalSteps = Math.floor((height / layerHeight) * stepsPerTurn);
for (let i = 0; i <= totalSteps; i += 1) {
  const t = i / totalSteps;
  const angle = (i / stepsPerTurn) * Math.PI * 2;
  const r = radius * (1 - 0.15 * t) + 4 * Math.sin(5 * angle - 8 * t);
  g.extrudeTo(
    cx + r * Math.cos(angle),
    cy + r * Math.sin(angle),
    layerHeight + t * (height - layerHeight),
  );
}

g.cooldown();

export default g;
```

## Examples To Reuse

- `examples/gcode/parametric-vase.forge.js`
- `examples/gcode/spiral-tower.forge.js`
- `examples/gcode/math-surface.forge.js`
- `examples/gcode/lissajous-vase.forge.js`

## Related Docs

- [`../../CLI.md`](../../CLI.md) for the `forgecad export gcode` command
- [`export.md`](export.md) for the broader export surface
- [`brep-export.md`](brep-export.md) for exact STEP/BREP export, which is a separate workflow entirely

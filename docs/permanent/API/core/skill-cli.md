# ForgeCAD CLI — Model Authoring Commands

Commands relevant to building, validating, and exporting ForgeCAD models. For developer/CI commands, see the full [CLI.md](../../CLI.md).

## Script Validation

```bash
forgecad run examples/cup.forge.js
forgecad run examples/demo.forge-notebook.json
forgecad run examples/cup.forge.js --debug-imports
```

Runs a `.forge.js` or notebook preview cell in the real runtime and prints object stats, diagnostics, and execution time. `--debug-imports` traces import chains.

## Notebook Cells

Notebooks live in `.forge-notebook.json` files. Cells share state top-to-bottom. `show(value)` pins geometry in the viewport.

```bash
# Append and run a new cell
forgecad notebook examples/demo.forge-notebook.json --code "show(box(40, 20, 10));"

# Re-run the preview cell
forgecad notebook examples/demo.forge-notebook.json

# View notebook in terminal
forgecad notebook view examples/demo.forge-notebook.json preview

# Export to .forge.js
forgecad notebook export examples/demo.forge-notebook.json
```

Passing `.forge-notebook.json` to `run`, `render`, or `capture` uses the preview cell automatically.

## PNG Render

```bash
forgecad render examples/cup.forge.js [output.png]
forgecad render examples/demo.forge-notebook.json [output.png]
forgecad render examples/cup.forge.js out/scene.png --scene '<json>'
```

Renders 3D shapes to PNG from multiple camera angles. Uses headless Chrome with WebGL.

**Options:** `--angles <front,side,top,iso>`, `--size <px>`, `--camera <spec>`, `--scene <json>`, `--background <color>`

## Animated Capture (GIF / MP4)

```bash
forgecad capture gif examples/cup.forge.js [output.gif]
forgecad capture mp4 examples/cup.forge.js [output.mp4]
forgecad capture gif examples/demo.forge.js --capture animation --animation "Walk Cycle"
forgecad capture gif examples/demo.forge.js --cut-plane "Front Section"
forgecad capture gif examples/demo.forge.js --list   # show available animations/cut planes
```

Creates animated captures: orbit, `jointsView()` animation clips, or named cut-plane sweeps.

**Key options:** `--capture <orbit|animation>`, `--animation <name>`, `--size <px>`, `--fps <n>`, `--frames-per-turn <n>`, `--camera <spec>`, `--scene <json>`

**UI handoff:** Use `Copy CLI --scene` in the View Panel to grab the current viewport state.

## Parameter Validation

```bash
forgecad check params examples/shoe-rack.forge.js [--samples 10]
```

Samples each parameter across its range and checks for runtime errors, degenerate geometry (volume ≈ 0), and part collisions.

## Export Commands

### SVG Export
```bash
forgecad export svg examples/sketch.forge.js [output.svg]
```

### STEP / BREP Export
```bash
forgecad export step examples/part.forge.js
forgecad export step examples/part.forge.js --output out/demo.step --allow-faceted
```
Exact-subset only by default. `--allow-faceted` allows mesh fallback for unsupported solids.

### G-code Toolpath Export
```bash
forgecad export gcode examples/gcode/vase.forge.js
```
Script must return a `GCodeBuilder` instance. This is a toolpath scripting API, not a slicer.

### SDF Robot Export (Gazebo)
```bash
forgecad export sdf examples/rover.forge.js
```
Writes a Gazebo-friendly package with SDF models, STL meshes, and optional demo world.

### PDF Report
```bash
forgecad export report examples/cup.forge.js [output.pdf]
```
Generates a searchable PDF with projected drawing views, BOM page, and `dim()` annotations.

### STL Export
Available in the browser UI via the Export panel.

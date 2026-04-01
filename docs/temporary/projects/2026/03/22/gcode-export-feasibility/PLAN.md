# G-code Export Feasibility Investigation

## Goal

Assess the difficulty, value, long-term potential, and feasibility of adding direct G-code export to ForgeCAD — bypassing the traditional CAD → STL → Slicer → G-code pipeline.

## TL;DR Verdict

**Surprisingly good fit. Not as unrelated to the stack as it seems.**

ForgeCAD already has: (1) a programmatic modeling API in JS, (2) cross-section slicing via Manifold, (3) mesh export, (4) a CLI pipeline. Direct G-code export would be a natural extension — not a detour. The key insight is that ForgeCAD's scripting model is *exactly* what makes direct G-code compelling: you're already writing code to define geometry, so writing code to define toolpaths is the same paradigm.

---

## The Landscape

### What is "Direct G-code"?

Instead of: **Design shape → export STL → feed to slicer → get G-code**
You do: **Design toolpaths in code → get G-code directly**

This gives you control over every movement, extrusion rate, speed, and Z-height. It enables things slicers fundamentally can't do:

- **Non-planar layers** — layers that follow curved surfaces
- **Continuous spiral paths** — true seamless prints (not just vase mode)
- **Mathematical surfaces** — parametric equations sampled at arbitrary resolution
- **Lattice/string structures** — geometries that have no solid volume, only toolpaths
- **Per-segment process control** — vary speed, extrusion, temperature along a single path

### Existing Tools

| Tool | Approach | Maturity |
|------|----------|----------|
| **FullControl** (Python) | Point-sequence API → G-code | Academic, well-documented, peer-reviewed |
| **3dSynth** | Visual block programming → G-code | Browser app, procedural focus |
| **Grasshopper/Rhino** | Visual scripting → G-code | Professional, architectural community |
| **GCodePlot** | SVG → G-code for pen plotters | Niche |

None of these are integrated into a CAD tool with solid modeling. That's the gap.

---

## Fit with ForgeCAD

### What ForgeCAD Already Has

| Capability | Relevance to G-code |
|------------|---------------------|
| **Programmatic JS API** | Same paradigm as FullControl — define paths in code |
| **`shape.slice(z)`** → cross-section | Core of any slicer — already works via Manifold |
| **Sketch/CrossSection** as 2D polygons | Could become toolpath contours |
| **Mesh export (STL/3MF/OBJ)** | Proves the export pipeline pattern |
| **CLI `forgecad export`** | Would just add `gcode` as another format |
| **Quality presets** | Map to layer height / resolution |
| **3D viewport** | Could visualize toolpaths as colored lines |

### What Would Need to Be Built

| Component | Difficulty | Description |
|-----------|-----------|-------------|
| **G-code emitter** | Easy | String builder: `G1 X{x} Y{y} Z{z} E{e} F{f}` — trivially simple |
| **Extrusion math** | Easy | `E = distance * layer_height * extrusion_width / (π * (d/2)²)` |
| **Printer profile** | Easy | Bed size, filament diameter, nozzle size, temp defaults |
| **Start/end G-code** | Easy | Template strings per printer (heating, homing, etc.) |
| **Multi-layer slicing** | Medium | Loop `shape.slice(z)` at layer_height increments — Manifold does the hard part |
| **Contour → toolpath** | Medium | Offset contours inward for perimeters, generate infill patterns |
| **Infill generation** | Medium-Hard | Rectilinear is easy, gyroid/adaptive is hard |
| **Retraction/travel** | Medium | Logic for when to retract, travel move ordering |
| **Toolpath visualization** | Medium | Render G-code as colored 3D lines in viewport |
| **Non-planar paths** | Hard | The "fun" stuff — but can start without it |

### Two Possible Scopes

#### Scope A: "Artistic G-code" (small, high-value)

Don't build a slicer. Build a **toolpath scripting API** — like FullControl but in ForgeCAD's JS environment.

```js
// Example: parametric vase in ForgeCAD
const gcode = new GCodeBuilder({ nozzle: 0.4, filament: 1.75, layerHeight: 0.2 });
gcode.preheat({ hotend: 200, bed: 60 });

for (let z = 0; z < 100; z += 0.1) {
  const t = z / 100;
  const r = 20 + 10 * Math.sin(z * 0.3);
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    gcode.extrudeTo(r * Math.cos(a), r * Math.sin(a), z);
  }
}

gcode.cooldown();
export default gcode;
```

**Effort**: ~1-2 weeks. Mostly a `GCodeBuilder` class + CLI export command.
**Value**: Immediately differentiating. No other CAD tool does this natively.

#### Scope B: "ForgeCAD as Slicer" (large, risky)

Build actual slicing: multi-layer cross-sections → contour offsets → infill → G-code.

**Effort**: Months. Competing with PrusaSlicer/Cura/OrcaSlicer is not realistic.
**Value**: Marginal — users can already export STL and use a real slicer.

**Recommendation: Scope A.** The artistic/parametric toolpath API is the sweet spot.

---

## Difficulty Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Technical difficulty** | Low-Medium | G-code is simple text. Extrusion math is straightforward. No WASM, no complex algorithms. |
| **Integration difficulty** | Low | Follows existing export pattern. CLI `forgecad export gcode`. Browser download button. |
| **Scope risk** | Low (Scope A) / High (Scope B) | Key is to NOT build a slicer. Build a toolpath scripting API. |
| **Testing difficulty** | Low | Output is text — easy to validate. Can diff against known-good G-code. |

## Value Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| **Differentiation** | **High** | No CAD tool has native programmatic G-code generation. FullControl is Python-only, not integrated into a modeler. |
| **Community appeal** | **High** | G-code art is a growing niche. Maker/3D-printing community loves this stuff. |
| **Educational value** | **High** | Teaches how 3D printing actually works. Great for workshops/courses. |
| **Practical value** | Medium | Most users still need a real slicer for functional parts. This serves the creative/experimental segment. |
| **Content/marketing** | **High** | Every parametric vase, mathematical surface, or non-planar print is shareable content. |

## Long-term Potential

| Direction | Timeline | Description |
|-----------|----------|-------------|
| **Toolpath scripting API** | Near-term | `GCodeBuilder` class with extrude/travel/retract methods |
| **Hybrid workflow** | Medium-term | Use ForgeCAD's solid modeling for the shape, then script custom toolpaths around it (e.g., non-planar top surface on a conventionally-sliced base) |
| **Toolpath visualization** | Medium-term | Render G-code as colored 3D paths in the viewport — useful even for imported G-code |
| **Shape-to-contour** | Medium-term | `shape.sliceAll(layerHeight)` → array of cross-sections → user scripts the rest |
| **Basic slicer** | Long-term | Only if there's demand. Contour + rectilinear infill covers ~70% of cases |
| **Non-planar printing** | Long-term | The holy grail. ForgeCAD's programmatic nature makes it one of the few tools that could do this well |
| **Multi-material** | Long-term | G-code tool changes, purge towers — nightmare in slicers, scriptable in code |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Scope creep into building a full slicer | Hard boundary: Scope A only. "We generate toolpaths, not slice models." |
| Users expect slicer features | Clear positioning: "artistic/experimental G-code, not a replacement for PrusaSlicer" |
| Bad G-code damages printers | Safety bounds checking, temp limits, bed size validation, prominent warnings |
| Maintenance burden | G-code spec is stable (barely changed in decades). Low ongoing maintenance. |

## Implementation — MVP Delivered

### Architecture Decision: Same file type, different return type

The G-code feature uses ForgeCAD's existing type-dispatch pattern — no new file type needed:

```
Script returns Shape    → ForgeObject (3D mesh rendering)
Script returns Sketch   → SketchObject (2D polygon rendering)
Script returns GCodeBuilder → ToolpathObject (colored line rendering)  ← NEW
```

Same `.forge.js` file, same viewport, same runner pipeline. The viewport dispatches on `obj.toolpath` just like it dispatches on `obj.shape` and `obj.sketch`.

### Files Added/Modified

| File | Change |
|------|--------|
| `src/forge/gcode.ts` | **NEW** — `GCodeBuilder` class + `gcode()` factory |
| `src/forge/runner.ts` | Handle `GCodeBuilder` return type, add to sandbox |
| `src/forge/serializeRunResult.ts` | Pass through toolpath data |
| `src/forge/deserializeRunResult.ts` | Pass through toolpath data |
| `src/workers/evalWorkerProtocol.ts` | Add `toolpathData` to `SerializedSceneObject` |
| `src/forge/headless.ts` | Export `GCodeBuilder`, `gcode`, types |
| `src/forge/index.ts` | Re-export for browser |
| `src/components/Viewport.tsx` | `ToolpathObject` renderer + bounds support |
| `cli/forge-gcode.ts` | **NEW** — CLI `export gcode` command |
| `cli/forgecad.ts` | Register `export gcode` command |
| `cli/example-manifest/experimental.ts` | Register demo examples |
| `examples/gcode/*.forge.js` | **NEW** — 4 demo scripts |

### Demo Scripts

| Demo | Description | Segments | Time | Filament |
|------|-------------|----------|------|----------|
| `parametric-vase.forge.js` | Sine-wave modulated continuous spiral vase | 80,552 | 84m | 4,479mm |
| `spiral-tower.forge.js` | Twisted hexagonal tower | 2,100 | 19m | 1,139mm |
| `math-surface.forge.js` | Non-planar bowl with wave rim | 27,447 | 13m | 880mm |
| `lissajous-vase.forge.js` | Lissajous curve vase with morphing profile | 112,058 | 66m | 3,802mm |

### API Surface

```js
// Factory
const g = gcode({ nozzle: 0.4, layerHeight: 0.2, filament: 1.75, ... });

// Preamble/Postamble
g.preheat({ hotend: 200, bed: 60 });
g.cooldown();

// Movement
g.extrudeTo(x, y, z);    // extrusion move (auto-calculates E)
g.extrudeBy(dx, dy, dz); // relative extrusion
g.travelTo(x, y, z);     // travel (auto-retract/unretract)
g.travelBy(dx, dy, dz);  // relative travel

// Configuration
g.setSpeed(30);           // mm/s
g.setLayerHeight(0.3);
g.setFan(1.0);

// Raw
g.comment('layer start');
g.raw('M106 S128');

// Output
export default g;         // → viewport renders toolpath, CLI exports .gcode
```

## Conclusion

**It's not unrelated to the stack at all.** ForgeCAD is a programmatic CAD tool — programmatic G-code generation is a natural extension of the same philosophy. The key is to build the *toolpath scripting API* (Scope A), not a slicer (Scope B).

The fit is actually better than it first appears:
1. Same paradigm: write code → get physical output
2. Same audience: makers, 3D printing enthusiasts, computational designers
3. Same differentiator: programmatic control that GUI tools can't match
4. Low effort, high differentiation, great content/marketing potential

The comparison to FullControl is instructive: it's a popular Python library that does *only* G-code generation with no solid modeling. ForgeCAD could offer both — model a shape AND script its toolpaths — which nothing else does.

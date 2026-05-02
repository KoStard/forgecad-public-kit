---
name: forgecad-make-a-model
description: Create new ForgeCAD (.forge.js) models in the active CAD project. Handles file placement, invokes the forgecad skill for API guidance, and validates the result.
forgecad-public: true
---

# Make a Model

Create new ForgeCAD models in the user's active ForgeCAD project.

## File Placement

All new `.forge.js` files go under the date-based directory structure:

```
YYYY/MM/DD/file.forge.js          — single-file model
YYYY/MM/DD/folder/main.forge.js   — multi-file project entry point
YYYY/MM/DD/folder/*.js            — shared helpers, constants, parts, assemblies
```

Use today's date for the directory. Use the user's current ForgeCAD project when one is available; otherwise use a clearly named local model folder.

### Naming conventions

- Use kebab-case for file and folder names: `parametric-lego.forge.js`
- Use descriptive names that communicate what the model is
- For any multi-file project, name the runnable ForgeCAD entry point `main.forge.js`
- If a model needs shared helpers, put them in a subfolder as plain `.js` files (not `.forge.js`)
- Do not create multiple `.forge.js` files in the same project folder unless they are intentionally separate runnable models

## Workflow

1. Load the ForgeCAD skill — always invoke the `forgecad` skill first to get API docs and authoring guidance. Read at minimum the Core API reference. If any two parts are intended to touch or mate in the final model, read the positioning guide immediately and default to connectors + `matchTo()`.
2. Create the directory — `mkdir -p YYYY/MM/DD/[folder]` as needed.
3. Write the model — create the `.forge.js` file(s) following ForgeCAD conventions:
   - Declare `param()` / `boolParam()` for all tunable dimensions
   - If the model is split across files, use `main.forge.js` as the only primary `.forge.js` entry point and import helpers/parts from neighboring plain `.js` modules
   - When there are multiple versions of the same object, expose the version as a choice parameter and render one selected version at a time
   - Use clear variable names
   - Build any implied internal structure as real geometry, even when it will be hidden in the final view
   - Make final mating geometry physically plausible: parts may touch, clear each other, or be boolean-joined, but should not unintentionally pass through each other
   - Return the final geometry (single shape, array, or named objects array)
4. Validate — run `forgecad run <file>` to check for errors. For multi-file projects, always validate `main.forge.js`.
5. Verify geometry — render the result and run `forgecad render inspect` with the relevant/all channels for the task (see Render-Verify Loop below). For multi-file projects, render and inspect `main.forge.js`.

## Manufacturing Process Is Not Assumed

Do not interpret every ForgeCAD model as a printable object.
Choose the manufacturing/process cues that fit the artifact unless the user explicitly asked for a specific process.

- For rideable products such as scooters, bikes, skateboards, carts, or mobility-adjacent devices, use realistic metal/composite/wood structural members, purchased wheels/bearings/axles/brakes/grips, and standard hardware unless the user asked for a printable toy/model.
- For furniture and load-bearing structures, consider wood, sheet goods, tube, metal brackets, conventional joinery, and printed parts only where they are honest secondary components.
- For enclosures, choose injection-molded, sheet-metal, CNC, thermoformed, printed, or hybrid cues based on quantity, ruggedness, serviceability, and the brief.
- For fixtures and tooling, choose machined, laser-cut, welded, printed, or hybrid construction based on load, repeatability, and shop realism.
- Use printing-specific features such as slicer clearances, support strategy, layer-oriented ribs, and heat-set inserts only when the selected process includes printed parts.

## Visual Style Defaults

Unless the user explicitly asks for a vivid, playful, toy-like, brand-specific, or unusual colorway, default to a classic high-end product palette. The model should look expensive and credible in the first render, not generically colorful.

- Prefer restrained material-driven colors: warm ivory, bone, cream, charcoal, graphite, satin black, brushed aluminum, stainless steel, brass, bronze, muted burgundy, dark green, navy, smoked translucent polymer, frosted clear, and natural wood where appropriate.
- Use bright colors sparingly as small accents for controls, seals, indicators, warnings, or brand-neutral identity lines.
- Match color to material/process: anodized or powder-coated metal, molded or dyed polymer, rubber/silicone, glass/acrylic, PCB/FR4, wood grain, leather/fabric, and standard hardware should each read differently.
- Avoid one-note rainbow/neon palettes, random saturated part colors, or color groups that make a serious artifact feel like a toy unless the brief asks for that.
- If the object normally has user-facing markings, include them as real geometry or texture-like raised/engraved features: keyboard legends, button labels, gauge ticks, icons, connector labels, alignment marks, service arrows, and scale markings. Do not leave expected labels blank.
- Use color to clarify part boundaries and serviceability without hiding the engineering stack: seams, fasteners, gaskets, inserts, ports, and purchased components should remain legible.

## Variants Should Be Parameter-Selected

If the model supports several sizes, styles, revisions, or option bundles of the same object, do not display all variants in the default scene. Add a `Param.choice` / choice parameter such as `Variant`, `Preset`, `Style`, or `Configuration`, and return only the selected variant's production geometry.

Comparison lineups are acceptable only as an explicit debug or presentation mode, not the default. Keep those modes behind a clearly named parameter such as `Show comparison lineup`, and keep collision inspection focused on one selected final assembly so unrelated variants cannot create false collision findings.

## Internal Geometry Is Part of the Model

If the requested object would have meaningful internal structure in the real artifact, model that structure too. Do not satisfy an enclosure, robot, tool, mechanism, vehicle, appliance, prop, or functional manufactured part with only an exterior shell unless the user explicitly asks for a facade or blockout.

Build hidden features as actual geometry:

- Internal cavities, wall thickness, ribs, bosses, posts, brackets, ledges, and snap/latch features
- Screw holes, inserts, bearing seats, axle paths, shaft clearances, and fastener access
- Electronics volumes, battery bays, servo/motor pockets, wire channels, cable exits, and connector clearances
- Mechanism clearances, travel envelopes, stops, guides, rails, hinges, gear spaces, and service access
- Process-specific features such as bends, tubes, sheet-metal flanges, machined bosses, cast ribs, molded draft, weld tabs, laser-cut slots, or print-oriented ribs where appropriate

When internals are hidden by the final exterior, add a temporary verification view: transparent shell, exploded view, cutaway, underside render, or named ghost objects. Use that view to check fit and collisions, but keep the final returned model faithful to the real closed artifact unless the user asked for a visible cutaway.

## Final Geometry Should Be Physically Plausible

Treat each returned part as real matter occupying space. In the final build, separate parts should not intersect unless the intersection is the actual manufacturing intent, such as a welded/fused region, an overmolded insert, or a boolean-unioned solid that is no longer a separate part.

Do not use final interpenetration as a placement shortcut. For joints and interfaces, model the contact, clearance, or connector honestly: pins in holes, shafts in bearing seats, tabs in slots, hinges with knuckle clearance, screws through clearance holes, nested parts with wall offsets, and moving parts with their travel envelope accounted for.

Temporary collisions during construction are fine when they are part of how the model is made or verified: oversized cutter solids before `difference()`, overlapping primitives before `union()`, transparent ghost parts for fit checks, or exploratory joint layouts. Those temporary bodies should be consumed, hidden, named as ghosts, or isolated with inspection filters so final collision findings stay meaningful.

Before delivery on any multi-part, internal, or mechanical model, run the collision inspection, read the collision channel PNGs, and check `manifest.json`. Fix unexpected overlaps. If a collision is intentional, document it in the model naming/comments or isolate that inspection with `--focus` / `--hide` so the remaining collision report proves the final assembly is real.

## Render-Verify Loop

You are building blind unless you render. `forgecad run` only checks that code executes — it cannot tell you a hole is in the wrong place or a part doesn't fit. Render and look at the result.

### How to render and inspect

```bash
# Render from multiple angles
node dist-cli/forgecad.js render model.forge.js /tmp/preview.png --camera 45:25 --camera 0:0 --size 600

# Camera format: --camera az:el (degrees). Repeatable.
#   45:25   — standard 3/4 view from above
#   45:-25  — from below (check underside, wire slots, cavities)
#   0:0     — front elevation
#   90:0    — side elevation
#   0:90    — top-down
#   0:-85   — near bottom-up (see inside cavities)
```

Then read the PNG(s) to inspect visually. Single camera → single file. Multiple cameras → suffixed files (`_az45_el25.png`).

### Structured inspection bundles

After the normal PNG render, run `forgecad render inspect` and read both the channel PNGs and `manifest.json`. Final acceptance for a functional or manufactured model should use all channels unless the request is purely decorative; for any multi-part final build, the `collisions` channel is mandatory:

```bash
forgecad render inspect model.forge.js /tmp/model-inspect --channels all --force --size 900
```

For faster iteration, request the channels that match the current risk:

- `collisions` — final multi-part assemblies, fixtures, enclosures, ghost fit checks, moving clearances, and any parts intended to touch without overlapping. Visually inspect this channel; do not rely only on the count.
- `thickness` — printed shells, sheet metal, molded walls, ribs, bosses, holes, snap fits, slots, brackets, and any feature where thin walls can fail. Set thresholds for the selected material/process instead of blindly accepting defaults.
- `section` — hidden internals, cavities, wire channels, pockets, screw paths, captured components, and anything a surface render cannot show.
- `connectivity` — parts that should be one connected solid, parts that should remain separate, and assemblies where floating or accidentally fused bodies matter.
- `mask` — object identity, missing named parts, duplicate geometry, hidden mocks, and color/name confusion.
- `depth` / `normals` — occlusion, orientation, flipped surfaces, odd protrusions, and form readability.
- `rgb` — the human-readable view that keeps the structured channels grounded.

Useful manifest checks:

```bash
jq '.channels.collisions | {collisionCount, collisions, warnings}' /tmp/model-inspect/manifest.json
jq '.channels.thickness.objects[] | {name, minThickness, p05Thickness, criticalAreaPercent, warningAreaPercent, unresolvedAreaPercent}' /tmp/model-inspect/manifest.json
jq '.channels.connectivity | {componentCount, edges, warnings}' /tmp/model-inspect/manifest.json
```

Treat unexpected collision findings, critical thin regions, high unresolved thickness, missing sections, or wrong component counts as model bugs. If an overlap is intentional, make that explicit in the model or isolate the inspection with `--focus` / `--hide` so the remaining findings are meaningful:

```bash
forgecad render inspect model.forge.js /tmp/model-fit --channels collisions,section --focus "Bracket,Screw Ghost" --force
forgecad render inspect model.forge.js /tmp/model-thickness --channels thickness --min-thickness 1.6 --warn-thickness 2.4 --force
```

### When to render

- After every feature addition (not just at the end)
- After any boolean subtraction that creates a hole/pocket
- After placing symmetric copies (to check symmetry)
- After adding the last feature (final check)

### When to inspect

- After adding hidden/internal geometry that a surface render cannot prove
- After adding or moving mating parts, ghosts, connectors, holes, pockets, or clearances
- After adding thin walls, ribs, slots, snap features, bosses, or screw holes
- Before final delivery, with `--channels all`, and with thresholds appropriate to the model

### Ghost parts for fit verification

When building a part that holds/contains another object (enclosure, mount, bracket), render both together with the contained object transparent:

```js
// Ghost servo for visual fit check
const ghost = box(servoW, servoD, servoH)
  .placeReference('center', [0, 0, wallThick])
  .color('#ff4444').material({ opacity: 0.4 });

return [
  { name: 'Mount', shape: mount.color('#556B2F') },
  { name: 'Servo Ghost', shape: ghost },
];
```

This immediately reveals: does it fit? Does it collide with walls? Does the shaft clear the opening?

### Use console.log for dimension checks

Print derived dimensions and clearances to verify arithmetic before rendering:

```js
console.log("wall remaining:", ((outerW - slotW) / 2).toFixed(1));  // must be > 0
console.log("hole clearance from edge:", (flangeW/2 - holeX - holeDia/2).toFixed(1));
```

Output appears under "Script output:" in `forgecad run`.

### Self-inspecting shared constants

For multi-file projects with a shared constants file (e.g. `shared-dims.js`), add a summary block that prints all computed values when the file is run directly. This replaces one-off throwaway debug scripts.

```js
// At the bottom of shared-dims.js:
if (require.main === module) {
  console.log('=== SERVO ===');
  console.log('  body:', servo.bodyW, '×', servo.bodyD, '×', servo.bodyH, 'mm');
  // ... all computed dimensions, clearance checks, etc.
  console.log('✓ All validations passed.');
}
```

Run with `node shared-dims.js` to see the full dimension summary. Don't write throwaway `node -e "require(...)..."` scripts — put the inspection logic in the source file itself where it stays up to date automatically.

## ForgeCAD Quick Reference

The `forgecad` skill has full API docs.

Key primitives:

- `box(x, y, z)`, `cylinder(h, r, rTop?, segments?)`, `sphere(r)`, `torus(R, r)`
- `union()`, `difference()`, `intersection()`
- `.fillet()`, `.chamfer()` for edge treatments
- `param(name, default, opts)`, `boolParam(name, default)`
- Return `[{ name, shape, color }]` for multi-part colored models

Primitive placement convention:

- `box()` and `cylinder()` are centered in X/Y and sit on `z=0`.
- `sphere()` and `torus()` are centered in X/Y/Z.
- Use `.placeReference('center', [0, 0, 0])` when a box or cylinder should be centered around the origin.
- Do not pass `center: true` or a positional `true` to primitives; that is stale OpenSCAD-style guidance.

Key composition tools:

- Connectors + `matchTo()` for parts that should touch in the final model
- `group()` for local-coordinate subassemblies
- `attachTo()` for quick bounding-box placement
- `.translate()` / `.rotate()` for free offsets or bridging computed locations, not as the default assembly contract

## Managing Complexity: Build Bottom-Up

You cannot target a complex model directly. A chess set, a mechanical assembly, an articulated figure — if you try to write the whole thing in one pass, you will get lost in coordinate math, produce subtle geometry bugs, and waste cycles debugging a tangled script.

Instead, do what engineers do: decompose, solve the smallest piece, verify, then compose upward.

### The process

1. Decompose — Break the model into the smallest independent parts you can reason about confidently. A "gear" is not a small part — a single tooth profile is. A "house" is not small — a wall panel with a window cutout is.

2. Solve the smallest piece — Write the geometry for one part. Keep it isolated: its own variables, its own return statement. Don't think about how it connects to the rest yet.

3. Verify — Run `forgecad run` to check for errors, then `forgecad render` to actually see the shape. Read the rendered PNG. Does it match your intent? Are holes where they should be? Are walls thick enough? Fix it now while the scope is tiny. `forgecad run` passing does not mean the geometry is correct — it only means the code didn't crash.

4. Compose upward — Once a piece is verified, combine it with the next piece. Verify again. Each level of assembly should be independently checkable.

5. Repeat — Keep climbing. Each step adds one layer of complexity on top of verified foundations. If something breaks, you know it's in the new layer, not buried three levels deep.

### Why this matters

- Debugging is local. When a verified piece breaks after composition, the bug is at the seam, not inside the piece.
- You avoid coordinate chaos. Small pieces use simple local coordinates. Transforms and placements happen at composition time, one layer at a time.
- Iteration is cheap. Changing a tooth profile doesn't require re-reading 200 lines of gear assembly code.

### In practice

For a model with more than ~3 distinct geometric features, explicitly plan the decomposition before writing any geometry. Write each piece as a function or variable block, verify it, then combine. Do not skip verification steps to "save time" — it costs more time in the end.

## Scene Presentation

Always set up a proper `scene()` to make models look polished. A bare model with default lighting looks flat and unfinished.

### Minimum scene setup

Every model should have at least:

```js
scene({
  background: { top: '#1a1a2e', bottom: '#0a0a14' },
  camera: { position: [x, y, z], target: [0, 0, 0], fov: 42 },
  environment: { preset: 'studio', intensity: 0.6 },
  lights: [
    { type: 'ambient', color: '#c8cdd4', intensity: 0.15 },
    { type: 'directional', position: [80, -60, 120], target: [0, 0, 0], color: '#fff4e0', intensity: 1.8, castShadow: true },
    { type: 'directional', position: [-60, 40, 80], target: [0, 0, 0], color: '#b0c4de', intensity: 0.7 },
  ],
  ground: { visible: true, color: '#111118', height: -10, receiveShadow: true },
  postProcessing: {
    bloom: { intensity: 0.3, threshold: 0.85, radius: 0.3 },
    vignette: { darkness: 0.5, offset: 0.4 },
    toneMappingExposure: 1.3,
  },
});
```

### Lighting principles

- When `lights` is set, all defaults are replaced, so always include an ambient light or the scene goes black.
- Use a 3-point setup at minimum: ambient fill + warm key light (with `castShadow: true`) + cool rim/back light for edge separation.
- Add accent point lights near focal features (e.g. a gold crown, a polished surface) for highlights.
- Use `distance` and `decay` on point lights to keep them localized.

### Adapt to the model

- Metallic/jewelry models: `studio` environment, higher `toneMappingExposure` (1.2–1.5), subtle bloom for specular highlights.
- Organic/wood/matte models: `warehouse` or `apartment` environment, lower bloom, warmer ambient.
- Mechanical/industrial models: `warehouse` environment, stronger directional lights, minimal bloom.
- Dark/dramatic models: dark gradient background, `night` environment, bloom + vignette for mood.

### Matte industrial hero-shot recipe

For mechanisms, tools, product prototypes, vehicles, and other industrial showpieces, prefer a matte studio look over glossy or atmospheric drama:

```js
scene({
  background: { top: '#c3ccd7', bottom: '#566474' },
  camera: { position: [430, -540, 340], target: [0, 30, 125], fov: 38 },
  environment: { preset: 'studio', intensity: 0.15 - 0.25, background: false },
  lights: [
    { type: 'ambient', color: '#efe7dc', intensity: 0.12 - 0.2 },
    { type: 'directional', position: [260, -320, 420], color: '#ffe2bf', intensity: 2.6 - 3.2, castShadow: true },
    { type: 'directional', position: [-260, 210, 220], color: '#d4e6fb', intensity: 0.7 - 1.0 },
    { type: 'hemisphere', skyColor: '#c7d3df', groundColor: '#495463', intensity: 0.1 - 0.2 },
  ],
  postProcessing: {
    bloom: { intensity: 0.0 - 0.06, threshold: 0.92 - 0.96, radius: 0.25 - 0.3 },
    vignette: { darkness: 0.35 - 0.45, offset: 0.3 - 0.35 },
    toneMappingExposure: 1.05 - 1.18,
  },
});
```

Use a simple plinth or stage under the model, and make it intentionally matte too:

```js
const stage = cylinder(16, 226)
  .translate(0, 0, -26)
  .color('#8b97a4')
  .material({ metalness: 0.04, roughness: 0.78 });

mock(stage, 'StudioPlinth');
```

What worked well in practice:

- Keep `environment.intensity` low. High environment fill kills shadows and makes everything look washed out.
- Let one warm directional key light do most of the shaping. Add only a weaker cool fill/rim for separation.
- Prefer roughness over fog for softness. Fog flattens the model and hides form; matte materials preserve shadow definition.
- Keep bloom extremely low for mechanical scenes. A little is fine; too much makes manufactured parts feel toy-like or overly glossy.
- If the render is close but not perfect, change `toneMappingExposure` by about `0.05` first before redoing the whole lighting rig.
- Avoid large ambient-light jumps. They brighten fast and remove contrast faster than expected.

### Ground plane

Enable `ground` with `receiveShadow: true` for models that benefit from visual grounding (furniture, vehicles, standalone objects). Skip it for floating/abstract geometry.

### Camera

- Position the camera at a 3/4 angle (not dead-on axis) for natural perspective.
- Use `fov` 35–50 for most models. Lower FOV = more telephoto/flatter, higher = more dramatic perspective.
- Set `target` to the visual center of mass, not necessarily `[0,0,0]`.

## Tips

- Make models parametric by default — dimensions should be `param()` calls, not magic numbers
- Do not assume primitives are XYZ-centered: `box()` and `cylinder()` are XY-centered but sit on `z=0`
- Use `.placeReference('center', [0, 0, 0])` for full-origin-centered boxes or cylinders
- Prefer `group()`, connectors, and `placeReference()` over manual half-height arithmetic
- Prefer `difference()` for holes/cutouts, `union()` for additive features
- Use `.color()` to distinguish parts visually

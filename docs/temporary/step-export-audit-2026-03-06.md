# STEP Export Audit — 2026-03-06

## What Changed This Round

Two exact-export expansions landed:

1. Exact 2D rounded/tapered profile replay
   - `roundedRect()` now records an exact profile plan.
   - Exact sketch booleans (`union2d`, `difference2d`, `intersection2d`) now preserve profile provenance when every child is exact-exportable.
   - Sketch `scale()` now preserves exact affine profile transforms.
   - Tapered `extrude(..., { scaleTop })` is now exact when the source profile is exact-exportable.

2. Exact arbitrary-axis solid transform replay
   - `rotateAround(...)` now records an exact transform step instead of dropping the BREP plan.
   - `pointAlong(...)` now stays exact because it is just a derived arbitrary-axis rotation.

## What I Learned

- CadQuery `Workplane` is the wrong abstraction for exact 2D rounded/profile replay.
  - `Workplane.vertices().fillet(...)` is a 3D solid-edge operation, not a 2D profile operation.
  - Exact 2D replay needs `cq.Sketch`, not just `cq.Workplane`.

- Tapered profile lofts with holes need decomposition.
  - `placeSketch(...).loft()` ignores inner wires in the way we need for ring-like tapered profiles.
  - The exact solution is to preserve 2D profile booleans in the plan, then decompose them into separate 3D booleans during replay.

- Planner/provenance fixes can unlock more examples than new geometry kernels.
  - The biggest gain this round came from preserving existing exact geometry through `rotateAround()` and `pointAlong()`.
  - Many failures were not “hard geometry” problems; they were exact-plan loss problems.

- A local CadQuery environment is worth it.
  - Using a repo-local `uv` environment (`.venv-brep/.venv/bin/python`) made repeated matrix runs practical and removed repeated dependency provisioning from the feedback loop.

## Example Matrix

Audit command:

```bash
npm run step -- --python /Users/kostard/Projects/CAD/ForgeCAD/.venv-brep/.venv/bin/python <example>
```

Current bundled `.forge.js` example count: `73`

- Before exact `rotateAround()` / `pointAlong()` support: `32` passed, `41` failed
- After exact `rotateAround()` / `pointAlong()` support: `44` passed, `29` failed
- Net improvement from the transform work: `+12` examples

Examples that flipped from failing to passing after the transform-plan work:

- `examples/ac-unit-glm5.forge.js`
- `examples/ac-unit-kimi25.forge.js`
- `examples/ac-unit-minimax.forge.js`
- `examples/ac-unit.forge.js`
- `examples/api/bounding-box-visualizer.forge.js`
- `examples/api/coordinate-system.forge.js`
- `examples/api/pointAlong-orientation.forge.js`
- `examples/api/spatial-recipes.forge.js`
- `examples/door-with-hinges.forge.js`
- `examples/laptop.forge.js`
- `examples/liquid-soap-dispenser.forge.js`
- `examples/shoe-rack-doors.forge.js`

## Remaining Failure Buckets

### 1. Exact profile replay gaps (`extrude` / `revolve`)

This is now the biggest exact-export gap.

Representative examples:

- `examples/table-lamp.forge.js`
- `examples/headphone-hanger.forge.js`
- `examples/classical-piano.forge.js`
- `examples/tv-stand.forge.js`
- `examples/api/gears-tier1.forge.js`
- `examples/api/profile-2020-b-slot6.forge.js`
- `examples/api/import-svg-sketch.forge.js`
- `examples/api/gears-bevel-face-joints.forge.js`
- `examples/api/assembly-gear-coupling.forge.js`

Likely causes:

- direct `polygon()` / `ngon()` / gear tooth profiles
- imported/path-derived sketches
- `stroke()` / offset-derived profiles
- direct sketch returns mixed into otherwise exportable scenes

### 2. Exact transform gaps that still remain

Representative examples:

- `examples/api/patterns.forge.js`
- `examples/api/runtime-joints-view.forge.js`
- `examples/robot_hand_2.forge.js`

Likely causes:

- `mirror(...)` still drops exact plan
- `Shape.transform(matrix)` still drops exact plan even for rigid transforms

### 3. Unknown-source library geometry

Representative examples:

- `examples/api/elbow-test.forge.js`
- `examples/bolt-and-nut.forge.js`
- `examples/5-figen-robot-hand.forge.js`
- `examples/3d-printer.forge.js`

These look less like exporter limitations and more like provenance loss inside helper/library code paths.

### 4. Intentionally sampled / mesh-domain geometry

Representative examples:

- `examples/api/benchy-style-hull.forge.js`
- `examples/api/curves-surfacing-basics.forge.js`

These rely on `loft`, `sweep`, `levelSet`, `hull`, or deformation-heavy flows. They are not lower-hanging fruit.

### 5. Non-exporter script/runtime problems

These are not exact-BREP planner failures:

- `examples/iphone.forge.js` -> `body.smoothOut is not a function`
- `examples/api/assembly-mechanism.forge.js` -> `Identifier 'sweep' has already been declared`
- `examples/api/exploded-view.forge.js` -> `Identifier 'assembly' has already been declared`

## Lowest-Hanging Next Fixes

Ranked by likely payoff per unit of work:

1. Exact polygon-profile replay
   - Best payoff among real geometry gaps.
   - Likely unlocks lamp shade revolve, gear examples, piano/table-stand style extrudes, and profile-library examples.

2. Safe rigid `Shape.transform(matrix)` replay
   - High leverage for assembly-driven examples.
   - Would likely help `runtime-joints-view` and parts of `robot_hand_2`.

3. Exact `mirror(...)` replay for axis-aligned and general plane normals
   - Smaller surface area than polygon replay.
   - Should clean up `examples/api/patterns.forge.js` immediately and reduce a few robot-hand style failures.

4. Better handling of mixed sketch + solid scenes
   - Several examples fail only because they intentionally return sketches next to exportable solids.
   - This is more of a product/export-policy decision than a kernel limitation.

## Recommendation

If continuing exact STEP coverage work, the next best engineering target is:

1. Exact `polygon()` replay
2. Then safe rigid `Shape.transform(matrix)` decomposition
3. Then exact `mirror(...)`

That sequence should buy more example coverage than chasing sampled `loft` / `sweep` / `levelSet` paths.

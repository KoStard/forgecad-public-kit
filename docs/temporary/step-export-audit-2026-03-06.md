# STEP Export Audit — 2026-03-06

## What Changed This Round

Three exact-export expansions landed:

1. Exact 2D rounded/tapered profile replay
   - `roundedRect()` now records an exact profile plan.
   - Exact sketch booleans (`union2d`, `difference2d`, `intersection2d`) now preserve profile provenance when every child is exact-exportable.
   - Sketch `scale()` now preserves exact affine profile transforms.
   - Tapered `extrude(..., { scaleTop })` is now exact when the source profile is exact-exportable.

2. Exact arbitrary-axis solid transform replay
   - `rotateAround(...)` now records an exact transform step instead of dropping the BREP plan.
   - `pointAlong(...)` now stays exact because it is just a derived arbitrary-axis rotation.

3. Exact polygon/profile replay
   - `polygon()` now records an exact point-loop profile plan instead of dropping to mesh-only export.
   - Polygon-backed flows such as `ngon()`, sampled `ellipse()`, `star()`, `path().close()`, and SVG fill loops now stay exact when they only use replayable booleans/transforms.
   - Tiny cleanup `simplify(...)` calls were removed from profile-library helpers that were otherwise already exact-exportable.
   - SVG import no longer auto-runs final sketch simplify by default, which preserves exact fill-profile provenance unless callers explicitly opt into simplification.

## What I Learned

- CadQuery `Workplane` is the wrong abstraction for exact 2D rounded/profile replay.
  - `Workplane.vertices().fillet(...)` is a 3D solid-edge operation, not a 2D profile operation.
  - Exact 2D replay needs `cq.Sketch`, not just `cq.Workplane`.

- Exact polygon replay is mostly a provenance problem, not a kernel problem.
  - Storing normalized point loops was enough to unlock direct polygons, gear-tooth sketches, and SVG fill regions.
  - The hard part was keeping those plans alive through boolean-heavy library helpers.

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
npm run step -- --uv uv --python /Users/kostard/Projects/CAD/ForgeCAD/.venv-brep/.venv/bin/python <example>
```

Fresh March 6, 2026 rerun on the current examples tree: `75` bundled `.forge.js` files

- Before exact `rotateAround()` / `pointAlong()` support: `32` passed, `41` failed
- After exact `rotateAround()` / `pointAlong()` support: `44` passed, `29` failed
- After exact `polygon()` / polygon-backed profile replay follow-up: `48` passed, `27` failed

Notes:

- The `48 / 27` result is from the current March 6, 2026 tree with `75` examples, so it is not a perfectly apples-to-apples comparison with the earlier `73`-example snapshot.
- Several current failures are now clearly runtime/script issues (`target._bbox is not a function`, duplicate identifier errors, etc.), not exporter regressions.

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

Examples confirmed passing after the polygon/profile follow-up:

- `examples/api/gears-bevel-face-joints.forge.js`
- `examples/api/gears-tier1.forge.js`
- `examples/api/import-svg-sketch.forge.js`
- `examples/headphone-hanger.forge.js`
- `examples/table-lamp.forge.js`
- `examples/tv-stand.forge.js`

## Remaining Failure Buckets

### 1. Exact transform gaps that still remain

Representative examples:

- `examples/api/assembly-gear-coupling.forge.js`
- `examples/api/patterns.forge.js`
- `examples/api/runtime-joints-view.forge.js`
- `examples/robot_hand_2.forge.js`

Likely causes:

- `mirror(...)` still drops exact plan
- `Shape.transform(matrix)` still drops exact plan even for rigid transforms

### 2. Mixed sketch + solid export-policy gaps

Representative examples:

- `examples/api/profile-2020-b-slot6.forge.js`
- `examples/api/sketch-basics.forge.js`
- `examples/api/clone-duplicate.forge.js`

What changed:

- In `examples/api/profile-2020-b-slot6.forge.js`, the `3D Extrusion` object is now exact-exportable.
- The script still fails as a whole because it intentionally returns a 2D sketch object next to the solid, and sketch-to-BREP export is still unsupported.

### 3. Remaining profile/path gaps

Representative examples:

- `examples/headphone-hanger-v2.forge.js`

Likely causes:

- `stroke()` / `offset()`-derived profiles still have no exact 2D replay path

### 4. Unknown-source library geometry

Representative examples:

- `examples/api/elbow-test.forge.js`
- `examples/bolt-and-nut.forge.js`
- `examples/5-figen-robot-hand.forge.js`
- `examples/3d-printer.forge.js`

These look less like exporter limitations and more like provenance loss inside helper/library code paths.

### 5. Intentionally sampled / mesh-domain geometry

Representative examples:

- `examples/api/benchy-style-hull.forge.js`
- `examples/api/curves-surfacing-basics.forge.js`

These rely on `loft`, `sweep`, `levelSet`, `hull`, or deformation-heavy flows. They are not lower-hanging fruit.

### 6. Non-exporter script/runtime problems

These are not exact-BREP planner failures:

- `examples/ac-unit-glm5.forge.js` -> `target._bbox is not a function`
- `examples/ac-unit-minimax.forge.js` -> `target._bbox is not a function`
- `examples/ac-unit.forge.js` -> `target._bbox is not a function`
- `examples/api/coordinate-system.forge.js` -> `target._bbox is not a function`
- `examples/classical-piano.forge.js` -> `target._bbox is not a function`
- `examples/iphone.forge.js` -> `body.smoothOut is not a function`
- `examples/api/assembly-mechanism.forge.js` -> `Identifier 'sweep' has already been declared`
- `examples/api/exploded-view.forge.js` -> `Identifier 'assembly' has already been declared`

## Lowest-Hanging Next Fixes

Ranked by likely payoff per unit of work:

1. Safe rigid `Shape.transform(matrix)` replay
   - High leverage for assembly-driven examples.
   - Would likely help `assembly-gear-coupling`, `runtime-joints-view`, and parts of `robot_hand_2`.

2. Exact `mirror(...)` replay for axis-aligned and general plane normals
   - Smaller surface area than polygon replay.
   - Should clean up `examples/api/patterns.forge.js` immediately and reduce a few robot-hand style failures.

3. Better handling of mixed sketch + solid scenes
   - Several examples fail only because they intentionally return sketches next to exportable solids.
   - This is more of a product/export-policy decision than a kernel limitation.

4. Exact 2D `offset()` / stroke replay
   - This is the remaining real profile-export gap after polygon replay landed.
   - It should help stroke-heavy SVG/path examples and hanger/profile variants.

## Recommendation

If continuing exact STEP coverage work, the next best engineering target is:

1. Safe rigid `Shape.transform(matrix)` decomposition
2. Then exact `mirror(...)`
3. Then exact 2D `offset()` / stroke replay

That sequence should buy more example coverage than chasing sampled `loft` / `sweep` / `levelSet` paths.

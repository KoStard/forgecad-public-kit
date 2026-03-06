# STEP Export Audit — 2026-03-06

## What Changed This Round

Seven export-coverage expansions landed:

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

4. Exact mirror replay + placement interop cleanup
   - `mirror(...)` now records an exact transform step instead of dropping the BREP plan.
   - `Shape.attachTo(...)` / `Shape.onFace(...)` now accept `TrackedShape` targets the same way tracked placement already did.
   - Built-in anchors accept alias orderings such as `left-front` as well as `front-left`.
   - The USB-C benchmark scene that previously failed with `target._bbox is not a function` now exports cleanly.

5. Exact safe rigid `Shape.transform(matrix)` replay
   - Rigid affine matrices now preserve exact export plans instead of dropping to mesh-only.
   - The recorded replay is decomposed into exact `rotateAround(...)` + `translate(...)` steps.
   - This unlocked assembly-heavy examples that were previously blocked on matrix transforms.

6. Mixed sketch + solid scenes now export the exact solids
   - STEP/BREP export no longer fails just because a script also returns 2D sketch objects.
   - Sketch-only objects are skipped with a warning; exact solids continue to export.

7. Exact round-offset profile replay
   - `Sketch.offset(delta, 'Round')` now preserves an exact profile plan instead of dropping provenance.
   - This also unlocks round `stroke()` flows that are implemented as chained offsets on exact polygon profiles.
   - The CadQuery replay has a fallback path for boolean-built profiles whose offset wires need a cleaned union face first.

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

- Dedicated matrix scripts pay for themselves immediately.
  - `uv run scripts/brep/matrix.py ...` and `rerun_failures.py` made full-example audits cheap enough to run after each exporter step.
  - Parallel worker pools plus repo-local Python removed most of the feedback-loop friction.

- Mixed-scene export should behave like a 3D exporter, not a linter.
  - Failing an entire STEP run because a scene also contains sketches was the wrong default.
  - Skipping non-solid objects keeps the exactness contract without penalizing common example scripts.

## Example Matrix

Audit command:

```bash
uv run scripts/brep/matrix.py --format step examples
```

Fresh March 6, 2026 rerun on the current examples tree: `75` bundled `.forge.js` files

- Before exact `rotateAround()` / `pointAlong()` support: `32` passed, `41` failed
- After exact `rotateAround()` / `pointAlong()` support: `44` passed, `29` failed
- After exact `polygon()` / polygon-backed profile replay follow-up: `48` passed, `27` failed
- After safe rigid `Shape.transform(matrix)` replay: `56` passed, `19` failed
- After mixed sketch + solid export policy cleanup: `59` passed, `16` failed
- After exact round-offset replay: `61` passed, `14` failed
- After fixing the `assembly-mechanism` example runtime shadowing bug: `62` passed, `13` failed

Notes:

- The current reference matrix was produced by `uv run scripts/brep/matrix.py --format step examples`.
- The `62 / 13` result is from the current March 6, 2026 tree with `75` examples, so it is not a perfectly apples-to-apples comparison with the earlier `73`-example snapshot.
- After the mirror + placement follow-up, targeted verification confirmed clean export for:
  - `examples/api/patterns.forge.js`
  - `examples/api/coordinate-system.forge.js`
  - `/Users/kostard/Projects/CAD/ForgeCADBenchmark/results/usb-c-openai-gpt-5.4_20260305_235124/workspace/main.forge.js`

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

Examples confirmed passing after the rigid-transform / mixed-scene / round-offset follow-ups:

- `examples/api/assembly-gear-coupling.forge.js`
- `examples/api/runtime-joints-view.forge.js`
- `examples/api/clone-duplicate.forge.js`
- `examples/api/profile-2020-b-slot6.forge.js`
- `examples/test-colors.forge.js`
- `examples/api/sketch-basics.forge.js`
- `examples/classical-piano.forge.js`
- `examples/api/assembly-mechanism.forge.js`

## Remaining Failure Buckets

### 1. Helper/library provenance gaps

Representative examples:

- `examples/api/elbow-test.forge.js`
- `examples/bolt-and-nut.forge.js`
- `examples/api/exploded-view.forge.js`
- `examples/5-figen-robot-hand.forge.js`
- `examples/3d-printer.forge.js`

Likely causes:

- exact helper/library geometry still falls back to `unknown` provenance in some code paths (`lib.elbow`, fasteners, cable/tube helpers)

### 2. Safe affine scale gaps

Representative examples:

- `examples/robot_hand.forge.js`
- `examples/robot_hand_2.forge.js`

Likely causes:

- scaled-sphere grip pads and related primitive-heavy unions still drop exact plans because non-uniform solid scale replay is not supported

### 3. Remaining exact geometry gaps

Representative examples:

- `examples/headphone-hanger-v2.forge.js`
- `examples/api/extrude-options.forge.js`

Likely causes:

- `headphone-hanger-v2` still has a boolean + primitive + revolve provenance break
- twisted extrudes remain intentionally outside the current exact subset

### 4. Intentionally sampled / mesh-domain geometry

Representative examples:

- `examples/api/benchy-style-hull.forge.js`
- `examples/api/curves-surfacing-basics.forge.js`
- `examples/api/geometry-info.forge.js`

These rely on `loft`, `sweep`, `levelSet`, `hull`, or deformation-heavy flows. They are not lower-hanging fruit.

### 5. Remaining runtime compatibility problem

Representative example:

- `examples/iphone.forge.js` -> `body.smoothOut is not a function`

This is not an exporter-plan failure; it is a runtime API mismatch between `TrackedShape` and `Shape`.

## Lowest-Hanging Next Fixes

Ranked by likely payoff per unit of work:

1. Provenance-preserving helper/library plans
   - Highest remaining example payoff.
   - `lib.elbow`, `lib.bolt`, fastener helpers, and cable/tube helpers should buy back several examples without expanding the exact kernel subset.

2. Safe exact affine scale replay
   - Especially valuable for scaled-sphere pads and similar soft-contact parts.
   - This likely helps both `robot_hand` examples immediately.

3. Then selective exact OCCT-native features
   - `shell`, precise fillet/chamfer, and other BREP-native operations still matter more than sampled loft/sweep paths.

## Recommendation

If continuing exact STEP coverage work, the next best engineering target is:

1. provenance-preserving exact plans for `lib.elbow`, `lib.bolt`, and related helpers
2. then safe exact affine scale replay for solid primitives
3. then OCCT-native BREP features where exact export matters most

That sequence should buy more example coverage than chasing sampled `loft` / `sweep` / `levelSet` paths.

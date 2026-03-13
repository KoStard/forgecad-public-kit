# Sheet Metal Semantic V1 And Demo
## Problem Definition
Once durable descendant resolution exists, the next high-value architectural proof is sheet metal.

Sheet metal is exactly the kind of feature family this compiler architecture is meant to enable:

- one semantic model
- one fast folded preview path
- one exact manufacturing-capable path
- one place to express downstream references to panels, flanges, bends, and cut regions

Without a dedicated sheet-metal task, the new topology/reference ownership layer risks staying abstract. We need one demanding but honest feature family that proves why it was worth building.

## Goal
Build a first compiler-owned sheet-metal subset with one specific reviewable model that demonstrates what became possible after durable descendant resolution landed.

This task is **not** "general CAD sheet metal."

It is the first defended subset that proves the architecture can carry:

- semantic sheet-metal intent
- folded preview
- exact folded lowering
- flat-pattern derivation
- downstream references to named sheet-metal regions

## Why This Depends On Task 300
Sheet metal is not just folded solids.

It depends heavily on being able to refer to:

- the main panel after flanges exist
- one specific flange after other bends/cuts exist
- bend-adjacent regions
- flat-pattern descendants of those same semantic regions

If task 300 does not land, this task will collapse into heuristics and one-off naming.

So this task must build on top of durable descendant resolution instead of bypassing it.

## Description
Introduce a compiler-owned sheet-metal semantic node family and use it to implement a first defended v1 workflow.

The v1 scope should include:

- base flange / base panel creation
- 90 degree edge flanges
- explicit sheet thickness
- explicit bend radius
- explicit bend allowance model inputs such as K-factor or equivalent bend metadata
- corner reliefs for the defended subset
- planar cutouts on supported sheet-metal regions
- folded solid generation
- flat-pattern generation from the same semantic model

The system should not infer sheet metal from arbitrary solids for v1.

This should be a dedicated semantic path, not a pile of booleans.

## Specific Demo Model
Implement one explicit review model: `folded-service-panel-cover`.

The model should be intentionally ordinary and manufacturable-looking, not flashy:

- material thickness: `1.5 mm`
- bend radius: `2.0 mm`
- K-factor or equivalent bend setting: explicit in code
- main panel: `180 mm x 110 mm`
- four return flanges: `18 mm` on all sides, `90°`
- defended corner reliefs on the four corners
- top-panel display cutout: `72 mm x 36 mm`
- right-flange cable slot: `26 mm x 10 mm`
- four mounting holes on the main panel near the corners
- optional vent-slot pattern on the main panel if it stays inside the defended subset cleanly

This model should prove all of the following:

- code can refer to the main panel region after the flanges exist
- code can refer to one specific flange region after the other flanges exist
- a downstream cutout on a flange is compiler-owned, not a backend-local trick
- the same semantic sheet-metal model yields both:
  - a folded result
  - a flat pattern

If naming differs, the semantics should still clearly expose at least:

- `panel`
- `flange-top`
- `flange-right`
- `flange-bottom`
- `flange-left`
- bend-adjacent regions or bend entities where Forge can honestly defend them

## Developer Experience Requirements
- The developer should not have to construct sheet metal by manually composing booleans.
- The API should make the sheet-metal intent obvious from code.
- It should be easy to request one specific sheet-metal descendant region in folded space.
- It should be easy to inspect the flat-pattern descendants of those same semantic regions.
- If a region resolves to more than one surface in folded or flat space, the result must be explicit and pleasant to inspect, not silently guessed.
- Unsupported sheet-metal operations must fail with targeted diagnostics.

## Acceptance Criteria
- There is a dedicated compiler-owned sheet-metal semantic model in Forge code.
- The folded preview path and exact path both lower from that same semantic model.
- The v1 defended subset supports:
  - one base flange/panel
  - four 90 degree edge flanges
  - thickness and bend radius
  - explicit bend metadata such as K-factor
  - corner reliefs in the defended subset
  - planar cutouts on the main panel and at least one flange region
- Flat-pattern generation exists as a first-class output of the same sheet-metal model.
- The `folded-service-panel-cover` demo model exists in the repo and is used as a proof artifact.
- The demo proves folded descendant references and flat-pattern descendant references for named sheet-metal regions.
- At least one check surface verifies:
  - folded route integrity
  - flat-pattern integrity
  - named region/descendant integrity for the demo part
- The docs explain the supported subset and explicitly reject at least:
  - arbitrary solid-to-sheet-metal conversion
  - hems
  - jogs/offset bends
  - lofted bends
  - miter corner logic outside the defended subset
  - nonuniform thickness

## Nice-To-Have But Not Required For V1
- SVG or DXF export of the flat pattern
- bend labels/annotations in debug output
- user-facing bend tables beyond the minimal defended metadata

Those are good follow-ons, but they should not be used to inflate v1 scope.

## Non-Goals
- Do not try to convert arbitrary existing solids into sheet metal.
- Do not widen the task into a generic manufacturing suite.
- Do not pretend unsupported bend/corner cases are solved.
- Do not implement sheet metal as a hidden exporter-only special case.

## Primary Files
- new sheet-metal semantic modules
- compile/lowering integration seams
- descendant-resolution integration for sheet-metal regions
- example/demo model files
- compiler/BREP/example check surfaces
- permanent docs for supported subset and limitations

## Isolation Rule
- Keep the semantic sheet-metal model separate from generic solid feature hacks.
- Reuse task 300's descendant-resolution layer instead of inventing one-off flange/face naming rules.
- Keep v1 strict and pleasant rather than broad and brittle.
- Prefer one strong demo model and strong checks over many half-supported API knobs.

## Dependencies
- task 300

## Parallelization
Do not start before task 300 lands.

After this task lands, the likely safe follow-ons are:

- richer sheet-metal corner treatments
- tabs/lanced features and more downstream detail workflows
- flat-pattern export polish
- multi-body folded assemblies and covers/brackets beyond the v1 subset

## Suggested Implementation Order
1. Define the sheet-metal semantic model and the minimal user-facing API.
2. Lower folded preview through Manifold from that semantic model.
3. Lower exact folded geometry and flat-pattern geometry through CadQuery/OCCT.
4. Expose defended descendant regions for panel/flanges/bends.
5. Implement the `folded-service-panel-cover` demo.
6. Add regression and debug/check surfaces.
7. Document the v1 subset and explicit limits.

## Status and log
- 2026-03-13: Created as the first sheet-metal task after durable descendant resolution, with `folded-service-panel-cover` as the required proof model.
- 2026-03-13: Landed `sheetMetal()` v1 as a compiler-owned semantic family with folded and flat outputs, defended `panel` / `flange-*` / `bend-*` descendants, the `folded-service-panel-cover` demo, compiler/BREP/query/API checks, and permanent docs for the supported subset and explicit limits.

# Post-MLP Example Phase

Date: 2026-03-12

## Why This Gate Exists

Task 230 closed the MLP truthfulness lane for the defended compiler-owned subset,
but that still left a repo-wide question unanswered:

- what does it mean for the broader `examples/` surface to "work with the new setup"?

The answer now lives in one checked manifest plus one CLI gate:

- manifest: `cli/example-manifest/`
- gate command: `forgecad check examples`

This is the shared phase-entry contract for all example migration work that
lands after MLP.

## Gate Definition

`forgecad check examples` now does four things together:

1. inventories every `.forge.js`, `.sketch.js`, and `.forge-notebook.json` under `examples/`
2. fails if any example artifact is unclassified or if a manifest entry points at a missing file
3. runs the validation path assigned to each example class
4. enforces declared compiler-route expectations for part examples that are inside the active architecture gate

The command fails when:

- a new example file appears without a manifest entry
- a checked manifest path no longer exists
- an example's assigned validation path fails
- a `part` example declared as `exact` no longer stays on the exact route for its selected primary shapes
- a `part` example declared as `faceted` no longer blocks exact export or no longer succeeds on the allow-faceted route

## Manifest Structure

The manifest is intentionally split so later tasks do not all edit one file:

- `cli/example-manifest/api-and-corpus.ts`
  API part examples plus the compiler corpus
- `cli/example-manifest/product-demos.ts`
  top-level product/demo parts plus `examples/shelf/`
- `cli/example-manifest/non-part.ts`
  assemblies, runtime-scene examples, sketches, and notebooks
- `cli/example-manifest/experimental.ts`
  temporary fenced examples outside the active architecture claim
- `cli/example-manifest/types.ts`
  shared class, route, and helper definitions

That split lines up with the next migration waves:

- task 250 owns API parts plus compiler corpus routes
- task 260 owns product/demo part routes
- task 270 owns assembly/runtime/sketch/notebook validation behavior
- task 280 owns the temporary fence and remaining holdouts

## Example Classes

- `part`
  Runtime execution is always required. Route assertions apply only when the
  manifest declares `exact` or `faceted`; `holdout` still has to run but stays
  outside the exact-route claim for now.
- `assembly`
  The example must execute successfully and still emit an assembly-style solved
  scene. It is not judged by exact part-lowering parity.
- `runtime-scene`
  The example must execute successfully as a viewport/report/runtime scene.
  These are active examples, but they are not evidence of exact part export.
- `sketch`
  The example validates through the sketch path: it must produce at least one
  real sketch payload that can be turned into polygons.
- `notebook`
  The example validates through its preview-cell path, matching the CLI
  behavior for notebook execution.
- `experimental`
  The example still has to run, but it is explicitly fenced away from the
  architecture-phase claim until follow-up work decides whether it remains part
  of the maintained example surface.

## Part Route Semantics

Part entries can currently declare three intentional route states:

- `exact`
  The selected primary shape objects must stay on the exact compiler route.
- `faceted`
  Exact export must remain blocked for the selected primary shapes, and the
  allow-faceted route must succeed with explicit diagnostics.
- `holdout`
  The example is inventory-covered and still runtime-checked, but it is
  temporarily outside the architecture gate until its migration task commits an
  honest route expectation.

When an example mixes helper solids with one primary blocker, the manifest can
name `primaryShapes` explicitly so the route contract applies to the intended
shape objects instead of every returned solid.

## Current State After Task 250

The landed starting inventory is:

- 96 example artifacts total
- 31 API part examples
- 8 compiler-corpus parts
- 34 product/demo part examples
- 21 non-part artifacts
- 2 experimental holdouts

Current part-route counts:

- 32 `exact`
- 5 `faceted`
- 36 `holdout`

The API/compiler-corpus wave now contributes:

- 24 API part examples on `exact`
- 5 API part examples on `faceted`
- 2 API part examples left as explicit holdouts because they still mix incompatible route outcomes in one scene
- all 8 compiler-corpus parts on `exact`

The remaining holdouts are now concentrated in:

- product/demo part examples that belong to task 260
- mixed-route API galleries such as `extrude-options` and `gears-tier1`
- any later recovery/fencing decisions owned by task 280

# Architecture Phase Entry Review

Date: 2026-03-13

Task 290 is the explicit closeout lane for the post-MLP example phase.

## Verdict

Yes: ForgeCAD has entered the new architecture phase for the maintained
example surface.

That means:

- every maintained example artifact under `examples/` is inventory-covered by
  `cli/example-manifest/`
- the full example gate passes on the same branch state as `npm test` and
  `npm run build`
- part examples now carry explicit `exact` or `faceted` route contracts on the
  primary shapes that matter
- non-part examples are inside the same gate through dedicated
  `assembly` / `runtime-scene` / `sketch` / `notebook` validation paths
- the only artifacts outside the active architecture claim are the two explicit
  `experimental` fences, and both still run through the gate

This does not mean the larger mainstream-part checkpoint is done.

## What "Entered The New Architecture Phase" Means

For this program, the repo counts as being in the new architecture phase when
all of the following are true together:

1. the maintained example surface is fully classified and checked by one shared
   gate
2. active examples no longer rely on ambiguous route wording such as "kind of
   works" or undocumented holdouts
3. part examples state whether their defended primary shapes are `exact` or
   intentionally `faceted`
4. non-part examples remain visible to repo checks without pretending to prove
   exact part-lowering parity
5. anything still outside the claim is fenced explicitly and named as out of
   scope

What remains out of scope even after this verdict:

- the two temporary `experimental` fences
- claiming that every maintained part example is exact-exportable
- claiming that the full mainstream-part checkpoint is complete
- treating runtime assemblies, notebooks, sketches, or viewport demos as proof
  of exact part-lowering parity

## Branch State Reviewed

The phase-entry decision is based on this branch state on 2026-03-13:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run test:examples` | Passed | `forgecad check examples` passed across the full manifest. |
| `npm test` | Passed | Invariant suite passed, including the example architecture gate. |
| `npm run build` | Passed | App build and CLI build both succeeded. |

## Example Surface Summary

| Surface | Count | Architecture-phase status | Notes |
| --- | --- | --- | --- |
| API parts | 31 | Active | Part-route contracts are explicit. |
| Compiler corpus | 8 | Active | All eight remain exact. |
| Product/demo parts | 34 | Active | Part-route contracts are explicit. |
| Non-part examples | 21 | Active | 4 assembly, 11 runtime-scene, 4 sketch, 2 notebook. |
| Experimental fences | 2 | Outside active claim | Still runtime-checked by the gate. |
| Total manifest coverage | 96 | Covered | 94 inside the active claim, 2 fenced experimental probes. |

## Part Route Inventory

Current part-route counts from `forgecad check examples`:

- `exact`: 63
- `faceted`: 10
- `holdout`: 0

The repo no longer has any active example still classified as a route-truth
`holdout`.

### Exact Part Surface

The active exact surface now includes:

- 24 API part examples
- all 8 compiler-corpus parts
- 31 product/demo part examples

### Faceted Part Surface

The active faceted examples are intentional and documented:

- `examples/api/benchy-style-hull.forge.js`
  - primary hull body still relies on exact-unsupported hull smoothing
- `examples/api/curves-surfacing-basics.forge.js`
  - surfacing demo still uses loft/sweep behavior outside the defended exact subset
- `examples/api/elbow-test.forge.js`
  - elbow helper still emits runtime geometry without exact replay
- `examples/api/face-gears.forge.js`
  - face/perpendicular gear helpers still depend on sampled profile geometry
- `examples/api/profile-2020-b-slot6.forge.js`
  - direct 3D profile helper still relies on segmented-profile lowering
- `examples/api/extrude-options.forge.js`
  - only `Twisted` and `Twist + Taper` are faceted; the other gallery solids stay exact
- `examples/api/gears-tier1.forge.js`
  - only `Spur Pinion`, `Spur Gear`, and `Ring Gear` are faceted; `Rack Gear` stays exact
- `examples/bolt-and-nut.forge.js`
  - thread helpers still rely on helical/twist geometry outside the exact subset
- `examples/iphone.forge.js`
  - rounded-body smoothing still depends on runtime-only refine behavior
- `examples/chess-set.forge.js`
  - only the four knight bodies remain faceted; the rest of the scene stays exact

## Non-Part Boundary

The non-part families are inside the architecture phase, but they are not part
route-parity evidence:

- `assembly`: 4
- `runtime-scene`: 11
- `sketch`: 4
- `notebook`: 2

These examples are validated through runtime solve/scene behavior, sketch SVG
materialization, or notebook preview execution instead of exact part-routing
contracts.

## Remaining Outside The Active Claim

Only two artifacts remain outside the active architecture claim, and both are
explicitly fenced under task 280:

- `examples/sandbox.forge.js`
  - scratch/sandbox file, not part of the maintained architecture-phase surface
- `examples/test-colors.forge.js`
  - color-behavior probe, not a maintained architecture-phase example

Both still execute through the example gate, but neither is counted as proof of
the maintained architecture surface.

## What Still Prevents A Stronger Checkpoint

This phase-entry review is green because the example surface is now honest and
fully checked, not because the larger compiler checkpoint is complete.

The strongest remaining blocker set is:

1. durable descendant resolution and topology ownership after topology-changing
   edits
2. broader exact coverage for the remaining faceted blockers
3. broader downstream feature coverage on top of that stronger topology layer
4. a clearer long-term boundary between fast runtime geometry and a future
   second serious exact-capable backend runtime

In practice, the deepest blocker is task 300:

- the repo already knows lineage, query propagation, and a few defended created
  faces
- it still does not own developer-friendly descendant surfaces, edge chains, or
  stable post-rewrite targets well enough for stronger downstream feature claims

## Next Architectural Wave

Task 300 is the next core lane after this review:

- [tasks/300-durable-descendant-resolution-and-topology-ownership.md](../../../../../../tasks/300-durable-descendant-resolution-and-topology-ownership.md)

After task 300 lands, the next safe wave is:

- task 310 sheet metal semantic v1 and demo
- task 320 richer hole/cut variants
- task 330 broader shell workflows
- task 340 broader fillet/chamfer workflows
- task 350 broader projection/sketch-on-face expansion
- task 370 toolbox/library feature families
- task 380 assembly metadata and exact export boundary

Then:

- task 360 manufacturing outputs and flat patterns after task 310
- task 390 legacy architecture fence and cleanup after the replacement paths are real

# Backend Compiler Foundation

Date: 2026-03-11

## Mission Goal

Make ForgeCAD compile one modeling system to multiple geometry backends without rewriting user scripts.

The target is:

- user-facing source stays `.forge.js` / `.sketch.js`
- Forge owns the semantic modeling layer
- Manifold and CadQuery/OpenCascade become backend lowerers
- backend capabilities and losses stay explicit instead of hidden

This is the mission doc and tracker for that transition.

Program docs:

- `explainer.md`
- `capabilities.md`
- `task-graph.md`

## Active Checkpoint

Current goal:

- Forge has a true Manifold lowerer
- Forge has a true CadQuery/OCCT lowerer
- both lowerers consume the same Forge compile graph
- together they cover most of the normal part-design feature surface people expect from Fusion 360's Design workspace

In this document, "come back when it is done" means this checkpoint, not just another compiler slice.

## MLP Target

Short-term target:

- reach a minimum lovable product for the compiler transition before the full checkpoint is done

For this document, MLP means:

- the Forge compile graph is the source of truth for the common part-design stack already in flight
- both Manifold and CadQuery/OCCT lower from that graph for ordinary daily workflows
- workplane/query provenance is stable enough that normal downstream edits do not feel brittle immediately
- exact export is just the CadQuery/OCCT route for that supported subset
- the regression suite protects multi-feature parts, not just isolated toy operations

Current estimate from 2026-03-12:

- about 6 to 10 focused weeks for one strong full-time engineer

Near-term path to that MLP:

1. Push the new parent-body/query-owner model through projection, sketch-on-face, and pattern-style downstream edits so semantic ownership stays truthful through real feature chains.
2. Land the next serious exact feature family cleanly. `shell()` v1 is now in for compile-covered `box()`, `cylinder()`, and straight `extrude()` bases; hole/cut workflows are the next piece.
3. Tighten richer face/edge-driven flows around the same query/reference model instead of letting those features invent their own ownership rules.
4. Promote curated multi-feature parts into the compiler and exact-export regression suite.

Deepest completed prerequisite:

- `src/forge/queryModel.ts` is now the central shared query/reference contract for parent-body owners and face queries.
- Workplane provenance and tracked topology now share that contract instead of carrying separate internal representations.
- This does not solve stable face/edge identity by itself, but it gives future feature work one canonical place to extend.

## Where We Succeed Or Fail

This transition will likely succeed or fail on one layer:

- Forge's semantic feature graph
- the compiled-scene routing boundary
- the reference / workplane / query model for downstream features

If that layer stays clean:

- new features are additive
- backend behavior is diagnosable
- export is just another compiler route
- advanced workflows like sheet metal have a place to land later

If that layer gets compromised:

- backend-specific callsite code will spread
- export-only feature logic will multiply
- face/edge-driven features will become brittle
- "supported" features will fail in ordinary multi-step parts

That is the architectural pressure point.

## Checkpoint Scope

This checkpoint is about mainstream solid-modeling design work.

In scope:

- sketch primitives and profile construction
- sketch transforms, booleans, offsets, mirroring, pattern-like repetition
- extrude, revolve, sweep, loft
- boolean solid ops
- transform ops
- shell
- fillet and chamfer
- hole-like and cut-like feature workflows
- workplane / sketch-on-face / projection-driven feature flows
- feature- and body-level mirror/pattern workflows
- stable-enough topology/reference tracking for supported feature chains
- exact STEP/BREP export through the same compiler-owned CadQuery/OCCT lowering

Explicitly out of scope for this checkpoint:

- CAM
- simulation
- rendering
- generative tools
- mesh sculpting as a primary modeling mode
- sheet metal
- T-spline/subD style surfacing
- full assembly/mate parity with Fusion 360

This is meant to cover "most regular design features", not literal product parity.

## True Lowerer Definition

A backend counts as a true lowerer only if all of the following are true:

- Forge feature code records backend-neutral compile intent first
- the backend is reached by lowering that intent, not by side-channel replay logic
- feature behavior is not open-coded directly against backend APIs at callsites
- compiler diagnostics can explain unsupported, degraded, or faceted routes
- the same scene can be compiled intentionally to either backend for the supported subset

By this definition, the current Manifold path is partway there and the current CadQuery/OCCT path is not there yet.

## Checkpoint Exit Criteria

We are done with this checkpoint only when all of the following are true:

1. The Forge compile graph is the source of truth for the mainstream design feature set listed above.
2. Manifold lowering and CadQuery/OCCT lowering both run from that graph.
3. STEP/BREP export is just the CadQuery/OCCT compiler route, not a parallel export-only replay system.
4. The supported subset is broad enough that a typical mechanical part modeled with ordinary Fusion-style Design tools usually stays inside compiler coverage.
5. The repo has regression tests that compare backend lowerings and catch plan/route/output drift before release.
6. Backend capability gaps are visible in diagnostics instead of hidden fallback behavior.

## Practical Coverage Target

To avoid vague "most features" language, the practical target is:

- nearly all primitives, sketch construction, booleans, and transforms are dual-lowered
- the main feature stack (`extrude`, `revolve`, `sweep`, `loft`, `shell`, `fillet`, `chamfer`, holes/cuts, patterns, mirrors, projections, sketch-on-face) is dual-lowered
- face- and edge-driven downstream features are stable enough to build ordinary multi-step mechanical parts without constant reference breakage
- compiler checks include curated multi-feature parts that lower successfully to both Manifold and CadQuery/OCCT

If those are not true, the checkpoint is not done.

## Why This Exists

ForgeCAD already proved the language and workflow are valuable:

- code-first parametric modeling
- imports and composition
- assemblies and reports
- named topology and placement references
- browser-first iteration

What is weak today is not the language. It is that runtime geometry is still tightly coupled to Manifold, while exact export already uses a different lowering path through CadQuery/OpenCascade.

That split is useful, but incomplete.

The next step is not a new language. It is a backend-neutral Forge runtime core.

## Non-Goals

- Do not invent a new parser or DSL.
- Do not replace Manifold everywhere.
- Do not attempt a full OCCT runtime in the browser immediately.
- Do not silently auto-convert between backends without diagnostics.
- Do not block current Manifold workflows while this architecture is built.

## Target Architecture

```text
Forge JS/TS scripts
        |
        v
Forge semantic model / feature graph
        |
        +--> Manifold lowering     -> fast viewport/runtime solids
        |
        +--> CadQuery/OCCT lowering -> exact solids / manufacturing / exchange
```

Short version:

1. Keep JS/TS as the host language.
2. Make Forge's own semantic model the source of truth.
3. Lower that model into the backend that is appropriate for the operation.

## Current State

Before this mission:

- `geometryInfo()` already exists as a backend/provenance contract.
- exact export already has a replay plan for a subset of operations.
- `Shape` still stores a raw Manifold payload directly.
- several runtime paths still depend on Manifold-specific behavior directly.

After the first implementation slice for this mission, the minimum acceptable state is:

- `Shape` is backend-agnostic in implementation
- current runtime behavior stays intact through a Manifold adapter
- backend-specific behavior is isolated behind backend-owned modules
- the repo has a concrete tracker for the remaining compiler work

## Status After First Runtime Refactor

- `Shape` no longer stores a raw Manifold payload directly.
- `src/forge/shapeBackend.ts` now owns the Manifold runtime adapter.
- sectioning now uses shape/backend operations instead of reaching into `.manifold`.
- scene-builder export payloads are isolated behind `src/forge/shapeBackendSceneBuilder.ts`.
- `src/forge/compilePlan.ts` is now the canonical semantic plan module.
- `src/forge/cadqueryPlan.ts` now names the exact target plan in CadQuery/OCCT terms.
- `src/forge/brepPlan.ts` is now a compatibility bridge, not the architectural center.
- `src/forge/compilePlanCadQuery.ts` is now the explicit lowering boundary into the CadQuery/OCCT exact subset.
- `src/forge/compilePlanBrep.ts` is now a compatibility wrapper over the CadQuery/OCCT lowerer instead of the architectural implementation.
- `src/forge/compilePlanManifold.ts` is now the executable lowering boundary into the Manifold runtime.
- compile-covered primitives, sketch profiles, booleans, transforms, extrudes, and revolves now rebuild from Forge compile plans instead of manually restating the same Manifold calls at each callsite.
- compile plans now carry runtime tessellation hints where Forge needs them, while the CadQuery/OCCT lowerer explicitly rejects faceted runtime intent instead of silently upgrading it.
- `src/forge/compilerReport.ts` now centralizes CadQuery/OCCT, runtime, and faceted compiler routing for shapes.
- STEP/BREP export now routes through compiler reports instead of open-coding exact/fallback decisions in the export layer.
- STEP/BREP export manifests now serialize the exact lowerer target explicitly as `cadquery-occt`, and the Python exporter validates that target instead of accepting anonymous "exact" plans.
- `forgecad check compiler` now snapshots compile plans, exact lowerings, runtime Manifold summaries, and compiler-lowered Manifold summaries for curated cases.
- the hull family (`hull3d()`, `Shape.hull()`, `hull2d()`, `Sketch.hull()`) now stays inside the Forge compile graph for the Manifold runtime instead of dropping straight to mesh-only execution.
- `Shape.split(cutter)` now stays compiler-owned when both operands are compile-covered, and exact export can replay both returned branches through the existing boolean lowerers.
- `trimByPlane()` and `splitByPlane()` now stay compiler-owned for compile-covered solids, and the CadQuery/OCCT target replays them through exact plane half-space trimming instead of faceted fallback.
- `loft()` and `sweep()` now stay compiler-owned for compile-covered inputs instead of dropping directly to sampled runtime-only geometry.
- the Manifold lowerer now rebuilds `loft`/`sweep` from shared compiler-owned sampled lowering helpers instead of relying on bespoke callsite geometry code.
- the CadQuery/OCCT target now lowers compatible `loft` and `sweep` plans, and the Python exact exporter executes those plans end-to-end.
- `src/forge/compiledScene.ts` now centralizes scene-level compiler routing so export policy, debug tooling, and future backend capability work consume one compiler-owned route layer instead of re-deriving decisions per caller.
- sketches placed with `onFace()` now record semantic workplane/query metadata alongside the resolved placement matrix, which is the first explicit slice of the reference/workplane model instead of raw transform-only state.
- downstream `extrude()` / `revolve()` features from `onFace()` sketches now preserve semantic workplane placement intent in the shape compile graph instead of immediately collapsing that placement back to a generic transform matrix.
- compiler-visible workplane placement now propagates through later shape transforms, so provenance inspection stays truthful after downstream `translate` / `rotate` / `scale` style edits instead of freezing at feature creation time.
- `src/forge/kernel.ts` now exposes compiler-visible workplane placement inspection for downstream feature work, so later feature families can ask "what workplane/query produced this shape?" without reverse-engineering transforms.
- both lowerers and the exact STEP exporter now execute that compiler-owned workplane placement step, and the invariant suite covers the end-to-end path.
- compile-covered shape results now carry compiler-owned `queryOwner` lineage, so parent-body ownership is preserved in the Forge compile graph instead of living only in incidental runtime objects.
- `FaceRef` values and recorded workplane sources now carry that owner identity when it exists, which lets downstream workplane-driven features remember which parent body a face came from, not just the face name.
- boolean, shell, split/trim, loft/sweep, and downstream workplane-driven feature results now preserve owner lineage, and the placement invariants cover a shell-plus-cut-plus-boolean chain instead of only isolated placements.
- mirrored descendants plus helper-driven linear/circular repetition now assign fresh repeated-result owners on top of that same query backbone instead of collapsing back to the seed feature owner.
- `Shape.shell()` now records semantic shell intent in the Forge compile graph instead of bypassing the compiler, and both lowerers consume that same node.
- shell v1 is intentionally narrow: compile-covered `box()`, `cylinder()`, and straight `extrude()` bases with optional `top` / `bottom` openings plus rigid transforms before shelling.
- both lowerers rewrite supported shell plans into backend-native boolean/extrude/cylinder plans, so exact STEP/BREP export uses the same compiler path instead of exporter-only shell logic.
- `Shape.hole()` and `Shape.cutout()` now record compiler-owned hole/cut intent instead of requiring users to hand-build raw subtractive cutters for ordinary face-driven workflows.
- the supported hole/cut v1 subset covers circular through/blind holes plus `onFace()`-anchored through/blind cutouts, and both lowerers replay that subset from the same semantic node family.
- the CadQuery/OCCT lowerer now rejects hull intent explicitly with targeted diagnostics instead of a generic missing-plan failure.
- `forgecad debug compiler` now prints per-object compiler routing and lowered artifacts for investigation.
- `forgecad check suite` and `npm test` now expose the repo's assertion-based invariant suite as a first-class test entrypoint instead of leaving the checks scattered across ad hoc commands.
- the compiler and BREP regression suite now includes explicit `loft` / `sweep` plan invariants and an end-to-end STEP exporter check for those feature families.
- the compiler and BREP regression suite now also covers `shell()` lowering, route policy, and end-to-end exact export for the supported shell subset.
- the compiler and BREP regression suite now also covers the supported hole/cut workflow subset, including exact-plan inspection and end-to-end STEP export.
- the regression suite now includes a curated enclosure-style multi-feature part that combines shell, workplane-driven cuts, mirrored support feet, and booleans in one exact-exportable flow.
- the regression suite now also includes a repeated-feature plate where mirrored descendants, patterned cuts, booleans, and downstream workplane details stay aligned across the compiler and exact-export checks.
- build and focused runtime/API checks pass on the Manifold-backed runtime.

## Tracker

| Step | Status | Notes |
| --- | --- | --- |
| 1. Define the mission and transition rules | Done | This document is the active tracker. |
| 2. Put a backend adapter behind `Shape` | Done | `Shape` now wraps a runtime backend payload instead of a raw Manifold field. |
| 3. Replace implicit `.manifold` reach-through with backend-owned specializations | Done | Backend-specific paths moved behind backend modules. |
| 4. Keep current Manifold runtime behavior stable through the adapter | Done | Build plus focused runtime/API checks passed. |
| 5. Formalize a backend-neutral Forge compile graph | In progress | The compile plan now covers primitives, sketch profiles, booleans, transforms, extrudes, revolves, hulls, plane trims/splits, sampled `loft` / `sweep`, and shell v1; broader feature coverage is still needed. |
| 6. Route operations intentionally by backend capability | In progress | Scene-level exact/faceted/skipped/unsupported routing is now centralized in `compiledScene.ts`; richer multi-backend capability routing is still pending. |
| 7. Add backend mismatch / conversion diagnostics | In progress | Exact BREP lowering now emits explicit diagnostics and compiler snapshot tooling preserves them. |
| 8. Introduce an OCCT/CadQuery lowering path beyond export-only replay | In progress | The `cadquery-occt` target now covers the current exact subset plus compatible `loft` / `sweep` plans and shell v1; feature coverage is still narrow and export-driven. |
| 9. Make both backends true lowerers from the same compile graph | In progress | Shared lowering now reaches farther into mainstream features, but the checkpoint still depends on broader feature families and stronger reference stability. |
| 10. Cover mainstream design-feature families across both lowerers | In progress | Shell v1 plus a first hole/cut workflow slice and repeated mirror/pattern ownership are in; fillet/chamfer, richer hole/cut variants, projections, and richer patterned descendants still remain. |
| 11. Push exact export fully behind the CadQuery/OCCT lowerer | In progress | Export now consumes an explicit `cadquery-occt` compiler target, but the target still needs much broader feature coverage. |
| 12. Add advanced hybrid-only feature families | Deferred | Sheet metal stays deferred until the active checkpoint is done. |

## Current Validation

- `npm test` now runs the current assertion-based invariant suite for compiler/export/runtime/API behavior.
- `forgecad check suite` is the CLI entrypoint for the same invariant suite.
- `forgecad check compiler` snapshots canonical compiler cases and fails if runtime geometry drifts away from compiler-lowered Manifold output.
- The snapshot baseline now includes compile plans, CadQuery/OCCT lowerings, export routing decisions, and quantized Manifold mesh/polygon digests.
- The compiler check also asserts that exact/faceted export manifests stay consistent with the per-object compiler reports, not just with the saved JSON baseline.
- Scene-level route decisions are now part of the compiler inspection surface, so route drift becomes a reviewable regression instead of a hidden internal policy change.
- Query-owner IDs now reset per script run before compiler inspection, so snapshot diffs stay deterministic instead of depending on earlier checks in the same process.
- Placement/reference invariants now assert owner-lineage propagation, not just matrix equivalence.
- Placement/reference invariants now also assert tracked-edge query propagation plus `start` / `end` / `midpoint` selector alignment for tracked-topology flows.
- `forgecad check brep` still guards the exact export subset separately.

## Current Test Model

ForgeCAD does not have a separate Vitest/Jest layer for this compiler work right now.

The current unit-style test strategy is:

- keep the checks as plain assertion-driven CLI runners
- expose the curated suite through `npm test`
- keep compiler regressions reviewable through committed JSON snapshots
- keep routing/export invariants enforced with direct assertions so not every failure becomes "just update the snapshot"

## Current Risks And Issues

- The compile graph still does not cover important operation families including deformation ops (`warp`, `smoothOut`, `refine*`), `levelSet`, fillet/chamfer families, richer hole/cut variants (counterbores, countersinks, up-to-face logic), and richer projection/feature-pattern workflows. Those shapes still lose compile intent and fall back to mesh-only behavior.
- The new sketch workplane metadata plus shared face/edge query lineage are a meaningful foundation step, but not the full answer yet. Forge now owns parent-body identity and tracked-topology query selectors for compile-covered feature chains, but it still does not own durable face/edge identity through topology-changing edits.
- The compiler now preserves `onFace()` workplane placement and parent-body ownership through `extrude()` / `revolve()`, booleans, shell, split/trim, downstream transforms, and repeated-result owners for mirrored/helper-patterned descendants. The remaining hard part is richer query propagation once features start depending on shell-created faces, projection targets, merged patterned children, and fillet/chamfer-owned topology.
- `shell()` is now compiler-owned, but only for compile-covered `box()`, `cylinder()`, and straight `extrude()` bases with rigid pre-shell transforms. Broader shell semantics will still need stable face/edge identity once downstream edits depend on shell-created faces rather than just parent-body lineage.
- The hull family is now compile-covered for the Manifold runtime, but exact OCCT replay is still missing. That means hull intent is preserved and diagnosable, but STEP/BREP still needs faceted fallback for those shapes.
- `loft()` exact export is narrower than Forge's sampled loft semantics. Forge can interpolate aggressively across differing profile topology through SDF blending, while CadQuery/OCCT section lofting can still reject some extreme mixed-topology stacks.
- `sweep()` exact export currently canonicalizes paths to sampled polyline points before lowering. That keeps runtime and exact export aligned, but it is not yet a true analytic spline-path representation for OCCT.
- Exact BREP lowering is intentionally narrower than runtime Manifold lowering. Segmented circles, segmented cylinders/spheres, and segmented revolves remain runtime-valid but exact-export-invalid by design.
- Compiler snapshots use quantized mesh and polygon digests. That is strong enough to catch real regressions, but a Manifold upgrade or tessellation policy change can legitimately require baseline churn, so snapshot updates still need human review.
- Topology and placement-reference semantics are only partially compiler-owned. Forge now owns workplane placement plus shared face/edge query metadata for compile-covered tracked-topology flows, but it still does not own stable face/edge identity after topology-changing operations.
- There is still no true OCCT/CadQuery interactive runtime backend. Exact export now uses compiler-owned CadQuery lowering for a broader subset, but Forge still does not have a second full geometry runtime alongside Manifold.
- "Most Fusion 360 regular design features" is only realistic if Forge owns stable references for face/edge-driven downstream features. Without that, feature coverage can look broad on paper while failing in real part workflows.
- Manifold and CadQuery/OCCT do not have matching native capability sets. Some features will need a canonical Forge semantic representation that is richer than either backend's first-choice API.

## Principles

### 1. Forge owns intent

The durable thing is Forge's meaning, not Manifold calls and not CadQuery calls.

### 2. Backends are replaceable

If a backend changes, user scripts should mostly survive.

### 3. Fast and exact are different products

Manifold is still the right tool for fast iteration and browser-time regeneration.
OCCT is the right tool where exactness, topology persistence, and manufacturing matter.

### 4. Conversions must be visible

When an operation crosses backend boundaries, that should be inspectable in diagnostics and metadata.

### 5. The first IR is not the final IR

The current exact-export replay plan is useful, but it is not yet the full universal Forge model.
It should be treated as an input to the future compile graph, not the final architecture.

## Immediate Implementation Scope

This round is intentionally narrow:

- make `Shape` stop depending on a raw Manifold field
- introduce a runtime backend adapter
- keep the adapter Manifold-backed for now
- make the compile plan executable against the Manifold runtime
- keep exact STEP/BREP export routed through the compiler with honest subset boundaries

This is enough to turn the hybrid backend plan from an idea into real runtime structure.

## Success Criteria For This Round

- The app still builds.
- Existing examples and CLI checks still run on the Manifold runtime.
- The codebase has a backend adapter layer instead of direct `Shape -> Manifold` coupling.
- The remaining backend-specific code is easy to find and reason about.
- The next engineer can continue toward a real Forge compile graph without undoing this work.

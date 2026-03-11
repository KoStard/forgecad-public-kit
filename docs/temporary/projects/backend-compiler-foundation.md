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
- `src/forge/brepPlan.ts` is now a compatibility bridge, not the architectural center.
- `src/forge/compilePlanBrep.ts` is the explicit lowering boundary into exact BREP export plans.
- `src/forge/compilePlanManifold.ts` is now the executable lowering boundary into the Manifold runtime.
- compile-covered primitives, sketch profiles, booleans, transforms, extrudes, and revolves now rebuild from Forge compile plans instead of manually restating the same Manifold calls at each callsite.
- compile plans now carry runtime tessellation hints where Forge needs them, while the exact BREP lowerer explicitly rejects faceted runtime intent instead of silently upgrading it.
- `src/forge/compilerReport.ts` now centralizes exact/faceted compiler routing for shapes.
- STEP/BREP export now routes through compiler reports instead of open-coding exact/fallback decisions in the export layer.
- `forgecad check compiler` now snapshots compile plans, exact lowerings, runtime Manifold summaries, and compiler-lowered Manifold summaries for curated cases.
- `forgecad debug compiler` now prints per-object compiler routing and lowered artifacts for investigation.
- build and focused runtime/API checks pass on the Manifold-backed runtime.

## Tracker

| Step | Status | Notes |
| --- | --- | --- |
| 1. Define the mission and transition rules | Done | This document is the active tracker. |
| 2. Put a backend adapter behind `Shape` | Done | `Shape` now wraps a runtime backend payload instead of a raw Manifold field. |
| 3. Replace implicit `.manifold` reach-through with backend-owned specializations | Done | Backend-specific paths moved behind backend modules. |
| 4. Keep current Manifold runtime behavior stable through the adapter | Done | Build plus focused runtime/API checks passed. |
| 5. Formalize a backend-neutral Forge compile graph | In progress | The compile plan is now executable for the current exact/runtime subset; broader feature coverage is still needed. |
| 6. Route operations intentionally by backend capability | In progress | Exact-vs-faceted export routing now goes through compiler reports; richer multi-backend capability routing is still pending. |
| 7. Add backend mismatch / conversion diagnostics | In progress | Exact BREP lowering now emits explicit diagnostics and compiler snapshot tooling preserves them. |
| 8. Introduce an OCCT/CadQuery lowering path beyond export-only replay | Pending | After the runtime contract is stable. |
| 9. Add feature families that benefit from hybrid lowering | Pending | Sheet metal is a strong candidate later. |

## Current Validation

- `forgecad check compiler` snapshots canonical compiler cases and fails if runtime geometry drifts away from compiler-lowered Manifold output.
- The snapshot baseline now includes compile plans, exact BREP lowerings, export routing decisions, and quantized Manifold mesh digests.
- `forgecad check brep` still guards the exact export subset separately.

## Current Risks And Issues

- The compile graph still does not cover important operation families including `hull3d`, plane splits/trims, deformation ops (`warp`, `smoothOut`, `refine*`), `levelSet`, and the sampled `loft`/`sweep` paths. Those shapes still lose compile intent and fall back to mesh-only behavior.
- Exact BREP lowering is intentionally narrower than runtime Manifold lowering. Segmented circles, segmented cylinders/spheres, and segmented revolves remain runtime-valid but exact-export-invalid by design.
- Compiler snapshots use quantized mesh and polygon digests. That is strong enough to catch real regressions, but a Manifold upgrade or tessellation policy change can legitimately require baseline churn.
- Topology and placement-reference semantics still live outside the compile graph. The compiler can replay geometry intent, but it does not yet own stable face/edge identity.
- There is still no true OCCT/CadQuery lowerer driven from the compile graph. Exact export uses the compiler boundary, but not yet a second full geometry backend runtime.

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
- keep exact BREP export as a separate lowering with honest subset boundaries

This is enough to turn the hybrid backend plan from an idea into real runtime structure.

## Success Criteria For This Round

- The app still builds.
- Existing examples and CLI checks still run on the Manifold runtime.
- The codebase has a backend adapter layer instead of direct `Shape -> Manifold` coupling.
- The remaining backend-specific code is easy to find and reason about.
- The next engineer can continue toward a real Forge compile graph without undoing this work.

# Forge Compiler Architecture

This is the durable architecture record for ForgeCAD's multi-backend modeling system.

If you add or refactor geometry features, read this first.

## Core Position

Forge should not invent a new CAD language or a new geometry kernel.

Forge should:

- keep JS/TS as the host language
- keep Forge's semantic feature model as the source of truth
- lower that model into different geometry backends intentionally
- make capability gaps explicit in diagnostics and tests

The unique thing to protect is not backend code. It is Forge's code-first modeling layer:

- browser-first iteration
- parametric code as the authoring format
- composable multi-file projects
- AI-writable design code
- explicit provenance and backend visibility

## What To Steal

We should steal proven ideas aggressively.

Steal from Fusion 360 / Onshape / FeatureScript:

- semantic feature graphs
- workplanes and sketch planes as first-class modeling context
- query/reference systems for faces, edges, bodies, and feature results
- feature definitions that lower into kernels instead of directly calling them from UI/API code

Steal from CadQuery / build123d / replicad:

- OCCT execution patterns
- exact solid feature expectations
- practical scripting ergonomics around sketches, planes, and feature builders

Steal from OCAF-style document systems:

- durable reference identity
- explicit ownership of topology/reference propagation

Do not steal:

- a separate Forge DSL
- backend object models as the user-facing API
- exporter-only side systems that bypass the compiler

## The Make-Or-Break Layer

This is where Forge will likely succeed or fail:

- the semantic feature graph
- the compiled-scene routing layer
- the reference / workplane / query system

Why:

- primitives, booleans, extrudes, and revolves are not the hard part
- real mechanical design depends on downstream face- and edge-driven features
- those features only stay usable if references survive feature chains predictably

If this layer is weak, the repo will accumulate:

- backend-specific feature code at callsites
- export-only implementations
- brittle face-name assumptions
- features that work in demos but collapse in real parts

If this layer is strong, future features stay additive.

## Success Criteria

We are succeeding only if all of these are true:

1. Forge compile intent is the source of truth for mainstream part-design features.
2. Scene-level routing is centralized, inspectable, and reused by export/debug/test flows.
3. New features do not need ad hoc backend decisions at callsites.
4. Workplane/reference/query semantics are stable enough for ordinary downstream feature chains.
5. Most normal Design-workspace features can be added by extending one semantic node family and two lowerers.
6. Tests catch plan drift, routing drift, and backend-output drift before release.

We are failing if any of these become normal:

- "this feature only works in export"
- "this feature only works in Manifold"
- "this feature only works if you know the right face name"
- "just add one more backend escape hatch"
- "the snapshot changed, probably fine"

## Contributor Contract

When adding a geometry feature:

1. Define the Forge semantic intent first.
2. Decide which domain owns it.
3. Add or extend the compile node.
4. Lower it through Manifold.
5. Lower it through CadQuery/OCCT, or add explicit unsupported diagnostics.
6. Route it through the scene compiler.
7. Add invariants and snapshot coverage.
8. Update permanent docs and the living mission tracker.

Do not:

- call Manifold or CadQuery directly from user-facing feature APIs unless that code is the backend lowerer itself
- add exporter-only feature behavior that is invisible to the compiler
- silently widen or narrow exact coverage

## Implementation Path

### Phase 1: Compiler Ownership

Goal:

- every supported feature records Forge intent
- lowerers consume that intent
- scene routing is centralized

Deliverables:

- backend-neutral compile nodes
- compiled-scene routing and diagnostics
- snapshot and invariant coverage

### Phase 2: Reference / Workplane / Query Model

Goal:

- face-, edge-, and plane-driven features stop depending on brittle synthetic naming

Deliverables:

- first-class workplane representation
- query/reference API for "what this feature means"
- propagation rules for downstream feature ownership

This is the highest-leverage next layer. Without it, `shell`, fillet/chamfer, holes, projection, and sheet-metal-style features will all stay fragile.

Initial slice:

- sketches placed with `onFace()` should carry semantic workplane/query metadata, not just a resolved 4x4 matrix
- downstream feature code should be able to ask "which workplane/query produced this?" without reverse-engineering transforms

### Phase 3: Mainstream Feature Families

Goal:

- dual-lower the ordinary part-design stack

Priority order:

- `shell`
- fillet / chamfer
- holes / patterned cuts
- projection and sketch-on-face refinement
- mirror / pattern workflows driven by semantic references

### Phase 4: Higher-Order Workflows

Goal:

- features like sheet metal, advanced library helpers, and richer manufacturing flows build on the same semantic core

These should arrive after the reference/workplane/query layer is credible, not before.

## Current Architectural Boundary

Today, the intended compiler boundary is:

```text
Forge scripts
    -> Forge semantic feature graph
    -> compiled scene + capability routing
    -> Manifold lowerer / CadQuery-OCCT lowerer / faceted fallback
```

Future feature work should strengthen this boundary, not route around it.

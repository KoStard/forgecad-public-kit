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

Current progress:

- `onFace()` placements now record semantic workplane models on sketches
- `extrude()` and `revolve()` now preserve that intent in the shape compile graph as a first-class workplane-placement transform instead of collapsing it to an anonymous rigid transform
- downstream compiler-aware code can now inspect that preserved workplane placement directly
- that compiler-visible workplane placement now propagates through later shape transforms, so provenance inspection stays aligned with the current transformed feature state
- both lowerers now execute that preserved workplane-placement intent, and exact export regression tests exercise the CadQuery/OCCT path end-to-end
- compile-covered feature results now carry compiler-owned query-owner lineage, so parent-body ownership is no longer implicit runtime state
- `src/forge/queryModel.ts` now defines the shared query/reference contract for face provenance instead of letting workplane and topology code drift separately
- workplane sources and `FaceRef` values now share that face-query contract when compiler-owned provenance exists
- booleans, shell, split/trim flows, and downstream workplane-driven features now preserve that owner lineage through the compile graph instead of erasing it at each feature boundary
- mirrored results plus `linearPattern()` / `circularPattern()` helper copies now get fresh compiler-owned repeated-result owners when their source shapes stay compile-covered
- placement and exact-export invariants now check that owner lineage survives ordinary shell-plus-cut-plus-boolean style part workflows

Still missing:

- durable face/edge identity across topology-changing operations
- richer query propagation rules for shell-created faces, fillet/chamfer ownership, projection targets, and merged patterned descendants
- stable face/edge references beyond today's tracked/canonical face foundations

### Phase 3: Mainstream Feature Families

Goal:

- dual-lower the ordinary part-design stack

Priority order:

- `shell`
- fillet / chamfer
- holes / patterned cuts
- projection and sketch-on-face refinement
- mirror / pattern workflows driven by semantic references

Current progress:

- `shell()` is now compiler-owned as the first mainstream exact feature-family slice instead of being left for exporter-only logic
- both lowerers consume the same semantic `shell` node and rewrite supported cases into backend-native boolean/extrude/cylinder plans
- regression coverage now includes compiler snapshots plus exact-export invariants for `shell()`
- the regression suite now also includes a curated enclosure-style multi-feature part so shell, workplane-driven cuts, mirrors, and booleans are exercised together instead of only as isolated unit slices
- mirrored downstream features and helper-driven linear/circular repetition now preserve repeated-result ownership on top of the shared face-query backbone
- exact export regression coverage now includes a repeated-feature part where a mirrored descendant drives a downstream workplane feature inside a boolean chain

Current limits:

- `shell()` v1 only covers compile-covered `box()`, `cylinder()`, and straight `extrude()` bases with optional `top` / `bottom` openings
- repeated-feature ownership currently tracks repeated bodies and mirrored descendants, not durable per-face identity after merged pattern topology changes
- shelling now preserves parent-body ownership lineage, but stable downstream face ownership after shell-created topology changes is still not solved, which is why fillet/chamfer, holes, and projection-driven edits are still the harder next layer

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

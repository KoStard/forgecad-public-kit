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
- `src/forge/queryModel.ts` now also defines the shared edge-query contract for tracked edges and direct edge refs, including selector semantics for whole-edge vs. `start` / `end` / `midpoint` references
- tracked-topology flows now preserve that edge-query metadata through clone/translate/workplane-placement transforms, and placement invariants assert that tracked edge selectors stay aligned with the actual transformed edge geometry
- booleans, shell, split/trim flows, and downstream workplane-driven features now preserve that owner lineage through the compile graph instead of erasing it at each feature boundary
- mirrored results plus `linearPattern()` / `circularPattern()` helper copies now get fresh compiler-owned repeated-result owners when their source shapes stay compile-covered
- placement and exact-export invariants now check that owner lineage survives ordinary shell-plus-cut-plus-boolean style part workflows
- topology-changing compile nodes now also carry an explicit backend-neutral `queryPropagation` contract for preserved/created query meaning instead of leaving post-rewrite semantics implicit
- that shared propagation contract now models propagated face/edge queries, feature-created query slots, and explicit ambiguity/unsupported diagnostics on rewrite-producing results
- trim/split-by-plane, shell, hole, cut, boolean, and edge-finish rewrites now also declare descendant contracts on top of that propagation kernel
- the shared descendant-resolution layer turns those lineage inputs into defended singles, face regions/sets, edge chains, or explicit unsupported results instead of making each caller reverse-engineer rewrite heuristics
- trim/split-by-plane now expose their plane-cap face plus descendant-region contracts for preserved source surfaces, while hole/cut host-face splits and supported boolean difference/intersection descendants stay reviewable as defended regions instead of disappearing behind one generic ambiguity bucket
- boolean rewrites now consume that same contract: supported unions still preserve operand canonical-face/query lineage when the source owners stay distinct, and coplanar/multi-member descendants can now surface as defended face sets instead of only masked name conflicts
- shell, hole, and cut now layer defended created-face slots plus defended descendant regions on top of that propagation kernel instead of leaving all post-rewrite face meaning as placeholders
- compile-covered `Shape.face(name)` resolution now reads from the compile graph plus the descendant layer, so supported shell inner walls, blind-hole floors, cut-created walls, split host faces, and defended boolean face sets can produce real `FaceRef` values after topology rewrites
- non-canonical `onFace(shape, 'inner-side-right', ...)` placement now routes through that same compiler-owned face resolver, while direct `FaceRef` placements preserve created-face/propagated-face provenance instead of collapsing everything back to anonymous refs
- `src/forge/kernel.ts` and the compiler inspection surface now expose collected topology-rewrite propagation plus descendant contracts directly, and the placement/compiler invariants assert that those contracts stay inspectable and deterministic through later transforms
- `forgecad check query-propagation` now snapshots both the propagation surface and the descendant contracts directly, so defended plane-cap faces, split-face regions, face sets, merged-edge chains, and explicit unsupported rewrite boundaries stay reviewable without wading through the full compiler-scene baseline

Still missing:

- universal durable face/edge identity across topology-changing operations
- mesh/SDF rewrite families still need their own explicit descendant contracts instead of borrowed BREP-style assumptions
- shared edge-query selectors exist for tracked topology, but topology-changing features still do not produce new single-edge ownership for most rewritten/created edges beyond today's defended preserved-edge and edge-chain subset
- stable downstream face/edge references beyond today's defended single/region/set/chain subset still need the follow-on work in tasks 180, 190, and 195

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
- `shape.hole()` and `shape.cutout()` now form a compiler-owned hole/cut workflow slice anchored to the shared face-query/workplane model
- through holes, blind holes, counterbores, countersinks, and planar `upToFace` hole/cut extents now lower through both Manifold and CadQuery/OCCT from that shared semantic node family
- shell, hole, and cut now expose defended named created-face subsets on top of the topology-rewrite kernel, so downstream features can target inner shell walls, blind-hole floors, and supported cut walls/floors without falling back to anonymous runtime placement
- richer hole variants now also expose defended `counterbore-floor`, `counterbore-wall`, and `countersink-wall` created-face slots where Forge can model them directly
- `filletEdge()` and `chamferEdge()` now form a first compiler-owned tracked-edge finishing slice for supported vertical edges on compile-covered `box()` and `rectangle(...).extrude(...)` bodies
- the post-rewrite edge-query layer now also defends untouched sibling vertical edges after those supported edge-finish rewrites, plus later supported boolean-union descendants when one preserved propagated-edge lineage stays explicit
- regression coverage now includes compiler snapshots plus exact-export invariants for `shell()`
- regression coverage now also includes exact/runtime/export checks for the supported hole/cut workflow subset
- regression coverage now also includes API, placement-owner, query-propagation, compiler-snapshot, exact-plan, corpus, and end-to-end export checks for the broadened tracked-edge fillet/chamfer subset
- the regression suite now also includes a file-backed ordinary-parts corpus under `examples/compiler-corpus/`, so shell, richer hole/cut workflows, projection replay, trim-created faces, repeated descendants, and finishing flows are exercised together instead of only as isolated unit slices
- the MLP closeout review surface now lives in that corpus plus `forgecad check compiler`, `forgecad check query-propagation`, and `forgecad check brep`, so the defended subset is reviewable from the repo instead of from tribal knowledge
- mirrored downstream features and helper-driven linear/circular repetition now preserve repeated-result ownership on top of the shared face-query backbone
- supported boolean unions now also preserve owner-scoped canonical face queries from repeated descendants, and compiler regressions cover both explicit duplicate-owner merge ambiguity and later boolean chains that inherit those propagated queries
- exact export regression coverage now includes a repeated-feature part where a mirrored descendant drives a downstream workplane feature inside a boolean chain
- `projectToPlane()` sketches now keep an explicit projection node in the compiler graph instead of collapsing immediately to anonymous runtime geometry
- compile-covered `Sketch.onFace(shape, name)` resolution now prefers the defended face-query table on `Shape` targets, so supported boolean-preserved names and explicit repeated-descendant `FaceRef`s stay visible to later features instead of falling back to anonymous canonical heuristics
- the supported exact subset can now replay projection-driven follow-on features when the source reduces to one defended planar projection basis: placed straight extrusions, compatible shell/hole/cut descendants, and boolean unions of compatible projected operands all stay aligned on matching parallel target planes

Current limits:

- `shell()` v1 only covers compile-covered `box()`, `cylinder()`, and straight `extrude()` bases with optional `top` / `bottom` openings, while defended named created faces currently cover the exact profile families Forge can model directly (`rect`, `roundedRect`, `circle`)
- `shape.hole()` still only covers circular holes, and `shape.cutout()` still only covers sketches already placed with `onFace(...)`
- `filletEdge()` / `chamferEdge()` v1 cover tracked vertical edges on compile-covered `box()` and `rectangle(...).extrude(...)` bodies plus preserved propagated sibling edges through supported edge-finish and boolean-union chains; the selected rewritten edge now resolves as an explicit descendant edge-chain for inspection/debug, but not yet as a new single finishable edge target
- drafted cuts, two-sided extents, combined counterbore+countersink heads, threaded holes, and broader durable identity beyond today's defended shell/hole/cut created-face subset are still missing
- `upToFace` currently requires a planar termination face parallel to the feature direction, but defended split termination faces can now stay queryable as descendant regions where Forge still owns the source plane
- boolean/pattern propagation currently defends owner-scoped canonical face lineage through supported unions, and the descendant layer can now expose some post-merge/post-difference results as face sets/regions, but broader durable per-face ownership after arbitrary merged topology changes is still incomplete
- repeated-feature ownership currently tracks repeated bodies and mirrored descendants, not durable per-face identity after merged pattern topology changes
- shell, hole/cut, tracked-edge finishing, and repeated-feature workflows now preserve parent-body ownership lineage, but stable downstream face/edge ownership after topology-changing edits is still not solved, which is why richer boolean-difference/intersection targets and broader fillet/chamfer workflows remain harder next layers
- projection replay still rejects boolean difference/intersection sources, trim/fillet/chamfer silhouette changes, and non-parallel projection bases with explicit compiler diagnostics instead of silently pretending those paths are exact-safe

### Phase 4: Higher-Order Workflows

Goal:

- features like sheet metal, advanced library helpers, and richer manufacturing flows build on the same semantic core

Current progress:

- `sheetMetal()` now exists as the first dedicated higher-order semantic family on top of the descendant-resolution layer
- one sheet-metal model now lowers to both a folded solid and a flat pattern instead of splitting folded/export logic across backend-specific codepaths
- named `panel`, `flange-*`, and `bend-*` descendants now flow through the shared face-descendant machinery, so downstream cutouts can still expose honest region/set semantics after topology rewrites
- the maintained `folded-service-panel-cover` proof part now lives in the API examples, compiler corpus, query-propagation snapshots, API invariants, and exact BREP checks

These higher-order families should keep arriving only after the shared reference/workplane/query layer is credible enough to defend them honestly.

## Current Architectural Boundary

Today, the intended compiler boundary is:

```text
Forge scripts
    -> Forge semantic feature graph
    -> compiled scene + capability routing
    -> Manifold lowerer / CadQuery-OCCT lowerer / faceted fallback
```

Future feature work should strengthen this boundary, not route around it.

## Next Achievable CAD Families

Once the descendant-resolution layer is in place, the next credible expansion lanes are:

- richer hole and cut variants
- broader shell workflows
- broader fillet/chamfer workflows
- stronger projection and sketch-on-face flows
- richer sheet-metal corner and detail workflows on top of the new semantic family
- manufacturing outputs such as flat patterns and DXF/SVG profile export
- toolbox and library feature families
- stronger assembly metadata and exact/faceted route visibility

These are all good fits for the compiler architecture because they can be expressed as Forge-owned semantic intent and lowered intentionally into both backends.

## Bigger Leap Areas

Some CAD-adjacent areas are still important, but they are a bigger leap than the current compiler program:

- arbitrary direct editing over imported or heavily rewritten BReps
- advanced surfacing or subD/T-spline workflows
- CAM
- simulation / FEA
- full enterprise document/PDM systems
- full large-assembly and mate-solver parity with major desktop CAD tools

Keep these visible, but do not plan them as if they were just another feature module on the current part-design stack.

## Legacy Cleanup Rule

Yes, the old architecture needs cleanup.

No, that should not happen as a single flag-day rewrite.

The rule is:

1. add compiler-owned replacements first
2. fence old bypass paths so new work cannot extend them
3. retire legacy shims once supported features and examples no longer need them

That keeps the repo honest without destabilizing active work.

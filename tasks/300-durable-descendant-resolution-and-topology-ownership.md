# Durable Descendant Resolution And Topology Ownership
## Problem Definition
Forge now has lineage, propagation, and defended created-face slices, but it still does **not** own durable downstream topology after topology-changing edits.

Right now the system can often say:

- where a face/edge came from
- whether a rewrite preserved, split, or merged it
- when a few defended created faces exist

But it still cannot reliably do the thing real CAD workflows need:

- refer to the descendant topology **after** shell / hole / cut / boolean / fillet / chamfer / trim
- keep that reference meaningful for later features
- do so in a developer-friendly way instead of a pile of local heuristics

That is why we keep stopping at explicit ambiguity diagnostics.

The core problem is that the current model mostly tracks lineage, not durable descendants.

The next layer must treat the post-rewrite target as a first-class semantic object:

- sometimes one face/edge/vertex
- sometimes a coplanar face set
- sometimes an edge chain
- sometimes a region that can later be resolved to one specific member deterministically

This is the deepest remaining blocker for the larger checkpoint and the real prerequisite for feature families like sheet metal.

## North Star
In code, Forge should be as close as honestly possible to:

- reliably referring to any single surface/face, edge, or vertex in the whole system
- resolving post-rewrite descendants intentionally instead of collapsing to "ambiguous"
- keeping the developer experience pleasant and explicit

That does **not** mean pretending mesh/SDF-derived topology has exact durable identity when it does not.

It **does** mean:

- the compiler owns the best stable descendant model available
- unsupported cases are explicit
- supported cases are easy to use and easy to debug

## Description
Build the compiler-owned descendant-resolution layer on top of the current query propagation system.

This task should introduce a shared model for post-rewrite topology descendants and wire it through the main topology-changing feature families.

The key design shift is:

- stop treating `propagated-face` / `propagated-edge` as the final user-facing answer
- treat them as lineage inputs to a richer descendant-resolution layer

The system should support, at minimum, these semantic result shapes:

- one defended single descendant
- one defended face region or face set
- one defended edge chain
- explicit unsupported resolution when the compiler cannot honestly defend a result

The developer experience should make common operations pleasant:

- ask for the descendant surface/edge/vertex behind a query
- inspect whether it is single, set, chain, or unsupported
- access stable members of a defended set/chain deterministically when that is part of the contract
- place downstream features on a defended region without forcing the caller to reverse-engineer topology

## Scope
This is a core architecture task, not a feature-breadth task.

It should cover the shared layer plus the first meaningful downstream consumers.

Priority feature families for integration:

1. `hole`
2. `cut`
3. `trimByPlane`
4. `shell`
5. `boolean`
6. `fillet` / `chamfer`

Priority downstream consumers:

1. face/surface resolution
2. `onFace(...)`
3. feature extents like `upToFace`
4. edge-finish targeting
5. compiler inspection/debug surfaces

Vertex support should be designed into the model, even if only a narrow defended subset lands in this first task.

## Expected Architecture
The task should leave behind a shared descendant-resolution domain, not feature-local logic.

At a high level, Forge should have something equivalent to:

- lineage refs
- descendant contracts declared by each topology-changing feature
- a resolver that turns lineage + feature contracts into defended descendants
- downstream consumers that operate on resolution results instead of assuming "one face" or "one edge"

The resolution model should distinguish at least:

- `single`
- `face-set`
- `edge-chain`
- `vertex-set` or future-ready equivalent
- `unsupported`

The exact type names can differ, but the semantics must be clear and shared.

## Developer Experience Requirements
- The common call path for downstream feature code must be straightforward: one shared way to resolve descendant topology, not one helper per feature family.
- It must be easy to inspect the difference between:
  - one single descendant
  - one semantic region made of multiple descendants
  - one ambiguous/unsupported result
- When a defended face set is non-coplanar, the API must still make that clear and usable as a region/set instead of pretending it is one face.
- When a developer needs one specific member from a defended set/chain, the contract must be deterministic and reviewable, not based on incidental iteration order.
- Failure modes must produce actionable diagnostics, not just generic "query not found" errors.
- Debug tooling should let developers see the resolved descendant structure for a shape/query pair.

## Acceptance Criteria
- There is a new shared descendant-resolution layer in core Forge code that is separate from feature-local propagation heuristics.
- The layer can represent, at minimum:
  - a single descendant face/edge
  - a defended face region/set
  - a defended edge chain
  - an explicit unsupported outcome
- The topology-changing feature families in scope no longer stop at generic ambiguity for all post-rewrite cases; they declare defended descendant contracts where Forge can honestly do so.
- `shapeFaces`-style resolution can return and reason about descendant regions/sets instead of only singleton face names.
- Edge resolution no longer treats all post-rewrite created/merged descendants as a dead end; defended chain/set semantics exist where the task claims support.
- At least one downstream face-placement flow and one downstream edge-driven flow consume the new descendant-resolution layer instead of bypassing it.
- The model is future-ready for vertex ownership, and at least one narrow defended vertex path lands if practical; otherwise the docs and types make the pending vertex seam explicit.
- Compiler inspection/debug surfaces expose descendant-resolution information in a reviewable form.
- Regression coverage includes real multi-step workflows that prove:
  - single descendant resolution
  - face-set/region resolution
  - edge-chain resolution
  - explicit unsupported outcomes that remain explicit
- The docs explain both:
  - the north-star objective
  - the defended first landed subset

## Non-Goals
- Do not claim universal stable topology for mesh/SDF-derived geometry.
- Do not solve every feature family in one task.
- Do not introduce backend-specific matching rules at callsites.
- Do not hide unsupported cases behind fallback naming or arbitrary member selection.
- Do not jump straight to sheet metal in this task.

## Primary Files
- shared query/topology model files
- shared descendant-resolution module(s)
- `src/forge/queryModel.ts`
- `src/forge/queryPropagation.ts`
- `src/forge/booleanQueryPropagation.ts`
- `src/forge/shapeFaces.ts`
- edge resolution / finishing integration
- compiler inspection / debug / check surfaces
- permanent compiler architecture docs

## Isolation Rule
- This is the next deepest core lane. Keep it about shared descendant semantics, not feature breadth.
- If a feature family needs support work here, only implement the minimum necessary to prove the shared layer.
- Prefer shared contracts and resolvers over scattered local heuristics.
- If a choice exists between "more feature coverage" and "cleaner descendant semantics", choose the cleaner descendant semantics.

## Dependencies
- task 290

This task is intentionally written ahead of task 290 because task 290 is expected to identify this as the next deepest blocker explicitly.

## Parallelization
This should be treated as the next core lane after the post-MLP example phase closes.

Do not split this immediately into broad parallel feature tasks until the shared descendant-resolution contract lands.

Once this task lands, the likely safe follow-on wave is:

- broader hole/cut descendant ownership
- broader boolean/pattern descendant regions
- broader finishing-created topology ownership
- projection/sketch-on-face expansion on top of descendant regions
- sheet-metal semantic planning on top of the stronger topology layer

## Suggested Implementation Order
1. Define descendant-resolution core types and resolver boundaries.
2. Add face-region/set semantics to the current face resolution layer.
3. Add edge-chain semantics to the current edge resolution layer.
4. Extend topology-changing feature contracts to emit defended descendant structures instead of only ambiguity.
5. Wire the first downstream face consumer and edge consumer to the new layer.
6. Add compiler/debug/check visibility.
7. Add multi-step regression corpus cases and close out docs.

## Status and log
- 2026-03-13: Created as the post-290 core lane for durable topology/reference ownership and developer-friendly descendant resolution.

# Query / Reference Backbone
## Problem Definition
Forge's multi-backend compiler now preserves workplane placement and parent-body owner lineage, but the actual query/reference contract is still scattered across `compilePlan.ts`, `sketch/workplane.ts`, and `sketch/topology.ts`.

That makes the next feature wave fragile in two ways:

- feature agents will invent slightly different meanings for "what face/body did this come from?"
- future downstream features will keep coupling to face names plus incidental runtime state instead of one compiler-owned query model

Before hole workflows, projection, patterned downstream features, or fillet/chamfer work can be split safely across multiple agents, Forge needs one shared query/reference backbone.

## Description
Create a single compiler-owned query/reference model that all current placement and topology provenance flows share.

This slice should:

- define one canonical `ShapeQueryOwner` model
- define one canonical face-query model for canonical faces, tracked faces, and direct face refs
- route workplane provenance and topology refs through that same model
- add invariants so the shared query contract becomes reviewable and stable

This is the deepest prerequisite because every downstream feature family needs to answer the same question:

`What exact face/body/feature result is this attached to?`

## Requirements
- Introduce a shared query/reference model in source, not just in docs.
- Migrate current workplane and topology provenance to that model.
- Keep existing placement and exact-export behavior passing.
- Add or update regression checks so the query contract is asserted directly.
- Document what this core enables and what still remains unsolved.

## Status and log
- 2026-03-12: Claimed by Codex.
- 2026-03-12: In progress. Implementing a shared face-query model and rewiring current workplane/topology provenance to use it.
- 2026-03-12: Completed. Added `src/forge/queryModel.ts`, moved current workplane/topology provenance to the shared `FaceQueryRef` contract, and locked it down with placement invariants.

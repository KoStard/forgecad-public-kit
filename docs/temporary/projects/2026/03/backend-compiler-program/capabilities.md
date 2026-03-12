# Concrete Capability Targets

Date: 2026-03-12

This document answers two questions:

1. What real capabilities are we trying to unlock?
2. Why can Forge not do them cleanly today?

## Capability 1: One Script, Two Serious Backends

Target:

- write one Forge part script
- preview it through Manifold
- export the same part through CadQuery/OCCT
- get explicit diagnostics if a feature is not exact-capable

Why this matters:

- this is the whole point of the compiler transition
- export stops being a side system
- backend drift becomes testable

Why it is not fully true today:

- the compiler covers a broader but still intentionally bounded subset of the part-design stack
- richer hole/cut variants, broader projection-driven edits, repeated mirror/pattern ownership, and broader tracked-edge finishing are now compiler-owned for defended subsets, but each remains narrower than the end-state target
- durable post-topology-change face/edge reference stability is still missing
- OCCT/CadQuery is still broader in export than in ordinary feature coverage

## Capability 2: Face-Driven Detail Features Without Brittle Attachment

Target:

- place vents, bosses, pockets, logos, displays, or mounting pads on a face
- edit upstream geometry
- have the downstream placement still mean the same thing

Concrete example:

- shell an enclosure
- place cutouts on the front face
- place support feet on the bottom face
- mirror or pattern those downstream features
- still export exactly

Why it is not fully true today:

- Forge now keeps parent-body ownership and face-query provenance, which is a big step
- but stable face identity through topology-changing edits is still incomplete
- shell-created faces, projection targets, and patterned descendants still need richer query propagation rules

## Capability 3: Hole/Cut Feature Workflows As Real Features

Target:

- define through holes, blind holes, counterbores, countersinks, and patterned cut features
- anchor them to semantic face/workplane queries
- lower them through both backends from the same compiler graph

Why it is not fully true today:

- Forge now has compiler-owned hole/cut workflows for circular through/blind holes, counterbores, countersinks, and planar `upToFace` hole/cut extents, with defended created-face slots where Forge can model them directly
- patterned cut workflows, drafted/two-sided extents, and broader durable ownership beyond today's defended created-face subset are still missing
- this is now a narrow supported subset, not the full ordinary part-design stack yet

## Capability 4: Projection-Driven Downstream Sketching

Target:

- project geometry from a body/face onto a sketch plane
- use the result for follow-on features like offsets, cuts, stiffeners, lids, and mating geometry

Why it is not fully true today:

- `projectToPlane()` now keeps explicit projection intent for a broader but still defended compiler-owned downstream subset
- the supported replay path now covers follow-on features when the source reduces to one defended planar basis: straight placed extrusions, compatible shell/hole/cut descendants, and compatible boolean unions on matching parallel target planes
- richer projection targets, topology-changing sources, and broader downstream projection edits still fall back to runtime-only behavior or explicit diagnostics

## Capability 5: Edge-Driven Finishing Features

Target:

- select edges semantically
- apply fillet/chamfer as ordinary design operations
- preserve exact lowering and predictable downstream ownership

Why it is not fully true today:

- Forge now has a shared edge-query contract plus tracked-edge selector propagation
- Forge now has a broader compiler-owned fillet/chamfer subset for tracked vertical edges on compile-covered `box()` and `rectangle(...).extrude(...)` bodies, plus preserved propagated sibling edges through supported edge-finish and boolean-union chains
- both lowerers and the exact exporter replay that subset from the same shared edge-query contract
- the selected rewritten edge, shell/boolean/hole/cut descendants, and durable edge identity after topology rewrites are still missing, so the finishing subset must stay intentionally narrow

## Honest Current State

What is already real:

- compiler-owned primitives, booleans, transforms, extrude, revolve, hull, trims/splits, loft/sweep, shell v1
- richer hole/cut workflows, a broader tracked-edge fillet/chamfer subset, and repeated mirror/pattern ownership for the supported subset
- broader projection replay for compiler-visible `projectToPlane()` downstream flows
- shared face and edge query/reference contracts with centralized compiler routing and regression coverage
- curated multi-feature compiler corpus plus exact-export invariants

What is still impossible or not yet clean:

- a complete ordinary Fusion-style part workflow staying inside compiler coverage end to end
- patterned, drafted, or two-sided hole/cut workflows beyond today's defended subset
- broad projection-driven feature chains beyond today's shell/hole/cut/union-compatible replay slice
- broad edge-driven fillet/chamfer flows on durable downstream edge identity
- claiming "most regular design features" without caveats

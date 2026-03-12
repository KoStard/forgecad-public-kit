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

- the compiler covers a growing subset, but not the normal full part-design stack yet
- hole workflows, projection-driven edits, fillet/chamfer, and pattern ownership are still missing or partial
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

- Forge now has a first compiler-owned hole/cut slice (`shape.hole()` + `shape.cutout()`) for circular through/blind holes and simple `onFace()`-anchored cutouts
- but richer workflows such as counterbores, countersinks, patterned cuts, up-to-face extents, and durable ownership for feature-created faces are still missing
- this is now a narrow supported subset, not the full ordinary part-design stack yet

## Capability 4: Projection-Driven Downstream Sketching

Target:

- project geometry from a body/face onto a sketch plane
- use the result for follow-on features like offsets, cuts, stiffeners, lids, and mating geometry

Why it is not fully true today:

- `projectToPlane()` exists as a runtime utility, but not as a compiler-owned downstream feature flow
- projection intent is not yet a first-class semantic node that survives through both backends
- this makes projection-based design patterns hard to trust and hard to export exactly

## Capability 5: Edge-Driven Finishing Features

Target:

- select edges semantically
- apply fillet/chamfer as ordinary design operations
- preserve exact lowering and predictable downstream ownership

Why it is not fully true today:

- Forge does not yet have a shared edge-query contract comparable to the new face-query backbone
- without stable edge lineage, fillet/chamfer will look broader on paper than they are in real parts

## Honest Current State

What is already real:

- compiler-owned primitives, booleans, transforms, extrude, revolve, hull, trims/splits, loft/sweep, shell v1
- dual lowering to Manifold and CadQuery/OCCT for the supported subset
- centralized compiler routing and regression coverage
- compiler-owned workplane placement and parent-body face-query provenance

What is still impossible or not yet clean:

- a complete ordinary Fusion-style part workflow staying inside compiler coverage end to end
- exact hole workflows as first-class features
- projection-driven feature chains with durable semantic ownership
- reliable edge-driven fillet/chamfer flows
- claiming "most regular design features" without caveats

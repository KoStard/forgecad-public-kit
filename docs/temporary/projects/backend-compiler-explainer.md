# Backend Compiler Explainer

Date: 2026-03-11

This is the simple version of the backend-compiler mission.

## The Idea

ForgeCAD should have one brain, not two.

Today Forge can:

- build fast runtime solids through Manifold
- build exact export geometry through CadQuery/OCCT

If those become two separate systems, the repo gets messy:

- preview works one way
- export works another way
- every new feature gets implemented twice in different styles

So the goal is:

1. user code describes the model in Forge terms
2. Forge records the meaning of that model in its own compile graph
3. Forge lowers that same meaning into different backends

## The Analogy

Think of it as one architectural drawing with two builders:

- Manifold builds the fast prototype for interactive runtime use
- CadQuery/OCCT builds the precise exact model for manufacturing/export

They must read the same plan.

## What We Are Not Doing

We are not trying to:

- invent a new programming language
- replace Manifold with our own geometry kernel
- keep a separate export-only feature system forever

JS/TS stays the host language. The new thing is the compiler layer in the middle.

## Why This Matters

If Forge owns the semantic model:

- features get defined once
- export becomes just another compile target
- diagnostics become honest
- tests can compare compiler intent against backend output
- future features like shell, fillet, chamfer, patterns, and sheet metal have a clean place to land

## The Hard Part

The hard part is not boxes, booleans, or even extrudes.

The hard part is references.

Example:

- you sketch on a face
- later the part changes
- the system still needs to know what face you meant

If Forge loses that meaning and keeps only final geometry transforms, downstream features become brittle.

That is why the reference / workplane / query layer is the make-or-break part of this transition.

## Success

We are succeeding when:

- Forge compile intent is the source of truth
- both Manifold and CadQuery/OCCT lower from that same intent
- export is not a side system
- supported features survive normal multi-step modeling workflows
- regression tests catch plan drift, routing drift, and backend drift

## Current Direction

The current foundation work is pushing Forge toward:

- compiler-owned feature intent
- centralized scene routing
- workplane/reference semantics that survive downstream feature lowering

That is the path to a real multi-backend CAD system instead of a collection of backend-specific code paths.

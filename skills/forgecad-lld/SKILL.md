---
name: forgecad-lld
description: Write a Low-Level Design (LLD) for a CAD model — exact dimensions, constraints, parameters, and verification criteria. Use after a High-Level Design (HLD) exists and decisions are locked, or for simple parts that don't need an HLD. The detailed design document that code implements.
forgecad-public: true
---

# Low-Level Design (LLD)

## When and prerequisites

- An HLD (`/forgecad-high-level-spec`) with a filled Decisions table must exist. The LLD implements those decisions — it never revisits them.
- Simple parts (single body, no alternatives to explore) skip the HLD and go straight to the LLD.
- Output: `<name>-lld.md` next to the model files. Complex assemblies split into a numbered directory: overview, global constraints, per-component files, assembly, verification.

## What an LLD is

- **Narrative first** — reads like describing the object over the phone: shape, behavior, purpose, proportions, feel.
- **Authoritative** — the single source of truth that code implements.
- **Implementation-blind** — the LLD knows nothing about ForgeCAD's capabilities; never let API convenience shape the design.
- **Every number has a rationale** — each constraint and each parameter default/range gets an explicit reason; show the math (e.g. `wallThickness = 2.4mm = 6 × 0.4mm nozzle`).

## Required structure

1. **Narrative** — what it is, how it behaves and interacts, why it exists. Concrete comparisons ("about the size of a deck of cards"); no vague terms without grounding.
2. **Technical** — typed parameter table (length / angle / count / boolean / choice / ratio / clearance — this is design-document vocabulary, not the runtime `Param.*` API), always with units (mm and degrees are the defaults) and a rationale for every default and range; derived dimensions shown as math; geometry and constraints, each constraint with rationale.
3. **Verification** — mandatory checklist: dimensional checks, functional checks, printability checks.

Don'ts: never open with a parameter list (story before numbers), never leave a constraint implicit, never skip verification.

## Process

Iterate via git exactly as in `/forgecad-high-level-spec`: commit every version; the diff, not the conversation, is the review artifact.

Completeness gate before presenting: Can someone build from this alone? Does it implement every HLD decision? Is every constraint explicit with rationale?

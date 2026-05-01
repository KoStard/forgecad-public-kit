---
name: forgecad-lld
description: Write a Low-Level Design (LLD) for a CAD model — exact dimensions, constraints, parameters, and verification criteria. Use after a High-Level Design (HLD) exists and decisions are locked, or for simple parts that don't need an HLD. The detailed design document that code implements.
forgecad-public: true
---

# Low-Level Design (LLD)

Create detailed, authoritative design documents for ForgeCAD models. This is the construction document — exact dimensions, constraints, parameters, and verification criteria.

## Prerequisites

Before writing an LLD, a High-Level Design (`/forgecad-high-level-spec`) should exist with its Decisions table filled. The HLD defines *what* to build and *why*. The LLD defines *exactly how*.

For simple parts (single body, no alternatives to explore), skip the HLD and write the LLD directly.

## Philosophy

An LLD should read like you're describing the object to someone over the phone — vivid, narrative, conveying shape, behavior, purpose, and intent. But it must also be **authoritative** — the single source of truth that code will implement.

**Key principles:**
- **Story-first**: Lead with the "what it is" narrative before technical details
- **Sensory richness**: Describe appearance, proportions, materials, feel
- **Behavioral clarity**: How it functions, moves, interacts
- **Technical precision**: Exact constraints, dimensions, and relationships
- **No implementation assumptions**: The LLD knows nothing about ForgeCAD's capabilities

## Output Location

LLDs go next to the model files. Name: `<name>-lld.md`. For complex assemblies, use a directory:

```
<project>-lld/
├── 00-overview.md
├── 01-global-constraints.md
├── 02-components/
│   ├── base.md
│   └── bracket.md
├── 03-assembly.md
└── 04-verification.md
```

## Document Template

### 1. Narrative Section

Lead with vivid description — what it is, purpose, visual character, how it behaves.

### 2. Technical Section

Parameters table, derived dimensions, geometry description, constraints with rationale.

### 3. Verification

Dimensional checks, functional checks, printability checks — as a checklist.

(See examples in the sections below.)

## Workflow

### Phase 1: Verify HLD decisions are locked

If an HLD exists, check that its Decisions table is filled. The LLD implements the decisions — it doesn't revisit them.

### Phase 2: Write the document

1. Capture the narrative (what it is, how it works)
2. Extract parameters and constraints
3. Define verification criteria

### Phase 3: Commit and present for review

Commit the LLD to git. Tell the user it's ready for review.

### Phase 4: Iterate via git

Same as HLD: user reviews the file (edits or verbal feedback), agent reads the diff, updates, commits, repeats.

```
Agent writes LLD → git commit → User reviews
→ Agent reads diff → updates LLD → git commit → repeat until approved
```

### Phase 5: Review for completeness

- Can someone build from this alone?
- Does it implement every HLD decision?
- Are all constraints explicit with rationale?

## Git Workflow

LLDs iterate through git, not conversation. The document is the single source of truth.

- **Every version gets committed.** No unsaved drafts in conversation.
- **User feedback goes in the file** (inline comments, strikethroughs) or in chat — agent checks both.
- **The diff is the review artifact.**

## Writing Guidelines

**Do:**
- Use concrete comparisons ("about the size of a deck of cards")
- Show the math: `wallThickness = 2.4mm`
- Provide rationale for every constraint
- Start with the story, then the numbers

**Don't:**
- Start with a parameter list
- Leave constraints implicit
- Skip verification criteria
- Use vague terms without grounding

## Parameter Types

- `length` — mm default
- `angle` — degrees default
- `count` — integer
- `boolean` — true/false
- `choice` — enumerated options
- `ratio` — dimensionless
- `clearance` — fit tolerances, mm default

Always specify units. Always provide rationale for defaults and ranges.

## Relationship to Other Skills

| Stage | Skill | Output |
|-------|-------|--------|
| 1. Explore the problem space | `/forgecad-high-level-spec` | `*-hld.md` |
| 2. Detailed design | `/forgecad-lld` (this skill) | `*-lld.md` |
| 3. Implementation | `/forgecad-make-a-model` + `/forgecad` | `.forge.js` files |

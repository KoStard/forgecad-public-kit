---
name: forgecad-high-level-spec
description: Write a high-level design document (HLD) for a model, mechanism, or assembly before detailed specification or coding. Use when starting a new design, rethinking an existing one, or when the user asks to spec out, plan, or think through a model at a high level. Works backwards from requirements — defines the problem, explores alternatives, records decisions. Produces a short document for review and iteration.
forgecad-public: true
---

# High-Level Design (HLD)

Write a short design document that works backwards from requirements. Define the problem, explore the solution space, record decisions. Stop before implementation details.

## Philosophy

An HLD is a thinking tool, not a construction document. It should be:

- **Short enough to review in 2 minutes.** If it takes longer, it's too detailed.
- **Honest about what's unknown.** Open questions are features, not bugs.
- **Opinionated about alternatives.** Don't just list options — recommend one and say why.
- **Stable under iteration.** Easy to update after a round of feedback without rewriting everything.

The HLD exists so that the user and the agent can align on *what* to build before anyone thinks about *how* to build it. All design concerns, risks, and tradeoffs live here — not in conversation, not in the agent's head.

Manufacturing process is part of the design problem, not a default.
If the user has not specified a process, compare plausible approaches and recommend the one that fits the artifact, load path, scale, material needs, safety expectations, and intended use.
Do not default to 3D printing, FDM, or "printable" unless the user asked for it or the chosen concept genuinely calls for printed parts.

## When to Write an HLD

- Before starting a new model, mechanism, or assembly
- When an existing design has fundamental problems (wrong approach, not just wrong numbers)
- When the user says "spec this out", "think this through", "what should we build"
- Before writing an LLD

## Output Location

HLDs go next to the model files. Name: `<name>-hld.md` or for a project: `hld.md` in the project folder.

## Document Structure

```markdown
# [Name] — High-Level Design

## Problem

What does this need to do? What role does it play? What are the hard
requirements (must grip objects, must fit in a 60mm housing, must use
sheet metal, must be CNC-machinable, must be printable, must use purchased
bearings)?

State the problem without implying a solution.

## Approach

How does it work at a conceptual level? Describe the mechanism, structure,
or behavior. Use an ASCII diagram — one picture replaces a paragraph.

Keep this to the "elevator pitch" level: someone unfamiliar with the project
should understand the basic idea in 30 seconds.

## Key Interfaces

How does this connect to the rest of the system? What are the mating
surfaces, shared dimensions, or coordination points? List them explicitly.

## Dictionary

Define every domain-specific term used in this document. Don't assume
engineering terminology is widely known — write for a developer who
doesn't have a mechanical engineering background.

| Term | What it is |
|------|-----------|
| ... | Plain-language description with dimensions if relevant |

## Alternatives

| Option | Description | Tradeoff |
|--------|-------------|----------|
| A (recommended) | ... | ... |
| B | ... | ... |
| C | ... | ... |

For each alternative, one sentence on what it is and one on why you'd
choose or reject it. Mark the recommended option.

## Usage Guide

Work backwards from the user experience. Write a short step-by-step
of how someone would use/assemble/operate this thing. This exposes
gaps in the design before any code is written.

For a physical product: assembly steps, tools needed, what connects to what.
For a mechanism: how it moves, what the user does, what happens.
For a software component: how it's called, what it returns, error cases.

Keep it short — 5-10 numbered steps max. Flag issues inline with ⚠️.

## Concerns

Numbered list. Each concern is a risk, open question, or thing that
could go wrong. Be specific — "tolerances might be tight" is useless;
"the 12mm arm cantilevers under gripping load, may flex >0.5mm" is useful.

Include issues discovered while writing the Usage Guide.

1. ...
2. ...

## Decisions

Filled in after review. Each decision references which concern or
alternative it resolves.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | ... | ... |
```

## Workflow

### 1. Define the problem

State what the part/assembly needs to accomplish. Include hard constraints (size envelope, specified manufacturing/process constraints, interfaces with other parts). Do not describe a solution yet.
If no process is specified, treat manufacturing/process choice as an HLD alternative rather than as a hidden assumption.

### 2. Sketch the approach

Describe the recommended approach at a conceptual level. Draw an ASCII diagram showing the key elements and their spatial relationships. Label the diagram.

### 3. Identify interfaces

List every point where this design touches another part or the outside world. These are the contracts that constrain the design.

### 4. Explore alternatives

Show 2-3 meaningfully different approaches. Not minor variations — genuinely different strategies. For each, state the key tradeoff in one line. Recommend one.

### 5. Write the usage guide

Work backwards: describe how someone uses/assembles/operates this thing step by step. This is the most powerful validation — it forces you to think through the physical reality before writing code. If a step doesn't make sense ("how does the servo get inside?"), the design has a gap.

Flag issues inline with ⚠️. These feed directly into the Concerns list.

### 6. Surface concerns

Collect everything from the usage guide ⚠️ flags plus any risks, open questions, or things that could go wrong. Be concrete and specific. These are the agenda for the review conversation.

### 7. Commit and present for review

Commit the HLD to git. Tell the user it's ready for review. Do NOT fill in the Decisions table yet.

### 8. Iterate via git

The user reviews the file (may edit it directly with comments/strikethroughs, or give verbal feedback). After review:

1. Read the git diff or the updated file to see the user's feedback
2. Update the HLD to address feedback
3. Commit the update
4. Present for another round if needed

Repeat until the Decisions table is filled and the user says "go."

## Git Workflow

HLDs and LLDs iterate through git, not conversation. This keeps the document as the single source of truth and gives both sides a clear diff to review.

```
Agent writes HLD → git commit → User reviews (edits file or gives feedback)
→ Agent reads diff → updates HLD → git commit → repeat until approved
```

- **Every version gets committed.** No unsaved drafts floating in conversation.
- **User feedback goes in the file** (inline comments, strikethroughs) or in chat — agent checks both.
- **The diff is the review artifact.** Agent reads `git diff` to see what changed.

## Writing Rules

- **Short, clear, to the point.** Every section should be scannable in under 30 seconds. If a reviewer has to re-read a paragraph to understand it, rewrite it.
- **One page max.** If it's longer, you're writing an LLD.
- **ASCII diagrams over words.** A cross-section sketch communicates layout better than three paragraphs.
- **No dimensions unless they drive a decision.** "The arm is 12mm long" belongs in the LLD. "The arm needs to bridge the gap between the rail and the rack" belongs in the HLD — it's a spatial relationship that drives the design.
- **No parameter tables.** That's LLD territory.
- **Concerns are not rhetorical.** Every concern must be specific enough that someone can say "yes that's a real problem" or "no, here's why it's fine."
- **Alternatives are not padding.** If there's genuinely only one way to do it, say so and skip the table.

## Relationship to Other Skills

| Stage | Skill | Output |
|-------|-------|--------|
| 1. Explore the problem space | `/forgecad-high-level-spec` (this skill) | `*-hld.md` |
| 2. Detailed design | `/forgecad-lld` | `*-lld.md` |
| 3. Implementation | `/forgecad-make-a-model` + `/forgecad` | `.forge.js` files |

The HLD must have its Decisions table filled before writing an LLD. The LLD must exist before implementation (unless the model is simple enough to skip straight from HLD to code).

## Anti-Patterns

- **HLD that's actually an LLD.** If you're writing parameter tables and constraint equations, you've gone too far. Back up.
- **HLD with no alternatives.** You haven't explored the solution space. Even if the answer is obvious, name what you rejected and why.
- **Concerns that are vague worries.** "This might be hard to manufacture" — hard how? Tool access? Bending radius? Wall thickness? Tolerance stack? Support material? Be specific or don't list it.
- **Decisions made before review.** The whole point is to align with the user before committing. Present the HLD, discuss, then decide.
- **Skipping the diagram.** If you can't draw it, you don't understand it yet.
- **Iterating in conversation instead of in the file.** The document is the artifact. Update it, commit it, review the diff.

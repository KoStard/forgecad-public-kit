---
name: forgecad-high-level-spec
description: Write a high-level design document (HLD) for a model, mechanism, or assembly before detailed specification or coding. Use when starting a new design, rethinking an existing one, or when the user asks to spec out, plan, or think through a model at a high level. Works backwards from requirements — defines the problem, explores alternatives, records decisions. Produces a right-sized design document for review and iteration.
forgecad-public: true
---

# High-Level Design (HLD)

The HLD aligns the user and the agent on *what* to build before anyone thinks about *how*. Every design concern, risk, and tradeoff lives in the document — not in conversation, not in the agent's head. Brevity is a readability tool, not a success metric: there is no page limit; include whatever evidence, diagrams, and dimensions a good decision needs. Decision-driving dimensions belong here; exhaustive construction dimensions belong in the LLD.

Manufacturing process is a design decision, not a default — never assume 3D printing/FDM. If the user didn't specify a process, treat process choice as an HLD alternative (full posture taxonomy: `/forgecad-prepare-prompt`).

Write an HLD before any LLD, and whenever an existing design is wrong in approach, not just in numbers. Output: `<name>-hld.md` beside the model files, or `hld.md` for a whole project.

## Document Structure

The section order is the workflow — write it top to bottom, following the embedded instructions.

```markdown
# [Name] — High-Level Design

## Problem
What must this do? Hard requirements (must grip objects, fit a 60mm
housing, use purchased bearings). State the problem without implying
a solution. Unspecified process choice is an open design dimension.

## Approach
How it works at a conceptual level. ASCII diagram of the key elements
and their spatial relationships — diagram labels stay in this markdown;
never carry them into CAD geometry unless the real artifact needs
markings.

## Key Interfaces
Every point where this touches another part or the outside world:
mating surfaces, shared dimensions, coordination points. These are the
contracts that constrain the design.

## Dictionary
| Term | What it is |
|------|-----------|
Define every domain term in plain words, with dimensions where relevant.
Write for a developer without a mechanical-engineering background.

## Alternatives
| Option | Description | Tradeoff |
|--------|-------------|----------|
2-3 genuinely different strategies, not minor variations. Enough detail
per row to see why it fits or loses. Mark one recommended and say why.
If there is honestly only one approach, say so and skip the table.

## Usage Guide
The strongest validation: work backwards from how someone uses,
assembles, or operates the thing, step by step (physical product:
assembly steps, tools, what connects to what; mechanism: how it moves
and what the user does). If a step doesn't make sense ("how does the
servo get inside?"), the design has a gap — flag it inline with ⚠️ and
promote it to Concerns.

## Concerns
1. Numbered, falsifiably specific — a reviewer must be able to say
   "real problem" or "fine, because…". "Tolerances might be tight" is
   useless; "the 12mm arm cantilevers under gripping load, may flex
   >0.5mm" is useful.

## Decisions
| # | Decision | Rationale |
|---|----------|-----------|
Filled ONLY after user review — never pre-decide. Each row resolves a
concern or alternative.
```

## Review via git

HLDs and LLDs iterate through git, not conversation:

- **Commit every version.** No drafts floating in chat. After writing, commit and tell the user it's ready for review.
- **Feedback arrives as file edits** (inline comments, strikethroughs) **or chat — check both.** Read `git diff`: the diff is the review artifact.
- **Update, commit, repeat** until the Decisions table is filled and the user says "go."

## Rules

- If you're speccing every part, formula, tolerance, and fabrication step, you're writing an LLD — back up.
- If you can't draw it, you don't understand it yet.
- Tables are welcome where they clarify (interfaces, requirements, visible evidence); full parameter catalogs go to the LLD.

## Pipeline

| Stage | Skill | Output |
|-------|-------|--------|
| 1. Explore the problem space | this skill | `*-hld.md` |
| 2. Detailed design | `/forgecad-lld` | `*-lld.md` |
| 3. Implementation | `/forgecad-make-a-model` + `/forgecad` | `.forge.js` |

The Decisions table must be filled before writing the LLD. Simple models may skip straight from HLD to code.

---
name: forgecad-design-spec
description: Create a ForgeCAD design brief, HLD, or LLD before coding by walking through use, assembly, interfaces, decisions, and verification.
forgecad-public: true
---

# Design Spec

The design document — a git-committed, diff-reviewed markdown file — is the source of truth. Not the code, not the chat, not your head. You iterate it by commit-and-review, and the `git diff` is the review artifact.

**Validate the design by mentally operating the thing, step by step.** Walk it as someone assembles, uses, or moves it. The step with no answer — *"how does the servo get inside the housing?"* — is the real design gap. A spec that reads complete on the page can still hide a hole that only surfaces when you try to put it together in your head. State each gap falsifiably: not "tolerances might be tight" but "the 12mm arm cantilevers under gripping load, may flex >0.5mm."

**Every number has a reason; the narrative comes before the numbers.** Describe the object as if over the phone, then derive each value and show its math: `wallThickness = 2.4mm = 6 × 0.4mm nozzle`. The design is **implementation-blind** — shaped by the object, never by what the ForgeCAD API makes easy. **Manufacturing process is one of those reasons** — a design decision you weigh, never a default you inherit (never assume FDM/printing).

**A vague request is a set of decisions you make honestly, not information to extract.** No placeholders ("appropriate motor"); choose a defensible value, show why, continue. The Decisions table fills only after user review, so the loop stays in the document.

## Altitude — three phases, one document trail

| Phase | When | Output |
|-------|------|--------|
| Intake | request is fuzzy / process unspecified | engineering brief + master prompt |
| HLD | design is wrong in *approach*, alternatives exist | `<name>-hld.md` |
| LLD | decisions locked, or a simple single-body part | `<name>-lld.md` |

The HLD carries only decision-driving dimensions and genuinely-different alternatives; the LLD carries enough that someone builds from it alone. Speccing every tolerance in an HLD, or revisiting locked decisions in an LLD, is an altitude error — back up. Simple parts skip straight from HLD to code, or from a request to an LLD.

---

## Phase 1 — Intake (fuzzy request → concrete brief)

Use when the user wants something physically real but the ask is vague ("make me a robot gripper", "make it production ready", "pick sensible numbers"). This phase owns intake; once the brief is concrete, continue to HLD or hand off to the `forgecad` skill.

**Manufacturing is a design decision, not a default.** Derive the process stack from artifact family, load path, scale, safety expectations, material, production intent, and operating story — never assume printing/plastic. If the user names a process, honor it but warn when it is unsafe or dishonest for the duty. Family→process anchors live in `references/default-profiles.md`.

**Default posture: manufacture-realistic prototype** — real materials, purchased-part boundaries, assembly logic, validation; no claims of production tooling or certification. Other postures only when justified: `production-realistic`, `printable`, `visual-CAD`, or a specific process posture (`sheet-metal`, `CNC-machined`, `laser-cut`, `welded-tube`, `injection-molded`, `cast`, `hybrid purchased-hardware`). Pick the posture honest for the artifact, not the easiest CAD surface.

**Family-scoped numbers.** Every starter assumption is scoped to one artifact family; never reuse numbers across families.

Workflow:
1. **Normalize the ask** into plain mechanism language ("6 DOF gripper" → standalone gripper, wrist+gripper, or arm+gripper).
2. **Build a specific operating story** — invented (non-famous) org, named program, prototype revision, review moment, mission pressure (pilot gate, demo date, investor milestone), and the generic failure mode to avoid. Prefer bold high-agency stories over modest lab exercises. Never assert the user works for a named real company; use real products only as public comparison anchors; never clone proprietary designs.
3. **Classify the artifact family** (`references/default-profiles.md`); use the no-family-fits escape rather than forcing one. Rideables route to human-vehicles, never chassis.
4. **Choose the process posture** per the taxonomy above.
5. **Pick qualitative levers** — duty (`light`/`general`/`sturdy`), scale (`compact`/`medium`/`large`), cost (`cheapest`/`balanced`/`performance-first`) — and translate to family-scoped starter assumptions.
6. **Close only critical gaps** — at most 3 grouped questions, always choice menus, never raw engineering inputs unless the architecture truly depends on them. Good: "light desk demo, useful hobby tool, or sturdier bench mechanism?" Bad: "What payload mass?"
7. **Write the engineering brief**: artifact + family + normalized interpretation; operating story + production reason + test setting + failure mode to avoid; output posture; intended loads, size envelope, motion/DOF; process stack + material defaults; purchased-part (BOM) boundary; validation standard; variant policy (versions are selectable params, one rendered at a time); file organization (`main.forge.js` entry for multi-file); explicit uncertainty policy.
8. **Emit one master prompt** — fill `references/master-prompt.md`; return the finished prompt, not notes about it. It must demand exactly `BUILD-READY` or `BEST-EFFORT BUILD CANDIDATE` (human-bearing furniture and rideables usually end the latter).

Defaults if the user stays vague: `general-duty` / `medium` / `balanced`, invent the operating story, use family starter assumptions.

---

## Phase 2 — High-Level Design (HLD)

Aligns user and agent on *what* to build before *how*. Brevity is a readability tool, not a metric — include whatever evidence, diagrams, and dimensions a good decision needs. Write the sections top to bottom; the order is the workflow.

```markdown
# [Name] — High-Level Design

## Problem
What must this do? Hard requirements (grip 40-90mm objects, fit a 60mm
housing, use purchased bearings). State the problem without implying a
solution. Unspecified process choice is an open design dimension.

## Approach
How it works conceptually. ASCII diagram of key elements and their
spatial relationships — diagram labels stay in this markdown, never
carried into CAD geometry unless the real artifact needs markings.

## Key Interfaces
Every point where this touches another part or the outside world:
mating surfaces, shared dimensions, coordination points. These are the
contracts that constrain the design.

## Dictionary
| Term | What it is |
Define every domain term in plain words, with dimensions where relevant.
Write for a developer without a mechanical-engineering background.

## Alternatives
| Option | Description | Tradeoff |
2-3 genuinely different strategies, not minor variations. Mark one
recommended and say why. If there is honestly one approach, say so.

## Usage Guide
Work backwards from how someone uses, assembles, or operates the thing,
step by step. If a step doesn't make sense ("how does the servo get
inside?"), flag it inline with ⚠️ and promote it to Concerns.

## Concerns
1. Numbered, falsifiably specific — a reviewer must be able to say "real
   problem" or "fine, because…".

## Decisions
| # | Decision | Rationale |
Filled ONLY after user review — never pre-decide. Each row resolves a
concern or alternative.
```

Rules: if you're speccing every part, formula, and tolerance, you're writing an LLD — back up. If you can't draw it, you don't understand it yet.

---

## Phase 3 — Low-Level Design (LLD)

Implements the HLD's locked Decisions table; it never revisits those decisions. Simple single-body parts skip the HLD and start here. Complex assemblies split into a numbered directory: overview, global constraints, per-component files, assembly, verification.

An LLD is **narrative-first** (reads like describing the object over the phone), **authoritative** (the single source code implements), **implementation-blind**, and shows **every number's rationale**.

Required structure:
1. **Narrative** — what it is, how it behaves and interacts, why it exists. Concrete comparisons ("about the size of a deck of cards"); no ungrounded vague terms.
2. **Technical** — typed parameter table (length / angle / count / boolean / choice / ratio / clearance — design-document vocabulary, not the runtime `Param.*` API), always with units (mm, degrees default) and a rationale for every default and range; derived dimensions shown as math; geometry and constraints, each constraint with a rationale.
3. **Verification** — mandatory checklist: dimensional, functional, printability/process checks.

Don'ts: never open with a parameter list (story before numbers), never leave a constraint implicit, never skip verification. Completeness gate before presenting: can someone build from this alone? Does it implement every HLD decision? Is every constraint explicit with a rationale?

---

## Review via git

HLDs and LLDs iterate through git, not conversation:
- **Commit every version.** No drafts floating in chat. After writing, commit and tell the user it's ready for review.
- **Feedback arrives as file edits (inline comments, strikethroughs) or chat — check both.** Read `git diff`: the diff is the review artifact.
- **Update, commit, repeat** until the Decisions table is filled and the user says "go."

## Pipeline

| Stage | This skill's phase | Output | Next |
|-------|--------------------|--------|------|
| Explore a fuzzy ask | Intake | engineering brief + master prompt | HLD |
| Decide *what* to build | HLD | `*-hld.md` (Decisions filled) | LLD |
| Detail *how* to build | LLD | `*-lld.md` | `forgecad-build-model` + `forgecad` → `.forge.js` |

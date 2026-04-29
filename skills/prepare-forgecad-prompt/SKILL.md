---
name: prepare-forgecad-prompt
description: Turn a fuzzy physical product, mechanism, or CAD artifact request into a concrete ForgeCAD build brief and a single master prompt for the modeling pass. Use when the engineering brief is incomplete, manufacturing/process choice is underspecified, or the work needs a specific operating story to avoid generic toy solutions.
forgecad-public: true
---

# Prepare ForgeCAD Prompt

Use this skill before modeling when the user wants something physically real, manufacturing-aware, and buildable, but their request sounds like:

- "make me a robot gripper"
- "design a real mechanism"
- "make it production ready / assembly ready"
- "I do not know the payload or exact dimensions, just make sensible choices"

This skill owns the intake and prompt-preparation step. After the brief is concrete, switch to `forgecad` for implementation.

## Core Rule

Do not start by asking raw engineering inputs like payload mass, torque, or tolerance unless the architecture truly depends on them and you cannot bracket them safely.

Manufacturing is a design decision, not a default.
Do not assume FDM, 3D printing, "printable", or plastic parts unless the user explicitly asks for that, the artifact family honestly points there, or the chosen process stack includes printed parts.
Choose the manufacturing/process stack from the artifact family, load path, scale, safety expectations, material properties, production intent, and operating story.
For example: scooters, bikes, skateboards, and rideable vehicles usually point toward metal/composite frames, wood/composite decks, urethane/rubber wheels, bearings, brakes, and standard hardware; furniture often points toward wood, sheet goods, tube, metal brackets, or conventional joinery; enclosures may point toward injection molding, sheet metal, CNC, or printing depending on quantity and ruggedness; fixtures may be machined, laser-cut, welded, printed, or hybrid.
If the user asks for "printable", "3D printed", "laser cut", "CNC", or another process, honor that process while still warning when it is unsafe or dishonest for the duty.

Do not let the modeling prompt sound like a casual hobby sketch when the requested artifact belongs to a serious product domain.
Give the model a specific operating story: a named company or lab, named program, named prototype/revision, review moment, test setting, and concrete reason the part matters.
If the user did not provide this story, invent plausible non-famous names and details.
This should raise the specificity bar without pretending the user works for a real named company or copying proprietary designs.
Prefer bold, high-agency stories over modest lab exercises: product pilots, go/no-go reviews, investor demos, field trials, first-customer deployments, or ambitious internal programs with real schedule pressure.

Do not use one numeric default profile across unrelated artifact families.
The correct order is:

1. classify what kind of thing is being built
2. choose the manufacturing/process posture that fits the artifact
3. choose qualitative levers like duty / scale / cost posture
4. translate those into family-scoped starter assumptions
5. make those assumptions explicit in the final prompt

Instead:

1. Translate the request into plain-language build choices.
2. Classify the artifact family.
3. Choose a defensible manufacturing/process stack unless the user already specified one.
4. Offer a small set of common-sense option bundles.
5. Choose a defensible family-scoped starter assumption set if the user stays vague.
6. Produce one single ForgeCAD master prompt with explicit assumptions.

## What Good Looks Like

By the end of this skill, there should be:

- a normalized statement of what is being built
- an artifact family classification
- an assumption bundle with units
- a clear build profile and manufacturing/process stack
- a specific operating story
- a motion / load / size target
- a BOM boundary
- a validation boundary
- one ready-to-copy master prompt for the modeling pass

## Workflow

1. Normalize the ask.
   If the user says something physically ambiguous, restate it in proper mechanism language.
   Example: "6 DOF gripper" often means one of:
   - a standalone gripper with finger joints
   - a wrist plus gripper
   - a full arm plus gripper

2. Build the specific operating story.
   Convert the artifact into a concrete professional assignment.
   Do not use vague prestige phrases like "frontier robotics startup" by themselves.
   Do not make the story feel small unless the artifact genuinely calls for it.
   The story should feel like a real ticket from a real team, even when the company and program names are invented.
   Include:
   - a fictional but specific company / lab / team name when no real organization was provided
   - an ambitious company posture, such as a venture-backed robotics company, advanced hardware group, field deployment team, or first-customer pilot team
   - a named project, prototype revision, or milestone
   - the domain context, such as humanoid robotics, lab automation, field tooling, consumer hardware, workshop equipment, or medical-adjacent assistive prototyping
   - the production reason, such as internal prototype review, next-iteration part evaluation, assembly rehearsal, manufacturability review, or validation rig
   - the test setting, such as a named bench rig, demo cell, assembly fixture, or field trial setup
   - the external or mission pressure, such as a pilot gate, demo date, reliability target, investor milestone, or customer deployment constraint
   - what a generic solution would miss in this domain
   - the level of seriousness expected from the deliverable

   Good framing:
   - "Use this operating story: Helix Handworks, a venture-backed humanoid robotics company preparing a warehouse-pilot manipulation stack, is reviewing the F2 index-finger module for its DEX-07 go/no-go gate. The module must bolt into Palm Mule V3, route a Bowden tendon cleanly through the MCP base, survive a 1,000-cycle curl test on Rig-3, and expose every wear surface before the customer demo cell build starts."
   - "Use this operating story: RivetLine Automation is racing toward a first-customer kitting-cell pilot and needs the RG-4 gripper jaw for a live demo next Wednesday. The jaw must pick 40-90 mm plastic housings from a tray, use hardware the build tech can source this week, and make finger-pad replacement possible without rebuilding the linkage."
   - "Use this operating story: Northbay Instruments is preparing the EVB-12 field calibration kit for a launch-readiness review. The case has to protect two stacked boards, expose USB-C and probe ports, survive repeated lid removal, and be credible for a prototype manufacturing review."

   Bad framing:
   - "The user works at Tesla."
   - "Treat this as a frontier humanoid robotics startup."
   - "Copy the Optimus finger."
   - "Make something inspired by a named proprietary product without changing the engineering problem."

   Named companies, famous products, and competitor designs may be used only as public comparison anchors if the user provided them or they are needed to clarify the class of artifact.
   Do not assert affiliation, privileged context, or proprietary requirements unless the user explicitly supplied them.
   Invented organizations are allowed, but do not present them as the user's employer.

3. Classify the artifact family.
   Read `references/default-profiles.md`.
   Common families:
   - grippers and small mechanisms
   - fixtures, jigs, and holders
   - enclosures and electronics housings
   - furniture and load-bearing structures
   - chassis and mobile robot structures
   - human vehicles and rideable product forms
   - custom / other
   If no family fits cleanly, do not force one. Create a custom brief shape.

4. Choose manufacturing/process posture.
   Treat process selection as part of the brief.
   Use `production-realistic`, `prototype-realistic`, `printable`, `visual-CAD`, or a more specific process such as `sheet-metal`, `CNC-machined`, `laser-cut`, `welded tube`, `injection-molded`, `cast`, or `hybrid purchased-hardware`.
   Default to the posture that is honest for the artifact rather than the easiest CAD surface to make.

5. Pick qualitative levers, not raw numbers.
   Start from:
   - duty level: `light-duty`, `general-duty`, `sturdy-duty`
   - scale level: `compact`, `medium`, `large`
   - cost posture: `cheapest`, `balanced`, `performance-first`
   Then translate them into numbers only inside the chosen family.

6. Close only the critical gaps.
   Ask at most 3 grouped questions.
   Use choice menus, not blank forms.
   Good grouped questions:
   - for a gripper: object style, opening band, cost/performance posture
   - for a table: use style, span band, load style
   - for an enclosure: electronics size, ruggedness, cooling posture
   - for an underspecified product: production-realistic, prototype-realistic, printable, or visual-CAD posture

7. Convert choices into an engineering brief.
   The brief must include:
   - target artifact
   - artifact family
   - specific operating story
   - production reason
   - test setting
   - what generic output would miss
   - intended objects / loads
   - rough size envelope
   - motion style and degrees of freedom
   - manufacturing/process stack and material defaults
   - purchased-part boundary
   - validation standard
   - explicit uncertainty policy

8. Emit one master prompt.
   Start from `references/master-prompt.md`.
   Fill in the placeholders using the chosen profile and assumptions.
   Return the finished prompt, not notes about the prompt.

9. If implementation continues immediately, hand off to `forgecad`.
   For moving mechanisms, load:
   - `skills/forgecad/SKILL.md`
   - `docs/permanent/generated/assembly.md`
   - `docs/permanent/generated/output.md`
   - `docs/permanent/guides/joint-design.md`
   - `docs/permanent/CLI.md`

## Question Style

Keep questions short and maker-friendly.

Good:

- "Which target feels closest: a light desk demo, a useful hobby tool, or a sturdier bench mechanism?"
- "Will it mostly handle soft/light things, mixed household parts, or rigid/tool-like objects?"
- "Should we bias for cheapest parts, balanced practicality, or stronger hardware?"
- "Should this be production-realistic, prototype-realistic, printable, or just a visual CAD study?"
- "Is this more like a gripper, a fixture, an enclosure, a chassis, or furniture?"
- "Will the table mostly hold decor, laptop-and-books, or workshop abuse?"

Bad:

- "What payload mass?"
- "What torque budget?"
- "What joint backlash can you tolerate?"

## Default Behavior

If the user says "I don't know" or gives only a broad goal:

- infer the nearest artifact family from the request
- invent a specific operating story for the artifact
- infer the manufacturing/process stack from the artifact family and operating story
- choose `general-duty`
- choose `medium`
- choose `balanced`
- use the family-specific starter assumptions from `references/default-profiles.md`
- do not copy assumptions from one family into another
- do not make the artifact printable unless the user asked for it or the chosen process stack includes printed parts

Examples:

- gripper request -> use gripper-specific object mass, opening, and actuator assumptions, plus a named robotics or automation prototype-review story
- table request -> use table-specific span, load, and leg/stiffness assumptions
- enclosure request -> use enclosure-specific board size, wall thickness, and thermal assumptions

Do not promise impossible honesty.
If the request pushes beyond the chosen profile, keep going but downgrade the final claim from "build-ready" to "best-effort build candidate".

## Output Contract

When using this skill, your answer should usually contain:

1. a short interpretation of the user's request
2. the chosen artifact family
3. the specific operating story
4. a compact options menu if truly needed
5. the chosen assumption bundle
6. the single filled ForgeCAD master prompt

Do not bury the prompt beneath long theory.

---
name: forgecad-prepare-prompt
description: Turn a fuzzy physical product, mechanism, or CAD artifact request into a concrete manufacture-realistic prototype ForgeCAD build brief and a single master prompt for the modeling pass. Use when the engineering brief is incomplete, manufacturing/process choice is underspecified, or the work needs a specific operating story to avoid generic toy solutions.
forgecad-public: true
---

# Prepare ForgeCAD Prompt

Use before modeling when the user wants something physically real and buildable but the request is fuzzy ("make me a robot gripper", "make it production ready", "I don't know the numbers, make sensible choices"). This skill owns intake and prompt preparation; once the brief is concrete, hand off to the `forgecad` skill.

## Core Rules

**Manufacturing is a design decision, not a default.** Never assume FDM, 3D printing, "printable", or plastic parts unless the user explicitly asked, the artifact family honestly points there, or the chosen process stack includes printed parts. Derive the process stack from artifact family, load path, scale, safety expectations, material properties, production intent, and operating story — family→process examples and all numeric anchors live in `references/default-profiles.md`. If the user names a process, honor it but warn when it is unsafe or dishonest for the duty.

**Posture taxonomy.** Default output posture is **manufacture-realistic prototype**: a serious build candidate with real materials, purchased-part boundaries, assembly logic, and validation — no claims of production tooling, certification, rider safety, or release-ready DFM. Other postures only when the brief justifies them: `production-realistic` (explicit production intent), `printable` (printing is the selected process), `visual-CAD` (form study), or a specific process posture (`sheet-metal`, `CNC-machined`, `laser-cut`, `welded tube`, `injection-molded`, `cast`, `hybrid purchased-hardware`). Pick the posture that is honest for the artifact, not the easiest CAD surface.

**Family-scoped numbers.** Every starter assumption is scoped to one artifact family. Never reuse numbers across families; never apply one default profile to unrelated artifacts.

## Workflow

1. **Normalize the ask** into plain mechanism language. "6 DOF gripper" usually means one of: standalone gripper with finger joints, wrist plus gripper, or full arm plus gripper.

2. **Build the specific operating story**: an invented specific (non-famous) org, a named program, a prototype revision, a review moment, a test setting, mission pressure (pilot gate, demo date, investor milestone, customer deployment), and the generic failure mode to avoid. Prefer bold high-agency stories — go/no-go gates, first-customer pilots, investor demos — over modest lab exercises.
   - Good: "RivetLine Automation is racing toward a first-customer kitting-cell pilot and needs the RG-4 gripper jaw for a live demo next Wednesday. The jaw must pick 40-90 mm plastic housings from a tray, use hardware the build tech can source this week, and make finger-pad replacement possible without rebuilding the linkage."
   - Bad: vague prestige labels ("frontier robotics startup") with no program/rig/milestone specifics.
   - Never assert the user works for a named real company unless they said so. Named real products only as public comparison anchors. Never clone proprietary designs — public-domain patterns and first-principles engineering only.

3. **Classify the artifact family** (`references/default-profiles.md`): grippers and small mechanisms; fixtures/jigs/holders; enclosures and electronics housings; furniture and load-bearing structures; chassis and mobile robot structures; human vehicles and rideable forms. Rideables always route to human-vehicles, never chassis. If no family fits, use the no-family-fits escape there — never force one.

4. **Choose the process posture** per the taxonomy above.

5. **Pick the qualitative levers** — duty: `light-duty`/`general-duty`/`sturdy-duty`; scale: `compact`/`medium`/`large`; cost: `cheapest`/`balanced`/`performance-first` — and translate them into family-scoped starter assumptions.

6. **Close only the critical gaps.** At most 3 grouped questions, always choice menus, never raw engineering inputs (payload mass, torque budget, backlash tolerance) unless the architecture truly depends on them and cannot be bracketed safely. Good: "Which feels closest: a light desk demo, a useful hobby tool, or a sturdier bench mechanism?" Bad: "What payload mass?"

7. **Write the engineering brief.** Required fields: artifact + family + normalized interpretation; operating story + production reason + test setting + generic failure mode to avoid; output posture; intended objects/loads, size envelope, motion style and DOF; process stack and material defaults; purchased-part (BOM) boundary; validation standard; variant policy — multiple versions of one object are selectable params (`Variant`/`Preset`/`Style`), one rendered at a time, a comparison lineup only as an explicit non-default debug mode so collision inspection proves one real assembly; file organization — `main.forge.js` entry point for multi-file projects (convention owned by `forgecad-make-a-model`); explicit uncertainty policy.

8. **Emit one master prompt.** Fill `references/master-prompt.md` from the chosen profile and assumptions. Return the finished prompt, not notes about it.

9. **Hand off** to the `forgecad` skill if implementation continues; for moving mechanisms its index routes to the assembly and joint-design docs.

## Defaults And Verdict

If the user stays vague: `general-duty` / `medium` / `balanced`, invent the operating story, and use the family starter assumptions from `references/default-profiles.md`.

The prompt must demand exactly `BUILD-READY` or `BEST-EFFORT BUILD CANDIDATE`. If the request outruns the chosen profile, downgrade the claim and keep going. No placeholders ("appropriate motor", "adjust as needed") — choose a defensible value, state it, continue. No follow-up questions unless the architecture would materially change and no safe assumption bundle exists. Human-bearing furniture and rideable vehicles usually end `BEST-EFFORT BUILD CANDIDATE`.

## Output Contract

Reply with a short interpretation of the request, the chosen family + operating story + assumption bundle (compact, options menu only if truly needed), then the single filled master prompt last. Do not bury the prompt under theory.

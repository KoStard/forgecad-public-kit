# ForgeCAD Manufacture-Realistic Prototype Master Prompt

Fill the placeholders and return the finished prompt as one block.

```text
You are producing a ForgeCAD manufacture-realistic prototype package, not a concept sketch — a credible internal engineering package for a real build candidate, not a generic maker example. Use the specific operating story below to drive engineering choices; do not flatten it into a vague domain label.

Target artifact:
- artifact: {artifact}
- request summary: {request_summary}
- normalized interpretation: {normalized_interpretation}

Specific operating story:
- organization / team: {organization_team}
- project / prototype revision: {project_revision}
- milestone / review moment: {milestone_review}
- domain context: {domain_context}
- production reason: {production_reason}
- test setting: {test_setting}
- generic-output failure mode to avoid: {generic_failure_mode}
- public comparison anchor, if useful: {benchmark_class}

Chosen intake classification:
- output posture: {output_posture} (manufacture-realistic prototype unless the user selected another)
- artifact family: {artifact_family}
- duty level: {duty_level}
- scale level: {scale_level}
- cost posture: {cost_posture}
- manufacturing / process stack: {manufacturing_process_stack}
- variant policy: {variant_policy}

Working assumptions chosen to close missing inputs (provisional, scoped to `{artifact_family}` only):
- {assumption_1}
- {assumption_2}
- {assumption_3}
- {assumption_4}

Hard constraints:
- Use ForgeCAD. Any moving mechanism uses a real `assembly()` with honest joints, limits, axes, and operating ranges per the forgecad skill quality bar. Make the result runnable with `forgecad run`.
- Default posture is manufacture-realistic prototype: real prototype materials, fabrication cues, purchased parts, assembly logic, serviceability, and validation — without claiming production certification or release readiness.
- Choose processes that fit the artifact, load path, scale, safety, and operating story. Do not assume FDM/3D printing/"printable" unless the user asked or the selected process stack includes printed parts. Prefer metal shafts, bearings, fasteners, inserts, pins, tube, sheet goods, castings, molded/machined parts, or composite/wood members where honest, with process-appropriate clearances.
- Include a BOM concrete enough to buy and assemble from, registered in-model with `bom()` entries — not only prose.
- Model the physical artifact, not an educational diagram: no explanatory text labels, callouts, arrows, legends, axes, or part-name slabs unless the user explicitly asks for a teaching view. Include only markings the real artifact would carry (serial plates, connector labels, gauge ticks, alignment/warning marks, branding), sparse and process-appropriate.
- Do not hide uncertainty; choose defaults and continue.
- Do not claim the user works for a named company unless they said so; the invented org is a design scenario, not a factual claim. Do not clone proprietary named products — use public-domain patterns and first-principles engineering.

Acceptable final states:
1. `BUILD-READY` — specific enough that a competent builder could start fabricating, buying, assembling, and testing immediately without inventing missing details.
2. `BEST-EFFORT BUILD CANDIDATE` — still the strongest concrete design possible, plus an explicit statement of the smallest unavoidable validation loop that remains.

Non-negotiable rules:
- No high-level concepts, visions, or wishlists; no generic category solution that could have been written without the operating story.
- No placeholders like "appropriate motor", "standard hardware", or "adjust as needed". If a number is missing, choose a defensible value, state it, continue.
- Prefer a complete best-effort design over an incomplete discussion. If the user's wording is physically confused, normalize it and proceed.
- Do not import numeric assumptions from unrelated artifact families.
- Do not ask follow-up questions unless the architecture would materially change and no safe assumption bundle exists.
- Make the CAD legible through part boundaries, hardware, interfaces, and materials — not labels.

Required outputs:

0. Operating story and anti-generic bar — restate the org, revision, milestone, test setting; name the generic failure mode avoided and the domain-specific details that make the design credible.
1. Problem normalization — what is being built, what it does, what "done" means physically.
2. Assumption bundle — every chosen assumption with units and why it is reasonable.
3. Architecture choice — one mechanism architecture; briefly name the rejected alternatives and why they lost.
4. Detailed mechanical design — exact dimensions or formulas for major parts; subassemblies, interfaces, motion ranges, stops, load paths; for articulated mechanisms, concrete finger/link/jaw geometry and all joints.
5. Actuation and transmission — actuator class, approximate torque/force, transmission approach, fit to the chosen profile.
6. Manufacturing package — per critical part: material, process, prototype setup/orientation/tooling/finish assumptions, serviceability, process-accuracy-sensitive features. For printed parts (only if printing is selected): orientation, support strategy, print-sensitive features.
7. Bill of materials — manufactured, printed (if any), and purchased parts; per line: name, exact spec or part class, quantity, purpose, key dimensions/ratings; mirrored in-model with `bom()` so `forgecad export report` reproduces it.
8. Assembly package — assembly order, jointing method, insert/bearing/pin usage, fastening notes, failure-prone steps.
9. Validation package — motion range, likely collisions, stiffness/load risks, manufacturability, tolerance stacks, wear points; check printability only for printed parts; check moving designs through their operating range, not just at rest pose.
10. ForgeCAD implementation package — the actual file structure; in a writable workspace, write the `.forge.js` files instead of stopping at prose, with `main.forge.js` as the runnable entry point for multi-file projects; `dim()` annotations on the dimensions a builder must hit, and the process-appropriate export proven to run (per the forgecad-make-a-model Manufacturing Outputs bar).
11. Final verdict — end with exactly one of `BUILD-READY` or `BEST-EFFORT BUILD CANDIDATE`.
```

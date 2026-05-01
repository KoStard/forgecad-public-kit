# ForgeCAD Manufacturing-Aware Master Prompt

Fill the placeholders and return the finished prompt as one block.

```text
You are producing a ForgeCAD build-ready physical artifact package, not a concept sketch.

Treat this as a serious product-team prototype assignment.
The goal is to produce a credible internal engineering package for a real build candidate, not a generic maker example.
Use the specific operating story below to drive engineering choices; do not flatten it into a vague domain label.

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
- benchmark class / public comparison anchor, if useful: {benchmark_class}

Chosen intake classification:
- artifact family: {artifact_family}
- duty level: {duty_level}
- scale level: {scale_level}
- cost posture: {cost_posture}
- job style: {job_style}
- manufacturing / process stack: {manufacturing_process_stack}
- budget posture: {budget_posture}

Working assumptions chosen to close missing inputs:
- these assumptions are provisional and family-scoped
- they apply to `{artifact_family}`, not as universal defaults
- {assumption_1}
- {assumption_2}
- {assumption_3}
- {assumption_4}

Hard constraints:
- use ForgeCAD
- if the mechanism has moving parts, use a real `assembly()` from iteration 1
- define real joints, limits, axes, and intended operating ranges
- choose manufacturing/processes that fit the artifact, load path, scale, safety expectations, and operating story
- do not assume FDM, 3D printing, or "printable" unless the user explicitly asked for it or the chosen process stack includes printed parts
- include realistic process-appropriate clearances and mechanically honest interfaces
- include manufactured, printed, and purchased parts only where each is an honest choice
- include a BOM that is concrete enough to buy and assemble from
- prefer metal shafts, bearings, fasteners, inserts, pins, tubes, sheet goods, castings, molded parts, machined parts, or composite/wood members where they are the honest choice
- do not hide uncertainty; choose defaults and continue
- do not claim the user works for a named company unless the user explicitly said so
- if an organization/team name appears only in the operating story, treat it as a design scenario, not as a factual claim about the user
- do not clone proprietary named products; use public domain patterns and first-principles engineering to create an original design

Acceptable final states:
1. `BUILD-READY`
2. `BEST-EFFORT BUILD CANDIDATE`

`BUILD-READY` means the output is specific enough that a competent builder could start fabricating, machining, printing, buying parts, assembling, and testing immediately without inventing missing details.

`BEST-EFFORT BUILD CANDIDATE` means you still provide the strongest concrete design possible, but you explicitly name the smallest unavoidable validation loop that remains.

Non-negotiable rules:
- Do not answer with a high-level concept, vision, or wishlist.
- Do not produce a generic category solution that could have been written without the professional context.
- Do not use placeholders like "appropriate motor", "standard hardware", or "adjust as needed".
- If a number is missing, choose a defensible value, state it, and continue.
- Prefer a complete best-effort design over an incomplete discussion.
- If the user's wording is physically confused, normalize it and proceed.
- Do not import numeric assumptions from unrelated artifact families.
- Do not ask follow-up questions unless the architecture would materially change and no safe assumption bundle exists.

Required outputs:

0. Specific operating story and anti-generic bar
- State the organization/team, project revision, milestone, and test setting you are designing for.
- Name the generic failure mode you are avoiding.
- Identify the domain-specific details that must appear for the design to be credible.

1. Problem normalization
- Restate exactly what is being built, what it should do, and what "done" means in physical terms.

2. Assumption bundle
- State all chosen assumptions with units and why they are reasonable for this request.

3. Architecture choice
- Pick one mechanism architecture.
- Briefly mention the main rejected alternatives and why they lost.

4. Detailed mechanical design
- Give exact dimensions or dimension formulas for the major parts.
- Define subassemblies, interfaces, motion ranges, stops, and load paths.
- If this is a gripper or articulated mechanism, specify finger/link/jaw geometry and all joints concretely.

5. Actuation and transmission
- Specify the actuator class, approximate required torque/force, transmission approach, and why they fit the chosen profile.

6. Manufacturing package
- For each critical part: material, manufacturing process, setup/orientation/tooling/finish assumptions, serviceability notes, and features sensitive to process accuracy.
- If the selected process includes printed parts, include print orientation, likely support strategy, and print-sensitive features for those parts.

7. Bill of materials
- Include manufactured parts, printed parts if any, and purchased parts.
- For each line item give: name, exact spec or part class, quantity, why needed, and important dimensions or ratings.

8. Assembly package
- Provide the assembly order, jointing method, insert/bearing/pin usage, fastening notes, and likely failure-prone assembly steps.

9. Validation package
- Check motion range, likely collisions, stiffness risks, load risks, manufacturability, tolerance-stack risks, and wear points.
- Check printability only for parts whose selected process is printing.
- If moving parts are present, describe how the design should be checked through its operating range rather than only at rest pose.

10. ForgeCAD implementation package
- Produce the actual ForgeCAD file structure you would write.
- If you are operating in a writable workspace, write the `.forge.js` files instead of stopping at prose.
- Use `bom()` / assembly metadata where appropriate.
- Make the design compatible with `forgecad run`.
- If relevant, make it exportable in process-appropriate formats such as STEP, STL, 3MF, DXF, SVG, or report output.

11. Final verdict
- End with exactly one of:
  - `BUILD-READY`
  - `BEST-EFFORT BUILD CANDIDATE`

ForgeCAD-specific quality bar:
- Any moving mechanism must use `assembly()` from the start, not manual transform hacks.
- Use ForgeCAD's joint/collision workflow mentally and structurally: joints, limits, sweeps, collisions, and BOM are part of the deliverable.
- Do not claim a hinge or sliding joint works unless cavity / clearance logic is physically honest.
- A pretty static pose is not success.
```

---
name: forgecad-grade-model
description: Grade a ForgeCAD or CAD-as-code model against a requirement, brief, prompt, reference, or acceptance criteria with evidence and a 0-10 score.
forgecad-public: true
---

# Grade Model

Grade the delivered model against the requirement, not against what could be fixed later. Never edit the model unless the user explicitly requests repairs — then record the baseline grade first, change, and re-grade.

## Workflow

1. **Extract the requirement** into a checklist, must-haves separate from nice-to-haves. If the brief is vague, grade the most reasonable literal interpretation and mark unverifiable items `Unknown`.
2. **Run the model**: `forgecad run <model>.forge.js` (in the ForgeCAD repo use the local build, `node dist-cli/forgecad.js run ...`). If it fails to execute, stop and apply the caps.
3. **Render** at least `iso`, `front`, `right`, `top` to a scratch dir; add views (back, bottom, close-up, section) when the model is asymmetric, hollow, mechanical, or likely to hide mistakes.
4. **Open and look at every PNG** — never score from command output alone. Check silhouette, proportions, required features, part boundaries, interfaces, and whether the model reads as the requested artifact from more than one angle.
5. **Inspect** whenever hidden internals, fit, wall thickness, or assembly behavior are central to the brief — grading without inspecting them caps the score. Delegate evidence choice, commands, and manifest reading to the `forgecad-inspect-model` skill. Findings (unexpected collisions, thin regions, floating bodies, wrong component counts) are evidence, not warnings to wave away.
6. **Score**: fill the rubric, apply caps, give a final 0-10 in whole or `.5` increments. Unknowns count against the score.

## Rubric

| Dimension | Points | What To Look For |
| --- | ---: | --- |
| Requirement fit | 4 | Satisfies the stated must-haves, captures the intended object/function, no drift into a generic substitute. |
| Geometric completeness | 2 | Correct silhouette, proportions, visible details, part boundaries, internal structure when required, no missing major components. |
| Mechanical/manufacturing plausibility | 2 | Believable materials/process, real interfaces, clear load paths, fasteners/seats/clearances where needed, no impossible assembly. |
| Validation health | 1 | Runs cleanly, renders from multiple views, targeted inspections reveal no major unaddressed issues. |
| Code/model quality | 1 | Parametric clarity, readable organization, meaningful names, no debug junk, appropriate ForgeCAD APIs. |

Anchors: 9-10 = evidence-backed match for the brief; 7-8 = recognizable and mostly complete, fixable gaps; 5-6 = main idea only; below 5 = broken or loosely related.

## Evidence Caps

Maximum scores, applied after the rubric:

- Model does not execute: max `2`.
- Executes but cannot be rendered: max `4`.
- No rendered images visually inspected: max `5`.
- Only one flattering view inspected: max `6`.
- A must-have requirement is absent: max `6`.
- Visually recognizable but physically impossible for the requested use: max `6`.
- Internals, fit, walls, or assembly central to the brief but uninspected: max `7`.
- Multi-part assembly violates the ForgeCAD component model — sibling imports, assembly-space coordinates inside parts, structural `translate()` placement, missing connector mates, or parent/child data flow confusion: max `7`; max `6` when the violation makes the assembly brittle or mechanically wrong.
- Inspection finds unexpected collisions, floating bodies, critical thin walls, or wrong connectivity: max `6`; max `5` when the defect invalidates the main function.
- Delivered as a finished product/prototype but presented with default flat lighting (no `scene()` rig), a generically colorful or material-false palette, or teaching-diagram styling: max `8`. Does not apply when the brief asks for a blockout or bare technical study.
- Any score relying on an assumption the evidence cannot verify: mark it `Unknown`, never score above `8`.

## Report Format

```markdown
Score: N / 10

Requirement checklist:
| Item | Result | Evidence |
| --- | --- | --- |
| ... | Pass/Partial/Fail/Unknown | render/inspection/file evidence |

Evidence reviewed: run outcome; views inspected; inspection highlights.
Why this score: decisive strengths and defects.
Caps applied: list, or `None`.
Next fixes: the 2-5 highest-leverage improvements.
```

## Grading Rules

- A beautiful render with missing functional geometry is not a high score.
- Grade the default returned model unless the user names a parameter set or variant.
- No points for comments, labels, or intentions absent from the geometry.
- Decorative screws, floating labels, and teaching-diagram callouts are not real mechanical interfaces.
- For multi-part assemblies, require the component model: parts build locally at origin, expose connectors/metadata, the parent positions them, and inter-part data flows through parent props and returned metadata.
- Cite which render or inspection finding drove the grade.
- When comparing models, use identical checklist, cameras, inspection evidence, and caps for all.

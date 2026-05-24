---
name: forgecad-model-grader
description: Analyze, verify, and grade ForgeCAD or CAD-as-code models against a user requirement, design brief, prompt, reference, or acceptance criteria. Use when asked to evaluate, judge, QA, benchmark, score, rate, or compare a CAD model; render it from multiple angles, run targeted inspections when needed, visually verify the evidence, and produce a 0-10 score with concise justification.
forgecad-public: true
---

# ForgeCAD Model Grader

Grade the delivered CAD model against the requirement, not against what could be fixed later. Use renders and inspection evidence before assigning a score.

This skill is an evaluator workflow. Do not edit the model unless the user explicitly asks for repairs; if repair is requested, first record the baseline grade, then make changes, then re-grade.

## Workflow

1. Extract the requirement.
   Convert the user's prompt, design brief, reference image, or acceptance criteria into a short checklist. Separate must-haves from nice-to-haves. If the requirement is vague, grade against the most reasonable literal interpretation and mark uncertain items as `Unknown`.

2. Identify grading risks.
   Decide what could make the model fail: wrong object, missing parts, weak silhouette, hidden internals absent, impossible assembly, collisions, floating bodies, wrong scale, thin walls, poor manufacturing cues, bad parameter behavior, or unclear visual identity.

3. Run the model.
   In the ForgeCAD repo, use the local build:

   ```bash
   node dist-cli/forgecad.js run path/to/model.forge.js
   ```

   Outside the repo, use the installed CLI:

   ```bash
   forgecad run path/to/model.forge.js
   ```

   If the script fails to execute, stop normal grading and assign a capped score using the Evidence Caps section.

4. Render multiple views.
   Use a scratch output directory such as `/tmp/<model-name>-grade`. Render at least `iso`, `front`, `right`, and `top`. Add `back`, `bottom`, close-up, section, or custom cameras when the model is asymmetric, hollow, mechanical, or likely to hide mistakes.

   ```bash
   node dist-cli/forgecad.js render 3d path/to/model.forge.js /tmp/model-grade/view.png --camera iso --camera front --camera right --camera top --edges bold
   ```

   If a multi-camera render does not emit separate useful PNGs, rerun one camera at a time with explicit output paths.

5. Visually inspect the PNGs.
   Open the rendered images. Do not score from command output alone. Check silhouette, proportions, required visible features, part boundaries, material/color cues, seams, fasteners, interfaces, and whether the model reads as the requested artifact from more than one angle.

6. Run targeted inspections when the risk calls for them.
   Use `forgecad-render-inspect` for inspection bundles. Minimum guidance:

   - `inspect image` and `inspect objects`: visual sanity, object naming, and part identity.
   - `inspect collisions`: multi-part fit, interference, and assembled mechanisms.
   - `inspect sections` and `inspect thickness`: shells, enclosures, ribs, bosses, printability, and wall claims.
   - `inspect connectivity`: accidental fusion or disconnected solids.
   - `inspect floating`: loose bodies without physical support.
   - `inspect depth`, `inspect normals`, or `inspect zebra`: surface, occlusion, faceting, continuity, or strange protrusions.

   Typical command:

   ```bash
   node dist-cli/forgecad.js inspect collisions path/to/model.forge.js /tmp/model-grade/collisions --camera iso --force --size 700
   python skills/forgecad-render-inspect/summarize_manifest.py /tmp/model-grade/collisions
   ```

   Read the manifest and inspect the relevant evidence PNGs. Treat unexpected collisions, thin regions, missing sections, wrong component counts, floating bodies, and confusing object colors as evidence, not as warnings to wave away.

7. Score with evidence.
   Fill the rubric, apply caps, then give a final 0-10 score. Use whole numbers or `.5` increments. Unknowns count against the score.

## Rubric

Start from these dimensions, then apply the caps below:

| Dimension | Points | What To Look For |
| --- | ---: | --- |
| Requirement fit | 4 | The model satisfies the stated must-haves, captures the intended object/function, and does not drift into a generic substitute. |
| Geometric completeness | 2 | Correct silhouette, proportions, visible details, part boundaries, internal structure when required, and no missing major components. |
| Mechanical/manufacturing plausibility | 2 | Believable materials/process, real interfaces, clear load paths, fasteners/seats/clearances where needed, and no impossible assembly behavior. |
| Validation health | 1 | Runs cleanly, renders from multiple views, and targeted inspections do not reveal major unaddressed issues. |
| Code/model quality | 1 | Parametric clarity, readable organization, meaningful names, no debug junk, and appropriate use of ForgeCAD APIs. |

Interpretation:

| Score | Meaning |
| ---: | --- |
| 10 | Exceptional match; requirements are met with strong visual and inspection evidence, no meaningful defects found. |
| 9 | Excellent; one or two small gaps, but the artifact is clearly fit for the brief. |
| 7-8 | Good; recognizable and mostly complete, with fixable omissions or moderate mechanical/detail issues. |
| 5-6 | Partial; main idea is present, but major requirements, proportions, internals, or plausibility are missing. |
| 3-4 | Weak; model runs or renders but only loosely matches the request. |
| 1-2 | Barely useful; broken, mostly unrelated, or only a trivial placeholder. |
| 0 | No evaluable model or completely unrelated artifact. |

## Evidence Caps

Apply these maximum scores after the rubric:

- If the model does not execute: max `2`.
- If the model executes but cannot be rendered: max `4`.
- If no rendered images were visually inspected: max `5`.
- If only one flattering view was inspected: max `6`.
- If a must-have requirement is absent: max `6`.
- If the model is visually recognizable but physically impossible for the requested use: max `6`.
- If hidden internals, fit, wall thickness, or assembly behavior are central to the brief but not inspected: max `7`.
- If targeted inspection finds unexpected collisions, floating bodies, critical thin walls, or wrong connectivity: max `6`, or max `5` when the defect invalidates the main function.
- If the score relies on an assumption the evidence cannot verify: mark it `Unknown` and do not score above `8`.

## Report Format

Keep the report compact and evidence-first:

```markdown
Score: 7.5 / 10

Requirement checklist:
| Item | Result | Evidence |
| --- | --- | --- |
| ... | Pass/Partial/Fail/Unknown | render/inspection/file evidence |

Evidence reviewed:
- Run: command and outcome
- Renders: paths/views inspected
- Inspections: bundle path, evidence command, manifest highlights

Why this score:
Short paragraph explaining the decisive strengths and defects.

Caps applied:
List any cap that affected the final score, or `None`.

Next fixes:
The 2-5 highest-leverage improvements, only if useful.
```

## Grading Rules

- Be strict but fair. A beautiful render with missing functional geometry is not a high score.
- Grade the default returned model unless the user names a specific parameter set or variant.
- Do not award points for comments, labels, or intentions that are not present in geometry.
- Do not treat decorative screws, floating labels, or teaching-diagram callouts as substitutes for real mechanical interfaces.
- Prefer concrete evidence over taste. Say which render or inspection finding drove the grade.
- If comparing several models, use the same checklist, cameras, inspection evidence, and caps for all of them.

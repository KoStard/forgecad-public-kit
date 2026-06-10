---
name: forgecad-3d-reconstruction
description: Reconstruct a parametric ForgeCAD model from an existing 3D CAD or mesh file such as STL, OBJ, 3MF, STEP, or STP; inspect the source asset directly, author real ForgeCAD geometry, and iteratively compare the candidate with `forgecad compare 3d`.
forgecad-public: true
---

# ForgeCAD 3D Reconstruction

The reference asset is evidence, not the deliverable. The deliverable is a readable, parametric `.forge.js` model that runs, renders, and scores well against the source. Never return `Import.mesh()`/`Import.step()` of the source as the final model unless the user explicitly asks for an import wrapper — imports are for measurement, rendering, and scoring only.

Routing: user wants to KEEP the file as a live component and design around it (bracket, enclosure, mating assembly) → `forgecad-make-a-model` (Imported Parts section), not this skill; benchmark/RL episodes → `forgecad-reconstruction-benchmark`; inspection-bundle interpretation → `forgecad-render-inspect`; independent grading after reconstruction → `forgecad-model-grader`; API and command reference → `forgecad` skill + CLI.md.

## Workflow

1. **Inspect the source directly** — the CLI reads CAD/mesh files as inputs, no wrapper script. Gather four evidence types: `ls --long` stats, an iso render, per-object views, sampled sections (invocations in CLI.md; when sharing a renderer server via `--port`, run renders sequentially).
2. **3MF**: enumerate every build item before scoring — hidden multi-part structure is a common miss. Item ref syntax: `Import.mesh` docs.
3. **Reconstruction Brief** before modeling: what must be exact vs. approximate vs. parametric; symmetry, origin, key reference planes; likely manufacturing process; scoring tolerance and alignment policy.
4. **Blockout first.** Match bbox and main masses, then add features. Model real geometry with blueprint-first APIs — never vertex-chase a faceted copy.
5. **Compare numerically** — the core loop:

   ```bash
   forgecad compare 3d path/to/source.stl path/to/candidate.forge.js \
     --samples 3000 --json --output /tmp/<slug>-score.json
   ```

6. **Iterate coarse to fine**: bbox/placement → main volumes/silhouette → holes/bosses/ribs/shells → edge treatments → small details.

## Reading the Score

Alignment: start `--align none`. Use `--align center` only when origins clearly differ but scale and orientation match. Use `--align center-scale` only for exploratory diagnosis — it hides dimensional errors.

| Signal | Diagnosis |
|---|---|
| Low coverage | Missing or extra surface |
| High RMS | Broad proportional mismatch |
| High p95/max | Localized outlier feature (protrusion, hole) |
| Bounds delta | Size, origin, or scale mismatch |
| Volume delta | Mass, shell, cutout, or scale mismatch |

Calibration: 95+ simple prismatic/revolved parts, 90+ ordinary mechanical parts with fillets/cutouts, 80+ acceptable for organic, faceted, or underdetermined sources. Always report raw rms, p95, max, coverage, bounds delta, and volume delta — a high overall score with a large max can hide a missing local feature.

Faceted sources: decide whether tessellation itself is evidence. Matching low-poly faceting raises the score but reduces parametric clarity — prefer analytic intent unless faceting is part of the artifact or required by the acceptance criteria.

## Done Criteria

The final model must run, render, re-compare at `--samples 5000`, and pass an `inspect compare overlay`. Add targeted inspects (`forgecad-render-inspect`) when the object is multi-part, hollow, thin-walled, or surface-sensitive. Report: source and candidate paths, score JSON path, final metrics, and every known mismatch classified as intentional simplification or remaining work.

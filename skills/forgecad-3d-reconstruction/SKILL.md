---
name: forgecad-3d-reconstruction
description: Reconstruct a parametric ForgeCAD model from an existing 3D CAD or mesh file such as STL, OBJ, 3MF, STEP, or STP; inspect the source asset directly, author real ForgeCAD geometry, and iteratively score the candidate with `forgecad score reconstruction`.
forgecad-public: true
---

# ForgeCAD 3D Reconstruction

Use this skill when the user provides an existing 3D file and wants a ForgeCAD model that recreates it as parametric CAD.

The reference asset is evidence, not the deliverable. The deliverable is a readable `.forge.js` model that runs, renders, inspects, and scores well against the source geometry.

Do not solve reconstruction by returning `importMesh("reference.stl")` or `importStep("reference.step")` as the final model unless the user explicitly asks for an import wrapper. Imported source assets are for measurement, rendering, inspection, and scoring.

## Companion Skills

- Use `forgecad` for API syntax, direct CAD CLI behavior, and validation commands.
- Use `forgecad-reconstruction-benchmark` instead when the task is a benchmark
  or RL episode with a fixed `submission/main.forge.js` output path.
- Use `forgecad-make-a-model` when creating a normal user-facing `.forge.js`
  project structure outside the benchmark harness.
- Use `forgecad-render-inspect` when inspection bundles need interpretation.
- Use `forgecad-model-grader` only after reconstruction, when the user asks for an independent grade.

## Required Workflow

1. Stage the reference.
   Put the source 3D file in a scratch folder such as `/tmp/<slug>-reconstruct/ref/` or keep the user's original path if it is already stable. Preserve the original file.

2. Inspect the source directly.
   No wrapper script is needed. Use the local checkout CLI:

   ```bash
   node dist-cli/forgecad.js run path/to/source.stl --quality live --details
   node dist-cli/forgecad.js render 3d path/to/source.stl /tmp/<slug>-source.png --camera iso --edges thin --size 900
   node dist-cli/forgecad.js inspect objects path/to/source.stl /tmp/<slug>-source-objects --camera iso --size 700 --force
   node dist-cli/forgecad.js inspect sections path/to/source.stl /tmp/<slug>-source-sections --size 700 --force
   ```

   For STEP/STP files, the CLI auto-selects OCCT unless `--backend` is passed.
   Run render commands sequentially; starting multiple browser renders at once can make the shared Vite renderer race and time out.

3. Write a Reconstruction Brief.
   Before modeling, record:
   - source path and file type
   - bounding box, volume, triangle count, and apparent units
   - object identity and likely manufacturing process
   - major primitive families: boxes, cylinders, plates, revolutions, lofts, sweeps, holes, fillets, ribs, threads, text, freeform surfaces
   - symmetry, coordinate origin, and key reference planes
   - what must be exact, what may be approximate, and what should remain parametric
   - scoring tolerance and alignment policy

4. Build the ForgeCAD candidate.
   Model the real geometry, not a faceted copy. Start with a blockout that matches bbox and main masses, then add holes, cutouts, transitions, and details. Prefer high-level ForgeCAD APIs and blueprint-first intent over vertex chasing.
   Add `compareWith('./source-file.ext')` in the candidate script when the reference
   sits next to it, or use an appropriate relative path from the candidate file.
   This lets score and comparison-render commands take the candidate path alone.

5. Score the candidate numerically.
   Use the reconstruction score command:

   ```bash
   node dist-cli/forgecad.js score reconstruction path/to/candidate.forge.js \
     --samples 3000 --json --output /tmp/<slug>-score.json
   ```

   If the candidate cannot declare `compareWith()` because it is a raw CAD asset,
   pass `--reference path/to/source.stl`.
   Start with `--align none`. Use `--align center` only when the source and candidate clearly use different origins but the same scale and orientation. Use `--align center-scale` only for exploratory diagnosis because it can hide dimensional errors.

6. Iterate from coarse to fine.
   Improve in this order:
   - bbox size and coordinate placement
   - main volumes and silhouette
   - major holes, bosses, ribs, shells, and cutouts
   - edge treatments and transitions
   - small details, labels, textures, and decorative features

   Use score metrics as evidence:
   - low coverage means missing or extra surface area
   - high RMS means broad proportional mismatch
   - high p95 or max means localized protrusions, holes, or outliers
   - bounds delta means size, origin, or scale mismatch
   - volume delta means mass, shell, cutout, or scale mismatch

7. Validate the final model.
   Minimum final checks:

   ```bash
   node dist-cli/forgecad.js run path/to/candidate.forge.js
   node dist-cli/forgecad.js render 3d path/to/candidate.forge.js /tmp/<slug>-candidate.png --camera iso --edges thin --size 900
   node dist-cli/forgecad.js score reconstruction path/to/candidate.forge.js --samples 5000 --json --output /tmp/<slug>-final-score.json
   node dist-cli/forgecad.js inspect comparison path/to/candidate.forge.js /tmp/<slug>-compare --compare-samples 5000 --force --size 700
   ```

   Add targeted evidence commands such as `inspect collisions`, `inspect thickness`, `inspect connectivity`, `inspect floating`, or `inspect zebra` when the object is multi-part, hollow, mechanical, thin-walled, or surface-sensitive.

## Scoring Guidance

`forgecad score reconstruction` returns an overall 0-100 score plus raw geometry metrics. Treat the score as a guide, not a license to make unmaintainable code.

Suggested targets:

- `95+`: excellent reconstruction for simple prismatic or revolved parts
- `90+`: good target for ordinary mechanical parts with fillets and cutouts
- `80+`: acceptable rough reconstruction when the source is organic, faceted, or underdetermined

Always report the raw `rms`, `p95`, `max`, coverage, bounds delta, and volume delta. A high score with a large `max` distance can still hide a missing local feature.

For faceted source meshes, decide whether tessellation itself is evidence. If the source is an exported primitive or low-poly mesh, exact triangle/segment matching can raise the numeric score but may reduce parametric clarity. Prefer analytic intent when the user wants a clean CAD reconstruction; match tessellation only when the faceting is part of the artifact or required by the acceptance criteria.

## Subagent Validation

When validating this skill with a subagent, give the subagent only:

- the reference file path
- the desired output folder
- this skill name
- the command to use the local CLI: `node dist-cli/forgecad.js`

Do not provide your intended modeling strategy, hidden measurements, or expected score. The point is to test whether the skill guides a fresh agent through evidence, modeling, scoring, and iteration.

## Output Contract

When finished, report:

- source file path
- candidate `.forge.js` path
- Reconstruction Brief summary
- source inspection bundle and renders
- candidate renders and inspection bundle, if used
- final `forgecad score reconstruction` command and score JSON path
- final score, RMS, p95, max distance, coverage, bounds delta, and volume delta
- known mismatches and whether they are intentional simplifications or remaining work

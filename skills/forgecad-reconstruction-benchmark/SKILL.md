---
name: forgecad-reconstruction-benchmark
description: Solve ForgeCAD CAD reconstruction benchmark or RL episodes in a prepared workspace by rebuilding a visible reference asset as readable parametric ForgeCAD in the fixed submission path, using local scoring feedback and respecting sandbox limits.
forgecad-public: true
---

# ForgeCAD Reconstruction Benchmark

Use this skill inside a prepared ForgeCAD reconstruction benchmark workspace.
The task is to rebuild the supplied CAD reference as editable ForgeCAD source,
not to wrap, embed, or copy the source asset.

This is a benchmark adaptation of `forgecad-3d-reconstruction`: same evidence
and coarse-to-fine reconstruction loop, but with a fixed output path, strict
submission rules, and a short wall-clock budget.

## Workspace Contract

Read these first:

- `AGENTS.md`
- `task/instructions.md`
- this skill
- `agent-home/.agents/skills/forgecad/SKILL.md` for API guidance

Useful companion skills:

- `forgecad-3d-reconstruction` for the general reconstruction workflow
- `forgecad-render-inspect` for interpreting inspection bundles
- `forgecad-make-a-model` only for general model quality patterns; do not use
  its date-based file-placement workflow in benchmark workspaces

Common files:

- reference asset: `task/reference/*`
- final answer: `submission/main.forge.js` unless `task/task.json` says otherwise
- local ForgeCAD wrapper: `./bin/forgecad`
- local grader wrapper: `./bin/forgecad-rl-grade`
- scratch outputs: `outputs/`

Stay inside the prepared workspace. Use the local wrappers instead of global
ForgeCAD commands.

## Non-Negotiables

- Final deliverable is readable parametric ForgeCAD source at the required
  submission path.
- The reference asset is evidence only. The final source must not call
  `importMesh`, `importStep`, `readFile`, `readFileSync`, or equivalent asset
  embedding tricks.
- Do not leave `compareWith(...)`, external reference paths, base64 payloads, or
  debug probes in the final submission.
- Do not spend the whole budget inspecting. A runnable first candidate is more
  valuable than a perfect investigation with no model.
- Use only allowed local tools. Do not rely on web search, broad home-directory
  access, subagents, or remote services.

## Budget-Aware Workflow

1. Orient quickly.
   Read `task/instructions.md`, locate the reference file, and inspect the
   starter submission. If useful, run the grader once to learn the baseline.

   ```bash
   ./bin/forgecad run submission/main.forge.js
   ./bin/forgecad-rl-grade
   ```

2. Inspect only the highest-value evidence.
   Get dimensions, volume, object count, and at least one visual or sectional
   clue when the renderer is available. If a reference command fails or stalls,
   continue from task instructions, filename, starter code, and scoring feedback.

   ```bash
   ./bin/forgecad run task/reference/<asset> --quality live --details
   ./bin/forgecad render 3d task/reference/<asset> outputs/reference.png --camera iso --edges thin --size 900
   ./bin/forgecad inspect sections task/reference/<asset> outputs/reference-sections --size 700 --force
   ```

3. Write a short Reconstruction Brief in your notes or `outputs/brief.md`.
   Capture identity, bbox, major primitive families, symmetry, holes/cutouts,
   likely manufacturing intent, and the first modeling plan. Keep it short.

4. Edit the submission early.
   Build a coarse candidate that matches bbox, orientation, and main masses
   before adding details. Prefer simple analytic primitives, sketches, booleans,
   revolves, patterns, and blueprint-first dimensions over vertex chasing.

5. Score and iterate.
   Use `./bin/forgecad-rl-grade` as the main reward signal. Improve in this
   order: bbox and origin, main silhouette, large holes/cutouts, ribs/bosses,
   edge treatments, then small details.

   ```bash
   ./bin/forgecad run submission/main.forge.js
   ./bin/forgecad-rl-grade
   ```

   When diagnosing locally, a direct score command is also useful:

   ```bash
   ./bin/forgecad score reconstruction submission/main.forge.js \
     --reference task/reference/<asset> \
     --samples 3000 \
     --json \
     --output outputs/score.json
   ```

6. Final cleanup.
   Re-run the candidate and grader. Remove temporary imports, `compareWith`,
   debug-only geometry, scratch paths, and comments that describe abandoned
   attempts. Leave the best source at the required submission path.

## Reading Score Feedback

- Low coverage usually means missing/extra surface area.
- High RMS means broad proportion or scale mismatch.
- High p95/max means a localized missing feature, protrusion, hole, or outlier.
- Bounds delta means size, origin, or scale mismatch.
- Volume delta means mass, shell, cutout, or scale mismatch.

Optimize real geometry, not just the metric. A clean parametric approximation
that captures design intent is preferable to an unreadable mesh mimic.

## Done Criteria

Before exit:

- `./bin/forgecad run submission/main.forge.js` succeeds.
- `./bin/forgecad-rl-grade` has been run after the final meaningful edit.
- The required submission file contains no banned import/read/embed path.
- The model is recognizable against the reference from the main views.

---
name: forgecad-reconstruction-benchmark
description: Solve ForgeCAD CAD reconstruction benchmark or RL episodes in a prepared workspace by rebuilding a visible reference asset as readable parametric ForgeCAD in the fixed submission path, using visual and geometric self-checks while respecting sandbox limits.
forgecad-public: true
---

# ForgeCAD Reconstruction Benchmark

Benchmark adaptation of `forgecad-3d-reconstruction`: same reconstruction loop, but with a fixed submission path, a local CLI wrapper, sandbox limits, and a short wall-clock budget. This sheet owns only those deltas — follow `forgecad-3d-reconstruction` for the reconstruction craft.

## Workspace

Read first: `AGENTS.md`, `task/instructions.md`, this skill, and `agent-home/.agents/skills/forgecad/SKILL.md` (API + CLI reference).

- Reference asset (evidence only): `task/reference/*`
- Final answer: `submission/main.forge.js`, unless `task/task.json` overrides
- CLI: the local wrapper `./bin/forgecad`, never global commands
- Scratch renders/notes: `outputs/`
- Stay inside the prepared workspace.

```bash
./bin/forgecad run submission/main.forge.js
```

## Rules and Done Criteria

- Deliverable is readable parametric ForgeCAD source at the required submission path. A clean parametric approximation beats an unreadable mesh mimic.
- The final source must not call `Import.mesh`, `Import.step`, `importMesh`, `importStep`, `readFile`, `readFileSync`, or any equivalent asset-embedding trick, and must contain no `compareWith(...)`, external reference paths, base64 payloads, or debug probes.
- Sandbox: allowed local tools only — no web search, no broad home-directory access, no subagents, no remote services.
- Before exit: the run command above succeeds; visual/section evidence checked after the last meaningful edit; model recognizable against the reference from the main views.

## Budget Discipline

A runnable first candidate beats a perfect investigation with no model.

1. Run the starter submission once before editing so syntax/runtime problems surface early.
2. Inspect only the highest-value reference evidence: dimensions, volume, object count, one visual or sectional view. If a reference render/inspect command fails or stalls, continue from task instructions, filename, starter code, and mechanical inference — do not burn the budget retrying.
3. Write a short reconstruction brief in `outputs/brief.md` (fields per `forgecad-3d-reconstruction`).
4. Edit the submission early: coarse bbox, orientation, and main masses first, then iterate coarse-to-fine per `forgecad-3d-reconstruction`.
5. 3MF references: the `forgecad run` source-structure table is evidence — account for every substantial 3MF item in the reconstruction (the final model may be one part or many).
6. `inspect section` probes are replayable against the candidate via `inspect replay` — the cheap way to verify an exact local measurement transfers. Mechanics: `forgecad-render-inspect`.

## Pointers

- `forgecad-3d-reconstruction` — the evidence → brief → coarse → fine loop and metric diagnosis
- `forgecad-render-inspect` — inspection bundles, section probes, replay
- forgecad skill at `agent-home/.agents/skills/forgecad/` — API and CLI syntax
- `forgecad-make-a-model` — general quality patterns only; its date-based file-placement workflow does not apply in benchmark workspaces

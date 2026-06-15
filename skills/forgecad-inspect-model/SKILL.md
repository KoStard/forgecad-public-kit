---
name: forgecad-inspect-model
description: Select, run, and interpret ForgeCAD inspection evidence for collisions, sections, wall thickness, components, masks, depth, normals, surface continuity, and fit.
forgecad-public: true
---

# Inspect Model

Use `forgecad inspect ...` when a shaded render is too ambiguous and you need structured evidence: a bundle directory with evidence PNGs plus a root `manifest.json` (or, for `inspect section`, a probe directory with `result.json`, `section.svg`, `section.png`). Inspection is not a substitute artifact: look inside with sections, masks, `--focus`/`--hide`, and transparency — never edit the model into a cutaway or exploded default to make inspecting easier. Output dirs: let `inspect` allocate its timestamped directory by default (repeated probes never collide); use `/tmp/<model>-inspect` for throwaway bundles, a project directory only for persistent artifacts.

Routing: authoring/API questions → `forgecad` skill; creating a new model → `forgecad-build-model`.

## Workflow

1. **Identify the failure question.** What would make the model wrong: overlap, thin walls, hidden cavity failure, disconnected or accidentally fused bodies, floating parts, orientation artifacts, identity confusion?
2. **Confirm the model executes.** If in doubt, run `forgecad run model.forge.js` first; add `--debug-imports` for suspect imports.
3. **Pick ONE targeted evidence command** from the table below. `forgecad inspect evidence` lists everything available.
4. **Summarize the manifest first**, then use `jq` against `manifest.json` for targeted follow-up. The helper ships beside this SKILL.md — invoke it skill-dir-relative; it accepts the bundle directory or a `manifest.json` path:

   ```bash
   python <this-skill-dir>/summarize_manifest.py /tmp/model-inspect
   ```

5. **Inspect the PNGs, not only the JSON.** View identity/context images first, then the risk evidence's view, then orthogonal cameras (`front`, `right`, `top`) when iso hides the issue, sections only when internals matter. In automation, resolve file paths through the manifest — custom cameras break canonical filenames.
6. **Isolate intentional overlaps** with `--focus "A,B"` or `--hide "C"` so the remaining report stays meaningful.
7. **Treat findings as model bugs**: unexpected collisions, critical thin regions, high unresolved thickness area, wrong component counts, floating bodies, or surprising gaps mean fix the model and reinspect.
8. **Report honestly.** Include the exact command, bundle path, manifest highlights, and the PNG views actually inspected. Never claim geometry is verified if you only ran `forgecad run`.

## Evidence Selection

| Question | Evidence command |
|----------|------------------|
| Quick visual sanity | `inspect visual image` |
| Kinematic rig, joints, axes, and links | `inspect visual rig` |
| Object naming and identity | `inspect visual objects` |
| Exact local section measurement, bore widths, rib thickness through a chosen line | `inspect section --ray ...` |
| Hidden internals, cavities, pockets, screw paths, captured components | `inspect sections at\|stack\|sample` |
| Multi-part interference, fit checks, ghost parts, moving clearances | `inspect fit interference` |
| Printability, shell walls, ribs, bosses, snaps, slots | `inspect manufacture thickness` plus `inspect sections at\|stack\|sample` when internals matter |
| Parts without a mesh-contact path to the ground | `inspect physical floating` |
| Accidental fusion, connected solids | `inspect physical components` |
| Air gaps between physical components | `inspect physical gaps` |
| Surface orientation, occlusion, faceting, strange protrusions | `inspect visual depth` or `inspect visual normals` |
| Loft, fillet, skin, and sweep surface continuity | `inspect surface zebra` or `inspect visual normals` |
| Reference-vs-candidate reconstruction comparison | `inspect compare overlay --with reference.3mf` |

## Section Probe + Replay

The agent-native measure-then-recheck loop:

```bash
forgecad inspect section model.forge.js --plane yz --ray bore:-20,0:20,0
forgecad inspect replay outputs/inspect/<probe>/result.json --source candidate.forge.js
```

The probe's `result.json` field contract (frames, rulers, gaps, replaySpec) is documented in the forgecad skill's `docs/guides/inspection-bundles.md`.

## Misread Traps

- Face-touching is not a collision; collision findings are positive-volume overlaps.
- Gray/unresolved thickness area means the evidence is incomplete, not that the model is safe.
- Distance/gap figures are bbox-gap metrics between components, not closest-surface distances.
- Depth, normals, and zebra are visual aids (heatmap, camera-view normals, stripe shader), not exact measurements or curvature proofs.
- Resolve mask colors through the manifest's object list, never by object order.

## Reference

Bundle/manifest contract, evidence semantics, and current limits: the forgecad skill's `docs/guides/inspection-bundles.md`. CLI flags and command tree: its `docs/CLI.md`.

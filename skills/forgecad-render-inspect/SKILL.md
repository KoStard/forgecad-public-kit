---
name: forgecad-render-inspect
description: Run and interpret ForgeCAD `render inspect` bundles for model verification. Use when asked to inspect a ForgeCAD model, analyze an inspection bundle, validate collisions, wall thickness, connectivity, sections, masks, depth, normals, or choose inspection channels.
forgecad-public: true
---

# ForgeCAD Render Inspect

Use `forgecad render inspect` when a shaded viewport render is too ambiguous and you need structured evidence about a ForgeCAD model. The command writes a deterministic directory bundle containing channel PNGs plus a root `manifest.json`.

This skill owns the inspection workflow: choosing channels, generating the bundle, reading the manifest, visually inspecting the relevant PNGs, and turning the findings into model fixes or a verification report.

## Trigger Boundary

Use this skill for:

- inspecting an existing `.forge.js` model
- analyzing a previously generated inspection bundle
- validating collisions, wall thickness, section cuts, connectivity, distance, object masks, depth, or normals
- deciding which `render inspect` channels to run
- producing evidence before calling a model complete

Routing:

| Need | Skill |
|------|-------|
| Learn or use ForgeCAD APIs while authoring geometry | `forgecad` |
| Create a new model in the personal model repo | `forgecad-make-a-model` |
| Run and interpret inspection bundles | `forgecad-render-inspect` |
| Debug the `render inspect` command implementation itself | `forgecad` plus this skill's source map |

## Workflow

1. Identify the inspection question.
   Decide what would make the model wrong: unexpected overlap, too-thin walls, missing parts, hidden cavity failure, disconnected bodies, unintentionally fused bodies, orientation artifacts, or object identity confusion.

2. Choose a scratch output directory.
   Use `/tmp/<model-name>-inspect` by default so generated PNGs do not dirty the repo. Use a project output directory only when the user wants a persistent artifact.

3. Pick the channel set.
   Use the table below. Prefer small targeted channel sets; broad stress checks should still list explicit channels.

4. Run the command.
   In the ForgeCAD repo, prefer the built CLI when you want the current checkout:

   ```bash
   node dist-cli/forgecad.js render inspect model.forge.js /tmp/model-inspect --channels rgb,mask,collisions --force --size 700
   ```

   Outside the ForgeCAD repo, use the installed CLI:

   ```bash
   forgecad render inspect model.forge.js /tmp/model-inspect --channels rgb,mask,collisions --force --size 700
   ```

   If the model may not execute, run `forgecad run model.forge.js` first. If imports are suspect, add `--debug-imports` to the run command.

5. Summarize the manifest.
   Run the bundled helper:

   ```bash
   python skills/forgecad-render-inspect/summarize_manifest.py /tmp/model-inspect
   ```

   Use `jq` for targeted follow-up when needed:

   ```bash
   jq '.channels.collisions | {collisionCount, collisions, warnings}' /tmp/model-inspect/manifest.json
   jq '.channels.thickness.objects[] | {name, minThickness, p05Thickness, criticalAreaPercent, warningAreaPercent, unresolvedAreaPercent}' /tmp/model-inspect/manifest.json
   jq '.channels.connectivity | {componentCount, edges, warnings}' /tmp/model-inspect/manifest.json
   ```

6. Inspect the PNGs, not only the JSON.
   Always look at `channels/rgb/iso.png` when present, then inspect the channel and views that match the risk. Use the manifest paths instead of assuming layout when writing automation.

7. Decide whether findings are bugs.
   Treat unexpected collision findings, critical thin regions, high unresolved thickness, missing sections, wrong object names, wrong component count, or surprising distance gaps as model bugs. If an overlap is intentional, isolate the check with `--focus` or `--hide` so the remaining report is meaningful.

8. Report evidence.
   Include the exact command, bundle path, channels emitted, manifest highlights, PNG views inspected, and any residual limits. Do not say the geometry is verified if you only ran `forgecad run`.

## Channel Selection

| Question | Channels |
|----------|----------|
| Quick orientation and object naming | `rgb,mask` |
| Hidden internals, cavities, pockets, screw paths, captured components | `rgb,mask,section` |
| Multi-part interference, fit checks, ghost parts, moving clearances | `rgb,mask,collisions` |
| Final multi-part mechanical or manufactured model | `rgb,mask,collisions` plus `section`, `thickness`, `connectivity`, or `distance` only when those risks apply |
| Printability, shell walls, ribs, bosses, snaps, slots | `rgb,section,thickness` |
| Floating parts, accidental fusion, connected solids | `rgb,mask,connectivity` |
| Air gaps between physical components | `rgb,mask,distance` |
| Surface orientation, occlusion, faceting, strange protrusions | `rgb,depth,normals` |

## Command Patterns

Explicit fast bundle:

```bash
forgecad render inspect model.forge.js /tmp/model-inspect --channels rgb,mask,section --force --size 700
```

Final fit/interference check:

```bash
forgecad render inspect model.forge.js /tmp/model-inspect --channels rgb,mask,collisions --force --size 700
```

Collision-focused isolation:

```bash
forgecad render inspect model.forge.js /tmp/model-fit --channels rgb,mask,collisions --focus "Bracket,Screw Ghost" --force
```

Thickness check with process-aware thresholds:

```bash
forgecad render inspect model.forge.js /tmp/model-thickness --channels rgb,section,thickness --min-thickness 1.6 --warn-thickness 2.4 --force
```

Hide known clutter or mock geometry:

```bash
forgecad render inspect model.forge.js /tmp/model-inspect --channels rgb,mask,collisions --hide "Fixture Ghost,Debug Envelope" --force
```

Use bare `--focus` to hide mock objects while keeping real scene objects:

```bash
forgecad render inspect model.forge.js /tmp/model-real --focus --channels rgb,mask,collisions --force
```

## Reading Results

Manifest fields to check first:

- `bundle.channelsRequested` and `bundle.channelsEmitted`: confirm you inspected what you intended.
- `bundle.filters`: confirm focus/hide did not accidentally exclude relevant geometry.
- `scene.bbox` and `scene.volume`: catch absurd scale, missing geometry, or bad units.
- `scene.objects`: confirm expected part names and mock flags.
- `channels.mask.objects`: map object colors to names; do not rely on object order alone.
- `channels.collisions.collisionCount`: investigate every unexpected positive-volume overlap.
- `channels.thickness.objects`: inspect `minThickness`, `p05Thickness`, critical/warning percentages, and unresolved area.
- `channels.connectivity.componentCount`: compare to the expected number of physical components.
- `channels.distance.maxRootDistance` and per-object `nearestGap`: check suspicious isolation or spacing.
- `channels.section.planes`: look for missing slices, wrong path counts, or empty internal cuts.

PNG review order:

1. `rgb/iso.png` for human shape sanity.
2. `mask/iso.png` and one orthogonal mask view for object identity.
3. The risk channel's `iso.png`.
4. Orthogonal views (`front`, `right`, `top`) when the iso view hides the issue.
5. Section slices around the suspected feature when internals matter.

## Interpretation Rules

- Collision findings are positive-volume boolean overlaps. Face-touching is not a collision.
- Connectivity is a fast bbox-neighborhood component graph. Concave shapes can over-connect through bounding boxes; use the collisions channel for exact overlap evidence.
- Distance is a bbox-gap metric between physical components, not exact closest surface distance.
- Thickness is a mesh/raycast approximation. Gray or high unresolved area means the visual heatmap is incomplete, not that the model is safe.
- Depth is a visual heatmap, not raw floating-point depth data.
- Normals are camera-view normals, not world-space normals.
- Mask colors are stable within a bundle and resolved through the manifest.

## Source Map

Read these only when needed:

| Need | Source |
|------|--------|
| Bundle contract and channel semantics | `docs/permanent/guides/inspection-bundles.md` |
| CLI reference and options | `docs/permanent/CLI.md` |
| CLI parser, bundle writer, manifest generation | `cli/forge-render.mjs` |
| Browser-side channel rendering | `cli/render.ts` |
| Collision semantics | `cli/collision-inspection.ts` |
| Thickness semantics | `cli/thickness-inspection.ts` |
| Connectivity and distance semantics | `cli/physical-connectivity.ts` and `cli/distance-inspection.ts` |

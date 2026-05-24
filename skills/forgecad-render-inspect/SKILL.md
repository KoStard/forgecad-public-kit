---
name: forgecad-render-inspect
description: Run and interpret ForgeCAD inspection bundles for model verification. Use when asked to inspect a ForgeCAD model, analyze an inspection bundle, validate collisions, wall thickness, connectivity, floating bodies, sections, masks, depth, normals, or Zebra stripes.
forgecad-public: true
---

# ForgeCAD Render Inspect

Use `forgecad inspect <evidence>` when a shaded viewport render is too ambiguous and you need structured evidence about a ForgeCAD model. The command writes a deterministic directory bundle containing evidence PNGs plus a root `manifest.json`.

This skill owns the inspection workflow: choosing evidence, generating the bundle, reading the manifest, visually inspecting the relevant PNGs, and turning the findings into model fixes or a verification report.

Inspection is not a substitute artifact. Use sections, object masks, transparency, focus, and hide controls to look inside a real model; do not edit the model into a cutaway or exploded default just to make the inspection easier.

## Trigger Boundary

Use this skill for:

- inspecting an existing `.forge.js` model
- analyzing a previously generated inspection bundle
- validating collisions, wall thickness, section cuts, connectivity, floating bodies, distance, object masks, depth, normals, or Zebra stripes
- deciding which inspection evidence to run
- producing evidence before calling a model complete

Routing:

| Need | Skill |
|------|-------|
| Learn or use ForgeCAD APIs while authoring geometry | `forgecad` |
| Create a new model in the personal model repo | `forgecad-make-a-model` |
| Run and interpret inspection bundles | `forgecad-render-inspect` |
| Debug the inspection command implementation itself | `forgecad` plus this skill's source map |

## Workflow

1. Identify the inspection question.
   Decide what would make the model wrong: unexpected overlap, too-thin walls, missing parts, hidden cavity failure, disconnected bodies, unintentionally fused bodies, orientation artifacts, or object identity confusion.

2. Choose a scratch output directory.
   Use `/tmp/<model-name>-inspect` by default so generated PNGs do not dirty the repo. Use a project output directory only when the user wants a persistent artifact.

3. Pick the evidence.
   Prefer one targeted evidence command at a time. Use `forgecad inspect evidence`
   to list the available commands.

4. Run the command.
   In the ForgeCAD repo, prefer the built CLI when you want the current checkout:

   ```bash
   node dist-cli/forgecad.js inspect collisions model.forge.js /tmp/model-collisions-inspect --camera iso --force --size 700
   ```

   Outside the ForgeCAD repo, use the installed CLI:

   ```bash
   forgecad inspect collisions model.forge.js /tmp/model-collisions-inspect --camera iso --force --size 700
   ```

   If the model may not execute, run `forgecad run model.forge.js` first. If imports are suspect, add `--debug-imports` to the run command.

5. Summarize the manifest.
   Run the bundled helper:

   ```bash
   python skills/forgecad-render-inspect/summarize_manifest.py /tmp/model-inspect
   ```

   Use `jq` for targeted follow-up when needed:

   ```bash
   jq '.evidence.collisions | {collisionCount, collisions, warnings}' /tmp/model-inspect/manifest.json
   jq '.evidence.thickness.objects[] | {name, minThickness, p05Thickness, criticalAreaPercent, warningAreaPercent, unresolvedAreaPercent}' /tmp/model-inspect/manifest.json
   jq '.evidence.connectivity | {componentCount, edges, warnings}' /tmp/model-inspect/manifest.json
   jq '.evidence.floating | {floatingBodyCount, floatingObjectCount, warnings}' /tmp/model-inspect/manifest.json
   ```

6. Inspect the PNGs, not only the JSON.
   Always look at the view PNGs that match the risk. Use the manifest paths instead of assuming layout when writing automation; custom cameras may not use canonical filenames.

7. Decide whether findings are bugs.
   Treat unexpected collision findings, critical thin regions, high unresolved thickness, missing sections, wrong object names, wrong component count, or surprising distance gaps as model bugs. If an overlap is intentional, isolate the check with `--focus` or `--hide` so the remaining report is meaningful.

8. Report evidence.
   Include the exact command, bundle path, evidence emitted, manifest highlights, PNG views inspected, and any residual limits. Do not say the geometry is verified if you only ran `forgecad run`.

## Evidence Selection

| Question | Evidence command |
|----------|------------------|
| Quick visual sanity | `inspect image` |
| Object naming and identity | `inspect objects` |
| Hidden internals, cavities, pockets, screw paths, captured components | `inspect sections` |
| Multi-part interference, fit checks, ghost parts, moving clearances | `inspect collisions` |
| Printability, shell walls, ribs, bosses, snaps, slots | `inspect thickness` plus `inspect sections` when internals matter |
| Parts without a mesh-contact path to the ground | `inspect floating` |
| Accidental fusion, connected solids | `inspect connectivity` |
| Air gaps between physical components | `inspect distance` |
| Surface orientation, occlusion, faceting, strange protrusions | `inspect depth` or `inspect normals` |
| Loft, fillet, skin, and sweep surface continuity | `inspect zebra` or `inspect normals` |
| Reference-vs-candidate reconstruction comparison | `inspect comparison --with reference.3mf` |

## Command Patterns

Explicit fast bundle:

```bash
forgecad inspect objects model.forge.js /tmp/model-objects-inspect --camera iso --force --size 700
forgecad inspect sections model.forge.js /tmp/model-sections-inspect --force --size 700
```

Reference-vs-candidate comparison bundle:

```bash
forgecad inspect comparison candidate.forge.js /tmp/candidate-compare --with reference.3mf --compare-samples 3000 --force --size 700
```

Final fit/interference check:

```bash
forgecad inspect collisions model.forge.js /tmp/model-collisions-inspect --camera iso --force --size 700
```

Collision-focused isolation:

```bash
forgecad inspect collisions model.forge.js /tmp/model-fit --focus "Bracket,Screw Ghost" --camera iso --force
```

Thickness check with process-aware thresholds:

```bash
forgecad inspect thickness model.forge.js /tmp/model-thickness --min 1.6 --warn 2.4 --camera iso --force
```

Hide known clutter or mock geometry:

```bash
forgecad inspect collisions model.forge.js /tmp/model-collisions-inspect --hide "Fixture Ghost,Debug Envelope" --camera iso --force
```

Use bare `--focus` to hide mock objects while keeping real scene objects:

```bash
forgecad inspect collisions model.forge.js /tmp/model-real-collisions --focus --camera iso --force
```

## Reading Results

Manifest fields to check first:

- `bundle.evidenceRequested` / `bundle.evidenceEmitted`: confirm you inspected what you intended.
- `bundle.filters`: confirm focus/hide did not accidentally exclude relevant geometry.
- `scene.bbox` and `scene.volume`: catch absurd scale, missing geometry, or bad units.
- `scene.objects`: confirm expected part names and mock flags.
- `evidence.objects.objects`: map object colors to names; do not rely on object order alone.
- `evidence.collisions.collisionCount`: investigate every unexpected positive-volume overlap.
- `evidence.thickness.objects`: inspect `minThickness`, `p05Thickness`, critical/warning percentages, and unresolved area.
- `evidence.connectivity.componentCount`: compare to the expected number of physical components.
- `evidence.floating.floatingBodyCount`: investigate every body without a mesh-contact path to the ground plane, especially body entries from one unioned object.
- `evidence.distance.maxRootDistance` and per-object `nearestGap`: check suspicious isolation or spacing.
- `evidence.sections.planes`: look for missing slices, wrong path counts, or empty internal cuts. These are inspection views, not instructions to section the returned production geometry.

PNG review order:

1. Image evidence for human shape sanity when needed.
2. Object evidence and one orthogonal object view for identity when needed.
3. The risk evidence's chosen view.
4. Orthogonal cameras (`front`, `right`, `top`) when the iso view hides the issue.
5. Section slices around the suspected feature when internals matter.

## Interpretation Rules

- Collision findings are positive-volume boolean overlaps. Face-touching is not a collision.
- Connectivity uses bbox as a broadphase, then shared physical-contact detection for component grouping: mesh surfaces within contact tolerance count as connected, exact positive-volume overlap is used when needed, and bbox-only contact does not merge separate scene objects by default. Use collisions evidence for positive-volume overlap defects.
- Floating uses the same shared physical-contact detection plus scene-ground reachability. Mesh gaps within contact tolerance count as connected, bbox overlap or bbox face contact alone does not, and every component without a contact path to ground is reported. Disconnected mesh islands inside one object are inspected separately.
- Distance is a bbox-gap metric between physical components, not exact closest surface distance.
- Thickness is a contact-aware mesh/raycast approximation. It uses the same physical-contact edges as connectivity/floating, so rays jump over direct-neighbor contact seams within contact tolerance before measuring the next surface. Gray or high unresolved area means the visual heatmap is incomplete, not that the model is safe.
- Depth is a visual heatmap, not raw floating-point depth data.
- Normals are camera-view normals, not world-space normals.
- Zebra is a reflective stripe shader for visual continuity inspection, not an exact curvature-continuity proof.
- Mask colors are stable within a bundle and resolved through the manifest.

## Source Map

Read these only when needed:

| Need | Source |
|------|--------|
| Bundle contract and evidence semantics | `docs/permanent/guides/inspection-bundles.md` |
| CLI reference and options | `docs/permanent/CLI.md` |
| CLI parser, bundle writer, manifest generation | `cli/forge-render.mjs` |
| Browser-side evidence rendering | `cli/render.ts` |
| Collision semantics | `cli/collision-inspection.ts` |
| Thickness semantics | `cli/thickness-inspection.ts` |
| Connectivity, floating, and distance semantics | `cli/physical-connectivity.ts`, `cli/floating-inspection.ts`, and `cli/distance-inspection.ts` |

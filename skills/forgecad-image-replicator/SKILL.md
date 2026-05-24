---
name: forgecad-image-replicator
description: Build real ForgeCAD geometry from one or more reference images by treating images as evidence, inferring the object, then validating against both reference-matched and canonical views.
forgecad-public: true
---

# ForgeCAD Image Replicator

Use this skill when the user provides one or more images and wants a ForgeCAD model of the object shown.

The reference image is evidence. It is not the deliverable.

The deliverable is a real parametric object that remains believable from front, back, side, top, bottom, and reference camera views. A model that matches one image but falls apart from other angles has failed, even if the comparison board looks close.

If a reference image is cutaway, sectioned, exploded, partly hidden, or transparent, treat that as evidence about the complete object. Do not make the default ForgeCAD result a permanently cutaway or exploded display unless the user explicitly asked for a teaching/display model. Build the closed artifact first, then use ForgeCAD viewer/inspection tools to recreate explanatory views.

## Required Companion Skills

- Use `forgecad` for API docs, model authoring, and renderer behavior.
- Use `forgecad-prepare-prompt` when the image does not fully determine the artifact family, process posture, scale, operating story, or validation boundary.
- Use `forgecad-make-a-model` for file placement, decomposition, parametric modeling, and definition of done.
- Use `forgecad-render-inspect` before final delivery when the object has multiple parts, internal geometry, mechanisms, thin walls, or fit-sensitive features.

## Core Rule

Infer the real object before matching the camera.

Do not begin by chasing pixels, silhouettes, or the prettiest view. First form a 3D object hypothesis: what the artifact is, how it is made, what hidden sides must contain, what scale it likely has, and what geometry must exist for it to be physically coherent.

Reference matching is a validation step after the object exists.

## Workflow

1. Save the references.
   Put all provided images in `/tmp/<slug>-replicate/refs`. Keep the original filenames. If there are multiple views, add clear view names when possible: `front`, `side`, `rear-iso`, `top`, `detail`, and so on.

2. Read the images as evidence.
   For each image, record:
   - visible facts: silhouette, view direction, visible faces, major masses, feature counts, color and material boundaries, seams, holes, fasteners, labels, repeated spacing
   - scale cues: hands, hardware, wheels, ports, boards, screws, wall thickness, known product proportions
   - camera cues: perspective strength, parallel edges, lens distortion, crop, object center, likely elevation and azimuth
   - unknowns: hidden sides, occluded parts, ambiguous thickness, missing rear or underside geometry
   - conflicts: details that disagree across images or appear stylized, distorted, cropped, or shadow-hidden

3. Write a Real Object Brief.
   This is a hard gate before modeling. Include:
   - artifact identity and family
   - likely purpose or operating story
   - assumed scale and units
   - manufacturing/process posture and material cues
   - part and BOM boundary: what is modeled as real geometry, purchased hardware, ghost geometry, or omitted context
   - visible facts from the reference set
   - inferred hidden-side geometry
   - expected canonical front, back, left, right, top, and bottom forms
   - required internal, interface, or fit geometry
   - validation views and inspection evidence

4. Choose the modeling structure.
   Use a multi-file `main.forge.js` project when the object has distinct parts, repeated feature families, internals, purchased hardware, variants, or meaningful manufacturing assumptions. Put renderable/importable parts and sub-assemblies in neighboring `.forge.js` files; keep only pure dimensions, materials, math helpers, and lookup tables in plain `.js` files.

5. Build a coarse 3D blockout.
   Model the object, not the image. Start with the large volumes, axes, symmetry, side depth, rear form, underside, and hidden continuations. Render canonical views before doing reference-camera comparison.

6. Calibrate one camera per usable reference.
   Match camera after the blockout makes sense from canonical views. Use the object center as `target`. Estimate azimuth, elevation, distance, and FOV from visible faces and perspective cues. Use orthographic when parallel edges stay parallel and there is no visible perspective convergence.

7. Render comparison boards.
   Render the model from each calibrated reference camera and place the result next to the original image. Do not compare from memory.

8. Iterate in the right order.
   Change one class of thing at a time:
   - object hypothesis: identity, scale, symmetry, hidden-side assumptions, process logic
   - major proportions: width, depth, height, taper, curvature, radius families
   - canonical geometry: rear, underside, side depth, internal clearances, part interfaces
   - camera: azimuth, elevation, target, distance, FOV, orthographic zoom
   - details: holes, seams, fasteners, labels, vents, edge treatments, small hardware
   - presentation: colors, materials, lighting, background, edge style

   If improving one reference view makes another view or canonical render worse, the object hypothesis is probably wrong. Fix the model, not the camera illusion.

9. Use every image as a constraint.
   When multiple images are attached, do not choose one as the target and ignore the rest. Assign each image a camera, evidence list, and confidence level. Optimize one shared geometry against the whole set. If an image is decorative, distorted, or contradictory, state how it was weighted.

10. Inspect the final object.
   Run `forgecad run`, render the reference comparison boards, render canonical views, and use targeted `forgecad inspect <evidence>` commands. For multi-part, mechanical, internal, or fit-sensitive models, include `inspect collisions` and `inspect sections`, but keep the delivered model as the complete closed artifact.

## Renderer Camera Support

ForgeCAD `render 3d` supports explicit camera control:

```bash
forgecad render 3d model.forge.js /tmp/render.png \
  --camera "proj=perspective;pos=200,-160,120;target=0,0,20;up=0,0,1;fov=38" \
  --size 1000
```

Supported camera forms:

- `--camera front`, `top`, `side`, `right`, `iso`
- `--camera 45:25` for azimuth/elevation in degrees
- `--camera 45:25:260` for azimuth/elevation/distance
- `--camera "proj=perspective;pos=x,y,z;target=x,y,z;up=0,0,1;fov=42"`
- `--camera "proj=orthographic;pos=x,y,z;target=x,y,z;up=0,0,1;zoom=4"`

If exact full camera specs do not render in the current checkout, fix the renderer before continuing. Do not work around missing camera control by guessing from default `iso` renders.

## Rendering And Comparison

Prefer the built CLI from the repo checkout when available:

```bash
node dist-cli/forgecad.js render 3d path/to/model.forge.js /tmp/<slug>-replicate/render-front.png \
  --camera "proj=perspective;pos=200,-160,120;target=0,0,20;up=0,0,1;fov=38" \
  --size 1000 --edges thin
```

Build side-by-side boards with the bundled helper:

```bash
node skills/forgecad-image-replicator/scripts/compare_images.mjs \
  /tmp/<slug>-replicate/refs/front.png \
  /tmp/<slug>-replicate/render-front.png \
  /tmp/<slug>-replicate/compare-front.png \
  --height 900 --labels "Reference,ForgeCAD"
```

Common helper options:

```bash
node skills/forgecad-image-replicator/scripts/compare_images.mjs ref.png render.png compare.png
node skills/forgecad-image-replicator/scripts/compare_images.mjs ref.jpg render.png compare.png --height 1200 --fit contain
node skills/forgecad-image-replicator/scripts/compare_images.mjs ref.png render.png compare.png --fit cover --labels "Target,Current"
node skills/forgecad-image-replicator/scripts/compare_images.mjs ref.png render.png compare.png --no-labels
```

Use `--fit contain` by default. Use `--fit cover` only when both images already share the same crop and aspect.

## Acceptance Standard

A successful result:

- has a written Real Object Brief
- has parametric ForgeCAD geometry, not a billboard, facade, pasted texture, or one-view shell
- makes sense from canonical views before reference matching
- matches each usable reference image as closely as the evidence allows
- includes honest hidden-side assumptions where the images are silent
- includes internal, interface, purchased, or hardware geometry when the artifact calls for it
- passes `forgecad run`
- includes final reference comparison boards and canonical renders
- includes inspection results for the risk evidence that matters

A result fails if it only works from the original camera.

## Output Contract

When finished, report:

- model file path
- reference images used
- Real Object Brief summary
- hidden-side and scale assumptions
- final camera spec for each reference image
- comparison board path for each usable reference image
- canonical render paths
- inspection bundle path, when used
- validation commands run
- remaining mismatches, unknowns, or downgraded confidence

For non-trivial references, expect several render, compare, canonical-view, and inspect iterations. One render is not enough.

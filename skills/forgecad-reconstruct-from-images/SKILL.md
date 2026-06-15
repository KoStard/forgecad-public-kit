---
name: forgecad-reconstruct-from-images
description: Reconstruct a real parametric ForgeCAD object from reference images by using images as evidence, not as a one-view facade.
forgecad-public: true
---

# Reconstruct From Images

The reference image is evidence, not the deliverable. The deliverable is a real parametric object that holds up from front, back, side, top, bottom, and reference camera views — a model that matches one image but falls apart from other angles has failed, even if the comparison board looks close. Cutaway, sectioned, exploded, or transparent references are evidence about the complete object: build the closed artifact and recreate explanatory views with viewer/inspection tools (the main `forgecad` skill's closed-artifact rule applies).

## Companion Skills

- `forgecad` — API docs, model authoring, renderer behavior.
- `forgecad-design-spec` — when the images underdetermine artifact family, process posture, scale, operating story, or validation boundary.
- `forgecad-build-model` — file placement, project structure, decomposition, definition of done.
- `forgecad-inspect-model` — pre-delivery inspection for multi-part, internal, mechanical, thin-wall, or fit-sensitive objects.

## Core Rule

Infer the real object before matching any camera — identity, manufacture, scale, what hidden sides must contain, what geometry must exist for physical coherence. Reference matching is a validation step after the object exists; never start by chasing pixels or the prettiest view.

## Workflow

1. Stage references in `/tmp/<slug>-replicate/refs`, keeping originals and adding view names where possible (`front`, `side`, `rear-iso`, `top`, `detail`).
2. Read each image as evidence, recording: visible facts; scale cues; camera cues; unknowns (hidden/occluded geometry); conflicts across images or stylization.
3. Write a Real Object Brief — a hard gate before modeling: (a) artifact identity + operating story; (b) assumed scale and units; (c) process posture + part/BOM boundary (real geometry vs purchased vs ghost vs omitted); (d) inferred hidden-side geometry + expected canonical front/back/left/right/top/bottom forms; (e) validation views and inspection evidence. Use `forgecad-design-spec` when these are underdetermined.
4. Build a coarse 3D blockout — model the object, not the image: large volumes, axes, symmetry, side depth, rear form, underside, hidden continuations. Render canonical views before any reference-camera comparison. Follow `forgecad-build-model` for project structure.
5. Calibrate one camera per usable reference, only after the blockout makes sense from canonical views. Use the object center as `target`; estimate azimuth/elevation/distance/FOV from visible faces and perspective cues; use orthographic when parallel edges stay parallel with no perspective convergence.
6. Render comparison boards: render the model from each calibrated reference camera and place it next to the original. Never compare from memory.
7. Iterate one class of change at a time, in order: object hypothesis → major proportions → canonical geometry → camera → details → presentation. If improving one reference view makes another view or a canonical render worse, the object hypothesis is wrong — fix the model, not the camera illusion.
8. Use every image as a constraint. Never pick one target image and ignore the rest: assign each image a camera, evidence list, and confidence; optimize one shared geometry against the whole set; state how distorted or decorative images were weighted.
9. Validate the final object: `forgecad run`, reference comparison boards, canonical renders, and targeted inspections via `forgecad-inspect-model`.

## Comparison Boards

Render with exact `--camera` specs (see the forgecad CLI doc for supported forms). If exact full camera specs do not render, fix the renderer before continuing — never substitute guesses from default `iso` renders.

Build side-by-side boards with the bundled self-contained `uv` helper (installs Pillow on demand). Resolve `scripts/compare_images.py` relative to the installed `forgecad-reconstruct-from-images` skill directory:

```bash
uv run <skill-dir>/scripts/compare_images.py refs/front.png render-front.png compare-front.png
```

Use `--fit contain` (default); use `--fit cover` only when both images already share the same crop and aspect. Run with `--help` for other options.

## Done and Report

Done means: a written Real Object Brief; real parametric geometry (not a billboard, facade, or one-view shell) that makes sense from all canonical views; honest hidden-side assumptions where images are silent; passes `forgecad run`; comparison boards plus canonical renders exist. The result fails if it only works from the original camera — one render is never enough; expect several render/compare/inspect iterations.

Report: model path; Real Object Brief summary + assumptions; per-reference camera spec, weighting, and board path; canonical render paths; inspection evidence; remaining mismatches or downgraded confidence.

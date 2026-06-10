---
name: forgecad-blockout-model
description: Create rough high-level ForgeCAD concept models from simple primitives to explore layout, proportions, motion, and part relationships without production detail. Use when asked for a quick model sketch, blockout, spatial mockup, or intuitive low-detail 3D concept.
forgecad-public: true
---

# Block Out a Model

A blockout is a spatial planning artifact: 3-7 simple masses that answer where parts go, whether a mechanism makes spatial sense, and what the silhouette, footprint, or motion envelope looks like. Not for print-ready geometry, exact fit, tolerances, or detail work.

| Need | Skill |
|------|-------|
| High-level 3D idea using simple masses | `forgecad-blockout-model` |
| Written concept or architecture before CAD | `forgecad-high-level-spec` |
| Accurate, detailed, parametric ForgeCAD model | `forgecad-make-a-model` |

## Method

- Load the `forgecad` skill first; read its Core API and CLI docs. Load nothing else unless the concept demands it.
- Translate the idea into 3-7 conceptual parts BEFORE writing geometry: masses and zones (base, arm, payload, sweep volume, keep-out, hand access).
- One primitive stands in for many eventual details. A bounding box beats a fake detailed part. Never add detail as a substitute for clarity — simplify or reposition instead.
- Use round-number dimensions; "believably shaped" beats numerically correct. Name uncertainty honestly: `armLengthGuess`, `baseWidthApprox`, `clearanceEnvelope`.
- At most a handful of `param()` values, for comparing proportions. Do not parameterize every dimension.
- Color by meaning; keep each conceptual part visually distinct via color or opacity. Return named shape objects so the viewer can inspect the concept part-by-part.
- Ghost geometry: transparent volumes only for REAL physical envelopes — sweep arcs, keep-out volumes, approximate payloads, reach/access zones. Never decorative teaching overlays. Exaggerate tiny clearances when needed for readability.
- Even a blockout represents the object in its normal assembled state: no labels, legends, cutaways, or permanently exploded layouts (full rule in the `forgecad` skill).
- Leave out: fasteners and screw holes, wall thicknesses, fillets and blend radii, polished materials, hidden internal structure that does not affect the concept.

## Verify

Rendering is mandatory even for rough models. Run the script, then render from 2-3 angles with the installed `forgecad` CLI (syntax: the `forgecad` skill's CLI docs). Judge by the reader test:

- Can someone unfamiliar with the idea tell what each mass represents?
- Are proportions believable enough to discuss?
- Is motion or interference visible where it matters?
- Are unknowns shown honestly, not hidden behind fake detail?

If any answer is no, simplify or add clearer ghost volumes.

## Handoff

File placement and naming follow `forgecad-make-a-model` conventions; suffix the filename `-blockout` or `-concept` unless the user supplied a clearer name. Once the high-level questions are answered, stop. If the next question is real fit, tunable dimensions, part details, or manufacturing logic, switch to `forgecad-make-a-model` instead of refining the blockout indefinitely.

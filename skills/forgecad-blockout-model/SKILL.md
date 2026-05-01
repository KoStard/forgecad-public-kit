---
name: forgecad-blockout-model
description: Create rough high-level ForgeCAD concept models from simple primitives to explore layout, proportions, motion, and part relationships without production detail. Use when asked for a quick model sketch, blockout, spatial mockup, or intuitive low-detail 3D concept.
forgecad-public: true
---

# Block Out a Model

Create lightweight ForgeCAD concept models. These are communication artifacts: fast, legible, and intentionally approximate.

## Trigger Boundary

Use this skill when the user wants to answer questions like:

- Roughly where do the parts go?
- Does this mechanism idea make intuitive spatial sense?
- What is the silhouette, footprint, or motion envelope?
- Can we show the concept before spending time on detail?

Do **not** use this skill for:

- print-ready or fabrication-ready geometry
- exact fit, tight tolerances, or detailed dimensioning
- dense parametric modeling
- hardware details, fillets, chamfers, or finish work unless they are essential to the concept

Routing:

| Need | Skill |
|------|-------|
| High-level 3D idea using simple masses | `forgecad-blockout-model` |
| Written concept or architecture before CAD | `forgecad-high-level-spec` |
| Accurate, detailed, parametric ForgeCAD model | `forgecad-make-a-model` |

## File Placement

All new `.forge.js` files go under the date-based directory structure:

```text
YYYY/MM/DD/file.forge.js          - single-file blockout
YYYY/MM/DD/folder/file.forge.js   - multi-file concept project
```

Use today's date for the directory. Use the user's current ForgeCAD project when one is available; otherwise use a clearly named local model folder.

### Naming

- Use kebab-case
- Prefer names like `desk-lamp-blockout.forge.js` or `hinged-display-concept.forge.js`
- Add `-blockout` or `-concept` unless the user already supplied a clearer name

## Workflow

1. **Load the `forgecad` skill first** and read the Core API and CLI docs. Only load more documentation if the concept truly needs it.
2. **Translate the idea into 3-7 conceptual parts** before writing geometry. Think in terms of masses and zones: base, arm, payload, sweep volume, keep-out space, hand access, wheel envelope.
3. **Choose approximate dimensions** using round numbers and obvious proportions. Favor "believably shaped" over "numerically correct".
4. **Write the simplest geometry that communicates the idea**. Default to `box()`, `cylinder()`, `sphere()`, and very simple extrusions.
5. **Place parts with readable transforms**. Keep coordinates easy to inspect and edit. Prefer centered primitives when that reduces mental load.
6. **Color by meaning** so a viewer can decode the concept immediately.
7. **Render and inspect** from a few angles. If the idea is still unclear, simplify or reposition; do not add detail as a substitute for clarity.
8. **Stop early** once the mechanism, layout, or concept is understandable.

## Modeling Rules

- Use one primitive to stand in for many eventual details whenever possible.
- A bounding box is usually better than a fake detailed part.
- Use at most a handful of top-level `param()` values when comparing rough proportions. Do not parameterize every dimension.
- Name uncertainty honestly: `armLengthGuess`, `baseWidthApprox`, `screenVolume`, `clearanceEnvelope`.
- Use transparent ghost geometry for:
  - sweep arcs
  - keep-out volumes
  - approximate payloads
  - user reach or access space
- Exaggerate tiny clearances if needed to keep the concept readable.
- Keep each conceptual part visually distinct through color or opacity.
- Prefer arrays of named shapes in the return value so the viewer can inspect the concept part-by-part.

## What to Leave Out

Do not spend time on:

- screw holes
- exact wall thicknesses
- blend radii
- polished materials
- hidden internal structure that does not affect the concept
- mathematical precision that the concept does not justify

If you notice yourself reaching for detailed constraints, pause and ask whether the blockout should instead hand off to `forgecad-make-a-model`.

## Render-Verify Loop

Even rough models must be rendered. The whole point is spatial intuition.

### Minimum check

```bash
forgecad run model.forge.js
node dist-cli/forgecad.js render model.forge.js /tmp/blockout.png --camera 45:25 --camera 0:0 --camera 90:0 --size 600
```

Inspect the render and ask:

- Can someone unfamiliar with the idea tell what each mass represents?
- Are the overall proportions believable enough to discuss?
- Is motion or interference visible where it matters?
- Are unknowns shown honestly, rather than hidden behind fake detail?

If the answer is no, simplify the model or add clearer ghost volumes.

## Useful Pattern

```js
// Concept only:
// - dimensions are approximate
// - red transparent geometry shows motion / keep-out

const base = box(160, 90, 30).placeReference('center', [0, 0, 0]).color('#4c6ef5');
const arm = box(22, 22, 180).placeReference('center', [0, 0, 105]).color('#f08c00');
const payload = box(120, 18, 70).placeReference('center', [0, 0, 210]).color('#2b8a3e');

const sweep = cylinder(12, 110, 110, 48).placeReference('center', [0, 0, 0])
  .rotateY(90)
  .translate(0, 0, 120)
  .color('#e03131')
  .material({ opacity: 0.18 });

return [
  { name: 'Base', shape: base },
  { name: 'Arm', shape: arm },
  { name: 'Payload Volume', shape: payload },
  { name: 'Sweep Envelope', shape: sweep },
];
```

## Handoff Rule

When the blockout has answered the high-level questions, stop. If the next question is about real fit, tunable dimensions, part details, or manufacturing logic, switch to `forgecad-make-a-model` rather than refining the blockout indefinitely.

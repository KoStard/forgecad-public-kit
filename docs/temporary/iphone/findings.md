# iPhone CAD Exercise — Findings

## Goal

Build a parametric iPhone model to stress-test ForgeCAD's capabilities and identify the gaps between what we have and what Fusion360 offers.

## What Worked

The basic workflow is solid:
- `roundedRect()` → `extrude()` gives a clean phone body
- `circle2d()` for camera lenses, `cylinder()` for speaker holes
- `roundedRect().extrude().rotate()` for charging port and buttons
- `param()` sliders make everything parametric instantly
- Boolean subtract for cutouts, union for additive features
- Multi-step assembly reads naturally as code

The script is ~100 lines and produces a recognizable iPhone with:
- Rounded-corner body
- Screen cutout (front face recess)
- Camera island with 3 lenses (back, top-left)
- Charging port (bottom edge)
- Speaker grille (6 holes, bottom-right)
- Mic holes (bottom-left)
- Volume up/down buttons (left side)
- Action button (left side)
- Power button (right side)

## Bottleneck #1: 3D Edge Rounding

The biggest gap. When you extrude a 2D profile, the top and bottom edges are sharp 90° angles. A real iPhone has smooth rounded edges along the depth profile.

**Fusion360 approach**: Select edges → Fillet → set radius. Done.

**What we discovered**: Manifold has `smoothOut()` + `refine()` which marks edges for smooth interpolation and then subdivides the mesh. We exposed these on the `Shape` class:

```javascript
body = body.smoothOut(80, 0.5).refine(3);
```

- `smoothOut(minSharpAngle, minSmoothness)` — marks edges sharper than `minSharpAngle` degrees for smoothing. `minSmoothness` (0-1) controls how much rounding.
- `refine(n)` — subdivides each edge into n pieces, interpolating the smooth surface.

**Tradeoffs**:
- Works globally — you can't select specific edges to round (Fusion360 can)
- With high smoothness, the shape inflates (vertices move outward during interpolation)
- Order matters: smooth the body FIRST, then do boolean cuts (screen, ports, etc.)
- `refineToTolerance(tol)` is available for adaptive refinement

**What's still missing**: Per-edge fillet with exact radius control. The `filletEdge()` function in `fillets.ts` exists but only works on vertical edges with known topology. A general "fillet this edge by R mm" on arbitrary geometry is the holy grail — and it's genuinely hard with a mesh kernel. Manifold doesn't have native BREP fillets.

## Bottleneck #2: No Shell / Hollow Operation

Fusion360's "Shell" removes material from inside a solid, leaving walls of specified thickness, with selected faces open. Useful for enclosures, cases, etc.

We don't have this. You can approximate it:
```javascript
const outer = roundedRect(w, h, r, true).extrude(d);
const inner = roundedRect(w - 2*wall, h - 2*wall, r - wall, true).extrude(d - wall).translate(wall, wall, wall);
const shell = outer.subtract(inner);
```

But this is manual and doesn't handle complex shapes. A proper `shell(thickness, openFaces)` operation would be valuable.

**Feasibility**: Medium. For extruded profiles, you can offset the 2D sketch inward and subtract. For arbitrary shapes, you'd need to offset the mesh inward — Manifold doesn't have this natively, but you could approximate with SDF level sets.

## Bottleneck #3: 2D Sketch Fillets

When building the iPhone profile, we used `roundedRect()` which is a convenience function. But if you're building a custom profile with `path()`, there's no way to say "fillet this corner by 5mm."

**Fusion360 approach**: Draw lines → select corner → Fillet → radius.

**What we have**: The `offset()` trick works for uniform rounding:
```javascript
const sharp = rect(50, 30, true);
const rounded = sharp.offset(-r, 'Round').offset(r, 'Round');
```

But this rounds ALL corners equally. Per-corner fillet on arbitrary paths is missing.

**Feasibility**: High. This is a 2D geometry operation — insert a tangent arc between two line segments at a vertex. The math is straightforward (find tangent points, create arc). Could be added to `PathBuilder` as `.fillet(radius)` or as a post-processing step on `Sketch`.

## Bottleneck #4: Buttons Placement

Placing buttons on the side of the phone requires knowing the exact surface position after smoothing. Since `smoothOut` moves vertices, the buttons (placed at the original sharp-edge positions) end up slightly misaligned — they poke through or float.

**Fusion360 approach**: Sketch on face → Extrude from face. The sketch is parametrically attached to the face.

**What we'd need**: A way to project or attach geometry to a face of an existing shape. The `TrackedShape` system has face references, but there's no "sketch on face" operation yet.

## Engine Changes Made

Added to `Shape` class in `kernel.ts`:
- `smoothOut(minSharpAngle?, minSmoothness?)` — mark edges for smooth interpolation
- `refine(n)` — subdivide mesh with smooth interpolation
- `refineToLength(length)` — adaptive subdivision by edge length
- `refineToTolerance(tolerance)` — adaptive subdivision by surface tolerance
- `warp(fn)` — vertex warping function

These are thin wrappers over Manifold's existing API that weren't exposed before.

## Priority Ranking for Next Features

| Priority | Feature | Impact | Effort |
|----------|---------|--------|--------|
| 1 | 2D sketch fillet (per-corner arc insertion) | High — unlocks arbitrary rounded profiles | Medium |
| 2 | Shell operation | High — needed for any enclosure/case design | Medium |
| 3 | Sketch on face / project to face | High — proper feature placement | Hard |
| 4 | Per-edge 3D fillet with radius control | Very High — but genuinely hard with mesh kernel | Very Hard |
| 5 | Arc as first-class sketch entity | Medium — needed for proper constraint solving with arcs | Medium |
| 6 | Trim/extend operations | Medium — useful for complex sketch editing | Medium |

## Key Insight

ForgeCAD is NOT just a Manifold wrapper. The value layers are:
1. **Sketch system** with named entities, constraints, patterns
2. **Code-as-format** with live parametric UI
3. **Topology tracking** through extrusion
4. **Multi-file composition** (importSketch/importPart)

Manifold is the geometry kernel — like ACIS is to Fusion360 or OpenCascade is to FreeCAD. ForgeCAD is the parametric modeling environment built on top. The gap to close is in the sketch operations (fillets, arcs, trim) and 3D feature operations (shell, chamfer, sketch-on-face), not in the kernel itself.

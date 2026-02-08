# ForgeCAD: What an AI Needs to Design Complex Shapes

## The Problem I Just Hit

I tried to make an Iron Man helmet by subtracting boxes from scaled spheres. The result looked nothing like a helmet — and it couldn't, because the tools don't match the problem. It's like trying to paint a portrait using only a ruler and compass. You can approximate, but you'll never get the organic curves right.

This document explores what ForgeCAD would need so that an AI agent can iteratively design complex, organic, real-world shapes.

---

## Why It Failed: Root Causes

| Cause | What Happens | Example |
|-------|-------------|---------|
| **I'm blind** | I write geometry code with zero visual feedback. I can't see what I produced, so I can't correct it. | Eye slits ended up floating in space because I guessed the Y offset wrong |
| **Primitives are mechanical** | box, sphere, cylinder — these make machine parts, not organic surfaces. No amount of boolean ops on spheres will produce the compound curves of a helmet. | The "jaw" was a scaled sphere chunk — looks like a tumor, not a chin |
| **No profile interpolation** | Real CAD builds complex shapes by defining cross-sections and sweeping/lofting between them. ForgeCAD can extrude and revolve, but can't loft between different profiles. | I couldn't define "helmet shape at forehead" vs "helmet shape at jaw" and blend between them |
| **No smooth blending** | Boolean ops produce hard edges. Real helmets have smooth transitions between surfaces — fillets, chamfers, G2-continuous blends. | Where the chin meets the main shell = ugly hard seam |
| **No reference system** | I have no way to say "place this relative to the eye line" or "align to the face centerline at 30% height." Everything is absolute coordinates and guesswork. | Every `.translate()` was a blind guess |

---

## What I Want: Feature Wishlist

### Tier 1 — The Feedback Loop (Most Critical)

These aren't geometry features. They're about closing the loop so I can actually iterate.

| Feature | Description | Why It Matters |
|---------|-------------|----------------|
| **Screenshot/render capture** | After executing a script, capture a rendered image of the result that I can see. Multiple angles ideally. | Without this, I'm permanently blind. This single feature would 10x my ability to design. Everything else is secondary. |
| **Bounding box + dimensions readback** | Return the actual dimensions, center of mass, and bounding box of the result after execution. | Even without an image, knowing "your shape is 200mm wide but only 3mm tall" tells me something went catastrophically wrong. |
| **Named measurement points** | Let me define named points in the script (`mark("left_eye", x, y, z)`) and get their final world positions back. | I could verify "are the eyes actually where I think they are?" without seeing the render. |
| **Diff visualization** | When I change code, highlight what geometry changed (added volume in green, removed in red). | Speeds up iteration — I'd know if my tweak actually affected the right area. |

### Tier 2 — Organic Shape Primitives

The geometry tools needed to actually build curved, natural-looking forms.

| Feature | Description | Use Case |
|---------|-------------|----------|
| **`loft(profiles[], heights[])`** | Interpolate smoothly between 2D cross-sections at different Z heights. This is the single most important geometry feature for organic shapes. | Define helmet shape at crown, at eye level, at jaw, at chin — loft between them. Instantly gets you 80% of any organic form. |
| **`sweep(profile, path)`** | Extrude a 2D profile along a 3D curve (not just straight Z). | Curved ridges, tubes that follow paths, the raised brow line of the helmet. |
| **`smoothUnion(a, b, radius)`** | Boolean union with smooth blending at the intersection. SDF-style. | Where chin meets shell, where ridge meets dome — smooth transitions instead of hard edges. |
| **`fillet(shape, radius)` / `chamfer(shape, radius)`** | Round or bevel edges of an existing shape. | Every real manufactured object has filleted edges. Currently impossible. |
| **`bezierSurface(controlPoints)`** | Define a surface patch from a grid of control points. | For truly custom curved panels — the face plate, the cheek contours. |
| **Spline curves for 2D sketches** | `bezier(points[])` or `spline(points[])` in 2D, not just `polygon()`. | Smooth 2D profiles that can then be extruded/revolved/lofted. Currently all 2D shapes are polygonal. |

### Tier 3 — Design Intelligence

Higher-level features that make complex designs manageable.

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Symmetry mode** | `withSymmetry("X", () => { ... })` — design one half, auto-mirror. | Every helmet, face, enclosure is symmetric. Currently I manually mirror or duplicate. |
| **Named reference planes/axes** | Define planes like "eye_line", "center", "jaw_line" and position things relative to them. | Instead of `translate(0, -43.2, 17.5)` → `alignTo("eye_line", "center")`. Makes code readable AND makes it possible to reason about positioning. |
| **Assembly / sub-shape naming** | `const faceplate = group("faceplate", shape)` — name sub-components. | When debugging, I could ask "show me just the faceplate" or "what's the volume of the chin piece?" |
| **Constraint system** | `constrain(eyeL, "symmetric_to", eyeR, "across", centerPlane)` | Declarative positioning instead of manual coordinate math. Less error-prone, self-documenting. |
| **Shape templates / inheritance** | `const helmet = fromTemplate("head_form", { circumference: 580 })` — start from a known human head shape. | Many designs start from a standard form (head, hand, bottle). Starting from a sphere and guessing proportions is wasteful. |

### Tier 4 — AI-Specific Workflow

Features designed specifically for the AI-in-the-loop workflow.

| Feature | Description | Why |
|---------|-------------|-----|
| **Iterative refinement protocol** | Execute script → get render + measurements → AI proposes changes → re-execute. Built into the tool, not manual copy-paste. | The core loop. Currently broken because I can't see results. |
| **Semantic error messages** | Instead of "invalid geometry" → "the subtraction produced an empty shape because the cutter doesn't intersect the target. Cutter center: (50,0,0), target bounds: (-25,-25,-25) to (25,25,25)." | I waste iterations on geometry that silently fails or produces invisible results. |
| **Parameter sensitivity analysis** | "Changing 'Eye Width' from 28→30 moves 847 vertices, max displacement 2.3mm in the -Y direction." | Helps me understand which parameters actually matter and what they affect. |
| **Shape validation** | `validate(shape)` → reports: watertight? self-intersecting? thin walls? floating fragments? | Catch problems before I waste iterations on a broken base shape. |

---

## The Minimum Viable Upgrade

If I had to pick just 3 features that would make the biggest difference:

1. **Screenshot feedback** — I need to see what I made. Period. Without this, everything else is academic.
2. **Loft** — Interpolating between cross-sections is how you build 90% of organic shapes. This single primitive replaces dozens of hacky boolean operations.
3. **Smooth blending (smoothUnion)** — Hard boolean edges make everything look like a Minecraft build. Smooth blending is the difference between "prototype" and "designed."

With just these three, I could:
- Define the helmet as 5-6 cross-sections at different heights (loft)
- Blend the chin piece smoothly into the main shell (smoothUnion)
- See the result, adjust the cross-sections, iterate (screenshot)

That would get us from "looks nothing like a helmet" to "recognizably Iron Man" in maybe 3-4 iterations.

---

## Implementation Thoughts

### Screenshot Feedback
This is probably the easiest high-impact win. The Three.js viewport already renders the shape. Capturing it as an image and making it available to the AI agent (via file or base64) is mostly a plumbing problem, not a geometry problem.

Possible approach:
- After script execution, call `renderer.domElement.toDataURL()` 
- Save to a known path or return as part of the execution result
- Capture from 3-4 angles (front, side, top, perspective)

### Loft
This is harder. Manifold is a mesh boolean engine — it doesn't natively do lofts. Options:

| Approach | Pros | Cons |
|----------|------|------|
| **Triangulate between profiles manually** | Full control, no new deps | Complex to get right, especially with different vertex counts per profile |
| **Use OpenCascade (OCCT) via WASM** | Industry-standard NURBS kernel, has loft/sweep/fillet built in | Heavy dependency (~10MB WASM), different paradigm than Manifold |
| **SDF approach** | Smooth blending is natural, loft = interpolate distance fields | Need to mesh the SDF for rendering, quality/performance tradeoffs |
| **Approximate with stacked extrusions** | Works today with current API | Produces staircase artifacts, not smooth |

The pragmatic path might be: implement a simple linear loft by triangulating between profiles (handles 80% of cases), and later consider OCCT for the full NURBS experience.

### Smooth Blending
If going the SDF route, this comes for free. Otherwise, it's a post-processing step on the mesh (find sharp edges at boolean intersections, insert fillet geometry). Manifold doesn't support this natively, so it would need to be a custom mesh operation.

---

## What This Means for ForgeCAD's Identity

There's a tension here. ForgeCAD's strength is simplicity — ~500 lines, code-is-the-format, instant feedback. Adding NURBS surfaces and constraint solvers could turn it into a mini-FreeCAD, losing what makes it special.

The sweet spot might be:
- Keep the code-first, parametric philosophy
- Add loft + smooth blend as the organic shape escape hatch
- Invest heavily in the AI feedback loop (screenshots, measurements, validation)
- Let the AI handle complexity through iteration rather than requiring a massive API surface

The philosophy: **simple tools + fast iteration > complex tools + slow iteration**.

# Animal Models Investigation: Disconnected Pieces → Single Solids

## Goal
Fix all 10 animal toy models to be single connected pieces instead of clouds of floating primitives. Also capture: **why is this hard in ForgeCAD? What's missing?**

## Current State (Baseline)

Every animal model returns 11–33 separate named objects — individual spheres, cylinders, cones positioned near each other but never joined. They look roughly right in the viewer but:
- They're not printable as-is (separate meshes, gaps between parts)
- They don't behave as single objects (can't fillet, can't export as one STL)
- The "toy" quality is lost — wooden toys are carved from one piece

| Model | Objects | Approach |
|-------|---------|----------|
| teddy-bear | 17 | Spheres for body/head/limbs, separate belly/nose/eyes |
| rubber-duck | 11 | Spheres for body/head/chest, separate beak/eyes/wings |
| dinosaur | 21 | Spheres for body/head, cylinders for neck/tail/legs |
| elephant | 23 | Spheres for body/head, cylinders for trunk/legs/ears |
| giraffe | 33 | Spheres for body/head, cylinder for neck, many spots |
| penguin | 14 | Spheres for body/head, separate belly/flippers/feet |
| bunny | 21 | Spheres for body/head, cylinders for ears/legs |
| whale | 16 | Spheres for body/head, separate fins/tail/spout |
| turtle | 23 | Spheres for shell, separate legs/head/tail/spots |
| butterfly | 28 | Boxes for wings, cylinder for body, many spots |

## Root Cause Analysis

### Why is this hard?

**The fundamental tension: organic shapes vs CSG primitives.**

Standard B-rep CSG (`union()`, `difference()`) creates **hard-edged** joints between primitives. Union a sphere (head) to a sphere (body) and you get a visible seam — not the smooth organic blend an animal needs. So the agent chose the only other option: keep everything separate.

### What would make it super simple?

1. **SDF smooth booleans (ForgeCAD HAS this!)** — `sdf.smoothUnion(a, b, { radius: R })` blends primitives smoothly. This is the right tool but the agent didn't know about it. The animal body, head, limbs, and tail should be ONE SDF smooth-union chain that produces a single organic solid.

2. **What ForgeCAD is missing:**
   - **Per-region color on SDF shapes** — Once you `smoothUnion` everything into one mesh, it's one color. You can't paint the belly white and the back black. This forces you to keep detail shapes (belly patch, tuxedo front) as separate objects anyway. A "color zone" or "vertex coloring" API would let you paint regions of a single mesh.
   - **Metaball/implicit surface helpers** — Something like `sdf.skeleton([{pos, radius}, ...])` that auto-blends a chain of spheres at different radii along a path. Perfect for limbs, tails, necks. Currently you have to manually chain `smoothUnion` calls.
   - **SDF sweep along a curve** — `sdf.capsule` only does straight-line segments. A curved capsule (e.g., a tail, trunk, or neck) requires many small overlapping capsules.
   - **`sdf.scale(sx, sy, sz)` — non-uniform scale** — SDF only supports uniform `.scale(factor)`. Bodies need ellipsoids (`sphere` scaled non-uniformly). Currently impossible in SDF space; you'd need `sdf.ellipsoid(rx, ry, rz)`.

3. **The practical compromise:**
   - Main body structure → SDF `smoothUnion` chain → `.toShape()` → one solid
   - Color/detail features (eyes, nose, spots, belly patch) → small B-rep pieces placed on the surface
   - This gives 2–5 objects instead of 11–33, with the structural body as ONE connected piece

## Strategy

Rewrite each animal:
1. Build the body skeleton (torso, head, limbs, tail, ears) as SDF `smoothUnion`
2. Convert to Shape with `.toShape()`
3. Add detail features (eyes, nose, markings) as small B-rep pieces on the surface
4. Target: **max 5 objects per model** (body + up to 4 detail parts)

## Progress Tracker

| # | Model | Before (objects) | After (objects) | Body connected? | Build time | Status |
|---|-------|-------------------|-----------------|-----------------|------------|--------|
| — | Baseline | 11–33 | — | No | ~100ms | — |
| 1 | teddy-bear | 17 | 4 | Yes (level-set) | 3856ms | ✅ |
| 2 | rubber-duck | 11 | 3 | Yes (level-set) | 1628ms | ✅ |
| 3 | penguin | 14 | 4 | Yes (level-set) | 2056ms | ✅ |
| 4 | dinosaur | 21 | 3 | Yes (level-set) | 21418ms | ✅ |
| 5 | elephant | 23 | 2 | Yes (level-set) | 19483ms | ✅ |
| 6 | giraffe | 33 | 3 | Yes (level-set) | 33566ms | ✅ |
| 7 | bunny | 21 | 3 | Yes (level-set) | 16022ms | ✅ |
| 8 | whale | 16 | 4 | Yes (level-set) | 4100ms | ✅ |
| 9 | turtle | 23 | 3 | Yes (level-set) | 3411ms | ✅ |
| 10 | butterfly | 28 | 4 | Yes (level-set) | 627ms | ✅ |

**Average reduction: 19.4 objects → 3.3 objects (83% fewer). All bodies are single connected level-set meshes.**

## Experiment Log

#### SDF Smooth Union Rewrite (SUCCESS)
**What**: Replaced all 10 models. Each animal body is now built as an SDF `smoothUnion` chain — spheres for body/head, capsules for limbs, then `.toShape()` for a single mesh. Detail features (eyes, nose, belly patches) remain as small B-rep pieces on the surface.
**Result**: Object count dropped from 11–33 to 2–4 per model. Every body is a single connected `level-set` solid.
**Trade-off**: Build times increased significantly for complex chains (giraffe: 33s, dinosaur: 21s) because SDF evaluation + marching tetrahedra is O(resolution³). Simple bodies (duck, butterfly) stay fast.
**Lesson**: SDF `smoothUnion` is the right tool for organic toy shapes. The performance hit is acceptable for final output but the `edgeLength` parameter should be kept at 0.6–0.8 (not finer) to avoid multi-minute builds.

#### Non-uniform Scale Limitation (WORKAROUND)
**What**: SDF `.scale()` only accepts a uniform factor. Animal bodies need ellipsoids (flattened spheres for ear flaps, wing bumps, etc.).
**Workaround**: Used many small overlapping spheres with uniform scale instead of one non-uniformly scaled sphere. More verbose but works.
**Lesson**: `sdf.ellipsoid(rx, ry, rz)` would eliminate ~30% of the `smoothUnion` chains in these models.

#### Curved Limb Limitation (WORKAROUND)
**What**: Trunks, tails, and necks are curved. `sdf.capsule()` only does straight segments.
**Workaround**: Placed chains of 3–5 overlapping SDF spheres along the curve path and smooth-unioned them together.
**Lesson**: An `sdf.curvedCapsule(points, radius)` or `sdf.skeleton()` primitive would cut each neck/tail/trunk from 5 smoothUnion calls to 1.

## Files Modified

| File | Purpose |
|------|---------|
| `03-animals/*.forge.js` | All 10 animal models rewritten |

# SDF API — Signed Distance Field Modeling for ForgeCAD

**Goal**: Add a user-facing `sdf` namespace that exposes SDF primitives, smooth booleans, TPMS lattices, and domain warps — operations impossible or impractical in B-rep.

**Status**: Implemented and merged.

---

## Research: SDF Landscape

### Open source
- **libfive** (C++) — Matt Keeter's F-rep kernel with dual contouring. The original.
- **Fidget** (Rust, 2025) — Keeter's successor. JIT-compiled SDF evaluation with SIMD, 31x faster than interpreted. State of the art for CPU evaluation.
- **ImplicitCAD** (Haskell), **Curv** (custom lang), **fogleman/sdf** (Python) — programmatic SDF CAD.
- **Manifold** — our existing kernel already has `levelSet()` for SDF-to-mesh.

### Commercial
- **nTop** — flagship implicit modeling platform. Lattices, TPMS, topology optimization. Aerospace/medical.
- **Altair Inspire** — combines B-rep + implicit in one environment.
- **MagicaCSG** — lightweight real-time SDF modeler.

### Key insight
SDF is valuable as a **complement** to B-rep, not a replacement. B-rep has explicit topology (faces, edges) and exact analytic surfaces. SDF excels at smooth blending, lattices, field-driven geometry, and domain warps. The hybrid approach (used by nTop) is the right model.

---

## Architecture

```
User API          sdf.smoothUnion(a, b, {radius: 3}).toShape()
                        |
SdfShape          Immutable builder — chains SDF ops, builds SdfNode tree
                        |
SdfNode           Discriminated union (27 variants) — compile-time IR
                        |
ShapeCompilePlan  { kind: 'sdf', tree: SdfNode, edgeLength, bounds }
                        |
Manifold lower    compileSdfNode(tree) → (Vec3) => number → Manifold.levelSet()
                        |
Shape             Regular Shape with geometryInfo { fidelity: 'sampled', sources: ['level-set'] }
```

### Files
| File | Purpose |
|------|---------|
| `src/forge/sdf/sdfNode.ts` | SdfNode discriminated union (27 variants) + deep clone |
| `src/forge/sdf/sdfEval.ts` | Compiles SdfNode tree → `(Vec3) => number` evaluator + bounds estimation |
| `src/forge/sdf/sdf.ts` | User-facing SdfShape builder class + factory functions |
| `src/forge/sdf/sdfBridge.ts` | Connects SdfShape.toShape() to kernel compile plan pipeline |
| `src/forge/sdf/index.ts` | Barrel export |

### Integration touchpoints
Adding `'sdf'` to `ShapeCompilePlan` required handling the new variant in every exhaustive switch across the codebase (14 files). SDF is a **leaf node** — no `base`, no `queryPropagation` — so it follows the same pattern as `'importedMesh'` and `'sphere'` in all switch cases.

---

## Critical Bug: Sign Convention Mismatch

### Symptom
All SDF shapes rendered as solid cubes/rectangles in the viewer. Wireframe showed internal geometry, but solid view was opaque boxes.

### Root cause
**Manifold.levelSet()** uses the convention **positive = inside, negative = outside**.
**Standard SDF math** (Quilez formulas, all textbooks) uses **negative = inside, positive = outside**.

Without negation, the evaluator returned positive values everywhere outside the shape. Manifold interpreted this as "everything is inside" → solid bounding box.

### Evidence
- SDF sphere radius 10: volume was **9636mm³** (nearly the full bounding box 24³=13824) instead of expected **4189mm³**.
- The existing `loftSweepLowering.ts` confirms Manifold's convention: `loopSignedDistance()` returns **positive for inside** (line 94: `pointInLoop ? minDist : -minDist`).

### Fix
Single negation at the lowering boundary in `manifold/lower.ts`:
```typescript
const negated = (p: Vec3) => -evalFn(p);
return wasm.Manifold.levelSet(negated as any, plan.bounds, plan.edgeLength, 0);
```

After fix: SDF sphere volume = **4186mm³** (matches regular sphere 4183mm³).

### Lesson
When bridging between two systems that use signed scalar fields, **always verify the sign convention empirically** — don't assume "standard". The convention is documented in comments at both the evaluator header (`sdfEval.ts:1-9`) and the lowering site (`lower.ts:428-430`).

---

## Bounds Padding

Manifold.levelSet() creates watertight meshes. Where the SDF isosurface meets the bounding box, it caps with flat faces. If bounds are too tight, the result looks like a cube with the shape carved inside.

**Solution**: Pad bounds by `max(edgeLength * 3, 10% of max dimension)`. This ensures the SDF surface is fully contained within the evaluation volume and never touches the boundary.

---

## API Surface

| Category | Functions |
|----------|-----------|
| Primitives | `sdf.sphere()`, `sdf.box()`, `sdf.cylinder()`, `sdf.torus()`, `sdf.capsule()`, `sdf.cone()` |
| Smooth booleans | `sdf.smoothUnion()`, `sdf.smoothDifference()`, `sdf.smoothIntersection()` |
| Morph | `sdf.morph(a, b, t)` |
| TPMS lattices | `sdf.gyroid()`, `sdf.schwarzP()`, `sdf.diamond()` |
| Domain ops | `.twist()`, `.bend()`, `.repeat()`, `.shell()`, `.displace()`, `.onion()` |
| Custom | `sdf.fromFunction((x,y,z) => ..., bounds)` |
| Bridge | `.toShape({ edgeLength?, bounds? })` |

---

## Future Work

- **Shape → SDF**: `.toSDF()` method on Shape to convert B-rep geometry into a distance field (requires mesh-to-SDF conversion).
- **Functionally graded lattices**: `thickness` as a `(x,y,z) => number` function instead of a constant.
- **GPU acceleration**: Evaluate SDF on GPU via compute shaders for large models.
- **Better bounds estimation**: Current estimation is conservative; interval arithmetic (a la Fidget) could give tight bounds automatically.
- **Neural SDF**: Train a small MLP to approximate complex SDF trees for faster evaluation.

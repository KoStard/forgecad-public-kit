# SDF Modeling

ForgeCAD exposes a Signed Distance Field (SDF) modeling layer that runs parallel to the standard B-rep pipeline. SDF unlocks operations impossible in B-rep: smooth shape blending, TPMS lattice infill, surface displacement, twist/bend deformations, and morphing between shapes.

All SDF operations are accessed via the globally available `sdf` namespace.

## Mental Model

SDF shapes live in **SDF space** — a lazy expression tree — until `.toShape()` is called. At that point ForgeCAD evaluates the SDF over a 3D grid, extracts the isosurface via Manifold's levelSet(), and returns a regular `Shape` you can color, export, boolean with B-rep shapes, etc.

```
sdf.sphere(10)            → SdfShape (lazy expression)
  .smoothUnion(...)       → SdfShape (still lazy)
  .toShape()              → Shape    (meshed, now in B-rep world)
  .color('#4488cc')       → Shape    (regular ForgeCAD from here)
```

**Key distinction:** SDF booleans operate on the *distance field* — shapes blend smoothly. B-rep booleans operate on exact geometry — edges stay sharp. Use SDF for organic forms; use B-rep for mechanical parts.

## Primitives

All primitives are centered at the origin unless noted.

```javascript
sdf.sphere(radius)
sdf.box(x, y, z)                    // full dimensions — box(20,20,20) → 20mm cube
sdf.cylinder(height, radius)        // axis along Y
sdf.torus(majorRadius, minorRadius) // lies in the XZ plane
sdf.capsule(height, radius)         // axis along Y
sdf.cone(height, radius)            // base at y=0, tip at y=height
```

**Orientation notes:**
- `cylinder` and `capsule` — axis along **Y**. To orient along Z, add `.rotate(90, 0, 0)`.
- `torus` — the ring lies flat in the **XZ** plane (the "hole" axis is Y).
- `cone` — not centered; base sits at `y=0`. Translate up by `height/2` to center it.

## Boolean Operations

### Sharp booleans

```javascript
// Method style
a.union(b)
a.subtract(b)       // removes b from a
a.intersect(b)

// All accept multiple operands
a.union(b, c, d)
```

### Smooth booleans

Smooth booleans blend shapes over a transition `radius`. Larger radius = wider blend.

Two equivalent styles — **pick one per script**:

```javascript
// Factory style (radius in options object)
sdf.smoothUnion(a, b, { radius: 5 })
sdf.smoothDifference(a, b, { radius: 5 })
sdf.smoothIntersection(a, b, { radius: 5 })

// Method style (radius as direct argument)
a.smoothUnion(b, 5)
a.smoothSubtract(b, 5)      // note: smoothSubtract, not smoothDifference
a.smoothIntersect(b, 5)
```

> **API mismatch:** The factory functions take `{ radius }` (object). The instance methods take `radius` (number) directly. Don't mix them up.

```javascript
// Example: rounded blob from sphere + box
const blob = sdf.smoothUnion(
  sdf.sphere(15),
  sdf.box(20, 20, 20),
  { radius: 6 }
).toShape().color('#4488cc');
```

## TPMS Lattices

Triply Periodic Minimal Surfaces — ideal for lightweight infill, heat exchangers, and meta-materials.

```javascript
sdf.gyroid({ cellSize, thickness })    // most common for 3D printing
sdf.schwarzP({ cellSize, thickness })  // isotropic pores
sdf.diamond({ cellSize, thickness })   // stiffest TPMS structure
```

TPMS shapes fill all of space. **Always clip them** with an intersect:

```javascript
const lattice = sdf.gyroid({ cellSize: 8, thickness: 1.2 })
  .intersect(sdf.sphere(25))
  .toShape()
  .color('#ffaa44');
```

| Parameter | Effect |
|-----------|--------|
| `cellSize` | Pattern scale — larger = coarser lattice |
| `thickness` | Wall thickness — thicker = denser |

## Transforms

```javascript
shape.translate(x, y, z)
shape.rotate(xDeg, yDeg, zDeg)   // Euler angles, applied X→Y→Z
shape.scale(factor)               // uniform scale only
```

## Domain Operations

Domain operations warp **space itself** rather than moving the shape. This creates effects impossible with standard transforms.

### Twist

Rotates slices around the Y axis as a function of Y position.

```javascript
shape.twist(degreesPerUnit)    // degrees per mm along Y
```

```javascript
// Twisted column: 45° total over 50mm height
const column = sdf.cylinder(50, 8).twist(0.9).toShape();
```

### Bend

Bends the shape around the Z axis in an arc.

```javascript
shape.bend(radius)    // bend radius in mm — smaller = tighter arc
```

```javascript
// Arch: bend a cylinder into a half-circle
const arch = sdf.cylinder(60, 5).bend(20).toShape();
```

### Repeat

Tiles the shape in space. Spacing `0` on an axis = no repeat on that axis. Count `0` = infinite.

```javascript
shape.repeat([spacingX, spacingY, spacingZ])
shape.repeat([spacingX, spacingY, spacingZ], [countX, countY, countZ])
```

```javascript
// 3×3×1 grid of spheres, 15mm apart
const grid = sdf.sphere(4).repeat([15, 15, 0], [3, 3, 0]).toShape();
```

### Shell

Hollows out a solid, keeping only a surface shell of given thickness.

```javascript
shape.shell(thickness)
```

```javascript
// Hollow sphere, cut open to show interior
const vessel = sdf.sphere(20)
  .shell(2)
  .subtract(sdf.box(60, 60, 30).translate(0, 0, -15))
  .toShape();
```

### Displace

Offsets the surface by a function of position. Useful for surface texture, noise, and organic variation.

```javascript
shape.displace((x, y, z) => expression)
```

```javascript
// Bumpy sphere from sin-wave displacement
const bumpy = sdf.sphere(15)
  .displace((x, y, z) => Math.sin(x * 0.8) * Math.sin(y * 0.8) * Math.sin(z * 0.8) * 2)
  .toShape();
```

> **Critical gotcha:** The function body is serialized as a string and re-evaluated in a sandboxed context via `new Function("x","y","z", "return ...")`. This means:
> - **No closure variables** — you cannot reference `const speed = param(...)` inside the function
> - **Single expression only** — no `const`, `let`, `if`, `for` statements inside
> - Inline all constants: `(x, y, z) => Math.sin(x * 0.8) * 2.5` ✓
> - Multi-statement blocks **silently produce bad geometry**: `(x, y, z) => { const r = ...; return r; }` ✗

### Onion

Creates concentric shells like an onion cross-section.

```javascript
shape.onion(layers, thickness)
```

```javascript
// 3 concentric shells, 2mm apart
const onionSphere = sdf.sphere(20).onion(3, 2).toShape();
```

## Morphing

Interpolate between two SDF shapes. `t=0` returns `a`, `t=1` returns `b`.

```javascript
sdf.morph(a, b, t)   // factory
a.morph(b, t)         // method
```

```javascript
// Show 5 morph stages
const stages = [0, 0.25, 0.5, 0.75, 1].map((t, i) =>
  sdf.morph(sdf.sphere(12), sdf.box(20, 20, 20), t)
    .toShape()
    .translate(i * 30, 0, 0)
);
return stages;
```

## Custom SDF Functions

Define arbitrary geometry by writing a signed distance function directly.

```javascript
sdf.fromFunction(fn, { min: [x0, y0, z0], max: [x1, y1, z1] })
```

The function `fn(x, y, z)` must return the signed distance to the surface:
- **Negative** = point is inside the shape
- **Positive** = point is outside
- **Zero** = point is on the surface

Bounds are **required** — provide them tightly to avoid wasted computation.

```javascript
// Heart shape using algebraic SDF
const heart = sdf.fromFunction(
  (x, y, z) => (x*x + z*z*1.1 + y*y - 1)**3 - x*x*y*y*y - z*z*y*y*y * 0.11,
  { min: [-20, -25, -15], max: [20, 20, 15] }
).toShape();
```

> **Same gotcha as `displace()`:** The function body is serialized and re-evaluated — no closure variables, single expression only. All constants must be inlined.

### Hyperboloid example

```javascript
// Hyperboloid of one sheet: x²/a² + z²/b² - y²/c² = 1
const hyp = sdf.fromFunction(
  (x, y, z) => Math.sqrt(x*x/100 + z*z/100) - Math.sqrt(1 + y*y/400) * 7,
  { min: [-25, -30, -25], max: [25, 30, 25] }
).toShape();
```

## Converting to Shape

```javascript
shape.toShape()
shape.toShape({ edgeLength: 0.5 })               // finer mesh
shape.toShape({ bounds: { min: [...], max: [...] } })  // override auto bounds
```

| Option | Default | Effect |
|--------|---------|--------|
| `edgeLength` | `maxDim / 100` | Mesh resolution. Smaller = smoother but slower |
| `bounds` | auto-estimated | Override the sampling volume |

The auto edge length targets ~100 cells across the largest dimension. For smooth organic shapes, `edgeLength: 0.3–0.5` gives good results. For previews, `edgeLength: 1–2` is much faster.

## Mesh Quality

After meshing, ForgeCAD applies Laplacian smoothing + SDF projection to reduce the axis-aligned triangle pattern from Marching Tetrahedra. This runs automatically with 2 iterations.

## Workflow Tips

**Start coarse, refine last.** Use `edgeLength: 2` while designing, then drop to `0.5` for final output.

**Clip TPMS before toShape.** The lattice fills infinite space — always intersect with a bounding shape first, then call `.toShape()` on the intersected result.

**Compose before meshing.** Keep everything in SDF space as long as possible. Do all smooth booleans, deformations, and intersections before calling `.toShape()`. After conversion you're back in B-rep land and lose SDF capabilities.

**Mix with B-rep freely.** Once `.toShape()` is called, the result is a regular ForgeCAD Shape — use it in B-rep `difference()`, `union()`, `.fillet()`, etc.

```javascript
// SDF organic base + B-rep mechanical features
const organicBase = sdf.smoothUnion(sdf.sphere(20), sdf.box(30, 30, 10), { radius: 8 })
  .toShape();
const hole = cylinder(15, 3);
return difference(organicBase, hole);
```

## Reserved Names

ForgeCAD's global scope defines `sphere`, `box`, `cylinder`, `torus`, `capsule`, `cone`, `shell` as top-level B-rep primitives. Inside SDF scripts, always access them via the `sdf.*` namespace prefix to avoid conflicts:

```javascript
// ✗ Ambiguous / shadows global
const s = sphere(10);          // this is the B-rep sphere, not SDF

// ✓ Explicit
const s = sdf.sphere(10);      // SDF sphere — correct
```

When naming local variables, avoid shadowing these globals:

```javascript
// ✗ Shadows global 'sphere'
const sphere = sdf.sphere(10).smoothUnion(...);

// ✓ Use a descriptive name
const orb = sdf.sphere(10).smoothUnion(...);
const boundSphere = sdf.sphere(30);
```

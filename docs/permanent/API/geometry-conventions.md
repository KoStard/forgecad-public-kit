# Geometry Conventions

ForgeCAD wraps Manifold (a mesh kernel) and Three.js (a Y-up renderer). These libraries have their own conventions that conflict with each other and with CAD norms. This doc captures every convention mismatch and how ForgeCAD resolves it.

**Core principle: the user script should never need to know about kernel or renderer internals.** If the user writes something geometrically reasonable, it should work. All convention translation happens inside ForgeCAD's layer.

## Winding Order

**What it is:** The order of vertices in a 2D polygon determines its "direction" — counter-clockwise (CCW) = positive area, clockwise (CW) = negative/zero area in Manifold's `CrossSection`.

**The problem:** Manifold silently produces empty geometry for CW polygons. A user writing `polygon([[0,0], [50,0], [50,30]])` vs `polygon([[0,0], [50,30], [50,0]])` gets either a triangle or nothing, with no error.

**ForgeCAD's fix:** All entry points that accept raw points auto-fix winding:
- `polygon(points)` — computes signed area, reverses if CW
- `path().close()` — same fix

**Signed area test** (shoelace formula):
```
signedArea = Σ (x₂ - x₁)(y₂ + y₁)
```
If `signedArea > 0` → CW → reverse to make CCW.

**Implementation:** `src/forge/sketch/primitives.ts` (polygon), `src/forge/sketch/path.ts` (close).

**Rule for new code:** Any function that takes user-provided point arrays and creates a `CrossSection` MUST auto-fix winding. Never pass raw user points to Manifold without this check.

## Coordinate System (Z-up vs Y-up)

**The problem:** Three.js uses Y-up. CAD convention (and ForgeCAD) uses Z-up.

**ForgeCAD's fix:** We set `camera.up = (0, 0, 1)` everywhere. Geometry coordinates are native Z-up — no matrix swizzling. The camera orientation handles the visual mapping.

**Where this matters:**
- `camera.up.set(0, 0, 1)` in `sceneBuilder.ts` and `render.ts`
- GizmoViewcube face labels remapped (see coordinate-system.md)
- Grid plane is XY (Z=0)
- Extrusion goes along +Z
- Revolution axis is Y (sketch plane), result maps to Z-up space

**Rule for new code:** Never swap Y/Z in geometry. Always fix it at the camera/renderer level.

## Revolution Axis

**What it is:** `CrossSection.revolve()` in Manifold revolves around the Y axis. The sketch profile must be in the X-Y plane with X = radius (distance from axis) and Y = height.

**The mapping:**
- Profile X coordinate → radial distance from center
- Profile Y coordinate → height (becomes Z after revolution)
- Profile must be on the positive X side (X > 0) for valid geometry

**Rule for new code:** Document which axis any new sweep/revolution operation uses. If it differs from user expectation, add a transform wrapper.

## Boolean Winding (3D)

**What it is:** Manifold requires consistent face normals (outward-pointing) for boolean operations. Manifold handles this internally for its own primitives, but imported meshes or degenerate operations can produce inside-out faces.

**ForgeCAD's fix:** We only create meshes through Manifold's own constructors (`extrude`, `revolve`, `cylinder`, `sphere`, etc.), which guarantee correct normals. No raw mesh import path exists yet.

**Rule for new code:** If adding mesh import (STL, OBJ), run `Manifold.asOriginal()` or validate manifoldness before allowing booleans.

## Transform Order

**What it is:** Transforms are applied in call order (left to right in the chain). `shape.translate(10,0,0).rotate(0,0,45)` first moves, then rotates around origin — so the shape orbits.

**Convention:** This matches the standard "post-multiply" convention. No surprises here, but worth noting because some systems (OpenSCAD) apply transforms in reverse order.

**Rule for new code:** Keep post-multiply order. Document any operation that deviates.

## Summary of Shield Points

These are the places where ForgeCAD translates between "what the user means" and "what the kernel needs":

| Convention | User sees | Kernel needs | Where we fix it |
|---|---|---|---|
| Winding | Any point order | CCW | `polygon()`, `path().close()` |
| Up axis | Z-up | Y-up (Three.js) | `camera.up`, gizmo labels |
| Revolution | "revolve this profile" | Profile in X-Y, X>0 | Documented, not auto-fixed |
| Face normals | Doesn't think about it | Outward-pointing | Manifold constructors |
| Transform order | Left-to-right chain | Post-multiply | Native match, no fix needed |

When adding new geometry operations, check this table. If the operation introduces a new convention mismatch between user intent and kernel requirement, either auto-fix it (preferred) or document it clearly in the API docs.

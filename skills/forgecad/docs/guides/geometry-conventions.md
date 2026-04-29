---
skill-group: geometry
skill-order: 2
---

# Geometry Conventions

ForgeCAD wraps Manifold (mesh kernel) and Three.js (Y-up renderer). This doc captures convention mismatches and how ForgeCAD resolves them.

## Winding Order

CCW = positive area, CW = empty in Manifold's `CrossSection`. ForgeCAD auto-fixes at all entry points:
- `polygon(points)` — computes signed area (shoelace), reverses if CW
- `path().close()` — same fix

**Rule for new code:** Any function accepting user point arrays that creates a `CrossSection` MUST auto-fix winding.

## Coordinate System (Z-up vs Y-up)

Three.js is Y-up; ForgeCAD is Z-up. Fix applied at camera level (`camera.up = (0,0,1)`) — geometry coordinates are native Z-up. Never swap Y/Z in geometry.

## Revolution Axis

`CrossSection.revolve()` revolves around Y. Profile X = radial distance, Profile Y = height (becomes Z after revolution). Profile must be at X > 0.

## Boolean Winding (3D)

Manifold requires consistent outward face normals. ForgeCAD only creates meshes through Manifold's own constructors, which guarantee correct normals.

## Transform Order

Transforms apply left-to-right. `Sketch.rotate()`, `scale()`, and `mirror()` operate around bounding-box center. For 3D `Shape` / `ShapeGroup`, `scale()` and `mirror()` operate around bounding-box center, while `rotate()` remains origin-based unless you pass `options.pivot` or use `rotateAroundAxis(...)`.

For explicit transform objects: `A.mul(B)` = apply A then B; `composeChain(A, B, C)` = A→B→C.

## Assembly Frame Composition

```ts
childWorld = composeChain(childBase, jointMotion, jointFrame, parentWorld)
```

Prefer `composeChain(...)` over manual `.mul(...).mul(...)` in kinematics code to avoid order mistakes.

## Summary

| Convention | User sees | Kernel needs | Where we fix it |
|---|---|---|---|
| Winding | Any point order | CCW | `polygon()`, `path().close()` |
| Up axis | Z-up | Y-up (Three.js) | `camera.up`, gizmo labels |
| Revolution | "revolve this profile" | Profile in X-Y, X>0 | Documented only |
| Face normals | Doesn't think about it | Outward-pointing | Manifold constructors |
| Transform order | Left-to-right chain | Post-multiply | Native match |

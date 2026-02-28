# Material Pattern Support (SVG) in ForgeCAD

Date: 2026-02-28

## Question

We already support per-object color. Can we add material "patterns", especially:

1. A repeating (spread/tiled) SVG pattern on surfaces.
2. A single SVG instance placed on a surface (logo/decal style).

Short answer: yes. The clean path is to add **visual pattern rendering first** (viewport), then optionally add **real geometry imprinting** for manufacturing/export fidelity.

## Current State (Codebase Reality)

From the current implementation:

- `Shape` stores `colorHex` only (`src/forge/kernel.ts`).
- Runtime scene objects carry optional `color` only (`src/forge/runner.ts`).
- Viewport uses `meshPhysicalMaterial` with color, no texture map (`src/components/Viewport.tsx`).
- Mesh conversion emits `position` + flat `normal`, no UVs (`src/forge/meshToGeometry.ts`).
- View settings persist `visible`, `opacity`, `color` (`src/store/forgeStore.ts`).
- Export pipelines are color-oriented:
  - STL: optional per-triangle color attribute
  - 3MF: color/material tint flow, no texture pattern pipeline in Forge code
  (`src/forge/exportMesh.ts`).
- Report rendering is vector/projection with flat fills, not texture-based (`src/forge/report.ts`).

Implication: pattern support is not blocked, but it needs a new appearance layer, not just "one more color field".

## Manifold Property Notes (Important)

I also validated `manifold-3d` behavior relevant to patterns:

- Arbitrary vertex property channels are supported (`setProperties(...)`), so UV-like data is possible in principle.
- These channels survive boolean operations.
- Custom channels are **not** automatically transformed by `translate/rotate/scale`; only normals can be auto-updated when using `getMesh(normalIdx)`.

Implication:

- A UV-in-property workflow is possible but fragile unless property updates are carefully recomputed after transforms.
- For Forge's current architecture, triplanar shader mapping is a safer MVP than full UV propagation.

## What Can Be Done

### A) Repeating Pattern (Spread/Tiled) - Visual Material

Best fit: **triplanar SVG texture projection** in the viewport.

Why this fits Forge now:

- No UV unwrap required (current mesh has no UVs).
- Works on arbitrary boolean-heavy Manifold geometry.
- Keeps geometry kernel unchanged.

How it works:

1. Rasterize SVG to a texture (cached).
2. In shader, sample that texture with triplanar projection using local position/normal.
3. Blend pattern with base color (multiply/mix/overlay style).
4. Control scale/rotation/offset in model units (mm-like behavior).

Tradeoff:

- Visual fidelity is good for CAD preview.
- Not directly exportable to STL/3MF/report in current pipeline.

### B) Single-Instance Placement - Decal

Best fit: **decal projection** mesh per object.

How:

- Add a decal definition (origin, normal, width/height, rotation).
- Build projected decal geometry and render with transparent material.
- Use same clipping planes as base mesh so section/cut behavior remains coherent.

This directly matches "one SVG instance placed on a surface".

Tradeoff:

- Still visual unless converted to real geometry.
- Needs careful handling to avoid z-fighting and heavy decal counts.

### C) Real Geometry Pattern (Emboss/Engrave/Cut)

Best fit for manufacturing/export parity:

- Parse SVG path -> Forge `Sketch` -> extrude/project -> boolean add/subtract.

This gives true CAD geometry and exports to STL/3MF naturally.

Tradeoff:

- Significantly larger effort.
- Surface projection on curved topology is hard.
- Likely start with planar/TrackedShape-face targets only.

## Recommendation

Implement in phases:

1. **Phase 1 (MVP, high ROI):**
   - Tiled SVG pattern as visual material (triplanar).
2. **Phase 2:**
   - Single-placement SVG decals.
3. **Phase 3 (optional, bigger):**
   - Geometry-based emboss/deboss from SVG for export/manufacturing fidelity.

This gives immediate user-visible value without destabilizing the geometry kernel.

## Proposed API Direction

Keep `.color()` for backward compatibility and add appearance/pattern API.

Example shape API sketch:

```js
const body = box(120, 80, 30)
  .color("#b8c0cc")
  .pattern({
    svg: `<svg viewBox="0 0 16 16"><path d="..." /></svg>`,
    mode: "tile",
    tileSize: [8, 8],     // model units
    opacity: 0.35,
    tint: "#2f3742",
    blend: "multiply",
    projection: "triplanar",
  });

const logoPart = cylinder(20, 30).pattern({
  svg: logoSvg,
  mode: "single",
  placement: {
    origin: [0, 0, 10],
    normal: [0, 0, 1],
    width: 18,
    height: 10,
    rotateDeg: 0,
  },
});
```

For `TrackedShape`, optionally support face-based placement:

```js
tracked.pattern({
  svg: logoSvg,
  mode: "single",
  placement: { onFace: "top", u: 0, v: 0, width: 20, height: 12 },
});
```

## Internal Data Model (Proposed)

Move from color-only to appearance object:

```ts
interface PatternDef {
  svg: string; // inline SVG or resolved asset/data URI
  mode: "tile" | "single";
  tileSize?: [number, number];
  opacity?: number;
  tint?: string;
  blend?: "normal" | "multiply" | "overlay";
  projection?: "triplanar" | "planar";
  placement?: {
    origin: [number, number, number];
    normal: [number, number, number];
    width: number;
    height: number;
    rotateDeg?: number;
  };
}

interface AppearanceDef {
  color?: string;
  pattern?: PatternDef;
}
```

Then propagate this through:

- `Shape` metadata
- `SceneObject`
- store `objectSettings`
- viewport material/decal render

## Touchpoints for Implementation

- `src/forge/kernel.ts`
  - Add appearance metadata on `Shape` (immutable propagation through transforms/booleans).
- `src/forge/sketch/topology.ts`, `src/forge/group.ts`
  - Propagate appearance API through `TrackedShape`/`ShapeGroup`.
- `src/forge/runner.ts`
  - Extend `SceneObject` with appearance.
- `src/store/forgeStore.ts`
  - Extend `ObjectSettings` and sync.
- `src/components/Viewport.tsx`
  - Pattern-enabled material shader + decal render path.
- `src/components/CodeEditor.tsx`
  - Type declarations for new API.
- `docs/permanent/API/API.md` + `examples/api/`
  - Usage docs and examples.

## Export/Report Expectations

Important to set expectations early:

- **STL:** no texture support -> pattern will not export unless converted to geometry.
- **3MF:** current Forge pipeline is color/material-tint oriented; texture workflow is not implemented.
- **PDF Report:** current report renderer uses flat fills/edges; no pattern shading path.

So MVP pattern support should be explicitly documented as **viewport visual appearance**.

## Behavior Rules to Keep Consistent

- Booleans currently keep first operand color semantics; pattern should follow same rule initially.
- For preserving multiple distinct appearances, users should keep objects separate (array/group), same as color best practice.

## Effort / Risk

- Phase 1 (tiled triplanar): medium effort, low kernel risk.
- Phase 2 (single decal): medium effort, moderate rendering complexity.
- Phase 3 (true geometry imprint): high effort, high complexity.

Main technical risks:

- Shader complexity/performance if each object gets unique material variants.
- Texture cache invalidation and memory usage.
- Clear user confusion if visual pattern does not export; docs must be explicit.

## Final Take

Yes, this is very doable, and worth doing.

The practical plan is:

1. Ship visual tiled SVG patterns first.
2. Add single-placement decals second.
3. Add geometry imprinting only if export/manufacturing fidelity is a requirement for your workflows.

This keeps ForgeCAD fast and fun while opening a strong material/appearance capability without rewriting core geometry behavior.

---
skill-group: core
skill-order: 1
---

# ForgeCAD Core Concepts

A `.forge.js` script is plain JavaScript that returns geometry. The entire forge API is injected as globals — never `import`, `require`-destructure, or shadow ForgeCAD API names (`const lib = ...`, `let slot = ...`, `class Shape {}` all collide). The reserved list is in [Runtime Names](../../generated/runtime-names.md); check it before using natural local names.

## Execution & Return Values

All geometry operations are **immutable** — shapes, sketches, groups, assemblies, and boards return new values, never mutate in place.

A script must return one of three shapes:

1. **A single renderable** — `Shape`, `Sketch`, `ShapeGroup`, `Assembly`, `SolvedAssembly`, or `SdfShape`.
2. **An array** of renderables or named descriptors `{ name, tags?, shape | sketch | group, color? }`:

   ```javascript
   return [
     { name: "Base Plate", tags: ["printed", "structural"], shape: base, color: "#888888" },
     { name: "M4 Bolt", tags: "fastener", shape: bolt, color: "#4488cc" },
   ];
   ```

3. **A metadata object** — a plain object whose renderable values are rendered and whose non-renderable values (numbers, hole tables, builder functions) are silently skipped at render but flow to importers via `require()`.

Return an unsolved `Assembly` directly — ForgeCAD solves it at default joint values for display. Use `assembly.solve(state)` for a specific pose. Never call `.toGroup()` just to make an assembly render; use it only when you need `ShapeGroup` composition or named-child lookup.

For multi-file projects — import path rules, the metadata pattern, and Forge-aware builder modules — see the [`require()` docs](../../generated/core.md).

## Identity

`union()` merges shapes into one solid with one identity — later operands lose separate colors and names. Use `group(...)` or named return objects when parts need separate colors, tags, or identities.

## Face Labels

Shapes carry semantic face labels through their lifecycle:

1. **Primitives** assign canonical names (`box()` → `top`, `bottom`, `side-left`, ...; `cylinder()` → `top`, `bottom`, `side`).
2. **Extrusions** inherit sketch labels and add `top`/`bottom`.
3. **Transforms** preserve all labels.
4. **Booleans** preserve first-operand labels where geometry survives.

Resolve labels with `.face(name)` or `.face(query)` — see the Shape class docs for the query API.

## Conventions

**No explanatory text inside CAD geometry.** Model the physical artifact; explain the design through names, comments, BOM entries, and docs. Use `text2d()` only when letters are part of the real object (engraving, branding, gauge ticks); use `Viewport.label()` only for temporary review/debug annotation — never to compensate for unclear geometry.

**SDF shapes preview natively** when returned directly; call `.toShape()` only when mesh-backed CAD/export behavior is needed. See [SDF docs](../../generated/sdf.md).

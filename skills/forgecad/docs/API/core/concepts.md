---
skill-group: core
skill-order: 1
---

# ForgeCAD Core Concepts

ForgeCAD scripts are JavaScript that returns geometry. The forge API is globally available — no imports needed.

```javascript
const width = param("Width", 50, { min: 20, max: 100, unit: "mm" });
return box(width, 30, 10);
```

## Execution Model

- Scripts re-execute on every parameter change (400ms debounce)
- Geometry operations are **immutable** — shapes, sketches, groups, imported assemblies, and wood boards return new values instead of modifying in place
- Must return one of: `Shape`, `Sketch`, `ShapeGroup`, `Assembly`, `SolvedAssembly`, `SdfShape`, `Array` of renderables, `Array` of `{ name, shape?, sketch?, group?, color? }`, or a **metadata object** (see below)

Top-level assembly scripts can return an unsolved `Assembly` directly; ForgeCAD solves it at default joint values for display. Return `assembly.solve(state)` when you want a specific pose. Do not call `.toGroup()` just to make an assembly render — use `.toGroup()` only when you specifically need `ShapeGroup` composition, group-style transforms, or named-child lookup.

### Metadata Object Return

A script can return a plain object whose values include renderable geometry alongside non-renderable metadata. All renderable entries (Shape, Sketch, ShapeGroup, Assembly, SolvedAssembly, SdfShape, or Array of named objects) are rendered; non-renderable entries are silently skipped. This is useful for multi-file projects where a part needs to publish interface data (bolt positions, dimensions) to other files:

```javascript
// motor-mount.forge.js — renders standalone, exports metadata via require()
const holePositions = [[17, 15], [-29, 15], [17, -15], [-29, -15]];
return {
  shape: mount.color('#556B2F'),                        // rendered
  bolts: { dia: 5.3, pos: holePositions },              // metadata — skipped in render, available via require()
};

// base-body.forge.js — imports mount, accesses .bolts
const mount = require('./motor-mount.forge.js');
for (const [x, y] of mount.bolts.pos) { ... }          // use metadata
// mount.shape is the Shape if you need it in an assembly
```

Arrays inside the object are also rendered:

```javascript
return {
  parts: [{ name: 'Left', shape: leftShape }, { name: 'Right', shape: rightShape }],
  armWidth: 6,  // metadata
};
```

## Coordinate System

Z-up right-handed: X = left/right, Y = forward/back, Z = up/down.

## Colors

`.color(hex)` works on `Shape` and `Sketch`. Colors survive transforms. Boolean operations return a single result shape, so only the first operand's color survives.

**`union()` merges shapes into one solid mesh** — later operands do not keep separate colors or identities. Use `group(...)` or return named objects instead when you want separate parts:

```javascript
return [
  { name: "Base", shape: box(100, 100, 5), color: "#888888" },
  { name: "Column", shape: cylinder(50, 10).translate(50, 50, 5), color: "#4488cc" },
];
```

## Face Operations

Shapes carry semantic face labels through their lifecycle. The flow is:

1. **Primitives** assign canonical names — `box()` gives you `top`, `bottom`, `side-left`, etc.; `cylinder()` gives `top`, `bottom`, `side`.
2. **Extrusions** inherit labels from the sketch and add `top`/`bottom`.
3. **Transforms** (translate, rotate, scale, mirror) preserve all labels.
4. **Booleans** preserve labels from the first operand where geometry survives.

You resolve labels to geometry with `.face(name)` or `.face(query)` — see the Shape class docs for the full query API. Operations like `.pocket()`, `.boss()`, `.hole()`, and `faceProfile()` all consume face references.

## SDF Modeling

For organic shapes, smooth blending, TPMS lattices, and surface deformations. Return `SdfShape` values directly, or return a plain object/array tree of SDF leaves, for native raymarch preview. Use `.toShape()` or `toShape(...)` only when you need mesh-backed CAD/export behavior. See [sdf-primitives.md](sdf-primitives.md).

---
name: component-model
description: "Enforce the ForgeCAD Component Model when building multi-part assemblies. Parts build at origin, connectors position them, data flows down from parent. Use when building or reviewing any multi-file ForgeCAD project."
forgecad-public: true
---

# Component Model — The React of CAD

You are building a ForgeCAD multi-part assembly. Follow the Component Model strictly.

## The Core Principle

**Parts never position themselves. The assembly positions them via connectors.**

A part is a function from props to `{ shape, connectors, metadata }`. It builds at origin in local space. It doesn't know where it sits in the world.

## Rules (Non-Negotiable)

### 1. Parts Build at Origin
- Geometry starts at `[0, 0, 0]` in local coordinates
- No assembly-space offsets (no `translate(pinionPitchR, 0, layout.pinionZ)`)
- Internal structure computed from the part's own props only

### 2. Connectors Are the Interface
- Every part that joins an assembly declares connectors via `.withConnectors({})`
- A connector = origin + axis (outward from the part)
- Connectors meet **face-to-face**: both axes point outward, system brings them together
- For prismatic joints: axes point along the shared slide direction

### 3. Assembly Is Pure Composition
- `addPart()` + `connect()` + `addJointCoupling()` — nothing else
- Zero `translate()` calls for structural parts
- Zero coordinate math
- The assembly passes props down and reads metadata up

### 4. Data Flows Down, Never Sideways
- **Props down:** Assembly passes dimensions to parts via `require('./part.forge.js', { Height: 20 })`
- **Metadata up:** Parts return `{ shape, boltPattern, pinionZ, ... }` — computed values the parent might pass to siblings
- **Siblings never import each other.** The assembly mediates ALL sibling communication

### 5. Verify, Don't console.log
- Use `verify.that("name", () => condition)` for spatial checks
- Use `verify.equal()`, `verify.inRange()`, `verify.notColliding()` for specific assertions
- Never `console.log` + `if` for validation

## Connector Convention

```js
// Face-to-face: both point outward, system opposes them
base.withConnectors({
  mount_face: connector("bolt-face", { origin: [0, 0, 0], axis: [0, 0, -1] }),
  //                                  ↑ bottom face          ↑ faces downward
});
mount.withConnectors({
  flange: connector("bolt-face", { origin: [0, 0, 0], axis: [0, 0, 1] }),
  //                              ↑ top face            ↑ faces upward
});

// Assembly — no flip, no coordinate math
assembly.connect("Base.mount_face", "Mount.flange", { as: "mount-fix" });
```

## Part Return Shape

Every part file returns a structured object:

```js
return {
  shape: body.color('#708090').withConnectors({ ... }),
  // Public metadata — parent may pass to siblings:
  boltPattern,    // bolt positions for sibling parts
  pinionZ,        // Z center for gear alignment
  armWidth,       // arm cross-section for cover plate slots
};
```

## File Structure

**Default: one file for project-specific assemblies.** Parts are sections within the file. Shared data is variables. Split into separate files only when parts are reusable or the file exceeds ~300 lines.

```js
// ─── Motor Mount ────────────────────────────
const mount = buildMount({ servo, wall, clearance });

// ─── Base Body ──────────────────────────────
const base = buildBase({ gears, depth, height, boltPattern: mount.boltPattern });

// ─── Assembly ───────────────────────────────
assembly("Gripper")
  .addPart("Base", base.shape)
  .addPart("Mount", mount.shape)
  .connect("Base.mount_face", "Mount.flange", { as: "fix" })
```

## Anti-Patterns (Reject These)

❌ **shared-dims.js** — A file whose only job is computing derived dimensions. The assembly should derive and pass them.

❌ **Sibling imports** — `require('./motor-mount.forge.js')` inside `cover-plate.forge.js`. Data flows through the parent.

❌ **Assembly-space coordinates in parts** — A part knowing `pinionZ = 14` from a sibling's geometry. It should receive `rackZ: 14` as a prop.

❌ **`translate()` in assembly** — If you're translating to position a part, add a connector instead.

❌ **console.log validation** — Use `verify.*`. Always.

❌ **Bare `connector.neutral()`** — Use `connector()` without gender unless building a reusable component library with compatibility checking.

## Design Gate

Before committing any multi-part assembly, verify:

1. Can you understand each part without reading other files?
2. Does the assembly contain zero coordinate math?
3. Do all inter-part relationships flow through connectors and props?

If any answer is no, refactor.

## Reference

Full philosophy: `docs/permanent/component-model.md`
Connector details: `docs/permanent/generated/assembly.md`
Blueprint-first: `docs/permanent/blueprint-first.md`

---
name: forgecad-component-model
description: "Enforce the ForgeCAD Component Model when building multi-part assemblies. Parts build at origin, connectors position them, data flows down from parent. Use when building or reviewing any multi-file ForgeCAD project."
forgecad-public: true
---

# Component Model

The React of CAD: a part is a function from props to `{ shape, connectors, metadata }`, built at origin in local space. Parts never position themselves — the assembly positions them via connectors.

## Rules

1. **Parts build at origin.** Geometry starts at `[0,0,0]` in local coordinates; no assembly-space offsets; internal structure derives from the part's own props only.
2. **Connectors are the only interface.** Declare via `.withConnectors({})`; axes point outward, mating is face-to-face (exception: prismatic joints share a co-directional slide axis). Mechanics: the forgecad skill's `docs/guides/positioning.md` and `docs/generated/assembly.md`.
3. **Assembly is pure composition.** Zero `translate()` to position structural parts, zero coordinate math — connect connectors, pass props down, read metadata up.
4. **Data flows down, never sideways.** Props down via `require('./part.forge.js', { Height: 20 })` overrides; metadata up via the part's return object; siblings NEVER import each other — the assembly mediates all sibling communication.
5. **Validate with `verify.*`, never `console.log` + `if`.**

## Part return shape

```js
return { shape, boltPattern, pinionZ }; // shape + metadata the parent may route to siblings
```

## File structure

Default: ONE file per project-specific assembly — parts as sections, shared data as variables. Split only for cross-project reuse or past ~300 lines. Never split for "organization".

## Anti-patterns (reject on review)

- `shared-dims.js` — a file that only computes derived dimensions; the assembly derives and passes them.
- Sibling `require()` — e.g. `require('./motor-mount.forge.js')` inside `cover-plate.forge.js`; route through the parent.
- Assembly-space coordinates inside a part — a part knowing `pinionZ = 14` from a sibling's geometry; receive it as a prop.
- `translate()` to position a structural part in an assembly — add a connector instead.
- `console.log` + `if` validation — use `verify.*`.
- Bare `connector.neutral()` outside a reusable component library with compatibility checking.

## Design gate

Before committing any multi-part assembly:

1. Can you understand each part without reading other files?
2. Does the assembly contain zero coordinate math?
3. Do all inter-part relationships flow through connectors and props?

If any answer is no, refactor.

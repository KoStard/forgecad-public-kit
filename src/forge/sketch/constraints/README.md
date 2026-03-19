# Constraints TS Boundary

Rust is the only solver implementation now. Everything under this folder exists for one of four reasons:

- builder ergonomics: fluent sketch authoring APIs and higher-level concepts
- registry metadata: declarative constraint labels, equation counts, and annotation builders
- wasm boundary: serialize a `ConstraintDefinition`, call Rust, and apply the result
- downstream UI geometry: arrangement, surface detection, and display overlays after solving

## File Inventory

- `builder.ts`
  Builder-only authoring API. Adds geometry and constraints, then forwards incremental seeding to Rust.
- `concepts/*.ts`
  User-friendly macros like rects and polygons. They emit geometry plus constraints into the builder; they do not solve.
- `defs/*.ts`
  Thin declarative descriptors for each constraint type. They define payload shape, equation count, labels, and UI annotations only.
- `helpers.ts`
  TS geometry helpers used only for labels, annotations, and shape display metadata.
- `registry.ts`
  Constraint descriptor registry plus thin Rust solve/display glue.
- `rigidity.ts`
  Backward-compatible TS API wrapper that derives rigidity-style diagnostics from Rust solve metadata.
- `sketch.ts`
  Converts solved geometry into sketch objects, arrangement surfaces, and other UI-facing structures.
- `solver-wasm.ts`
  JSON/WASM boundary that initializes the Rust module, serializes problems, and applies solved values.
- `types.ts`
  Shared TS builder, display, and wire-format types for the Rust-backed constraints surface.
- `index.ts`
  Public TS facade that re-exports the thin boundary and loads descriptor side effects.

## Non-Goals

- no residuals in TS
- no Jacobians in TS
- no analytical presolve in TS
- no decomposition or solve orchestration in TS
- no TS-authoritative constraint behavior

If a solver bug appears, debug Rust first. Only touch this folder when the issue is:

- builder UX
- wasm serialization
- UI annotation/display behavior
- downstream arrangement/rendering based on already-solved geometry

# Making ProfileCompilePlan Non-Optional on Sketch

## Goal

Make the `ProfileCompilePlan` on every `Sketch` instance non-optional (remove `null` from the type). Today, many code paths create `new Sketch(...)` without a compile plan, which means the compile plan IR tree is silently lost. This breaks backend portability and prevents the plan from being used for serialization, optimization, or replay.

## Current State

### How profile plans are stored

Plans are stored externally in a `WeakMap<Sketch, ProfileCompilePlan | null>` (in `core.ts`). The `Sketch` constructor always initializes the plan to `null`. Call sites that want a plan must explicitly call `setSketchCompileProfilePlan()` or use `buildSketchFromCompileProfilePlan()`.

### Every `new Sketch()` call site

| File | Line | Has Plan? | Notes |
|------|------|-----------|-------|
| `sketch/core.ts` (constructor) | 48 | null | Default init |
| `sketch/core.ts` (color) | 57 | YES | Copies plan from source |
| `sketch/core.ts` (clone) | 68 | YES | Copies plan from source |
| `sketch/core.ts` (offset stub) | 96 | NO | Dead code (overridden by operations.ts) |
| `sketch/core.ts` (hull stub) | 99 | NO | Dead code (overridden by operations.ts) |
| `sketch/core.ts` (simplify stub) | 102 | NO | Dead code (overridden by operations.ts) |
| `sketch/core.ts` (warp stub) | 105 | NO | Dead code (overridden by operations.ts) |
| `sketch/core.ts` (buildSketchFromCompileProfilePlan) | 146 | YES | Canonical plan-based constructor |
| `sketch/transforms.ts` (translate fallback) | 17 | null | Fallback when incoming plan is null |
| `sketch/transforms.ts` (rotate fallback) | 27 | null | Fallback when incoming plan is null |
| `sketch/transforms.ts` (scale fallback) | 42 | null | Fallback when incoming plan is null |
| `sketch/transforms.ts` (mirror fallback) | 56 | null | Fallback when incoming plan is null |
| `sketch/booleans.ts` (add fallback) | 42 | null | Fallback when any operand lacks plan |
| `sketch/booleans.ts` (subtract fallback) | 61 | null | Fallback when any operand lacks plan |
| `sketch/booleans.ts` (intersect fallback) | 80 | null | Fallback when any operand lacks plan |
| `sketch/booleans.ts` (union2d fallback) | 101 | null | Fallback when any operand lacks plan |
| `sketch/booleans.ts` (difference2d fallback) | 121 | null | Fallback when any operand lacks plan |
| `sketch/booleans.ts` (intersection2d fallback) | 141 | null | Fallback when any operand lacks plan |
| `sketch/booleans.ts` (hull2d fallback) | 161 | null | Fallback when any operand lacks plan |
| `sketch/operations.ts` (offset fallback) | 17 | null | Fallback when plan is null or join != Round |
| `sketch/operations.ts` (hull fallback) | 27 | null | Fallback when plan is null |
| `sketch/operations.ts` (simplify) | 32 | NO | Always drops plan |
| `sketch/operations.ts` (warp) | 36 | NO | Always drops plan |
| `sketch/text.ts` | 93 | NO | Text glyph ring construction |
| `sketch/entities.ts` (Circle2D.toSketch) | 165 | NO | Circle2D entity conversion |
| `sketch/constraints/sketch.ts` | 95 | NO | Constrained sketch circle loop |
| `sketch/constraints/sketch.ts` | 130 | NO | Constrained sketch empty profile |
| `sketch/svgImport.ts` | 1477 | NO | SVG import from loops |
| `section.ts` (intersectWithPlane) | 18 | NO | Section cut (slice) |
| `section.ts` (projectToPlane) | 23 | conditional | Has plan only if projection plan succeeds |

### Summary of plan loss

Plans are lost in three categories:

1. **Fallback paths** (transforms, booleans, operations): When an incoming sketch has no plan, operations fall through to the backend directly and set `null`. These become unnecessary once all sketches have plans.

2. **Operations without IR nodes**: `simplify()` and `warp()` always drop plans because there's no IR node for them.

3. **Factory functions without plans**: text, Circle2D.toSketch, constrained sketch builder, SVG import, section cuts.

## Assessment of offset/hull/simplify/warp

### offset (GENERIC CAD - KEEP)

- **What it does**: Grows or shrinks a 2D profile by a uniform distance. Standard CAD operation (also called "shell" or "buffer" in 2D).
- **Backend support**: Manifold `CrossSection.offset()`, OCCT `BRepOffsetAPI_MakeOffset` -- both backends implement it.
- **Compile plan**: Already has an IR node (`kind: 'offset'`), but only for `join: 'Round'`. Square/Miter join drops the plan.
- **Usage**: Used in SVG import stroke rendering, path construction, and gear library.
- **Verdict**: Keep. Extend IR to support Square/Miter join types.

### hull (GENERIC CAD - KEEP)

- **What it does**: Computes the 2D convex hull of the profile's vertices. Standard computational geometry operation.
- **Backend support**: Manifold `CrossSection.hull()`, OCCT throws (not implemented).
- **Compile plan**: Already has an IR node (`kind: 'hull'`).
- **Usage**: Used via `hull2d()` free function and `.hull()` method. `hull2d` already has a compile plan.
- **Verdict**: Keep. The OCCT backend should implement it (convex hull is a well-defined geometric operation).

### simplify (MANIFOLD-SPECIFIC - REMOVE from public API)

- **What it does**: Reduces polygon vertex count by removing vertices within an epsilon tolerance. This is a mesh simplification concept, not a CAD concept. Exact-geometry backends (OCCT) treat it as a no-op.
- **Backend support**: Manifold `CrossSection.simplify()`. OCCT returns `this` (no-op).
- **Compile plan**: NO IR node. Always drops the plan.
- **Usage**: Used in `library.ts` gear profile (`simplify(1e-6)`) and SVG import. Both uses are cleanup operations on tessellated geometry -- they compensate for Manifold's polygon representation.
- **Verdict**: Remove from public Sketch API. Keep on ProfileBackend for internal use (SVG import, gear library internals). The public API should not expose backend-specific mesh cleanup.

### warp (MANIFOLD-SPECIFIC - REMOVE)

- **What it does**: Mutates every vertex position via a callback function. This is a mesh/polygon deformation concept with no analogue in exact-geometry CAD (OCCT throws).
- **Backend support**: Manifold `CrossSection.warp()`. OCCT throws an error.
- **Compile plan**: NO IR node. Always drops the plan. Cannot be serialized (contains a JS function reference).
- **Usage**: Not used anywhere in the codebase outside its own definition. No tests, no examples.
- **Verdict**: Remove entirely. Fundamentally incompatible with compile plan IR (cannot serialize a function) and with exact-geometry backends.

## Implementation Plan

### Phase 1: Remove warp from Sketch API

1. Remove `warp()` method stub from `Sketch` class in `core.ts`
2. Remove `sketchWarp()` from `operations.ts`
3. Remove prototype assignment from `operations.ts`
4. Keep `warp()` on `ProfileBackend` interface for potential internal use (but consider removing later)

### Phase 2: Remove simplify from public Sketch API

1. Remove `simplify()` method stub from `Sketch` class in `core.ts`
2. Remove `sketchSimplify()` from `operations.ts`
3. Remove prototype assignment from `operations.ts`
4. Update `library.ts` gear code to call `.cross.simplify()` directly on the backend
5. Update SVG import to call `.cross.simplify()` directly
6. Keep `simplify()` on `ProfileBackend` -- it's needed internally for polygon cleanup

### Phase 3: Add compile plan nodes for remaining gaps

1. Extend `offset` IR to support `join: 'Square' | 'Miter'` (currently only 'Round')
2. Add `kind: 'text'` IR node for text glyphs (or decompose text into polygon plans)
3. Add `kind: 'svgImport'` IR node (or decompose SVG into polygon plans)
4. Ensure constrained sketch builder produces plans (polygon plans for solved geometry)
5. Ensure Circle2D.toSketch() produces a plan (circle plan + translate)
6. Ensure section cuts produce plans (projection plan already exists for projectToPlane)

### Phase 4: Make ProfileCompilePlan non-optional

1. Change `WeakMap<Sketch, ProfileCompilePlan | null>` to `WeakMap<Sketch, ProfileCompilePlan>`
2. Update `getSketchCompileProfilePlan()` return type from `ProfileCompilePlan | null` to `ProfileCompilePlan`
3. Remove all null checks / fallback paths in transforms, booleans, operations
4. Update `appendProfileCompileTransform`, `buildBooleanProfileCompilePlan`, etc. to not accept null
5. Fix all remaining call sites

### Phase 5: Remove dead code

1. Remove inline implementations in `core.ts` for offset/hull/simplify/warp (lines 95-106) -- they're dead code overridden by operations.ts prototype assignments

## Files Modified

| File | Changes | Status |
|------|---------|--------|
| `src/forge/sketch/core.ts` | Remove warp/simplify stubs, remove null from plan type, default to opaque | DONE |
| `src/forge/sketch/operations.ts` | Remove warp/simplify, remove fallback paths | DONE |
| `src/forge/sketch/transforms.ts` | Remove fallback paths, always use plan | DONE |
| `src/forge/sketch/booleans.ts` | Remove fallback paths, always use plan | DONE |
| `src/forge/compilePlan.ts` | Add opaque kind, extend offset join types, remove null from builder params | DONE |
| `src/forge/sketch/text.ts` | Use difference2d for ring glyph | DONE |
| `src/forge/sketch/entities.ts` | Add circle plan for Circle2D.toSketch | DONE |
| `src/forge/sketch/constraints/sketch.ts` | Use circle2d(), add empty polygon plan | DONE |
| `src/forge/sketch/svgImport.ts` | Use polygon() + union2d, opaque plan for simplify | DONE |
| `src/forge/section.ts` | Opaque plan for intersectWithPlane, fallback for projectToPlane | DONE |
| `src/forge/library.ts` | Backend-level simplify with opaque plan | DONE |
| `src/forge/forge-api.d.ts` | Remove warp/simplify from Sketch API types | DONE |
| `src/forge/backends/manifold/lower.ts` | Handle opaque plan kind | DONE |
| `src/forge/backends/occt/lower.ts` | Handle opaque plan kind | DONE |
| `src/forge/compilePlanCadQuery.ts` | Handle opaque plan kind | DONE |

## Remaining Work

- The `ProfileBackend` interface still has `simplify()` and `warp()` methods for internal use
- Some downstream code (shellCompilePlan, projectionCompile) still has dead null-checks on builders that now always return non-null; these are harmless but could be cleaned up
- The `opaque` plan kind is a compromise -- ideally section cuts would get proper `kind: 'slice'` IR nodes

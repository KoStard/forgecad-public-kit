# Multi-Export API — Just Use JavaScript

**Status:** Implementation
**Date:** 2026-03-27
**Branch:** `worktree-multi-export-api`

## The Problem

`importPart`, `importSketch`, `importAssembly`, `importGroup` — four typed import functions that each demand the entire return value be a single type. One file = one type.

This is structurally wrong. A real component exports multiple things: three sketches, two shapes, an assembly. You can't paper over named access with type scanning. Named access requires names. Names come from the user.

JavaScript already has this: `const { ring, profile } = require("./file")`.

## The Design (three changes)

### 1. Lift the mixing restriction
Remove the guard in `runner.ts:738-744` that throws when a file has both `return` and `module.exports`. When both exist, merge: `{ ...exports, default: returnValue }`.

### 2. Add param overrides to `require()`
Extend `requireModule` to accept an optional second argument. When present, create a child scope with overrides, same as the current typed imports do.

### 3. Delete the typed imports
Remove `importPart`, `importSketch`, `importAssembly`, `importGroup` from the runtime bindings and public API. Keep `importMesh` and `importSvgSketch` (file format loaders, not module imports).

## The API

```js
// bearing.forge.js — export everything
const profile = circle(10).subtract(circle(5)).sketch();
const ring = profile.extrude(8);

exports.profile = profile;
exports.ring = ring;
return ring;  // what renders when viewing this file

// Or ES module style (transpiled to CommonJS automatically):
// export const profile = ...;
// export default ring;
```

```js
// consumer.forge.js — destructure what you need
const { ring, profile } = require("./bearing.forge.js", { Bore: 5 });
```

### What about IDE autocomplete?

Cross-file imports return `any`. That's the cost of simplicity. The real autocomplete value is in the 60+ injected globals (`box`, `circle`, `param`...) which remain fully typed via the generated ambient `.d.ts`. The user who writes a multi-export file knows what they're getting back.

### What renders when viewing a file?

- `return value` / `export default value` → renders that value (backwards compatible)
- `return { a, b, default: c }` → renders `c`
- Plain object with no `default` → render all renderable values as a group
- Single Shape/Sketch/etc. → renders directly (unchanged)

## Implementation Tasks

### Task 1: Lift the mixing restriction (`runner.ts`)
- Remove the guard clause at lines 738-744
- When `returnValue !== undefined` AND `hasExplicitModuleExports`, merge into `{ ...exports, default: returnValue }`
- Update `moduleCacheEntry` with the merged result

### Task 2: Add param overrides to `require()` (`runner.ts`)
- Change `requireModule` signature: `(requestedName: string, paramOverrides?: Record<string, number>)`
- When overrides present: create child scope via `createTrackedScope` + `makeChildScopePrefix`, pass to `executeFile`
- Overrides affect cache key (different overrides = different cache entry)
- Carry over dimension tracking from `importPart`'s implementation
- Carry over jointsView save/restore from `importPart`'s implementation

### Task 3: Delete typed imports
- Remove `importSketch`, `importPart`, `importGroup`, `importAssembly` function bodies from `runner.ts`
- Remove them from `runtimeBindings` object
- Remove their declarations from `forge-public-api.ts`
- Keep `importMesh` and `importSvgSketch` (file format loaders)

### Task 4: Handle object returns in the renderer (`runner.ts` runScript)
- In the result processing section (~line 984), add handling for plain objects:
  - If result has `.default`, use that as the primary renderable
  - If result is a plain object with renderable values, flatten them into scene objects
  - Existing handling for Shape/Sketch/Array/etc. stays unchanged

### Task 5: Update `require()` type declaration
- In `forge-public-api.ts`, update or add the `require` declaration with optional second arg
- Regenerate the `.d.ts` file

### Task 6: Update examples
- Convert existing multi-file import examples to use `require()` with destructuring
- Create a new multi-export example (bearing or similar)
- Remove examples that demo `importPart`/`importSketch` etc.

### Task 7: Update tests
- Update runner tests that reference typed imports
- Add tests for: multi-export files, require with overrides, object return rendering

## Key Files

| File | What changes |
|---|---|
| `src/forge/runner.ts:738-744` | Remove guard clause, merge return+exports |
| `src/forge/runner.ts:646-713` | Extend `requireModule` with overrides |
| `src/forge/runner.ts:258-505` | Delete typed import function bodies |
| `src/forge/runner.ts:531-644` | Remove typed imports from `runtimeBindings` |
| `src/forge/runner.ts:984-1043` | Handle object returns in renderer |
| `src/forge/forge-public-api.ts` | Remove typed import declarations, add require signature |
| `scripts/gen-forge-types.mjs` | May need adjustment for require declaration |

# Autocomplete Broken in Monaco Editor

**Date:** 2026-03-27
**Status:** Root cause found, fix applied

## Goal & Current State

Monaco editor shows no autocomplete for ForgeCAD APIs (box, cylinder, extrude, etc.) despite `forge-api.d.ts` being loaded via `addExtraLib()`.

**Baseline:** Zero autocomplete. No ForgeCAD function suggestions appear.

## Architecture Summary

```
forge-public-api.ts
  → dts-bundle-generator
  → /tmp/forge-api-raw.d.ts (raw bundled types)
  → gen-forge-types.mjs post-processing:
      1. Replace external imports with `type X = unknown` stubs
      2. Strip `export` keywords → ambient declarations
  → src/forge/forge-api.d.ts
  → CodeEditor.tsx: monaco.languages.typescript.javascriptDefaults.addExtraLib(FORGE_TYPES)
```

## Root Cause

In `scripts/gen-forge-types.mjs`, the regex that removes external imports:

```js
/^import \{([^}]+)\} from '[^']+';?\s*\n?/gm
```

Only matches **named imports** (`import { Foo, Bar } from 'pkg'`). The `dts-bundle-generator` output includes a **default import**:

```ts
import opentype$1 from 'opentype.js';
```

This slips through unhandled. One top-level `import` statement turns the entire `.d.ts` file from ambient declarations into a TypeScript **module** — so nothing is globally accessible. Monaco's `addExtraLib()` receives a module file, not ambient globals, and autocomplete produces nothing.

## Progress Tracker

| # | Change | Autocomplete | Status |
|---|--------|-------------|--------|
| — | Baseline | None | ❌ |
| P1 | Handle default + namespace imports in gen-forge-types.mjs | All ForgeCAD APIs | ✅ |

## Experiment Log

#### P1 — Handle default and namespace imports (SUCCESS)

**What:** Extended `gen-forge-types.mjs` to also replace default imports (`import X from 'pkg'`) and namespace imports (`import * as X from 'pkg'`) with `type X = unknown` stubs, before the named-import pass.

**Result:** The `import opentype$1 from 'opentype.js'` line is now stripped. The generated `forge-api.d.ts` has no top-level `import` statements. TypeScript treats it as ambient declarations again, restoring global visibility in Monaco.

**Why it worked:** A `.d.ts` file with any top-level `import` is a module, not a script. Removing all imports makes it ambient, which is what `addExtraLib()` expects.

## Files Modified

| File | Change |
|------|--------|
| `scripts/gen-forge-types.mjs` | Added default + namespace import handling |

# Param Override Validation on Import

## Goal & Current State

**Goal**: When a user passes param overrides to `importPart`/`importGroup`/`importAssembly`/`importSketch`, validate that every override name matches a `param()` or `boolParam()` call in the imported file. Currently, typos or wrong names are silently ignored.

**Baseline**: No validation — any key in the overrides object is accepted silently.

## Architecture Summary

The import param flow:
1. Caller: `importPart("file.forge.js", { "Width": 10 })`
2. `parseImportParamArgs()` validates values are finite numbers
3. `childScope = { namePrefix, localOverrides: { "Width": 10 } }`
4. `executeFile()` runs the imported file inside `runWithParamScope(scope, ...)`
5. Inside the file, `param("Width", 80)` checks `scope.localOverrides["Width"]` → finds 10
6. If the file never calls `param("Width", ...)`, the override is silently ignored

**Fix**: Track which `localOverrides` keys are consumed by `param()`/`boolParam()`. After `executeFile()`, check for unconsumed keys and throw an error with helpful suggestions.

## Progress Tracker

| # | Change | Result | Status |
|---|--------|--------|--------|
| — | Baseline | Silent ignore of wrong param names | Current |
| P1 | Track consumed keys + validate after executeFile + fuzzy suggestions | Errors on typos, suggests correct names | ✅ |

## Experiment Log

#### P1: Consumed-key tracking with Levenshtein suggestions (SUCCESS)
**What**: Added `consumedKeys` Set to `ParamScope`. `param()`/`boolParam()` record consumed keys. After `executeFile()`, `validateConsumedOverrides()` checks for unconsumed keys and throws with fuzzy-match suggestions.
**Result**:
- `"Hieght"` → `did you mean "Height"?`
- Passing params to file with no params → `Available parameters: (none)`
- Valid params → no change in behavior
- Check suite: same pass/fail count as baseline (7/5)
**Lesson**: Validation at the scope boundary (after executeFile) is clean — no need to change executeFile itself.

## Files to Modify

| File | Purpose |
|------|---------|
| `src/forge/params.ts` | Add `consumedKeys` tracking to `ParamScope`, expose `getUnconsumedOverrides()` |
| `src/forge/runner.ts` | Call validation after each `executeFile()` in import functions |

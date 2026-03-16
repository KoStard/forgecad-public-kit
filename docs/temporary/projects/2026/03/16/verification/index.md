# ForgeCAD Verification API — Project Summary

**Date:** 2026-03-16
**Branch:** `worktree-test_validation`

---

## What We Built

A non-fatal geometry assertion system for `.forge.js` scripts — think Jest/Vitest but for 3D parts. Users (or LLMs doing test-driven design) can embed `verify.*()` calls in their models. When the script runs, all checks are evaluated, results are collected, and the model renders regardless of failures. A dedicated panel surfaces the results with click-to-navigate.

### Core API (available in every `.forge.js` script)

```js
// Geometric checks
verify.centersCoincide("shaft alignment", shaftA, shaftB, 0.01);
verify.notColliding("gear clearance", gearA, gearB);
verify.minClearance("bolt head clearance", bolt, plate, 1.5);
verify.parallel("mounting surfaces", plate.face("top"), bracket.face("top"));
verify.perpendicular("rib angle", rib.face("front"), base.face("top"));
verify.coplanar("mating faces", flange.face("top"), housing.face("bottom"));
verify.faceAt("bore centre", shaft.face("top"), [0, 0, 50], 0.05);
verify.sameDirection("normals face same way", faceA, faceB);

// Dimensional checks
verify.volumeApprox("bracket volume", bracket, 5430, 50);
verify.areaApprox("top face area", lid, 2400, 20);
verify.boundingBoxSize("plate dimensions", plate, [60, 40, 5], 0.5);

// Numeric assertions
verify.equal("gap mm", measuredGap, 20, 0.5);
verify.greaterThan("wall thickness", thickness, 2);
verify.inRange("shaft diameter", dia, 9.9, 10.1);

// Custom predicates
verify.that("bolt pattern is symmetric", () => checkSymmetry(bolts), "bolts must be symmetric");
```

All checks silently collect `VerificationResult` entries. No exceptions. No model crashes.

---

## Architecture

### Data Flow

```
.forge.js script
  └─ calls verify.*()  →  pushes to _collected[]  (verification.ts)
         │
  runner.ts reset/collect lifecycle:
    resetVerifications()    ← before execution
    getCollectedVerifications()  → attached to RunResult
         │
  SerializedRunResult (worker protocol)
    → evalWorkerProtocol.ts
    → serializeRunResult.ts  (pass-through, plain JSON objects)
    → deserializeRunResult.ts
         │
  Zustand store  (result.verifications)
         │
  VerificationsPanel  ←  click  →  requestEditorNavigate(line)
         │
  CodeEditor  (editorRef.revealLineInCenter + setPosition)
```

### Module pattern

`verification.ts` follows the same `reset / collect` module-singleton pattern as `bom.ts`, `cutPlane.ts`, and `dims.ts`. This makes it invisible to the worker serialization layer — `VerificationResult` is a plain JSON object (no WASM, no classes) and passes through `postMessage` with zero extra handling.

---

## Design Decisions

### Non-fatal by construction

The initial brief was clear: failing checks must not crash the model. The collector approach achieves this — all check methods catch their own errors and push a `fail` result. The caller never throws. Even if `shape.boundingBox()` throws inside a check, it becomes a `fail` entry with an error message.

This lets you write test-first: define what the model should satisfy, then build until the checks go green — exactly like TDD for geometry.

### Line number extraction

Clicking a failing check should jump the editor to the line that called `verify.that(...)` etc. This is non-trivial inside a `new Function()` sandbox.

**Approach:** `new Error().stack` inside each check method, parsed for `.forge.js:LINE:COL` frames. The runner injects a `//# sourceURL=<fileName>` comment into the transpiled code, which V8 picks up and includes in stack traces.

**The correction factor:** The runner's `new Function(...)` wrapper adds a small preamble before the user code (the function signature parameters). After empirical testing, subtracting 2 from the raw line number produces accurate source positions. We use `Math.max(1, rawLine - 2)` to stay safe.

**Caveat:** Line numbers are heuristic. TypeScript transpilation may shift lines slightly. The correction works well for simple cases; complex TS syntax might be off by ±1. For a future iteration, we could hook into the runner's existing source-map infrastructure (`mapGeneratedPositionToSource`) — but that would require passing the compiled source map back into the verification capture, which adds complexity. The heuristic is good enough for the primary use case.

**Passes don't carry line numbers** — there's no reason to navigate to a passing check, and it keeps the data smaller.

### Failure-first ordering in the panel

The `VerificationsPanel` renders failures first, passes second (separated by a divider). This mirrors test runner conventions (red before green) and puts actionable items at the top without requiring the user to scroll.

### Auto-expand on new failures

The panel auto-expands when failures appear (same pattern as `ConsolePanel` with errors). It does not auto-collapse on fix — this is intentional. The user may want to scan all results after fixing, not have the panel jump closed.

### `editorNavigate` store action

Instead of passing Monaco editor refs between components, we use the same `ViewCommand` pattern already in the store: a `{ line, id }` object where `id` is monotonically incremented on each request. The `useEffect` in `CodeEditor` re-fires whenever `id` changes, even if the line stays the same. The `id` also means `clearEditorNavigate` is just a `set({ editorNavigate: null })` — clean and simple.

---

## What Was Challenging

### 1. Stack trace parsing across execution contexts

The `new Function()` sandbox doesn't always produce clean stack frames. Browsers differ. Frames may look like:
- `at eval (myFile.forge.js:14:5)` — Chrome
- `at Object.<anonymous> (myFile.forge.js:14:5)` — sometimes
- `at myFile.forge.js:14:5` — Node / some Chromium variants
- `at <anonymous>:14:5` — when sourceURL annotation is missing

The regex handles all these variants. The `.forge.js` / `.sketch.js` extension filter ensures we pick up user files and not internal ForgeCAD frames.

### 2. Keeping `verification.ts` kernel-agnostic

The verification module must not import from `./kernel` — that would create a circular dependency and break the worker bundle. The solution: duck-typed interfaces (`ShapeLike`, `FaceRefLike`) defined locally. The actual `Shape` / `TrackedShape` / `FaceRef` objects satisfy these interfaces structurally.

### 3. Worker serialization

`VerificationResult` is a plain-object type — no Buffers, no WASM handles. It passes through `postMessage` as-is. We only needed to add it to `SerializedRunResult` in the protocol type, `serializeRunResult`, and `deserializeRunResult`. The `?? []` fallback in `deserializeRunResult` makes it forwards-compatible with any cached/old results that pre-date this feature.

### 4. The `FORGE_TYPES` string in CodeEditor

This is a hardcoded ambient declaration string that Monaco uses for autocomplete. Adding `declare const verify: { ... }` with JSDoc for every method gives users full type-checked autocomplete in the editor. The duck-typed `VerifyShapeLike` / `VerifyFaceRef` types in the declaration are intentionally broader than the actual runtime types so that `TrackedShape.face("top")` → `FaceRef` → `VerifyFaceRef` works without explicit casts.

---

## Risks and Future Concerns

### Line number accuracy

As noted, line numbers are heuristic. For high-precision navigation, the right solution is to integrate with the runner's existing `sourceMapSegments` infrastructure — pass the source-map back from `compileScript` and use `mapGeneratedPositionToSource` at capture time. This would require making the source map available inside the sandboxed execution context, probably via a closure.

### Module-level singleton vs. concurrent execution

The `_collected[]` array is a module-level singleton, which is fine for single-threaded worker execution. If ForgeCAD ever runs multiple scripts concurrently (e.g. parallel notebook cells), each would need its own verification context. The `resetVerifications()` / `getCollectedVerifications()` design makes that migration straightforward — just change the singleton to a context parameter.

### Tolerance defaults

The defaults (`tolerance = 0.01` for `centersCoincide`, `toleranceDeg = 1.0` for angular checks) are reasonable but opinionated. Users working with very precise CNC parts may need tighter defaults. Consider making them configurable via a `verify.configure({ defaultTolerance: ... })` call in a future iteration.

### No async checks

All checks are synchronous. For assembly-level checks that require solving kinematics at multiple joint states, you'd need an async variant. Out of scope for now but worth noting.

### Test isolation / labeling

Right now there's no concept of test groups or suites. For complex assemblies with many checks, a `verify.group("Shaft Assembly", () => { ... })` wrapper would help organize output. Easy to add later without changing the panel component significantly.

---

## Files Changed

| File | Change |
|------|--------|
| `src/forge/verification.ts` | **New** — collector module with all check methods |
| `src/forge/runner.ts` | Add `verifications` to `RunResult`, reset/collect lifecycle, `verify` in runtimeBindings |
| `src/forge/headless.ts` | Re-export `VerificationResult`, `VerificationStatus` |
| `src/forge/index.ts` | Re-export types |
| `src/forge/serializeRunResult.ts` | Pass `verifications` through to wire format |
| `src/forge/deserializeRunResult.ts` | Reconstruct `verifications` from wire format |
| `src/workers/evalWorkerProtocol.ts` | Add `verifications: VerificationResult[]` to `SerializedRunResult` |
| `src/store/forgeStore.ts` | Add `editorNavigate` state + actions; update `createErrorRunResult` |
| `src/components/CodeEditor.tsx` | Editor ref, navigation effect, `verify` type declarations, warning status bar |
| `src/components/VerificationsPanel.tsx` | **New** — collapsible panel with click-to-navigate |
| `src/App.tsx` | Mount `VerificationsPanel` in left panel stack |
| `examples/api/verification-demo.forge.js` | **New** — demo with intentional passes and failures |

---

## Example Usage

```js
// test-driven bracket design
const w = param("Width", 60, { min: 20, max: 120 });
const h = param("Height", 40, { min: 20, max: 80 });

const bracket = box(w, h, 5);

// Define what "correct" looks like before tweaking geometry
verify.greaterThan("minimum wall area", bracket.face("top").area ?? w * h, w * h * 0.8);
verify.volumeApprox("volume in spec", bracket, w * h * 5, 10);
verify.notEmpty("bracket exists", bracket);
verify.boundingBoxSize("correct footprint", bracket, [w, h, 5], 0.5);

return bracket;
```

LLM workflow: user describes the constraints, LLM writes the `verify.*()` calls, then iteratively builds geometry until all checks pass. The non-fatal design means partial progress is always visible — you see the model and the failing checks simultaneously.

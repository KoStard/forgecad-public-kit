# Cached Solve Plans

## Goal & Current State

**Goal**: Eliminate redundant decomposition and redundancy-detection work during interactive constraint editing (dragging, value tweaking). When the user drags a dimension value, the topology doesn't change — only numeric values do. We should reuse the previous decomposition and skip expensive redundancy checks.

**Baseline**: Every `updateConstraintValue` / `withUpdatedConstraint` call runs fresh decomposition (Union-Find, component partitioning, topological sort) and full redundancy detection (Jacobian rank analysis). For the spectrogram system (~80 constraints), this adds measurable overhead per frame.

## Architecture Summary

### Topology Fingerprinting
`computeTopologyFingerprint(def)` produces a stable string encoding:
- Point IDs + fixed status
- Line IDs + endpoint pairs
- Circle IDs + center + fixedRadius
- Arc IDs + center/start/end
- Shape IDs + constituent lines
- Constraint types + sorted entity references

Two definitions with the same fingerprint have identical decomposition structure regardless of numeric values.

### DecompositionCache
```typescript
interface DecompositionCache {
  fingerprint: string;
  components: Set<string>[];  // entity ID sets per component
}
```

### Warm-Start Path
`updateConstraintValue` and `withUpdatedConstraint` now:
1. Build cache from the **previous** (solved) definition
2. Clone definition, apply new value
3. Solve with `{ restarts: 1, warmStartIterations: 0, cachedDecomposition, skipRedundancyCheck }`
4. If `maxError <= tolerance * 5` → return warm result
5. Otherwise → fallback to full fresh solve (safety net)

### skipRedundancyCheck
When the previous solve had `dof >= 0`, a small numeric change cannot introduce redundancy (no new constraints were added). We skip the O(m*n*min(m,n)) Jacobian rank analysis.

## Progress Tracker

| # | Change | Tests | Correctness | Status |
|---|--------|-------|-------------|--------|
| -- | Baseline | 73 pass | All correct | OK |
| P1 | Topology fingerprinting + DecompositionCache type | 75 pass | Fingerprint stable, changes on topology change | DONE |
| P2 | Cache-aware decomposeAndSolve | 77 pass | Falls back on stale cache, reuses valid cache | DONE |
| P3 | Warm-start in updateConstraintValue/withUpdatedConstraint | 79 pass | Converges for small changes, fallback works | DONE |
| P4 | skipRedundancyCheck + full L10 test suite | 80 pass | DOF correct, no false positives | DONE |

## Experiment Log

#### P1: Topology Fingerprinting (DONE)
**What**: Added `computeTopologyFingerprint()` and `DecompositionCache` type to `decompose.ts` and `types.ts`.
**Result**: Fingerprints are deterministic across clones, change when topology changes.
**Tests**: `testTopologyFingerprintStable`, `testTopologyFingerprintChangesOnConstraintAdd`.

#### P2: Cache-Aware Decomposition (DONE)
**What**: `decomposeAndSolve()` checks `options.cachedDecomposition` — if fingerprint matches, reuses component sets instead of running Union-Find. `buildDecomposition()` exported for external cache construction.
**Result**: Multi-component systems correctly partitioned. Stale cache (fingerprint mismatch) falls back to fresh decomposition transparently.
**Tests**: `testBuildDecompositionMultiComponent`, `testCachedDecompositionReuse`, `testCacheInvalidationOnTopologyChange`.

#### P3: Warm-Start Solve Path (DONE)
**What**: `updateConstraintValue` and `ConstraintSketch.withUpdatedConstraint` now use warm-start: previous positions as initial guess, single restart, no GS warm-start, cached decomposition.
**Result**: Small value changes converge in 1 restart. Large changes or topology mismatches trigger automatic fallback to full solve.
**Safety**: If warm result has `maxError > tolerance * 5`, the code discards it and does a full solve from scratch.
**Tests**: `testWarmStartConvergence`.

#### P4: Skip Redundancy Check (DONE)
**What**: `skipRedundancyCheck` flag in `SolveOptions`. When set, `solveConstraintDefinition` skips `findRedundantConstraints()`. Set automatically when previous `dof >= 0`.
**Result**: Correct DOF for fully constrained systems. No false positives since topology hasn't changed.
**Tests**: `testSkipRedundancyCheckCorrectness`.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/constraints/types.ts` | `DecompositionCache`, `SolveOptions.cachedDecomposition`, `SolveOptions.skipRedundancyCheck` |
| `src/forge/sketch/constraints/decompose.ts` | `computeTopologyFingerprint`, `buildDecomposition`, `solveWithCachedComponents`, cache-aware `decomposeAndSolve` |
| `src/forge/sketch/constraints/sketch.ts` | Warm-start in `updateConstraintValue` and `withUpdatedConstraint`, `skipRedundancyCheck` in `solveConstraintDefinition` |
| `src/forge/sketch/constraints/index.ts` | New exports: `DecompositionCache`, `buildDecomposition`, `computeTopologyFingerprint` |
| `cli/check-constraints.ts` | L10 test suite (7 tests) |

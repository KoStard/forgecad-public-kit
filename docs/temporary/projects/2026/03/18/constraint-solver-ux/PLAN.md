# Constraint Solver UX Improvement Plan

**Goal**: Make constraint solver output clear, actionable, and testable — both in the browser UI and the terminal CLI.

**Current state**: The solver works correctly (12.8× faster after optimization), but the UX has several issues:
- Terminal shows less information than the browser UI
- "OVER -4" status is confusing — doesn't distinguish redundant from conflicting
- Constraint labels are generic ("LDIST", "PAR") — impossible to tell which is which
- All lines show red, all constraints show orange — no differentiation
- Redundant constraints (e.g., parallel + lineDistance which implies parallel) flagged as overconstrained
- No curated test suite showing different outcomes and capabilities

---

## Issues & Plan

### 1. Terminal parity with browser UI
**Problem**: CLI `check constraints` shows pass/fail but doesn't render the same constraint metadata the browser shows.
**Fix**: Add CLI output that mirrors the browser's constraint list, status badge, per-constraint status.

### 2. Status messaging — "OVER -4" is confusing
**Problem**: "over" conflates two cases: (a) genuinely conflicting constraints, and (b) redundant constraints where everything is satisfied but DOF < 0.
**Fix**: Distinguish `over-redundant` (converged, DOF < 0) from `over-conflicting` (failed to converge). Show clearer status labels.

### 3. Constraint identification in UI
**Problem**: Multiple constraints of the same type (e.g., 5× "LDIST=5") are indistinguishable.
**Fix**: Show entity references in labels, add click-to-highlight interaction.

### 4. Per-constraint status coloring
**Problem**: All constraints show orange when system is overconstrained, even if individual constraints are satisfied. Lines show red globally.
**Fix**: Color individual constraints by their own residual status. Show which specific constraints are problematic.

### 5. Redundancy vs conflict distinction
**Problem**: `parallel + lineDistance(0)` triggers "overconstrained" warning even though lineDistance implies parallelism. The solver converges fine — the warning is misleading.
**Fix**: Separate redundant (cosmetic issue) from conflicting (real problem). Show redundant constraints as informational, not as errors.

### 6. Curated test suite
**Problem**: Tests are embedded in check-constraints.ts code. No standalone test files that demonstrate capabilities.
**Fix**: Create test sketch files in a dedicated directory showing different outcomes: fully constrained, underconstrained, overconstrained, redundant, conflicting, etc.

---

## Progress Tracker

| # | Task | Status |
|---|------|--------|
| 1 | Terminal parity | ✅ DONE |
| 2 | Status messaging cleanup | ✅ DONE |
| 3 | Constraint identification | 🔶 PARTIAL — entity IDs shown in CLI, click-to-highlight in browser TODO |
| 4 | Per-constraint coloring | 🔶 PARTIAL — CLI shows per-constraint status; browser still uses global color |
| 5 | Redundancy vs conflict | ✅ DONE |
| 6 | Curated test suite | ✅ DONE |

---

## Completed Work

### Terminal parity (Issue 1) — ✅
- `test-run.ts`: Shows status badge (colored), DOF, maxError, constraint count for every sketch
- `test-run.ts`: Shows problematic constraints (conflicting, redundant, high residual) with entity IDs
- `check-constraints.ts`: New `printConstraintSummary()` with full constraint table, colored icons, entity refs

### Status messaging (Issue 2) — ✅
- New `'over-redundant'` status: DOF < 0 but converged (maxError low) → yellow "OVER-REDUNDANT"
- Original `'over'` status: DOF < 0 and failed to converge → red "OVER" (genuine conflict)
- Updated across all surfaces: registry.ts, types.ts, ViewPanel.tsx, Viewport.tsx, sketch-svg.ts, forge-api.d.ts

### Redundancy vs conflict (Issue 5) — ✅
- Fixed property name bugs: `c.conflicting` → `c.isConflicting`, `c.redundant` → `c.isRedundant`
- Fixed status comparison: `'over-constrained'` → `'over'`
- Per-constraint `residual` and `entityIds` added to ConstraintDisplay type
- Redundant constraints show yellow `~` icon, conflicting show red `✗`, satisfied show green `✓`

### Curated test suite (Issue 6) — ✅
8 files in `examples/constraints/`:
| File | Scenario | Expected |
|------|----------|----------|
| 01 | Fully constrained rectangle | green FULLY DOF=0 |
| 02 | Underconstrained triangle | blue UNDER DOF>0 |
| 03 | Redundant constraints (horizontal + absoluteAngle(0)) | yellow OVER-REDUNDANT |
| 04 | Conflicting constraints (length=10 + length=20) | red OVER |
| 05 | parallel + lineDistance (implied redundancy) | yellow OVER-REDUNDANT |
| 06 | Complex spectrogram (54 constraints, 31 points) | yellow OVER-REDUNDANT DOF=-4 |
| 07 | Perpendicular chain zigzag | green FULLY |
| 08 | Symmetric L-bracket | green FULLY |

### Remaining browser UI work (Issues 3, 4)
- Click-to-highlight: clicking a constraint in the panel should highlight its referenced edges/points in the viewport
- Per-constraint coloring: individual constraint colors based on own residual, not global status

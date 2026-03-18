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
| 1 | Terminal parity | TODO |
| 2 | Status messaging cleanup | TODO |
| 3 | Constraint identification | TODO |
| 4 | Per-constraint coloring | TODO |
| 5 | Redundancy vs conflict | TODO |
| 6 | Curated test suite | TODO |

---

## Experiment Log

(Experiments will be logged here as work progresses.)

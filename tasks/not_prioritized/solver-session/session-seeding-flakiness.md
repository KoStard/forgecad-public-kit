# Session Seeding Flakiness — wrapper-rect and multi-rect CCW

## Problem Definition

The session seed path (`seed_step_lm()`) produces slightly different geometry than the stateless path (`solve_global()`) for some test cases. `wrapper-rect` consistently fails with maxError ~50-280 and `multi-rect CCW` intermittently fails with maxError ~40-127. These are non-deterministic due to floating-point sensitivity in the seeding order.

## Description

Root cause: `seed_step_lm()` is a simplified LM loop (GS warm-start + LM iterations) while `solve_global()` includes restarts, GS escape rounds, and nullspace analysis. The simplified loop lacks the escape hatch for pathological constraint configurations where LM gets stuck in a local minimum.

Options:
1. **Add GS escape to `seed_step_lm()`** — match `solve_global` behavior. Trades per-step speed (~2ms more) for convergence robustness.
2. **Hybrid fallback** — use `seed_step_lm()` normally, fall back to `solve_global()` when error doesn't decrease. Best of both worlds but more complex.
3. **Accept flakiness** — the final `solve()` uses the full solver. Seed quality affects convergence speed but not correctness. The flaky tests may pass with the final solve even if seeding is imperfect.

## Requirements

- `wrapper-rect` test must pass consistently
- `multi-rect CCW` test must pass consistently
- No regression on case_wood total time (currently ~1.7s)

## Key Files

| File | Change |
|------|--------|
| `solver/src/solver/lm.rs` | `seed_step_lm()` — add escape hatch or fallback |
| `solver/src/solver/session.rs` | `seed_step()` — hybrid fallback logic |

## Status and Log

- 2026-03-21: Identified as pre-existing from P1 session introduction, not caused by P2/P3

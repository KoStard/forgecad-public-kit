# Example Gap Recovery And Legacy Fence
## Problem Definition
After the main example families are migrated, there will likely still be holdouts.

Those holdouts are acceptable only if they are explicit and temporary.

If we skip this cleanup, the repo will still have examples that "kind of work" without anyone knowing whether they are:

- real architecture blockers
- simple migration leftovers
- or examples that should be fenced off as legacy/experimental

## Description
Resolve the remaining example holdouts after the first migration wave.

This task should:

- review all examples still outside the architecture-phase gate
- fix the ones that are realistically fixable with small coherent changes
- fence the true holdouts as explicit temporary `legacy` / `experimental` cases
- leave a concrete blocker list for anything still not inside the active architecture phase

Primary files:

- remaining holdout examples
- example manifest entries
- holdout/backlog docs if needed
- example-gate and docs surfaces touched by holdout classification

## Acceptance Criteria
- There are no uncategorized failing examples left in the example gate.
- Every remaining non-green example is either:
  - fixed
  - intentionally classified as a temporary holdout
  - or removed from the active example surface by an explicit documented decision
- Every temporary holdout has:
  - a specific blocker reason tied to a current architecture limit
  - a task or backlog reference for follow-up
- The repo no longer has examples that fail the gate without an explicit classification and reason.
- The output of the example gate can be used directly in a phase-entry review.

## Isolation Rule
- This is a recovery and fencing task, not a broad new feature wave.
- Prefer honest classification over heroic feature work.
- Only widen compiler semantics when the blocker is small, well-bounded, and required to keep the example surface truthful.

## Dependencies
- task 240
- task 250
- task 260
- task 270

## Parallelization
Starts after the first example migration wave settles.

## Status and log
- 2026-03-12: Created as the holdout-resolution lane after the main example migration wave.
- 2026-03-13: Recovered the three mixed-route part holdouts into scoped `faceted` contracts, left only the fenced experimental probes outside the active architecture phase, and taught the example gate to print the remaining temporary fence list directly.

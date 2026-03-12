# Second Wave Red-Green And Sync
## Problem Definition
Tasks 200, 210, and 220 are materially merged, but the branch is not yet in a clean closeout state.

Right now:

- `npm test` fails in the query-propagation suite for the `hole-cut-workflows` case
- it is not yet clear whether that failure is a real propagation regression or a stale expected contract
- the temporary backend-compiler program docs still describe the second wave as active instead of landed

We should not start the MLP closeout lane on top of a red or misleading branch.

## Description
Bring the second post-160 feature wave back to a truthful green baseline before task 230 starts.

This task should:

- reconcile the `hole-cut-workflows` query-propagation mismatch
- decide honestly whether the right fix is feature logic, expectation updates, or both
- update snapshots only after the contract is reviewed and defended
- sync the temporary program docs and task statuses to show the real state of the branch

Primary files:

- `cli/check-query-propagation.ts`
- `cli/snapshots/query-propagation-snapshots.json`
- any propagation/query source files required to fix a real bug
- `docs/temporary/projects/2026/03/backend-compiler-program/`
- `tasks/220-broader-fillet-and-chamfer.md`

## Requirements
- Leave the branch with `npm test` and `npm run build` passing.
- Do not paper over a real regression with a snapshot refresh alone.
- If the propagation contract changed intentionally, update the assertions and snapshots to the new defended contract and document the change.
- If the propagation contract regressed unintentionally, restore the intended behavior and keep the test expectation.
- Update temporary program docs so they no longer present tasks 200, 210, and 220 as the active wave.
- Make task 230 the next clear lane once this cleanup lands.

## Isolation Rule
- This is a red-green and truthfulness pass, not a new feature-family task.
- Prefer the smallest coherent fix that restores an honest green baseline.
- Avoid widening supported semantics unless that is the only correct fix for the failing contract.
- Keep edits centered on query-propagation checks/contracts and program-state docs.

## Dependencies
- task 200
- task 210
- task 220

## Parallelization
Should run before task 230.

This task is intentionally single-owner because it touches the boundary between compiler semantics, regression contracts, and program-state docs.

## Status and log
- 2026-03-12: Created to reconcile the post-200 wave before the MLP closeout lane starts.

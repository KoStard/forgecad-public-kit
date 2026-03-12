# Backend Compiler Cleanup And Sync
## Problem Definition
The last agent wave landed real code for tasks 105, 110, 120, 140, and 150, but the program-control artifacts are no longer in sync with reality.

Right now the repo still has stale status markers and a few overstated corpus claims:

- some task files still say "Not started" even though code landed
- the task graph still reflects the pre-merge queue
- parts of the regression corpus wording imply capability that the compiler-owned feature set does not actually provide yet

Before the fillet/chamfer lane starts, the repo needs one honest cleanup pass so future agents are assigned against the real current state rather than stale task text.

## Description
Do a documentation and task-control cleanup pass for the backend compiler program.

This task should:

- update the task files for 105, 110, 120, 140, and 150 to reflect what actually landed
- update the program task graph so it reflects the current queue, not the old "ready to start" state
- tighten corpus/docs wording anywhere capability is overstated
- align the mission tracker and capability docs with the actual implemented subset

This is a coordination task, not a new feature task.

## Requirements
- No intentional semantic feature changes unless the cleanup uncovers a genuine bug that must be fixed for honesty.
- Update task statuses/logs for the completed agent lanes.
- Correct overstated wording in corpus docs and capability docs.
- Leave a clear "next up" state for task 130.

## Status and log
- 2026-03-12: Created after the first multi-agent review.
- 2026-03-12: Ready to assign immediately.

# Fillet And Chamfer Dual Lowering
## Problem Definition
Fillet/chamfer are part of the normal design-tool stack, and Forge now has the edge-query backbone needed to start them. But durable edge identity after topology-changing operations is still not solved, so this task must target an honest first subset instead of pretending to solve the whole problem.

## Description
Implement the first compiler-owned fillet/chamfer slice on top of shared edge-query contracts.

Scope this task to the subset Forge can currently defend:

- tracked-edge queries on compile-covered bodies
- edges that come from tracked topology before shell/boolean/hole/cut topology rewriting
- explicit exact/runtime diagnostics when the selected edge set falls outside that supported subset

Do not claim durable downstream identity for post-shell, post-boolean, or otherwise topology-rewritten edges in this task.

Primary dependencies:

- task 105
- task 125 to sync the repo/task state before the next feature lane starts
- task 150 for regression corpus support

Primary files:

- new fillet/chamfer feature modules
- thin integration into compile nodes/lowerers
- exact/runtime regression checks

## Requirements
- Consume shared edge-query contracts rather than raw edge names.
- Lower through both backends for the supported subset.
- Start with an explicit constrained subset rather than vague "general fillet/chamfer support".
- Add regression cases that prove ordinary tracked-topology part edits still work after edge finishing for that subset.
- Document exact capability gaps explicitly.

## Status and log
- 2026-03-12: Initially blocked on task 105.
- 2026-03-12: Re-scoped after multi-agent review. Edge-query groundwork is in, but this task remains blocked on task 125 so the program state and capability claims are cleaned up before the next feature lane starts.
- 2026-03-12: Next up. Task 125 synced the repo state and capability docs, so this is now the next backend-compiler lane to assign with the constrained tracked-edge subset described above.

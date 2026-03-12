# Fillet And Chamfer Dual Lowering
## Problem Definition
Fillet/chamfer are part of the normal design-tool stack, but they are not safe to land until Forge has a shared edge-query backbone. Without that, the feature will either overfit to brittle edge names or diverge between backends.

## Description
Implement compiler-owned fillet/chamfer semantics after the edge-query backbone exists.

Primary dependencies:

- task 105
- task 150 for regression corpus support

Primary files:

- new fillet/chamfer feature modules
- thin integration into compile nodes/lowerers
- exact/runtime regression checks

## Requirements
- Consume shared edge-query contracts rather than raw edge names.
- Lower through both backends for the supported subset.
- Add regression cases that prove ordinary downstream part edits still work after edge finishing.
- Document exact capability gaps explicitly.

## Status and log
- 2026-03-12: Blocked on task 105.
- 2026-03-12: Not started.


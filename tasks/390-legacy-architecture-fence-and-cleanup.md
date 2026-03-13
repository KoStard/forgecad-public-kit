# Legacy Architecture Fence And Cleanup
## Problem Definition
The old architecture should not be removed in one risky flag day, but it also should not remain a permanent shadow system. As compiler coverage grows, legacy paths need to be fenced, measured, and retired deliberately.

## Description
Inventory, fence, and progressively retire old-architecture behavior that bypasses the compiler or keeps backend-specific logic in the wrong place.

Primary dependencies:

- tasks 300, 310, 320, 330, 340, 350, 360, 370, 380

Primary files:

- compiler/permanent architecture docs
- runtime/export compatibility shims
- example manifest and check surfaces
- targeted cleanup commits in legacy modules

## Requirements
- Inventory the remaining legacy paths:
  - backend-specific feature logic at callsites
  - exporter-only feature behavior
  - raw runtime topology assumptions that should now be compiler-owned
- Fence legacy behavior behind explicit compatibility boundaries so new feature work cannot quietly extend it.
- Remove dead or duplicated paths where the compiler-owned replacement is already complete.
- Keep compatibility shims only where the supported example surface still needs them, and document why each shim remains.
- Leave the repo with a clear answer to "what still belongs to the old architecture?" instead of letting that answer stay tribal.

## Status and log
- 2026-03-13: Blocked on the current achievable feature wave.
- 2026-03-13: Not started.

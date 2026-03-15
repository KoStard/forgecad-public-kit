# Broader Shell Workflows
## Problem Definition
`shell()` exists as a narrow defended subset today. That is useful, but not yet broad enough to count as a comfortable daily-use part-design feature.

## Description
Broaden shell support from the current v1 subset into a stronger ordinary part-design workflow while staying compiler-owned and explicit about limits.

Primary dependencies:

- task 300

Primary files:

- shell feature modules
- `src/forge/shapeFaces.ts`
- compile lowerers and diagnostics
- shell regression corpus cases

## Requirements
- Broaden shell coverage beyond the narrow v1 base subset where both lowerers can defend it honestly.
- Support richer opening selection using compiler-owned descendant regions instead of fixed top/bottom slots only.
- Preserve created-face ownership well enough for downstream projection, holes, cuts, and finishing in the defended subset.
- Add regression parts that prove shell-created inner/outer wall faces can be targeted later without brittle synthetic naming.
- Document unsupported shell shapes and topology situations explicitly.

## Status and log
- 2026-03-13: Blocked on task 300.
- 2026-03-13: Not started.
- 2026-03-15: Completed.

## What landed

### Opening selection broadened
`shell()` now accepts any face name (or canonical alias) in `openFaces`, not just `'top'` and `'bottom'`. Box bases support all six walls: `top`, `bottom`, `front`/`side-bottom`, `back`/`side-top`, `left`/`side-left`, `right`/`side-right`. Cylinder and extrude bases continue to support `top`/`bottom` only; requesting side openings on those bases produces a clear diagnostic.

Canonical aliases (`front`, `back`, `left`, `right`) are normalised to their internal face-table equivalents (`side-bottom`, `side-top`, `side-left`, `side-right`) at plan-build time, so stored plans and `shapeFaces` resolution are always consistent.

### Compiler-owned face propagation maintained
The `shellCreatedFaceNames` function now checks `openFaces.includes(name)` against the base face table generically, instead of the old hardcoded top/bottom test. Any opened face is simply excluded from the inner-face set; all remaining base faces produce a defended `inner-{name}` created-face query. Topology-rewrite propagation and descendant contracts are unchanged.

### Unsupported situations documented explicitly
Each lowerer now emits a specific rejection message:
- Cylinder/extrude side openings rejected with named unsupported faces listed.
- Tapered extrudes (`scaleTop`) rejected with a clear note.
- Edge-finished bases (fillet/chamfer) rejected with a hint to shell before finishing.
- Non-analytic bases (sphere, revolve, loft, sweep, boolean, hull, trimByPlane, hole, cut) rejected with the base kind named.
- Scale transforms rejected.
- The v1 era prefix was removed from all messages.

### Regression corpus
`examples/compiler-corpus/shell-box-side-opening.forge.js` exercises three box configurations:
1. Top + front open: inner floor and inner back wall targeted with boss and rib.
2. Left + right open (X-through channel): inner top cap targeted.
3. Front + back open tray: inner floor targeted.

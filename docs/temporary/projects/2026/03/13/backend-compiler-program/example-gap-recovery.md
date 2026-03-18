# Example Gap Recovery

Date: 2026-03-13

Task 280 closes the ambiguous post-migration holdout lane without pretending
that the remaining mixed-route examples are fully exact.

## Recovery Result

- `forgecad check examples` passes across all 96 checked example artifacts.
- Part-route inventory is now:
  - 63 `exact`
  - 10 `faceted`
  - 0 `holdout`
- The only artifacts still outside the active architecture phase are the two
  experimental fences in `cli/example-manifest/experimental.ts`.

## Recovered Mixed-Route Examples

- `examples/api/extrude-options.forge.js`
  - `Twisted` and `Twist + Taper` now define the faceted contract because the
    twist replay path still lacks exact compile intent.
  - `Plain`, `Tapered`, and `Centered (Z)` remain exact companions.
- `examples/api/gears-tier1.forge.js`
  - `Spur Pinion`, `Spur Gear`, and `Ring Gear` now define the faceted contract
    because the current helpers still lower through segmented circle profile
    geometry outside the exact CadQuery/OCCT subset.
  - `Rack Gear` remains an exact companion.
- `examples/chess-set.forge.js`
  - `White Knight 2`, `White Knight 7`, `Black Knight 2`, and `Black Knight 7`
    now define the faceted contract because the knight body still relies on
    `hull3d()`.
  - The board and every non-knight piece remain exact companions.

These examples are no longer truthful `holdout` cases because the manifest can
state the route contract directly on the blocked primary shapes.

## Remaining Temporary Fence

- `examples/sandbox.forge.js`
  - Temporary `experimental` fence.
  - Reason: scratch/sandbox file, not part of the maintained architecture-phase
    example surface.
  - Follow-up: keep it fenced under
    `tasks/280-example-gap-recovery-and-legacy-fence.md` until a later example
    surface cleanup either deletes it or formalizes it as a real example.
- `examples/test-colors.forge.js`
  - Temporary `experimental` fence.
  - Reason: color-behavior probe, not part of the maintained architecture-phase
    example surface.
  - Follow-up: keep it fenced under
    `tasks/280-example-gap-recovery-and-legacy-fence.md` until a later example
    surface cleanup either deletes it or replaces it with a proper color
    contract check.

## Review Surface

`forgecad check examples` now prints:

- manifest/family counts
- part-route counts
- the remaining temporary fence list with blocker and follow-up task references

That output is now sufficient to carry into the phase-entry review owned by
task 290.

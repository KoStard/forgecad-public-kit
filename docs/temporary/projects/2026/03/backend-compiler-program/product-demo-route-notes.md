# Product Demo Route Notes

Date: 2026-03-13

Task 260 moved the product-demo family from a blanket holdout fence to explicit
route ownership:

- 31 `exact`
- 2 `faceted`
- 1 `holdout`

## Exact With Scoped Primary Shapes

- `examples/3d-printer.forge.js`
  - The printer hardware and spool assembly now stay exact.
  - The Bowden guide tube still uses `pipeRoute`, so it remains runtime-covered
    helper geometry outside the exact claim.
- `examples/5-figen-robot-hand.forge.js`
  - The structural hand solids now stay exact.
  - The stylized tendon cable routes still use `pipeRoute`, so they remain
    runtime-covered helper geometry outside the exact claim.

These are no longer ambiguous product-demo holdouts because the primary part
contract is explicit and the remaining helper blocker is documented.

## Faceted Demos

- `examples/bolt-and-nut.forge.js`
  - The threaded fastener helpers still depend on helical/twist runtime geometry
    and segmented thread authoring outside the current exact subset.
- `examples/iphone.forge.js`
  - The rounded-body workflow still depends on `smoothOut().refine()` runtime
    geometry without defended exact compile intent.

## Remaining Holdout

- `examples/chess-set.forge.js`
  - The knight pieces still depend on `hull3d()` body construction while the
    board and other pieces stay exact.
  - This is the only remaining product-demo example that still needs the
    temporary mixed-route holdout classification after task 260.

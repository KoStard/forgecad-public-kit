# Compiler Regression Corpus

These parts are the curated multi-feature corpus behind `forgecad check compiler`
and the exact-export invariants. They are intentionally ordinary mechanical parts
instead of isolated geometry tricks, so lowerer regressions show up in workflows
that look like real product-design code.

Each file is deterministic: no randomness, no params, one named solid result.

## Parts

### `enclosure-shell-cuts.forge.js`

Guards:
- shell lowering inside an enclosure-style boolean workflow
- `onFace()`-driven cuts that need semantic workplane placement in the compiler graph
- mirrored mounting feet that stay exact-exportable after later subtracts

### `motor-mount-plate.forge.js`

Guards:
- `circularPattern()` around a real bolt circle instead of a toy transform demo
- `lib.fastenerHole()` counterbore cutters inside an exact-exportable part
- mirrored tabs and center pocket booleans that must remain deterministic

### `sensor-bracket.forge.js`

Guards:
- mirrored reinforcement ribs inside a larger bracket union
- front/side face cuts placed with `onFace()` on an upright wall
- repeated indicator holes plus base mounting holes in the same boolean tree

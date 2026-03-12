# Compiler Regression Corpus

These parts are the curated multi-feature corpus behind `forgecad check compiler`,
the focused `forgecad check query-propagation` snapshots, and the exact-export
invariants. They are intentionally ordinary mechanical parts instead of isolated
geometry tricks, so lowerer regressions show up in workflows that look like real
product-design code.

Each file is deterministic: no randomness, no params, one named solid result.

## Parts

### `enclosure-shell-cuts.forge.js`

Guards:
- shell lowering inside an enclosure-style boolean workflow
- `onFace()`-driven subtractive features that need semantic workplane placement in the compiler graph
- mirrored mounting feet that stay exact-exportable after later subtracts

### `motor-mount-plate.forge.js`

Guards:
- `circularPattern()` around a real bolt circle instead of a toy transform demo
- stacked analytic bore cutters inside an exact-exportable boolean workflow, not compiler-owned counterbore features yet
- mirrored tabs and center pocket booleans that must remain deterministic

### `sensor-bracket.forge.js`

Guards:
- mirrored reinforcement ribs inside a larger bracket union
- front/side face cuts placed with `onFace()` on an upright wall
- repeated indicator-hole cutters plus raw mounting bores in the same boolean tree

### `edge-finished-mount.forge.js`

Guards:
- tracked-edge `filletEdge()` lowering on the supported vertical-edge subset
- downstream `hole()` / `cutout()` edits that still target the original tracked body owner after edge finishing
- ordinary add/subtract edits staying exact-exportable after the edge-finish feature node lands

### `fastener-plate-variants.forge.js`

Guards:
- compiler-owned counterbore and countersink holes inside a normal fastener-plate workflow
- `upToFace` hole/cut extents lowering through both Manifold and CadQuery/OCCT from the shared feature family
- defended created-face/query semantics staying inspectable after multiple richer hole rewrites

### `trimmed-access-cover.forge.js`

Guards:
- `trimByPlane()` exposing the defended `plane-cap` created-face query inside a normal cover-style workflow
- earlier `hole()` / `cutout()` rewrites still surfacing explicit split-face ambiguity and unsupported created-edge diagnostics
- later union edits staying reviewable after the trim-created face lands

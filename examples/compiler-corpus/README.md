# Compiler Regression Corpus

These parts are the curated multi-feature corpus behind `forgecad check compiler`,
the focused `forgecad check query-propagation` snapshots, and `forgecad check brep`.
They are intentionally ordinary mechanical parts instead of isolated geometry
tricks, so lowerer regressions show up in workflows that look like real
product-design code.

Each file is deterministic: no randomness, no params, fixed named solid result(s).

## Coverage Map

| Part | Main workflow families |
| --- | --- |
| `enclosure-shell-cuts.forge.js` | `shell()`, face-driven cuts, mirrored feet, boolean chain |
| `motor-mount-plate.forge.js` | circular pattern, mirrored ears, deterministic boolean pockets |
| `sensor-bracket.forge.js` | mirrored ribs, upright `onFace()` cuts, repeated detail holes |
| `edge-finished-mount.forge.js` | tracked-edge fillet/chamfer, downstream hole/cut edits, boolean chain |
| `fastener-plate-variants.forge.js` | counterbores, countersinks, planar `upToFace`, created-face propagation |
| `folded-service-panel-cover.forge.js` | compiler-owned sheet metal, named panel/flange/bend descendants, folded + flat outputs |
| `projection-relay-cover.forge.js` | `projectToPlane()` replay from repeated union descendants |
| `service-panel-cover.forge.js` | repeated bosses plus richer hole/cut details plus projection replay |
| `trimmed-access-cover.forge.js` | `trimByPlane()`, plane-cap ownership, later union edits |

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
- tracked-edge `filletEdge()` plus later propagated-edge `chamferEdge()` lowering on the defended vertical-edge subset
- mirrored additive features staying exact-exportable while the selected preserved edge keeps one unique propagated lineage
- downstream `hole()` / `cutout()` edits that still target the original tracked body owner after the broadened edge-finish flow

### `fastener-plate-variants.forge.js`

Guards:
- compiler-owned counterbore and countersink holes inside a normal fastener-plate workflow
- `upToFace` hole/cut extents lowering through both Manifold and CadQuery/OCCT from the shared feature family
- defended created-face/query semantics staying inspectable after multiple richer hole rewrites

### `folded-service-panel-cover.forge.js`

Guards:
- compiler-owned `sheetMetal()` intent lowering to both the folded cover and the flat pattern from one semantic model
- named `panel`, `flange-*`, and `bend-*` descendants staying inspectable after panel/flange cutouts split those regions
- exact export and query-propagation coverage for a manufacturable-looking sheet-metal cover instead of an isolated toy bend

### `projection-relay-cover.forge.js`

Guards:
- `projectToPlane()` replay after a repeated top-edge boss chain has already been merged through a supported union
- projection-driven downstream lips staying exact-exportable instead of collapsing back to runtime-only geometry
- downstream placement still using defended face-query lineage from the base plate instead of anonymous heuristics

### `service-panel-cover.forge.js`

Guards:
- repeated top-side bosses staying compiler-owned before later richer hole/cut rewrites hit the same part
- counterbores, countersinks, and a face-driven display pocket remaining exact-exportable in one ordinary service-cover workflow
- projection-driven gasket geometry replaying from a hole/cut/union source instead of dropping back to runtime-only silhouette logic

### `trimmed-access-cover.forge.js`

Guards:
- `trimByPlane()` exposing the defended `plane-cap` created-face query inside a normal cover-style workflow
- earlier `hole()` / `cutout()` rewrites still surfacing explicit split-face ambiguity and unsupported created-edge diagnostics
- later union edits staying reviewable after the trim-created face lands

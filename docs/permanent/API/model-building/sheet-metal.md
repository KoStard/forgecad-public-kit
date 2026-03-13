# Sheet Metal

`sheetMetal()` is ForgeCAD's first dedicated compiler-owned sheet-metal family.

It keeps one semantic model, then derives both:

- a folded solid
- a flat pattern

This is a strict v1 subset. Forge does not try to infer sheet metal from arbitrary solids.

## Quick Start

```javascript
const cover = sheetMetal({
  panel: { width: 180, height: 110 },
  thickness: 1.5,
  bendRadius: 2,
  bendAllowance: { kFactor: 0.42 },
  cornerRelief: { size: 4 },
})
  .flange('top', { length: 18 })
  .flange('right', { length: 18 })
  .flange('bottom', { length: 18 })
  .flange('left', { length: 18 })
  .cutout('panel', rect(72, 36, true), { selfAnchor: 'center' })
  .cutout('flange-right', roundedRect(26, 10, 5, true), { selfAnchor: 'center' });

const folded = cover.folded();
const flat = cover.flatPattern();
```

The maintained proof artifact is [`examples/api/folded-service-panel-cover.forge.js`](../../../../examples/api/folded-service-panel-cover.forge.js).

## Practical First Pass

If the goal is "open docs and make a cover/bracket quickly," the most reliable current workflow is:

1. Build the base panel plus flanges first.
2. Validate `folded()` and `flatPattern()` before adding any cutouts.
3. Add panel cutouts before flange cutouts.
4. Add flange cutouts one region at a time instead of decorating every flange at once.
5. Re-run validation after each new region so cutout complexity stays easy to localize.

This keeps failures narrow and makes it obvious whether the issue is:

- the sheet-metal setup itself
- one specific region
- one specific cutout pattern

## Current Practical Cutout Lane

The defended API surface is wider than the current "fast to author" lane.

For quick, low-drama iteration, prefer:

- `circle2d(...)`
- `rect(...)`
- `roundedRect(...)`

These simple compile-covered sketches are the current safest first choice for panel and flange cutouts.

Decorative language still works best when expressed as several individually placed simple cutouts rather than one heavily composed art sketch. In practice, fewer larger apertures are more reliable than many tiny details when you are still exploring the part.

If runtime spikes or validation stops feeling immediate, simplify first by:

- reducing cutout count
- replacing composed motifs with simple repeated cutouts
- validating one region before mirroring the same detail to other flanges

## Placement Tips

- `selfAnchor: 'center'` is the easiest default for early iterations because it keeps panel and flange placement intent readable.
- Flange-local placement is easy to misread, especially on side flanges. Place one obvious asymmetric test cutout on one flange first, validate it, then mirror or repeat once the orientation is confirmed.
- Keep cutouts off bend regions for v1. The defended cutout lane is planar panel and flange regions only.

## API Surface

### `sheetMetal(options)`

Creates a `SheetMetalPart`.

Required options:

- `panel: { width, height }`
- `thickness`
- `bendRadius`
- `bendAllowance: { kFactor }`

Optional:

- `cornerRelief: { kind?: 'rect', size }`

### `part.flange(edge, options)`

Adds one edge flange.

- `edge`: `'top' | 'right' | 'bottom' | 'left'`
- `options.length`
- `options.angleDeg` defaults to `90`

Current v1 support is only `90°` flanges.

### `part.cutout(region, sketch, options?)`

Adds a planar cutout on a supported sheet-metal region.

- `region`: `'panel' | 'flange-top' | 'flange-right' | 'flange-bottom' | 'flange-left'`
- `sketch` must be an unplaced compile-covered 2D sketch
- `options.u` / `options.v` place the sketch in region-local coordinates
- `options.selfAnchor` works like other planar placement APIs

For exploratory authoring, prefer a loop like:

```javascript
let part = sheetMetal({
  panel: { width: 180, height: 110 },
  thickness: 1.5,
  bendRadius: 2,
  bendAllowance: { kFactor: 0.42 },
  cornerRelief: { size: 4 },
})
  .flange('top', { length: 18 })
  .flange('right', { length: 18 });

part = part.cutout('panel', roundedRect(40, 10, 5, true), { selfAnchor: 'center' });
part = part.cutout('flange-right', circle2d(3), { u: 0, v: 0, selfAnchor: 'center' });
```

That authoring style keeps each downstream cutout step explicit and easy to debug.

### `part.regionNames()`

Returns the semantic region names currently available from the model.

### `part.folded()` / `part.flatPattern()`

Materialize the folded solid or flat pattern from the same semantic model.

Both outputs stay compiler-owned and exact-exportable inside the defended subset.

## Defended Region Names

Forge exposes the following semantic family where the corresponding flange exists:

- `panel`
- `flange-top`, `flange-right`, `flange-bottom`, `flange-left`
- `bend-top`, `bend-right`, `bend-bottom`, `bend-left`

Important behavior:

- planar panel/flange faces can resolve as descendant `region`s after downstream cutouts
- folded bend regions resolve explicitly as descendant `set`s because one bend can honestly span multiple surfaces
- flat-pattern bend regions stay explicit too, but as planar band descendants instead of guessed folded topology

## Supported V1 Subset

- one base panel
- up to four edge flanges
- constant thickness
- explicit bend radius
- explicit K-factor bend allowance input
- rectangular corner reliefs
- planar cutouts on the panel and existing flange regions
- folded preview and exact folded/flat lowering from the same semantic model

## Explicit Non-Goals

Not supported in v1:

- arbitrary solid-to-sheet-metal conversion
- hems
- jogs or offset bends
- lofted bends
- miter corner logic beyond the defended rectangular-relief subset
- nonuniform thickness
- bend-region cutouts
- non-`90°` flanges

If Forge cannot defend a requested operation inside that subset, it should fail with a targeted error instead of guessing.

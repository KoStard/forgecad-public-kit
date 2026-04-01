# Toolbox — Fastener Library

Pre-built ISO metric fastener geometry available via `lib.*` in any ForgeCAD script.

## Supported catalog

This is the initial, intentionally small catalog. Coverage outside these items is not guaranteed.

| Family | Sizes | Standard |
|--------|-------|----------|
| Hex bolt (`lib.bolt`) | M4 – M10 (parametric) | ISO 4762 lookalike |
| Hex nut (`lib.nut`) | M4 – M10 (parametric) | ISO 4032 lookalike |
| Flat washer (`lib.washer`) | M2, M2.5, M3, M4, M5, M6, M8, M10 | DIN 125-A |
| Fastener hole (`lib.fastenerHole`) | M2, M2.5, M3, M4, M5, M6, M8, M10 | ISO metric fits |
| Fastener set (`lib.fastenerSet`) | M2 – M10 | Combines all of the above |

Sizes outside the table will throw. Extend `METRIC_HOLE_TABLE` / `WASHER_TABLE` in `library.ts` when adding new sizes.

## `lib.washer(size, options?)`

Returns a flat ring washer (DIN 125-A by default) centered at the origin, thickness along Z.

```javascript
const w = lib.washer("M5");
// outer dia 10 mm, inner dia 5.3 mm, thickness 1 mm
```

**Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `MetricSize` | required | ISO metric thread size string, e.g. `"M6"` |
| `options.standard` | `'din-125-a'` | `'din-125-a'` | Washer standard (only DIN 125-A for now) |
| `options.segments` | `number` | `48` | Circle segment count |

**DIN 125-A dimensions**

| Size | Inner dia (mm) | Outer dia (mm) | Thickness (mm) |
|------|---------------|----------------|----------------|
| M2   | 2.2 | 5.0  | 0.3 |
| M2.5 | 2.7 | 6.0  | 0.5 |
| M3   | 3.2 | 7.0  | 0.5 |
| M4   | 4.3 | 9.0  | 0.8 |
| M5   | 5.3 | 10.0 | 1.0 |
| M6   | 6.4 | 12.0 | 1.6 |
| M8   | 8.4 | 17.0 | 1.6 |
| M10  | 10.5 | 21.0 | 2.0 |

## `lib.fastenerSet(size, boltLength, options?)`

Returns all geometry needed for one complete bolted joint: bolt, nut, washers, and hole cutters — un-positioned so you can place them freely.

```javascript
const hw = lib.fastenerSet("M5", 20);

// Cut holes in two plates
const topPlate = box(60, 40, 8, true)
  .subtract(hw.clearanceHole.translate(15, 10, 0));
const botPlate = box(60, 40, 8, true).translate(0, 0, -16)
  .subtract(hw.tappedHole.translate(15, 10, -8));

// Place hardware
return [
  { name: "Top Plate", shape: topPlate, color: "#9ab4cc" },
  { name: "Bot Plate", shape: botPlate, color: "#b0b8c8" },
  { name: "Bolt",  shape: hw.bolt.translate(15, 10, 4),  color: "#aaaaaa" },
  { name: "Nut",   shape: hw.nut.translate(15, 10, -19), color: "#888888" },
];
```

**Parameters**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `MetricSize` | required | ISO metric thread size |
| `boltLength` | `number` | required | Shaft length in mm (head excluded) |
| `options.washerUnderHead` | `boolean` | `true` | Include a washer shape for under the head |
| `options.washerUnderNut` | `boolean` | `true` | Include a washer shape for under the nut |
| `options.fit` | `FastenerFit` | `'normal'` | Clearance hole fit: `close`, `normal`, `loose`, or `tap` |
| `options.segments` | `number` | `36` | Thread/circle segment count |

**Result fields**

| Field | Type | Description |
|-------|------|-------------|
| `bolt` | `Shape` | Head top at z=0, shaft along −Z by `boltLength` |
| `nut` | `Shape` | Hex nut centered at z=0 |
| `washerUnderHead` | `Shape \| null` | Flat washer centered at z=0 |
| `washerUnderNut` | `Shape \| null` | Flat washer centered at z=0 |
| `clearanceHole` | `Shape` | Cutter cylinder for through-plate clearance, centered at z=0 |
| `tappedHole` | `Shape` | Cutter cylinder for tap-drill hole, centered at z=0 |
| `dims` | `FastenerSetDimensions` | Reference dimensions for placement and BOM |

**`FastenerSetDimensions` fields**

| Field | Description |
|-------|-------------|
| `size` | Thread size string |
| `nominalDiameter` | Numeric thread diameter (mm) |
| `boltLength` | As specified |
| `clearanceDia` | Clearance hole diameter for chosen fit (mm) |
| `tapDia` | Tap-drill diameter (mm) |
| `nutAcrossFlats` | Hex nut width across flats (mm) |
| `nutHeight` | Nut height (mm) |
| `washerOuterDia` / `washerInnerDia` / `washerThickness` | DIN 125-A washer dimensions (mm) |

## `lib.fastenerHole(opts)`

Lower-level helper that returns only a hole cutter (cylinder ± counterbore/countersink). Supports M2–M10 with four fit classes and optional counterbore/countersink geometry. See the full API reference for details.

## Pairing table

Use this to pick the right cutter fit for your workflow:

| Fit | Hole diameter | Use when |
|-----|--------------|----------|
| `close` | ≈ nominal + 0.2 mm | Press-location or close-tolerance slotting |
| `normal` | ≈ nominal + 0.5 mm | Standard through-bolt clearance (default) |
| `loose` | ≈ nominal + 1–2 mm | Adjustment slots or misaligned patterns |
| `tap` | ISO tap drill | Tapped hole in the mating part |

## Example

See [`examples/toolbox/bolted-joint.forge.js`](../../../../examples/toolbox/bolted-joint.forge.js) for a complete two-plate bolted assembly with BOM and exploded view.

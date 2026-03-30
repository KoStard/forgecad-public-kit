# Sheet Metal

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

Folded sheet metal parts with flanges, bends, and flat pattern unfolding.

## Functions

### Sheet Metal

Create folded sheet metal parts with flanges and flat patterns.

#### `sheetMetal()`

```ts
sheetMetal(options: SheetMetalOptions): SheetMetalPart
```

Create a sheet-metal part with flanges, bend allowances, and flat pattern unfolding. Define the base panel, thickness, bend radius, and K-factor, then chain .flange() and .cutout() calls. Materialize with .folded() or .flatPattern().

<details><summary><code>SheetMetalOptions</code></summary>

```ts
interface SheetMetalOptions {
  width: number;
  height: number;
  thickness: number;
  bendRadius: number;
  kFactor: number;
  kind?: "rect";
  size: number;
}
```

</details>

---

## Classes

### `SheetMetalPart`

**Methods:**

- `flange()` — flange(edge: SheetMetalEdge, options: SheetMetalFlangeOptions): SheetMetalPart
- `cutout()` — cutout(region: SheetMetalPlanarRegionName, sketch: Sketch, options?: SheetMetalC
- `regionNames()` — regionNames(): SheetMetalRegionName[]
- `folded()` — folded(): Shape
- `flatPattern()` — flatPattern(): Shape

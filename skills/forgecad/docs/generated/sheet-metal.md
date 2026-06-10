---
skill-group: sheet-metal
skill-order: 100
---

# Sheet Metal

Folded sheet metal parts with flanges, bends, and flat pattern unfolding.

## Contents

- [Sheet Metal](#sheet-metal)
- [SheetMetalPart](#sheetmetalpart)
- [FlatPart](#flatpart)
- [LaserKit](#laserkit)
- [SHEET_METAL_EDGES](#sheet-metal-edges)
- [Laser](#laser)

## Functions

### Sheet Metal

#### `sheetMetal(options: SheetMetalOptions): SheetMetalPart` — Create a parametric sheet metal part with flanges, bend allowances, and flat-pattern unfolding.

`sheetMetal()` keeps one semantic model and derives both a folded 3D solid and an accurate flat pattern from it. The K-factor bend allowance is applied during unfolding. This is a strict v1 subset — it does not infer sheet metal from arbitrary solids.

**Recommended authoring order:**

1. Define the base panel + thickness + bend parameters.
2. Chain `.flange()` calls for each edge. Validate with `.folded()` and `.flatPattern()` before adding cutouts.
3. Add panel cutouts, then flange cutouts one region at a time.
4. Validate after each new cutout region.

**v1 limitations:** one base panel, up to four 90° edge flanges, constant thickness, explicit K-factor, rectangular corner reliefs, planar cutouts only. No hems, jogs, lofted bends, non-90° flanges, or bend-region cutouts.

```ts
const cover = sheetMetal({
  panel: { width: 180, height: 110 },
  thickness: 1.5,
  bendRadius: 2,
  bendAllowance: { kFactor: 0.42 },
  cornerRelief: { size: 4 },
})
  .flange('top',    { length: 18 })
  .flange('right',  { length: 18 })
  .flange('bottom', { length: 18 })
  .flange('left',   { length: 18 })
  .cutout('panel', rect(72, 36), { selfAnchor: 'center' })
  .cutout('flange-right', roundedRect(26, 10, 5), { selfAnchor: 'center' });

const folded = cover.folded();
const flat   = cover.flatPattern();
```

**`SheetMetalOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `panel` | `{ width: number; height: number; }` | Base panel dimensions. This is the flat blank before flanges are applied. |
| `thickness` | `number` | Sheet thickness in mm. Applied uniformly across the panel and all flanges. |
| `bendRadius` | `number` | Inside bend radius in mm. Must be ≥ 0. Typically 0.5–2× the sheet thickness. |
| `bendAllowance` | `{ kFactor: number; }` | Bend allowance model used when computing the flat-pattern developed length. Currently only K-factor is supported. The K-factor (0–1) describes how far the neutral axis sits from the inner bend surface. Typical values: - Soft materials / large radius: 0.50 - General sheet steel: 0.42–0.44 - Hard materials / tight radius: 0.30–0.38 |
| `cornerRelief?` | `{ kind?: "rect"; size: number; }` | Corner relief cut at each bend intersection. Prevents material overlap when two flanges meet at a corner. Defaults to a rectangular relief sized to `bendRadius + thickness` if omitted. |

---

## Classes

### `SheetMetalPart`

An immutable sheet metal part that accumulates flanges and cutouts.

Each mutating method returns a **new** `SheetMetalPart`; the original is unchanged. The part does not produce geometry until you call `.folded()` or `.flatPattern()`.

#### `flange(edge: SheetMetalEdge, options: SheetMetalFlangeOptions): SheetMetalPart` — Add a 90° flange along one edge of the base panel.

Each of the four edges (`'top'`, `'right'`, `'bottom'`, `'left'`) may carry at most one flange. Calling `.flange()` twice for the same edge throws.

Corner reliefs are automatically inserted at the intersections of adjacent flanges. Build flanges before cutouts — validate with `.folded()` and `.flatPattern()` after each addition.

```ts
const part = sheetMetal({ panel: { width: 100, height: 60 }, thickness: 1.5, bendRadius: 2, bendAllowance: { kFactor: 0.42 } })
  .flange('top', { length: 15 })
  .flange('bottom', { length: 15 });
```

**`SheetMetalFlangeOptions`**
- `length: number` — Flange leg length in mm, measured from the outside of the bend to the tip.
- `angleDeg?: number` — Bend angle in degrees (default: `90`). Only `90°` is supported in v1. Values other than 90 will be rejected at build time.

#### `cutout(region: SheetMetalPlanarRegionName, sketch: Sketch, options?: SheetMetalCutoutOptions): SheetMetalPart` — Subtract a 2D sketch cutout from a planar region of the sheet metal part.

`region` must be `'panel'` or one of `'flange-top'`, `'flange-right'`, `'flange-bottom'`, `'flange-left'` (only available once the corresponding flange has been added). Cutouts inside bend regions are **not** supported in v1.

`sketch` must be an **unplaced** compile-covered 2D profile (e.g. the result of [`circle2d()`](/docs/sketch#circle2d), [`rect()`](/docs/sketch#rect), [`roundedRect()`](/docs/sketch#roundedrect)). Passing an already-placed sketch (one that has had `.onFace(...)` called on it) will throw.

**Authoring order:** Add all flanges before adding cutouts. Add panel cutouts before flange cutouts. Add one region at a time and validate with `.folded()` / `.flatPattern()` after each step.

```ts
const part = sheetMetal({ panel: { width: 180, height: 110 }, thickness: 1.5, bendRadius: 2, bendAllowance: { kFactor: 0.42 } })
  .flange('top', { length: 18 })
  .cutout('panel', rect(72, 36), { selfAnchor: 'center' })
  .cutout('flange-top', roundedRect(26, 10, 5), { selfAnchor: 'center' });
```

**`SheetMetalCutoutOptions`**
- `u?: number` — Horizontal offset within the region, measured from the region centre (mm). Default: `0`.
- `v?: number` — Vertical offset within the region, measured from the region centre (mm). Default: `0`.
- `selfAnchor?: Anchor` — Anchor point on the sketch that aligns to `(u, v)`. Use `'center'` for most cases. For asymmetric profiles, verify orientation by placing one test cutout before committing to the final position. Default: `'center'`.

#### `regionNames(): SheetMetalRegionName[]` — Return all semantic region names currently available on this part.

The returned list always includes `'panel'`. For every flange that has been added, the list also includes the corresponding `'flange-<edge>'` and `'bend-<edge>'` entries.

Use this to discover valid targets for `.cutout()` or for querying faces by region after materializing with `.folded()`.

Defended region names: `panel` | `flange-top` | `flange-right` | `flange-bottom` | `flange-left` | `bend-top` | `bend-right` | `bend-bottom` | `bend-left`

#### `folded(): Shape` — Materialize the 3D folded solid.

Applies all flanges (bent up at their configured angles) and all registered cutouts, then returns the resulting [`Shape`](/docs/core#shape). The shape is compiler-owned and exact-exportable (STEP, IGES, etc.).

Prefer calling `.folded()` to validate each build step before proceeding to the final model.

#### `flatPattern(): Shape` — Materialize the flat-pattern (unfolded blank) for fabrication.

Unfolds all flanges using the K-factor bend allowance and lays the result flat in the XY plane. Cutouts are projected into the flat geometry. The returned shape is exact-exportable and ready for laser / waterjet / CNC nesting workflows.

The developed length of each bend zone is: `BA = (bendRadius + kFactor × thickness) × angleDeg × π / 180`

### `FlatPart`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |
| `thickness` | `number` | — |
| `options` | `FlatPartOptions` | — |

**Methods:**

#### `get edges(): ReadonlyMap<string, EdgeInfo>` — All edges as a read-only map.

#### `edge(name: string): EdgeInfo` — Look up a named edge. Throws if the edge does not exist.

#### `edgeNames(): string[]` — All edge names on this part.

#### `get partNumber(): number` — BOM part number assigned to this flat part.

#### `get joints(): readonly JointRecord[]` — Joint records that attach this part to other parts in the kit.

#### `get quantity(): number` — Requested quantity of this part in the kit. Defaults to `1`.

#### `addGeometry(sketch: Sketch): void` — Add geometry (e.g. protruding tabs) to the part profile.

#### `subtractGeometry(sketch: Sketch): void` — Subtract geometry (e.g. slot cuts) from the part profile.

#### `addJoint(record: JointRecord): void` — Record a joint connection for assembly preview.

**`JointRecord`**
- `foldAngle: number` — Fold angle in degrees. Default: 90.
- Also: `type: "finger" | "tabSlot" | "snapFit"`, `partA: string`, `partB: string`, `edgeA: string`, `edgeB: string`.

#### `profile(kerf?: number): Sketch` — Final 2D profile with joints and optional kerf compensation.

#### `solid(kerf?: number): Shape` — 3D solid — extrude the profile by material thickness.

### `LaserKit`

#### `get kerf(): number` — Laser kerf in mm.

#### `get parts(): readonly FlatPart[]` — All registered parts (flat, in insertion order).

#### `get material(): string` — Default material label.

#### `get sheetWidth(): number` — Stock sheet width in mm.

#### `get sheetHeight(): number` — Stock sheet height in mm.

#### `addPart(part: FlatPart, overrides?: { qty?: number; }): this` — Register a flat part with this kit. Assigns a sequential part number and records the quantity.

#### `cutSheets(): CuttingLayoutResult` — Generate nested cut sheets using guillotine bin-packing.

#### `bom(): LaserKitBomEntry[]` — Bill of materials listing every part with dimensions.

#### `partSvgs(): Map<string, string>` — Individual SVG string for each part profile, keyed by part name.

#### `inventorySvg(): string` — Combined inventory SVG showing all parts in a labeled grid.

#### `assemblyPreview(options?: Omit<AssemblyPreviewOptions, "kerf">): AssemblyPreviewResult` — 3D fold-up preview of the assembled kit.

**`AssemblyPreviewOptions`**
- `kerf?: number` — Kerf compensation passed to each part's solid(). Default: 0
- `fold?: number` — Fold amount: 0 = flat layout, 1 = fully assembled. Default: 1
- `explode?: number` — Explode distance: 0 = assembled, >0 = parts spread outward. Default: 0

#### `assemblyInstructions(options?: AssemblyInstructionsOptions): AssemblyInstructionsResult` — Step-by-step assembly instructions.

**`AssemblyInstructionsOptions`**
- `rootPart?: string` — Part to start from. Default: part with most joint connections.

#### `formatInstructions(options?: AssemblyInstructionsOptions): string` — Human-readable assembly instructions text.

---

## Constants

### `SHEET_METAL_EDGES`

### `Laser`

Laser-cutting namespace — flat parts, joints, kits, kerf data, and assembly previews.

**Workflow:** create parts with `Laser.panel()` / `Laser.part()`, connect them with `Laser.fingerJoint()` / `Laser.tabSlot()`, then collect them in a `Laser.kit()` for BOM, sheet nesting, SVG export, and assembly previews. The kit applies kerf compensation automatically from its `kerf` option.

- `panel: (name: string, width: number, height: number, thickness: number, options?: FlatPartOptions) => FlatPart` — Create a rectangular flat panel with 4 named edges.

  Profile origin at the bottom-left corner. Edges: `bottom` (y=0), `right` (x=width), `top` (y=height), `left` (x=0). Edge traversal follows CCW winding order.
- `part: (name: string, profile: Sketch, thickness: number, edges?: Record<string, { start: Vec2; end: Vec2; }>, options?: FlatPartOptions) => FlatPart` — Create a flat part from an arbitrary 2D profile with user-named edges.

  Edge normals are computed automatically (perpendicular to the edge direction, rotated 90 degrees clockwise).
- `fingerJoint: (partA: FlatPart, edgeNameA: string, partB: FlatPart, edgeNameB: string, options?: FingerJointOptions & { foldAngle?: number; }) => void` — Connect two parts with finger joints along the named edges.

  Adds finger geometry to partA's edge and cuts matching slots from partB's edge; the joint is also recorded on both parts for assembly previews and instructions.
- `tabSlot: (partA: FlatPart, edgeNameA: string, partB: FlatPart, edgeNameB: string, options?: TabSlotOptions & { foldAngle?: number; }) => void` — Connect two parts with tab-and-slot joints along the named edges.

  Adds tab geometry to partA's edge and cuts matching slots from partB's edge; the joint is also recorded on both parts for assembly previews and instructions.
- `kit: (options?: LaserKitOptions) => LaserKit` — Create a LaserKit container for a flat-pack project.

  The kit collects FlatPart instances, assigns sequential part numbers, generates a bill of materials, nests parts onto cut sheets, exports SVG views, and produces kerf-compensated assembly previews and step-by-step instructions. Kerf compensation uses the kit's `kerf` option (default 0.2 mm).
- `assemblyPreview: (parts: FlatPart[], joints: JointRecord[], options?: AssemblyPreviewOptions) => AssemblyPreviewResult` — Generate a 3D assembly preview from flat parts and their joint records.

  Prefer `Laser.kit(...).assemblyPreview(options)` — the kit collects the joint records and applies its kerf automatically. This standalone form defaults `kerf` to 0.
- `instructions: (parts: FlatPart[], joints: JointRecord[], options?: AssemblyInstructionsOptions) => AssemblyInstructionsResult` — Generate step-by-step assembly instructions from flat parts and joints.

  Prefer `Laser.kit(...).assemblyInstructions(options)` — the kit collects the joint records for you. Steps are ordered BFS from the most-connected (base) part so each new part attaches to already-assembled parts.
- `formatInstructions: (result: AssemblyInstructionsResult) => string` — Format assembly instructions as a human-readable text document.

  Includes a "Step 0" preamble identifying the base part, followed by numbered steps, and a note about any orphan parts.
- `lookupKerf: (material: string, thickness: number, laserType?: string) => number | undefined` — Look up kerf for a material + thickness + laser combo in `Laser.COMMON_KERFS`.

  If `laserType` is omitted, returns the first matching material + thickness entry. Returns `undefined` when no match is found. Always test-cut to verify kerf for a specific machine.
- `COMMON_KERFS: MaterialKerfEntry[]` — Common full-kerf values by material, thickness, and laser type.

  Reference data only — kerf varies per machine, lens, and focus; always test-cut to verify before committing a sheet.

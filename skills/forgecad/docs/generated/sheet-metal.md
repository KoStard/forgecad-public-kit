---
skill-group: sheet-metal
skill-order: 100
---

# Sheet Metal

Folded sheet metal parts with flanges, bends, and flat pattern unfolding.

## Contents

- [Sheet Metal](#sheet-metal) — `sheetMetal`
- [Laser Cutting](#laser-cutting) — `kerfCompensateOutline`, `kerfCompensateTabs`, `kerfCompensateSlots`, `kerfCompensatePart`, `lookupKerf`, `flatPanel`, `flatPart`, `fingerJoint`, `tabSlot`, `assemblyPreview`, `assemblyInstructions`, `formatInstructions`, `laserKit`
- [SheetMetalPart](#sheetmetalpart)
- [FlatPart](#flatpart)
- [LaserKit](#laserkit)
- [SHEET_METAL_EDGES](#sheet-metal-edges)
- [COMMON_KERFS](#common-kerfs)

## Functions

### Sheet Metal

#### `sheetMetal()` — Create a parametric sheet metal part with flanges, bend allowances, and flat-pattern unfolding.

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

```ts
sheetMetal(options: SheetMetalOptions): SheetMetalPart
```

**`SheetMetalOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `panel` | `{ width: number; height: number; }` | Base panel dimensions. This is the flat blank before flanges are applied. |
| `thickness` | `number` | Sheet thickness in mm. Applied uniformly across the panel and all flanges. |
| `bendRadius` | `number` | Inside bend radius in mm. Must be ≥ 0. Typically 0.5–2× the sheet thickness. |
| `bendAllowance` | `{ kFactor: number; }` | Bend allowance model used when computing the flat-pattern developed length. Currently only K-factor is supported. The K-factor (0–1) describes how far the neutral axis sits from the inner bend surface. Typical values: - Soft materials / large radius: 0.50 - General sheet steel: 0.42–0.44 - Hard materials / tight radius: 0.30–0.38 |
| `cornerRelief?` | `{ kind?: "rect"; size: number; }` | Corner relief cut at each bend intersection. Prevents material overlap when two flanges meet at a corner. Defaults to a rectangular relief sized to `bendRadius + thickness` if omitted. |

### Laser Cutting

#### `kerfCompensateOutline()` — Apply kerf compensation to a complete part outline (outer boundary + holes).

Offsets inward by half-kerf: the outer boundary shrinks and inner holes grow. This is correct because the laser beam removes material on both sides of the cut line.

```ts
kerfCompensateOutline(sketch: Sketch, kerf: number): Sketch
```

#### `kerfCompensateTabs()` — Apply kerf compensation to joint protrusions (tabs, fingers).

These grow by half-kerf so they are slightly oversized and fit tightly in their mating slots after the laser removes material.

```ts
kerfCompensateTabs(sketch: Sketch, kerf: number): Sketch
```

#### `kerfCompensateSlots()` — Apply kerf compensation to joint cutouts (slots, holes that receive tabs).

These grow by half-kerf so tabs can fit into them after the laser removes material from both sides of the slot walls.

```ts
kerfCompensateSlots(sketch: Sketch, kerf: number): Sketch
```

#### `kerfCompensatePart()` — Build a kerf-compensated part profile.

1. Start with the base profile.
2. Kerf-compensate each tab addition (grow by kerf/2), then union with base.
3. Kerf-compensate each slot subtraction (grow by kerf/2), then subtract from base.
4. Kerf-compensate the resulting outline (shrink by kerf/2).

Order matters: joints modify geometry BEFORE outline compensation so the final inward offset applies uniformly to the assembled profile.

```ts
kerfCompensatePart(baseProfile: Sketch, joints: PartJoints, kerf: number): Sketch
```

**`PartJoints`**
- `additions?: Sketch[]` — Geometry to ADD to the base profile (tabs, fingers protruding from edges).
- `subtractions?: Sketch[]` — Geometry to SUBTRACT from the base profile (slots, holes for mating tabs).

#### `lookupKerf()` — Look up kerf for a material + thickness + laser combo.

If `laserType` is omitted, returns the first matching material + thickness entry. Returns `undefined` when no match is found.

```ts
lookupKerf(material: string, thickness: number, laserType?: string): number | undefined
```

#### `flatPanel()` — Create a rectangular flat panel with 4 named edges.

Profile origin at bottom-left corner. Edges: bottom (y=0), right (x=width), top (y=height), left (x=0). Edge traversal follows CCW winding order.

```ts
flatPanel(name: string, width: number, height: number, thickness: number, options?: FlatPartOptions): FlatPart
```

`FlatPartOptions`: `{ material?: string, qty?: number, color?: string }`

#### `flatPart()` — Create a flat part from an arbitrary profile with user-named edges.

Edge normals are computed automatically (perpendicular to direction, rotated 90deg CW).

```ts
flatPart(name: string, profile: Sketch, thickness: number, edges?: Record<string, { start: [ number, number ]; end: [ number, number ]; }>, options?: FlatPartOptions): FlatPart
```

#### `fingerJoint()` — Connect two parts with finger joints along specified edges.

Adds finger geometry to partA's edge, cuts matching slots from partB's edge. The joint profiles are positioned along each edge using rotation + translation.

```ts
fingerJoint(partA: FlatPart, edgeNameA: string, partB: FlatPart, edgeNameB: string, options?: FingerJointOptions & { foldAngle?: number; }): void
```

**`FingerJointOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `fingers?` | `number` | Explicit finger count (must be odd, >= 3). Default: auto from length/thickness. |
| `fingerWidth?` | `number` | Explicit finger width. Default: auto. |
| `clearance?` | `number` | Extra clearance per side (mm). Default: 0. |
| `kerf?` | `number` | Laser kerf (mm). Default: 0. |
| `endStyle?` | `"full" \| "half"` | Whether edge starts with full finger or half. Default: 'full'. |

#### `tabSlot()` — Connect two parts with tab-and-slot joints along specified edges.

Adds tab geometry to partA's edge, cuts matching slots from partB's edge.

```ts
tabSlot(partA: FlatPart, edgeNameA: string, partB: FlatPart, edgeNameB: string, options?: TabSlotOptions & { foldAngle?: number; }): void
```

**`TabSlotOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `tabCount?` | `number` | Number of tabs. Default: auto (length / (4 * thickness)). |
| `tabWidth?` | `number` | Tab width. Default: 2 * thickness. |
| `clearance?` | `number` | Extra clearance per side (mm). Default: 0. |
| `kerf?` | `number` | Laser kerf (mm). Default: 0. |
| `inset?` | `number` | Distance from panel edges to first/last tab center. Default: thickness. |

#### `assemblyPreview()` — Generate a 3D assembly preview from flat parts and their joint records.

The preview can fold joints partially or fully and optionally apply exploded spacing so part relationships are easier to inspect visually.

```ts
assemblyPreview(parts: FlatPart[], joints: JointRecord[], options?: AssemblyPreviewOptions): AssemblyPreviewResult
```

**`JointRecord`**
- `foldAngle: number` — Fold angle in degrees. Default: 90.
- Also: `type: "finger" | "tabSlot" | "snapFit", partA: string, partB: string, edgeA: string, edgeB: string`

**`AssemblyPreviewOptions`**
- `kerf?: number` — Kerf compensation passed to each part's solid(). Default: 0
- `fold?: number` — Fold amount: 0 = flat layout, 1 = fully assembled. Default: 1
- `explode?: number` — Explode distance: 0 = assembled, >0 = parts spread outward. Default: 0

**`AssemblyPreviewResult`**
- `shapes: ShapeGroup` — All part shapes grouped for display.
- `partShapes: Map<string, Shape>` — Individual transformed shapes keyed by part name.

#### `assemblyInstructions()` — Generate step-by-step assembly instructions from flat parts and joints.

Algorithm:

1. Build adjacency graph from joints
2. Pick root part (most connections, or user-specified)
3. BFS from root, creating one step per part addition
4. Each step describes: which part to add, where it connects, how to orient it

Heuristics for step ordering:

- Start with the part that has the most connections (the base)
- Add parts that connect to already-assembled parts first (BFS order)
- Among candidates at the same BFS depth, prefer parts with more connections to already-assembled parts (structurally stable)

```ts
assemblyInstructions(parts: FlatPart[], joints: JointRecord[], options?: AssemblyInstructionsOptions): AssemblyInstructionsResult
```

**`AssemblyInstructionsOptions`**
- `rootPart?: string` — Part to start from. Default: part with most joint connections.

**`AssemblyInstructionsResult`**
- `totalParts: number` — Total number of parts in the assembly.
- `orphanParts: string[]` — Parts not connected to the joint graph (orphans).
- Also: `steps: AssemblyStep[]`

**`AssemblyStep`**

| Option | Type | Description |
|--------|------|-------------|
| `stepNumber` | `number` | 1-based step number. |
| `description` | `string` | Human-readable instruction. |
| `partName` | `string` | The part being added in this step. |
| `partNumber` | `number` | Part number (for cross-ref with cut sheets). |
| `connectsTo` | `string` | Which existing part it connects to. |
| `jointType` | `"finger" \| "tabSlot" \| "snapFit"` | Joint type used. |
| `newPartEdge` | `string` | The edge on the new part. |
| `existingPartEdge` | `string` | The edge on the existing part. |
| `foldAngle` | `number` | Fold angle in degrees. |
| `assembledParts` | `string[]` | Part names in the assembly so far (after this step). |

#### `formatInstructions()` — Format assembly instructions as a human-readable text document.

Includes a "Step 0" preamble identifying the base part, followed by numbered steps, and a note about any orphan parts.

```ts
formatInstructions(result: AssemblyInstructionsResult): string
```

#### `laserKit()` — Top-level factory for creating a LaserKit container.

```ts
laserKit(options?: LaserKitOptions): LaserKit
```

**`LaserKitOptions`**

| Option | Type | Description |
|--------|------|-------------|
| `material?` | `string` | Default material label for parts that don't specify one. |
| `sheetWidth?` | `number` | Stock sheet width in mm (default 600). |
| `sheetHeight?` | `number` | Stock sheet height in mm (default 400). |
| `kerf?` | `number` | Laser kerf in mm (default 0.2). |

---

## Classes

### `SheetMetalPart`

An immutable sheet metal part that accumulates flanges and cutouts.

Each mutating method returns a **new** `SheetMetalPart`; the original is unchanged. The part does not produce geometry until you call `.folded()` or `.flatPattern()`.

#### `flange()` — Add a 90° flange along one edge of the base panel.

Each of the four edges (`'top'`, `'right'`, `'bottom'`, `'left'`) may carry at most one flange. Calling `.flange()` twice for the same edge throws.

Corner reliefs are automatically inserted at the intersections of adjacent flanges. Build flanges before cutouts — validate with `.folded()` and `.flatPattern()` after each addition.

```ts
const part = sheetMetal({ panel: { width: 100, height: 60 }, thickness: 1.5, bendRadius: 2, bendAllowance: { kFactor: 0.42 } })
  .flange('top', { length: 15 })
  .flange('bottom', { length: 15 });
```

```ts
flange(edge: SheetMetalEdge, options: SheetMetalFlangeOptions): SheetMetalPart
```

#### `cutout()` — Subtract a 2D sketch cutout from a planar region of the sheet metal part.

`region` must be `'panel'` or one of `'flange-top'`, `'flange-right'`, `'flange-bottom'`, `'flange-left'` (only available once the corresponding flange has been added). Cutouts inside bend regions are **not** supported in v1.

`sketch` must be an **unplaced** compile-covered 2D profile (e.g. the result of [`circle2d()`](/docs/sketch#circle2d), [`rect()`](/docs/sketch#rect), [`roundedRect()`](/docs/sketch#roundedrect)). Passing an already-placed sketch (one that has had `.onFace(...)` called on it) will throw.

**Authoring order:** Add all flanges before adding cutouts. Add panel cutouts before flange cutouts. Add one region at a time and validate with `.folded()` / `.flatPattern()` after each step.

```ts
const part = sheetMetal({ panel: { width: 180, height: 110 }, thickness: 1.5, bendRadius: 2, bendAllowance: { kFactor: 0.42 } })
  .flange('top', { length: 18 })
  .cutout('panel', rect(72, 36), { selfAnchor: 'center' })
  .cutout('flange-top', roundedRect(26, 10, 5), { selfAnchor: 'center' });
```

```ts
cutout(region: SheetMetalPlanarRegionName, sketch: Sketch, options?: SheetMetalCutoutOptions): SheetMetalPart
```

#### `regionNames()` — Return all semantic region names currently available on this part.

The returned list always includes `'panel'`. For every flange that has been added, the list also includes the corresponding `'flange-<edge>'` and `'bend-<edge>'` entries.

Use this to discover valid targets for `.cutout()` or for querying faces by region after materializing with `.folded()`.

Defended region names: `panel` | `flange-top` | `flange-right` | `flange-bottom` | `flange-left` | `bend-top` | `bend-right` | `bend-bottom` | `bend-left`

```ts
regionNames(): SheetMetalRegionName[]
```

#### `folded()` — Materialize the 3D folded solid.

Applies all flanges (bent up at their configured angles) and all registered cutouts, then returns the resulting [`Shape`](/docs/core#shape). The shape is compiler-owned and exact-exportable (STEP, IGES, etc.).

Prefer calling `.folded()` to validate each build step before proceeding to the final model.

```ts
folded(): Shape
```

#### `flatPattern()` — Materialize the flat-pattern (unfolded blank) for fabrication.

Unfolds all flanges using the K-factor bend allowance and lays the result flat in the XY plane. Cutouts are projected into the flat geometry. The returned shape is exact-exportable and ready for laser / waterjet / CNC nesting workflows.

The developed length of each bend zone is: `BA = (bendRadius + kFactor × thickness) × angleDeg × π / 180`

```ts
flatPattern(): Shape
```

### `FlatPart`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |
| `thickness` | `number` | — |
| `options` | `FlatPartOptions` | — |

**Methods:**

#### `edges()` — All edges as a read-only map.

```ts
get edges(): ReadonlyMap<string, EdgeInfo>
```

#### `edge()` — Look up a named edge. Throws if the edge does not exist.

```ts
edge(name: string): EdgeInfo
```

#### `edgeNames()` — All edge names on this part.

```ts
edgeNames(): string[]
```

#### `partNumber()` — BOM part number assigned to this flat part.

```ts
get partNumber(): number
```

#### `joints()` — Joint records that attach this part to other parts in the kit.

```ts
get joints(): readonly JointRecord[]
```

#### `quantity()` — Requested quantity of this part in the kit. Defaults to `1`.

```ts
get quantity(): number
```

#### `addGeometry()` — Add geometry (e.g. protruding tabs) to the part profile.

```ts
addGeometry(sketch: Sketch): void
```

#### `subtractGeometry()` — Subtract geometry (e.g. slot cuts) from the part profile.

```ts
subtractGeometry(sketch: Sketch): void
```

#### `addJoint()` — Record a joint connection for assembly preview.

```ts
addJoint(record: JointRecord): void
```

#### `profile()` — Final 2D profile with joints and optional kerf compensation.

```ts
profile(kerf?: number): Sketch
```

#### `solid()` — 3D solid — extrude the profile by material thickness.

```ts
solid(kerf?: number): Shape
```

### `LaserKit`

#### `kerf()` — Laser kerf in mm.

```ts
get kerf(): number
```

#### `parts()` — All registered parts (flat, in insertion order).

```ts
get parts(): readonly FlatPart[]
```

#### `material()` — Default material label.

```ts
get material(): string
```

#### `sheetWidth()` — Stock sheet width in mm.

```ts
get sheetWidth(): number
```

#### `sheetHeight()` — Stock sheet height in mm.

```ts
get sheetHeight(): number
```

#### `addPart()` — Register a flat part with this kit. Assigns a sequential part number and records the quantity.

```ts
addPart(part: FlatPart, overrides?: { qty?: number; }): this
```

#### `cutSheets()` — Generate nested cut sheets using guillotine bin-packing.

```ts
cutSheets(): CuttingLayoutResult
```

#### [`bom()`](/docs/output#bom) — Bill of materials listing every part with dimensions.

```ts
bom(): LaserKitBomEntry[]
```

#### `partSvgs()` — Individual SVG string for each part profile, keyed by part name.

```ts
partSvgs(): Map<string, string>
```

#### `inventorySvg()` — Combined inventory SVG showing all parts in a labeled grid.

```ts
inventorySvg(): string
```

#### `assemblyPreview()` — 3D fold-up preview of the assembled kit.

```ts
assemblyPreview(options?: Omit<AssemblyPreviewOptions, "kerf">): AssemblyPreviewResult
```

#### `assemblyInstructions()` — Step-by-step assembly instructions.

```ts
assemblyInstructions(options?: AssemblyInstructionsOptions): AssemblyInstructionsResult
```

#### `formatInstructions()` — Human-readable assembly instructions text.

```ts
formatInstructions(options?: AssemblyInstructionsOptions): string
```

---

## Constants

### `SHEET_METAL_EDGES`

### `COMMON_KERFS`

Common kerf values. Users should always test-cut to verify for their specific setup.

# Output & Annotations

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

Dimensions, BOM entries, verification checks, and sketch export.

## Functions

### Annotations & Output

Add dimensions, BOM entries, verification checks, and robot export.

#### `bom()`

```ts
bom(quantity: number, description: string, opts?: BomOpts): void
```

Add a bill-of-materials entry.

#### `robotExport()`

```ts
robotExport(options: RobotExportOptions): CollectedRobotExport
```

Declare that the current script should export an assembly as a robot package for the SDF CLI. Configures inertial properties, joint limits, and optional plugins (e.g. diff-drive for Gazebo).

#### `dim()`

```ts
dim(from: PointArg$1, to: PointArg$1, opts?: DimOpts): void
```

Add a dimension annotation between two points.

#### `dimLine()`

```ts
dimLine(l: Line2D, opts?: DimOpts): void
```

Add a dimension annotation along a Line2D.

### Sketch Export

Export 2D sketches to SVG or DXF format strings.

#### `sketchToDxf()`

```ts
sketchToDxf(sketch: Sketch, options?: SketchDxfOptions): string
```

Export a 2D sketch as a DXF string (R12/AC1009 — maximally compatible). For regular sketches, each polygon loop becomes a closed LWPOLYLINE. For constraint sketches, exports LINE, CIRCLE, and ARC entities from the constraint edge geometry.

#### `sketchToSvg()`

```ts
sketchToSvg(sketch: Sketch, options?: SketchSvgOptions): string
```

Export a 2D sketch as an SVG string. For regular sketches, exports filled polygon regions. For constraint sketches, exports line/arc/circle edge geometry. The SVG uses the sketch's native coordinate system (Y-up) with a transform that flips Y so the output renders correctly in SVG's Y-down space. Coordinates are in sketch units (typically mm).

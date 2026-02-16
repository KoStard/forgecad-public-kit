# ForgeCAD CLI

## Architecture

All CLI tools share the **same forge engine** as the browser UI. There is one source of truth for geometry logic — no code duplication.

```
src/forge/headless.ts    ← Single entry point for all contexts
  ├── kernel.ts          ← Manifold WASM wrapper (Shape, box, cylinder, sphere, etc.)
  ├── runner.ts          ← Script sandbox (Function() with full forge API injected)
  ├── section.ts         ← Plane intersection / projection
  ├── sketch/            ← Complete 2D sketch system (primitives, transforms, booleans,
  │                         constraints, entities, topology, patterns, fillets, arc bridge)
  ├── params.ts          ← Parameter system
  ├── library.ts         ← Part library
  ├── meshToGeometry.ts  ← Manifold mesh → Three.js BufferGeometry
  └── sceneBuilder.ts    ← Three.js scene setup (lighting, camera, materials)
```

**Browser** imports via `src/forge/index.ts` → re-exports from `headless.ts`.
**CLI tools** import directly from `src/forge/headless.ts`.

The key function is `runScript(code, fileName, allFiles)` — it wraps user code in a `Function()` sandbox with the entire forge API injected. CLI scripts just call `init()` + `runScript()` and work with the results.

## Available Commands

### Script Validation

```bash
npm run test-run -- examples/cup.forge.js
npm run test-run -- --debug-imports examples/cup.forge.js
```

Runs a `.forge.js` or `.sketch.js` file in the real runtime and prints object stats, diagnostics, and execution time.

`--debug-imports` adds an import trace (source file, target file, overrides, return type, success/error phase), useful when debugging `importPart()`/`importSketch()` behavior.

### SVG Export (no browser needed)

```bash
npm run svg -- examples/frame.sketch.js [output.svg]

# Or directly:
npx tsx cli/forge-svg.ts examples/frame.sketch.js
npx tsx cli/forge-svg.ts examples/frame.sketch.js output.svg
```

Runs a `.sketch.js` script in Node.js using the real forge engine and outputs SVG. No browser, no Puppeteer — pure Node.

**How it works:** Initializes the Manifold WASM kernel, runs the script through `runScript()`, extracts the Sketch result, converts polygons to SVG paths.

### PNG Render (requires Chrome)

```bash
npm run render -- examples/cup.forge.js [output.png]
```

Renders 3D shapes to PNG images from multiple camera angles. Uses Puppeteer to launch headless Chrome with WebGL for Three.js rendering.

**How it works:**
1. `cli/forge-render.mjs` — Node launcher script. Auto-starts Vite dev server if not running, launches Puppeteer.
2. `cli/render.html` + `cli/render.ts` — Loaded in the browser by Puppeteer. Imports from `src/forge/headless.ts`, runs the script, builds a Three.js scene, renders from multiple angles.
3. Screenshots are captured as base64 PNG and saved to disk.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `FORGE_ANGLES` | `front,side,top,iso` | Camera angles to render |
| `FORGE_SIZE` | `1024` | Image size in pixels |
| `FORGE_PORT` | `5173` | Vite dev server port |
| `CHROME_PATH` | Auto-detected | Chrome/Chromium executable path |

**Camera angles:** `front` (−Y), `back` (+Y), `side` (+X), `top` (+Z), `iso` (diagonal)

### PDF Report (2D drawing pack)

```bash
npm run report -- examples/cup.forge.js [output.pdf]
npm run report -- examples/cup.forge.js [output.pdf] --dim-angle-tol 18
```

Generates a searchable-text PDF report with multiple projected drawing views:
- Bill of Materials page (auto-summed from script `bom()` entries)
- Combined model page (front/right/top/isometric)
- Disassembled component pages (same view set per returned component)
- Auto-generated detail continuation pages for elongated/high-detail views (separate pages, not overlayed)
- `dim()` annotations included per view only when their axis aligns with that view's projection plane axes

BOM aggregation rules:
- Each `bom(quantity, description, { unit })` call contributes one raw entry
- Report export groups by `key` (if provided) else by normalized `description + unit`
- Quantities are summed per group and rendered as line items in the BOM table

Component dimension ownership for disassembled pages:
- Preferred: explicit binding via `dim(..., { component: \"Part Name\" })`
- Fallback: automatic ownership only when both dimension endpoints are unambiguously inside exactly one returned component bounding box
- Ambiguous dimensions are intentionally skipped for disassembled pages

Optional report flag:
- `--dim-angle-tol <degrees>`: include dimensions whose projected direction is within this many degrees of the nearest view axis (default: `12`)

### STL Export (from browser)

STL export is available in the browser UI via the Export panel. Binary STL format.

### Parameter Validation

```bash
npm run param-check -- examples/shoe-rack-doors.forge.js [--samples 10]
```

Samples each parameter across its range and checks for runtime errors, degenerate geometry (volume ≈ 0), and new collisions between parts. Skips intra-group collisions when assembly groups are used.

**Options:**
- `--samples N` — Number of sample points per parameter (default: 8)

**Output example:**
```
✓ Baseline: 6 objects, 12 params
✓ Checked 91 parameter samples (8 per param)

⚠ Found 8 issues across 4 parameters:

  Parameter "Bottom Left Door":
    💥 New collision at values: -120.0, -102.9
       Bottom Left Door ∩ Frame (shared vol: 2561.9mm³)
```

### Transform/Assembly Invariant Check

```bash
npm run check:transforms
```

Runs fast math-level invariants to catch transform order and frame composition regressions before they leak into examples.

### Dimension Propagation Invariant Check

```bash
npm run check:dimensions
```

Runs shape-level invariants for dimension metadata propagation across:
- transform APIs (`translate`, `rotate`, `transform`, `scale`, `mirror`, `rotateAround`)
- copy/style APIs (`clone`, `color`, `setColor`, `smooth/refine/simplify`)
- boolean APIs (`add/subtract/intersect`, plus `union/difference/intersection/hull3d`)
- import runtime path (`importPart(...).color(...).translate(...)`)

### Dimension Debugger

```bash
npm run debug:dimensions -- /path/to/file.forge.js [--all]
npm run debug:dimensions -- /path/to/file.forge.js [--all] [--dim-angle-tol 12]

# Fallback runner (if npx/registry access is unavailable)
bun cli/debug-dimensions.ts /path/to/file.forge.js [--all] [--dim-angle-tol 12]
```

Prints:
- total object count
- total dimension count
- per-view visibility counts (`front/right/top/iso`) using report angle tolerance
- report ownership routing (`combined` vs `component:<name>`) per dimension
- per-object approximate dimension ownership (both endpoints inside object bbox)
- a dimension coordinate list (first 20 by default, `--all` for full dump)

## Adding New CLI Commands

1. Create `cli/your-command.ts`
2. Import from `../src/forge/headless`
3. Call `await init()` to load the WASM kernel
4. Use `runScript(code, fileName, allFiles)` to execute user scripts
5. Add a script to `package.json`: `"your-command": "npx tsx cli/your-command.ts"`

### Minimal Example

```typescript
#!/usr/bin/env node
import { readFileSync } from 'fs';
import { init, runScript } from '../src/forge/headless';

const code = readFileSync(process.argv[2], 'utf-8');

await init();
const result = runScript(code, 'main.forge.js', {});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

for (const obj of result.objects) {
  if (obj.shape) {
    console.log(`${obj.name}: volume=${obj.shape.volume().toFixed(1)}mm³`);
  }
  if (obj.sketch) {
    console.log(`${obj.name}: area=${obj.sketch.area().toFixed(1)}mm²`);
  }
}
```

### Cross-file imports

When running scripts that use `importSketch()` or `importPart()`, pass all sibling files:

```typescript
import { readdirSync, readFileSync } from 'fs';

const allFiles: Record<string, string> = {};
for (const f of readdirSync(scriptDir)) {
  if (f.endsWith('.forge.js') || f.endsWith('.sketch.js')) {
    allFiles[f] = readFileSync(join(scriptDir, f), 'utf-8');
  }
}

const result = runScript(code, 'main.forge.js', allFiles);
```

## Dependencies

| Package | Purpose | Context |
|---------|---------|---------|
| `tsx` | Run TypeScript CLI scripts directly | Dev dependency |
| `puppeteer-core` | Headless Chrome for PNG rendering | Dev dependency |
| `manifold-3d` | Geometry kernel (WASM) | Works in both Node and browser |
| `three` | 3D rendering (used by render.ts) | Loaded in browser context by Puppeteer |

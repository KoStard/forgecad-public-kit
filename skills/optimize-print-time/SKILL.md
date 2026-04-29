---
name: optimize-print-time
description: Optimize a ForgeCAD model for 3D printing time reduction. Use when the user wants to reduce print time for a .forge.js model. Analyzes geometry height, volume, material usage, and compares against reference STLs or known-fast designs.
forgecad-public: true
---

# Optimize Print Time

Systematically reduce 3D print time for a ForgeCAD model by analyzing and minimizing geometry that drives layer count, perimeter paths, and material volume.

## When to Use This

- User says a model takes too long to print
- User wants to compare their model against a faster reference (STL, web generator, etc.)
- User asks to optimize a model for FDM printing

**Not for**: visual quality optimization, structural analysis, slicer profile tuning (though slicer advice can supplement).

## What Drives Print Time (priority order)

1. **Part height** (layer count) — the single biggest factor. Every mm of height = ~5 layers at 0.2mm. Reducing height from 8.6mm to 4.7mm eliminates ~20 layers across the entire bed area.
2. **Per-layer perimeter complexity** — each pocket, hole, or wall generates perimeter toolpaths. Fewer features = faster layers.
3. **Material volume** — more volume = more extrusion time, but less impactful than height and perimeters.
4. **Solid infill area** — large solid floors/ceilings force slow back-and-forth rasters across the full bed.

## Workflow

### 1. Measure the baseline

Run the model and record its stats:

```bash
node dist-cli/forgecad.js run <model.forge.js>
```

Capture: volume (mm³), bounding box (height matters most), triangle count.

### 2. Get a reference (if available)

If the user has a reference STL from another tool that prints faster, analyze it:

```js
// Node script to extract STL bounding box and volume
const buf = fs.readFileSync(path);
const triCount = buf.readUInt32LE(80);
// Parse vertices, compute bbox and signed volume via divergence theorem
```

Compare: height, volume, footprint. The height difference usually explains the time difference.

### 3. Identify reducible geometry

Ask these questions about each geometric feature:

- **Is the full depth/height functionally needed?** Mating features (sockets, plugs) often use the full spec depth when only partial engagement is required. Example: Gridfinity baseplates use 7.0mm receptacles, but bins only need ~4.7mm of engagement.
- **Is there a solid floor that could be open?** Baseplates, trays, and enclosures often have solid bottoms that add full-bed solid layers. Making the bottom open (waffle/rib structure) saves the most time-intensive layers.
- **Are walls thicker than structurally needed?** For non-load-bearing parts, thinner walls = fewer perimeters per layer.
- **Can features be simplified without losing function?** Decorative chamfers, fillets, and bevels add triangles and perimeter complexity.

### 4. Apply changes and re-measure

After each change, re-run and compare:

```bash
node dist-cli/forgecad.js run <model.forge.js>
```

Track the progression:

| Change | Height | Volume | vs Baseline |
|--------|--------|--------|-------------|
| Baseline | 8.6mm | 132,821 mm³ | — |
| Open bottom (base=0) | 7.0mm | 102,834 mm³ | -23% |
| Shallow receptacle (plug=1.5) | 4.7mm | 59,726 mm³ | -55% |

### 5. Validate with STL export and slicer (optional)

Export both variants and compare in a slicer for actual G-code time estimates:

```bash
node dist-cli/forgecad.js export stl <model.forge.js> --output before.stl
# ... apply changes ...
node dist-cli/forgecad.js export stl <model.forge.js> --output after.stl
```

PrusaSlicer CLI (`prusa-slicer --export-gcode`) gives time estimates. BambuStudio CLI may crash on macOS — use the GUI instead.

## Common Optimizations (with examples)

### Eliminate solid floors
```js
// Before: solid base adds full-bed layers
const baseThick = 1.6;  // 8 layers of solid 252×252mm

// After: open bottom, material only in rib walls between features
const baseThick = 0;
```

### Reduce mating feature depth
```js
// Before: full spec depth (over-engineered for the use case)
const hPlug = 3.8;  // full Gridfinity plug depth
// Total: 3.8 + 3.2 = 7.0mm → 35 layers

// After: minimum engagement depth
const hPlug = 1.5;  // just enough for bin foot registration
// Total: 1.5 + 3.2 = 4.7mm → 24 layers (31% fewer)
```

### Reduce part height
General principle: audit every vertical dimension and ask "does this need to be this tall?" Parts designed from a spec often carry unnecessary vertical margin.

## STL Analysis Helper

When comparing against a reference STL, use this Node snippet to extract key metrics from a binary STL:

```js
function analyzeBinaryStl(buf) {
  const triCount = buf.readUInt32LE(80);
  let minX=Infinity, minY=Infinity, minZ=Infinity;
  let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
  let totalVolume = 0;

  for (let i = 0; i < triCount; i++) {
    const offset = 84 + i * 50;
    const verts = [];
    for (let v = 0; v < 3; v++) {
      const vo = offset + 12 + v * 12;
      const x = buf.readFloatLE(vo);
      const y = buf.readFloatLE(vo + 4);
      const z = buf.readFloatLE(vo + 8);
      verts.push([x, y, z]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const [v0, v1, v2] = verts;
    totalVolume += (v0[0]*(v1[1]*v2[2] - v2[1]*v1[2])
                   - v1[0]*(v0[1]*v2[2] - v2[1]*v0[2])
                   + v2[0]*(v0[1]*v1[2] - v1[1]*v0[2])) / 6.0;
  }

  return {
    triangles: triCount,
    bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    size: [maxX-minX, maxY-minY, maxZ-minZ],
    volume: Math.abs(totalVolume),
    height: maxZ - minZ,
  };
}
```

## Slicer-Side Advice (supplement, not primary)

When geometry is already optimized, suggest these slicer settings:
- **Layer height 0.28–0.32mm** for non-cosmetic parts (structural baseplates, brackets)
- **2 walls** instead of 3-4 for thin non-structural parts
- **Lightning infill** for sections that only support top surfaces
- **Arachne/variable width** to eliminate redundant inner perimeters on thin walls
- **Speed 150-200mm/s** for flat, low parts (input shaper required)

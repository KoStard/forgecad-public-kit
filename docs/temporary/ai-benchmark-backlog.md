# ForgeCAD AI Benchmark Backlog

Issues discovered through AI benchmark testing (multi-model evaluation of ForgeCAD script generation).

## ✅ Done: Spatial Feedback Optimization

**Problem:** The test-run spatial feedback was O(n²) pairwise × 3 axes, producing 1200+ lines for a 41-object 3D printer. Most lines were noise ("Z Bearing L is BELOW Spool Rod" — obviously).

**Solution:** Replaced with:
1. Real mesh collision detection (`shape.intersect(other).isEmpty()`) — reports actual solid-volume intersections with shared volume in mm³
2. Nearest-neighbor directional relationships with gap distances, filtered by proximity threshold (15% of scene size)

Result: 1294 → 263 lines, every line actionable. Time impact: 14ms → 21ms.

---

## Backlog

### 1. `lib.elbow()` — Pipe-to-pipe joint primitive

**Problem:** AI models consistently fail to create correct joints between two pipes/cylinders at angles. The 3D printer benchmark showed filament guide tubes with wrong orientation, not connecting to the endpoints. The math for creating a torus section at the right angle, oriented correctly in 3D space, is too complex for models to get right from scratch.

**What's needed:** A high-level `lib.elbow(radius, pipeRadius, angle, options?)` that creates a curved pipe section connecting two directions. Should work naturally with `lib.pipeRoute()` but also be usable standalone.

**API sketch:**
```javascript
// Standalone elbow: 90° bend, pipe radius 5, bend radius 20
const bend = lib.elbow(5, 20, 90);

// With orientation: connect two directions
const bend = lib.elbow(5, 20, { from: [0, 0, 1], to: [1, 0, 0] });
```

**Difficulty:** Medium — the math already exists inside `pipeRoute`'s `makeBend()`. Extract and expose it.

---

### 2. Parameter Collision Detection (Static Analysis)

**Problem:** AI-generated scripts create parameters (sliders) that can produce impossible geometry when moved. Examples:
- Two parts collide at certain parameter values
- Parts move through each other
- Geometry becomes degenerate (zero-thickness walls, inverted shapes)

The user moves a slider and the model breaks — bad experience.

**Proposed approach (low-hanging fruit):**
1. After script execution, sample each parameter at ~10 evenly-spaced values across its range
2. For each sample, re-execute the script and check:
   - Any runtime errors?
   - Any empty/degenerate shapes (volume ≈ 0)?
   - Any new collisions between parts that didn't collide at default values?
3. Report problematic parameter ranges

**Output example:**
```
⚠ Param "Bed Z Pos" causes collision at values > 250:
  Bed Plate ∩ Extruder Carriage (at value=280: shared vol 1200mm³)
⚠ Param "Wall Thickness" causes degenerate geometry at values > 45:
  Inner Box has volume 0mm³ (wall exceeds half of outer dimension)
```

**Difficulty:** Medium — main cost is re-executing the script ~10× per parameter. For 10 params = 100 executions. At 20ms each = 2 seconds. Acceptable for a validation tool.

**Optimization:** Only check parameters that affect geometry near other geometry (use bbox proximity from the default run to filter).

---

### 3. Spatial Feedback: Further Compression

**Status:** Already improved (1294 → 263 lines). Could go further:

**Ideas:**
- Group related objects and report group-level relationships ("Spool Assembly is ABOVE Gantry Assembly")
- Only report relationships between objects that the script explicitly positions relative to each other (parse the AST for `attachTo`, `translate`, `onFace` calls)
- Add a `--verbose` flag for the full output, keep default compact

**Difficulty:** Low-Medium

---

### 4. Assembly Grouping in Scripts

**Problem:** Complex assemblies (3D printer = 41 objects) have logical groups (bed assembly, gantry, extruder, spool holder, electronics). The AI creates these groups implicitly via naming conventions and code structure, but ForgeCAD doesn't know about them.

**Benefit:** If the engine knew about groups, spatial feedback could report at group level, collision detection could skip intra-group checks (e.g., spool hub inside spool shell is intentional), and the UI could collapse/expand groups.

**Possible API:**
```javascript
// Declare a group with a name
const bedAssembly = group(bedPlate, glass, carriage, springs)
  .name("Bed Assembly");

// Or via return format
return [
  { name: "Bed Assembly", group: [
    { name: "Bed Plate", shape: bedPlate },
    { name: "Glass", shape: glass },
  ]},
  { name: "Gantry", group: [...] },
];
```

**Difficulty:** Medium — needs changes to SceneObject, runner, ViewPanel, and spatial analysis.

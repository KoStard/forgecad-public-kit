# ForgeCAD AI Benchmark Backlog

Issues discovered through AI benchmark testing (multi-model evaluation of ForgeCAD script generation).

## ✅ Done: Spatial Feedback Optimization

**Problem:** The test-run spatial feedback was O(n²) pairwise × 3 axes, producing 1200+ lines for a 41-object 3D printer. Most lines were noise ("Z Bearing L is BELOW Spool Rod" — obviously).

**Solution:** Replaced with:
1. Real mesh collision detection (`shape.intersect(other).isEmpty()`) — reports actual solid-volume intersections with shared volume in mm³
2. Nearest-neighbor directional relationships with gap distances, filtered by proximity threshold (15% of scene size)

Result: 1294 → 263 lines, every line actionable. Time impact: 14ms → 21ms.

---

## ✅ Done: `lib.elbow()` — Pipe-to-pipe joint primitive

Extracted the torus-section bend math from `pipeRoute`'s internal `makeBend()` into a standalone `lib.elbow()` function.

**API:**
```javascript
lib.elbow(pipeRadius, bendRadius, angle?)                    // angle in degrees, default 90
lib.elbow(pipeRadius, bendRadius, angle, { wall, segments })  // hollow, custom segments
lib.elbow(pipeRadius, bendRadius, { from, to, wall })         // direction-based orientation
```

Supports solid and hollow pipes, angle-based and direction-based orientation. Added type hints in CodeEditor and API docs.

---

## ✅ Done: Parameter Collision Detection (Static Analysis)

New CLI tool: `npm run param-check -- script.forge.js [--samples N]`

Samples each parameter at N evenly-spaced values across its range (default 8) and checks for:
1. Runtime errors at certain values
2. Degenerate geometry (volume ≈ 0 when it was non-zero at defaults)
3. New collisions between parts that didn't collide at default values

Skips intra-group collisions (objects in the same assembly group).

**Example output:**
```
⚠ Found 8 issues across 4 parameters:

  Parameter "Bottom Left Door":
    💥 New collision at values: -120.0, -102.9
       Bottom Left Door ∩ Frame (shared vol: 2561.9mm³)

  Parameter "Top Right Door":
    💥 New collision at values: 102.9, 120.0
       Frame ∩ Top Right Door (shared vol: 1012.8mm³)
```

---

## ✅ Done: Assembly Grouping in Scripts

Scripts can now return nested groups:

```javascript
return [
  { name: "Bed Assembly", group: [
    { name: "Bed Plate", shape: bedPlate },
    { name: "Glass Bed", shape: glass },
  ]},
  { name: "Gantry", group: [...] },
];
```

Each object gets a `groupName` field in `SceneObject`. Benefits:
- **Spatial analysis** skips intra-group collision checks (intentional overlaps)
- **Group-level summary** reports relationships between assembly groups
- **Object listing** shows group tags: `Bed Plate [Bed Assembly]`

---

## ✅ Done: Spatial Feedback Further Compression

Added group-level spatial summary. When groups exist, computes group bounding boxes and reports group-to-group relationships:

```
Groups:
  Bed Assembly is LEFT of Gantry (gap: 20mm)
  Bed Assembly is BELOW Extruder (gap: 3mm)
```

---

## Backlog (remaining)

### AST-based relationship filtering

**Idea:** Only report spatial relationships between objects that the script explicitly positions relative to each other (parse the AST for `attachTo`, `translate`, `onFace` calls). Would further reduce noise in spatial feedback.

**Difficulty:** Medium — requires lightweight AST parsing of user scripts.

### UI group collapse/expand

**Idea:** When groups exist, the ViewPanel could show collapsible group headers with child objects underneath. Currently groups are flattened in the UI.

**Difficulty:** Medium — needs changes to ViewPanel component.

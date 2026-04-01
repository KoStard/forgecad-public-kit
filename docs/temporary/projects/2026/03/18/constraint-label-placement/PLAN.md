# Constraint Visualization — Investigation Project

**Goal**: Bring constraint visualization quality to Fusion360 level — constraints should be visually clear, attached to their geometry, and readable even in complex sketches like `spectrogram` (54 constraints, 31 points).

**Date**: 2026-03-18

---

## Current State

The constraint solver works well (12.8× speedup from prior optimization). The visualization needs work.

### Original Problems (before this project)
1. Naive label nudging (pairwise point-repulsion, MIN_SEP=5, 30 iters) ignoring text width
2. No geometry awareness — labels placed over edges/surfaces
3. Labels float disconnected from what they constrain
4. Surface labels collide when centroids overlap
5. All constraints rendered as text (`LDIST=5`, `PAR`, `PERP`) regardless of type

### How Fusion360 Does It
- **Geometric constraints** (parallel, equal, perpendicular, etc.): Small tick marks/symbols placed **on each affected edge**, not floating in space
- **Dimensional constraints** (length, angle, distance): Actual **dimension geometry** — extension lines, dimension lines with arrows, arc sweeps for angles — with the value sitting on the annotation
- **On-demand visibility** — show constraints on hover/select (not feasible in static SVG)
- **Key insight**: Constraints are annotation geometry, not text labels

---

## Architecture

### Current Data Flow
```
displayPosition() per constraint → single [x,y] position
    ↓
buildConstraintDisplays() in registry.ts → nudged positions
    ↓
buildConstraintSvgDocument() in sketch-svg.ts → text labels at positions
```

### Target Data Flow (Phase 3)
```
displayAnnotations() per constraint → annotation geometry (symbols, dimension lines, arcs)
    ↓
buildConstraintDisplays() → annotations + force-layout for dimension values only
    ↓
SVG/Three.js renderers → geometric annotations per type
```

### Key Files
| File | Role |
|------|------|
| `src/forge/sketch/constraints/registry.ts` | Display building + force-directed layout |
| `src/forge/sketch/constraints/types.ts` | `ConstraintDisplay`, `ConstraintAnnotation` types |
| `src/forge/sketch/constraints/helpers.ts` | Geometry helpers |
| `src/forge/sketch/constraints/defs/*.ts` | Per-constraint display definitions |
| `cli/sketch-svg.ts` | SVG annotation rendering |
| `cli/label-metrics.ts` | Quality metrics |
| `cli/check-constraints.ts` | Test runner + snapshot generation |
| `src/components/Viewport.tsx` | Browser Three.js rendering |

---

## Testing Methodology

### Automated Quality Metrics (`cli/label-metrics.ts`)
1. **Label-label overlap count** — text bounding box intersections
2. **Label-edge overlap count** — labels crossing geometry segments
3. **Mean/max entity distance** — how far labels drift from constrained entities

### Visual Inspection (SVG snapshots)
- `spectrogram` (54 constraints) — the stress test
- `rect-6x4` (6 constraints) — simple rectangle
- `equilateral-10` (4 constraints) — triangle
- `angle-30-from-horiz` (3 constraints) — minimal

---

## Progress Tracker

| # | Phase | Spectrogram Overlaps (L-L / L-E) | Mean Dist | Status |
|---|-------|----------------------------------|-----------|--------|
| — | Original baseline | 16 / 38 | 5.4 | ✅ Measured |
| 1 | Force-directed + leader lines | 0 / 17 | 8.8 | ❌ Rejected (cluttered) |
| 2 | Compact Unicode symbols (no leaders) | 0 / 15 | 5.5 | ❌ Rejected (wrong paradigm) |
| 3 | Geometric annotations (Fusion360-style) | 0 / 11 | 5.5 | ✅ Implemented |

---

## Experiment Log

### Experiment 1: Force-directed label placement + leader lines (REJECTED)

**What**: Replaced naive pairwise repulsion with multi-force simulation:
- Text-width-aware bounding box collision detection
- Edge geometry repulsion forces
- Entity tethering (spring force)
- Dashed leader lines from label to entity centroid

**Result**: Label-label overlaps 16→0, label-edge overlaps 38→17. Technically successful on metrics.

**Why it failed**: Leader lines added visual clutter — a web of dashed lines criss-crossing the sketch made it *harder* to read, not easier. The fundamental problem remained: labels are disconnected text floating in space, and leader lines are a band-aid that makes the noise worse.

**Lesson**: Leader lines are a symptom of the wrong approach. If labels need leader lines to be understandable, the labels are in the wrong place. The right fix is to put the annotation **on the geometry itself**.

---

### Experiment 2: Compact Unicode symbols (REJECTED)

**What**: Replaced verbose text labels with single Unicode symbols:
- `PERP→⊥`, `PAR→∥`, `EQ→=`, `FIX→⚓`, `CCW→↺`, `MID→◆`, `LEN→⟨`, `LDIST→↕`, etc.
- Removed leader lines since symbols are compact enough to sit near entities
- Tightened force-directed placement (stronger tether, shorter leash)

**Result**: 0 label-label overlaps, 15 edge overlaps, 5.5 mean entity distance. Good metrics.

**Why it failed**: Symbols are more compact, but the paradigm is still wrong:
1. **Parallel** affects 2 lines but shows 1 symbol floating between them — which line is parallel to what?
2. **Length** shows `⟨22` floating near a line — Fusion360 draws actual dimension lines with arrows
3. **Angle** shows `∠46` in space — Fusion360 draws an arc sweep between the lines
4. A constraint that affects N entities should have a visual presence **on each entity**, not a single marker somewhere in the air

**Lesson**: The problem isn't label *styling* (text vs symbols) — it's the fundamental display model. `displayPosition() → [x,y]` can only ever produce one floating marker. We need `displayAnnotations() → geometry[]` that produces marks on each affected entity.

---

### Experiment 3: Geometric annotations — Fusion360-style (IMPLEMENTED)

**What**: Redesign the constraint display system to emit **annotation geometry** instead of label positions.

Two categories:

#### Geometric Constraints (symbols on entities)
No force-directed layout needed — symbols placed at fixed positions on their geometry.

| Constraint | Annotation | Placement |
|-----------|------------|-----------|
| Parallel `∥` | Tick marks `>>` | Midpoint of each line |
| Equal `=` | Tick marks `=` | Midpoint of each line |
| Perpendicular `⊥` | Right-angle box | At intersection of the two lines |
| Horizontal `H` | `H` symbol | Midpoint of line |
| Vertical `V` | `V` symbol | Midpoint of line |
| Fixed `⚓` | Anchor icon | At the fixed point |
| Midpoint `◆` | Diamond | At the midpoint on the line |
| Coincident `⊙` | Dot | At the coincident point |
| Collinear `⋅` | Dot on line | At the point on the line |
| Tangent `⊤` | T-mark | At the tangent point |
| CCW `↺` | Curved arrow | At polygon centroid |
| Symmetric `⟷` | Mirror marks | At each symmetric point |

#### Dimensional Constraints (dimension lines + value)
Force-directed layout applies to value text position only.

| Constraint | Annotation Geometry |
|-----------|-------------------|
| Length | Extension lines from endpoints + offset dimension line with arrows + value |
| Distance | Extension lines between points + dimension line + value |
| Angle | Arc sweep between the two lines + value on arc |
| AbsoluteAngle | Arc from horizontal reference + value |
| LineDistance | Perpendicular offset indicator + value |
| PointLineDistance | Extension from point to line + value |

**Result**: 0 label-label overlaps, 11 label-edge overlaps (dimension lines intentionally cross edges), 5.5 mean entity distance.

**Why it works**: Annotations are **on the geometry**, not floating. No ambiguity about what constrains what. Dimension lines follow the universal engineering drawing standard.

**What was implemented**:
1. `AnnotationElement` type system with 4 variants: `symbol`, `dimension`, `angle-arc`, `text` (fallback)
2. `ConstraintSymbol` type with 13 named symbols, each rendered as SVG paths (not Unicode/emoji)
3. `displayAnnotations()` added to all 29 constraint definition files
4. SVG renderer (`sketch-svg.ts`): `renderSymbol()`, `renderDimension()`, `renderAngleArc()` with full SVG path geometry
5. Three.js renderer (`Viewport.tsx`): annotation lines, arrowheads, arcs as Three.js geometry + Html label overlays
6. All 43 constraint tests pass, all 4 SVG snapshots updated

---

## Implementation Plan — Phase 3

### New Types

```typescript
// Annotation elements emitted by each constraint's display function
type AnnotationElement =
  // Symbol placed at a specific position (geometric constraints)
  | { kind: 'symbol'; position: [number, number]; symbol: string; rotation?: number }
  // Dimension line with extension lines and value (length, distance)
  | { kind: 'dimension'; from: [number, number]; to: [number, number]; offset: number; value: string }
  // Angle arc with value (angle constraints)
  | { kind: 'angle-arc'; center: [number, number]; startAngle: number; endAngle: number;
      radius: number; value: string }
  // Fallback text label (for constraints not yet migrated)
  | { kind: 'text'; position: [number, number]; text: string };
```

### Files to Modify
| File | Change |
|------|--------|
| `types.ts` | Add `ConstraintAnnotation` type, add `annotations` field to `ConstraintDisplay` |
| `registry.ts` | Call `displayAnnotations()` if defined, fall back to `displayPosition()` |
| `defs/parallel.ts` | Emit 2 tick-mark symbols on each line |
| `defs/equal.ts` | Emit tick marks on each line |
| `defs/perpendicular.ts` | Emit right-angle box at intersection |
| `defs/length.ts` | Emit dimension line geometry |
| `defs/angle.ts`, `absoluteAngle.ts` | Emit angle arc geometry |
| `defs/lineDistance.ts` | Emit offset dimension geometry |
| `defs/fixed.ts`, `midpoint.ts`, `coincident.ts`, etc. | Emit symbol-on-entity |
| `sketch-svg.ts` | Render annotation geometry (lines, arcs, symbols) instead of text |
| `Viewport.tsx` | Render annotations in Three.js |
| `label-metrics.ts` | Update metrics for annotation-based display |

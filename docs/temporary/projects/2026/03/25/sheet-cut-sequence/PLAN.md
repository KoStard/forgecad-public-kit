# Sheet Cut Sequence — Investigation Plan

## Goal

Add cut sequencing to the sheet material cutting layout system. Each sheet page in the PDF should show the **order** in which end-to-end guillotine cuts should be made, optimized to minimize total cut length. The sequence should also be printable via CLI for debuggability.

## Current State (Baseline)

- **Packing**: Guillotine bin packing works well — pieces placed with best-short-side-fit heuristic
- **PDF output**: Sheet pages show piece positions, ruler marks, dashed cut reference lines, color-coded pieces, legend for small pieces
- **Cut reference lines**: Already drawn as dashed lines at every piece boundary — but no ordering, no numbering
- **CLI**: No CLI command for cutting layout at all (`forge-report` is multi-view drawings only)
- **Data model**: `PackedPiece` has `x, y, width, height` — no cut sequence info

## Architecture Summary

The guillotine packing algorithm in `cuttingLayout.ts` already makes guillotine splits — each placement divides a free rectangle into two smaller rectangles. This split tree **is** the cut sequence — we just need to capture it during packing.

Key insight: In guillotine cutting, every cut goes from one edge of the current piece to the opposite edge. The split tree naturally defines the order: you make the first cut to divide the sheet into two regions, then recursively cut each region.

### Cut Sequence Data Flow

```
packMaterialGroup() → captures split tree → CutSequence[]
  ↓
renderSheetPage() → draws numbered cut lines with arrows
  ↓
CLI → prints cut list as text table
```

### Cut Representation

```typescript
interface GuillocutineCut {
  step: number;        // 1-based sequence number
  axis: 'x' | 'y';    // cut direction
  position: number;    // mm from sheet origin
  fromMm: number;      // start along the perpendicular axis
  toMm: number;        // end along the perpendicular axis
  lengthMm: number;    // cut length in mm
}
```

## Approach

### Phase 1: Capture the split tree during packing

The guillotine packing already chooses split axis + position. We just need to record each split as a `GuillocutineCut` with its bounding region, then flatten the tree into a sequence.

**Strategy for minimizing cut length**: The splits are already determined by piece placement — what we optimize is the **order** of cuts within sibling splits. At each level, prefer the shorter cut first (greedy).

### Phase 2: Add cut sequence to data model

- Add `cuts: GuillocutineCut[]` to `PackedSheet`
- Add total cut length to `CuttingLayoutResult`

### Phase 3: Render cut sequence in PDF

- Number each cut line on the sheet page
- Draw small step numbers near cut lines
- Add a "Cut Sequence" section to the summary page

### Phase 4: CLI output

- New `forgecad export cutting-layout <script> [output.pdf]` CLI command
- With `--print-cuts` flag (or always) print cut sequence table to stdout
- Format: step, direction, position, length

## Progress Tracker

| # | Change | Metric | Status |
|---|--------|--------|--------|
| — | Baseline | No cut sequencing | — |
| P1 | Capture split tree | 14 cuts on sheet 1, 8 on sheet 2 | Done |
| P2 | Render in PDF | Numbered circles with color gradient | Done |
| P3 | CLI output | Text table with step/dir/from/to/length | Done |
| P4 | Integration test | 15 pieces, 2 sheets, 10855mm total cuts | Done |

## Experiment Log

#### P1: Capture guillotine splits inline (SUCCESS)
**What**: Modified `packMaterialGroup()` to record each guillotine split as a `GuillotineCut` with endpoints and direction. Each piece placement generates 0-2 cuts depending on whether sub-rectangles are degenerate.
**Result**: 14 cuts for 9-piece sheet, 8 cuts for 6-piece sheet. Total 10855mm cut length.
**Why it worked**: The split decision was already computed (splitA vs splitB) — we just stored the geometric info.
**Lesson**: Inline capture during packing is simpler and more accurate than post-hoc reconstruction.

#### P2: PDF numbered cut lines (SUCCESS)
**What**: Replaced dashed cut reference lines with numbered cut sequence lines. Each cut gets a colored dashed line (blue→red gradient by step order) with a numbered white circle at the midpoint.
**Result**: Visually clear cut ordering in PDF. Step numbers visible at a glance.

#### P3: CLI text table (SUCCESS)
**What**: `formatCutSequence()` produces aligned text table with step, direction (V/H), from/to coordinates, and length. `forgecad export cutting-layout` command registered.
**Result**: Clean tabular output suitable for workshop printout or terminal inspection.

#### P4: Integration test (SUCCESS)
**What**: Tested with 7 sheetStock declarations (15 pieces across 2 materials). Verified PDF generation (27954 bytes, 3 pages) and CLI text output.
**Result**: All data flows end-to-end. Summary page shows cut counts and total length per material.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/export/cuttingLayout.ts` | Core: GuillotineCut type, capture splits, numbered PDF rendering, formatCutSequence() |
| `src/forge/export/index.ts` | Export new types and functions |
| `src/forge/headless.ts` | Export new types and functions for CLI access |
| `cli/forge-cutting-layout.ts` | New CLI command for cutting layout export |
| `cli/forgecad.ts` | Register `export cutting-layout` command |
| `examples/cutting-layout-demo.forge.js` | Demo script with sheetStock declarations |

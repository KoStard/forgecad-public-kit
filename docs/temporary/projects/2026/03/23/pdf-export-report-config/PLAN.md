# PDF Export: Remove Auto-Zoom & Plan Programmatic Report Configuration

## Goal & Current State

**Problem**: The automatic "focused view" (detail/zoom) pages in PDF report export use heuristics (edge density grid, aspect ratio thresholds) that are hard to tune, hard to measure, and produce inconsistent results. They add complexity without reliable value.

**Action taken**: Removed the automatic detail page generation entirely — `selectDetailRegions`, `collectDetailPagesFor`, `DetailPageSpec`, and all supporting code. PDF reports now contain only: BOM pages, assembly overview pages, and component detail pages (the standard 4-view grid pages).

**Baseline**: Reports are now simpler and predictable. No zoomed pages are generated.

---

## Vision: Programmatic Report Configuration

Instead of automatic zoom detection, let the **user** control what appears in the report from within their `.forge.js` script. This makes reports intentional, reproducible, and testable.

### Design Principles

1. **User-driven, not heuristic-driven** — the script author knows what matters
2. **Composable** — report directives build on the existing object/dimension system
3. **Non-breaking** — scripts without report directives produce the same default report as today
4. **Minimal API surface** — a few well-chosen primitives, not a page layout DSL

### Proposed API Surface

#### `report.focusView(target, options?)`

Add a dedicated page showing a zoomed view of a specific region or object.

```js
// Focus on a specific object by reference
const bolt = cylinder(3, 12).translate(50, 0, 10);
report.focusView(bolt, { label: 'M6 Bolt Detail' });

// Focus on a bounding box region (model coordinates)
report.focusView({ from: [40, -5, 0], to: [60, 15, 20] }, { label: 'Fastener Area' });

// Focus with a specific view direction
report.focusView(bolt, { view: 'front', label: 'Bolt Side View' });
```

**Options**:
- `label?: string` — page title (defaults to object name or "Detail")
- `view?: 'front' | 'right' | 'top' | 'iso' | ViewFrame` — which projection (defaults to all 4 standard views in a grid, like component pages)
- `padding?: number` — extra space around the target as fraction of span (default 0.15)

#### `report.page(options)`

Add a fully custom page with explicit content selection.

```js
report.page({
  title: 'Assembly Close-up',
  objects: [bracket, bolt, nut],       // which objects to show
  dimensions: [d1, d2],               // which dimensions to include
  view: 'front',                       // single view, full page
});
```

#### `report.note(text)`

Add a text annotation page (for manufacturing notes, revision history, etc.).

```js
report.note('All dimensions in mm. Tolerances per ISO 2768-m.');
```

### Implementation Approach

1. **Report directives accumulate on `RunResult`** — similar to how `bom()` entries and `dimension()` calls already work. The `report.*` calls register page specs during script execution.

2. **`buildPages()` reads the directives** — after generating the default pages (BOM + assembly + components), it appends user-defined pages in the order they were declared.

3. **Focus view rendering reuses `renderViewCell`** — the existing single-view rendering path already handles bounds override and view selection. The removed `boundsOverride` option on `renderViewCell` would be re-added, but only triggered by explicit user directives, not heuristics.

4. **Object targeting** — `report.focusView(object)` computes the projected bounds of that specific object (using the existing `projectedObjectBounds`) and passes it as the bounds override. No edge-density heuristics needed.

### What This Replaces

| Old (removed) | New (proposed) |
|---|---|
| Automatic edge-density scan | User explicitly marks what to focus on |
| Aspect ratio threshold (>2.8) | No threshold — user decides |
| Grid-based region picking | Direct object or bbox targeting |
| "Detail A / Detail B" labels | User-provided labels |
| 90-14000 edge count filter | No filter — user knows their model |

### Open Questions

- Should `report.focusView` support showing **multiple objects** in one zoomed page? (Probably yes — pass an array.)
- Should there be a `report.exclude(object)` to hide specific parts from the default assembly overview? (Maybe — but adds complexity.)
- How should report directives interact with the component disassembly pages? Should users be able to suppress auto-generated component pages for specific parts?
- Should `report.page()` support multi-view grids, or always be single-view? (Start with single-view, add grid later if needed.)

### Non-Goals

- Full page layout control (margins, scaling, grid arrangement) — keep it opinionated
- Custom PDF styling (fonts, colors, line weights) — not a design tool
- Conditional pages based on parameters — scripts can use regular JS `if` statements

---

## Files Modified

| File | Change |
|------|--------|
| `src/forge/report.ts` | Removed ~180 lines: `DetailPageSpec`, `DetailRegion`, `clampBounds2`, `selectDetailRegions`, `dimensionTouchesBounds`, `collectDetailPagesFor`, `boundsOverride`/`viewLabelOverride` options, detail page rendering block |

## Experiment Log

#### Remove automatic detail pages (SUCCESS)
**What**: Deleted all auto-zoom page generation code — the heuristic-based `selectDetailRegions` system and all its supporting infrastructure.
**Result**: Clean build, ~180 lines removed. Reports are now deterministic: BOM + assembly overview + component pages only.
**Why it worked**: The auto-zoom was fundamentally flawed — heuristics can't know what the designer considers important. Removing it simplifies the codebase and unblocks a better user-driven approach.
**Lesson**: When automation requires magic numbers that are "hard to measure" and "hard to automate reliably," that's a signal the feature belongs at the user API level, not the engine level.

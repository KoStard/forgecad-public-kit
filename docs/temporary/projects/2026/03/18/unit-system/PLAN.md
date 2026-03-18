# Unit System for ForgeCAD

## Goal & Current State

**Goal**: Introduce a proper unit system so all numeric values have well-defined physical meaning, users can choose their preferred unit, and all display/export code respects it.

**Current state**: Everything is implicitly millimeters. There are ~20 locations that hardcode `"mm"` as a display suffix. No conversion infrastructure exists. The `param()` API has an optional `unit` field but it's purely cosmetic — it doesn't affect computation. There's no settings UI for unit preference.

### Baseline Audit

| Location | What's hardcoded | File |
|----------|-----------------|------|
| Constraint labels | `'mm'` / `'deg'` | `Viewport.tsx:2101` |
| Measure tool overlay | `.toFixed(2)} mm` | `Viewport.tsx:3004` |
| Entity inspector (length, radius, center, position) | `mm` suffix | `Viewport.tsx:4652-4679` |
| Measurement sidebar | `.toFixed(2)} mm` | `App.tsx:274` |
| Notebook shape output | `mm^3`, `mm^2` | `notebook/output.ts:11,15` |
| View panel sketch regions | `mm²` | `ViewPanel.tsx:863` |
| Report dimensions | `mm` | `report.ts:1955` |
| SVG export comments | `"typically mm"` | `exportSvg.ts` |
| DXF export | No unit metadata at all | `exportDxf.ts` |
| SDF export volume | `volumeMm3` variable name | `sdfExport.ts` |
| Verification API | Tolerances assume mm | `verification.ts` |
| Constraint solver tolerance | `1e-3` (fine for mm, too tight for m, too loose for µm) | `constraints/registry.ts` |

## Architecture Summary

ForgeCAD is a browser-based parametric CAD tool. Scripts (`.forge.js`) define geometry via an API that operates on raw numbers. The implicit contract is "1 unit = 1 mm". Numbers flow through:

1. **Script API** → `param()` declares slider parameters with optional `unit` label
2. **Constraint solver** → works on raw numbers with tolerance `1e-3`
3. **3D kernel** (Manifold/OpenCascade) → unitless; output volumes are in unit³
4. **Display** → hardcoded `"mm"` labels everywhere
5. **Export** → STL/3MF/DXF/SVG — raw numbers, no unit metadata

**Key insight**: The internal representation should stay in mm. The unit system is a **display and I/O layer**, not a core engine change. Scripts always author in mm. The unit preference controls:
- How values are **displayed** in the UI
- How values are **formatted** in exports
- What **unit labels** appear on constraints, measurements, entity info
- Optionally: unit metadata in export file headers (DXF `$INSUNITS`, 3MF unit attribute)

## Design

### Unit Types

```typescript
type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
type AreaUnit = 'mm²' | 'cm²' | 'm²' | 'in²' | 'ft²';
type VolumeUnit = 'mm³' | 'cm³' | 'm³' | 'in³' | 'ft³';
type AngleUnit = 'deg'; // angles stay degrees always
```

### Conversion Factors (from mm)

| Unit | Factor |
|------|--------|
| mm | 1 |
| cm | 0.1 |
| m | 0.001 |
| in | 1/25.4 |
| ft | 1/304.8 |

### Where the unit preference lives

- `ViewPreferencesState.lengthUnit: LengthUnit` — persisted to localStorage via existing `writeViewPreferences`
- Default: `'mm'` (no change for existing users)
- Exposed via `useForgeStore(s => s.lengthUnit)`

### Unit utility module (`src/forge/units.ts`)

```typescript
export function formatLength(mm: number, unit: LengthUnit, decimals?: number): string
export function formatArea(mm2: number, unit: LengthUnit, decimals?: number): string
export function formatVolume(mm3: number, unit: LengthUnit, decimals?: number): string
export function convertFromMm(mm: number, unit: LengthUnit): number
export function convertToMm(value: number, unit: LengthUnit): number
export function unitLabel(unit: LengthUnit): string         // "mm", "cm", etc.
export function areaLabel(unit: LengthUnit): string          // "mm²", "cm²", etc.
export function volumeLabel(unit: LengthUnit): string        // "mm³", "cm³", etc.
```

### Settings UI

Add a unit selector to an existing toolbar/settings area. Options: mm, cm, m, in, ft. Persisted to localStorage.

## Progress Tracker

| # | Change | Hardcoded sites fixed | Status |
|---|--------|-----------------------|--------|
| — | Baseline | 0/~15 | Measured |
| P1 | `units.ts` module | — | ✅ Done |
| P2 | Store + persistence | — | ✅ Done |
| P3 | Display layer (Viewport, App, ViewPanel) | ~12 | ✅ Done |
| P4 | Report + notebook output | ~2 | ✅ Done |
| P5 | Export metadata (DXF, 3MF) | N/A | ⏭ Skipped — DXF export doesn't exist, 3MF already defaults to mm |
| P6 | Settings UI (ViewPanel unit selector) | — | ✅ Done |
| P7 | Param display units | — | ⏭ Skipped — user-defined per-param, stays cosmetic |

## Decisions

- **Verification API messages stay in mm**: The verification API (`verify.volumeApprox`, `verify.centersCoincide`, etc.) always operates on mm values from the script. Changing display units here would be confusing since tolerance/expected values in the script are mm.
- **Joint view prismatic unit stays "mm" default**: Runs in eval worker without store access. Future work if needed.
- **Param `unit` field stays cosmetic**: Script authors control their own parameter unit labels.

## Experiment Log

#### P1–P6: Unit System Implementation (SUCCESS)
**What**: Created `units.ts` with conversion/formatting utilities, added `lengthUnit` to store with localStorage persistence, replaced all hardcoded `"mm"` display strings in Viewport (constraint labels, measure tool, entity inspector, dimension annotations), App (measurement sidebar), ViewPanel (sketch region areas), and report.ts (PDF dimension labels). Added unit selector buttons to ViewPanel.
**Result**: Type-check clean, build succeeds. All ~12 user-facing display sites now respect the `lengthUnit` preference.
**Lesson**: Internal representation stays mm — the unit system is purely a display/IO layer, keeping the change minimal and safe.

## Files to Modify

| File | Purpose |
|------|---------|
| `src/forge/units.ts` | **NEW** — conversion + formatting utilities |
| `src/store/forgeStore.ts` | Add `lengthUnit` to `ViewPreferencesState` |
| `src/components/Viewport.tsx` | Replace hardcoded `'mm'` with formatted values |
| `src/App.tsx` | Measurement display |
| `src/components/ViewPanel.tsx` | Sketch region areas |
| `src/forge/report.ts` | Dimension labels |
| `src/notebook/output.ts` | Shape/sketch summaries |
| `src/forge/sketch/exportDxf.ts` | DXF `$INSUNITS` header |
| `src/forge/sketch/exportSvg.ts` | SVG unit comments |
| Settings UI component | Unit selector |

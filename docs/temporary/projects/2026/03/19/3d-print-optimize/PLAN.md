# 3D Print Time Estimation & Optimization Loop

## Goal

Build a complete agent-driven loop:
1. ForgeCAD script → 3MF export → BambuStudio CLI slice → parse print time
2. Agent iterates on the model (layout, parameters, geometry) to minimize print time
3. Captures results and best models in a directory for review

## Current State

### What Works
- **`forgecad export 3mf`** — CLI mesh export to 3MF (just added)
- **`forgecad export stl`** — CLI mesh export to binary STL (just added)
- **BambuStudio CLI** — installed at `/Applications/BambuStudio.app/Contents/MacOS/BambuStudio`
  - Supports `--slice 0 --export-3mf output.gcode.3mf` for headless slicing
  - Profiles available for BambuLab printers (A1, A1 mini, X1C, P1S, etc.)
  - Print time embedded in G-code comments inside the `.gcode.3mf` ZIP

### What's Missing
- **Slicer wrapper script** — call BambuStudio CLI, parse print time from output
- **Agent skill** — orchestrate the build→export→slice→optimize loop
- **Printer profile configuration** — need to know which printer/filament to target

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│  .forge.js      │───>│ forgecad     │───>│ BambuStudio CLI │───>│ Parse print  │
│  (model script) │    │ export 3mf   │    │ --slice 0       │    │ time from    │
│                 │    │              │    │ --export-3mf    │    │ .gcode.3mf   │
└─────────────────┘    └──────────────┘    └─────────────────┘    └──────────────┘
        ▲                                                                │
        │                                                                │
        └──────────── Agent modifies script ◄────── time estimate ───────┘
```

### BambuStudio CLI Command Template

```bash
PROFILES="/Applications/BambuStudio.app/Contents/Resources/profiles/BBL"

/Applications/BambuStudio.app/Contents/MacOS/BambuStudio \
  --load-settings "$PROFILES/machine/<PRINTER>.json;$PROFILES/process/<PROCESS>.json" \
  --load-filaments "$PROFILES/filament/<FILAMENT>.json" \
  --orient 1 \
  --arrange 1 \
  --slice 0 \
  --export-3mf /tmp/output.gcode.3mf \
  input.stl
```

### Print Time Extraction

The `.gcode.3mf` is a ZIP. Print time is in `Metadata/plate_1.gcode`:
```bash
unzip -p output.gcode.3mf Metadata/plate_1.gcode | grep -i "estimated printing time"
# ; estimated printing time (normal mode) = 2h 45m 32s
```

## Available Printer Profiles

Machine profiles at `$PROFILES/machine/`:
- `Bambu Lab A1 0.4 nozzle.json`
- `Bambu Lab A1 mini 0.4 nozzle.json`
- `Bambu Lab X1 Carbon 0.4 nozzle.json` (if present)

Process profiles at `$PROFILES/process/`:
- `0.20mm Standard @BBL A1.json`
- Various layer heights: 0.08mm, 0.12mm, 0.16mm, 0.20mm, 0.28mm

Filament profiles at `$PROFILES/filament/`:
- `Generic PLA @BBL A1.json`
- `Bambu PLA Basic @BBL A1.json`

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| P1 | Add `forgecad export 3mf` and `forgecad export stl` CLI commands | ✅ Committed |
| P2 | Slicer wrapper script (`scripts/slice-estimate.mjs`) | TODO |
| P3 | End-to-end test: export → slice → parse time | TODO |
| P4 | Agent skill for print optimization loop | TODO |

## Next Steps

1. **Determine printer model** — need user's specific BambuLab printer
2. **Build `scripts/slice-estimate.mjs`** — Node script that:
   - Takes a `.forge.js` or `.3mf`/`.stl` file
   - Runs BambuStudio CLI with configured profiles
   - Parses and returns print time + filament usage
3. **Test the full pipeline** end-to-end with a real model
4. **Build the agent skill** in `skills/` that orchestrates:
   - Model generation from prompt
   - Export to 3MF
   - Slice and get time estimate
   - Iterate with modifications
   - Save results comparison

## Known Issues

- BambuStudio CLI sometimes refuses to slice models that work in GUI
- The solver WASM init fails in CLI context (separate fix in progress)
- OrcaSlicer is an alternative if BambuStudio CLI proves unreliable (not installed, can be added via `brew install --cask orcaslicer`)

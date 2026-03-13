# Manufacturing Outputs And Flat Patterns
## Problem Definition
Exact solids alone are not enough for manufacturing-oriented workflows. We need disciplined 2D outputs and flat patterns that come from compiler-owned intent instead of exporter-only improvisation.

## Description
Add manufacturing-oriented outputs for the defended exact subset, with sheet-metal flat patterns as the first serious proof point.

Primary dependencies:

- task 310

Primary files:

- export pipeline modules
- exact/export diagnostics
- CLI/export docs
- manufacturing regression fixtures

## Requirements
- Support flat-pattern output for the defended sheet-metal subset.
- Support DXF or SVG profile export for planar manufacturing-oriented outputs where the compiler can defend the source geometry.
- Route output generation through compiler-owned exact intent, not through faceted reverse-engineering.
- Add at least one regression path that validates folded and flat outputs from the same semantic sheet-metal model.
- Document exact capability gaps explicitly so unsupported manufacturing routes fail honestly.

## Status and log
- 2026-03-13: Blocked on task 310.
- 2026-03-13: Not started.

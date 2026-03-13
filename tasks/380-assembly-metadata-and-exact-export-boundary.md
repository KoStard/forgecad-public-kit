# Assembly Metadata And Exact Export Boundary
## Problem Definition
Forge already values composable projects and assemblies, but the multi-backend compiler work is currently centered on part modeling. Assembly-facing metadata and exact export boundaries need to become explicit so part architecture and assembly workflows do not drift apart.

## Description
Define and implement the defended assembly-facing boundary for the compiler-era architecture.

Primary dependencies:

- task 300

Primary files:

- assembly/runtime metadata modules
- export/report surfaces
- example assemblies
- assembly docs

## Requirements
- Make it explicit which assembly metadata is compiler-owned and stable in the new architecture.
- Preserve or add defended exact/faceted route visibility for part instances inside assemblies.
- Add at least one example assembly that proves the intended boundary, such as a small hinged control box or bracketed panel.
- Keep full mate-solver parity out of scope; this task is about metadata, export boundary, and trustworthy composition.
- Document what remains a bigger leap for assemblies so contributors do not overpromise.

## Status and log
- 2026-03-13: Blocked on task 300.
- 2026-03-13: Not started.

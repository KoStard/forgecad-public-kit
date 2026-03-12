# Edge Query Backbone
## Problem Definition
Face-query provenance now has a shared compiler-owned contract, but edge-driven features still do not. Without a shared edge-query model, fillet/chamfer work will either be brittle or force every agent to invent edge identity rules independently.

## Description
Extend the shared query backbone so Forge can describe semantic edge ownership and edge selectors with the same discipline now used for faces.

Primary files:

- `src/forge/queryModel.ts`
- `src/forge/sketch/topology.ts`
- `src/forge/sketch/workplane*.ts` only if the shared query model needs cross-cutting helpers
- placement/reference invariant checks

This task should stop at the backbone. Do not implement fillet/chamfer behavior here.

## Requirements
- Define a shared edge-query contract.
- Preserve edge-query metadata through existing tracked-topology flows where possible.
- Add invariant coverage for edge-query propagation.
- Update the compiler architecture docs with the new contract and its limits.

## Status and log
- 2026-03-12: Ready after task 100.
- 2026-03-12: Not started.


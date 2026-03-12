# Topology Rewrite Query Propagation
## Problem Definition
Forge now preserves parent-body owners plus first face/edge query contracts, but it still does not own durable face/edge meaning after topology-changing features.

That is the deepest remaining compiler problem.

Without a shared propagation layer for topology rewrites:

- shell-created faces remain hard to target semantically
- hole/cut-created faces remain second-class
- boolean and pattern descendants lose per-face/edge meaning once topology merges
- projection, richer hole/cut variants, and broader fillet/chamfer keep collapsing into narrow defended subsets

This task is the next architectural foundation. Other feature work should build on it instead of inventing local rewrite rules.

## Description
Implement a compiler-owned topology-rewrite query propagation layer.

The output of this task should be a shared semantic model for how queries survive, split, merge, or get created when a feature rewrites topology.

Scope this task to the propagation kernel itself:

- define the shared propagation contract
- define how preserved queries and feature-created queries are represented
- define how ambiguity is reported when propagation cannot be defended
- thread that contract through compile-owned shape results and inspection surfaces

Do not use this task to quietly broaden individual feature families. The goal here is the backbone, not feature breadth.

Primary files:

- `src/forge/queryModel.ts`
- new compiler-owned propagation module(s), likely near `src/forge/query*`
- `src/forge/compilePlan.ts` only for thin integration
- `src/forge/kernel.ts` / query inspection helpers as needed
- placement/reference invariant checks
- architecture + mission docs

## Requirements
- Define a shared propagation contract for topology-changing feature results.
- Represent both preserved queries and feature-created queries explicitly.
- Make unsupported or ambiguous propagation explicit in diagnostics instead of silent fallbacks.
- Keep the contract backend-neutral; no backend object naming or exporter-only logic.
- Add invariants that prove the propagation model is inspectable and deterministic for the supported subset.
- Update the permanent compiler architecture doc and the living mission tracker.

## Isolation Rule
- Do not widen hole/cut, projection, or fillet/chamfer behavior beyond what is required to prove the propagation kernel.
- Prefer new propagation-focused modules over large edits to existing feature files.
- Keep compile/lowerer edits to thin integration seams.

## Dependencies
- task 100
- task 105
- task 110
- task 120
- task 130
- task 140

## Unlocks
After this task lands, the following tasks can start in parallel without redefining the core semantics again:

- task 170
- task 180
- task 190
- task 195

## Status and log
- 2026-03-12: Created as the next deepest backend-compiler lane after task 130.

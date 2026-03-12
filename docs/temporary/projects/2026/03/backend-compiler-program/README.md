# Backend Compiler Program

Date: 2026-03-12

This folder is the active temporary home for the Forge multi-backend compiler program.

Read in this order:

1. `explainer.md` - simple overview of the mission
2. `capabilities.md` - concrete capabilities we want and why they are blocked today
3. `mission-tracker.md` - living implementation tracker
4. `task-graph.md` - multi-agent task breakdown, dependencies, and execution plan

The deepest completed prerequisite so far is the shared query/reference backbone:

- compiler-owned parent-body owner lineage
- a shared `FaceQueryRef` contract in `src/forge/queryModel.ts`
- workplane and topology provenance now routed through the same query model

That is the current base for downstream feature work.


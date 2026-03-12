# Backend Compiler Program

Date: 2026-03-12

This folder is the active temporary home for the Forge multi-backend compiler program.

Read in this order:

1. `explainer.md` - simple overview of the mission
2. `capabilities.md` - concrete capabilities we want and why they are blocked today
3. `mission-tracker.md` - living implementation tracker
4. `task-graph.md` - multi-agent task breakdown, dependencies, and execution plan

The landed base for the next feature lane is:

- shared face and edge query/reference contracts in `src/forge/queryModel.ts`
- compiler-owned hole/cut v1, projection replay v1, and repeated-result ownership slices
- curated compiler corpus coverage in `examples/compiler-corpus/`

The next queue item is task 130, which should build on that base instead of reopening the cleanup lane.

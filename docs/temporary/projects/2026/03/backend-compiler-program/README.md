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
- compiler-owned hole/cut v1, projection replay v1, repeated-result ownership, and tracked-edge finishing v1 slices
- curated compiler corpus coverage in `examples/compiler-corpus/`

Task 130 is now landed on top of that base.

The next program move is task 160:

- [tasks/160-topology-rewrite-query-propagation.md](../../../../../../tasks/160-topology-rewrite-query-propagation.md)

That is the core lane the next feature wave depends on.

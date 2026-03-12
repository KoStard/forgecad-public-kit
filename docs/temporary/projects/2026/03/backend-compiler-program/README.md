# Backend Compiler Program

Date: 2026-03-12

This folder is the active temporary home for the Forge multi-backend compiler program.

Read in this order:

1. `explainer.md` - simple overview of the mission
2. `capabilities.md` - concrete capabilities we want and why they are blocked today
3. `mission-tracker.md` - living implementation tracker
4. `task-graph.md` - multi-agent task breakdown, dependencies, and execution plan

The landed base for the MLP closeout lane is:

- shared face and edge query/reference contracts in `src/forge/queryModel.ts`
- compiler-owned richer hole/cut workflows, broader projection/sketch-on-face replay, repeated-result ownership, and broader tracked-edge finishing on defended propagated edges
- curated compiler corpus coverage in `examples/compiler-corpus/`

Tasks 160, 170, 180, 190, 195, 200, 210, and 220 are now landed on top of that base.

The next program move is the MLP closeout lane:

- [tasks/230-mlp-corpus-and-doc-closeout.md](../../../../../../tasks/230-mlp-corpus-and-doc-closeout.md)

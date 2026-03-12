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

Tasks 160, 170, 180, 190, and 195 are now landed on top of that base.

The active program move is the second feature wave:

- [tasks/200-richer-hole-and-cut-variants.md](../../../../../../tasks/200-richer-hole-and-cut-variants.md)
- [tasks/210-projection-and-sketch-on-face-expansion.md](../../../../../../tasks/210-projection-and-sketch-on-face-expansion.md)
- [tasks/220-broader-fillet-and-chamfer.md](../../../../../../tasks/220-broader-fillet-and-chamfer.md)

After that wave, close with:

- [tasks/230-mlp-corpus-and-doc-closeout.md](../../../../../../tasks/230-mlp-corpus-and-doc-closeout.md)

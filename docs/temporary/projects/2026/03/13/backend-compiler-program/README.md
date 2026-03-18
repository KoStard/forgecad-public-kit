# Backend Compiler Program

Date: 2026-03-13

This folder is the active temporary home for the Forge multi-backend compiler program.

Read in this order:

1. `explainer.md` - simple overview of the mission
2. `capabilities.md` - concrete capabilities we want and why they are blocked today
3. `mlp-readiness-review.md` - current MLP verdict, proof surface, and remaining blockers
4. `post-mlp-example-phase.md` - the example architecture gate, manifest split, and post-MLP example boundary
5. `example-gap-recovery.md` - task 280 recovery notes, remaining temporary fences, and route-truthfulness closeout
6. `architecture-phase-entry-review.md` - task 290 verdict, active example-surface summary, and the next architectural bottleneck
7. `mission-tracker.md` - living implementation tracker
8. `task-graph.md` - multi-agent task breakdown, dependencies, and execution plan

The landed MLP closeout package is:

- shared face and edge query/reference contracts in `src/forge/queryModel.ts`
- compiler-owned richer hole/cut workflows, broader projection/sketch-on-face replay, repeated-result ownership, and broader tracked-edge finishing on defended propagated edges
- curated compiler corpus coverage in `examples/compiler-corpus/`
- a reviewable checkpoint summary in `mlp-readiness-review.md`
- permanent compiler/export docs that now spell out the defended subset and the remaining gaps directly

Tasks 160, 170, 180, 190, 195, 200, 210, 220, 230, 240, 250, 260, 270, 280, and 290 are now landed on top of that base.

The MLP closeout task is:

- [tasks/230-mlp-corpus-and-doc-closeout.md](../../../../../../tasks/230-mlp-corpus-and-doc-closeout.md)

The repo has now entered the new architecture phase for the maintained example surface. The current blocker summary and exact meaning of that verdict live in:

- `mlp-readiness-review.md`
- `example-gap-recovery.md`
- `architecture-phase-entry-review.md`
- `mission-tracker.md`
- `task-graph.md`

The planned next lanes on top of that checkpoint are:

- [tasks/300-durable-descendant-resolution-and-topology-ownership.md](../../../../../../tasks/300-durable-descendant-resolution-and-topology-ownership.md)
- [tasks/310-sheet-metal-semantic-v1-and-demo.md](../../../../../../tasks/310-sheet-metal-semantic-v1-and-demo.md)
- [tasks/320-richer-hole-and-cut-variants.md](../../../../../../tasks/320-richer-hole-and-cut-variants.md)
- [tasks/330-broader-shell-workflows.md](../../../../../../tasks/330-broader-shell-workflows.md)
- [tasks/340-broader-fillet-and-chamfer-workflows.md](../../../../../../tasks/340-broader-fillet-and-chamfer-workflows.md)
- [tasks/350-projection-and-sketch-on-face-expansion-v2.md](../../../../../../tasks/350-projection-and-sketch-on-face-expansion-v2.md)
- [tasks/360-manufacturing-outputs-and-flat-patterns.md](../../../../../../tasks/360-manufacturing-outputs-and-flat-patterns.md)
- [tasks/370-toolbox-fasteners-and-library-features.md](../../../../../../tasks/370-toolbox-fasteners-and-library-features.md)
- [tasks/380-assembly-metadata-and-exact-export-boundary.md](../../../../../../tasks/380-assembly-metadata-and-exact-export-boundary.md)
- [tasks/390-legacy-architecture-fence-and-cleanup.md](../../../../../../tasks/390-legacy-architecture-fence-and-cleanup.md)

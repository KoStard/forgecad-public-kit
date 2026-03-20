# Constructive-First Solver: Structural Decomposition Before LM

## Goal

Replace the monolithic LM solve with **structural decomposition of the scalar residual/DOF graph**.

The solver must discover solve order automatically from the actual residual-variable structure, not from:

- builder call order
- hardcoded spectrogram knowledge
- fallback behavior
- more LM tuning

## Core Thesis

- No fallbacks.
- No builder-time rescue path.
- No return to incremental `constrain()` as the permanent design.
- Script-authored staged solves are a valid product path and should remain first-class. Users should be able to express intended solve order directly in JS without requiring opaque persisted binary state.
- `reconstruction.rs`, presolve, and chain heuristics remain useful, but they are **sub-tools** inside a larger decomposition pipeline.
- The real missing architecture is the layer between "build residual structure" and "run LM": maximum matching, directed information flow, SCC extraction, then ordered block solves.

## Physical Connection vs Information Flow

This is the crucial correction.

The spectrogram is one continuous physical object. In the undirected sense, everything touches something else. That is true. It is also the wrong graph for solving.

What the solver needs is the graph of **who determines whom**. That graph is directed.

The spectrogram has a clear waterfall intuition:

| Stage | Depends on | Why it is upstream |
|---|---|---|
| Inner triangle | fixed point + equal + length + absolute angle | independent seed geometry |
| Outer triangle | inner triangle | line offset + equal centroid |
| Light leaving point | inner triangle | point-on-line + point-line-distance |
| Camera system | light point + oriented case rails | light-line length/perpendicular pins it |
| Case chain lengths | outer triangle + camera placement | fills the remaining gap |

This waterfall is an **intuition aid**, not a hardcoded solve recipe.

The implementation must discover SCCs automatically. Some of these stages may collapse into one coupled block. That is expected and correct.

**Current blocker**: `solver/src/solver/decompose.rs` only finds disconnected components in an undirected entity graph. For the spectrogram, that yields one connected component, so LM still sees one giant problem.

## Why Yesterday Worked

The last visually-correct spectrogram state was not proof that the one-shot solver architecture was correct. It was proof that a slow manual waterfall can hide missing architecture.

Before commit `8bbba0e`, `builder.constrain()` ran one incremental Rust solve per added constraint using `presolveConstraintId`. That path was effectively:

1. Add one constraint.
2. Presolve that one constraint.
3. Run a tiny warm solve.
4. Sync positions back.
5. Repeat.

That path was fragile and expensive, but it kept the geometry near the correct branch at every step.

After `8bbba0e`, that manual waterfall disappeared. The same sketch was then exposed to a true cold-start solve, and the missing decomposition layer became visible.

The permanent fix is **not** to restore builder-time incremental solving. The permanent fix is to make Rust discover the waterfall automatically.

## Current Solver Architecture

```text
solve_system()
  build_solve_plan()          // disconnected components only
  solve_single_system()
    run_presolve()
    run_analytical_presolve()
    build_reconstruction_graph()
    reconstruct()
    LM(all remaining vars at once)
```

This is still a monolithic numerical solve inside one connected component.

Useful existing pieces:

- `run_presolve()` spreads geometry deterministically.
- `reconstruction.rs` eliminates already-determined points and consumed constraints.
- `SketchGroup` already proves reduced-DOF solving works.

Missing piece:

- a structural analysis pass that operates on LM's scalar row/variable graph and produces an ordered solve DAG before LM runs

Current implementation reality, as of 2026-03-20 pm:

- `solver/src/solver/graph.rs` already proves that scalar structural decomposition is implementable in this codebase.
- `solver/src/solver/mod.rs` currently keeps the DAG analysis live, but still finishes with one global `lm::solve_global()` call.
- The product spectrometer now works again through **script-level staged solving**, not through fully automatic ordered block execution in Rust.

## LM Is Not the Bottleneck

The investigation already answered the "maybe LM just needs better tuning" question.

- More iterations did not help.
- Removing the step limit did not help.
- Restarts and GS escape did not fix the spectrogram cold start.

That means the wall is architectural, not parametric.

We have not saturated what LM can do on small blocks. We have saturated what a **single monolithic LM solve** can do on this problem.

## Progress Tracker

| # | Change | Suite (74) | Time | Spectrogram | Status |
|---|---|---|---|---|---|
| - | Baseline with incremental builder warm-up active | 74/74 | 12.6s | correct (7 surfaces), err=0.000608 | OK but fragile/manual |
| E1 | Wire dead-code analytical patterns with `fixed=true` | 74/74 | - | BROKEN (37 surfaces), err=325 | failed |
| E2 | LM hardening (`8c16b75`): central-diff FD + Nielsen + nullspace | 74/74 | - | BROKEN, err=325 | regression |
| E3 | Restore inner retry loop, keep other LM hardening | 74/74 | 11.6s | correct (7 surfaces), err=0.000434 | recovered |
| P1+P2 | Reconstruction graph + variable elimination (`aee8ccf`) | 74/74 | 11.6s | correct (7 surfaces), err=0.000434 | success, but not enough alone |
| E4 | Remove incremental solve from `constrain()` (`8bbba0e`) | 74/74 | - | cold-start regression exposed | architectural boundary found |
| E5 | Fix presolve zero-length + constraint-value ref length + solve trail | 74/74 | - | maxErr=8.07, presolve improved, LM still stuck | partial |
| E6 | Staged presolve + chain closure heuristics | 6/6 cold reducers | 0.03s | maxErr=4.64 on reducer | partial |
| E7 | LM convergence basin probing | 6/8 cold reducers | - | basin about 5 units for coupled reducer | analysis |
| E8 | LM true local minimum proof | - | - | identical result at 80 vs 500 iterations | answered |
| E9 | Local minima landscape sweep | - | - | reducer under-constrained, multiple families | breakthrough, but reducer only |
| E10 | Full spectrometer Rust test | - | - | `dof=-4`, cold-start err about 7.46 | clarified real boundary |
| E11 | Information-flow breakthrough | - | - | manual waterfall removed, structural layer missing | breakthrough |
| **G1** | **Scalar graph decomposition before LM** | **prototype only** | **-** | **DAG extraction exists, but ordered block runtime is not safe yet** | **partial** |
| G1a | graph.rs: bipartite graph + Hopcroft-Karp + Tarjan SCC + topo sort | 6/6 unit tests | - | - | done |
| G1b | Block-only constraints per block (not full system) | case_frame: 5 blocks, err=0.000 | <0.01s | - | key fix |
| G1c | Monolithic cleanup after blocks if post-block error > tolerance | triangle+case: err=0.000541 | <0.03s | - | working |
| G1d | Driver block merging (0-row blocks → downstream) | reduced 13→7 blocks | - | - | done |
| G1e | Rollback if blocks worsen geometry (>1.5× pre-block error) | prevents regression on coupled systems | - | - | done |
| G1f | Prototype audit | analysis retained, runtime execution disabled in production path | - | cross-block coupling still regresses full spectrometer | partial |
| E12 | Restore builder warm seeding + warm-biased final solve | browser path improved | - | useful, but not a general cold-start fix | tactical only |
| E13 | Script-staged spectrometer (`Prism Holder` -> `Spectrometer Body`) | product path recovered | 12.3s | `err=0.000013` + `err=0.000010` | success |
| E14 | Automatic decomposition feasibility review | `graph.rs` proves ordering is possible | - | runtime block execution still unsafe on coupled systems | breakthrough |
| E15 | Local branch-search design | - | bounded by local budget | fail-fast / top-k / show-all feasible locally | design direction |

Note: `G1a` through `G1f` record a real prototype and the lessons from it. The current production solver does **not** execute ordered block solves in `solve_single_system()` yet; it only computes the DAG for analysis and still runs global LM.

## Decision

### Decision: Structural decomposition on the scalar graph

We are **not** doing any of the following as the main direction:

- restoring builder-time incremental solving
- adding fallback solve paths
- adding more restart heuristics
- tuning LM further as the primary strategy
- treating chain closure as the centerpiece

We **are** doing this:

- build the scalar structural graph that LM already implies
- run matching on residual rows vs scalar variables
- derive directed information flow
- collapse SCCs into ordered solve blocks
- solve those blocks in topological order

## Implementation Plan

### Phase 1: Reuse LM's scalar structure

Prefer a new module `solver/src/solver/graph.rs`, or a substantial replacement of `solver/src/solver/decompose.rs` if we want to preserve call sites.

The decomposition must reuse the same scalar universe as LM:

- point `x`
- point `y`
- circle radius
- arc radius
- group `x`
- group `y`
- group `theta`

Excluded from this graph:

- fixed variables
- group-owned point DOF already replaced by group frame DOF
- reconstruction-determined point DOF already eliminated by `reconstruction.rs`

The decomposition must also reuse the same residual-row structure as LM:

- one `ResidualRowNode` per scalar row produced by `constraint_residual_impl`
- include multi-row constraints as multiple row nodes
- include arc consistency rows
- do **not** collapse back to one node per high-level constraint

The graph is therefore built from the same row/variable relation currently used by `lm::build_sparsity()`.

### Planned analysis types

```rust
struct ScalarVarNode {
    col: usize,
    entity_id: String,
    kind: ScalarVarKind,
}

struct ResidualRowNode {
    row: usize,
    constraint_idx: Option<usize>,
    local_row: usize,
}

struct Matching {
    row_to_var: Vec<Option<usize>>,
    var_to_row: Vec<Option<usize>>,
}

enum DmPartition {
    Driver,
    WellDetermined,
    OverDetermined,
}

struct SccBlock {
    id: usize,
    vars: Vec<usize>,
    rows: Vec<usize>,
    partition: DmPartition,
}

struct SolveDag {
    blocks: Vec<SccBlock>,
    edges: Vec<(usize, usize)>,
}
```

Exact field names can change. The important part is the responsibility split.

### Phase 2: Matching and directed dependency graph

1. Build the bipartite structural graph:
   - left side = `ResidualRowNode`
   - right side = `ScalarVarNode`
   - edge = this residual row structurally depends on this scalar variable

2. Run **maximum bipartite matching** on that graph.

3. Convert the matched bipartite graph into a directed dependency graph:
   - matched edge: `ResidualRowNode -> ScalarVarNode`
   - unmatched structural edge: `ScalarVarNode -> ResidualRowNode`

This encodes the information-flow view:

- a matched residual row is the row currently "responsible" for determining a variable
- unmatched structural edges express which variables feed which residual rows

4. Derive a Dulmage-Mendelsohn-style partition:
   - unmatched variables and their alternating-reachable neighborhood = driver / under-constrained side
   - matched core = structurally well-determined core
   - unmatched residual rows and their alternating-reachable neighborhood = over-determined side

This is the level where "physical connection vs information flow" becomes executable.

### Phase 3: SCC extraction and solve DAG

1. Run SCC extraction on the directed graph.
2. Collapse each SCC into an `SccBlock`.
3. Topologically sort the SCC graph to obtain `SolveDag`.

Important rule:

- unsupported or mutually coupled relations remain in the same SCC

That is **not** a fallback. That is the expected output of the decomposition.

### Phase 4: Ordered execution

Within one connected physical component, the new pipeline becomes:

```text
run_presolve()
build_reconstruction_graph()
reconstruct()
build_scalar_graph()
maximum_matching()
extract_scc_blocks()
for block in topo_order:
  solve_block()
  write back solved vars
  reconstruct() for downstream determined points
```

Execution policy per block:

1. If a block has zero free variables, just verify its residual rows.
2. If a block is triangular / directly constructive, solve it analytically.
3. Otherwise run LM only on that block's variable columns and residual rows.
4. Write solved values back into the shared global geometry.
5. Continue downstream with upstream values locked.

The key outcome is that LM never sees the whole spectrogram at once.

## Role of Existing Techniques

### Reconstruction graph

Keep it.

`reconstruction.rs` is still valuable because it shrinks the scalar graph **before** matching and SCC extraction:

- fewer scalar variables
- fewer residual rows
- cleaner structural graph

Reconstruction is therefore a pre-pass to decomposition, not a competing architecture.

### Chain closure

Keep it, but demote it.

`propagate_chain_closure()` is a tactical presolve for a very specific pattern:

- anchored polyline
- known segment directions
- unknown segment lengths

It is useful inside the broader architecture because it can improve geometry **after** upstream anchors are known.

It is **not** the architecture centerpiece. It does not replace matching, SCCs, or solve ordering.

### LM

Keep it, but shrink its job.

LM remains the numerical solver for the residual coupled blocks that survive decomposition. That is exactly where it belongs.

## Acceptance Criteria

| Area | Acceptance |
|---|---|
| Structural analysis | Spectrogram remains one connected physical component but decomposes into multiple ordered SCC blocks |
| Ordering | Inner triangle block appears upstream of outer-triangle-dependent blocks |
| Stability | The same solve DAG is produced from cold-start geometry and near-solved geometry |
| Execution | `cold_start_with_camera` and `cold_start_full_spectrometer` converge through the ordered solve path, without builder-time incremental solving |
| Regression | Existing 74 solver tests still pass |
| Product path | `spectrogram.forge.js` and `case_wood_cut.forge.js` remain working through explicit staged scripts, with no persisted binary previous-state cache |
| Script ergonomics | Users can express staged solve order directly in JS via multiple constrained sketches plus references/imported solved geometry |
| Branching | Ambiguous constructive blocks can fail fast, pick best within a bounded budget, or optionally expose multiple candidate branches |
| Architecture discipline | No reintroduction of builder-time incremental `constrain()` solving as the permanent path |

## Planned Files

| File | Responsibility |
|---|---|
| `solver/src/solver/graph.rs` | scalar graph nodes, matching, DM partition, SCC extraction, solve DAG |
| `solver/src/solver/decompose.rs` | either thin wrapper over the new graph layer or retired/replaced |
| `solver/src/solver/lm.rs` | expose reusable scalar variable and residual-row structure, run per-block LM |
| `solver/src/solver/mod.rs` | ordered block execution and state propagation |
| `solver/src/solver/reconstruction.rs` | pre-pass elimination of determined points before graph analysis |
| `solver/src/solver/branch.rs` | local branch enumeration, scoring, budgeted beam search / backtracking for ambiguous constructive blocks |
| `solver/tests/solver_tests.rs` | DAG structure tests and ordered cold-start convergence tests |

## Script-First Product Path

The product recovery changed the picture in an important way.

The spectrometer now works again, but it works through **explicit staged scripts**, not through one finished automatic backend solver.

The successful structure is:

1. Solve the prism holder as its own constrained sketch.
2. Import/reference the solved prism geometry into a second constrained sketch.
3. Solve the case and camera body against those fixed upstream references.

This matters for two reasons:

- It proves we do **not** need a binary snapshot or hidden persisted solver state to preserve "previous state".
- It proves the script language can already express a solve DAG directly, in a way that is reviewable, diffable, and aligned with how the user thinks about the model.

Important learning from the failed split:

- A three-stage split over-separated the camera from the case rails and left the middle stage under-constrained.
- The successful split was **two-stage**, not three-stage: `Prism Holder` upstream, then `Spectrometer Body` downstream.
- That means the dominant coupling boundary in this model is prism vs body, not prism vs case vs camera as three completely independent solves.

Conclusion:

- Script-authored staging should remain a first-class modeling tool even if automatic decomposition improves later.
- Automatic decomposition and staged scripts are complementary, not competing directions.
- The backend should eventually recover more of this ordering automatically, but the user should still be allowed to express it explicitly in JS.

## Automatic Decomposition: Feasible, But Not Sufficient Alone

The answer to "is automatic decomposition even possible?" is **yes**, with an important qualifier.

### What is already proven possible

- Build the scalar structural graph from residual rows to scalar variables.
- Run maximum bipartite matching.
- Derive a directed dependency graph.
- Extract SCCs.
- Build a topological `SolveDag`.

`solver/src/solver/graph.rs` already demonstrates this. So the project is **not** blocked on whether solve-order discovery is mathematically or programmatically possible. It is.

### What is not solved by decomposition alone

Structural decomposition tells us:

- which residual rows and variables belong together
- which blocks are upstream or downstream
- where the coupled cores are

Structural decomposition does **not** tell us:

- which discrete branch to take inside an ambiguous constructive block
- how to execute cross-block solves safely when downstream residuals still couple to upstream decisions
- when a local block solution is making the eventual global state worse

That is exactly why the prototype block runtime taught useful lessons but is not safe enough to leave active in production. The graph is real. The execution semantics are still the hard part.

Current verified state:

- `cold_start_with_camera` passes again.
- `cold_start_full_spectrometer` still fails monolithically at `max_error=8.222160`.
- `mod.rs` therefore keeps DAG extraction live for analysis, but still runs global LM as the production backend path.

Conclusion:

- Automatic decomposition is possible for **ordering**.
- It is not sufficient by itself for full cold-start robustness.
- The missing companion piece is local branch management plus safer block-execution semantics.

## Branching Strategy: Local, Bounded, Explicit

Branching is a separate problem from decomposition.

Decomposition answers: "what should be solved together, and in what order?"

Branching answers: "when there are multiple locally valid constructions, which one do we keep?"

Typical branch points in this solver family:

- circle-circle intersection side choice
- line-circle intersection side choice
- point-on-line plus distance side choice
- offset side choice for lines / chains
- rectangle orientation / mirror choice
- CCW / block-rotation compatible alternatives

### Feasible branch policy

Yes, it is feasible to fail fast and explore other branches, but only if the search stays **local** to ambiguous constructive blocks.

The viable design is:

1. Detect an ambiguous constructive block.
2. Enumerate a small number of local candidate branches.
3. Score each branch against block-local residuals plus immediately exposed downstream constraints.
4. Abort bad candidates quickly on residual or time budget.
5. Keep the best branch, or optionally expose the top-k / all candidates.

This is where timeout-style controls make sense:

- `branchTimeBudgetMs`
- `beamWidth`
- `maxBranches`
- `maxBacktracks`
- `acceptResidualMultiplier`
- `branchPolicy = first | best | all`

### What should not happen

- No whole-sketch branch explosion.
- No global "restart soup" that re-branches the entire spectrometer.
- No hidden persisted binary state just to remember one previous branch.

The search needs to be bounded and local, otherwise it will not remain interactive.

### Show all branches?

Yes, in principle.

The right scope is not "show every possible solution of the whole sketch". The right scope is:

- show all candidate branches for a specific ambiguous block, or
- show the top few ranked whole-sketch candidates that survived bounded local branching

That can be useful for UI/debugging and for expert workflows, but it should be opt-in because combinatorics grow quickly.

## Experiment Log

### G1: Scalar graph decomposition — implementation prototype (PARTIAL)

**What**: Implemented the full structural decomposition pipeline as planned in Phases 1–4.

**Current state**: The structural analysis is real and remains useful. The production runtime does **not** currently execute ordered block solves in `solve_single_system()` because the prototype still mishandles some cross-block coupling.

#### G1a: graph.rs module (SUCCESS)

**What**: Created `solver/src/solver/graph.rs` with:
- `BipartiteGraph`: row ↔ variable structural adjacency
- `hopcroft_karp()`: maximum bipartite matching (Hopcroft-Karp algorithm)
- `build_directed_graph()`: matched edges (row→var) + unmatched edges (var→row) encode information flow
- `tarjan_scc()`: Tarjan's algorithm for strongly-connected components
- `build_solve_dag()`: topological sort of SCC blocks + driver block merging

**Result**: 6 unit tests passing. The graph correctly decomposes independent constraints into separate blocks, identifies coupled constraints as single blocks, and produces ordered chains for dependent structures.

#### G1b: Block-only constraints — critical fix (SUCCESS)

**What**: Initial implementation passed ALL constraints to each block's LM solve (with non-block entities fixed). This caused row-weight dominance: rows with zero Jacobian (because their variables were fixed) got infinite weights, making LM unable to converge.

**Fix**: Map block rows → constraint indices, pass only the block's constraints to each block's `solve_global` call.

**Result**: Case frame test: 5 blocks of 2 vars each, all solve to error=0.000000 instantly. Pre-fix: error=1.25 on every block.

**Lesson**: Block-level solving requires block-level residuals, not global residuals with masked variables.

#### G1c: Monolithic cleanup pass (SUCCESS)

**What**: After all blocks are solved, evaluate the global error. If above tolerance, run a final monolithic `solve_global` from the block-improved positions.

**Result**: `cold_start_triangle_plus_case` goes from 9.54 pre-solve → blocks all at 0.000 → post-blocks 9.46 (cross-block constraints) → monolithic cleanup → 0.000541. The block solve provides a much better starting point for the monolithic pass.

**Lesson**: Blocks don't need to handle all coupling. They provide waterfall positioning; the monolithic pass handles remaining residual coupling.

#### G1d: Driver block merging (SUCCESS)

**What**: The bipartite matching leaves some variables unmatched ("drivers"). These form singleton SCC blocks with vars but 0 rows. When solved independently, they have no constraints to optimize.

**Fix**: Merge driver blocks into their first downstream SCC block that has rows. This gives the downstream LM solve access to the driver's DOFs.

**Result**: `cold_start_triangle_plus_case` went from 13 blocks (8 with vars, 5 with 0 rows) to 7 blocks (4 with vars). Each block now has at least 1 constraint.

#### G1e: Geometry rollback safety (SUCCESS)

**What**: When blocks share variables through cross-block constraints, local optimization can push geometry away from the global optimum. On `lm_camera_from_solution`, blocks all solved to 0 individually but post-block global error was 1948 (vs 11 pre-blocks).

**Fix**: Snapshot geometry before block solve. If post-block error > 1.5× pre-block error, rollback and use original geometry for the monolithic pass.

**Lesson**: Block decomposition is a best-effort improvement. It must not make the starting point worse for the monolithic cleanup.

#### G1f: Minimum block threshold

**What**: Decomposition overhead only pays off with enough separable blocks. For 2 blocks, the overhead (block solves + potential monolithic cleanup) is worse than direct monolithic.

**Fix**: Only use decomposition when ≥4 nontrivial blocks exist. Otherwise fall back to monolithic directly.

### E15: Branch-search requirements (ANALYSIS)

**What**: Separated structural ordering from discrete branch choice and evaluated whether timeout-style fail-fast branching is feasible.

**Result**: Yes, but only locally. The right place to branch is inside small ambiguous constructive blocks, not by restarting the whole sketch with different random seeds. The likely control surface is a bounded local search with parameters like `branchTimeBudgetMs`, `beamWidth`, `maxBranches`, and `maxBacktracks`.

**Why it mattered**: This answers an important product question. "Can we try another branch quickly?" is a reasonable request, but it is not the same problem as SCC decomposition. A CAD-grade solver needs both.

**Lesson**: Ordered block solving and branch management are complementary. One does not replace the other.

### E14: Automatic decomposition feasibility review (SUCCESS - bounded yes)

**What**: Audited the implemented `graph.rs` layer against the current runtime behavior in `mod.rs`.

**Result**: The codebase already proves that automatic solve-order discovery is feasible: scalar graph construction, Hopcroft-Karp matching, SCC extraction, and `SolveDag` construction all exist. The remaining blocker is execution semantics, not graph theory. Production still ends in global LM because the block runtime is not yet safe on cross-block coupled systems.

**Why it mattered**: This separated two questions that had been blurred together: "can the solver discover the waterfall automatically?" and "can the solver already execute that waterfall robustly?" The answer is yes to the first, not yet to the second.

**Lesson**: Keep pushing on decomposition, but stop pretending that ordering alone finishes the solver.

### E13: Script-staged spectrometer recovery (SUCCESS)

**What**: Replaced the monolithic spectrometer sketch with two explicit constrained sketches:

1. `Prism Holder`
2. `Spectrometer Body`, solved against fixed prism references

A prior three-stage split failed because it separated the camera from the case rails and left the middle stage under-constrained.

**Result**: The real product path works again. Both the repo example and the personal project file now solve in about `12.3s`. `Prism Holder` solves `FULLY` with `err=0.000013`. `Spectrometer Body` solves `OVER-REDUNDANT` with `err=0.000010`. `case_wood_cut.forge.js` remains working at `err=0.000761`.

**Why it mattered**: This proved that a script can carry forward solved upstream geometry without any binary solver snapshot. The JS model itself can encode the intended solve DAG.

**Lesson**: Script-authored staging is not a hack to be eliminated. It is a legitimate product capability and a good escape hatch even after the backend grows stronger.

### E12: Builder warm-seeding restore (PARTIAL)

**What**: Restored incremental warm seeding in the TS builder and biased the final solve defaults toward warm-start behavior.

**Result**: This improved browser ergonomics and helped keep staged solves in a good basin, but it did not fix the full monolithic cold-start spectrometer problem by itself.

**Why it mattered**: It confirmed that warm starts are useful operationally, especially in interactive workflows, but they do not remove the need for better ordering and better branch handling.

**Lesson**: Keep warm seeding as a tactical tool. Do not mistake it for the permanent backend architecture.

### E11: Information-flow breakthrough (SUCCESS)

**What**: Compared the last working spectrogram behavior against the current checkout and traced the builder and solver pipelines.

**Result**: The spectrogram sketch itself was not the main source of the regression. The major behavioral change was orchestration:

- pre-`8bbba0e`: one incremental solve per added constraint
- post-`8bbba0e`: one true cold-start solve at the end

At the same time, the current decomposition layer only splits disconnected components, so the spectrogram still becomes one monolithic LM problem.

**Why it mattered**: This exposed the exact boundary between a toy solver and a CAD-grade solver. The missing architecture is not "another better presolve trick". It is structural decomposition of the scalar row/variable graph.

**Lesson**: No fallbacks. No return to JS incremental rescue. Replace the old manual waterfall with automatic SCC-based ordered solving.

### E10: Full spectrometer Rust test (SUCCESS - clarified the real boundary)

**What**: Built the complete spectrometer as a Rust test with all constraints from the JS sketch, including inner camera, light line, and point-line-distance relations.

**Result**: About 60 variables, 68 residual rows, `dof=-4`, and cold-start error around `7.46`.

**Why it mattered**: The real spectrometer is over-constrained. That does **not** make decomposition unnecessary. It means the solver must find the good least-squares compromise from cold start, not an exact zero-residual solution.

**Lesson**: Negative DOF is not the argument for keeping a monolithic LM solve. The real need is still ordered block solving.

### E9: Local minima landscape sweep (SUCCESS - useful reducer, wrong abstraction if taken literally)

**What**: Swept many starting offsets on a reduced camera/case problem and inspected final states.

**Result**: The reducer had multiple solution families because it was under-constrained.

**Why it mattered**: It proved that monolithic LM can land in different basins even when a local minimum is real.

**Lesson**: Useful reducer, useful intuition, but not the final architecture answer. The real spectrometer is more constrained than the reducer, and the permanent fix is still structural decomposition.

### E8: LM true local minimum proof (SUCCESS)

**What**: Re-ran the coupled reducer with more iterations and with the step limit effectively removed.

**Result**: Same final answer every time.

**Why it mattered**: This killed the "just tune LM harder" line of thought.

**Lesson**: We are not limited by LM's local math on small systems. We are limited by forcing LM to solve too large a system at once.

### E6: Staged presolve + chain closure heuristics (PARTIAL)

**What**: Improved presolve staging, reference scaling, and chain heuristics for the angle-constrained case rails.

**Result**: Cold reducers improved substantially, but the full spectrogram class problem still did not converge reliably from cold start.

**Why it mattered**: It proved that chain-aware geometry propagation is useful, but still insufficient when the solver remains monolithic.

**Lesson**: Keep chain closure as tactical presolve inside the broader architecture. Do not confuse it with the architecture itself.

### P1+P2: Reconstruction graph + variable elimination (SUCCESS but not sufficient alone)

**What**: Added `reconstruction.rs` and removed constructively-determined points from LM's variable list.

**Result**: Branch choice became safer, dead-code analytical patterns stopped being the right answer, and the solver kept correct behavior on the already-working path.

**Why it mattered**: It proved that variable elimination is the right direction and that the solver can reason with derived geometry.

**Lesson**: Keep reconstruction. Use it to shrink the structural graph before decomposition. Do not mistake it for the complete solution to solve ordering.

### E2: LM hardening regression (FAILED, lesson preserved)

**What**: Introduced central-diff FD, Nielsen update, and null-space restarts.

**Result**: The Nielsen single-trial update regressed robustness badly on the spectrogram class problem.

**Lesson**: Keep the inner retry loop. Robust local LM still matters once the global architecture is fixed.

### E1: Fixed=true analytical placement (FAILED, lesson preserved)

**What**: Re-enabled analytical constructive placement by marking points `fixed=true`.

**Result**: Wrong branch choices broke the spectrogram immediately.

**Lesson**: Never lock constructively-placed points by fixing them. Eliminate variables and reconstruct through dependencies instead.

## Summary

The old working spectrogram path was a slow, fragile, manual waterfall.

The current cold-start failure is not a mystery and not a reason to add fallback behavior. It is the expected result of removing that manual waterfall before replacing it with real structural decomposition.

The path forward is now clear:

1. Keep reconstruction.
2. Keep tactical presolve tools like chain closure.
3. Build scalar graph decomposition on LM's actual row/variable structure.
4. Extract SCC blocks.
5. Feed LM only the small coupled blocks that survive.

The March 20 recovery added two important corrections:

1. The product path does **not** need opaque binary persisted state. Script-authored staged solves already preserve prior solved geometry in a clean way.
2. Automatic decomposition is possible for solve ordering, but it still needs local branch management and safer block execution semantics before it can replace staged scripts on hard cold-start sketches.

That is the boundary we crossed. That is the architecture we need next.

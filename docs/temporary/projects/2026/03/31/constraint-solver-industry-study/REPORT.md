# ForgeCAD Constraint Solver vs Industry Standard Sketch Solvers

## Executive Summary

ForgeCAD's Rust solver is no longer a toy. It already has:

- A real nonlinear least-squares core (`solver/src/solver/lm.rs`)
- Progressive solving, warm starts, restarts, and time budgets
- Partial analytical presolve and partial constructive reconstruction
- Some redundancy and DOF analysis

That said, it is still materially below Fusion / D-Cubed-class sketch solver behavior in the areas that matter most to users:

1. **Constructive coverage is too small.**
   Large classes of sketches that are fundamentally direct-construction problems are still routed through global LM.

2. **Branch intent is not represented explicitly.**
   The solver still picks among multiple valid solutions from the initial guess, which is mathematically reasonable but CAD-incorrect from a UX standpoint.

3. **Initialization quality is still architecture-dependent.**
   Cold-start behavior is the main dividing line between "works" and "fails" on hard cases.

4. **Diagnosis is too late in the pipeline.**
   Over-/under-/unstable structure is still discovered mostly after substantial numerical work, rather than driving the solve strategy up front.

5. **The numerical backend is dense/global where production systems are selective/decomposed.**
   This is not the deepest scientific issue, but it magnifies every architectural weakness.

My bottom line:

- **The core numerical science is not the blocker.**
- **The blocker is solver architecture.**
- The most important next step is **constructive-first decomposition plus explicit branch/intention handling**, not another round of LM parameter tuning.

## Measured Baseline

### End-to-end ForgeCAD runs

| Case | Outcome | Key observation |
|---|---|---|
| `10-stress-honeycomb` | `712ms`, Rust/WASM solve `69ms`, `err=0.000256` | Healthy case; regular, redundant, benign basin |
| `09-stress-spiral` | `11.9s`, timeout warning, `err=0.586513` | Fully determined but still too expensive / unstable |
| `06-complex-spectrogram` | First sub-sketch solves, second fails at `err=175.681909` after `5.28s` | Real architectural failure, not just slowness |

### Direct Rust measurements

| Case | Outcome | Interpretation |
|---|---|---|
| Full spectrometer cold start | `1.85s`, `err=6.948344`, FAIL | The Rust solver itself still misses the basin |
| Near-solution camera subsystem | `0.17s`, `err=0.000345`, PASS | Same family becomes easy with a good seed |
| Spiral POC (`n=50`) | `1.42s`, `err=1.266588` | Not a CLI artifact; generic solve remains the problem |

This split is important. ForgeCAD does **not** have one homogeneous "constraint solver performance" problem. It has at least two separate problems:

- **Basin / branch / initialization failure**
- **Algorithm-class mismatch**, where direct-construction geometry is still solved numerically

## Where ForgeCAD Is Today

### Current architecture

ForgeCAD currently uses a hybrid stack:

- `solver/src/solver/analytical.rs`
  Direct presolve coverage is narrow: mostly coincident propagation plus paired `hDistance`/`vDistance` placement.
- `solver/src/solver/reconstruction.rs`
  The reconstruction graph handles a few local motifs: coincident, offsets, circle-circle, line-circle, and related distance combinations.
- `solver/src/solver/decompose.rs`
  Decomposition is primarily based on disconnected components.
- `solver/src/solver/lm.rs`
  The main work is still done by global Levenberg-Marquardt with warm starts, restarts, GS escape rounds, and dense linear solves.

This means ForgeCAD is **partly constructive**, but not **constructive-first**.

### Practical consequence

The solver still spends its time budget on sketches that industry solvers would attack very differently:

- constructively if the graph is reducible
- with explicit branch control if multiple discrete solutions exist
- with up-front diagnosis if the graph is structurally bad
- with minimal-movement policies when editing an existing sketch

## Comparison to Industry Standards

## D-Cubed / production-solver expectations

Siemens describes D-Cubed 2D DCM as a widely adopted 2D geometric constraint solver with:

- broad entity coverage, including points, lines, circles, ellipses, conics, splines, and parametric curves
- solving modes for preferred behavior
- explicit options such as **minimal movement of geometry**
- always-on feedback for **under-constrained** and **over-constrained** geometry

That combination matters. Production quality is not just "can solve equations." It is:

- stable edits
- predictable branch behavior
- design-intent preservation
- immediate diagnostics

ForgeCAD has only a partial version of that stack today.

## Fusion-class expectations

Autodesk's recent research around the Fusion sketch solver treats a sketch outcome as belonging to one or more of these states:

- fully constrained
- under-constrained
- over-constrained
- not solvable
- unstable

That last state matters. "Numerically solvable" is not enough if geometry distorts in a way the user did not intend.

The same Autodesk paper also reports that the commercially available Fusion solver:

- is used as a black box that returns these statuses
- typically solves in about `0.1–0.2s`
- may take tens of seconds on hard cases
- can be treated as practically unsolved beyond a threshold in evaluation

So the industry benchmark is not "never slow." The benchmark is:

- fast on ordinary sketches
- robust on edits
- explicit about bad states
- protective of design intent

ForgeCAD is currently closest to that benchmark on ordinary, well-structured cases like honeycomb, and furthest from it on cold-start or branch-sensitive cases like the spectrometer and long spiral.

## Fundamental Issues

## 1. Missing constructive-first decomposition

This is the single biggest architectural gap.

The classic graph-constructive literature argues that iterative numerical methods:

- require sharp initial guesses
- struggle with over- and under-constrained systems

while graph-constructive approaches:

- analyze the constraint graph first
- derive a sequence of construction steps
- then execute those steps directly

ForgeCAD's current constructive layers are real but too shallow. A large fraction of the sketch still falls through to LM.

### Proof

The spiral POC is decisive:

- The current solver spends `1.42s` and still ends at `err=1.266588`.
- A direct constructive recurrence produces the same family in about `0.1454us` per run.

This does **not** mean the entire sketch solver should become a hand-coded recurrence engine.
It means the current architecture is still solving too many **Type B** problems ("calculate directly") as **Type A** problems ("search numerically").

## 2. No first-class branch / intent representation

The branch ambiguity POC shows:

- positive initial guess -> positive mirror solution
- negative initial guess -> negative mirror solution

That is correct mathematics, but incomplete CAD behavior.

In real CAD, the user expects:

- a branch to persist across edits
- a branch to survive reload/share
- a branch to be selectable or inferable from prior geometry

ForgeCAD still treats branch choice mostly as a side effect of the initial state. That is a fundamental gap because the missing information is **semantic**, not numerical.

## 3. Basin sensitivity is still too high

The spectrometer evidence is strong:

- cold start full system: `1.85s`, `err=6.948344`, fail
- near-solution subsystem: `0.17s`, `err=0.000345`, pass

That gap is too large to dismiss as "needs more iterations."
It means the solver's success region in state space is still too narrow for production reliability on some real sketches.

This is exactly the scenario where constructive-first solving, better graph reduction, and explicit branch persistence matter.

## 4. Diagnosis is not yet strategy-driving

ForgeCAD does compute DOF and redundancy metadata, but mainly after the numerical solve path.

Industry-standard behavior expects diagnosis to influence solve strategy earlier:

- detect structural over-constraint before wasting iteration budget
- identify reducible subgraphs before global LM
- treat instability as a first-class failure mode

This is not as fundamental as the first two issues, but it is still architectural, not just parametric.

## What Is Not Fundamental

Some current weaknesses are serious, but they are not the deep issue:

- default tolerance choices
- dense linear algebra implementation details
- the TS-side default `timeBudgetMs: 10_000`
- WASM / serialization overhead
- missing sparse/block linear solves

These matter, but if ForgeCAD kept the same architecture and only optimized these layers, it would still have the wrong behavior on:

- multi-solution branch selection
- cold-start basin failures
- sketches that should be solved constructively instead of iteratively

## The Science Difficulty

## Short answer

**The basic math is mature. The industrial problem is still hard.**

### What is already "solved science"

- nonlinear least squares
- LM trust-region variants
- Jacobian-based local convergence
- rank / rigidity analysis
- constructive graph reduction ideas

This is not frontier numerical-analysis research.

### What is genuinely hard

The industrial sketch-solver problem is hard because it mixes:

- **continuous optimization**
  distances, angles, tangency, radii
- **discrete choices**
  mirror branch, winding, side-of-line, open vs crossed linkage
- **structural graph reasoning**
  decomposition, reducibility, redundancy, irreducible cores
- **intent semantics**
  minimal movement, stable edits, persistence across reload/share
- **robustness engineering**
  degeneracies, ill-conditioning, scaling, tolerance policy, time budgets

So the difficulty is not "hard because Newton is mysterious."
It is hard because a real CAD solver is a **hybrid symbolic-numeric-intent system**.

## My rating

- Writing a correct LM core: **medium difficulty**
- Writing a decent hobby sketch solver: **medium-high difficulty**
- Reaching Fusion / D-Cubed-class reliability on arbitrary user sketches: **high difficulty**

If forced into one sentence:

**This is not open mathematical science, but it is still a hard geometry-systems problem at roughly senior-research / staff-engineering difficulty.**

## Recommendations

## Highest-leverage architectural work

1. **Expand constructive-first solving aggressively**
   Treat the current analytical and reconstruction layers as seeds, not as the finished architecture.

2. **Add explicit branch/intention representation**
   The solver needs persistent branch hints or equivalent intent state.

3. **Move diagnosis earlier**
   Use structural analysis to decide whether to construct, decompose, refine numerically, or stop with a diagnosis.

4. **Classify sketches by problem class before solving**
   Not every sketch should go through the same pipeline.

## Secondary but important work

5. Tighten tolerance and degeneracy policy
6. Improve linear algebra and exploit sparsity/block structure
7. Reduce end-to-end orchestration cost and default timeout brittleness
8. Expand automated proof cases around branch flips, warm/cold starts, and reducible graphs

## Final Judgment

ForgeCAD does **not** appear to be blocked by a fatal flaw in its Rust LM implementation.

It **is** blocked by three deeper architectural limitations:

1. too little constructive solving
2. no explicit branch-intent model
3. too much reliance on a global local optimizer as the default problem solver

Those are fundamental enough that I would treat this as an architecture program, not a tuning task.

## References

- Siemens D-Cubed 2D DCM: https://www.siemens.com/en-us/products/plm-components/d-cubed/2d-dcm/
- Autodesk Research, *Aligning Constraint Generation with Design Intent in Parametric CAD*: https://www.research.autodesk.com/app/uploads/2025/10/Aligning-Constraint-Generation-with-Design-Intent-in-Parametric-CAD.pdf
- Fudos and Hoffmann, *A Graph-Constructive Approach to Solving Systems of Geometric Constraints*: https://www.cs.purdue.edu/cgvlab/www/resources/papers/Fudos-ACMTOG-1997-A_Graph_Constructive_Approach_to_Solving_Systems_of_Geomeric_Cons.pdf
- Zou et al., *A review on geometric constraint solving*: https://arxiv.org/abs/2202.13795

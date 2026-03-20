# Constraint Solver Quality — What's Tunable vs What's Architecture

> For engineers working on the constraint solver. Answers the question: "is the math
> settled, or do we have magic numbers we need to get right?"

---

## The short answer

**The math is settled. The craft is not.**

The core algorithms — LM, CG, the normal equations — are 50-year-old numerical analysis
with proofs. You cannot implement them wrongly in any meaningful sense. What IS hard:

- Choosing the right initial guess (determines which branch you land on)
- Handling the cases where the math breaks down (degenerate geometry, redundant constraints)
- Making solutions persistent across save/reload/sharing

These are not numerical parameters. They are architectural decisions.

---

## What you can tune (and what actually happens when you do)

| Parameter | Location | Current value | Effect of changing |
|---|---|---|---|
| `tolerance` | `registry.ts` | `1e-3` | Looser → faster but visibly imprecise. Tighter → more iterations, may miss interactive frame budget. |
| `lambda0` | `registry.ts` | `1e-3` | Starting trust region. Too high → slow. Too low → diverges on ill-conditioned sketches. Standard value. |
| `nu` (growth factor) | `registry.ts` | `2` | Standard. Changing this rarely helps. |
| GS escape rounds | `registry.ts` | `3` | More rounds → more expensive. Fewer → LM gets worse warm start. |
| `restarts` | `registry.ts` | `1` | One retry from scratch. More rarely helps unless null-space perturbation is implemented (task 410). |

**The only parameter with major quality impact is `tolerance`.** The others are in the
"reasonable defaults from the literature" category. `tolerance = 1e-3` is too loose for
mm-scale CAD — production solvers use `1e-6` to `1e-10`.

---

## What matters more than parameters

### 1. Initial guess quality

LM is a local optimizer. It finds the nearest solution to the starting point. Period.
If your starting geometry is far from the intended configuration, you get the wrong solution
even with `tolerance = 1e-10`.

This is why GS warm-up exists: to propagate positions forward from anchor constraints before
LM runs. It converts "all points at (0,1)" into something LM can work with.

**The limit**: GS warm-up only propagates along constraint chains. Circular sub-graphs
(closed loops) can't be bootstrapped this way. For these, the starting positions are
whatever was stored in the file or left over from the previous solve.

### 2. Branch selection

When a constraint system has multiple valid solutions (two circle intersections, mirror
image triangles, open vs. crossed linkages), the solver returns whichever is nearest to
the starting point. This is not a solver quality problem — it is a *correct* behavior.
The issue is that "nearest to starting point" is not the same as "what the user intended."

Production CAD systems (SolidWorks, Siemens NX) solve this via:
- **Explicit branch hints** stored with the sketch (e.g., signed area of each sub-triangle)
- **Solution continuity**: track the branch from the previous solve and bias the initial
  guess toward it

ForgeCAD does solution continuity implicitly through warm-start. It breaks on file reload
because nothing in the serialization format encodes branch intent. See task 440.

### 3. Degenerate case handling

Several constraints return `residual = 0` (satisfied) when the input entities are degenerate
(zero-length lines, zero-radius circles, zero-sweep arcs). This is caused by the `len || 1`
pattern in `helpers.ts`. The result: invalid geometry that passes the constraint check.

This is not a numerical issue. It is a correctness issue: the solver is being asked to
evaluate a constraint that is mathematically undefined, and it returns a misleading answer
instead of an error.

### 4. Redundant constraint detection

Overconstrained sketches (more independent constraints than DOF) don't fail — LM minimizes
the sum of squares and returns a "best fit" that satisfies most constraints but silently
violates others. Without rank analysis (SVD of J at convergence), the user gets wrong
geometry with no indication of which constraint caused it.

The rank analysis infrastructure exists in `rigidity.ts` but is not wired into the solve path.

---

## The architectural hierarchy of constraint solver quality

```
1. Mathematical correctness of residuals and Jacobians
   → If these are wrong, nothing else matters
   → Status: Largely correct in TS; verify in Rust solver (task 430)

2. Degenerate case handling
   → Return errors, not silent wrong answers
   → Status: Known gap (len || 1 pattern). See task 442.

3. Tolerance
   → 1e-3 is too loose. Should be 1e-6.
   → Status: Quick win. See task 442.

4. Solution branch architecture
   → Need to encode branch intent in the file format
   → Status: Not done. Hard problem. See tasks 440, 441.

5. Initial guess quality (constructive first)
   → Eliminate cases where LM starts from a degenerate position
   → Status: In progress. See task 420.

6. Redundant constraint detection
   → Wire rigidity.ts into the solve path to report over/under-constrained status
   → Status: Infrastructure exists, not wired. See task 420 requirements section.

7. LM hardening (central diff, Nielsen update, null-space restarts)
   → Incremental improvements for pathological cases
   → Status: Task 410.
```

The most impactful work is at levels 2–4. Levels 5–7 are important but affect edge cases.
If you are chasing a specific user-visible quality complaint, start by identifying which
level it belongs to.

---

## What the constraint solver *cannot* do well

- **Solve globally overdetermined systems with conflicting constraints gracefully**: LM will
  find a local minimum of ||r||², which is not necessarily a meaningful answer. The result
  depends entirely on starting position and constraint ordering. Only solution: detect
  over-constraint *before* running LM and report it to the user.

- **Guarantee the "correct" assembly branch**: there is no mathematical notion of the correct
  branch. It is a user intent problem, not a solver problem. The solver can only minimize
  distance from the initial guess.

- **Handle discontinuous constraint landscapes robustly**: when constraints have discontinuous
  residual gradients (e.g., a "snap to nearest multiple of 45°" constraint), LM cannot
  navigate them — GS projectors handle these better. This is why the hybrid LM+GS
  architecture exists rather than pure LM.

---

## Connection to the constraint-solver-from-scratch course

| Quality concern | Chapter that explains the math |
|---|---|
| Why tolerance matters | 01 (residuals) — what "solved" means |
| Why initial guess matters | 03 (Newton-Raphson) — local convergence basin |
| Branch selection | No chapter yet — potential Chapter 16 |
| Redundant constraint detection | 11 (SVD/null space) — rank and DOF |
| Degenerate Jacobians | 11 (SVD) — condition number and near-singularity |
| GS vs LM trade-off | 05 (Gauss-Seidel) + 06 (LM) |
| Constructive solving | 12 (graph-based solving) |

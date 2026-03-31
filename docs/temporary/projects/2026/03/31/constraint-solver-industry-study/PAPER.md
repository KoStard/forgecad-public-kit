# Toward Fusion-Class Sketch Solving in ForgeCAD: Evidence That the Main Bottleneck Is Architectural, Not Numerical

## Abstract

We investigate the current Rust constraint solver in ForgeCAD and compare its behavior against graph-constructive geometric-constraint literature and modern production-solver expectations represented by Siemens D-Cubed 2D DCM and Autodesk/Fusion-class workflows. We find that ForgeCAD's remaining timeout and failure cases are not primarily caused by an incorrect nonlinear least-squares core. Instead, the dominant issues are architectural: insufficient constructive-first decomposition, lack of explicit branch/intention representation, and excessive dependence on a global local optimizer for sketches that should be solved structurally or constructively. We support this claim with two proof cases: a branch ambiguity example whose solution flips with the initial guess, and a 50-segment spiral family that is constructively trivial but still expensive and inaccurate under the current generic solve path. The main research conclusion is that industrial sketch solving is a hybrid symbolic-numeric-intent problem. The main engineering conclusion is that ForgeCAD should prioritize constructive coverage and branch persistence over further LM tuning.

## 1. Introduction

Sketch constraint solving in CAD is often described as a numerical problem, but industrial systems show that this framing is incomplete. Production sketchers must not only satisfy equations; they must preserve design intent, provide immediate under-/over-constrained diagnostics, and remain stable under interactive edits.

ForgeCAD already contains a meaningful solver stack:

- nonlinear least squares via Levenberg-Marquardt
- progressive warm-up
- limited analytical presolve
- limited constructive reconstruction
- DOF and redundancy analysis

Yet some real sketches still time out or converge to bad states. This raises the central question of this investigation:

**Are ForgeCAD's remaining failures mainly a matter of tuning the numerical solver, or do they reveal deeper architectural limits?**

## 2. Method

We combine four sources of evidence:

1. **Code inspection**
   We inspect the current Rust solver architecture in `solver/src/solver/`.

2. **Empirical baseline runs**
   We measure three representative cases:
   `stress-honeycomb`, `stress-spiral`, and `complex-spectrogram`.

3. **Proof-of-concept experiments**
   We add `solver/examples/industry_study.rs` to isolate two hypotheses:
   branch ambiguity and constructive-vs-global mismatch.

4. **Primary-source comparison**
   We compare the observed behavior to:
   graph-constructive literature,
   a recent GCS review,
   Siemens D-Cubed 2D DCM capability statements,
   and Autodesk research on Fusion-class sketch states.

## 3. Baseline Results

### 3.1 Healthy case

`stress-honeycomb` solves successfully:

- `712ms` end-to-end
- `69ms` Rust/WASM solve
- `err=0.000256`

This shows the current solver is not globally broken.

### 3.2 Constructively simple but numerically expensive case

`stress-spiral` produces a timeout warning in the full ForgeCAD path:

- `11.9s` end-to-end
- final `err=0.586513`

The direct Rust POC version still takes `1.42s` and ends at `err=1.266588`.

### 3.3 Cold-start basin failure

The full spectrometer cold-start test fails directly in Rust:

- `1.85s`
- `err=6.948344`

But a near-solution camera-family test passes:

- `0.17s`
- `err=0.000345`

This indicates a large dependence on initialization basin rather than mere compute budget.

## 4. Proof Cases

### 4.1 Branch ambiguity

We solve a symmetric two-distance problem with fixed anchors at `(0,0)` and `(10,0)` and one free point constrained to lie at distance `10` from both.

Observed outcomes:

- initial `y=+8` -> solved `y=+8.660254`
- initial `y=-8` -> solved `y=-8.660254`
- initial `y=+0.1` -> solved positive branch

Both mirrored solutions satisfy the constraints exactly. Therefore the solver is not choosing a "correct" branch from the equations themselves; it is choosing a branch from the initial condition.

This proves that branch persistence is not a numerical-tuning issue. It is missing state.

### 4.2 Constructive-vs-global mismatch

We compare the current solver against a direct constructive recurrence for the 50-segment spiral family.

Observed outcomes:

- current solver: `1.42s`, `err=1.266588`
- constructive recurrence: `0.1454us/run` average over `100,000` runs

This does not mean every sketch can be solved by a trivial recurrence. It does mean that ForgeCAD still routes too many structurally simple sketches through the wrong algorithmic class.

## 5. Comparison to Prior Work and Industry Practice

Fudos and Hoffmann explicitly distinguish graph-constructive solving from iterative numerical solving, noting that iterative methods require sharp initial guesses and have difficulty with over- and under-constrained instances. Their constructive approach analyzes the graph first and then executes a sequence of construction steps.

The recent review by Zou et al. similarly emphasizes that modern GCS research must handle under- and over-constrained subsystems correctly **before** numerical solving can work reliably.

Siemens' D-Cubed 2D DCM product description highlights three production-solver features that matter here:

- solving modes for preferred behavior
- minimal-movement outcomes
- persistent diagnostic feedback for under- and over-constrained sketches

Autodesk's recent research around the Fusion solver uses a richer state taxonomy:

- fully constrained
- under-constrained
- over-constrained
- not solvable
- unstable

That is significant. It shows that modern industrial sketch solving is judged not only by residual error, but by stability and intent preservation.

## 6. Discussion

## 6.1 What is fundamental

We identify three architectural issues as fundamental:

1. **Constructive coverage is too narrow.**
   ForgeCAD has partial constructive machinery, but not enough to front-load the problem.

2. **Branch intent is absent as a first-class concept.**
   Multiple valid discrete solutions cannot be resolved from continuous optimization alone.

3. **The current pipeline still overuses a local optimizer as the default solver.**
   This is the wrong top-level strategy for many sketches.

## 6.2 What is not fundamental

Other issues matter but are secondary:

- tolerance policy
- dense linear algebra
- WASM overhead
- timeout defaults
- remaining Jacobian/degeneracy cleanup

These are real engineering tasks, but they are not the main explanation for the proof cases above.

## 6.3 Science difficulty

The numerical core itself is mature science. Levenberg-Marquardt, trust-region policies, Jacobian rank ideas, and graph-decomposition ideas are not open problems in the same sense as frontier research.

The real difficulty is in combining:

- symbolic graph reasoning
- continuous optimization
- discrete branch handling
- user-intent persistence
- robust real-time engineering

So the industrial sketch-solver problem remains hard, but mainly as a **hybrid geometry-systems problem**, not as unexplored numerical analysis.

## 7. Conclusion

The evidence supports a clear conclusion:

**ForgeCAD's main sketch-solver bottleneck is architectural, not numerical.**

The next major gains are unlikely to come from more LM tuning alone. They are more likely to come from:

1. expanding constructive-first decomposition,
2. introducing explicit branch/intention state,
3. using structural diagnosis earlier to choose the solve strategy.

If ForgeCAD wants Fusion-class behavior, it should treat the solver as a hybrid symbolic-numeric-intent engine rather than a progressively hardened global optimizer.

## References

1. Ioannis Fudos and Christoph M. Hoffmann. *A Graph-Constructive Approach to Solving Systems of Geometric Constraints*. Purdue technical report / ACM TOG lineage. https://www.cs.purdue.edu/cgvlab/www/resources/papers/Fudos-ACMTOG-1997-A_Graph_Constructive_Approach_to_Solving_Systems_of_Geomeric_Cons.pdf
2. Qiang Zou et al. *A review on geometric constraint solving*. arXiv:2202.13795. https://arxiv.org/abs/2202.13795
3. Siemens. *D-Cubed 2D DCM*. https://www.siemens.com/en-us/products/plm-components/d-cubed/2d-dcm/
4. Autodesk Research. *Aligning Constraint Generation with Design Intent in Parametric CAD*. https://www.research.autodesk.com/app/uploads/2025/10/Aligning-Constraint-Generation-with-Design-Intent-in-Parametric-CAD.pdf

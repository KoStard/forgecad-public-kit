# Constraint Solver Industry Study

## Goal & Current State

**Goal**: Compare ForgeCAD's Rust sketch constraint solver against industry-standard CAD solver expectations, identify fundamental architectural limitations behind remaining timeouts, validate claims with focused proofs-of-concept, and produce both an engineering report and a paper-style write-up.

**Questions**
- Where does the current solver align with standard sketch-solver practice?
- Where is it fundamentally weaker than production systems such as Fusion 360 / D-Cubed-class workflows?
- Are the remaining timeout cases mostly implementation debt, or do they expose deeper limits in the current architecture?
- What is the actual scientific difficulty of "solving sketch constraints well"?

**Baseline status**: Measured. ForgeCAD behaves well on some structurally simple redundant sketches, but still shows serious failures on large or multi-basin sketches.

## Architecture Summary

ForgeCAD's current sketch solver is a Rust/WASM nonlinear least-squares system with:

- Deterministic presolve and analytical presolve stages
- Optional progressive solves and subgraph decomposition
- A Levenberg-Marquardt numerical core with projector-based warm starts
- Coordinate reduction, group/subgraph compression, and restart heuristics
- Post-solve DOF / redundancy analysis

The design is already materially more sophisticated than a naive "just run Newton" solver, but it still inherits local-solver limitations around initialization, multi-solution branch selection, degeneracy, redundancy, and ill-conditioning.

## Progress Tracker

| # | Change | Metric A | Metric B | Status |
|---|--------|----------|----------|--------|
| — | Baseline hard-case characterization | Honeycomb: 712ms end-to-end, Rust/WASM solve 69ms, err=0.000256 | Spiral: 11.9s end-to-end with timeout warning, err=0.586513; direct Rust 1.42s, err=1.266588 | ✅ |
| B1 | Spectrometer basin measurement | Full spectrometer cold start (direct Rust): 1.85s, err=6.948344, FAIL | Near-solution camera subsystem: 0.17s, err=0.000345, PASS | ✅ |
| P1 | Branch ambiguity POC | Guess `+8` → solution `y=+8.660254`; guess `-8` → solution `y=-8.660254` | Guess `+0.1` still biases to positive branch | ✅ |
| P2 | Constructive-vs-global spiral POC | Generic solver on 50-segment spiral: 1.42s, err=1.266588 | Direct constructive recurrence: 0.1454us/run average over 100k runs | ✅ |
| R1 | Literature / industry comparison | D-Cubed-class benchmark collected | Autodesk/Fusion-class solver behavior sources collected | ✅ |

## Experiment Log

### Baseline characterization (SUCCESS)
**What**: Ran current hard cases through the rebuilt release solver using both the full ForgeCAD path and targeted Rust solver tests.

**Result**:
- `examples/constraints/10-stress-honeycomb.forge.js`: healthy baseline. End-to-end `712ms`, Rust/WASM solve `69ms`, `err=0.000256`.
- `examples/constraints/09-stress-spiral.forge.js`: timeout warning from the default 10s budget, end-to-end `11.9s`, final `err=0.586513`.
- Direct Rust `industry_study` spiral POC: `1.42s`, `err=1.266588`, so the failure is not primarily CLI overhead.
- `examples/constraints/06-complex-spectrogram.forge.js`: first sub-sketch solves, second sub-sketch fails badly (`err=175.681909`) after `5.28s` end-to-end and `4.7s` Rust/WASM solve.
- Direct Rust full spectrometer cold start test: `1.85s`, `err=6.948344`, still fails without TS/WASM orchestration noise.
- Direct Rust near-solution camera subsystem test: `0.17s`, `err=0.000345`, showing the same family is easy once initialized near the right basin.

**Why it worked/failed**: Honeycomb is structurally regular and stays in a benign basin. Spiral and spectrometer both expose architecture limits in initialization, branch selection, and progressive/global solve scaling.

**Lesson**: The remaining failures are not one uniform "solver is slow" problem. They split into at least two classes:
- Architecture mismatch: constructive geometry routed through generic LM
- Local-basin sensitivity: same equations solve quickly from a good seed and fail from a cold one

### POC 1: Branch ambiguity (SUCCESS)
**What**: Added `solver/examples/industry_study.rs` with a mirror-symmetric two-distance problem.

**Result**:
- Initial `y=+8` solves to `y=+8.660254`
- Initial `y=-8` solves to `y=-8.660254`
- Initial `y=+0.1` solves to the positive branch

**Why it worked/failed**: The hard constraints define two equally valid geometric solutions. Without an explicit branch/intention representation, the solver must pick based on the initial state.

**Lesson**: Branch persistence is a first-class CAD requirement, not a numerical tuning problem.

### POC 2: Constructive-vs-global spiral (SUCCESS)
**What**: Added a second proof case in `solver/examples/industry_study.rs` comparing the current solver against a direct constructive recurrence for the 50-segment spiral family.

**Result**:
- Current solver: `1.42s`, `err=1.266588`
- Direct constructive recurrence: `0.1454us/run` average over `100,000` runs

**Why it worked/failed**: The spiral family is determined by a simple sequential construction, but the current architecture still pushes it through progressive warm-up and global LM passes.

**Lesson**: A large part of the remaining pain is caused by using the wrong algorithmic class for a large subset of sketches.

### Literature / industry comparison (SUCCESS)
**What**: Collected primary sources for graph-constructive solving, modern GCS review, Siemens D-Cubed 2D DCM capabilities, and Autodesk/Fusion constraint-solver behavior.

**Result**:
- The literature strongly supports decomposition + constructive solving before numerical refinement.
- D-Cubed-class systems explicitly provide minimal-movement solve modes and continuous under/over-constrained diagnostics.
- Autodesk research around the Fusion solver treats solve state as including fully-constrained, under-constrained, over-constrained, not solvable, and unstable outcomes.

**Why it worked/failed**: ForgeCAD already has partial analytical and reconstruction layers, but they cover only a narrow motif set.

**Lesson**: ForgeCAD is directionally aligned with the literature, but still substantially short of industry-standard architecture coverage.

## Files Modified

| File | Purpose |
|---|---|
| `docs/temporary/projects/2026/03/31/constraint-solver-industry-study/PLAN.md` | Investigation log and experiment tracker |
| `solver/examples/industry_study.rs` | Proof-of-concept executable for branch ambiguity and constructive-vs-global spiral behavior |

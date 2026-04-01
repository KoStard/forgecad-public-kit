# Solution Continuity — Branch Persistence Across Sessions and Files

## Problem Definition

The constraint solver is a local optimizer: it finds the solution nearest to the initial guess. When a sketch has multiple valid solutions (two circles intersecting at two points, a point at distance D from two anchor points, etc.), the solver picks the branch closest to where the geometry started.

This works acceptably in a single session with warm starts — the geometry naturally stays on the branch the user established. It breaks in three scenarios:

1. **File reload**: the sketch is serialized as point coordinates, but *which branch* the user intended is not. If coordinates round-trip imprecisely or the solver is re-run from stored positions, it may flip to a mirror solution.
2. **File sharing**: another user opens the same file with a different system state. Nothing encodes the intended branch, so the solver may produce geometrically correct but topologically wrong output.
3. **Parametric variation**: when a dimension is driven programmatically (e.g. in a `for` loop generating variants), the solver starts each variant from the previous geometry and may drift across branches as parameters change continuously.

No production fix has been attempted yet. The solver currently relies on warm-start implicit continuity and gets lucky most of the time.

## Description

Investigate what solution continuity would require as a first-class feature in ForgeCAD — from the lightweight end (encode branch hints in the file) to the full architecture (branch-aware solver with explicit solution selection protocol).

This is a **scoping and design task** before implementation.

Primary files to understand first:
- `solver/src/solver/mod.rs` — where initial guess comes from (warm-start path), solve orchestration
- `solver/src/solver/decompose.rs` — where components are solved sequentially (where branch choice happens)
- `solver/src/solver/analytical.rs` — where constructive patterns pick one of two solutions
- `src/forge/sketch/constraints/sketch.ts` — how sketch definitions are serialized/deserialized (TS-side only)

## Requirements

### Phase 1: Characterize the failure modes

Write 3–5 new Rust solver tests that demonstrate branch flipping:
- A point at distance D from two fixed points (two symmetric solutions)
- A four-bar linkage with two valid assembly configurations (open vs. crossed)
- A circle tangent to a line with two tangency positions

Run each test from cold start (all points at origin or random) and measure which branch the solver picks vs. what the user intent would be.

### Phase 2: Design the branch representation

Decide what minimum information identifies a branch unambiguously:

**Option A: Sign vector** — for each multi-solution sub-problem, record a ±1 sign indicating which of the two solutions was chosen. Store in the sketch definition alongside the constraints. O(n_ambiguous) storage per sketch.

**Option B: Winding order fingerprint** — record the signed area or cross-product sign for each triangle in the constraint graph. Robust to coordinate perturbation.

**Option C: Reference positions** — store "soft target" positions alongside hard constraints. The solver uses these as tie-breakers when two branches are equidistant. This is what SolidWorks and Siemens NX do ("reference geometry").

Evaluate: which option survives file-round-trip precision loss? Which works when the file is modified by a script that doesn't know about branches?

### Phase 3: Persistence design

Determine how branch information is serialized:
- Is it stored in `.forge.js` source alongside the constraint declarations? (impacts diff readability)
- Is it stored in a sidecar (`.forge.meta.json`)? (invisible to version control)
- Is it recomputed at load time from stored coordinates + a "nearest branch to these reference coords" solve? (fragile under large parameter changes but zero extra storage)

### Phase 4: Scope the implementation

Produce a task that describes the minimal viable implementation:
- Which constraint types are multi-solution and need explicit branch tracking? (Check `solver/src/constraints/mod.rs` and `solver/src/solver/analytical.rs`)
- What API change is needed on `ConstrainedSketchBuilder` to let users declare branch intent?
- What changes are needed in Rust decomposition to propagate branch hints through the sequential solve?

## Status and log
- 2026-03-19: Created from constraint solver quality review.
- 2026-03-20: Updated file references from deleted TS modules to current Rust solver files. The decompose/analytical logic is now in Rust; branch selection should be investigated and implemented there.

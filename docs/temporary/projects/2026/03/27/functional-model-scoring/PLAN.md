# Functional Model Scoring — Can We Test If a CAD Model "Works"?

**Date**: 2026-03-27
**Status**: Brainstorm / Concept Design
**Type**: Investigation — concept validation

---

## The Core Insight

In the real world, we don't score a lawnmower by how it looks on paper. We score it by whether it cuts grass. A model's correctness is ultimately **functional** — does the mechanism achieve its intended physical purpose?

ForgeCAD models are programs that produce geometry. Programs are tested with test suites. But CAD models have a unique property code doesn't: **they describe physical things that must obey physics and serve a purpose.**

This gives us something no existing CAD benchmark has: **objective, deterministic, reference-free functional scoring.**

---

## The Problem with Current CAD Scoring

| Approach | Weakness |
|----------|----------|
| Visual similarity (render comparison) | Shallow — a model can look right but not work. Style differences tank the score unfairly. |
| Geometric metrics (volume, bbox, surface area) | Necessary but not sufficient. A solid block has volume too. |
| Topological checks (manifold, watertight) | Baseline hygiene, not quality. |
| LLM-as-judge | Non-deterministic, expensive, gameable. |
| Manual human review | Doesn't scale, subjective. |

**None of these answer: "Does it DO what it's supposed to do?"**

---

## The Genius Insight: Functional Test Harnesses for CAD

### The Analogy

| Software | CAD (ForgeCAD) |
|----------|---------------|
| Function signature | Assembly interface: named parts + named joints |
| Unit test | Functional test: drive joints, check outcomes |
| Test passes/fails | Mechanism works/doesn't |
| HumanEval benchmark | **ForgeCAD Bench** |

### What Makes This Work

A **Functional Test Harness** defines:
1. **Expected interface** — what parts and joints the model must expose
2. **Kinematic tests** — drive joints through ranges, verify motion behavior
3. **Physical tests** — collision detection, clearance, fit, range of motion
4. **Geometric assertions** — volumes, proportions, symmetry where they matter
5. **Mechanism tests** — input motion → expected output behavior

The critical property: **it tests FUNCTION, not FORM.** The model can look however it wants as long as it works. This means:
- Style-agnostic — any working design scores well
- Unambiguous — either the scissors cut or they don't
- Reference-free — the test suite IS the specification
- Deterministic — same model, same score, every time
- Partial credit — naturally gradable (10 tests, pass 7 = 70%)

---

## Concrete Example: Scoring a Pair of Scissors

### The Prompt (given to an LLM)

> Build a pair of scissors. The model must return an assembly with a revolute pivot joint named "pivot". It should have two blades and two handles. The scissors should open to at least 30 degrees without self-collision of the handles.

### The Functional Test Harness

```javascript
// === INTERFACE TESTS (does it have the right parts?) ===

// T1: Assembly exists and can be solved
const closed = model.solve({ pivot: 0 });
assert(closed, "Model must return a solvable assembly");  // 1 point

// T2: Required parts exist
verify.notEmpty("blade_a exists", closed.part("BladeA"));  // 1 point
verify.notEmpty("blade_b exists", closed.part("BladeB"));  // 1 point

// T3: Pivot joint is revolute
assert(model.joint("pivot").type === "revolute");  // 1 point

// === KINEMATIC TESTS (does it move correctly?) ===

// T4: Opens to 30° without handle collision
const open30 = model.solve({ pivot: 30 });
const sweep = model.sweepJoint("pivot", 0, 30, 20);
const handleCollisions = sweep.filter(f =>
  f.collisions.some(c => isHandlePair(c))
);
assert(handleCollisions.length === 0, "Handles must not collide during opening");  // 2 points

// T5: Joint has limits that include [0, 30]
const joint = model.joint("pivot");
assert(joint.min <= 0 && joint.max >= 30, "Pivot range must include 0-30°");  // 1 point

// === PHYSICAL TESTS (does it work as scissors?) ===

// T6: When closed, cutting edges are close (they meet to cut)
const clearance = closed.minClearance("BladeA", "BladeB");
assert(clearance < 0.5, "Blades must nearly touch when closed");  // 2 points

// T7: Reasonable proportions (not a 1mm or 10m scissors)
const bbox = closed.boundingBox();
const length = bbox.max[0] - bbox.min[0];
verify.inRange("scissors length", length, 50, 300);  // 1 point

// T8: Both handles have finger holes (volume check — solid handles vs. ring handles)
// Ring handles have less volume relative to bounding box
const handleADensity = volumeRatio(closed.part("HandleA"));
assert(handleADensity < 0.7, "Handle A should have a finger hole");  // 1 point

// Total: 11 points possible
```

### What This Catches That Visual Scoring Misses

- A model that looks like scissors but has a fixed joint (doesn't open) → fails T4
- A model with correct blades but handles that collide at 15° → fails T4
- A model where blades don't actually meet when closed → fails T6
- A perfectly shaped scissors at 0.1mm scale → fails T7

---

## Architecture: How This Maps to ForgeCAD Today

### Already Available (no new code needed)

| Capability | ForgeCAD API |
|------------|-------------|
| Assembly with named joints | `assembly().addPart().addJoint()` |
| Solve at joint values | `assembly.solve({ joint: value })` |
| Collision detection | `solved.collisionReport()` |
| Joint sweep with collision | `assembly.sweepJoint(name, from, to, steps)` |
| Clearance measurement | `assembly.minClearance(partA, partB)` |
| Geometric assertions | `verify.boundingBoxSize()`, `verify.volumeApprox()`, etc. |
| Volume, area, bbox queries | `shape.volume()`, `shape.surfaceArea()`, `shape.boundingBox()` |
| Part extraction | `solved.part(name)` |
| Face/edge queries | `selectEdges()`, `shape.face()` |
| Gear coupling verification | `addGearCoupling()` with ratio checks |

### Needs to Be Built

| Capability | Purpose | Difficulty |
|------------|---------|------------|
| **Test harness runner** | Execute a `.test.forge.js` against a model, collect pass/fail/score | Medium |
| **Standard assertion library** | `expect(model).toHaveJoint("pivot", { type: "revolute" })` | Easy — thin wrapper over existing `verify.*` |
| **Model interface contract** | Convention for what a model must export (assembly name, joint names) | Convention, not code |
| **Score aggregator** | Sum points, compute percentages, generate reports | Easy |
| **Benchmark task suite** | Library of tasks with prompts + test harnesses | Content creation |

---

## Stretching to LLM Benchmark: ForgeCAD Bench

### Why This Could Be Revolutionary

Current LLM coding benchmarks:
- **HumanEval / MBPP** — write a function, run unit tests. Works because scoring is deterministic.
- **SWE-bench** — fix a bug in a real repo. Works because tests exist.
- **There is nothing equivalent for spatial/mechanical reasoning.**

ForgeCAD Bench would be the **HumanEval of 3D mechanical reasoning**:

```
┌─────────────────────────────────────────────────┐
│  TASK                                           │
│  ├── prompt.md        (natural language spec)   │
│  ├── harness.forge.js (functional test suite)   │
│  ├── api-reference.md (ForgeCAD API subset)     │
│  └── metadata.json    (difficulty, category)    │
│                                                 │
│  LLM generates → solution.forge.js              │
│                                                 │
│  Runner: forgecad test harness.forge.js          │
│          --model solution.forge.js              │
│          → score: 8/11 (72.7%)                  │
└─────────────────────────────────────────────────┘
```

### What It Tests That Code Benchmarks Can't

| Dimension | Example |
|-----------|---------|
| **Spatial reasoning** | "The handle must be below the blade" — requires understanding 3D orientation |
| **Mechanical reasoning** | "Gears must mesh" — requires understanding gear ratios, module, tooth count |
| **Physical intuition** | "The stand must not tip over" — requires center-of-mass reasoning |
| **Constraint satisfaction** | "Must fit in a 100x100x50mm box while having 30° range of motion" — multi-constraint optimization |
| **Parametric thinking** | "Make it work for any bolt size M3-M12" — requires parameterization |

### Task Categories (Draft)

| Category | Example Tasks | Key Tests |
|----------|---------------|-----------|
| **Simple mechanisms** | Scissors, pliers, door hinge | Joint type, range of motion, collision |
| **Gear trains** | Clock mechanism, gear reducer | Ratio accuracy, mesh clearance, direction |
| **Linkages** | 4-bar linkage, pantograph | Output path, velocity ratio, toggle positions |
| **Assemblies** | Phone stand, toolbox, shelf bracket | Fit, stability, load path |
| **Parametric** | Configurable box joint, any-size clamp | Test at multiple parameter values |
| **Constrained design** | "Fits in X, weighs under Y, reaches Z" | Multi-objective scoring |

### Difficulty Levels

1. **Static** — Single part, geometric checks only (volume, proportions, features)
2. **Kinematic** — Assembly with joints, motion checks
3. **Mechanism** — Coupled joints, gear trains, specific mechanical behavior
4. **Constrained** — Multiple competing requirements, optimization needed
5. **Parametric** — Must work across a range of input parameters

---

## The Deeper Insight: Functional Tests as Specification Language

The test harness isn't just a scoring tool — **it's a specification language for mechanical intent.**

Today's CAD specs are:
- Natural language (ambiguous)
- Engineering drawings (require human interpretation)
- Reference models (impose specific form, not just function)

A functional test harness captures: **"I don't care WHAT you build, as long as it DOES this."**

This is the same revolution that happened when software engineering moved from "does it look right?" to "does it pass the tests?" — but for physical mechanisms.

### Implications

1. **Design exploration** — Generate many designs, score them all, pick the best. The test harness enables automated design search.
2. **Regression testing** — Change a parameter, re-run tests, catch breakage. Already standard in code, novel in CAD.
3. **AI-assisted design** — The test harness becomes the objective function for any AI system generating CAD models.
4. **Education** — Students get instant feedback: "Your gear train runs but the ratio is 2.8, expected 3.0 — 90% credit."

---

## Open Questions

1. **How granular should scoring be?** Binary pass/fail per test, or continuous (e.g., "clearance is 0.3mm, target was 0.5mm, partial credit")?
2. **How do we handle valid alternative topologies?** A sliding-pivot scissors vs. traditional crossed scissors — both work. The harness must test function, not structure.
3. **Physics simulation scope** — do we need FEA / dynamics, or is kinematics + collision + geometry enough for v1?
4. **Can we auto-generate harnesses from natural language?** An LLM writing the test, another LLM writing the model — who watches the watchman?
5. **Benchmark contamination** — if test harnesses are public, LLMs could memorize solutions. Need to parameterize tasks?

---

## Proposed Next Steps

| # | Step | Type |
|---|------|------|
| 1 | Build a proof-of-concept: one task (scissors), one harness, run it manually | Experiment |
| 2 | Test the harness against 3 solutions: good, mediocre, broken — verify scores make sense | Validation |
| 3 | Design the test runner API: `forgecad bench run task/ --model solution.forge.js` | Design |
| 4 | Create 5 benchmark tasks across difficulty levels | Content |
| 5 | Run against 3+ LLMs, compare scores | Benchmark pilot |
| 6 | Publish spec + initial task suite | Release |

---

## Progress Tracker

| # | Step | Status |
|---|------|--------|
| — | Initial brainstorm & concept | Done |
| 1 | Proof-of-concept harness | Done |
| 2 | Multi-solution validation | Done |
| 3 | Test runner design | Not started |
| 4 | Benchmark task creation | Not started |
| 5 | Multi-LLM pilot | Not started |

---

## Experiment Log

### Experiment 1: Simple Tongs PoC (SUCCESS)

**What**: Built a "simple tongs" benchmark task with 10 functional tests across 5 categories:
- Structure (parts exist)
- Joint type & range
- Physical realizability (ghost joint detection)
- Gripping function (jaw gap at closed/open positions)
- Motion quality (collision-free sweep)
- Geometry quality (meaningful volume)

Tested against 3 solutions: good (correct tongs), mediocre (wide gap, limited range), broken (prismatic joint, ghost joint, tiny arm).

**Result**:

| Solution | Score | Key Failures |
|----------|-------|-------------|
| Good | 10/10 (100%) | — |
| Mediocre | 8/10 (80%) | Jaw gap 20mm, range only 15deg |
| Broken | 6/10 (60%) | Prismatic joint, ghost joint 79.6mm, tiny ArmB |

**Key findings**:
1. **Ghost joint detection works** — T5 caught the broken solution's 79.6mm arm separation using bbox center distance. This directly addresses the "code-valid but physically impossible" joint problem.
2. **Collision sweep is sensitive** — initial geometry had arms in the same Y plane, causing sweep collisions at every frame. Fix: stacked arms in Z (like real tongs). Good lesson: test geometry must be physically sound.
3. **Bbox gap measurement is axis-agnostic** — jaw gap computed as max positive axis gap across X/Y/Z, making it work for both side-by-side and stacked arm layouts.
4. **CLI doesn't display verify results** — had to use `console.warn()` for output. Verification display in CLI is a future improvement.
5. **Scores differentiate correctly** — monotonic ordering: good > mediocre > broken. Each failure points to a specific functional deficiency.

**Lesson**: Functional test harnesses for CAD work. The key primitives (assembly.describe(), solve(), sweepJoint(), boundingBox()) are sufficient for meaningful scoring. The ghost joint detector is novel and addresses a real problem with AI-generated assemblies.

**Files**: `examples/bench/simple-tongs/`

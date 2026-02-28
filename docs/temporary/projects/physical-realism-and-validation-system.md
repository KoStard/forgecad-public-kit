# ForgeCAD Project Proposal: Physical Realism and Hard Validation

Date: 2026-02-28

## Executive Summary

ForgeCAD already has strong foundations for validation:
- scene/object extraction in `runScript`
- collision checks in `cli/test-run.ts`
- parametric robustness sampling in `cli/param-check.ts`
- assembly collision and sweep APIs in `src/forge/assembly.ts`

The core gap is not "can we detect some failures". The gap is that we do not yet have a unified, strict, physics/manufacturing-aware gate that can reject visually plausible but physically impossible designs.

The highest-leverage move is to introduce a **Validation Gatekeeper** with:
1. Deterministic geometry sanity checks
2. Manufacturing-profile rule packs (FDM/SLA/CNC/sheet-metal)
3. Assembly + kinematic feasibility checks
4. Physical plausibility checks (stability, minimal strength heuristics)
5. Explicit pass/fail policy for AI-generated outputs

This should run both in CLI and benchmark pipelines, and become the default acceptance gate for generated models.

## Problem Definition

"Plausible but incorrect" models happen because visual plausibility is weak evidence of physical feasibility.

Current failure classes:
1. Geometric invalidity
- Empty/near-empty solids from bad booleans
- Degenerate thin artifacts
- Disconnected floating fragments

2. Assembly invalidity
- Static interpenetrations
- Dynamic collisions across joint travel
- Zero/negative clearances where mating is intended

3. Manufacturing invalidity
- Walls below process limits
- Holes too small/too deep for process/tooling
- Unsupported overhangs/bridges (FDM)

4. Mechanical implausibility
- Top-heavy unstable bases
- Unrealistic slender features likely to fail
- Fastener layouts that cannot be assembled or serviced

5. Intent drift
- Model satisfies syntax but violates prompt intent (missing critical subassemblies, wrong topology)

## Current State in ForgeCAD

What exists today and should be reused:

1. Script/runtime checks
- `cli/test-run.ts` already reports collisions and object metrics.
- `cli/param-check.ts` already finds runtime errors, degenerate volumes, and new collisions across parameter ranges.

2. Assembly-level checks
- `SolvedAssembly.collisionReport(...)`
- `SolvedAssembly.minClearance(...)`
- `Assembly.sweepJoint(...)` for motion sampling

3. Geometric metrics available now
- `boundingBox()`, `volume()`, `surfaceArea()`, `numTri()`, `isEmpty()`, `minGap(...)`

Main limitations of current checks:
- Rules are spread across commands, not a single validation contract.
- No process-specific manufacturing rules.
- No severity model with hard reject thresholds.
- No benchmarked precision/recall for impossible-model detection.

## Proposal: Validation Gatekeeper Architecture

Build a single pipeline called from CLI, CI, and benchmark runs:

`Model -> Normalized Scene -> Rule Engine -> Findings -> Policy -> PASS/REJECT`

### Validation Layers

Layer 0: Geometry Sanity (hard fail)
- Empty solids
- Near-zero volume components (with configurable epsilon)
- NaN/Inf bounding boxes
- Disconnected fragments above threshold count

Layer 1: Manufacturability (profile-driven)
- Minimum wall thickness
- Minimum hole diameter and max printable aspect ratio
- FDM overhang and bridge limits
- Process tolerances and clearance defaults

Layer 2: Assembly + Kinematics
- Static collisions above tolerance
- Required clearances for designated mating pairs
- Sweep collisions across joint ranges
- Tool-access checks for fasteners (simplified line-of-access tests)

Layer 3: Physical Plausibility
- Center of mass projection vs support polygon (tip risk)
- Slenderness heuristics for beams/arms
- Contact area/load-path heuristics for mounted components

Layer 4: Intent Conformance (strict optional)
- Prompt/spec contract checks (required part names, required interfaces, required function)
- Example: AC unit must include indoor/outdoor bodies + connecting lines + fan location constraints

## Rule Engine Design

Define a common rule interface:

```ts
interface ValidationRule {
  id: string;
  description: string;
  layer: 0 | 1 | 2 | 3 | 4;
  run(ctx: ValidationContext): ValidationFinding[];
}

interface ValidationFinding {
  ruleId: string;
  severity: "error" | "warn" | "info";
  category: "geometry" | "manufacturing" | "assembly" | "physics" | "intent";
  message: string;
  objects?: string[];
  metrics?: Record<string, number | string | boolean>;
  suggestedFix?: string;
}
```

Policy then decides pass/fail:
- `strict`: reject on any `error`, or warning-count threshold
- `normal`: reject on any geometry/assembly error, warn on manufacturing heuristics
- `advisory`: never reject, report only

## The Biggest Capability Upgrade

The single biggest upgrade is:

**Add design contracts + process profiles + hard gate policy.**

Without this, validators stay heuristic and optional. With this, we can codify what "physically real" means per model class.

### 1) Design Contracts in Script API

Introduce optional assertions inside `.forge.js`:

```js
contract({
  process: "fdm_0p4_nozzle",
  mustInclude: ["Base", "Upper Arm", "Forearm", "Gripper"],
  clearance: [
    ["Shaft", "Bearing", { min: 0.15, max: 0.35 }],
  ],
  forbiddenCollisions: [
    ["Rotor", "Housing"],
  ],
  minWall: 1.2,
  maxOverhangDeg: 50,
});
```

Why this matters:
- It converts ambiguous "looks right" into machine-checkable conditions.
- It gives AI concrete targets.
- It enables strict automated rejection with low ambiguity.

### 2) Process Profiles

Ship built-in validation profiles:
- `fdm_0p4_general`
- `sla_resin_general`
- `cnc_3axis_basic`
- `sheet_metal_basic`

Each profile sets defaults for:
- min wall
- min hole
- min clearance
- overhang/bridge constraints
- draft/tool-access assumptions

### 3) Hard Gate in Generation Loop

For AI design workflows, require:
1. Generate model
2. Run validation gate (strict)
3. If rejected, feed structured findings back to model
4. Iterate until pass or retry budget exhausted

This is how we stop accepting plausible nonsense.

## High-Value Checks to Implement First

These are high signal, relatively practical, and map to existing ForgeCAD APIs.

1. Hard geometry checks (Week 1)
- Empty/degenerate solids (`isEmpty`, `volume` thresholds)
- Invalid bounds
- Excessive tiny fragments (component decomposition)

2. Collision + clearance policy (Week 1-2)
- Reuse `collisionReport`, `minGap`, `sweepJoint`
- Move from informational output to policy-driven reject

3. Parametric robustness gate (Week 2)
- Refactor `cli/param-check.ts` as reusable validator module
- Fail if any parameter sample produces errors/degeneracy/new critical collisions

4. Wall thickness + hole constraints (Week 3-4)
- Add approximate thickness probing (sampling + ray pair/min-gap inside local neighborhoods)
- Detect undersized holes against process profile

5. Stability check (Week 4)
- Compute approximate COM and support polygon
- Reject if COM projection leaves support under nominal orientation

## Required Refactors in Codebase

1. Create a new module
- `src/forge/validate/`
  - `engine.ts`
  - `types.ts`
  - `rules/*.ts`
  - `profiles/*.ts`

2. Unify existing CLIs
- `cli/test-run.ts` -> keep as quick smoke check
- new `cli/validate.ts` -> authoritative gate
- `cli/param-check.ts` logic imported into engine as one rule set

3. Standard outputs
- Human-readable summary
- JSON report for CI/batch benchmark

Example JSON:

```json
{
  "status": "reject",
  "profile": "fdm_0p4_general",
  "errors": 3,
  "warnings": 4,
  "findings": [
    {
      "ruleId": "assembly.static_collision",
      "severity": "error",
      "objects": ["Forearm", "Housing"],
      "metrics": { "overlapVolumeMm3": 42.7 },
      "message": "Forbidden collision detected"
    }
  ]
}
```

## Rejection Policy Recommendation

To reject "obviously impossible" models, default strict policy should reject when any of these is true:

1. Geometry hard fails
- any empty required part
- any part with non-finite bounds
- fragment count above threshold without explicit allowlist

2. Assembly hard fails
- any forbidden collision above overlap threshold
- any required clearance violated
- any sweep step collision in critical motion paths

3. Manufacturing hard fails
- min wall below profile threshold
- holes/features below process minimum

4. Robustness hard fails
- any sampled parameter state yields runtime error or geometric collapse

Warnings should remain for softer heuristics (for now):
- overhang risk
- high slenderness ratio
- likely print orientation issues

## Benchmark and Evaluation Strategy

Introduce an "Impossible Model Corpus" with labeled failure types.

Corpus categories:
1. Degenerate geometry
2. Static interpenetration
3. Motion collision
4. Thin-wall violations
5. Unstable base/COM
6. Intent-mismatch templates

For each benchmarked model run, record:
- pass/reject
- findings by category
- false-positive/false-negative labels after review

Track validator quality over time:
- precision/recall for rejection
- "bad model escaped" rate
- average iterations to reach passing design

This should integrate with existing benchmark workflow under `ForgeCADBenchmark/results` and README benchmark maintenance flow.

## Roadmap

Phase 0 (Immediate, 1 week)
- Implement validation engine scaffold
- Port existing collision/degenerate/param checks into rule modules
- Add CLI `npm run validate -- <script> --profile fdm_0p4_general --strict`

Phase 1 (2-4 weeks)
- Add process profiles
- Add wall/hole checks (approximate)
- Add standardized JSON outputs and CI gating

Phase 2 (4-8 weeks)
- Add assembly intent contracts and required-clearance contracts
- Add kinematic sweep as hard gate for mechanisms
- Add benchmark corpus + validator metrics dashboard

Phase 3 (8+ weeks)
- Add deeper physics heuristics (stability/load-path)
- Add auto-repair suggestions tied to findings
- Add optional LLM repair loop that stops only on PASS

## Risks and Mitigations

1. False positives block good models
- Mitigation: profile-specific thresholds, allowlists, severity tuning, staged rollout

2. Expensive validation runtime
- Mitigation: layered short-circuiting (cheap checks first), sampling budgets, caching per parameter set

3. Overfitting to benchmark prompts
- Mitigation: maintain diverse corpus and manual audits; separate public benchmark from internal holdout

4. Ambiguity in intent checks
- Mitigation: require explicit contracts for strict intent enforcement

## Concrete Next Actions

1. Build `src/forge/validate/types.ts` and `engine.ts`.
2. Extract current collision + degenerate + param sampling checks into reusable rules.
3. Add `cli/validate.ts` with strict/advisory modes and JSON output.
4. Define first process profile (`fdm_0p4_general`) and wire thresholds.
5. Add 20-30 labeled impossible-model fixtures for regression tests.

## Final Recommendation

Yes, ForgeCAD can greatly improve physical realism and rejection quality, and it can do so without abandoning its code-first identity.

The winning strategy is not one magic geometry feature. It is a **contract-driven validation platform** that combines:
- deterministic geometry checks,
- manufacturing-aware rule packs,
- assembly/kinematic validation,
- parameter robustness gating,
- strict pass/fail policy integrated into AI generation loops.

If we implement only one major initiative, it should be this Validation Gatekeeper. It will immediately reduce plausible-but-impossible outputs and create a clear foundation for future physical intelligence.

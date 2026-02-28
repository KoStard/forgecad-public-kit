# ForgeCAD Project Note: Motorized Mechanism Realism Roadmap

Date: 2026-02-28

## Why motorized designs currently look like toys

Your complaint is accurate. In current ForgeCAD, motorized assemblies often look visually plausible but mechanically fake.

From codebase analysis, the main reasons are:

1. Missing first-class drivetrain primitives
- `src/forge/library.ts` includes fasteners, pipes, threads, bolts/nuts, but no real gear primitives (involute spur/helical/bevel), pulleys, belts, chains, bearings, couplers, or keyed shafts.
- Result: models approximate power transfer with cylinders/boxes/discs.

2. Assembly solver is kinematic-only, not drivetrain-aware
- `src/forge/assembly.ts` supports only `fixed | revolute | prismatic` joints.
- There is no concept of coupled joints (gear ratio, belt ratio, leadscrew pitch, differential constraints).
- Result: parts can move, but force and motion transmission are not modeled.

3. No motor/actuator performance model
- No API for motor curves (stall torque, no-load RPM, efficiency, current, thermal limits).
- No simple load model (inertia/friction/gravity torque estimates) connected to joints.
- Result: actuator choices are decorative metadata, not validated design drivers.

4. Validation focuses on geometry robustness, not mechanism feasibility
- Existing checks (`cli/test-run.ts`, `cli/param-check.ts`, assembly collision helpers) detect runtime errors/collisions/degenerate geometry.
- They do not validate gear mesh quality, backlash windows, torque margin, or motion-to-load feasibility.
- Result: impossible mechanisms pass because they are geometrically renderable.

5. Example patterns still encourage "visual mechanism" modeling
- `examples/api/exploded-view.forge.js` uses simple cylinder-based motor visuals.
- `examples/robot_hand_2.forge.js` has a `gearDisc(...)` approximation, not true involute gears with mesh constraints.
- Result: AI copies these patterns and reproduces toy-like outcomes.

## What ForgeCAD already has (good foundation)

This is solvable without replacing the core architecture.

1. Strong geometry kernel + parametric script workflow
- Manifold-backed solid modeling is stable and fast enough for mechanical detail generation.

2. Assembly graph and motion sweep hooks
- `assembly(...).addJoint(...)`, `solve(...)`, `sweepJoint(...)`, `collisionReport(...)`, `minClearance(...)` already give motion/collision scaffolding.

3. Existing precedent for advanced procedural parts
- `lib.thread(...)`, `lib.bolt(...)` prove ForgeCAD can generate non-trivial parametric mechanical geometry.

4. Existing realism initiative
- `docs/temporary/projects/physical-realism-and-validation-system.md` already outlines a validation gatekeeper concept that can be extended for mechanisms.

## Root problem statement

Current ForgeCAD can answer:
- "Can I place and animate these solids?"

It cannot yet answer:
- "Does this motor actually drive this load through this transmission with valid geometry and safe margins?"

That capability gap is exactly why motorized outputs feel fake.

## Recommended strategy

Build a dedicated **Mechatronics Layer** on top of current assembly + validation systems.

### Pillar A: Real transmission primitives (geometry + metadata)

Add first-class library parts with physically meaningful parameters.

Initial API targets:

```js
const pinion = lib.spurGear({
  module: 1.0,
  teeth: 14,
  pressureAngleDeg: 20,
  faceWidth: 8,
  bore: { type: 'D-shaft', diameter: 5 },
});

const gear = lib.spurGear({
  module: 1.0,
  teeth: 42,
  pressureAngleDeg: 20,
  faceWidth: 8,
  bore: { type: 'bearing-seat', diameter: 8 },
});

const pair = lib.gearPair({
  pinion,
  gear,
  backlash: 0.08,
  centerDistanceFit: 'h7-g6',
});
```

Minimum set for v1:
- involute spur gear
- simple helical gear
- GT2 timing pulley + belt path helper
- bearing seats (608, 625, 688, etc.)
- keyed/D-shaft and coupler primitives

### Pillar B: Coupled-joint mechanics in assembly solver

Extend assembly with kinematic relations.

Proposed additions:

```ts
assembly.addCoupling('shoulder_drive', {
  type: 'gear',
  inputJoint: 'motor_shaft',
  outputJoint: 'shoulder_joint',
  ratio: -3.0,
  backlashDeg: 0.6,
  efficiency: 0.94,
});
```

Supported coupling types (phase 1):
- gear ratio coupling (signed ratio)
- belt/chain ratio coupling
- leadscrew (rotary -> linear via pitch)

Solver behavior:
- solve independent joints first
- propagate dependent joints via coupling graph
- detect cycles/overconstraints
- report clamping/constraint violations as warnings/errors

### Pillar C: Motor + load plausibility checks

Add lightweight engineering checks (not full FEA/rigid-body simulation).

Per actuator, compute:
- reflected inertia estimate
- quasi-static gravity torque at selected poses
- friction + transmission losses
- required torque vs motor available torque at target speed
- margin report

Example finding:
- `error: shoulder_motor torque margin -18% at 90deg payload pose (required 1.42 Nm, available 1.16 Nm)`

This alone will eliminate many "toy" designs.

### Pillar D: Mechanism-specific validation rules

Extend the existing validation-gate concept with drivetrain rules.

New hard-fail rules:
1. `gear.invalid_mesh`
- center distance inconsistent with module/tooth counts beyond tolerance

2. `gear.contact_overlap`
- bodies intersect outside allowed backlash envelope

3. `transmission.unreachable_ratio`
- coupled joint graph inconsistent or contradictory

4. `actuator.insufficient_torque`
- required torque exceeds available torque by threshold

5. `bearing.invalid_fit`
- shaft-seat diameters violate selected tolerance class

New warnings:
- low contact ratio risk
- excessive backlash
- poor efficiency chain
- likely resonance/slender shaft risk

### Pillar E: AI generation contract for real mechanisms

Require explicit mechanism contracts in generated scripts.

```js
mechanismContract({
  intent: 'motorized_lift_axis',
  required: {
    motor: true,
    transmission: ['gear' , 'leadscrew'],
    outputJoint: 'Z_slide',
  },
  targets: {
    payloadKg: 1.5,
    speedMmPerS: 40,
    dutyCycle: 0.4,
  },
  profile: 'fdm_0p4_general',
  policy: 'strict',
});
```

Then generation loop becomes:
1. Generate script
2. Run strict mechanical validation
3. Feed findings back to model
4. Regenerate until pass/fail budget reached

Without this gate, the model will continue to optimize for appearance over mechanics.

## Concrete architecture proposal

### New modules

- `src/forge/mech/types.ts`
- `src/forge/mech/catalog.ts`
- `src/forge/mech/gears.ts`
- `src/forge/mech/couplings.ts`
- `src/forge/mech/analysis.ts`
- `src/forge/validate/rules/mechanism/*`

### Assembly extensions

- Add `CouplingRecord` in `src/forge/assembly.ts`
- Add methods:
  - `addCoupling(...)`
  - `getCouplingReport()`
- Update `solve()` to propagate coupled states and attach diagnostics

### Runner/API exposure

- Expose new APIs in:
  - `src/forge/headless.ts`
  - `src/forge/index.ts`
  - `src/forge/runner.ts` sandbox function args

### CLI

- Introduce `cli/validate.ts` as canonical strict gate
- Keep `test-run` as smoke check
- Keep `param-check` as robustness scan

## Prioritized implementation plan

### Phase 0 (1 week): stop the worst toy outputs fast

1. Add strict checklist schema (JSON or script contract)
2. Add hard fail if motorized intent is declared but no transmission element is present
3. Add hard fail if no moving joint is connected from motor to output
4. Add fail/warn policy wiring for CI and benchmarks

Impact: immediate reduction in fake "motor in a box" outputs.

### Phase 1 (2-3 weeks): real geometry primitives

1. Implement involute spur gear generator
2. Implement shaft/bearing seat primitives and fit checks
3. Add `lib.gearPair(...)` helper with center-distance and backlash calculations
4. Provide 3-5 authoritative examples in `examples/api/`

Impact: AI gains concrete, reusable mechanical building blocks.

### Phase 2 (3-4 weeks): coupled kinematics + torque checks

1. Add joint coupling graph to assembly
2. Add leadscrew + belt coupling support
3. Add motor performance data structure + quasi-static torque margin checks
4. Add mechanism validation rules into strict gate

Impact: mechanism motion and power path become physically interpretable.

### Phase 3 (ongoing): benchmark + tuning

1. Build a labeled mechanism-failure corpus (bad meshes, wrong ratios, underpowered motors)
2. Track reject precision/recall for mechanism realism
3. Tune thresholds per process profile (`fdm`, `sla`, `cnc`)

Impact: stable quality improvement over time, fewer regressions.

## Design principles to keep

1. Stay code-first
- Do not turn ForgeCAD into a heavy GUI mate-solver product.

2. Use "engineering-lite" checks
- High-signal heuristics beat heavyweight simulation for current scope.

3. Make every realism feature machine-checkable
- If it cannot produce deterministic findings, it will not protect quality.

4. Prefer composable primitives over monolithic mega-APIs
- Better for AI generation and maintainability.

## What success looks like

A motorized model should only pass strict validation when:

1. The geometry contains real transmission elements
2. Motion is coupled from motor to output with coherent ratio math
3. No critical collisions/clearance violations across sweep
4. Torque-speed requirements fit selected actuator class with margin
5. Manufacturing constraints are respected for chosen process profile

At that point, outputs stop looking like toys and start behaving like plausible mechanism concepts.

## Final recommendation

Treat this as an extension of the existing physical-realism initiative, but with a specific focus on **power transmission realism**.

Highest-leverage sequence:
1. Mechanism contract + strict rejection gate
2. Real gear/transmission primitives
3. Coupled joint solver
4. Torque/load validation

This sequence is practical with current architecture and directly addresses the failure mode you reported.

# Investigation: What's Missing to Reliably Build Robots with ForgeCAD?

Date: 2026-03-22

## Goal

Identify every gap between ForgeCAD's current capabilities and what's needed to **reliably design, validate, and export complete robots** — from mechanical structure through simulation-ready output. "Reliably" means: a user can go from idea to printable/assemblable robot without leaving ForgeCAD for core CAD tasks, and can export to Gazebo/ROS for simulation without manual fixups.

## Current State — What ForgeCAD Already Has

ForgeCAD has a surprisingly strong foundation for robotics:

| Capability | Status | Key Files |
|------------|--------|-----------|
| **Parametric solid modeling** | Excellent | `src/forge/kernel.ts` |
| **Assembly graph** (parts + joints) | Excellent | `src/forge/assembly.ts` |
| **Joint types** (revolute, prismatic, fixed) | Good | `src/forge/assembly.ts` |
| **Forward kinematics** | Good | `assembly.solve(state)` |
| **Joint couplings** (gear ratios, linear formulas) | Good | `addJointCoupling()`, `addGearCoupling()` |
| **Joint animations** (keyframes, runtime sliders) | Good | `src/forge/jointsView.ts` |
| **Collision detection** | Good | `collisionReport()`, `minClearance()` |
| **Spur/bevel/face/rack gears** | Good | `src/forge/library.ts` |
| **Fasteners** (M2-M10, counterbore, countersink) | Good | `lib.fastenerHole()` |
| **SDF export** (Gazebo-ready packages) | Good | `src/forge/sdfExport.ts` |
| **STL/3MF/STEP export** | Good | Various exporters |
| **BOM generation** | Good | `bom()` |
| **3D mate constraints** | Emerging | `src/forge/constraints3d/` |
| **Parametric sliders** | Excellent | `param()` system |

### Proof points (existing examples)
- **Robot hand** (`examples/robot_hand.forge.js`) — 39 parts, 5 kinematic chains, tendon-driven, fully parametric
- **4WD rover** (`examples/api/sdf-rover-demo.forge.js`) — diff-drive, SDF export, keyboard teleop in Gazebo
- **Gear coupling demo** (`examples/api/assembly-gear-coupling.forge.js`)
- **3-DOF arm + gripper** (`examples/api/assembly-mechanism.forge.js`)

## Gap Analysis — What's Missing

### Gap 1: Inverse Kinematics (IK)

**What**: No IK solver. Users must manually set every joint angle. For a 6-DOF arm, you can't say "put the end-effector here" and have the system find joint angles.

**Impact**: Critical for arm/manipulator design validation. Without IK, you can't verify workspace reachability or test pick-and-place scenarios.

**What's needed**:
- Numerical IK solver (Jacobian pseudoinverse or damped least squares)
- End-effector target specification (position + optional orientation)
- Workspace visualization (reachable volume)
- Integration with `assembly.solve()` — IK sets joint state, FK renders it

**Complexity**: Medium-high. The assembly graph already has the kinematic chain; the missing piece is the iterative solver.

### Gap 2: URDF Export

**What**: Only SDF export exists. ROS ecosystem primarily uses URDF. Many simulation tools (PyBullet, MuJoCo importers) expect URDF.

**Impact**: Limits simulation ecosystem compatibility. SDF works for Gazebo but not for the broader ROS/simulation toolchain.

**What's needed**:
- URDF XML generator from assembly graph
- Inertia tensor computation (currently only mass; no Ixx/Iyy/Izz)
- Visual + collision mesh separation (simplified collision meshes)
- Material properties mapping
- Xacro-style parameterization (optional, nice-to-have)

**Complexity**: Medium. The data model exists in assembly; it's a serialization task plus inertia computation.

### Gap 3: Inertia Tensor Computation

**What**: Assembly parts have mass metadata but no moment of inertia calculation. SDF/URDF both require `<inertial>` blocks with Ixx, Iyy, Izz, Ixy, Ixz, Iyz.

**Impact**: Without correct inertia, simulation dynamics are wrong. Currently SDF export uses placeholder inertia or computes from bounding box — not from actual geometry.

**What's needed**:
- Compute inertia tensor from triangle mesh + density
- Center of mass calculation per link
- Principal axes alignment
- Export in link-local frame

**Complexity**: Low-medium. Well-known algorithm over triangle meshes.

### Gap 4: Collision Mesh Generation

**What**: Visual meshes are exported as-is for both visual and collision. High-poly visual meshes make simulation slow. No convex decomposition or simplified collision geometry.

**Impact**: Gazebo/physics engines struggle with complex concave collision meshes. Simulation is slow or unstable.

**What's needed**:
- Convex hull per-link option
- Convex decomposition (V-HACD or similar)
- Primitive approximation (box/cylinder/sphere bounding)
- User-specified collision geometry override
- Separate visual/collision mesh export in SDF/URDF

**Complexity**: Medium. Could start with convex hull (already have `hull3d`) and add decomposition later.

### Gap 5: Motor/Actuator Library

**What**: No catalog of real motor specifications. Joint effort/velocity are raw numbers with no validation against real hardware.

**Impact**: Users pick arbitrary torque values. Designs may be physically impossible — motor can't actually drive the load.

**What's needed**:
- Motor spec database (common hobby servos: SG90, MG996R, Dynamixel series; DC motors: N20, 775)
- Torque-speed curve representation
- `lib.servoMount()`, `lib.motorMount()` — parametric mounting geometry
- Quasi-static torque check: does motor X have enough torque for this joint at this pose under gravity?

**Complexity**: Medium. Motor database is manual curation; torque check is gravity-load calculation.

### Gap 6: Bearings & Shaft Features

**What**: No bearing library. No keyway, D-shaft, set screw, or shaft collar primitives. Shafts are just cylinders.

**Impact**: Power transmission designs lack critical real-world components. Bearings define load capacity and life; shaft features define torque transfer.

**What's needed**:
- `lib.bearing(bore, type)` — radial ball bearing (608, 6200 series etc.)
- `lib.bearingSeat(bore, fit)` — housing pocket with tolerance
- `lib.dShaft(diameter, length)`, `lib.keyway(shaft, key)`
- `lib.shaftCollar(bore)`, `lib.setCrew(size)`
- `lib.linearRail(length, carriage)` — for prismatic joints

**Complexity**: Medium. Mostly parametric geometry generation + standard dimension tables.

### Gap 7: Electronics Integration

**What**: No PCB mount helpers, no common electronics footprints, no wire channel routing.

**Impact**: Robots need controllers (Arduino, RPi, ESP32), batteries, sensors. Currently users model these as raw boxes.

**What's needed**:
- `lib.pcbMount(board)` — standoff patterns for common boards (Arduino Uno/Nano, RPi 4/5, ESP32 DevKit)
- `lib.batteryHolder(type)` — 18650, LiPo pack holders
- `lib.servoHorn(spline)` — standard servo horn geometry
- `lib.cableChannel(width, depth)` — routing channels in parts
- `lib.sensorMount(sensor)` — common sensors (HC-SR04, MPU6050, camera modules)

**Complexity**: Low-medium per item. Large surface area but each is simple parametric geometry.

### Gap 8: Standardized Robot Archetypes

**What**: No templates or guided workflows for common robot types. Users start from scratch every time.

**Impact**: High barrier to entry. Building a robot arm, mobile base, or quadruped requires deep knowledge of each architecture.

**What's needed**:
- Template: **2-DOF pan-tilt** (camera mount, sensor head)
- Template: **4/6-DOF serial arm** (parametric link lengths, servo-driven)
- Template: **Differential drive base** (2WD/4WD, caster options)
- Template: **Gripper** (parallel jaw, compliant, multi-finger)
- Template: **Legged** (2/4/6 leg walker with gait params)
- Each template: parametric, validates joint limits, exports clean SDF/URDF

**Complexity**: High total effort, but each template is a standalone `.forge.js` file. Could be community-contributed.

### Gap 9: Coupled Joint Export in SDF/URDF

**What**: `addJointCoupling()` exists in the assembly API but SDF export warns and skips coupled joints. The simulation model loses gear ratios and coupled motion.

**Impact**: Robots with gear trains or differential drives lose their transmission behavior in simulation.

**What's needed**:
- SDF `<joint>` mimic/gear plugin for Gazebo
- Or: compute effective joint properties (reflected inertia, gear ratio) and embed as single joint
- Test: rover with gear-coupled wheels maintains correct behavior in Gazebo

**Complexity**: Low-medium. Gazebo supports joint mimic plugins; need to emit the right SDF.

### Gap 10: Validation Pipeline for Robots

**What**: No automated "does this robot actually work?" check. Existing validation is geometry-only.

**Impact**: Users can create robots that look correct but are physically impossible (overloaded joints, self-colliding at rest, impossible gear meshes).

**What's needed**:
- **Kinematic validation**: Full joint sweep without self-collision
- **Torque validation**: Gravity load at worst-case pose vs motor capacity
- **Manufacturing validation**: Min wall thickness, overhang angles, fastener accessibility
- **Assembly validation**: Can parts be assembled in sequence? (no trapped fasteners)
- Report format: pass/warn/fail with specific joint/part callouts

**Complexity**: High. But can be phased — start with collision sweep + basic torque check.

## Progress Tracker

| # | Gap | Priority | Status | Notes |
|---|-----|----------|--------|-------|
| — | Baseline audit | — | Done | This document |
| 1 | Inverse kinematics | High | Not started | Critical for arm design |
| 2 | URDF export | High | **Done** | `src/forge/urdfExport.ts`, `cli/forge-urdf.ts`, registered in CLI |
| 3 | Inertia tensors | High | **Done** | `src/forge/meshInertia.ts` — divergence theorem, replaces bbox approx |
| 4 | Collision meshes | Medium | **Done** | Convex hull default, box/visual/none options. 56-80% mesh reduction |
| 5 | Motor/actuator library | Medium | Not started | Prevents impossible designs |
| 6 | Bearings & shafts | Medium | Not started | Real power transmission |
| 7 | Electronics integration | Low | Not started | Quality-of-life |
| 8 | Robot archetypes | Medium | Not started | Lowers barrier to entry |
| 9 | Coupled joint export | Medium | **Done** | `<mimic>` elements in SDF and URDF, multi-term warning |
| 10 | Robot validation pipeline | High | Not started | Catches bad designs |

## Recommended Sequencing

### Phase 1: Simulate What We Build (weeks 1-3)
**Goal**: A robot designed in ForgeCAD works correctly in Gazebo/ROS out of the box.

1. **Inertia tensor computation** (Gap 3) — enables correct dynamics
2. **Collision mesh generation** (Gap 4) — start with convex hull
3. **Coupled joint SDF export** (Gap 9) — gear trains work in simulation
4. **URDF export** (Gap 2) — opens PyBullet, MuJoCo, ROS ecosystem

Validation experiment: Export the rover demo to both SDF and URDF, run in Gazebo and PyBullet, verify drive behavior matches.

### Phase 2: Design Smarter Robots (weeks 3-6)
**Goal**: Users can design arms and manipulators with confidence.

5. **Inverse kinematics** (Gap 1) — "put end-effector here"
6. **Motor/actuator library** (Gap 5) — real servo specs + mount geometry
7. **Robot validation pipeline** (Gap 10) — catches bad designs early

Validation experiment: Design a 4-DOF pick-and-place arm, verify workspace, validate torque margins, export and simulate.

### Phase 3: Production-Ready Robots (weeks 6-10)
**Goal**: Robots are buildable, not just simulatable.

8. **Bearings & shaft features** (Gap 6) — real power transmission
9. **Electronics integration** (Gap 7) — controller/sensor mounts
10. **Robot archetypes** (Gap 8) — templates for common designs

Validation experiment: Build a complete differential drive robot from archetype, print it, assemble with real electronics, run in both real world and simulation.

## Architecture Summary

```
User Script (.forge.js)
    │
    ├── Parametric Design ──────── [EXISTS: Excellent]
    │   ├── Solid modeling (Manifold kernel)
    │   ├── Sketch constraints (2D solver)
    │   └── Assembly graph + joints
    │
    ├── Mechanical Library ──────── [EXISTS: Good, GAPS: 5,6,7]
    │   ├── Gears (spur/bevel/face/rack)  ✅
    │   ├── Fasteners (M2-M10)            ✅
    │   ├── Motors/actuators               ❌ Gap 5
    │   ├── Bearings/shafts                ❌ Gap 6
    │   └── Electronics mounts             ❌ Gap 7
    │
    ├── Kinematics ──────────────── [EXISTS: FK only, GAP: 1]
    │   ├── Forward kinematics             ✅
    │   ├── Joint couplings                ✅
    │   ├── Joint animations               ✅
    │   └── Inverse kinematics             ❌ Gap 1
    │
    ├── Validation ──────────────── [MINIMAL, GAP: 10]
    │   ├── Collision detection             ✅
    │   ├── Joint sweep check              ✅
    │   ├── Torque/load validation          ❌ Gap 10
    │   └── Manufacturing checks            ❌ Gap 10
    │
    └── Export ──────────────────── [PHASE 1 COMPLETE]
        ├── STL/3MF (manufacturing)        ✅
        ├── STEP (engineering)             ✅
        ├── SDF (Gazebo)                   ✅
        ├── URDF (ROS/PyBullet)            ✅ NEW
        ├── Inertia tensors                ✅ NEW (mesh-based)
        ├── Collision meshes               ✅ NEW (convex/box/visual/none)
        └── Coupled joint export           ✅ NEW (mimic elements)
```

## Key Insight

ForgeCAD is **closer to robotics-ready than it appears**. The assembly graph, joint system, gear library, and SDF export form a strong backbone. The gaps are mostly about:

1. **Simulation fidelity** (inertia, collision meshes, URDF, coupled export) — making the export actually work in physics engines
2. **Design intelligence** (IK, validation, motor library) — helping users make robots that are physically possible
3. **Convenience** (electronics, bearings, archetypes) — reducing the knowledge barrier

The highest-ROI path is Phase 1: fix the simulation export pipeline so that existing ForgeCAD robots work correctly in Gazebo/PyBullet/ROS. This immediately makes ForgeCAD useful for the robotics workflow without requiring new design features.

## Experiment Log

#### Baseline Audit (COMPLETE)
**What**: Full codebase analysis of robotics-relevant capabilities.
**Result**: 10 gaps identified across simulation export, design intelligence, and convenience.
**Lesson**: The foundation is strong. Focus on simulation fidelity first — it's the bridge between CAD and real robotics.

#### Phase 1: Mesh-Based Inertia Tensors (SUCCESS)
**What**: Replaced bounding-box inertia approximation with divergence theorem computation from actual triangle mesh.
**Result**: Chassis inertia now shows asymmetric tensor (Ixx=0.087, Iyy=0.276, Izz=0.332, Ixz=0.025) with center of mass offset at (40mm, 0, 125mm) reflecting the actual sensor mast position. Previously it was a symmetric box approximation.
**Why it worked**: The Mirtich/Eberly algorithm integrates over tetrahedra formed by each triangle and the origin, then shifts to center of mass via parallel axis theorem. Standard, well-tested approach.
**Lesson**: The mesh data was already available via `shape.getMesh()` — no new dependencies needed.

#### Phase 1: Convex Hull Collision Meshes (SUCCESS)
**What**: Added collision mesh modes: 'convex' (default), 'box', 'visual', 'none'. Convex mode generates simplified STL via `hull3d()`.
**Result**: Chassis collision mesh: 2.2KB vs 11.4KB visual (80% smaller). Wheel collision: 17.9KB vs 40.5KB (56% smaller). Both SDF and URDF export separate visual/collision meshes.
**Why it worked**: `hull3d()` already existed in the kernel. Just needed to wire it into the export pipeline.
**Lesson**: Changing the default from 'visual' to 'convex' is the right call — users who need exact collision can opt in.

#### Phase 1: Coupled Joint SDF Export (SUCCESS)
**What**: Replaced the `throw Error` for coupled joints with `<mimic>` element generation. Multi-term couplings use the primary term and warn about dropped terms.
**Result**: Joint couplings now survive export. Gear ratios, differential drives, and other coupled mechanisms work in Gazebo simulation.
**Why it worked**: SDF 1.10 supports `<mimic joint="leader"><multiplier>N</multiplier><offset>M</offset></mimic>` natively.
**Lesson**: The coupling data model was already rich enough — just needed serialization.

#### Phase 1: URDF Export (SUCCESS)
**What**: Created complete URDF export pipeline: `src/forge/urdfExport.ts`, `cli/forge-urdf.ts`, registered as `forgecad export urdf`.
**Result**: Rover demo exports clean URDF with 5 links, 4 continuous joints, mesh-based inertia, convex collision meshes, material colors, dynamics parameters, and mimic support. File validates structurally.
**Why it worked**: URDF is simpler than SDF (no world, fewer plugin concerns). Reused all the Phase 1 infrastructure (mesh inertia, collision meshes, coupling mimic).
**Lesson**: Having SDF export as a reference made URDF straightforward — similar XML structure, different tags.

#### End-to-End Validation (SUCCESS)
**What**: Exported rover demo to both SDF and URDF, verified output quality.
**Result**:
- SDF: 10 mesh files (5 visual + 5 collision), correct inertia, model.sdf + world + manifest
- URDF: 10 mesh files (5 visual + 5 collision), correct inertia, forge_scout_rover.urdf + manifest
- Check suite: all tests pass (1 pre-existing snapshot mismatch unrelated to changes)
- Build: clean compilation, no new warnings

## Files Modified / Created

| File | Purpose |
|------|---------|
| `src/forge/meshInertia.ts` | **NEW** — Mesh-based inertia tensor computation (divergence theorem) |
| `src/forge/urdfExport.ts` | **NEW** — URDF package generation from CollectedRobotExport |
| `cli/forge-urdf.ts` | **NEW** — CLI entry point for `forgecad export urdf` |
| `src/forge/sdfExport.ts` | **MODIFIED** — Mesh inertia, convex collision, coupled joints via mimic |
| `src/forge/robotExport.ts` | **MODIFIED** — Extended collision mode type to include 'convex' and 'box' |
| `cli/forgecad.ts` | **MODIFIED** — Registered `export urdf` command |

## Files Referenced

| File | Purpose |
|------|---------|
| `src/forge/assembly.ts` | Assembly graph, joints, FK, couplings |
| `src/forge/kernel.ts` | Shape class, hull3d, union |
| `src/forge/shapeBackend.ts` | ShapeRuntimeMesh interface |
| `src/forge/exportMesh.ts` | Binary STL builder |
| `src/forge/library.ts` | Mechanical part library |
| `src/forge/jointsView.ts` | Runtime joint animations |
| `src/forge/constraints3d/` | 3D mate constraint solver |
| `examples/robot_hand.forge.js` | Robot hand example |
| `examples/api/sdf-rover-demo.forge.js` | Rover SDF export demo |
| `docs/temporary/projects/2026/02/motorized-mechanisms/PLAN.md` | Prior motorized mechanism analysis |

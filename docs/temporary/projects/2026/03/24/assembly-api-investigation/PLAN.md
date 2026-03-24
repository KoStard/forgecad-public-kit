# Assembly API Investigation

## Goal & Current State

**Goal**: Identify the real reason multi-part robot/mechanism assemblies keep becoming visually and mechanically wrong, even when individual parts are acceptable. Determine what the missing abstraction is, what the public API should be, and what validations/docs are missing.

**Scope**:
- Current failing case: `/Users/kostard/Projects/CAD/PersonalForgeCADProjects/2026/03/24/robot_arm/assembly.forge.js`
- Current ForgeCAD assembly API, placement-reference API, runtime `jointsView()` API, and hidden/internal mate solver path

**Baseline**:
- The robot arm assembly solves without throwing, but the solved scene is mechanically wrong.
- `forgecad run /Users/kostard/Projects/CAD/PersonalForgeCADProjects/2026/03/24/robot_arm/assembly.forge.js`
  - `9` objects returned
  - `6` collision pairs reported in the rest pose
  - `6` joints declared in `assembly(...)`
  - `6` joints re-declared manually in `jointsView(...)`
  - `7` component files define placement-reference points, but the assembly graph consumes `0` of them

## Architecture Summary

Today ForgeCAD assembly authoring is split across four disconnected systems:

1. **Part-local geometry**
   - Each part file defines its own origin/orientation however it wants.
   - Parts may optionally attach placement references (`points`, `edges`, `surfaces`, `objects`).

2. **Assembly graph**
   - `assembly().addRevolute/addFixed/...` expects manual `frame` and `axis`.
   - The solver only checks graph structure and numeric transforms, not whether interfaces physically align.

3. **Viewport/runtime articulation**
   - `jointsView()` is a separate API with separate joint definitions.
   - It expects rest-pose world pivots or parent-chain-local pivots, so the author must restate kinematics in another coordinate system.

4. **Hidden/internal semantic mating path**
   - `Assembly.mate(...)` and `constraints3d/*` exist in runtime code.
   - That path is not documented in the public docs and is not present in `src/forge/forge-api.d.ts`.
   - The normal `importPart()` path unwraps `TrackedShape` to `Shape`, so the topology required by the hidden mate solver is not preserved as a first-class assembly workflow.

The consequence is that the user is forced to assemble from raw transforms, while the system already contains fragments of a semantic assembly model that are not connected into a usable product.

## Progress Tracker

| # | Change | Manual Numeric Joint Definitions | Rest-Pose Collision Pairs | Semantic Connectors Consumed | Status |
|---|--------|----------------------------------|----------------------------|------------------------------|--------|
| — | Baseline robot-arm audit | 12 | 6 | 0 / 13 point refs | ✅ Baseline captured |
| P1 | Audit actual robot-arm interfaces | 12 | 6 | 0 / 13 point refs | ✅ Found feature mismatches and bad/weak references |
| P2 | Audit public API vs hidden capabilities | 12 | 6 | 0 / 13 point refs | ✅ Found fragmented, incomplete semantic path |
| P3 | Audit assembly/runtime duplication | 12 | 6 | 0 / 13 point refs | ✅ Found concrete duplication bug and structural drift risk |
| P4 | Audit reportability / diagnostics gap | 12 | 6 | 0 / 13 point refs | ✅ Root cause identified: no first-class expected joint interface model |
| P5 | Implement port + connect + toJointsView API | 0 (with ports) | — | ports consumed | ✅ Core API implemented |

## Experiment Log

#### Baseline Robot-Arm Audit (SUCCESS)
**What**: Ran the current assembly headlessly with `forgecad run` and read the assembly and part source files.

**Result**:
- The assembly solves and returns 9 objects.
- The rest pose reports 6 collision pairs:
  - `Shoulder Bracket ∩ Lower Arm`
  - `Lower Arm ∩ Upper Arm`
  - `Upper Arm ∩ Wrist Bracket`
  - `Wrist Bracket ∩ Wrist Rotator`
  - `Wrist Bracket ∩ Gripper.Body`
  - `Wrist Rotator ∩ Gripper.Body`
- The script hard-codes 6 joints in `assembly(...)` and redefines the same 6 joints in `jointsView(...)`.

**Why it worked/failed**: This proved the current failure is not just "looks odd in the viewport". The assembly is numerically valid enough to solve, but the physical interfaces are wrong.

**Lesson**: ForgeCAD currently makes it easy to create a kinematic tree that is internally consistent as math, while still being physically nonsensical as a mechanism.

#### P1. Audit Actual Robot-Arm Interfaces (SUCCESS)
**What**: Compared the local feature conventions in each part file against the joint axes/frames used in the top-level assembly.

**Result**:
- The robot-arm parts already define semantic placement points, but those refs are incomplete and unused by the assembly.
- Two major axis mismatches exist in the actual component geometry:
  - `shoulder-bracket.forge.js` pivot bores are along **X**, while `lower-arm.forge.js` pivot bores are along **Y**
  - `wrist-bracket.forge.js` pivot bores are along **X**, while `upper-arm.forge.js` pivot bores are along **Y**
- Several references are too weak or likely incorrect for true assembly:
  - `wrist-bracket.forge.js` exposes `wristPivot: [0, 0, 0]`, but the actual pivot bore is at `z = pivotY`
  - `gripper.forge.js` exposes `mountCenter: [0, 0, 0]`, but the mounting flange interface is offset behind the body
- Most parts expose only **points**, not a usable joint interface definition (origin + axis + zero-angle orientation).

**Why it worked/failed**: The component authoring has real inconsistencies, but the deeper issue is that the API gives no first-class place to declare or verify connection semantics. The only thing available is ad hoc local coordinates and optional point refs.

**Lesson**: A point is not a joint interface. For mechanisms, the missing primitive is a **port/frame**, not another `translate(...)`.

#### P2. Audit Public API vs Hidden Capabilities (SUCCESS)
**What**: Read the public docs/types for `assembly`, `importPart`, placement references, and runtime `jointsView`, then compared them with `src/forge/assembly/assembly.ts` and `src/forge/constraints3d/*`.

**Result**:
- Publicly documented assembly authoring is frame-first:
  - `addJoint(name, type, parent, child, { frame, axis, ... })`
- Public placement references support `points`, `edges`, `surfaces`, `objects`, but user-facing placement operations resolve mainly to point placement, not semantic joint definition.
- Runtime contains an undocumented `Assembly.mate(...)` path backed by `MateBuilder` and the 3D constraint solver.
- `importPart()` explicitly unwraps `TrackedShape` to `Shape`, so the normal multi-file part workflow drops the tracked topology that the hidden mate path wants.
- The hidden mate path is therefore not a real end-to-end authoring path for typical multi-file assemblies.

**Why it worked/failed**: This explains why the same class of failure keeps recurring. ForgeCAD already contains ingredients for semantic assembly, but they do not form a coherent public workflow.

**Lesson**: The real product gap is not "we need better examples". The gap is that the system has **no single first-class semantic assembly model** spanning part authoring, import, solving, validation, and runtime animation.

#### P3. Audit Assembly/Runtime Duplication (SUCCESS)
**What**: Compared the assembly graph in `robot_arm/assembly.forge.js` with the separate `jointsView(...)` declaration in the same file.

**Result**:
- All 6 joints are duplicated manually.
- The docs explicitly require the user to derive `jointsView` pivots from the assembly rest pose.
- One concrete bug exists in the duplicated runtime data:
  - `J2 Shoulder Pitch` has `pivot: [0, 0, 65]` and `default: 65`, clearly conflating pivot height with default angle.
- The runtime API forces authors to restate the same kinematic intent in a second coordinate system.

**Why it worked/failed**: This is an API design problem, not just author error. If the same joint must be typed twice in two representations, drift is guaranteed.

**Lesson**: Animation/runtime articulation must derive from the assembly graph, not from another hand-authored mirror structure.

#### P4. Audit Reportability / Diagnostics Gap (SUCCESS)
**What**: Compared the current assembly/CLI diagnostics against the kind of report needed to tell whether a joint is geometrically real.

**Result**:
- Current assembly diagnostics are limited to:
  - `warnings()`
  - `collisionReport()`
  - `minClearance(...)`
  - `sweepJoint(...)`
- `forgecad run` adds generic object bbox output and coarse spatial/collision analysis.
- `jointsView(...)` validates only schema correctness (types, finite numbers, duplicate names, coupling consistency), not geometric truth.
- There is no API that stores or reports:
  - expected joint centerline
  - expected interface surfaces/bore axes
  - parent/child axis mismatch angle
  - radial offset between declared joint axis and actual interface geometry
  - zero-angle frame mismatch
  - confidence that the declared joint corresponds to any real feature at all

**Why it worked/failed**: A good report is not impossible. It is currently impossible to generate a *trustworthy* one from the public assembly model because the model does not encode the expected interface semantics. The runtime only knows "joint axis + frame numbers", not "this axis should coincide with these bores / faces / ports".

**Lesson**: ForgeCAD needs a semantic assembly audit layer, not just prettier overlays. Text reports are blocked by missing model truth, not by missing rendering.

## Findings

### The real problem

The recurring problem is **not** primarily that users are bad at choosing numbers. The real problem is that ForgeCAD assembly authoring is built around **raw transforms**, while real mechanism assembly needs **typed interfaces**.

The system currently asks the user to manually bridge these layers:
- part-local geometry convention
- connection semantics
- kinematic graph
- runtime articulation
- collision/clearance validation

Those layers should be connected by the API itself. Today they are not.

### What is missing

1. **First-class joint ports / mate frames**
   - A mechanism part needs named interfaces like:
     - origin
     - primary axis
     - zero-angle orientation / secondary axis ("up" or reference direction)
     - joint kind (`revolute`, `prismatic`, `fixed`, `bolt`, etc.)
     - optional limits and metadata
   - Current point refs are too weak; surface/edge refs are still too low-level.

2. **Assembly by connecting ports, not by retyping transforms**
   - The user should not have to manually write `frame: Transform.identity().translate(...)` for every joint.
   - The system should allow "connect child port to parent port with this joint".

3. **A single source of truth for kinematics**
   - `jointsView()` should be derivable from the assembly graph.
   - The assembly graph should own joint names, axes, limits, defaults, and rest-pose pivots.

4. **Semantic validation**
   - On connection, ForgeCAD should validate:
     - port kinds compatible
     - axes aligned/opposed as required
     - zero-angle frames defined
     - resulting parts actually touch/clear where expected
   - Today the user can get a solved scene with gross misalignment and only discover it visually or via collision output after the fact.

5. **Import pipeline that preserves assembly semantics**
   - If semantic assembly uses tracked topology or ports, imports must preserve the required data.
   - `importPart()` dropping tracked topology is incompatible with a topology-based mate workflow.

6. **A documented public semantic assembly surface**
   - Hidden runtime capabilities do not help users if they are absent from docs, types, and examples.

7. **A first-class diagnostics/reporting model**
   - The assembly system needs explicit "expected interface truth" so it can emit deterministic textual reports.
   - Without that, the best it can do is report collisions after the fact.

## What The API Should Be

### Core idea

Every part or subassembly should declare **ports**. An assembly should connect ports. Animation/runtime should derive from those connections.

### Example shape-level API

```javascript
const lowerArm = importPart("./lower-arm.forge.js");

// In the part file:
return arm.withPorts({
  shoulder: port.revolute({
    origin: [0, 0, 0],
    axis: [0, 1, 0],
    up: [0, 0, 1],
    role: "parent-or-child",
  }),
  elbow: port.revolute({
    origin: [150, 0, 0],
    axis: [0, 1, 0],
    up: [0, 0, 1],
  }),
});
```

### Example assembly API

```javascript
const robot = assembly("Robot Arm")
  .addPart("Base", importPart("./base.forge.js"))
  .addPart("Shoulder", importPart("./shoulder-bracket.forge.js"))
  .addPart("Lower Arm", importPart("./lower-arm.forge.js"))
  .connect("Base.turntable", "Shoulder.base", {
    as: "J1",
    type: "revolute",
    limits: [-180, 180],
  })
  .connect("Shoulder.pitch", "Lower Arm.shoulder", {
    as: "J2",
    type: "revolute",
    limits: [-30, 150],
  });
```

### What `connect(...)` should do

- Align the two port origins
- Align or oppose the two port axes according to joint kind
- Use the port `up` vectors to define zero-angle orientation
- Create the internal joint transform automatically
- Reject impossible or ambiguous connections
- Produce the runtime articulation metadata automatically

### Derived runtime API

```javascript
const solved = robot.solveRest();

robot.runtimeJoints({
  defaults: { J2: 65, J3: -75, J4: 15 },
  animations: [
    { name: "Pick and Place", duration: 6, keyframes: [...] },
  ],
});

return solved.toScene();
```

No separate manual `jointsView({ joints: [...] })` should be required for standard assembly-driven mechanisms.

### Validation API

```javascript
const report = robot.validateAssembly();

report.errors();
// - port axis mismatch: Shoulder.pitch axis is X, Lower Arm.shoulder axis is Y
// - port reference mismatch: WristBracket.wristPivot origin does not lie on declared pivot bore
// - collision at rest: Upper Arm vs Wrist Bracket
```

This needs to be a first-class authoring tool, not an afterthought.

### Debug / audit report API

```javascript
const audit = robot.audit({
  pose: "rest",
  checks: ["joint-interfaces", "collisions", "clearances", "range-sweep"],
});

console.log(audit.toMarkdown());
return audit.toData();
```

### What the text report should say

For each joint:

- declared joint type
- parent port and child port
- expected origin
- expected axis
- expected zero-angle orientation
- inferred actual parent interface axis/origin
- inferred actual child interface axis/origin
- axis mismatch angle
- radial center offset
- along-axis offset
- signed face-to-face gap / overlap near the interface
- confidence score
- machine-readable verdict: `ok | suspicious | invalid`

Example:

```text
J2 Shoulder Pitch  INVALID
  declared axis:          [0, -1, 0]
  inferred parent axis:   [1,  0, 0]   (from shoulder bracket pivot bores)
  inferred child axis:    [0, -1, 0]   (from lower arm pivot bores)
  parent-child axis gap:  90.0°
  center radial offset:   0.0 mm
  center axial offset:    0.0 mm
  overlap near joint:     7567.8 mm³
  diagnosis: parent interface is built on X but joint is authored on Y
```

This is the level at which a human can fix the model without rotating it manually.

### Code, text, image hierarchy

ForgeCAD should represent geometric insight in this order:

1. **Code-level truth**
   - ports / mate frames / interface declarations
   - validation rules
   - machine-readable audit output

2. **Text reports**
   - one-line verdict per joint
   - ranked problems
   - numeric mismatch metrics
   - suggested likely cause

3. **Images only as fallback**
   - annotated snapshots
   - isolated interface closeups
   - cutaway/section through the suspect joint
   - axis overlays and labels

If the report requires manually orbiting the model to discover the issue, the assembly model is still too implicit.

## Recommendation

### Product direction

ForgeCAD should standardize on:
- **ports / mate frames** as the assembly abstraction
- **connect(...)** as the main authoring verb
- **derived runtime joints** instead of duplicated `jointsView` declarations
- **validation reports** at connection time and rest pose
- **assembly audits** as text-first debugging output, with optional visual attachments

### Migration strategy

1. Add ports as a first-class reference kind
   - Not just `points/edges/surfaces/objects`
   - Add `frames` or `ports`

2. Make `assembly.connect(...)` consume ports
   - Build current `frame + axis` internals from port data

3. Add `assembly.toJointsView()` or built-in runtime derivation
   - Eliminate manual joint duplication

4. Either:
   - expose/document the existing mate solver properly and adapt imports to preserve needed data, or
   - keep it internal and build the public port model on top of simpler explicit port metadata

5. Add assembly validation commands/examples
   - especially for AI-authored multi-file mechanisms

6. Add a dedicated CLI:
   - `forgecad debug assembly <file>`
   - emits Markdown + JSON
   - optional annotated PNG/PDF attachments for failing joints only

## Implementation (Phase 1)

The first phase of the recommended API has been implemented:

### New files
| File | Purpose |
|------|---------|
| `src/forge/port.ts` | PortDef, PortInput, PortMap types; `port()` factory with `.revolute()`, `.prismatic()`, `.fixed()`; `computeConnectFrame()` math; transform/clone/normalize helpers |

### Modified files
| File | Changes |
|------|---------|
| `src/forge/kernel.ts` | WeakMap `_shapePorts` for port storage on Shape; `withPorts()`, `portNames()` methods; port copy/transform/merge in `withCopiedDimensions`, `withTransformedDimensions`, `withMergedDimensions`, `withBaseDimensions` |
| `src/forge/group.ts` | WeakMap `_groupPorts` for port storage on ShapeGroup; `withPorts()`, `portNames()` methods; port copy/transform in mapChildren helpers |
| `src/forge/sketch/topology.ts` | `withPorts()`, `portNames()` on TrackedShape (delegates to underlying Shape) |
| `src/forge/assembly.ts` | `ConnectOptions`, `ToJointsViewOptions` interfaces; `_portsByPart` storage; port capture in `addPart()`; `withPorts()`, `getPorts()`, `getPort()` methods; `connect()` method with frame computation; `toJointsView()` method; port forwarding in `mergeInto()` |
| `src/forge/runner.ts` | `port` added to sandbox (user-accessible global) |
| `src/forge/forge-public-api.ts` | Exports for `port`, `PortInput`, `PortDef`, `PortMap`, `ConnectOptions`, `ToJointsViewOptions` |
| `src/forge/forge-api.d.ts` | Type declarations for all new APIs on Shape, TrackedShape, ShapeGroup, Assembly, ImportedAssembly |

### What's implemented
1. **`port()` factory** — `port.revolute({ origin, axis, up? })` declares a typed assembly port
2. **`.withPorts()`** — attaches ports to Shape, TrackedShape, ShapeGroup, and Assembly parts; ports survive transforms
3. **`assembly.connect("Base.top", "Arm.shoulder", { as: "J1" })`** — computes joint frame + axis from port alignment automatically
4. **`assembly.toJointsView()`** — derives `jointsView()` configuration from the assembly joint graph (world-space pivots, axes)
5. **Port forwarding** — ports captured from shapes in `addPart()`, forwarded through `mergeInto()` with prefix

### What's NOT yet implemented (future phases)
- Semantic validation (port kind compatibility checks, axis alignment warnings)
- Assembly audit/report API
- `forgecad debug assembly <file>` CLI command
- Assembly-level port export for sub-assembly composition

## Files Modified

| File | Purpose |
|------|---------|
| `docs/temporary/projects/2026/03/24/assembly-api-investigation/PLAN.md` | Investigation log, baseline, findings, proposed API direction, and implementation record |

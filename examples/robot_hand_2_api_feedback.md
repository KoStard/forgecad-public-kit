# ForgeCAD API Feedback After Building `robot_hand_2`

## Joys
- `attachTo`, `onFace`, and `pointAlong` create a readable assembly language for mechanical CAD.
- Immutable chainable geometry made it safe to iterate quickly without accidental mutation bugs.
- Returning named/grouped scene objects is excellent for debugging complex mechanisms.
- `param()` ergonomics are very good for exposing robot-joint controls and tuning print tolerances.
- `cutPlane()` is a strong inspection primitive for internal mechanics.

## Frustrations
- No native matrix/transform composition API made multi-joint kinematics verbose and error-prone.
- No direct constraint/joint graph for 3D assemblies (revolute/prismatic with hard limits and parent-child transforms).
- No robust per-part materials/opacity system for showing internals without manual object splitting.
- No manufacturing metadata path (part IDs, print orientation hints, tolerances, BOM annotations).
- No collision/interference checking or swept-volume checks for moving mechanisms.
- No direct helper for reusable hole/fastener standards (e.g., ISO clearance/tap/counterbore presets with fit classes).
- No native cable/tendon/chain routing tools for mechatronics assemblies.

## Missing Mental Model
ForgeCAD needs an explicit **Assembly + Mechanism** mental model alongside raw CSG:
- Part (manufacturable item)
- Feature (holes, bosses, slots)
- Joint (revolute/prismatic/ball)
- Motion state (joint params + limits)
- Validation (collisions, clearances, overtravel)
- Output (BOM + print/manufacturing views)

Without this, complex projects become manual transform bookkeeping instead of structured mechanism design.

## Task Backlog (Actionable)
1. Add `Transform` primitives:
- `Transform.identity()`, `.translate()`, `.rotateAxis()`, `.mul()`
- `shape.transform(T)` and `group.transform(T)`
- Point/vector transform helpers

2. Add assembly graph API:
- `assembly()` container with named parts
- `addPart(name, shape)`
- `addJoint(name, type, parent, child, opts)` with limits and default state
- `solveAssembly(params)` to compute all child transforms

3. Add mechanism validation:
- Interference detection between moving parts
- Param-sweep collision report
- Min clearance report between selected part sets

4. Add manufacturing metadata:
- Per-part metadata (`material`, `process`, `tolerance`, `qty`, `notes`)
- Export BOM as JSON/CSV
- Optional print orientation and support-risk hints

5. Add fastener standards module:
- `lib.fastenerHole({ standard, size, fit, depth, counterbore/countersink })`
- Presets for common metric screw/nut patterns

6. Add motion trace utilities:
- Joint trajectory/sweep preview
- Reach envelope generation for articulated arms
- End-effector frame visualization helper

7. Add internal-structure visualization tools:
- Built-in transparent material mode by group
- Section-hatch rendering for cut planes
- Exploded-view helper by assembly tree depth

8. Add routing primitives for robotics:
- Flexible cable/tendon path with bend-radius constraints
- Drag-chain generator
- Tube/hose clips and mount features

9. Add robust pattern/feature APIs for manufacturability:
- Feature arrays tied to reference faces/edges (not only global transforms)
- Parametric hole series and slot series with auto margins

10. Add simulation-lite hooks:
- Mass/inertia estimate from density
- Basic torque estimate at joints under gravity for chosen pose
- Warning when estimated torque exceeds actuator class

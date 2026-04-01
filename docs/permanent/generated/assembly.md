# Assembly API

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

Kinematic assemblies, joints, couplings, and robot export.

## Functions

### Assembly & Joints

Build kinematic assemblies with joints and couplings.

#### `bomToCsv()`

```ts
bomToCsv(rows: BomRow[]): string
```

Convert BOM rows from a solved assembly into a CSV string.

<details><summary><code>BomRow</code></summary>

```ts
interface BomRow {
  part: string;
  qty: number;
  material?: string;
  process?: string;
  tolerance?: string;
  notes?: string;
  metadata?: PartMetadata;
}
```

</details>

<details><summary><code>PartMetadata</code></summary>

```ts
interface PartMetadata {
  material?: string;
  process?: string;
  tolerance?: string;
  qty?: number;
  notes?: string;
  densityKgM3?: number;
  massKg?: number;
}
```

</details>

#### `assembly()`

```ts
assembly(name?: string): Assembly
```

Create an assembly container with named parts and joints for kinematic mechanisms. Build with addPart(), addJoint(), addJointCoupling(), addGearCoupling(), then solve() to get positioned parts. Supports revolute, prismatic, and fixed joint types.

#### `joint()`

```ts
joint(name: string, shape: Shape, pivot: [ number, number, number ], opts?: RevoluteJointOpts): Shape
```

Create a revolute (hinge) joint. Auto-creates a param slider and rotates the shape.

<details><summary><code>RevoluteJointOpts</code></summary>

```ts
interface RevoluteJointOpts {
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
  reverse?: boolean;
}
```

</details>

---

## Classes

### `Assembly`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

- `mate()` — Register mate constraints between parts. Constraints are solved during `solve()` to derive part positions and explode hints. Part references use "partName:featureName" format.
- `withReferences()` — Attach named placement reference points to this assembly. These are surfaced automatically on the ImportedAssembly when this file is imported via require(), so consumers can use placeReference() without re-declaring them. Returns `this` for chaining.
- `getReferences()` — getReferences(): PlacementReferences
- `withPorts()` — Attach named ports to a specific part or the assembly root. Ports declared this way are in the part's local coordinate system.
- `getPorts()` — Get ports declared on a part (in part-local space).
- `getAllPorts()` — getAllPorts(): Map<string, PortMap>
- `getPort()` — Parse a "PartName.portName" reference and return the resolved port. Throws descriptive errors if the part or port doesn't exist.
- `addFrame()` — Add a virtual reference frame (no geometry) to the assembly graph.
- `addPart()` — addPart(name: string, part: AssemblyPart, options?: PartOptions): Assembly
- `addJoint()` — addJoint(name: string, type: JointType, parent: string, child: string, options?:
- `addRevolute()` — addRevolute(name: string, parent: string, child: string, options?: JointOptions)
- `addPrismatic()` — addPrismatic(name: string, parent: string, child: string, options?: JointOptions
- `addFixed()` — addFixed(name: string, parent: string, child: string, options?: JointOptions): A
- `connect()` — Connect two parts by aligning their declared ports. `parentPortRef` and `childPortRef` use "PartName.portName" format. The system computes the joint frame and axis automatically from port alignment. ```javascript const mech = assembly("Arm") .addPart("Base", base) .addPart("Link", link) .connect("Base.top", "Link.bottom", { as: "J1", type: "revolute" }); ```
- `addJointCoupling()` — addJointCoupling(jointName: string, options: JointCouplingOptions): Assembly
- `addGearCoupling()` — addGearCoupling(drivenJointName: string, driverJointName: string, options?: Gear
- `solve()` — solve(state?: JointState): SolvedAssembly
- `sweepJoint()` — sweepJoint(jointName: string, from: number, to: number, steps: number, baseState
- `toJointsView()` — Derive `jointsView()` configuration from this assembly's joint graph and call it. Computes world-space pivots and axes from the solved rest pose, so you don't have to manually restate joint kinematics for the viewport runtime.
- `toDisassemblyView()` — Generate a cinematic disassembly animation from the assembly's joint graph. Creates a `jointsView()` configuration with a "Disassemble" animation that sequences joint motions in reverse topological order (leaves first): - Revolute joints swing open to their max angle - Prismatic joints extend to their max distance - Fastener-named parts get extra rotation (unscrewing effect) Translation/separation is handled by the explode system (auto-configured by `solve()` with joint-derived directions). Use the explode slider in combination with this animation for the full disassembly effect.
- `describe()` — describe(): AssemblyDefinition

### `ImportedAssembly`

Wraps an imported Assembly, giving access to named parts and group conversion without losing the kinematic structure. Supports placement references (`.withReferences()` / `.placeReference()`) so sub-assemblies can be positioned the same way as imported parts and groups.

**Methods:**

- `get assembly()` — The underlying Assembly — use for sweepJoint, addPart into parent, etc.
- `solve()` — Solve the assembly at the given joint state (defaults to each joint's default value).
- `part()` — Return a specific named part positioned at the given joint state, with any stored placement offset applied.
- `toGroup()` — Convert all assembly parts to a ShapeGroup with named children. Child names match the part names used in the assembly. Any stored placement offset and placement references are forwarded to the group.
- `withReferences()` — Attach named placement reference points to this assembly. Points are simple 3D coordinates (relative to the assembly's own origin). Returns a new ImportedAssembly — does not mutate.
- `referenceNames()` — List all attached placement reference names.
- `placeReference()` — Translate the assembly so the named reference point lands on `target`. Returns a new ImportedAssembly — does not mutate. All point refs are translated by the same delta.
- `translate()` — Solve at defaults and return a translated ShapeGroup.
- `rotate()` — Solve at defaults and return a rotated ShapeGroup (Euler XYZ degrees).
- `scale()` — Solve at defaults and return a scaled ShapeGroup.
- `mirror()` — Solve at defaults and return a mirrored ShapeGroup.
- `color()` — Solve at defaults and return a colored ShapeGroup.
- `child()` — Solve at defaults, get a named child part from the resulting group.
- `mergeInto()` — Flatten this sub-assembly's parts and joints into `parent`, then wire a mount joint connecting `mountParent` (a part already in `parent`) to the sub-assembly root. All part names and joint names from the sub-assembly are prefixed with `"${options.prefix}."` to avoid collisions. After the merge you can drive sub-assembly joints from the parent: `parent.solve({ "Left Arm.shoulder": 45 })`. Throws if the sub-assembly has multiple root parts (connect them with addFixed first). Returns `parent` for chaining.

### `SolvedAssembly`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | — |

**Methods:**

- `warnings()` — warnings(): string[]
- `getJointState()` — getJointState(): JointState
- `get mateExplodeHints()` — Explode direction hints derived from mate constraints, or null if no mates.
- `get mateDof()` — Remaining degrees of freedom after mate constraints, or null if no mates.
- `get mateConverged()` — Whether the mate constraint solver converged, or null if no mates.
- `getTransform()` — getTransform(partName: string): Transform
- `getPart()` — getPart(partName: string): AssemblyPart
- `toGroup()` — Convert all solved parts to a ShapeGroup with named children. Each part becomes a child, positioned at its solved transform. This is the primary way to get a group for rendering, `show()`, or embedding.
- `toSceneObjects()` — Return an array of named scene objects for the viewport renderer. Each part becomes `{ name, shape }` or `{ name, group: [...] }` if the part is a ShapeGroup.  Prefer `toGroup()` for most uses; this method exists for advanced scene-graph control.
- `toScene()` — toScene(): Array<{ name: string; shape?: Shape; group?: Array<{ name: string; sh
- `bom()` — bom(): BomRow[]
- `bomCsv()` — bomCsv(): string
- `collisionReport()` — collisionReport(options?: CollisionOptions): CollisionFinding[]
- `minClearance()` — minClearance(partA: string, partB: string, searchLength?: number): number

### `MateBuilder`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `constraints` | `Constraint3D[]` | — |

**Methods:**

- `flush()` — flush(faceA: string, faceB: string): string
- `align()` — align(faceA: string, faceB: string): string
- `parallel()` — parallel(faceA: string, faceB: string): string
- `faceDistance()` — faceDistance(faceA: string, faceB: string, distance: number): string
- `concentric()` — concentric(axisA: string, axisB: string): string
- `axisParallel()` — axisParallel(axisA: string, axisB: string): string
- `pointCoincident()` — pointCoincident(pointA: string, pointB: string): string
- `pointOnFace()` — pointOnFace(point: string, face: string): string
- `pointOnAxis()` — pointOnAxis(point: string, axis: string): string
- `angle()` — angle(faceA: string, faceB: string, degrees: number): string
- `get totalEquations()` — Total constraint equations.

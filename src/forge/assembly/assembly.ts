import { isManifoldCapableBackend, requireManifoldShapeBackend } from '../backends/manifold/shapeBackend';
import { bodyFromTrackedShape, MateBuilder } from '../constraints3d/builder';
import type { Mat3 } from '../constraints3d/rodrigues';
import { normalize3, rodrigues, sub3 } from '../constraints3d/rodrigues';
import { createContext, solve3D } from '../constraints3d/solver';
import type { Constraint3D, RigidBody, Solve3DResult, Solver3DContext } from '../constraints3d/types';
import type { ExplodeViewDirective } from './explodeView';
import { explodeView } from './explodeView';
import type { Sketch } from '../sketch/core';
import { group, ShapeGroup, getShapeGroupPorts } from '../group';
import { getShapeRuntimeBackend, getShapePorts, Shape, union } from '../kernel';
import type { PortInput, PortMap, PortDef, PortAlign } from '../port';
import { normalizePortMapInput, clonePortMap, mergePortMaps, computeConnectFrame } from '../port';
import {
  jointsView as jointsViewFn,
  type JointViewInput,
  type JointViewType,
  type JointViewAnimationInput,
  type JointViewAnimationKeyframeInput,
  type JointViewCouplingInput,
} from './jointsView';
import {
  applyPlacementReferenceInput,
  clonePlacementReferences,
  createPlacementReferences,
  hasPlacementReferences,
  type PlacementReferenceInput,
  type PlacementReferenceKind,
  type PlacementReferences,
  placementReferenceNames,
  resolvePlacementReferencePoint,
} from '../placement';
import { TrackedShape } from '../sketch/topology';
import { composeChain, type Mat4, normalizeAxis, Transform, type TransformInput, type Vec3 } from '../transform';

export type AssemblyPart = Shape | TrackedShape | ShapeGroup;
export type JointType = 'fixed' | 'revolute' | 'prismatic';
export type JointState = Record<string, number | undefined>;

export interface PartMetadata {
  material?: string;
  process?: string;
  tolerance?: string;
  qty?: number;
  notes?: string;
  densityKgM3?: number;
  massKg?: number;
  [key: string]: unknown;
}

export interface PartOptions {
  transform?: TransformInput;
  metadata?: PartMetadata;
}

export interface JointOptions {
  frame?: TransformInput;
  origin?: [number, number, number];
  axis?: Vec3;
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
}

export interface JointCouplingTerm {
  joint: string;
  ratio?: number;
}

export interface JointCouplingOptions {
  terms: JointCouplingTerm[];
  offset?: number;
}

export interface GearRatioLike {
  jointRatio: number;
  /** Phase offset (degrees) for tooth mesh alignment. Auto-applied as coupling
   *  offset when provided via `addGearCoupling({ pair })` and no explicit offset is set. */
  phaseDeg?: number;
}

export interface GearCouplingOptions {
  ratio?: number;
  pair?: GearRatioLike;
  driverTeeth?: number;
  drivenTeeth?: number;
  mesh?: 'external' | 'internal' | 'bevel' | 'face';
  offset?: number;
  driverOrigin?: [number, number, number];
  drivenOrigin?: [number, number, number];
}

interface PartRecord {
  name: string;
  part: AssemblyPart;
  base: Transform;
  metadata?: PartMetadata;
}

interface JointRecord {
  name: string;
  type: JointType;
  parent: string;
  child: string;
  frame: Transform;
  axis: Vec3;
  min?: number;
  max?: number;
  defaultValue: number;
  unit?: string;
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
}

interface JointCouplingTermRecord {
  joint: string;
  ratio: number;
}

interface JointCouplingRecord {
  joint: string;
  terms: JointCouplingTermRecord[];
  offset: number;
}

export interface AssemblyPartDef {
  name: string;
  part: AssemblyPart;
  base: Transform;
  metadata?: PartMetadata;
}

export interface AssemblyJointDef {
  name: string;
  type: JointType;
  parent: string;
  child: string;
  frame: Transform;
  axis: Vec3;
  min?: number;
  max?: number;
  defaultValue: number;
  unit?: string;
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
}

export interface AssemblyJointCouplingDef {
  joint: string;
  terms: JointCouplingTermRecord[];
  offset: number;
}

export interface AssemblyDefinition {
  name: string;
  parts: AssemblyPartDef[];
  joints: AssemblyJointDef[];
  jointCouplings: AssemblyJointCouplingDef[];
}

export interface BomRow {
  part: string;
  qty: number;
  material?: string;
  process?: string;
  tolerance?: string;
  notes?: string;
  metadata?: PartMetadata;
}

export interface CollisionOptions {
  parts?: string[];
  ignorePairs?: Array<[string, string]>;
  minOverlapVolume?: number;
}

export interface CollisionFinding {
  partA: string;
  partB: string;
  overlapVolume: number;
}

export interface JointSweepFrame {
  value: number;
  collisions: CollisionFinding[];
  warnings: string[];
}

/** Convert BOM rows from a solved assembly into a CSV string. */
export function bomToCsv(rows: BomRow[]): string {
  const header = ['part', 'qty', 'material', 'process', 'tolerance', 'notes'];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        esc(row.part),
        String(row.qty),
        esc(row.material ?? ''),
        esc(row.process ?? ''),
        esc(row.tolerance ?? ''),
        esc(row.notes ?? ''),
      ].join(','),
    );
  }
  return lines.join('\n');
}

function applyTransformToPart(part: AssemblyPart, transform: Transform): AssemblyPart {
  if (part instanceof TrackedShape) return part.transform(transform);
  if (part instanceof Shape) return part.transform(transform);
  return part.transform(transform);
}

function partToShapes(part: AssemblyPart): Shape[] {
  if (part instanceof TrackedShape) return [part.toShape()];
  if (part instanceof Shape) return [part];

  const out: Shape[] = [];
  for (const child of part.children) {
    if (child instanceof ShapeGroup) out.push(...partToShapes(child));
    else if (child instanceof TrackedShape) out.push(child.toShape());
    else if (child instanceof Shape) out.push(child);
  }
  return out;
}

function collisionShape(part: AssemblyPart): Shape | null {
  const shapes = partToShapes(part);
  if (shapes.length === 0) return null;
  if (shapes.length === 1) return shapes[0];
  return union(...shapes);
}

// ─── Explode heuristic helpers ────────────────────────────────────────────────

const FASTENER_PATTERN = /\b(bolt|screw|nut|washer|pin|rivet|fastener|standoff|insert)\b/i;

function isFastenerName(name: string): boolean {
  return FASTENER_PATTERN.test(name);
}

type ExplodeAxisType = 'x' | 'y' | 'z';

function dominantAxis(dir: [number, number, number]): ExplodeAxisType {
  const ax = Math.abs(dir[0]);
  const ay = Math.abs(dir[1]);
  const az = Math.abs(dir[2]);
  if (ax >= ay && ax >= az) return 'x';
  if (ay >= az) return 'y';
  return 'z';
}

function motionTransform(joint: JointRecord, value: number): Transform {
  if (joint.type === 'fixed') return Transform.identity();
  if (joint.type === 'revolute') {
    return Transform.identity().rotateAxis(joint.axis, value);
  }
  const dx = joint.axis[0] * value;
  const dy = joint.axis[1] * value;
  const dz = joint.axis[2] * value;
  return Transform.identity().translate(dx, dy, dz);
}

function clampJointValue(joint: JointRecord, value: number): { value: number; wasClamped: boolean } {
  let clamped = Number.isFinite(value) ? value : joint.defaultValue;
  if (joint.min != null) clamped = Math.max(joint.min, clamped);
  if (joint.max != null) clamped = Math.min(joint.max, clamped);
  return { value: clamped, wasClamped: clamped !== value };
}

// ─── Mate constraint helpers ─────────────────────────────────────────────────

/** Convert solver Rodrigues rotation + translation to a column-major Mat4 Transform. */
function solverTransformToTransform(position: Vec3, rotation: Vec3): Transform {
  const R: Mat3 = rodrigues(rotation);
  // Mat3 is row-major: R[0]=r00, R[1]=r01, R[2]=r02, R[3]=r10, ...
  // Mat4 is column-major: [col0, col1, col2, col3]
  const mat: Mat4 = [R[0], R[3], R[6], 0, R[1], R[4], R[7], 0, R[2], R[5], R[8], 0, position[0], position[1], position[2], 1];
  return Transform.from(mat);
}

/** Extract the TrackedShape from an AssemblyPart, or null if none found. */
function extractTrackedShape(part: AssemblyPart): TrackedShape | null {
  if (part instanceof TrackedShape) return part;
  if (part instanceof ShapeGroup) {
    for (const child of part.children) {
      if (child instanceof TrackedShape) return child;
      if (child instanceof ShapeGroup) {
        const found = extractTrackedShape(child);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Build solver RigidBodies from parts referenced by constraints. */
function buildMateRigidBodies(
  parts: Map<string, PartRecord>,
  constraints: Constraint3D[],
  incoming: Map<string, string>,
): { bodies: Map<string, RigidBody>; groundedId: string | null } {
  const referencedIds = new Set<string>();
  for (const c of constraints) {
    referencedIds.add(c.refA.bodyId);
    referencedIds.add(c.refB.bodyId);
  }

  // Ground the first referenced part that has no incoming joint
  let groundedId: string | null = null;
  for (const id of referencedIds) {
    if (!incoming.has(id)) {
      groundedId = id;
      break;
    }
  }
  // Fallback: ground the first referenced part
  if (!groundedId) {
    groundedId = referencedIds.values().next().value ?? null;
  }

  const bodies = new Map<string, RigidBody>();
  for (const id of referencedIds) {
    const rec = parts.get(id);
    if (!rec) throw new Error(`Mate constraint references unknown part "${id}"`);

    const tracked = extractTrackedShape(rec.part);
    if (!tracked) {
      throw new Error(
        `Part "${id}" must be a TrackedShape (or ShapeGroup containing one) for mate constraints. ` +
          'Use TrackedShape (from sketch().extrude() etc.) instead of plain Shape.',
      );
    }

    bodies.set(id, bodyFromTrackedShape(id, tracked, { grounded: id === groundedId }));
  }

  return { bodies, groundedId };
}

/** Derive explode direction hints from solved mate constraints. */
function deriveExplodeHintsFromMates(
  constraints: Constraint3D[],
  result: Solve3DResult,
  bodies: Map<string, RigidBody>,
  ctx: Solver3DContext,
): Record<string, ExplodeViewDirective> {
  const hints: Record<string, ExplodeViewDirective> = {};

  for (const c of constraints) {
    // We want a direction for the non-grounded body
    const bodyA = bodies.get(c.refA.bodyId);
    const bodyB = bodies.get(c.refB.bodyId);
    if (!bodyA || !bodyB) continue;

    const movingId = bodyA.grounded ? c.refB.bodyId : c.refA.bodyId;
    if (hints[movingId]) continue; // first constraint wins

    let dir: Vec3 | null = null;
    try {
      switch (c.type) {
        case 'flush':
        case 'faceDistance':
        case 'parallel':
        case 'align': {
          // Use the face normal of the moving body's face as separation direction
          const ref = bodyA.grounded ? c.refB : c.refA;
          const face = ctx.worldFace(ref.bodyId, ref.featureName);
          dir = face.normal;
          break;
        }
        case 'concentric':
        case 'axisParallel': {
          // Use the shared axis direction
          const ref = bodyA.grounded ? c.refB : c.refA;
          const axis = ctx.worldAxis(ref.bodyId, ref.featureName);
          dir = axis.direction;
          break;
        }
        case 'pointCoincident': {
          // Use vector between part centers (from grounded toward moving)
          const posA = result.transforms.get(c.refA.bodyId);
          const posB = result.transforms.get(c.refB.bodyId);
          if (posA && posB) {
            const raw = sub3(bodyA.grounded ? posB.position : posA.position, bodyA.grounded ? posA.position : posB.position);
            dir = normalize3(raw);
          }
          break;
        }
      }
    } catch {
      // If feature lookup fails, skip this constraint's hint
    }

    if (dir && (dir[0] !== 0 || dir[1] !== 0 || dir[2] !== 0)) {
      hints[movingId] = { direction: [...dir] as [number, number, number] };
    }
  }

  return hints;
}

export interface MateMetadata {
  explodeHints: Record<string, { direction: Vec3 }>;
  dof: number;
  converged: boolean;
}

export class SolvedAssembly {
  constructor(
    public readonly name: string,
    private readonly parts: Map<string, PartRecord>,
    private readonly transforms: Map<string, Transform>,
    private readonly jointValues: JointState,
    private readonly solveWarnings: string[],
    private readonly _mateMetadata: MateMetadata | null = null,
  ) {}

  warnings(): string[] {
    return [...this.solveWarnings];
  }

  getJointState(): JointState {
    return { ...this.jointValues };
  }

  /** Explode direction hints derived from mate constraints, or null if no mates. */
  get mateExplodeHints(): Record<string, { direction: Vec3 }> | null {
    return this._mateMetadata?.explodeHints ?? null;
  }

  /** Remaining degrees of freedom after mate constraints, or null if no mates. */
  get mateDof(): number | null {
    return this._mateMetadata?.dof ?? null;
  }

  /** Whether the mate constraint solver converged, or null if no mates. */
  get mateConverged(): boolean | null {
    return this._mateMetadata?.converged ?? null;
  }

  getTransform(partName: string): Transform {
    const t = this.transforms.get(partName);
    if (!t) throw new Error(`Unknown part "${partName}"`);
    return t;
  }

  getPart(partName: string): AssemblyPart {
    const rec = this.parts.get(partName);
    if (!rec) throw new Error(`Unknown part "${partName}"`);
    return applyTransformToPart(rec.part, this.getTransform(partName));
  }

  /**
   * Convert all solved parts to a ShapeGroup with named children.
   * Each part becomes a child, positioned at its solved transform.
   * This is the primary way to get a group for rendering, `show()`, or embedding.
   */
  toGroup(): ShapeGroup {
    const children: AssemblyPart[] = [];
    const childNames: string[] = [];
    for (const [name] of this.parts) {
      children.push(this.getPart(name));
      childNames.push(name);
    }
    return new ShapeGroup(children, childNames);
  }

  /**
   * Return an array of named scene objects for the viewport renderer.
   * Each part becomes `{ name, shape }` or `{ name, group: [...] }` if the part
   * is a ShapeGroup.  Prefer `toGroup()` for most uses; this method exists for
   * advanced scene-graph control.
   */
  toSceneObjects(): Array<{
    name: string;
    shape?: Shape;
    group?: Array<{ name: string; shape: Shape }>;
    metadata?: PartMetadata;
  }> {
    const appendGroupChildren = (grp: ShapeGroup, prefix: string, out: Array<{ name: string; shape: Shape }>) => {
      grp.children.forEach((child, index) => {
        const childName = grp.childName(index);
        const label = childName ? `${prefix}.${childName}` : `${prefix}.${index + 1}`;
        if (child instanceof ShapeGroup) {
          appendGroupChildren(child, label, out);
          return;
        }
        if (child instanceof TrackedShape) {
          out.push({ name: label, shape: child.toShape() });
          return;
        }
        if (child instanceof Shape) {
          out.push({ name: label, shape: child });
        }
      });
    };

    const out: Array<{
      name: string;
      shape?: Shape;
      group?: Array<{ name: string; shape: Shape }>;
      metadata?: PartMetadata;
    }> = [];

    for (const [name, rec] of this.parts) {
      const part = this.getPart(name);
      if (part instanceof ShapeGroup) {
        const groupItems: Array<{ name: string; shape: Shape }> = [];
        appendGroupChildren(part, name, groupItems);
        out.push({ name, group: groupItems, metadata: rec.metadata });
      } else if (part instanceof TrackedShape) {
        out.push({ name, shape: part.toShape(), metadata: rec.metadata });
      } else {
        out.push({ name, shape: part, metadata: rec.metadata });
      }
    }
    return out;
  }

  /** @deprecated Use `toSceneObjects()` or `toGroup()` instead. */
  toScene(): Array<{
    name: string;
    shape?: Shape;
    group?: Array<{ name: string; shape: Shape }>;
    metadata?: PartMetadata;
  }> {
    return this.toSceneObjects();
  }

  bom(): BomRow[] {
    const rows: BomRow[] = [];
    for (const rec of this.parts.values()) {
      rows.push({
        part: rec.name,
        qty: Math.max(1, Math.round(rec.metadata?.qty ?? 1)),
        material: rec.metadata?.material,
        process: rec.metadata?.process,
        tolerance: rec.metadata?.tolerance,
        notes: rec.metadata?.notes,
        metadata: rec.metadata ? { ...rec.metadata } : undefined,
      });
    }
    return rows;
  }

  bomCsv(): string {
    return bomToCsv(this.bom());
  }

  collisionReport(options: CollisionOptions = {}): CollisionFinding[] {
    const names = (options.parts ?? [...this.parts.keys()]).filter((name) => this.parts.has(name));
    const minOverlap = options.minOverlapVolume ?? 0.1;
    const ignore = new Set((options.ignorePairs ?? []).map(([a, b]) => [a, b].sort().join('|')));
    const findings: CollisionFinding[] = [];

    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const aName = names[i];
        const bName = names[j];
        if (ignore.has([aName, bName].sort().join('|'))) continue;

        const a = collisionShape(this.getPart(aName));
        const b = collisionShape(this.getPart(bName));
        if (!a || !b) continue;

        try {
          const hit = a.intersect(b);
          if (hit.isEmpty()) continue;
          const vol = hit.volume();
          if (vol > minOverlap) {
            findings.push({ partA: aName, partB: bName, overlapVolume: vol });
          }
        } catch {
          // Skip pairs where boolean intersection fails on degenerate geometry.
        }
      }
    }

    return findings;
  }

  minClearance(partA: string, partB: string, searchLength = 10): number {
    const a = collisionShape(this.getPart(partA));
    const b = collisionShape(this.getPart(partB));
    if (!a || !b) throw new Error(`Cannot compute clearance between "${partA}" and "${partB}"`);
    try {
      const hit = a.intersect(b);
      if (!hit.isEmpty() && hit.volume() > 0) return 0;
    } catch {
      // Fall through to minGap.
    }
    const backendA = getShapeRuntimeBackend(a);
    const backendB = getShapeRuntimeBackend(b);
    if (!isManifoldCapableBackend(backendA)) {
      throw new Error('minClearance() requires the Manifold backend');
    }
    const manifoldA = backendA.requireManifold('minClearance()');
    const manifoldB = requireManifoldShapeBackend(backendB, 'minClearance()');
    return manifoldA.minGap(manifoldB, searchLength);
  }
}

export interface ConnectOptions {
  as?: string;
  type?: JointType;
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
  flip?: boolean;
  /** Which point on the parent port to align: 'start', 'middle' (default), or 'end'. */
  parentAlign?: PortAlign;
  /** Which point on the child port to align: 'start', 'middle' (default), or 'end'. */
  childAlign?: PortAlign;
  /** Shorthand: set both parentAlign and childAlign at once. */
  align?: PortAlign;
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
}

export interface ToJointsViewOptions {
  defaults?: Record<string, number>;
  overrides?: Record<string, Partial<JointViewInput>>;
  animations?: JointViewAnimationInput[];
  couplings?: JointViewCouplingInput[];
  defaultAnimation?: string;
  enabled?: boolean;
}

export interface ToDisassemblyViewOptions {
  /** Angle (degrees) revolute joints swing open during disassembly. Default: 90 */
  swingAngle?: number;
  /** Angle (degrees) fastener-named parts rotate (unscrewing). Default: 720 */
  unscrewAngle?: number;
  /** Distance (mm) prismatic joints extend during disassembly. Default: 60 */
  separationDistance?: number;
  /** Total animation duration in seconds. Default: max(3, numSteps * 1.0) */
  duration?: number;
  /** Additional animation clips to include alongside "Disassemble". */
  animations?: JointViewAnimationInput[];
  /** Joint couplings override. */
  couplings?: JointViewCouplingInput[];
  /** Which animation to play by default. Default: "Disassemble" */
  defaultAnimation?: string;
  /** Enable/disable jointsView. Default: true */
  enabled?: boolean;
}

export class Assembly {
  private readonly parts = new Map<string, PartRecord>();
  private readonly joints = new Map<string, JointRecord>();
  private readonly jointCouplings = new Map<string, JointCouplingRecord>();
  private readonly _mateFns: Array<(m: MateBuilder) => void> = [];
  private _refs: PlacementReferences = createPlacementReferences();
  private readonly _portsByPart = new Map<string, PortMap>();
  private _connectCounter = 0;

  constructor(public readonly name = 'Assembly') {}

  /**
   * Register mate constraints between parts.
   * Constraints are solved during `solve()` to derive part positions and explode hints.
   * Part references use "partName:featureName" format.
   */
  mate(fn: (m: MateBuilder) => void): Assembly {
    this._mateFns.push(fn);
    return this;
  }

  /**
   * Attach named placement reference points to this assembly.
   * These are surfaced automatically on the ImportedAssembly when this file is
   * imported via require(), so consumers can use placeReference() without
   * re-declaring them.
   * Returns `this` for chaining.
   */
  withReferences(refs: Pick<PlacementReferenceInput, 'points'>): Assembly {
    this._refs = applyPlacementReferenceInput(this._refs, refs);
    return this;
  }

  /** @internal — used by require() to seed ImportedAssembly refs. */
  getReferences(): PlacementReferences {
    return clonePlacementReferences(this._refs);
  }

  /**
   * Attach named ports to a specific part or the assembly root.
   * Ports declared this way are in the part's local coordinate system.
   */
  withPorts(partName: string, ports: Record<string, PortInput>): Assembly;
  withPorts(ports: Record<string, PortInput>): Assembly;
  withPorts(partNameOrPorts: string | Record<string, PortInput>, maybePorts?: Record<string, PortInput>): Assembly {
    if (typeof partNameOrPorts === 'string') {
      const partName = partNameOrPorts;
      const ports = maybePorts!;
      if (!this.parts.has(partName)) throw new Error(`Unknown part "${partName}" — add it with addPart() first`);
      const existing = this._portsByPart.get(partName) ?? {};
      this._portsByPart.set(partName, mergePortMaps(existing, normalizePortMapInput(ports)));
      return this;
    }
    // Assembly-level ports (for the assembly itself when used as a sub-assembly)
    const ports = partNameOrPorts;
    const normalized = normalizePortMapInput(ports);
    // Store under a special key — the assembly name
    const existing = this._portsByPart.get('__assembly__') ?? {};
    this._portsByPart.set('__assembly__', mergePortMaps(existing, normalized));
    return this;
  }

  /** Get ports declared on a part (in part-local space). */
  getPorts(partName: string): PortMap {
    return clonePortMap(this._portsByPart.get(partName) ?? {});
  }

  /** @internal — set already-normalized ports directly (used by mergeInto). */
  _setPortsDirect(partName: string, ports: PortMap): void {
    const existing = this._portsByPart.get(partName) ?? {};
    this._portsByPart.set(partName, mergePortMaps(existing, ports));
  }

  /** @internal — get all port maps, keyed by part name. */
  getAllPorts(): Map<string, PortMap> {
    const out = new Map<string, PortMap>();
    for (const [key, ports] of this._portsByPart) {
      out.set(key, clonePortMap(ports));
    }
    return out;
  }

  /**
   * Parse a "PartName.portName" reference and return the resolved port.
   * Throws descriptive errors if the part or port doesn't exist.
   */
  getPort(ref: string): { partName: string; portName: string; port: PortDef } {
    const dotIdx = ref.indexOf('.');
    if (dotIdx < 0) throw new Error(`Port reference "${ref}" must use "PartName.portName" format`);
    const partName = ref.slice(0, dotIdx);
    const portName = ref.slice(dotIdx + 1);
    if (!partName || !portName) throw new Error(`Port reference "${ref}" must use "PartName.portName" format`);
    if (!this.parts.has(partName)) {
      throw new Error(`Port reference "${ref}": no part named "${partName}". Available: ${[...this.parts.keys()].join(', ')}`);
    }
    const ports = this._portsByPart.get(partName);
    if (!ports || !(portName in ports)) {
      const available = ports ? Object.keys(ports) : [];
      throw new Error(
        `Port reference "${ref}": no port "${portName}" on part "${partName}".` +
        (available.length > 0 ? ` Available: ${available.join(', ')}` : ' No ports declared on this part.'),
      );
    }
    return { partName, portName, port: { ...ports[portName], origin: [...ports[portName].origin] as Vec3, axis: [...ports[portName].axis] as Vec3, up: [...ports[portName].up] as Vec3 } };
  }

  /** Add a virtual reference frame (no geometry) to the assembly graph. */
  addFrame(name: string, options: PartOptions = {}): Assembly {
    return this.addPart(name, group(), options);
  }

  addPart(name: string, part: AssemblyPart, options: PartOptions = {}): Assembly {
    if (this.parts.has(name)) throw new Error(`Part "${name}" already exists`);
    this.parts.set(name, {
      name,
      part,
      base: options.transform ? Transform.from(options.transform) : Transform.identity(),
      metadata: options.metadata ? { ...options.metadata } : undefined,
    });
    // Capture ports from the incoming part
    let ports: PortMap = {};
    if (part instanceof Shape) {
      ports = getShapePorts(part);
    } else if (part instanceof ShapeGroup) {
      ports = getShapeGroupPorts(part);
    } else if (part instanceof TrackedShape) {
      ports = getShapePorts(part.toShape());
    }
    if (Object.keys(ports).length > 0) {
      this._portsByPart.set(name, clonePortMap(ports));
    }
    return this;
  }

  addJoint(name: string, type: JointType, parent: string, child: string, options: JointOptions = {}): Assembly {
    if (this.joints.has(name)) throw new Error(`Joint "${name}" already exists`);
    if (!this.parts.has(parent)) throw new Error(`Unknown parent part "${parent}"`);
    if (!this.parts.has(child)) throw new Error(`Unknown child part "${child}"`);
    if (parent === child) throw new Error(`Joint "${name}" cannot connect a part to itself`);

    if (options.frame && options.origin) {
      throw new Error(`Joint "${name}" cannot have both frame and origin`);
    }
    const frame = options.origin
      ? Transform.translation(options.origin[0], options.origin[1], options.origin[2])
      : options.frame
        ? Transform.from(options.frame)
        : Transform.identity();

    const axis = normalizeAxis(options.axis ?? [0, 0, 1]);
    this.joints.set(name, {
      name,
      type,
      parent,
      child,
      frame,
      axis,
      min: options.min,
      max: options.max,
      defaultValue: options.default ?? 0,
      unit: options.unit,
      effort: options.effort,
      velocity: options.velocity,
      damping: options.damping,
      friction: options.friction,
    });
    return this;
  }

  addRevolute(name: string, parent: string, child: string, options: JointOptions = {}): Assembly {
    return this.addJoint(name, 'revolute', parent, child, options);
  }

  addPrismatic(name: string, parent: string, child: string, options: JointOptions = {}): Assembly {
    return this.addJoint(name, 'prismatic', parent, child, options);
  }

  addFixed(name: string, parent: string, child: string, options: JointOptions = {}): Assembly {
    return this.addJoint(name, 'fixed', parent, child, options);
  }

  /**
   * Connect two parts by aligning their declared ports.
   *
   * `parentPortRef` and `childPortRef` use "PartName.portName" format.
   * The system computes the joint frame and axis automatically from port alignment.
   *
   * ```javascript
   * const mech = assembly("Arm")
   *   .addPart("Base", base)
   *   .addPart("Link", link)
   *   .connect("Base.top", "Link.bottom", { as: "J1", type: "revolute" });
   * ```
   */
  connect(parentPortRef: string, childPortRef: string, options: ConnectOptions = {}): Assembly {
    const parent = this.getPort(parentPortRef);
    const child = this.getPort(childPortRef);

    if (parent.partName === child.partName) {
      throw new Error(`connect(): both ports refer to the same part "${parent.partName}"`);
    }

    // Determine joint type
    const jointType: JointType = options.type
      ?? child.port.kind
      ?? parent.port.kind
      ?? 'revolute';

    // Determine joint name
    const jointName = options.as ?? `${parent.partName}_${child.partName}_${this._connectCounter++}`;

    // Get child part's base transform
    const childRecord = this.parts.get(child.partName)!;
    const childBase = childRecord.base;

    // Compute frame and axis from port alignment
    const childAlign = options.childAlign ?? options.align ?? 'middle';
    const parentAlign = options.parentAlign ?? options.align ?? 'middle';
    const { frame, axis } = computeConnectFrame(
      childBase,
      child.port,
      parent.port,
      options.flip ?? false,
      childAlign,
      parentAlign,
    );

    // Determine limits (options override port hints)
    const min = options.min ?? child.port.min ?? parent.port.min;
    const max = options.max ?? child.port.max ?? parent.port.max;

    return this.addJoint(jointName, jointType, parent.partName, child.partName, {
      frame,
      axis,
      min,
      max,
      default: options.default,
      unit: options.unit,
      effort: options.effort,
      velocity: options.velocity,
      damping: options.damping,
      friction: options.friction,
    });
  }

  addJointCoupling(jointName: string, options: JointCouplingOptions): Assembly {
    const joint = this.joints.get(jointName);
    if (!joint) throw new Error(`Unknown joint "${jointName}"`);
    if (joint.type === 'fixed') {
      throw new Error(`Joint "${jointName}" is fixed and cannot be coupled`);
    }
    if (!options || typeof options !== 'object') {
      throw new Error('addJointCoupling(...) expects an options object');
    }
    if (!Array.isArray(options.terms) || options.terms.length === 0) {
      throw new Error(`Joint coupling "${jointName}" requires a non-empty terms array`);
    }
    if (options.offset !== undefined && !Number.isFinite(options.offset)) {
      throw new Error(`Joint coupling "${jointName}" offset must be finite`);
    }

    const seen = new Set<string>();
    const terms = options.terms.map((term, index): JointCouplingTermRecord => {
      if (!term || typeof term !== 'object') {
        throw new Error(`Joint coupling "${jointName}" term[${index}] must be an object`);
      }
      const sourceName = typeof term.joint === 'string' ? term.joint.trim() : '';
      if (!sourceName) {
        throw new Error(`Joint coupling "${jointName}" term[${index}] joint is required`);
      }
      if (!this.joints.has(sourceName)) {
        throw new Error(`Joint coupling "${jointName}" references unknown joint "${sourceName}"`);
      }
      if (sourceName === jointName) {
        throw new Error(`Joint coupling "${jointName}" cannot reference itself`);
      }
      if (seen.has(sourceName)) {
        throw new Error(`Joint coupling "${jointName}" has duplicate source joint "${sourceName}"`);
      }
      seen.add(sourceName);
      const ratio = term.ratio ?? 1;
      if (!Number.isFinite(ratio)) {
        throw new Error(`Joint coupling "${jointName}" term[${index}] ratio must be finite`);
      }
      return { joint: sourceName, ratio };
    });

    this.jointCouplings.set(jointName, {
      joint: jointName,
      terms,
      offset: options.offset ?? 0,
    });
    this.assertJointCouplingsAcyclic();
    return this;
  }

  addGearCoupling(drivenJointName: string, driverJointName: string, options: GearCouplingOptions = {}): Assembly {
    if (!options || typeof options !== 'object') {
      throw new Error('addGearCoupling(...) expects an options object');
    }

    const drivenJoint = this.joints.get(drivenJointName);
    if (!drivenJoint) throw new Error(`Unknown joint "${drivenJointName}"`);
    if (drivenJoint.type !== 'revolute') {
      throw new Error(`addGearCoupling(...) expects driven joint "${drivenJointName}" to be revolute`);
    }

    const driverJoint = this.joints.get(driverJointName);
    if (!driverJoint) throw new Error(`Unknown joint "${driverJointName}"`);
    if (driverJoint.type !== 'revolute') {
      throw new Error(`addGearCoupling(...) expects driver joint "${driverJointName}" to be revolute`);
    }

    if (options.offset !== undefined && !Number.isFinite(options.offset)) {
      throw new Error(`Gear coupling "${drivenJointName}" offset must be finite`);
    }

    const usingExplicitRatio = options.ratio !== undefined;
    const usingPairRatio = options.pair !== undefined;
    const usingTeeth = options.driverTeeth !== undefined || options.drivenTeeth !== undefined;
    const ratioSourcesUsed = Number(usingExplicitRatio) + Number(usingPairRatio) + Number(usingTeeth);
    if (ratioSourcesUsed !== 1) {
      throw new Error(`Gear coupling "${drivenJointName}" must provide exactly one ratio source: ratio, pair, or driverTeeth/drivenTeeth`);
    }

    if (options.mesh !== undefined && !usingTeeth) {
      throw new Error(`Gear coupling "${drivenJointName}" mesh may only be set when using driverTeeth/drivenTeeth`);
    }

    let ratio: number;
    if (usingExplicitRatio) {
      ratio = options.ratio!;
    } else if (usingPairRatio) {
      const pair = options.pair;
      if (!pair || typeof pair !== 'object') {
        throw new Error(`Gear coupling "${drivenJointName}" pair must be an object with jointRatio`);
      }
      ratio = pair.jointRatio;
      // Auto-apply phase offset from gear pair when offset not explicitly set.
      // This aligns teeth correctly for the common `place: false` + assembly pattern.
      // Override with `offset: 0` if gear shapes already have phase baked in (place: true).
      if (options.offset === undefined && typeof pair.phaseDeg === 'number' && Number.isFinite(pair.phaseDeg)) {
        options = { ...options, offset: pair.phaseDeg };
      }
    } else {
      if (!Number.isFinite(options.driverTeeth) || !Number.isFinite(options.drivenTeeth)) {
        throw new Error(`Gear coupling "${drivenJointName}" driverTeeth/drivenTeeth must be finite`);
      }
      if ((options.driverTeeth as number) <= 0 || (options.drivenTeeth as number) <= 0) {
        throw new Error(`Gear coupling "${drivenJointName}" driverTeeth/drivenTeeth must be > 0`);
      }
      const meshMode = options.mesh ?? 'external';
      const sign = meshMode === 'internal' ? 1 : -1;
      ratio = sign * ((options.driverTeeth as number) / (options.drivenTeeth as number));
    }

    if (!Number.isFinite(ratio) || ratio === 0) {
      throw new Error(`Gear coupling "${drivenJointName}" resolved ratio must be finite and non-zero`);
    }

    // Mesh angle correction: when shaft positions are provided, adjust offset
    // so teeth align correctly for non-X-axis mesh directions.
    if (options.driverOrigin && options.drivenOrigin) {
      const dx = options.drivenOrigin[0] - options.driverOrigin[0];
      const dy = options.drivenOrigin[1] - options.driverOrigin[1];
      const meshAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const currentOffset = options.offset ?? 0;
      options = { ...options, offset: currentOffset + meshAngleDeg * (1 + ratio) };
    }

    return this.addJointCoupling(drivenJointName, {
      terms: [{ joint: driverJointName, ratio }],
      offset: options.offset,
    });
  }

  private assertJointCouplingsAcyclic(): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const walk = (jointName: string) => {
      if (visited.has(jointName)) return;
      if (visiting.has(jointName)) {
        throw new Error(`Joint coupling cycle detected at "${jointName}"`);
      }
      visiting.add(jointName);
      const coupling = this.jointCouplings.get(jointName);
      if (coupling) {
        coupling.terms.forEach((term) => walk(term.joint));
      }
      visiting.delete(jointName);
      visited.add(jointName);
    };

    this.jointCouplings.forEach((_, jointName) => walk(jointName));
  }

  solve(state: JointState = {}): SolvedAssembly {
    const incoming = new Map<string, string>();
    const jointsByParent = new Map<string, JointRecord[]>();
    const warnings: string[] = [];

    for (const joint of this.joints.values()) {
      if (incoming.has(joint.child)) {
        throw new Error(`Part "${joint.child}" has multiple parent joints`);
      }
      incoming.set(joint.child, joint.name);

      const list = jointsByParent.get(joint.parent) ?? [];
      list.push(joint);
      jointsByParent.set(joint.parent, list);
    }

    const roots = [...this.parts.keys()].filter((name) => !incoming.has(name));
    if (roots.length === 0 && this.parts.size > 0) {
      throw new Error('Assembly has no root part (cyclic joint graph)');
    }

    // ── Mate constraint pre-pass ──────────────────────────────────────────
    const mateBaseOverrides = new Map<string, Transform>();
    let mateMetadata: MateMetadata | null = null;

    if (this._mateFns.length > 0) {
      const builder = new MateBuilder();
      for (const fn of this._mateFns) {
        fn(builder);
      }

      if (builder.constraints.length > 0) {
        const { bodies, groundedId: _ } = buildMateRigidBodies(this.parts, builder.constraints, incoming);
        const result = solve3D(bodies, builder.constraints);

        if (!result.converged) {
          warnings.push(
            `Mate constraints did not fully converge (maxError=${result.maxError.toFixed(6)}). ` + 'Using best-found transforms.',
          );
        }

        // Convert solver transforms to Assembly base overrides
        for (const [id, t] of result.transforms) {
          mateBaseOverrides.set(id, solverTransformToTransform(t.position, t.rotation));
        }

        // Derive explode hints
        const ctx = createContext(bodies);
        const explodeHints = deriveExplodeHintsFromMates(builder.constraints, result, bodies, ctx);

        // Auto-inject explode hints
        if (Object.keys(explodeHints).length > 0) {
          explodeView({ byName: explodeHints });
        }

        mateMetadata = {
          explodeHints: Object.fromEntries(
            Object.entries(explodeHints).map(([k, v]) => {
              const d = v.direction as [number, number, number];
              return [k, { direction: [...d] as Vec3 }];
            }),
          ),
          dof: result.dof,
          converged: result.converged,
        };
      }
    }

    // ── Kinematic DFS ─────────────────────────────────────────────────────
    const world = new Map<string, Transform>();
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const jointValues: JointState = {};
    const resolvingJointValues = new Set<string>();

    const resolveJointValue = (jointName: string): number => {
      const cached = jointValues[jointName];
      if (cached !== undefined) return cached;
      if (resolvingJointValues.has(jointName)) {
        throw new Error(`Joint coupling cycle detected at "${jointName}"`);
      }

      const joint = this.joints.get(jointName);
      if (!joint) throw new Error(`Unknown joint "${jointName}"`);

      resolvingJointValues.add(jointName);

      let raw = state[jointName] ?? joint.defaultValue;
      const coupling = this.jointCouplings.get(jointName);
      if (coupling) {
        raw = coupling.offset;
        coupling.terms.forEach((term) => {
          raw += term.ratio * resolveJointValue(term.joint);
        });
        if (state[jointName] !== undefined) {
          warnings.push(`Joint "${jointName}" state override ignored because it is coupled`);
        }
      }

      const { value, wasClamped } = clampJointValue(joint, raw);
      jointValues[jointName] = value;
      if (wasClamped) {
        warnings.push(`Joint "${jointName}" clamped from ${raw} to ${value}${joint.unit ?? ''}`);
      }

      resolvingJointValues.delete(jointName);
      return value;
    };

    const dfs = (partName: string, worldTransform: Transform) => {
      if (visiting.has(partName)) throw new Error(`Cycle detected at part "${partName}"`);
      visiting.add(partName);
      world.set(partName, worldTransform);
      visited.add(partName);

      const outgoing = jointsByParent.get(partName) ?? [];
      for (const joint of outgoing) {
        const value = resolveJointValue(joint.name);

        const child = this.parts.get(joint.child)!;
        const childBase = mateBaseOverrides.get(joint.child) ?? child.base;
        // Canonical frame composition order for Forge chain semantics:
        // local -> childBase -> jointMotion -> jointFrame -> parentWorld
        const childWorld = composeChain(childBase, motionTransform(joint, value), joint.frame, worldTransform);
        dfs(joint.child, childWorld);
      }
      visiting.delete(partName);
    };

    for (const rootName of roots) {
      const root = this.parts.get(rootName)!;
      const rootBase = mateBaseOverrides.get(rootName) ?? root.base;
      dfs(rootName, rootBase);
    }

    if (visited.size !== this.parts.size) {
      const missing = [...this.parts.keys()].filter((name) => !visited.has(name));
      throw new Error(`Assembly graph unresolved for parts: ${missing.join(', ')}`);
    }

    // ── Auto-inject joint-derived explode directions ──────────────────────
    if (this.joints.size > 0) {
      const jointExplodeHints: Record<string, ExplodeViewDirective> = {};

      // Compute max depth for topological staging
      const depths = new Map<string, number>();
      for (const rootName of roots) depths.set(rootName, 0);
      const computeDepths = (partName: string, depth: number) => {
        depths.set(partName, depth);
        for (const joint of jointsByParent.get(partName) ?? []) {
          computeDepths(joint.child, depth + 1);
        }
      };
      for (const rootName of roots) computeDepths(rootName, 0);
      const maxDepth = Math.max(1, ...depths.values());

      for (const joint of this.joints.values()) {
        if (joint.type === 'fixed') continue;

        const parentWorld = world.get(joint.parent);
        if (!parentWorld) continue;

        // Compute world-space joint axis
        const axisWorld = parentWorld.vector(joint.frame.vector(joint.axis));
        const axisLen = Math.hypot(axisWorld[0], axisWorld[1], axisWorld[2]);
        if (axisLen <= 1e-8) continue;

        const dir: [number, number, number] = [axisWorld[0] / axisLen, axisWorld[1] / axisLen, axisWorld[2] / axisLen];

        // For revolute joints, separation is along the axis (pulling the pin out)
        // For prismatic joints, separation is along the slide axis
        const childName = joint.child;
        if (!jointExplodeHints[childName]) {
          const childDepth = depths.get(childName) ?? 1;
          // Topological staging: leaves get stage=1.0, root gets stage=0
          const topoStage = childDepth / maxDepth;

          const hint: ExplodeViewDirective = {
            direction: dir,
            stage: Math.max(0.15, topoStage),
          };

          // Fastener heuristics: detect by name
          if (isFastenerName(childName)) {
            hint.stage = 1.2; // Fasteners separate first/furthest
            hint.axisLock = dominantAxis(dir);
          }

          jointExplodeHints[childName] = hint;
        }
      }

      // Also apply topological staging to root parts (anchor them)
      for (const rootName of roots) {
        if (!jointExplodeHints[rootName]) {
          jointExplodeHints[rootName] = { stage: 0 };
        }
      }

      if (Object.keys(jointExplodeHints).length > 0) {
        explodeView({ byName: jointExplodeHints });
      }
    }

    return new SolvedAssembly(this.name, this.parts, world, jointValues, warnings, mateMetadata);
  }

  sweepJoint(
    jointName: string,
    from: number,
    to: number,
    steps: number,
    baseState: JointState = {},
    collisionOptions: CollisionOptions = {},
  ): JointSweepFrame[] {
    if (!this.joints.has(jointName)) throw new Error(`Unknown joint "${jointName}"`);
    if (this.jointCouplings.has(jointName)) {
      throw new Error(`Cannot sweep coupled joint "${jointName}". Sweep one of its source joints instead.`);
    }
    const n = Math.max(1, Math.floor(steps));
    const frames: JointSweepFrame[] = [];
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const value = from + (to - from) * t;
      const solved = this.solve({ ...baseState, [jointName]: value });
      frames.push({
        value,
        collisions: solved.collisionReport(collisionOptions),
        warnings: solved.warnings(),
      });
    }
    return frames;
  }

  /**
   * Derive `jointsView()` configuration from this assembly's joint graph and call it.
   *
   * Computes world-space pivots and axes from the solved rest pose, so you don't
   * have to manually restate joint kinematics for the viewport runtime.
   */
  toJointsView(options: ToJointsViewOptions = {}): void {
    // Solve at rest to get world transforms for all parts
    const restState: JointState = {};
    const solved = this.solve(restState);
    const def = this.describe();

    const joints: JointViewInput[] = [];
    for (const j of def.joints) {
      const parentWorld = solved.getTransform(j.parent);

      // Pivot: the joint frame origin mapped to world space
      const pivot = parentWorld.point(j.frame.point([0, 0, 0]));

      if (j.type === 'fixed') {
        // Fixed joints become zero-range revolute joints in jointsView so
        // attached parts follow their parent during viewport animation.
        // Hidden from the joints panel since they have no user-meaningful control.
        const parentAxis = parentWorld.vector([0, 0, 1]);
        const parentAxisLen = Math.hypot(parentAxis[0], parentAxis[1], parentAxis[2]);
        joints.push({
          name: j.name,
          child: j.child,
          parent: j.parent,
          type: 'revolute',
          axis: (parentAxisLen > 1e-10
            ? [parentAxis[0] / parentAxisLen, parentAxis[1] / parentAxisLen, parentAxis[2] / parentAxisLen]
            : [0, 0, 1]) as [number, number, number],
          pivot: pivot as [number, number, number],
          min: 0,
          max: 0,
          default: 0,
          hidden: true,
        });
        continue;
      }

      // Axis: the joint axis mapped through the frame then to world space
      // motionTransform uses axis in intermediate space; frame maps that to parent-local;
      // parentWorld maps parent-local to world.
      const axisWorld = parentWorld.vector(j.frame.vector(j.axis));
      const axisLen = Math.hypot(axisWorld[0], axisWorld[1], axisWorld[2]);
      const normalizedAxis: Vec3 = axisLen > 1e-10
        ? [axisWorld[0] / axisLen, axisWorld[1] / axisLen, axisWorld[2] / axisLen]
        : j.axis;

      const entry: JointViewInput = {
        name: j.name,
        child: j.child,
        parent: j.parent,
        type: j.type as JointViewType,
        axis: normalizedAxis as [number, number, number],
        pivot: pivot as [number, number, number],
        min: j.min,
        max: j.max,
        default: options.defaults?.[j.name] ?? j.defaultValue,
        unit: j.unit,
      };

      // Apply per-joint overrides
      if (options.overrides?.[j.name]) {
        Object.assign(entry, options.overrides[j.name]);
      }

      joints.push(entry);
    }

    // Derive couplings from assembly couplings
    const couplings: JointViewCouplingInput[] = options.couplings ?? def.jointCouplings.map((c) => ({
      joint: c.joint,
      terms: c.terms.map((t) => ({ joint: t.joint, ratio: t.ratio })),
      offset: c.offset,
    }));

    jointsViewFn({
      enabled: options.enabled ?? true,
      joints,
      couplings: couplings.length > 0 ? couplings : undefined,
      animations: options.animations,
      defaultAnimation: options.defaultAnimation,
    });
  }

  /**
   * Generate a cinematic disassembly animation from the assembly's joint graph.
   *
   * Creates a `jointsView()` configuration with a "Disassemble" animation that
   * sequences joint motions in reverse topological order (leaves first):
   * - Revolute joints swing open to their max angle
   * - Prismatic joints extend to their max distance
   * - Fastener-named parts get extra rotation (unscrewing effect)
   *
   * Translation/separation is handled by the explode system (auto-configured
   * by `solve()` with joint-derived directions). Use the explode slider in
   * combination with this animation for the full disassembly effect.
   */
  toDisassemblyView(options: ToDisassemblyViewOptions = {}): void {
    const solved = this.solve({});
    const def = this.describe();

    // ── Build joint tree ──────────────────────────────────────────────────────
    const incoming = new Map<string, AssemblyJointDef>();
    const childrenOf = new Map<string, AssemblyJointDef[]>();
    for (const j of def.joints) {
      incoming.set(j.child, j);
      const list = childrenOf.get(j.parent) ?? [];
      list.push(j);
      childrenOf.set(j.parent, list);
    }
    const roots = def.parts.map((p) => p.name).filter((name) => !incoming.has(name));

    // Compute depths
    const depths = new Map<string, number>();
    const computeDepths = (name: string, d: number) => {
      depths.set(name, d);
      for (const j of childrenOf.get(name) ?? []) computeDepths(j.child, d + 1);
    };
    for (const r of roots) computeDepths(r, 0);

    // ── Build jointsView joints with auto-synthesized separation carriers ─────
    // For each assembly joint, emit:
    //   parent → __sep_<child> (prismatic, hidden) → child (original joint)
    // This gives every part both separation (translation) and its original
    // kinematic motion (rotation/slide) without requiring manual carrier frames.
    const viewJoints: JointViewInput[] = [];
    const sepDist = options.separationDistance ?? 30;

    for (const j of def.joints) {
      const parentWorld = solved.getTransform(j.parent);
      const pivot = parentWorld.point(j.frame.point([0, 0, 0]));
      const carrierName = `__sep_${j.child}`;
      const sepJointName = `__sep_${j.name}`;

      // ── Separation direction ────────────────────────────────────────────
      // Fasteners (bolts/screws): pull out along joint axis.
      // Hinged parts (revolute non-fastener): separate perpendicular to the
      //   rotation axis, away from the parent — not along the hinge axis.
      // Fixed/prismatic: direction from parent center toward child center.
      const pCenter = solved.getTransform(j.parent).point([0, 0, 0]);
      const cCenter = solved.getTransform(j.child).point([0, 0, 0]);
      let sepAxis: [number, number, number];

      if (j.type === 'revolute' && isFastenerName(j.child)) {
        // Fasteners: pull out along shaft (= joint axis)
        const aw = parentWorld.vector(j.frame.vector(j.axis));
        const al = Math.hypot(aw[0], aw[1], aw[2]);
        sepAxis = al > 1e-10 ? [aw[0] / al, aw[1] / al, aw[2] / al] : [0, 0, 1];
      } else if (j.type === 'revolute') {
        // Hinged parts: separate in the "swing outward" direction.
        // cross(axis, pivot→childCenter) gives the direction the part swings into.
        const aw = parentWorld.vector(j.frame.vector(j.axis));
        const al = Math.hypot(aw[0], aw[1], aw[2]);
        const ax: [number, number, number] = al > 1e-10 ? [aw[0] / al, aw[1] / al, aw[2] / al] : [0, 0, 1];
        const pivotWorld = pivot as [number, number, number];
        const dx = cCenter[0] - pivotWorld[0];
        const dy = cCenter[1] - pivotWorld[1];
        const dz = cCenter[2] - pivotWorld[2];
        // cross(axis, pivot→center) = swing-outward direction
        const cx = ax[1] * dz - ax[2] * dy;
        const cy = ax[2] * dx - ax[0] * dz;
        const cz = ax[0] * dy - ax[1] * dx;
        const cl = Math.hypot(cx, cy, cz);
        if (cl > 1e-6) {
          sepAxis = [cx / cl, cy / cl, cz / cl];
        } else {
          // Child center is on the axis — fall back to perpendicular
          // Pick a vector not parallel to axis and cross with it
          const ref: [number, number, number] = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
          const px = ax[1] * ref[2] - ax[2] * ref[1];
          const py = ax[2] * ref[0] - ax[0] * ref[2];
          const pz = ax[0] * ref[1] - ax[1] * ref[0];
          const pl = Math.hypot(px, py, pz);
          sepAxis = pl > 1e-10 ? [px / pl, py / pl, pz / pl] : [0, 0, 1];
        }
      } else if (j.type === 'prismatic') {
        // Prismatic: separate along slide axis
        const aw = parentWorld.vector(j.frame.vector(j.axis));
        const al = Math.hypot(aw[0], aw[1], aw[2]);
        sepAxis = al > 1e-10 ? [aw[0] / al, aw[1] / al, aw[2] / al] : [0, 0, 1];
      } else {
        // Fixed: direction from parent center toward child center
        const dx = cCenter[0] - pCenter[0];
        const dy = cCenter[1] - pCenter[1];
        const dz = cCenter[2] - pCenter[2];
        const dl = Math.hypot(dx, dy, dz);
        if (dl > 1e-6) {
          sepAxis = [dx / dl, dy / dl, dz / dl];
        } else {
          const up = parentWorld.vector([0, 0, 1]);
          const ul = Math.hypot(up[0], up[1], up[2]);
          sepAxis = ul > 1e-10 ? [up[0] / ul, up[1] / ul, up[2] / ul] : [0, 0, 1];
        }
      }

      // ── Prismatic separation: parent → carrier ──────────────────────────
      viewJoints.push({
        name: sepJointName,
        child: carrierName,
        parent: j.parent,
        type: 'prismatic',
        axis: sepAxis,
        pivot: pivot as [number, number, number],
        min: 0,
        max: sepDist,
        default: 0,
        hidden: true,
      });

      // ── Original kinematic joint: carrier → child ───────────────────────
      if (j.type === 'fixed') {
        // Zero-range revolute so the child follows its carrier
        viewJoints.push({
          name: j.name,
          child: j.child,
          parent: carrierName,
          type: 'revolute',
          axis: [0, 0, 1],
          pivot: pivot as [number, number, number],
          min: 0,
          max: 0,
          default: 0,
          hidden: true,
        });
      } else {
        const aw = parentWorld.vector(j.frame.vector(j.axis));
        const al = Math.hypot(aw[0], aw[1], aw[2]);
        const normalizedAxis: Vec3 = al > 1e-10
          ? [aw[0] / al, aw[1] / al, aw[2] / al]
          : j.axis;

        const isFastener = isFastenerName(j.child);
        let max = j.max;
        if (j.type === 'revolute') {
          max = isFastener
            ? Math.max(max ?? 720, options.unscrewAngle ?? 720)
            : Math.max(max ?? 90, options.swingAngle ?? 90);
        } else if (j.type === 'prismatic') {
          max = Math.max(max ?? 60, sepDist);
        }

        viewJoints.push({
          name: j.name,
          child: j.child,
          parent: carrierName,
          type: j.type as JointViewType,
          axis: normalizedAxis as [number, number, number],
          pivot: pivot as [number, number, number],
          min: j.min ?? 0,
          max,
          default: j.defaultValue,
          unit: j.unit,
        });
      }
    }

    // ── Generate animation keyframes ──────────────────────────────────────────
    // Group parts by assembly tree depth (deepest first = leaves disassemble first).
    // Each depth stage animates BOTH separation and rotation simultaneously.
    interface DisassemblyItem {
      sepJointName: string;
      rotJointName: string | undefined;
      joint: AssemblyJointDef;
    }

    const depthGroups = new Map<number, DisassemblyItem[]>();
    for (const j of def.joints) {
      const d = depths.get(j.child) ?? 0;
      if (d === 0) continue; // roots stay anchored
      const group = depthGroups.get(d) ?? [];
      group.push({
        sepJointName: `__sep_${j.name}`,
        rotJointName: j.type !== 'fixed' ? j.name : undefined,
        joint: j,
      });
      depthGroups.set(d, group);
    }

    const sortedDepths = [...depthGroups.keys()].sort((a, b) => b - a);
    const numStages = sortedDepths.length;

    if (numStages > 0) {
      const duration = options.duration ?? Math.max(3, numStages * 1.5);
      const keyframes: JointViewAnimationKeyframeInput[] = [];

      // Start: everything at rest
      const startValues: Record<string, number> = {};
      for (const items of depthGroups.values()) {
        for (const item of items) {
          startValues[item.sepJointName] = 0;
          if (item.rotJointName) startValues[item.rotJointName] = item.joint.defaultValue;
        }
      }
      keyframes.push({ at: 0, values: { ...startValues } });

      // Each depth level gets a time slice
      const sliceDuration = 1 / numStages;
      for (let i = 0; i < numStages; i++) {
        const items = depthGroups.get(sortedDepths[i])!;
        const sliceEnd = (i + 1) * sliceDuration;

        const values: Record<string, number> = {};
        for (const item of items) {
          // Separation
          values[item.sepJointName] = sepDist;

          // Rotation / kinematic motion
          if (item.rotJointName) {
            const isFastener = isFastenerName(item.joint.child);
            if (item.joint.type === 'revolute') {
              values[item.rotJointName] = isFastener
                ? (options.unscrewAngle ?? 720)
                : Math.max(item.joint.max ?? 90, options.swingAngle ?? 90);
            } else {
              values[item.rotJointName] = Math.max(item.joint.max ?? 60, sepDist);
            }
          }
        }
        keyframes.push({ at: Math.min(sliceEnd, 0.999), values });
      }

      // End: hold final state
      const endValues: Record<string, number> = {};
      for (const kf of keyframes) Object.assign(endValues, kf.values);
      keyframes.push({ at: 1, values: endValues });

      const couplings: JointViewCouplingInput[] = options.couplings ?? def.jointCouplings.map((c) => ({
        joint: c.joint,
        terms: c.terms.map((t) => ({ joint: t.joint, ratio: t.ratio })),
        offset: c.offset,
      }));

      jointsViewFn({
        enabled: options.enabled ?? true,
        joints: viewJoints,
        couplings: couplings.length > 0 ? couplings : undefined,
        animations: [
          ...(options.animations ?? []),
          {
            name: 'Disassemble',
            duration,
            loop: false,
            continuous: false,
            keyframes,
          },
        ],
        defaultAnimation: options.defaultAnimation ?? 'Disassemble',
      });
    }
  }

  describe(): AssemblyDefinition {
    return {
      name: this.name,
      parts: [...this.parts.values()].map((part) => ({
        name: part.name,
        part: part.part,
        base: part.base,
        metadata: part.metadata ? { ...part.metadata } : undefined,
      })),
      joints: [...this.joints.values()].map((joint) => ({
        name: joint.name,
        type: joint.type,
        parent: joint.parent,
        child: joint.child,
        frame: joint.frame,
        axis: [...joint.axis] as Vec3,
        min: joint.min,
        max: joint.max,
        defaultValue: joint.defaultValue,
        unit: joint.unit,
        effort: joint.effort,
        velocity: joint.velocity,
        damping: joint.damping,
        friction: joint.friction,
      })),
      jointCouplings: [...this.jointCouplings.values()].map((coupling) => ({
        joint: coupling.joint,
        terms: coupling.terms.map((term) => ({ joint: term.joint, ratio: term.ratio })),
        offset: coupling.offset,
      })),
    };
  }
}

/**
 * Create an assembly container with named parts and joints for kinematic mechanisms.
 *
 * Build with addPart(), addJoint(), addJointCoupling(), addGearCoupling(), then
 * solve() to get positioned parts. Supports revolute, prismatic, and fixed joint types.
 */
export function assembly(name?: string): Assembly {
  return new Assembly(name);
}

export interface MergeIntoOptions {
  /**
   * Prefix applied to every part name and joint name from the sub-assembly.
   * E.g. prefix "Left Arm" turns part "Base" into "Left Arm.Base".
   * Strongly recommended to avoid name collisions when merging multiple instances.
   */
  prefix?: string;
  /** Part name in the parent assembly to attach the sub-assembly root to. */
  mountParent: string;
  /** Name for the new mount joint in the parent graph. */
  mountJoint: string;
  /** Joint type for the mount connection (default: 'fixed'). */
  mountType?: JointType;
  /** Frame, axis, limits, and other options for the mount joint. */
  mountOptions?: JointOptions;
}

/**
 * Wraps an imported Assembly, giving access to named parts and group conversion
 * without losing the kinematic structure.
 *
 * Supports placement references (`.withReferences()` / `.placeReference()`) so
 * sub-assemblies can be positioned the same way as imported parts and groups.
 */
export class ImportedAssembly {
  constructor(
    private readonly _assembly: Assembly,
    private readonly _refs: PlacementReferences = createPlacementReferences(),
    private readonly _offset: readonly [number, number, number] = [0, 0, 0],
  ) {}

  /** The underlying Assembly — use for sweepJoint, addPart into parent, etc. */
  get assembly(): Assembly {
    return this._assembly;
  }

  /** Solve the assembly at the given joint state (defaults to each joint's default value). */
  solve(state?: JointState): SolvedAssembly {
    return this._assembly.solve(state);
  }

  /**
   * Return a specific named part positioned at the given joint state, with any
   * stored placement offset applied.
   */
  part(name: string, state?: JointState): AssemblyPart {
    const p = this._assembly.solve(state).getPart(name);
    const [dx, dy, dz] = this._offset;
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      return applyTransformToPart(p, Transform.identity().translate(dx, dy, dz));
    }
    return p;
  }

  /**
   * Convert all assembly parts to a ShapeGroup with named children.
   * Child names match the part names used in the assembly.
   * Any stored placement offset and placement references are forwarded to the group.
   */
  toGroup(state?: JointState): ShapeGroup {
    const solved = this._assembly.solve(state);
    const def = this._assembly.describe();
    const children: AssemblyPart[] = [];
    const childNames: string[] = [];
    for (const p of def.parts) {
      children.push(solved.getPart(p.name));
      childNames.push(p.name);
    }
    let result = new ShapeGroup(children, childNames);
    const [dx, dy, dz] = this._offset;
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      result = result.translate(dx, dy, dz);
    }
    if (hasPlacementReferences(this._refs)) {
      // Convert internal refs back to input format for ShapeGroup.withReferences().
      // Only point refs are stored on ImportedAssembly; they are already translated.
      const refsInput: PlacementReferenceInput = {
        points: Object.fromEntries(Object.entries(this._refs.points).map(([k, v]) => [k, [...v] as [number, number, number]])),
      };
      result = result.withReferences(refsInput);
    }
    return result;
  }

  /**
   * Attach named placement reference points to this assembly.
   * Points are simple 3D coordinates (relative to the assembly's own origin).
   * Returns a new ImportedAssembly — does not mutate.
   */
  withReferences(refs: Pick<PlacementReferenceInput, 'points'>): ImportedAssembly {
    const merged = applyPlacementReferenceInput(clonePlacementReferences(this._refs), refs);
    return new ImportedAssembly(this._assembly, merged, this._offset);
  }

  /** List all attached placement reference names. */
  referenceNames(kind?: PlacementReferenceKind): string[] {
    return placementReferenceNames(this._refs, kind);
  }

  /**
   * Translate the assembly so the named reference point lands on `target`.
   * Returns a new ImportedAssembly — does not mutate.
   * All point refs are translated by the same delta.
   */
  placeReference(ref: string, target: [number, number, number], offset?: [number, number, number]): ImportedAssembly {
    const sourcePoint = resolvePlacementReferencePoint(this._refs, ref);
    if (!sourcePoint) {
      const available = this.referenceNames().join(', ') || 'none';
      throw new Error(`ImportedAssembly has no placement reference "${ref}". Available: ${available}`);
    }
    const dx = target[0] - sourcePoint[0] + (offset?.[0] ?? 0);
    const dy = target[1] - sourcePoint[1] + (offset?.[1] ?? 0);
    const dz = target[2] - sourcePoint[2] + (offset?.[2] ?? 0);
    // Translate all stored point refs by the same delta.
    const newPointRefs: Record<string, [number, number, number]> = {};
    for (const [name, pt] of Object.entries(this._refs.points)) {
      newPointRefs[name] = [pt[0] + dx, pt[1] + dy, pt[2] + dz];
    }
    const newRefs = applyPlacementReferenceInput(createPlacementReferences(), { points: newPointRefs });
    const newOffset: [number, number, number] = [this._offset[0] + dx, this._offset[1] + dy, this._offset[2] + dz];
    return new ImportedAssembly(this._assembly, newRefs, newOffset);
  }

  // ── Convenience transforms ─────────────────────────────────────────
  // These solve the assembly at default joint values, convert to a
  // ShapeGroup, and apply the transform.  The result is a ShapeGroup
  // (not an ImportedAssembly) because transforms lose kinematic identity.

  /** Solve at defaults and return a translated ShapeGroup. */
  translate(x: number, y: number, z: number): ShapeGroup {
    return this.toGroup().translate(x, y, z);
  }

  /** Solve at defaults and return a rotated ShapeGroup (Euler XYZ degrees). */
  rotate(x: number, y: number, z: number): ShapeGroup {
    return this.toGroup().rotate(x, y, z);
  }

  /** Solve at defaults and return a scaled ShapeGroup. */
  scale(v: number | [number, number, number]): ShapeGroup {
    return this.toGroup().scale(v);
  }

  /** Solve at defaults and return a mirrored ShapeGroup. */
  mirror(normal: [number, number, number]): ShapeGroup {
    return this.toGroup().mirror(normal);
  }

  /** Solve at defaults and return a colored ShapeGroup. */
  color(hex: string): ShapeGroup {
    return this.toGroup().color(hex);
  }

  /** Solve at defaults, get a named child part from the resulting group. */
  child(name: string): Shape | Sketch | TrackedShape | ShapeGroup {
    return this.toGroup().child(name);
  }

  /**
   * Flatten this sub-assembly's parts and joints into `parent`, then wire a
   * mount joint connecting `mountParent` (a part already in `parent`) to the
   * sub-assembly root.
   *
   * All part names and joint names from the sub-assembly are prefixed with
   * `"${options.prefix}."` to avoid collisions. After the merge you can drive
   * sub-assembly joints from the parent: `parent.solve({ "Left Arm.shoulder": 45 })`.
   *
   * Throws if the sub-assembly has multiple root parts (connect them with addFixed first).
   *
   * Returns `parent` for chaining.
   */
  mergeInto(parent: Assembly, options: MergeIntoOptions): Assembly {
    const def = this._assembly.describe();
    const pfx = options.prefix ? `${options.prefix}.` : '';

    // Identify the single root part (no incoming joint).
    const childSet = new Set(def.joints.map((j) => j.child));
    const roots = def.parts.filter((p) => !childSet.has(p.name));
    if (roots.length === 0) {
      throw new Error(`Cannot mergeInto(): sub-assembly "${def.name}" has no root part (cyclic joint graph)`);
    }
    if (roots.length > 1) {
      throw new Error(
        `Cannot mergeInto(): sub-assembly "${def.name}" has multiple root parts ` +
          `(${roots.map((r) => `"${r.name}"`).join(', ')}). ` +
          'Connect them with addFixed() before merging.',
      );
    }
    const root = roots[0];

    // Add all parts with prefixed names; preserve each part's base transform.
    for (const p of def.parts) {
      parent.addPart(`${pfx}${p.name}`, p.part, {
        transform: p.base,
        metadata: p.metadata,
      });
    }

    // Add all joints with prefixed names and prefixed parent/child references.
    for (const j of def.joints) {
      parent.addJoint(`${pfx}${j.name}`, j.type, `${pfx}${j.parent}`, `${pfx}${j.child}`, {
        frame: j.frame,
        axis: [...j.axis] as Vec3,
        min: j.min,
        max: j.max,
        default: j.defaultValue,
        unit: j.unit,
        effort: j.effort,
        velocity: j.velocity,
        damping: j.damping,
        friction: j.friction,
      });
    }

    // Add all joint couplings with prefixed joint references.
    for (const c of def.jointCouplings) {
      parent.addJointCoupling(`${pfx}${c.joint}`, {
        terms: c.terms.map((t) => ({ joint: `${pfx}${t.joint}`, ratio: t.ratio })),
        offset: c.offset,
      });
    }

    // Forward ports from the sub-assembly parts to the parent with prefix.
    const allPorts = this._assembly.getAllPorts();
    for (const [partName, ports] of allPorts) {
      if (partName === '__assembly__') continue;
      const prefixedName = `${pfx}${partName}`;
      if (Object.keys(ports).length > 0) {
        parent._setPortsDirect(prefixedName, ports);
      }
    }

    // Wire the mount joint: parent part → sub-assembly root.
    parent.addJoint(
      options.mountJoint,
      options.mountType ?? 'fixed',
      options.mountParent,
      `${pfx}${root.name}`,
      options.mountOptions ?? {},
    );

    return parent;
  }
}

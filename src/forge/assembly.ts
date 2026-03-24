import { isManifoldCapableBackend, requireManifoldShapeBackend } from './backends/manifold/shapeBackend';
import { bodyFromTrackedShape, MateBuilder } from './constraints3d/builder';
import type { Mat3 } from './constraints3d/rodrigues';
import { normalize3, rodrigues, sub3 } from './constraints3d/rodrigues';
import { createContext, solve3D } from './constraints3d/solver';
import type { Constraint3D, RigidBody, Solve3DResult, Solver3DContext } from './constraints3d/types';
import type { ExplodeViewDirective } from './explodeView';
import { explodeView } from './explodeView';
import { group, ShapeGroup } from './group';
import { getShapeRuntimeBackend, Shape, union } from './kernel';
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
} from './placement';
import { TrackedShape } from './sketch/topology';
import { composeChain, type Mat4, normalizeAxis, Transform, type TransformInput, type Vec3 } from './transform';

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

  toScene(): Array<{
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

export class Assembly {
  private readonly parts = new Map<string, PartRecord>();
  private readonly joints = new Map<string, JointRecord>();
  private readonly jointCouplings = new Map<string, JointCouplingRecord>();
  private readonly _mateFns: Array<(m: MateBuilder) => void> = [];
  private _refs: PlacementReferences = createPlacementReferences();

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
   * imported with importAssembly(), so consumers can use placeReference() without
   * re-declaring them.
   * Returns `this` for chaining.
   */
  withReferences(refs: Pick<PlacementReferenceInput, 'points'>): Assembly {
    this._refs = applyPlacementReferenceInput(this._refs, refs);
    return this;
  }

  /** @internal — used by importAssembly() to seed ImportedAssembly refs. */
  getReferences(): PlacementReferences {
    return clonePlacementReferences(this._refs);
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

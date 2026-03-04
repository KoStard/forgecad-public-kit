import { Shape, union } from './kernel';
import { ShapeGroup, group } from './group';
import { TrackedShape } from './sketch/topology';
import { Transform, composeChain, normalizeAxis, type TransformInput, type Vec3 } from './transform';

export type AssemblyPart = Shape | TrackedShape | ShapeGroup;
export type JointType = 'fixed' | 'revolute' | 'prismatic';
export type JointState = Record<string, number | undefined>;

export interface PartMetadata {
  material?: string;
  process?: string;
  tolerance?: string;
  qty?: number;
  notes?: string;
  [key: string]: unknown;
}

export interface PartOptions {
  transform?: TransformInput;
  metadata?: PartMetadata;
}

export interface JointOptions {
  frame?: TransformInput;
  axis?: Vec3;
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
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
}

export interface GearCouplingOptions {
  ratio?: number;
  pair?: GearRatioLike;
  driverTeeth?: number;
  drivenTeeth?: number;
  mesh?: 'external' | 'internal' | 'bevel' | 'face';
  offset?: number;
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
    lines.push([
      esc(row.part),
      String(row.qty),
      esc(row.material ?? ''),
      esc(row.process ?? ''),
      esc(row.tolerance ?? ''),
      esc(row.notes ?? ''),
    ].join(','));
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
    if (child instanceof TrackedShape) out.push(child.toShape());
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

export class SolvedAssembly {
  constructor(
    public readonly name: string,
    private readonly parts: Map<string, PartRecord>,
    private readonly transforms: Map<string, Transform>,
    private readonly jointValues: JointState,
    private readonly solveWarnings: string[],
  ) {}

  warnings(): string[] {
    return [...this.solveWarnings];
  }

  getJointState(): JointState {
    return { ...this.jointValues };
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
        part.children.forEach((child, index) => {
          if (child instanceof TrackedShape) groupItems.push({ name: `${name}.${index + 1}`, shape: child.toShape() });
          else if (child instanceof Shape) groupItems.push({ name: `${name}.${index + 1}`, shape: child });
        });
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
    const names = (options.parts ?? [...this.parts.keys()]).filter(name => this.parts.has(name));
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
    return a.minGap(b, searchLength);
  }
}

export class Assembly {
  private readonly parts = new Map<string, PartRecord>();
  private readonly joints = new Map<string, JointRecord>();
  private readonly jointCouplings = new Map<string, JointCouplingRecord>();

  constructor(public readonly name = 'Assembly') {}

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

  addJoint(
    name: string,
    type: JointType,
    parent: string,
    child: string,
    options: JointOptions = {},
  ): Assembly {
    if (this.joints.has(name)) throw new Error(`Joint "${name}" already exists`);
    if (!this.parts.has(parent)) throw new Error(`Unknown parent part "${parent}"`);
    if (!this.parts.has(child)) throw new Error(`Unknown child part "${child}"`);
    if (parent === child) throw new Error(`Joint "${name}" cannot connect a part to itself`);

    const axis = normalizeAxis(options.axis ?? [0, 0, 1]);
    this.joints.set(name, {
      name,
      type,
      parent,
      child,
      frame: options.frame ? Transform.from(options.frame) : Transform.identity(),
      axis,
      min: options.min,
      max: options.max,
      defaultValue: options.default ?? 0,
      unit: options.unit,
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

  addGearCoupling(
    drivenJointName: string,
    driverJointName: string,
    options: GearCouplingOptions = {},
  ): Assembly {
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
      throw new Error(
        `Gear coupling "${drivenJointName}" must provide exactly one ratio source: ratio, pair, or driverTeeth/drivenTeeth`,
      );
    }

    if ((options.mesh !== undefined) && !usingTeeth) {
      throw new Error(
        `Gear coupling "${drivenJointName}" mesh may only be set when using driverTeeth/drivenTeeth`,
      );
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

    const roots = [...this.parts.keys()].filter(name => !incoming.has(name));
    if (roots.length === 0 && this.parts.size > 0) {
      throw new Error('Assembly has no root part (cyclic joint graph)');
    }

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
        // Canonical frame composition order for Forge chain semantics:
        // local -> childBase -> jointMotion -> jointFrame -> parentWorld
        const childWorld = composeChain(
          child.base,
          motionTransform(joint, value),
          joint.frame,
          worldTransform,
        );
        dfs(joint.child, childWorld);
      }
      visiting.delete(partName);
    };

    for (const rootName of roots) {
      const root = this.parts.get(rootName)!;
      dfs(rootName, root.base);
    }

    if (visited.size !== this.parts.size) {
      const missing = [...this.parts.keys()].filter(name => !visited.has(name));
      throw new Error(`Assembly graph unresolved for parts: ${missing.join(', ')}`);
    }

    return new SolvedAssembly(this.name, this.parts, world, jointValues, warnings);
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
}

export function assembly(name?: string): Assembly {
  return new Assembly(name);
}

import type {
  AssemblyDefinition,
  AssemblyJointCouplingDef,
  AssemblyJointDef,
  AssemblyPart,
  AssemblyPartDef,
  JointType,
  PartMetadata,
} from './assembly/assembly';
import { buildBinaryStl } from './exportMesh';
import { ShapeGroup } from './group';
import { Shape, union } from './kernel';
import { computeMeshInertia } from './mesh/meshInertia';
import type { CollectedRobotExport } from './robotExport';
import { TrackedShape } from './sketch/topology';
import { composeChain, Transform } from './transform';

const DEFAULT_DENSITY_KG_M3 = 1000;
const STL_SCALE_METERS = 0.001;
const MIN_LINK_MASS_KG = 0.001;

export interface UrdfPackageFile {
  path: string;
  text?: string;
  bytes?: Uint8Array;
}

export interface UrdfPackageManifestLink {
  sourceName: string;
  urdfName: string;
  visualMesh: string;
  collisionMesh?: string;
  massKg: number;
}

export interface UrdfPackageManifestJoint {
  sourceName: string;
  urdfName: string;
  parent: string;
  child: string;
  type: string;
}

export interface UrdfPackageManifest {
  format: 'forgecad-urdf-package';
  modelName: string;
  sourceModelName: string;
  urdfPath: string;
  links: UrdfPackageManifestLink[];
  joints: UrdfPackageManifestJoint[];
  warnings: string[];
}

export interface UrdfPackageOutput {
  modelName: string;
  manifest: UrdfPackageManifest;
  files: UrdfPackageFile[];
}

// ---------------------------------------------------------------------------
// Shared utilities (mirrored from sdfExport for independence)
// ---------------------------------------------------------------------------

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function sanitizeToken(value: string, fallback: string): string {
  const slug = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || fallback;
}

function uniqueNameMap(names: string[], fallbackPrefix: string): Map<string, string> {
  const counts = new Map<string, number>();
  const out = new Map<string, string>();
  names.forEach((name, index) => {
    const base = sanitizeToken(name, `${fallbackPrefix}_${index + 1}`);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    out.set(name, count === 0 ? base : `${base}_${count + 1}`);
  });
  return out;
}

function mmToM(valueMm: number): number {
  return valueMm / 1000;
}

function degToRad(valueDeg: number): number {
  return (valueDeg * Math.PI) / 180;
}

function formatNumber(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return '0';
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return normalized.toFixed(digits).replace(/\.?0+$/, '');
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface LinkGeometry {
  part: AssemblyPartDef;
  shapes: Shape[];
  volumeMm3: number;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
}

function flattenPartShapes(part: AssemblyPart, out: Shape[]): void {
  if (part instanceof TrackedShape) {
    out.push(part.toShape());
    return;
  }
  if (part instanceof Shape) {
    out.push(part);
    return;
  }
  if (part instanceof ShapeGroup) {
    part.children.forEach((child) => flattenPartShapes(child as AssemblyPart, out));
  }
}

function transformedShapes(part: AssemblyPartDef): Shape[] {
  const shapes: Shape[] = [];
  flattenPartShapes(part.part, shapes);
  return shapes.map((shape) => shape.transform(part.base));
}

function linkGeometry(part: AssemblyPartDef): LinkGeometry {
  const shapes = transformedShapes(part);
  if (shapes.length === 0) {
    throw new Error(`URDF export requires geometry on every part. "${part.name}" is empty.`);
  }
  const bboxMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const bboxMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let volumeMm3 = 0;
  shapes.forEach((shape) => {
    const bbox = shape.boundingBox();
    volumeMm3 += shape.volume();
    for (let axis = 0; axis < 3; axis += 1) {
      bboxMin[axis] = Math.min(bboxMin[axis], bbox.min[axis]);
      bboxMax[axis] = Math.max(bboxMax[axis], bbox.max[axis]);
    }
  });
  return { part, shapes, volumeMm3, bboxMin, bboxMax };
}

// ---------------------------------------------------------------------------
// Joint & coupling helpers
// ---------------------------------------------------------------------------

function motionTransform(joint: AssemblyJointDef, value: number): Transform {
  if (joint.type === 'fixed') return Transform.identity();
  if (joint.type === 'revolute') return Transform.identity().rotateAxis(joint.axis, value);
  return Transform.identity().translate(joint.axis[0] * value, joint.axis[1] * value, joint.axis[2] * value);
}

function clampJointValue(joint: AssemblyJointDef, value: number): { value: number; clamped: boolean } {
  let next = Number.isFinite(value) ? value : joint.defaultValue;
  if (joint.min !== undefined) next = Math.max(joint.min, next);
  if (joint.max !== undefined) next = Math.min(joint.max, next);
  return { value: next, clamped: next !== value };
}

function resolveJointValues(
  assembly: AssemblyDefinition,
  state: Record<string, number | undefined>,
  warnings: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  assembly.joints.forEach((joint) => {
    const raw = state[joint.name] ?? joint.defaultValue;
    const { value, clamped } = clampJointValue(joint, raw);
    out[joint.name] = value;
    if (clamped) {
      warnings.push(`Joint "${joint.name}" was clamped from ${raw} to ${value}${joint.unit ?? ''}`);
    }
  });
  // Propagate coupled joints
  for (const coupling of assembly.jointCouplings) {
    let value = coupling.offset;
    for (const term of coupling.terms) {
      value += term.ratio * (out[term.joint] ?? 0);
    }
    out[coupling.joint] = value;
  }
  return out;
}

function computeLinkFrameWorlds(assembly: AssemblyDefinition, jointValues: Record<string, number>): Map<string, Transform> {
  const jointsByParent = new Map<string, AssemblyJointDef[]>();
  const incoming = new Set<string>();
  assembly.joints.forEach((joint) => {
    incoming.add(joint.child);
    const list = jointsByParent.get(joint.parent) ?? [];
    list.push(joint);
    jointsByParent.set(joint.parent, list);
  });
  const worlds = new Map<string, Transform>();
  const roots = assembly.parts.filter((part) => !incoming.has(part.name));
  const visit = (partName: string, world: Transform) => {
    worlds.set(partName, world);
    (jointsByParent.get(partName) ?? []).forEach((joint) => {
      const childWorld = composeChain(motionTransform(joint, jointValues[joint.name] ?? joint.defaultValue), joint.frame, world);
      visit(joint.child, childWorld);
    });
  };
  roots.forEach((root) => visit(root.name, Transform.identity()));
  return worlds;
}

// ---------------------------------------------------------------------------
// Mass / inertia
// ---------------------------------------------------------------------------

function combineMetadataNumber(
  metadata: PartMetadata | undefined,
  linkValue: number | undefined,
  key: 'massKg' | 'densityKgM3',
): number | undefined {
  if (linkValue !== undefined) return linkValue;
  const fromMetadata = metadata?.[key];
  return typeof fromMetadata === 'number' ? fromMetadata : undefined;
}

function estimateLinkMassKg(
  geometry: LinkGeometry,
  linkOverrideMassKg: number | undefined,
  linkOverrideDensityKgM3: number | undefined,
): number {
  const metadata = geometry.part.metadata;
  const explicitMass = combineMetadataNumber(metadata, linkOverrideMassKg, 'massKg');
  if (explicitMass !== undefined) return Math.max(MIN_LINK_MASS_KG, explicitMass);
  const densityKgM3 = combineMetadataNumber(metadata, linkOverrideDensityKgM3, 'densityKgM3') ?? DEFAULT_DENSITY_KG_M3;
  const volumeM3 = geometry.volumeMm3 * 1e-9;
  return Math.max(MIN_LINK_MASS_KG, densityKgM3 * volumeM3);
}

function resolveCollisionMode(
  metadata: PartMetadata | undefined,
  collision: 'visual' | 'convex' | 'box' | 'none' | undefined,
): 'visual' | 'convex' | 'box' | 'none' {
  if (collision) return collision;
  const fromMetadata = metadata?.collision;
  if (fromMetadata === 'none' || fromMetadata === 'visual' || fromMetadata === 'box' || fromMetadata === 'convex')
    return fromMetadata as 'visual' | 'convex' | 'box' | 'none';
  return 'convex';
}

// ---------------------------------------------------------------------------
// Transform → URDF origin
// ---------------------------------------------------------------------------

function transformToOrigin(transform: Transform): string {
  const m = transform.toArray();
  const r00 = m[0],
    _r01 = m[4],
    _r02 = m[8];
  const r10 = m[1],
    r11 = m[5],
    r12 = m[9];
  const r20 = m[2],
    r21 = m[6],
    r22 = m[10];
  const pitch = Math.atan2(-r20, Math.sqrt(r00 * r00 + r10 * r10));
  let roll: number, yaw: number;
  if (Math.abs(Math.cos(pitch)) < 1e-8) {
    roll = Math.atan2(-r12, r11);
    yaw = 0;
  } else {
    roll = Math.atan2(r21, r22);
    yaw = Math.atan2(r10, r00);
  }
  const x = mmToM(m[12]),
    y = mmToM(m[13]),
    z = mmToM(m[14]);
  return `xyz="${formatNumber(x)} ${formatNumber(y)} ${formatNumber(z)}" rpy="${formatNumber(roll)} ${formatNumber(pitch)} ${formatNumber(yaw)}"`;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function sRgbFloat(hex: string | undefined): [number, number, number] | null {
  if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

// ---------------------------------------------------------------------------
// URDF joint type mapping
// ---------------------------------------------------------------------------

function urdfJointType(type: JointType): string {
  if (type === 'revolute') return 'revolute';
  if (type === 'prismatic') return 'prismatic';
  return 'fixed';
}

function _urdfJointHasLimits(joint: AssemblyJointDef): boolean {
  return joint.type !== 'fixed' && (joint.min !== undefined || joint.max !== undefined);
}

function urdfJointHasContinuous(joint: AssemblyJointDef): boolean {
  return joint.type === 'revolute' && joint.min === undefined && joint.max === undefined;
}

// ---------------------------------------------------------------------------
// URDF XML generation
// ---------------------------------------------------------------------------

function urdfXml(
  spec: CollectedRobotExport,
  modelName: string,
  linkNameMap: Map<string, string>,
  jointNameMap: Map<string, string>,
  geometries: Map<string, LinkGeometry>,
  _linkWorlds: Map<string, Transform>,
  collisionMeshes: Map<string, string>,
  warnings: string[],
): string {
  // Coupling lookup
  const couplingByJoint = new Map<string, AssemblyJointCouplingDef>();
  for (const coupling of spec.assembly.jointCouplings) {
    couplingByJoint.set(coupling.joint, coupling);
  }

  const linksXml = spec.assembly.parts
    .map((part) => {
      const urdfLinkName = linkNameMap.get(part.name)!;
      const geometry = geometries.get(part.name)!;
      const linkOptions = spec.links[part.name];
      const massKg = estimateLinkMassKg(geometry, linkOptions?.massKg, linkOptions?.densityKgM3);

      // Inertia from mesh
      let ixx: number, iyy: number, izz: number, ixy: number, ixz: number, iyz: number;
      let comX: number, comY: number, comZ: number;
      const combinedMesh = geometry.shapes.length === 1 ? geometry.shapes[0].getMesh() : union(...geometry.shapes).getMesh();
      if (combinedMesh.numTri > 0) {
        const mi = computeMeshInertia(combinedMesh, massKg);
        comX = mmToM(mi.centerOfMass[0]);
        comY = mmToM(mi.centerOfMass[1]);
        comZ = mmToM(mi.centerOfMass[2]);
        ixx = mi.ixx;
        iyy = mi.iyy;
        izz = mi.izz;
        ixy = mi.ixy;
        ixz = mi.ixz;
        iyz = mi.iyz;
      } else {
        const dx = mmToM(geometry.bboxMax[0] - geometry.bboxMin[0]);
        const dy = mmToM(geometry.bboxMax[1] - geometry.bboxMin[1]);
        const dz = mmToM(geometry.bboxMax[2] - geometry.bboxMin[2]);
        comX = mmToM((geometry.bboxMin[0] + geometry.bboxMax[0]) * 0.5);
        comY = mmToM((geometry.bboxMin[1] + geometry.bboxMax[1]) * 0.5);
        comZ = mmToM((geometry.bboxMin[2] + geometry.bboxMax[2]) * 0.5);
        ixx = (massKg * (dy * dy + dz * dz)) / 12;
        iyy = (massKg * (dx * dx + dz * dz)) / 12;
        izz = (massKg * (dx * dx + dy * dy)) / 12;
        ixy = 0;
        ixz = 0;
        iyz = 0;
      }

      const collisionMode = resolveCollisionMode(part.metadata, linkOptions?.collision);
      const _visualMeshPath = `meshes/${urdfLinkName}.stl`;
      const color = sRgbFloat(geometry.shapes[0]?.colorHex);
      const materialXml = color
        ? `
        <material name="${escapeXml(urdfLinkName)}_material">
          <color rgba="${formatNumber(color[0], 3)} ${formatNumber(color[1], 3)} ${formatNumber(color[2], 3)} 1"/>
        </material>`
        : '';

      // Collision geometry
      let collisionXml = '';
      if (collisionMode === 'visual') {
        collisionXml = `
    <collision>
      <geometry>
        <mesh filename="package://${escapeXml(modelName)}/meshes/${escapeXml(urdfLinkName)}.stl" scale="${STL_SCALE_METERS} ${STL_SCALE_METERS} ${STL_SCALE_METERS}"/>
      </geometry>
    </collision>`;
      } else if (collisionMode === 'convex') {
        const colPath = collisionMeshes.get(part.name);
        if (colPath) {
          collisionXml = `
    <collision>
      <geometry>
        <mesh filename="package://${escapeXml(modelName)}/meshes/${escapeXml(urdfLinkName)}_collision.stl" scale="${STL_SCALE_METERS} ${STL_SCALE_METERS} ${STL_SCALE_METERS}"/>
      </geometry>
    </collision>`;
        }
      } else if (collisionMode === 'box') {
        const bDx = mmToM(geometry.bboxMax[0] - geometry.bboxMin[0]);
        const bDy = mmToM(geometry.bboxMax[1] - geometry.bboxMin[1]);
        const bDz = mmToM(geometry.bboxMax[2] - geometry.bboxMin[2]);
        const bCx = mmToM((geometry.bboxMin[0] + geometry.bboxMax[0]) * 0.5);
        const bCy = mmToM((geometry.bboxMin[1] + geometry.bboxMax[1]) * 0.5);
        const bCz = mmToM((geometry.bboxMin[2] + geometry.bboxMax[2]) * 0.5);
        collisionXml = `
    <collision>
      <origin xyz="${formatNumber(bCx)} ${formatNumber(bCy)} ${formatNumber(bCz)}" rpy="0 0 0"/>
      <geometry>
        <box size="${formatNumber(bDx)} ${formatNumber(bDy)} ${formatNumber(bDz)}"/>
      </geometry>
    </collision>`;
      }

      return `  <link name="${escapeXml(urdfLinkName)}">
    <inertial>
      <origin xyz="${formatNumber(comX)} ${formatNumber(comY)} ${formatNumber(comZ)}" rpy="0 0 0"/>
      <mass value="${formatNumber(massKg, 6)}"/>
      <inertia ixx="${formatNumber(ixx, 8)}" ixy="${formatNumber(ixy, 8)}" ixz="${formatNumber(ixz, 8)}" iyy="${formatNumber(iyy, 8)}" iyz="${formatNumber(iyz, 8)}" izz="${formatNumber(izz, 8)}"/>
    </inertial>
    <visual>
      <geometry>
        <mesh filename="package://${escapeXml(modelName)}/meshes/${escapeXml(urdfLinkName)}.stl" scale="${STL_SCALE_METERS} ${STL_SCALE_METERS} ${STL_SCALE_METERS}"/>
      </geometry>${materialXml}
    </visual>${collisionXml}
  </link>`;
    })
    .join('\n\n');

  const jointsXml = spec.assembly.joints
    .map((joint) => {
      const sourceOverrides = spec.joints[joint.name];
      const urdfJointName = jointNameMap.get(`${joint.name}_joint`)!;
      const urdfParent = linkNameMap.get(joint.parent) ?? 'world';
      const urdfChild = linkNameMap.get(joint.child)!;

      // URDF joint type: continuous if revolute with no limits
      const jType = urdfJointHasContinuous(joint) ? 'continuous' : urdfJointType(joint.type);

      // Origin from joint frame
      const originAttr = transformToOrigin(joint.frame);

      // Axis
      const axisXml = joint.type !== 'fixed' ? `\n    <axis xyz="${joint.axis.map((v) => formatNumber(v)).join(' ')}"/>` : '';

      // Limits
      let limitXml = '';
      if (joint.type !== 'fixed' && jType !== 'continuous') {
        const lower = joint.min !== undefined ? (joint.type === 'revolute' ? degToRad(joint.min) : mmToM(joint.min)) : undefined;
        const upper = joint.max !== undefined ? (joint.type === 'revolute' ? degToRad(joint.max) : mmToM(joint.max)) : undefined;
        const effort = sourceOverrides?.effort ?? joint.effort ?? 100;
        const velocity = sourceOverrides?.velocity ?? joint.velocity;
        const vel = velocity !== undefined ? (joint.type === 'revolute' ? degToRad(velocity) : mmToM(velocity)) : 10;
        limitXml = `\n    <limit${lower !== undefined ? ` lower="${formatNumber(lower)}"` : ''}${upper !== undefined ? ` upper="${formatNumber(upper)}"` : ''} effort="${formatNumber(effort)}" velocity="${formatNumber(vel)}"/>`;
      } else if (jType === 'continuous') {
        // Continuous joints still need effort and velocity limits in URDF
        const effort = sourceOverrides?.effort ?? joint.effort ?? 100;
        const velocity = sourceOverrides?.velocity ?? joint.velocity;
        const vel = velocity !== undefined ? degToRad(velocity) : 10;
        limitXml = `\n    <limit effort="${formatNumber(effort)}" velocity="${formatNumber(vel)}"/>`;
      }

      // Dynamics
      let dynamicsXml = '';
      const damping = sourceOverrides?.damping ?? joint.damping;
      const friction = sourceOverrides?.friction ?? joint.friction;
      if (damping !== undefined || friction !== undefined) {
        dynamicsXml = `\n    <dynamics${damping !== undefined ? ` damping="${formatNumber(damping)}"` : ''}${friction !== undefined ? ` friction="${formatNumber(friction)}"` : ''}/>`;
      }

      // Mimic (joint coupling)
      let mimicXml = '';
      const coupling = couplingByJoint.get(joint.name);
      if (coupling && coupling.terms.length > 0) {
        const primary = coupling.terms.reduce((a, b) => (Math.abs(a.ratio) >= Math.abs(b.ratio) ? a : b));
        const leaderUrdfName = jointNameMap.get(`${primary.joint}_joint`)!;
        mimicXml = `\n    <mimic joint="${escapeXml(leaderUrdfName)}" multiplier="${formatNumber(primary.ratio)}" offset="${formatNumber(coupling.offset)}"/>`;
        if (coupling.terms.length > 1) {
          warnings.push(
            `Joint "${joint.name}" coupling has ${coupling.terms.length} terms but URDF mimic only supports 1. Using primary term (ratio=${primary.ratio} from "${primary.joint}").`,
          );
        }
      }

      return `  <joint name="${escapeXml(urdfJointName)}" type="${jType}">
    <parent link="${escapeXml(urdfParent)}"/>
    <child link="${escapeXml(urdfChild)}"/>
    <origin ${originAttr}/>${axisXml}${limitXml}${dynamicsXml}${mimicXml}
  </joint>`;
    })
    .join('\n\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<robot name="${escapeXml(modelName)}">
${linksXml}

${jointsXml}
</robot>
`;
}

// ---------------------------------------------------------------------------
// Package builder
// ---------------------------------------------------------------------------

export function buildUrdfRobotPackage(spec: CollectedRobotExport): UrdfPackageOutput {
  const warnings: string[] = [];
  const modelName = sanitizeToken(spec.modelName, 'forgecad_robot');
  const linkNameMap = uniqueNameMap(
    spec.assembly.parts.map((part) => part.name),
    'link',
  );
  const jointNameMap = uniqueNameMap(
    spec.assembly.joints.map((joint) => `${joint.name}_joint`),
    'joint',
  );
  const jointValues = resolveJointValues(spec.assembly, spec.state, warnings);
  const linkWorlds = computeLinkFrameWorlds(spec.assembly, jointValues);

  const geometries = new Map<string, LinkGeometry>();
  spec.assembly.parts.forEach((part) => {
    geometries.set(part.name, linkGeometry(part));
  });

  const files: UrdfPackageFile[] = [];

  // Generate visual mesh STLs and collision meshes
  const collisionMeshes = new Map<string, string>();
  const manifestLinks: UrdfPackageManifestLink[] = [];

  spec.assembly.parts.forEach((part) => {
    const urdfLinkName = linkNameMap.get(part.name)!;
    const geometry = geometries.get(part.name)!;
    const linkOptions = spec.links[part.name];
    const collisionMode = resolveCollisionMode(part.metadata, linkOptions?.collision);

    // Visual mesh
    const visualMeshPath = `meshes/${urdfLinkName}.stl`;
    files.push({
      path: visualMeshPath,
      bytes: new Uint8Array(
        buildBinaryStl([
          { name: part.name, shape: geometry.shapes[0] },
          ...geometry.shapes.slice(1).map((shape, index) => ({ name: `${part.name}.${index + 2}`, shape })),
        ]),
      ),
    });

    // Collision mesh (union of all shapes — convex hull was removed)
    if (collisionMode === 'convex') {
      const collisionMeshPath = `meshes/${urdfLinkName}_collision.stl`;
      const collisionShape = geometry.shapes.length === 1 ? geometry.shapes[0] : union(...geometry.shapes);
      files.push({
        path: collisionMeshPath,
        bytes: new Uint8Array(buildBinaryStl([{ name: `${part.name}_collision`, shape: collisionShape }])),
      });
      collisionMeshes.set(part.name, collisionMeshPath);
    }

    manifestLinks.push({
      sourceName: part.name,
      urdfName: urdfLinkName,
      visualMesh: visualMeshPath,
      collisionMesh: collisionMeshes.get(part.name),
      massKg: estimateLinkMassKg(geometry, linkOptions?.massKg, linkOptions?.densityKgM3),
    });
  });

  const manifestJoints: UrdfPackageManifestJoint[] = spec.assembly.joints.map((joint) => ({
    sourceName: joint.name,
    urdfName: jointNameMap.get(`${joint.name}_joint`)!,
    parent: linkNameMap.get(joint.parent) ?? 'world',
    child: linkNameMap.get(joint.child)!,
    type: urdfJointType(joint.type),
  }));

  // Generate URDF XML
  const xml = urdfXml(spec, modelName, linkNameMap, jointNameMap, geometries, linkWorlds, collisionMeshes, warnings);
  files.push({ path: `${modelName}.urdf`, text: xml });

  const manifest: UrdfPackageManifest = {
    format: 'forgecad-urdf-package',
    modelName,
    sourceModelName: spec.modelName,
    urdfPath: `${modelName}.urdf`,
    links: manifestLinks,
    joints: manifestJoints,
    warnings,
  };

  files.push({ path: 'manifest.json', text: `${JSON.stringify(manifest, null, 2)}\n` });

  return { modelName, manifest, files };
}

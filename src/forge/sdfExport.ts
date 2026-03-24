import type {
  AssemblyDefinition,
  AssemblyJointCouplingDef,
  AssemblyJointDef,
  AssemblyPart,
  AssemblyPartDef,
  JointType,
  PartMetadata,
} from './assembly';
import { buildBinaryStl } from './exportMesh';
import { ShapeGroup } from './group';
import { Shape, union } from './kernel';
import { computeMeshInertia } from './meshInertia';
import type { CollectedRobotExport, RobotWorldOptions } from './robotExport';
import { TrackedShape } from './sketch/topology';
import { composeChain, Transform, type Vec3 } from './transform';

const DEFAULT_DENSITY_KG_M3 = 1000;
const STL_SCALE_METERS = 0.001;
const MIN_LINK_MASS_KG = 0.001;

export interface SdfPackageFile {
  path: string;
  text?: string;
  bytes?: Uint8Array;
}

export interface SdfPackageManifestLink {
  sourceName: string;
  sdfName: string;
  mesh: string;
  massKg: number;
}

export interface SdfPackageManifestJoint {
  sourceName: string;
  sdfName: string;
  parent: string;
  child: string;
  type: JointType;
}

export interface SdfPackageManifest {
  format: 'forgecad-sdf-package';
  modelName: string;
  sourceModelName: string;
  worldName?: string;
  modelPath: string;
  worldPath?: string;
  cmdVelTopic?: string;
  jointStateTopic?: string;
  links: SdfPackageManifestLink[];
  joints: SdfPackageManifestJoint[];
  warnings: string[];
}

export interface SdfPackageOutput {
  modelName: string;
  worldName?: string;
  manifest: SdfPackageManifest;
  files: SdfPackageFile[];
}

interface LinkGeometry {
  part: AssemblyPartDef;
  shapes: Shape[];
  volumeMm3: number;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
}

interface PoseParts {
  xyzM: [number, number, number];
  rpyRad: [number, number, number];
}

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

function formatPose(parts: PoseParts): string {
  return [...parts.xyzM.map((value) => formatNumber(value, 6)), ...parts.rpyRad.map((value) => formatNumber(value, 6))].join(' ');
}

function axisToText(axis: Vec3): string {
  return axis.map((value) => formatNumber(value, 6)).join(' ');
}

function transformToPose(transform: Transform): PoseParts {
  const m = transform.toArray();
  const r00 = m[0];
  const _r01 = m[4];
  const _r02 = m[8];
  const r10 = m[1];
  const r11 = m[5];
  const r12 = m[9];
  const r20 = m[2];
  const r21 = m[6];
  const r22 = m[10];

  const pitch = Math.atan2(-r20, Math.sqrt(r00 * r00 + r10 * r10));
  let roll: number;
  let yaw: number;
  if (Math.abs(Math.cos(pitch)) < 1e-8) {
    roll = Math.atan2(-r12, r11);
    yaw = 0;
  } else {
    roll = Math.atan2(r21, r22);
    yaw = Math.atan2(r10, r00);
  }

  return {
    xyzM: [mmToM(m[12]), mmToM(m[13]), mmToM(m[14])],
    rpyRad: [roll, pitch, yaw],
  };
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
    throw new Error(`SDF export requires geometry on every part. "${part.name}" is empty.`);
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

  // Propagate coupled joint values from their source joints.
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

function combineMetadataNumber(
  metadata: PartMetadata | undefined,
  linkValue: number | undefined,
  key: 'massKg' | 'densityKgM3',
): number | undefined {
  if (linkValue !== undefined) return linkValue;
  const fromMetadata = metadata?.[key];
  return typeof fromMetadata === 'number' ? fromMetadata : undefined;
}

function resolveCollisionMode(
  metadata: PartMetadata | undefined,
  collision: 'visual' | 'convex' | 'box' | 'none' | undefined,
): 'visual' | 'convex' | 'box' | 'none' {
  if (collision) return collision;
  const fromMetadata = metadata?.collision;
  if (fromMetadata === 'none' || fromMetadata === 'visual' || fromMetadata === 'box' || fromMetadata === 'convex') return fromMetadata;
  return 'convex';
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

function inertiaFromBounds(geometry: LinkGeometry, massKg: number): { pose: PoseParts; ixx: number; iyy: number; izz: number } {
  const dx = mmToM(geometry.bboxMax[0] - geometry.bboxMin[0]);
  const dy = mmToM(geometry.bboxMax[1] - geometry.bboxMin[1]);
  const dz = mmToM(geometry.bboxMax[2] - geometry.bboxMin[2]);
  const cx = mmToM((geometry.bboxMin[0] + geometry.bboxMax[0]) * 0.5);
  const cy = mmToM((geometry.bboxMin[1] + geometry.bboxMax[1]) * 0.5);
  const cz = mmToM((geometry.bboxMin[2] + geometry.bboxMax[2]) * 0.5);

  return {
    pose: { xyzM: [cx, cy, cz], rpyRad: [0, 0, 0] },
    ixx: (massKg * (dy * dy + dz * dz)) / 12,
    iyy: (massKg * (dx * dx + dz * dz)) / 12,
    izz: (massKg * (dx * dx + dy * dy)) / 12,
  };
}

function jointTypeLimitUnits(joint: AssemblyJointDef, value: number | undefined): string | null {
  if (value === undefined) return null;
  if (joint.type === 'revolute') return formatNumber(degToRad(value), 6);
  if (joint.type === 'prismatic') return formatNumber(mmToM(value), 6);
  return null;
}

function jointVelocityUnits(joint: AssemblyJointDef, value: number | undefined): string | null {
  if (value === undefined) return null;
  if (joint.type === 'revolute') return formatNumber(degToRad(value), 6);
  if (joint.type === 'prismatic') return formatNumber(mmToM(value), 6);
  return formatNumber(value, 6);
}

function sRgbFloat(hex: string | undefined): [number, number, number] | null {
  if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function modelConfigXml(modelName: string): string {
  return `<?xml version="1.0" ?>
<model>
  <name>${escapeXml(modelName)}</name>
  <version>1.0.0</version>
  <sdf version="1.10">model.sdf</sdf>
  <author>
    <name>ForgeCAD</name>
  </author>
  <description>Generated by ForgeCAD SDF export.</description>
</model>
`;
}

function demoWorldName(world: RobotWorldOptions | null, modelName: string): string {
  const source = world?.name?.trim() || `${modelName} Demo`;
  return sanitizeToken(source, `${modelName}_demo`);
}

function keyboardPluginXml(cmdVelTopic: string, linearStep: number, angularStep: number): string {
  const bindings = [
    { key: 87, twist: `linear: {x: ${formatNumber(linearStep, 3)}}, angular: {z: 0.0}` },
    { key: 88, twist: `linear: {x: ${formatNumber(-linearStep, 3)}}, angular: {z: 0.0}` },
    { key: 65, twist: `linear: {x: 0.0}, angular: {z: ${formatNumber(angularStep, 3)}}` },
    { key: 68, twist: `linear: {x: 0.0}, angular: {z: ${formatNumber(-angularStep, 3)}}` },
    { key: 81, twist: `linear: {x: ${formatNumber(linearStep, 3)}}, angular: {z: ${formatNumber(angularStep, 3)}}` },
    { key: 69, twist: `linear: {x: ${formatNumber(linearStep, 3)}}, angular: {z: ${formatNumber(-angularStep, 3)}}` },
    { key: 90, twist: `linear: {x: ${formatNumber(-linearStep, 3)}}, angular: {z: ${formatNumber(angularStep, 3)}}` },
    { key: 67, twist: `linear: {x: ${formatNumber(-linearStep, 3)}}, angular: {z: ${formatNumber(-angularStep, 3)}}` },
    { key: 83, twist: 'linear: {x: 0.0}, angular: {z: 0.0}' },
    { key: 32, twist: 'linear: {x: 0.0}, angular: {z: 0.0}' },
  ];

  return bindings
    .map(
      (binding) => `  <plugin filename="gz-sim-triggered-publisher-system" name="gz::sim::systems::TriggeredPublisher">
    <input type="gz.msgs.Int32" topic="/keyboard/keypress">
      <match field="data">${binding.key}</match>
    </input>
    <output type="gz.msgs.Twist" topic="${escapeXml(cmdVelTopic)}">
      ${binding.twist}
    </output>
  </plugin>`,
    )
    .join('\n');
}

function keyboardGuiPluginXml(): string {
  return `      <plugin filename="KeyPublisher" name="Key publisher">
        <gz-gui>
          <anchors target="3D View">
            <line own="right" target="right"/>
            <line own="top" target="top"/>
          </anchors>
          <property key="resizable" type="bool">false</property>
          <property key="width" type="double">5</property>
          <property key="height" type="double">5</property>
          <property key="state" type="string">floating</property>
          <property key="showTitleBar" type="bool">false</property>
        </gz-gui>
      </plugin>`;
}

function demoWorldGuiXml(keyboardEnabled: boolean): string {
  const keyboardPlugin = keyboardEnabled ? `\n${keyboardGuiPluginXml()}` : '';
  return `    <gui fullscreen="0">
      <plugin filename="MinimalScene" name="3D View">
        <gz-gui>
          <title>3D View</title>
          <property type="bool" key="showTitleBar">false</property>
          <property type="string" key="state">docked</property>
        </gz-gui>
        <engine>ogre2</engine>
        <scene>scene</scene>
        <ambient_light>0.4 0.4 0.4</ambient_light>
        <background_color>0.8 0.8 0.8</background_color>
        <camera_pose>-6 0 6 0 0.5 0</camera_pose>
      </plugin>

      <plugin filename="EntityContextMenuPlugin" name="Entity context menu">
        <gz-gui>
          <property key="state" type="string">floating</property>
          <property key="width" type="double">5</property>
          <property key="height" type="double">5</property>
          <property key="showTitleBar" type="bool">false</property>
        </gz-gui>
      </plugin>

      <plugin filename="GzSceneManager" name="Scene Manager">
        <gz-gui>
          <property key="resizable" type="bool">false</property>
          <property key="width" type="double">5</property>
          <property key="height" type="double">5</property>
          <property key="state" type="string">floating</property>
          <property key="showTitleBar" type="bool">false</property>
        </gz-gui>
      </plugin>

      <plugin filename="InteractiveViewControl" name="Interactive view control">
        <gz-gui>
          <property key="resizable" type="bool">false</property>
          <property key="width" type="double">5</property>
          <property key="height" type="double">5</property>
          <property key="state" type="string">floating</property>
          <property key="showTitleBar" type="bool">false</property>
        </gz-gui>
      </plugin>

      <plugin filename="CameraTracking" name="Camera Tracking">
        <gz-gui>
          <property key="resizable" type="bool">false</property>
          <property key="width" type="double">5</property>
          <property key="height" type="double">5</property>
          <property key="state" type="string">floating</property>
          <property key="showTitleBar" type="bool">false</property>
        </gz-gui>
      </plugin>

      <plugin filename="WorldControl" name="World control">
        <gz-gui>
          <title>World control</title>
          <property type="bool" key="showTitleBar">false</property>
          <property type="bool" key="resizable">false</property>
          <property type="double" key="height">72</property>
          <property type="double" key="z">1</property>
          <property type="string" key="state">floating</property>
          <anchors target="3D View">
            <line own="left" target="left"/>
            <line own="bottom" target="bottom"/>
          </anchors>
        </gz-gui>
        <play_pause>true</play_pause>
        <step>true</step>
        <start_paused>true</start_paused>
      </plugin>

      <plugin filename="WorldStats" name="World stats">
        <gz-gui>
          <title>World stats</title>
          <property type="bool" key="showTitleBar">false</property>
          <property type="bool" key="resizable">false</property>
          <property type="double" key="height">110</property>
          <property type="double" key="width">290</property>
          <property type="double" key="z">1</property>
          <property type="string" key="state">floating</property>
          <anchors target="3D View">
            <line own="right" target="right"/>
            <line own="bottom" target="bottom"/>
          </anchors>
        </gz-gui>
        <sim_time>true</sim_time>
        <real_time>true</real_time>
        <real_time_factor>true</real_time_factor>
        <iterations>true</iterations>
      </plugin>

      <plugin filename="TransformControl" name="Transform control">
        <gz-gui>
          <title>Transform control</title>
          <anchors target="3D View">
            <line own="left" target="left"/>
            <line own="top" target="top"/>
          </anchors>
          <property key="resizable" type="bool">false</property>
          <property key="width" type="double">230</property>
          <property key="height" type="double">50</property>
          <property key="state" type="string">floating</property>
          <property key="showTitleBar" type="bool">false</property>
          <property key="cardBackground" type="string">#666666</property>
        </gz-gui>
      </plugin>

      <plugin filename="Shapes" name="Shapes">
        <gz-gui>
          <anchors target="Transform control">
            <line own="left" target="right"/>
            <line own="top" target="top"/>
          </anchors>
          <property key="resizable" type="bool">false</property>
          <property key="width" type="double">200</property>
          <property key="height" type="double">50</property>
          <property key="state" type="string">floating</property>
          <property key="showTitleBar" type="bool">false</property>
          <property key="cardBackground" type="string">#666666</property>
        </gz-gui>
      </plugin>${keyboardPlugin}
    </gui>
`;
}

function demoWorldXml(worldName: string, modelName: string, cmdVelTopic: string | undefined, world: RobotWorldOptions | null): string {
  const spawnPose = world?.spawnPose ?? [0, 0, 120, 0, 0, 0];
  const spawnPoseText = [
    formatNumber(mmToM(spawnPose[0]), 6),
    formatNumber(mmToM(spawnPose[1]), 6),
    formatNumber(mmToM(spawnPose[2]), 6),
    formatNumber(degToRad(spawnPose[3]), 6),
    formatNumber(degToRad(spawnPose[4]), 6),
    formatNumber(degToRad(spawnPose[5]), 6),
  ].join(' ');

  const keyboardEnabled = world?.keyboardTeleop?.enabled ?? true;
  const linearStep = world?.keyboardTeleop?.linearStep ?? 0.9;
  const angularStep = world?.keyboardTeleop?.angularStep ?? 1.2;
  const worldGui = demoWorldGuiXml(keyboardEnabled && !!cmdVelTopic);
  const keyboardPlugins = keyboardEnabled && cmdVelTopic ? `${keyboardPluginXml(cmdVelTopic, linearStep, angularStep)}\n` : '';

  return `<sdf version="1.10">
  <world name="${escapeXml(worldName)}">
${worldGui}
    <plugin filename="gz-sim-physics-system" name="gz::sim::systems::Physics"/>
    <plugin filename="gz-sim-user-commands-system" name="gz::sim::systems::UserCommands"/>
    <plugin filename="gz-sim-scene-broadcaster-system" name="gz::sim::systems::SceneBroadcaster"/>
${keyboardPlugins}    <light name="sun" type="directional">
      <cast_shadows>true</cast_shadows>
      <pose>0 0 10 0 0 0</pose>
      <diffuse>0.95 0.95 0.95 1</diffuse>
      <specular>0.2 0.2 0.2 1</specular>
      <attenuation>
        <range>1000</range>
        <constant>0.9</constant>
        <linear>0.01</linear>
        <quadratic>0.001</quadratic>
      </attenuation>
      <direction>-0.4 0.2 -1</direction>
    </light>

    <model name="arena_floor">
      <static>true</static>
      <link name="floor">
        <collision name="collision">
          <geometry>
            <box><size>12 12 0.1</size></box>
          </geometry>
        </collision>
        <visual name="visual">
          <geometry>
            <box><size>12 12 0.1</size></box>
          </geometry>
          <material>
            <ambient>0.77 0.79 0.75 1</ambient>
            <diffuse>0.77 0.79 0.75 1</diffuse>
          </material>
        </visual>
      </link>
    </model>

    <model name="target_zone">
      <static>true</static>
      <pose>2.2 0 0.01 0 0 0</pose>
      <link name="pad">
        <visual name="visual">
          <geometry>
            <box><size>0.9 0.9 0.02</size></box>
          </geometry>
          <material>
            <ambient>0.32 0.69 0.42 1</ambient>
            <diffuse>0.32 0.69 0.42 1</diffuse>
          </material>
        </visual>
      </link>
    </model>

    <model name="cargo_crate">
      <pose>1.2 0 0.16 0 0 0</pose>
      <link name="body">
        <inertial>
          <mass>4.5</mass>
          <inertia>
            <ixx>0.048</ixx>
            <iyy>0.048</iyy>
            <izz>0.048</izz>
          </inertia>
        </inertial>
        <collision name="collision">
          <geometry>
            <box><size>0.42 0.42 0.32</size></box>
          </geometry>
        </collision>
        <visual name="visual">
          <geometry>
            <box><size>0.42 0.42 0.32</size></box>
          </geometry>
          <material>
            <ambient>0.67 0.46 0.25 1</ambient>
            <diffuse>0.67 0.46 0.25 1</diffuse>
          </material>
        </visual>
      </link>
    </model>

    <model name="slalom_left">
      <static>true</static>
      <pose>0.8 0.8 0.2 0 0 0</pose>
      <link name="post">
        <collision name="collision">
          <geometry><cylinder><radius>0.08</radius><length>0.4</length></cylinder></geometry>
        </collision>
        <visual name="visual">
          <geometry><cylinder><radius>0.08</radius><length>0.4</length></cylinder></geometry>
          <material>
            <ambient>0.85 0.37 0.19 1</ambient>
            <diffuse>0.85 0.37 0.19 1</diffuse>
          </material>
        </visual>
      </link>
    </model>

    <model name="slalom_right">
      <static>true</static>
      <pose>0.8 -0.8 0.2 0 0 0</pose>
      <link name="post">
        <collision name="collision">
          <geometry><cylinder><radius>0.08</radius><length>0.4</length></cylinder></geometry>
        </collision>
        <visual name="visual">
          <geometry><cylinder><radius>0.08</radius><length>0.4</length></cylinder></geometry>
          <material>
            <ambient>0.85 0.37 0.19 1</ambient>
            <diffuse>0.85 0.37 0.19 1</diffuse>
          </material>
        </visual>
      </link>
    </model>

    <include>
      <uri>model://${escapeXml(modelName)}</uri>
      <name>${escapeXml(modelName)}</name>
      <pose>${spawnPoseText}</pose>
    </include>
  </world>
</sdf>
`;
}

function modelXml(
  spec: CollectedRobotExport,
  modelName: string,
  linkNameMap: Map<string, string>,
  jointNameMap: Map<string, string>,
  geometries: Map<string, LinkGeometry>,
  linkWorlds: Map<string, Transform>,
  warnings: string[],
): { xml: string; cmdVelTopic?: string; jointStateTopic?: string } {
  const cmdVelTopic = spec.plugins.diffDrive?.topic || `/model/${modelName}/cmd_vel`;
  const jointStateTopic = spec.plugins.jointStatePublisher?.topic || `/model/${modelName}/joint_state`;

  // Build coupling lookup: driven joint name -> coupling definition
  const couplingByJoint = new Map<string, AssemblyJointCouplingDef>();
  for (const coupling of spec.assembly.jointCouplings) {
    couplingByJoint.set(coupling.joint, coupling);
  }

  const linksXml = spec.assembly.parts
    .map((part) => {
      const sdfLinkName = linkNameMap.get(part.name)!;
      const geometry = geometries.get(part.name)!;
      const worldPose = transformToPose(linkWorlds.get(part.name) ?? Transform.identity());
      const linkOptions = spec.links[part.name];
      const massKg = estimateLinkMassKg(geometry, linkOptions?.massKg, linkOptions?.densityKgM3);
      // Compute inertia from mesh (divergence theorem), falling back to bounding-box approximation
      let inertia: { pose: PoseParts; ixx: number; iyy: number; izz: number; ixy: number; ixz: number; iyz: number };
      const combinedMesh = geometry.shapes.length === 1 ? geometry.shapes[0].getMesh() : union(...geometry.shapes).getMesh();
      if (combinedMesh.numTri > 0) {
        const mi = computeMeshInertia(combinedMesh, massKg);
        inertia = {
          pose: { xyzM: [mmToM(mi.centerOfMass[0]), mmToM(mi.centerOfMass[1]), mmToM(mi.centerOfMass[2])], rpyRad: [0, 0, 0] },
          ixx: mi.ixx,
          iyy: mi.iyy,
          izz: mi.izz,
          ixy: mi.ixy,
          ixz: mi.ixz,
          iyz: mi.iyz,
        };
      } else {
        const bb = inertiaFromBounds(geometry, massKg);
        inertia = { ...bb, ixy: 0, ixz: 0, iyz: 0 };
      }

      const collisionMode = resolveCollisionMode(part.metadata, linkOptions?.collision);
      const meshPath = `model://${modelName}/meshes/${sdfLinkName}.stl`;
      const color = sRgbFloat(geometry.shapes[0]?.colorHex);
      const materialXml = color
        ? `
        <material>
          <ambient>${formatNumber(color[0], 3)} ${formatNumber(color[1], 3)} ${formatNumber(color[2], 3)} 1</ambient>
          <diffuse>${formatNumber(color[0], 3)} ${formatNumber(color[1], 3)} ${formatNumber(color[2], 3)} 1</diffuse>
        </material>`
        : '';

      return `    <link name="${escapeXml(sdfLinkName)}">
      <pose relative_to="__model__">${formatPose(worldPose)}</pose>
      <inertial>
        <pose>${formatPose(inertia.pose)}</pose>
        <mass>${formatNumber(massKg, 6)}</mass>
        <inertia>
          <ixx>${formatNumber(inertia.ixx, 8)}</ixx>
          <ixy>${formatNumber(inertia.ixy, 8)}</ixy>
          <ixz>${formatNumber(inertia.ixz, 8)}</ixz>
          <iyy>${formatNumber(inertia.iyy, 8)}</iyy>
          <iyz>${formatNumber(inertia.iyz, 8)}</iyz>
          <izz>${formatNumber(inertia.izz, 8)}</izz>
        </inertia>
      </inertial>
      <visual name="${escapeXml(sdfLinkName)}_visual">
        <geometry>
          <mesh>
            <uri>${escapeXml(meshPath)}</uri>
            <scale>${formatNumber(STL_SCALE_METERS, 6)} ${formatNumber(STL_SCALE_METERS, 6)} ${formatNumber(STL_SCALE_METERS, 6)}</scale>
          </mesh>
        </geometry>${materialXml}
      </visual>${(() => {
        if (collisionMode === 'visual') {
          return `
      <collision name="${escapeXml(sdfLinkName)}_collision">
        <geometry>
          <mesh>
            <uri>${escapeXml(meshPath)}</uri>
            <scale>${formatNumber(STL_SCALE_METERS, 6)} ${formatNumber(STL_SCALE_METERS, 6)} ${formatNumber(STL_SCALE_METERS, 6)}</scale>
          </mesh>
        </geometry>
      </collision>`;
        }
        if (collisionMode === 'convex') {
          const collisionMeshPath = `model://${modelName}/meshes/${sdfLinkName}_collision.stl`;
          return `
      <collision name="${escapeXml(sdfLinkName)}_collision">
        <geometry>
          <mesh>
            <uri>${escapeXml(collisionMeshPath)}</uri>
            <scale>${formatNumber(STL_SCALE_METERS, 6)} ${formatNumber(STL_SCALE_METERS, 6)} ${formatNumber(STL_SCALE_METERS, 6)}</scale>
          </mesh>
        </geometry>
      </collision>`;
        }
        if (collisionMode === 'box') {
          const bDx = mmToM(geometry.bboxMax[0] - geometry.bboxMin[0]);
          const bDy = mmToM(geometry.bboxMax[1] - geometry.bboxMin[1]);
          const bDz = mmToM(geometry.bboxMax[2] - geometry.bboxMin[2]);
          const bCx = mmToM((geometry.bboxMin[0] + geometry.bboxMax[0]) * 0.5);
          const bCy = mmToM((geometry.bboxMin[1] + geometry.bboxMax[1]) * 0.5);
          const bCz = mmToM((geometry.bboxMin[2] + geometry.bboxMax[2]) * 0.5);
          return `
      <collision name="${escapeXml(sdfLinkName)}_collision">
        <pose>${formatNumber(bCx, 6)} ${formatNumber(bCy, 6)} ${formatNumber(bCz, 6)} 0 0 0</pose>
        <geometry>
          <box><size>${formatNumber(bDx, 6)} ${formatNumber(bDy, 6)} ${formatNumber(bDz, 6)}</size></box>
        </geometry>
      </collision>`;
        }
        return '';
      })()}
    </link>`;
    })
    .join('\n');

  const jointsXml = spec.assembly.joints
    .map((joint) => {
      const sourceOverrides = spec.joints[joint.name];
      const sdfJointName = jointNameMap.get(`${joint.name}_joint`)!;
      const sdfParent = linkNameMap.get(joint.parent) ?? 'world';
      const sdfChild = linkNameMap.get(joint.child)!;
      const limitLower = jointTypeLimitUnits(joint, joint.min);
      const limitUpper = jointTypeLimitUnits(joint, joint.max);
      const velocity = jointVelocityUnits(joint, sourceOverrides?.velocity ?? joint.velocity);
      const effort = sourceOverrides?.effort ?? joint.effort;
      const damping = sourceOverrides?.damping ?? joint.damping;
      const friction = sourceOverrides?.friction ?? joint.friction;
      const jointPose = transformToPose(joint.frame);

      // Build <mimic> element if this joint is driven by a coupling
      let mimicXml = '';
      const coupling = couplingByJoint.get(joint.name);
      if (coupling && coupling.terms.length > 0) {
        const primary = coupling.terms.reduce((a, b) => (Math.abs(a.ratio) >= Math.abs(b.ratio) ? a : b));
        const leaderSdfName = jointNameMap.get(`${primary.joint}_joint`)!;
        mimicXml = `
        <mimic joint="${escapeXml(leaderSdfName)}">
          <multiplier>${formatNumber(primary.ratio, 6)}</multiplier>
          <offset>${formatNumber(coupling.offset, 6)}</offset>
        </mimic>`;
        if (coupling.terms.length > 1) {
          warnings.push(
            `Joint "${joint.name}" coupling has ${coupling.terms.length} terms but SDF mimic only supports 1. Using primary term (ratio=${primary.ratio} from "${primary.joint}").`,
          );
        }
      }

      return `    <joint name="${escapeXml(sdfJointName)}" type="${joint.type}">
      <parent>${escapeXml(sdfParent)}</parent>
      <child>${escapeXml(sdfChild)}</child>
      <pose relative_to="${escapeXml(sdfParent)}">${formatPose(jointPose)}</pose>${
        joint.type !== 'fixed'
          ? `
      <axis>
        <xyz>${axisToText(joint.axis)}</xyz>${mimicXml}${
          limitLower !== null || limitUpper !== null || effort !== undefined || velocity !== null
            ? `
        <limit>${
          limitLower !== null
            ? `
          <lower>${limitLower}</lower>`
            : ''
        }${
          limitUpper !== null
            ? `
          <upper>${limitUpper}</upper>`
            : ''
        }${
          effort !== undefined
            ? `
          <effort>${formatNumber(effort, 6)}</effort>`
            : ''
        }${
          velocity !== null
            ? `
          <velocity>${velocity}</velocity>`
            : ''
        }
        </limit>`
            : ''
        }${
          damping !== undefined || friction !== undefined
            ? `
        <dynamics>${
          damping !== undefined
            ? `
          <damping>${formatNumber(damping, 6)}</damping>`
            : ''
        }${
          friction !== undefined
            ? `
          <friction>${formatNumber(friction, 6)}</friction>`
            : ''
        }
        </dynamics>`
            : ''
        }
      </axis>`
          : ''
      }
    </joint>`;
    })
    .join('\n');

  const plugins: string[] = [];
  if (spec.plugins.diffDrive) {
    plugins.push(`    <plugin filename="gz-sim-diff-drive-system" name="gz::sim::systems::DiffDrive">
      ${spec.plugins.diffDrive.leftJoints.map((jointName) => `<left_joint>${escapeXml(jointNameMap.get(`${jointName}_joint`)!)}</left_joint>`).join('\n      ')}
      ${spec.plugins.diffDrive.rightJoints.map((jointName) => `<right_joint>${escapeXml(jointNameMap.get(`${jointName}_joint`)!)}</right_joint>`).join('\n      ')}
      <wheel_separation>${formatNumber(mmToM(spec.plugins.diffDrive.wheelSeparationMm), 6)}</wheel_separation>
      <wheel_radius>${formatNumber(mmToM(spec.plugins.diffDrive.wheelRadiusMm), 6)}</wheel_radius>
      <topic>${escapeXml(cmdVelTopic)}</topic>${
        spec.plugins.diffDrive.odomTopic
          ? `
      <odom_topic>${escapeXml(spec.plugins.diffDrive.odomTopic)}</odom_topic>`
          : ''
      }${
        spec.plugins.diffDrive.tfTopic
          ? `
      <tf_topic>${escapeXml(spec.plugins.diffDrive.tfTopic)}</tf_topic>`
          : ''
      }${
        spec.plugins.diffDrive.frameId
          ? `
      <frame_id>${escapeXml(spec.plugins.diffDrive.frameId)}</frame_id>`
          : ''
      }${
        spec.plugins.diffDrive.odomFrameId
          ? `
      <odom_frame>${escapeXml(spec.plugins.diffDrive.odomFrameId)}</odom_frame>`
          : ''
      }${
        spec.plugins.diffDrive.maxLinearVelocity !== undefined
          ? `
      <max_linear_velocity>${formatNumber(spec.plugins.diffDrive.maxLinearVelocity, 6)}</max_linear_velocity>`
          : ''
      }${
        spec.plugins.diffDrive.maxAngularVelocity !== undefined
          ? `
      <max_angular_velocity>${formatNumber(spec.plugins.diffDrive.maxAngularVelocity, 6)}</max_angular_velocity>`
          : ''
      }${
        spec.plugins.diffDrive.linearAcceleration !== undefined
          ? `
      <linear_acceleration>${formatNumber(spec.plugins.diffDrive.linearAcceleration, 6)}</linear_acceleration>`
          : ''
      }${
        spec.plugins.diffDrive.angularAcceleration !== undefined
          ? `
      <angular_acceleration>${formatNumber(spec.plugins.diffDrive.angularAcceleration, 6)}</angular_acceleration>`
          : ''
      }
    </plugin>`);
  }

  const jointState = spec.plugins.jointStatePublisher;
  if (jointState?.enabled !== false) {
    plugins.push(`    <plugin filename="gz-sim-joint-state-publisher-system" name="gz::sim::systems::JointStatePublisher">
      <topic>${escapeXml(jointState?.topic || jointStateTopic)}</topic>${(jointState?.joints ?? [])
        .map(
          (jointName) => `
      <joint_name>${escapeXml(jointNameMap.get(`${jointName}_joint`)!)}</joint_name>`,
        )
        .join('')}${
        jointState?.updateRate !== undefined
          ? `
      <update_rate>${formatNumber(jointState.updateRate, 6)}</update_rate>`
          : ''
      }
    </plugin>`);
  }

  const rootNames = spec.assembly.parts
    .filter((part) => !spec.assembly.joints.some((joint) => joint.child === part.name))
    .map((part) => linkNameMap.get(part.name)!);
  if (rootNames.length === 0) {
    warnings.push('No root links found. Exported model may not load correctly.');
  }

  const canonical = rootNames[0] || linkNameMap.get(spec.assembly.parts[0]?.name ?? '') || 'base_link';
  const xml = `<sdf version="1.10">
  <model name="${escapeXml(modelName)}" canonical_link="${escapeXml(canonical)}">
    <static>${spec.static ? 'true' : 'false'}</static>
    <self_collide>${spec.selfCollide ? 'true' : 'false'}</self_collide>
    <allow_auto_disable>${spec.allowAutoDisable ? 'true' : 'false'}</allow_auto_disable>
${linksXml}
${jointsXml}
${plugins.join('\n')}
  </model>
</sdf>
`;

  return {
    xml,
    cmdVelTopic: spec.plugins.diffDrive ? cmdVelTopic : undefined,
    jointStateTopic: jointState?.enabled === false ? undefined : jointState?.topic || jointStateTopic,
  };
}

function manifestJson(manifest: SdfPackageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildSdfRobotPackage(spec: CollectedRobotExport): SdfPackageOutput {
  const warnings: string[] = [];
  const modelName = sanitizeToken(spec.modelName, 'forgecad_robot');
  const modelFolder = `models/${modelName}`;
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

  const model = modelXml(spec, modelName, linkNameMap, jointNameMap, geometries, linkWorlds, warnings);
  const worldName = spec.world?.generateDemoWorld ? demoWorldName(spec.world, modelName) : undefined;

  const files: SdfPackageFile[] = [
    { path: `${modelFolder}/model.config`, text: modelConfigXml(modelName) },
    { path: `${modelFolder}/model.sdf`, text: model.xml },
  ];

  const manifestLinks: SdfPackageManifestLink[] = [];
  spec.assembly.parts.forEach((part) => {
    const sdfLinkName = linkNameMap.get(part.name)!;
    const geometry = geometries.get(part.name)!;
    const linkOptions = spec.links[part.name];
    const meshPath = `${modelFolder}/meshes/${sdfLinkName}.stl`;
    files.push({
      path: meshPath,
      bytes: new Uint8Array(
        buildBinaryStl([
          { name: part.name, shape: geometry.shapes[0] },
          ...geometry.shapes.slice(1).map((shape, index) => ({
            name: `${part.name}.${index + 2}`,
            shape,
          })),
        ]),
      ),
    });

    const collisionMode = resolveCollisionMode(part.metadata, linkOptions?.collision);
    if (collisionMode === 'convex') {
      const collisionMeshPath = `${modelFolder}/meshes/${sdfLinkName}_collision.stl`;
      const collisionShape = geometry.shapes.length === 1 ? geometry.shapes[0] : union(...geometry.shapes);
      files.push({
        path: collisionMeshPath,
        bytes: new Uint8Array(buildBinaryStl([{ name: `${part.name}_collision`, shape: collisionShape }])),
      });
    }

    manifestLinks.push({
      sourceName: part.name,
      sdfName: sdfLinkName,
      mesh: meshPath,
      massKg: estimateLinkMassKg(geometry, linkOptions?.massKg, linkOptions?.densityKgM3),
    });
  });

  const manifestJoints: SdfPackageManifestJoint[] = spec.assembly.joints.map((joint) => ({
    sourceName: joint.name,
    sdfName: jointNameMap.get(`${joint.name}_joint`)!,
    parent: linkNameMap.get(joint.parent) ?? 'world',
    child: linkNameMap.get(joint.child)!,
    type: joint.type,
  }));

  if (worldName) {
    files.push({
      path: `worlds/${worldName}.sdf`,
      text: demoWorldXml(worldName, modelName, model.cmdVelTopic, spec.world),
    });
  }

  const manifest: SdfPackageManifest = {
    format: 'forgecad-sdf-package',
    modelName,
    sourceModelName: spec.modelName,
    worldName,
    modelPath: `${modelFolder}/model.sdf`,
    worldPath: worldName ? `worlds/${worldName}.sdf` : undefined,
    cmdVelTopic: model.cmdVelTopic,
    jointStateTopic: model.jointStateTopic,
    links: manifestLinks,
    joints: manifestJoints,
    warnings,
  };

  files.push({ path: 'manifest.json', text: manifestJson(manifest) });

  return {
    modelName,
    worldName,
    manifest,
    files,
  };
}

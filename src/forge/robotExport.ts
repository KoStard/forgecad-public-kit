import type {
  Assembly,
  AssemblyDefinition,
  AssemblyJointDef,
  JointState,
} from './assembly';

export interface RobotLinkExportOptions {
  massKg?: number;
  densityKgM3?: number;
  collision?: 'visual' | 'none';
}

export interface RobotJointExportOptions {
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
}

export interface RobotDiffDrivePluginOptions {
  leftJoints: string[];
  rightJoints: string[];
  wheelSeparationMm: number;
  wheelRadiusMm: number;
  topic?: string;
  odomTopic?: string;
  tfTopic?: string;
  frameId?: string;
  odomFrameId?: string;
  maxLinearVelocity?: number;
  maxAngularVelocity?: number;
  linearAcceleration?: number;
  angularAcceleration?: number;
}

export interface RobotJointStatePublisherOptions {
  enabled?: boolean;
  joints?: string[];
  topic?: string;
  updateRate?: number;
}

export type RobotPose6 = [number, number, number, number, number, number];

export interface RobotWorldKeyboardTeleopOptions {
  enabled?: boolean;
  linearStep?: number;
  angularStep?: number;
}

export interface RobotWorldOptions {
  name?: string;
  generateDemoWorld?: boolean;
  spawnPose?: RobotPose6;
  keyboardTeleop?: RobotWorldKeyboardTeleopOptions;
}

export interface RobotExportOptions {
  assembly: Assembly;
  modelName?: string;
  state?: JointState;
  static?: boolean;
  selfCollide?: boolean;
  allowAutoDisable?: boolean;
  links?: Record<string, RobotLinkExportOptions>;
  joints?: Record<string, RobotJointExportOptions>;
  plugins?: {
    diffDrive?: RobotDiffDrivePluginOptions;
    jointStatePublisher?: RobotJointStatePublisherOptions;
  };
  world?: RobotWorldOptions;
}

export interface CollectedRobotExport {
  modelName: string;
  assembly: AssemblyDefinition;
  state: JointState;
  static: boolean;
  selfCollide: boolean;
  allowAutoDisable: boolean;
  links: Record<string, RobotLinkExportOptions>;
  joints: Record<string, RobotJointExportOptions>;
  plugins: {
    diffDrive?: RobotDiffDrivePluginOptions;
    jointStatePublisher?: RobotJointStatePublisherOptions;
  };
  world: RobotWorldOptions | null;
}

let _collectedRobotExport: CollectedRobotExport | null = null;

function cloneLinkOptions(
  input: Record<string, RobotLinkExportOptions> | undefined,
): Record<string, RobotLinkExportOptions> {
  if (!input) return {};
  return Object.fromEntries(Object.entries(input).map(([name, opts]) => [name, { ...opts }]));
}

function cloneJointOptions(
  input: Record<string, RobotJointExportOptions> | undefined,
): Record<string, RobotJointExportOptions> {
  if (!input) return {};
  return Object.fromEntries(Object.entries(input).map(([name, opts]) => [name, { ...opts }]));
}

function cloneDiffDrive(
  input: RobotDiffDrivePluginOptions | undefined,
): RobotDiffDrivePluginOptions | undefined {
  if (!input) return undefined;
  return {
    ...input,
    leftJoints: [...input.leftJoints],
    rightJoints: [...input.rightJoints],
  };
}

function cloneJointStatePublisher(
  input: RobotJointStatePublisherOptions | undefined,
): RobotJointStatePublisherOptions | undefined {
  if (!input) return undefined;
  return {
    ...input,
    joints: input.joints ? [...input.joints] : undefined,
  };
}

function cloneWorld(input: RobotWorldOptions | undefined): RobotWorldOptions | null {
  if (!input) return null;
  return {
    ...input,
    spawnPose: input.spawnPose ? [...input.spawnPose] as RobotPose6 : undefined,
    keyboardTeleop: input.keyboardTeleop ? { ...input.keyboardTeleop } : undefined,
  };
}

function assertFinite(value: number | undefined, label: string): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }
}

function jointByName(assembly: AssemblyDefinition): Map<string, AssemblyJointDef> {
  return new Map(assembly.joints.map((joint) => [joint.name, joint]));
}

export function resetRobotExport(): void {
  _collectedRobotExport = null;
}

export function getCollectedRobotExport(): CollectedRobotExport | null {
  return _collectedRobotExport;
}

export function robotExport(options: RobotExportOptions): CollectedRobotExport {
  if (!options || typeof options !== 'object') {
    throw new Error('robotExport(...) expects an options object');
  }
  if (!options.assembly || typeof options.assembly.describe !== 'function') {
    throw new Error('robotExport(...) requires an assembly');
  }

  const assembly = options.assembly.describe();
  const partNames = new Set(assembly.parts.map((part) => part.name));
  const joints = jointByName(assembly);

  const links = cloneLinkOptions(options.links);
  for (const [partName, link] of Object.entries(links)) {
    if (!partNames.has(partName)) throw new Error(`robotExport(...) unknown link "${partName}"`);
    assertFinite(link.massKg, `robotExport link "${partName}" massKg`);
    assertFinite(link.densityKgM3, `robotExport link "${partName}" densityKgM3`);
  }

  const jointOpts = cloneJointOptions(options.joints);
  for (const [jointName, joint] of Object.entries(jointOpts)) {
    if (!joints.has(jointName)) throw new Error(`robotExport(...) unknown joint "${jointName}"`);
    assertFinite(joint.effort, `robotExport joint "${jointName}" effort`);
    assertFinite(joint.velocity, `robotExport joint "${jointName}" velocity`);
    assertFinite(joint.damping, `robotExport joint "${jointName}" damping`);
    assertFinite(joint.friction, `robotExport joint "${jointName}" friction`);
  }

  const diffDrive = cloneDiffDrive(options.plugins?.diffDrive);
  if (diffDrive) {
    if (diffDrive.leftJoints.length === 0 || diffDrive.rightJoints.length === 0) {
      throw new Error('robotExport(...) diffDrive requires at least one left joint and one right joint');
    }
    assertFinite(diffDrive.wheelSeparationMm, 'robotExport(...) diffDrive wheelSeparationMm');
    assertFinite(diffDrive.wheelRadiusMm, 'robotExport(...) diffDrive wheelRadiusMm');
    if (diffDrive.wheelSeparationMm <= 0 || diffDrive.wheelRadiusMm <= 0) {
      throw new Error('robotExport(...) diffDrive wheel separation and radius must be > 0');
    }
    [...diffDrive.leftJoints, ...diffDrive.rightJoints].forEach((jointName) => {
      const joint = joints.get(jointName);
      if (!joint) throw new Error(`robotExport(...) diffDrive references unknown joint "${jointName}"`);
      if (joint.type !== 'revolute') {
        throw new Error(`robotExport(...) diffDrive joint "${jointName}" must be revolute`);
      }
    });
  }

  const jointStatePublisher = cloneJointStatePublisher(options.plugins?.jointStatePublisher);
  if (jointStatePublisher?.joints) {
    jointStatePublisher.joints.forEach((jointName) => {
      if (!joints.has(jointName)) {
        throw new Error(`robotExport(...) jointStatePublisher references unknown joint "${jointName}"`);
      }
    });
  }

  const world = cloneWorld(options.world);
  if (world?.spawnPose) {
    world.spawnPose.forEach((value, index) => assertFinite(value, `robotExport(...) world spawnPose[${index}]`));
  }
  assertFinite(world?.keyboardTeleop?.linearStep, 'robotExport(...) world keyboardTeleop.linearStep');
  assertFinite(world?.keyboardTeleop?.angularStep, 'robotExport(...) world keyboardTeleop.angularStep');

  _collectedRobotExport = {
    modelName: (options.modelName ?? assembly.name ?? 'ForgeCAD Robot').trim() || 'ForgeCAD Robot',
    assembly,
    state: { ...(options.state ?? {}) },
    static: options.static ?? false,
    selfCollide: options.selfCollide ?? false,
    allowAutoDisable: options.allowAutoDisable ?? true,
    links,
    joints: jointOpts,
    plugins: {
      diffDrive,
      jointStatePublisher,
    },
    world,
  };

  return _collectedRobotExport;
}

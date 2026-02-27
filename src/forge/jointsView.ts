export type JointViewType = 'revolute' | 'prismatic';
export type JointViewAxis = [number, number, number];

export interface JointViewInput {
  name: string;
  child: string;
  parent?: string;
  type?: JointViewType;
  axis?: JointViewAxis;
  pivot?: [number, number, number];
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
}

export interface JointViewDef {
  name: string;
  child: string;
  parent?: string;
  type: JointViewType;
  axis: JointViewAxis;
  pivot: [number, number, number];
  min?: number;
  max?: number;
  defaultValue: number;
  unit?: string;
}

export interface JointsViewOptions {
  enabled?: boolean;
  joints?: JointViewInput[];
}

export interface CollectedJointsView {
  enabled?: boolean;
  joints: JointViewDef[];
}

let _collected: CollectedJointsView | null = null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isVec3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value)
  && value.length === 3
  && isFiniteNumber(value[0])
  && isFiniteNumber(value[1])
  && isFiniteNumber(value[2]);

const normalizeAxis = (axis: [number, number, number]): JointViewAxis => {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len <= 1e-8) throw new Error('jointsView joint axis must be non-zero');
  return [axis[0] / len, axis[1] / len, axis[2] / len];
};

const clampDefault = (jointName: string, value: number, min?: number, max?: number): number => {
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error(`jointsView joint "${jointName}" has min > max`);
  }
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
};

const normalizeJoint = (joint: JointViewInput): JointViewDef => {
  if (!joint || typeof joint !== 'object') throw new Error('jointsView joints entries must be objects');

  const name = typeof joint.name === 'string' ? joint.name.trim() : '';
  if (!name) throw new Error('jointsView joint.name is required');

  const child = typeof joint.child === 'string' ? joint.child.trim() : '';
  if (!child) throw new Error(`jointsView joint "${name}" requires child`);

  let parent: string | undefined;
  if (joint.parent !== undefined) {
    if (typeof joint.parent !== 'string' || !joint.parent.trim()) {
      throw new Error(`jointsView joint "${name}" parent must be a non-empty string`);
    }
    parent = joint.parent.trim();
    if (parent === child) {
      throw new Error(`jointsView joint "${name}" cannot have parent equal to child`);
    }
  }

  const type = joint.type ?? 'revolute';
  if (type !== 'revolute' && type !== 'prismatic') {
    throw new Error(`jointsView joint "${name}" type must be "revolute" or "prismatic"`);
  }

  const axisRaw = joint.axis ?? [0, 0, 1];
  if (!isVec3(axisRaw)) throw new Error(`jointsView joint "${name}" axis must be [x, y, z]`);
  const axis = normalizeAxis([axisRaw[0], axisRaw[1], axisRaw[2]]);

  const pivotRaw = joint.pivot ?? [0, 0, 0];
  if (!isVec3(pivotRaw)) throw new Error(`jointsView joint "${name}" pivot must be [x, y, z]`);
  const pivot: [number, number, number] = [pivotRaw[0], pivotRaw[1], pivotRaw[2]];

  if (joint.min !== undefined && !isFiniteNumber(joint.min)) {
    throw new Error(`jointsView joint "${name}" min must be a finite number`);
  }
  if (joint.max !== undefined && !isFiniteNumber(joint.max)) {
    throw new Error(`jointsView joint "${name}" max must be a finite number`);
  }
  if (joint.default !== undefined && !isFiniteNumber(joint.default)) {
    throw new Error(`jointsView joint "${name}" default must be a finite number`);
  }

  const min = joint.min;
  const max = joint.max;
  const defaultValue = clampDefault(name, joint.default ?? 0, min, max);

  let unit: string | undefined;
  if (joint.unit !== undefined) {
    if (typeof joint.unit !== 'string') {
      throw new Error(`jointsView joint "${name}" unit must be a string`);
    }
    const trimmed = joint.unit.trim();
    unit = trimmed || undefined;
  } else {
    unit = type === 'prismatic' ? 'mm' : '°';
  }

  return {
    name,
    child,
    parent,
    type,
    axis,
    pivot,
    min,
    max,
    defaultValue,
    unit,
  };
};

const cloneJoint = (joint: JointViewDef): JointViewDef => ({
  ...joint,
  axis: [joint.axis[0], joint.axis[1], joint.axis[2]],
  pivot: [joint.pivot[0], joint.pivot[1], joint.pivot[2]],
});

const cloneCollected = (value: CollectedJointsView): CollectedJointsView => ({
  enabled: value.enabled,
  joints: value.joints.map(cloneJoint),
});

export function resetJointsView(): void {
  _collected = null;
}

export function getCollectedJointsView(): CollectedJointsView | null {
  return _collected ? cloneCollected(_collected) : null;
}

/**
 * Configure runtime joint controls that animate object transforms in the viewport
 * without re-running the script.
 */
export function jointsView(options: JointsViewOptions = {}): void {
  if (!options || typeof options !== 'object') {
    throw new Error('jointsView(options) expects an options object');
  }

  const next: CollectedJointsView = _collected ? cloneCollected(_collected) : { joints: [] };

  if (options.enabled !== undefined) {
    if (typeof options.enabled !== 'boolean') {
      throw new Error('jointsView.enabled must be a boolean');
    }
    next.enabled = options.enabled;
  }

  if (options.joints !== undefined) {
    if (!Array.isArray(options.joints)) {
      throw new Error('jointsView.joints must be an array');
    }
    const byName = new Map<string, JointViewDef>();
    next.joints.forEach((joint) => byName.set(joint.name, joint));

    options.joints.forEach((jointInput) => {
      const normalized = normalizeJoint(jointInput);
      byName.set(normalized.name, normalized);
    });

    next.joints = Array.from(byName.values()).map(cloneJoint);
  }

  _collected = next;
}

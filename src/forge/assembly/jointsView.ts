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
  hidden?: boolean;
}

export interface JointViewAnimationKeyframeInput {
  /** Timeline position [0, 1]. If omitted from ALL keyframes, positions are auto-computed from tick weights. */
  at?: number;
  /** Relative weight of the segment from this keyframe to the next (default 1). Only used in tick-based mode (when `at` is omitted). Last keyframe's ticks value is ignored. */
  ticks?: number;
  values: Record<string, number>;
}

export interface JointViewAnimationInput {
  name: string;
  duration?: number;
  loop?: boolean;
  continuous?: boolean;
  keyframes: JointViewAnimationKeyframeInput[];
}

export interface JointViewCouplingTermInput {
  joint: string;
  ratio?: number;
}

export interface JointViewCouplingInput {
  joint: string;
  terms: JointViewCouplingTermInput[];
  offset?: number;
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
  hidden?: boolean;
}

export interface JointViewAnimationKeyframeDef {
  at: number;
  values: Record<string, number>;
}

export interface JointViewAnimationDef {
  name: string;
  duration: number;
  loop: boolean;
  continuous: boolean;
  keyframes: JointViewAnimationKeyframeDef[];
}

export interface JointViewCouplingTermDef {
  joint: string;
  ratio: number;
}

export interface JointViewCouplingDef {
  joint: string;
  terms: JointViewCouplingTermDef[];
  offset: number;
}

export interface JointsViewOptions {
  enabled?: boolean;
  joints?: JointViewInput[];
  couplings?: JointViewCouplingInput[];
  animations?: JointViewAnimationInput[];
  defaultAnimation?: string;
}

export interface CollectedJointsView {
  enabled?: boolean;
  joints: JointViewDef[];
  couplings: JointViewCouplingDef[];
  animations: JointViewAnimationDef[];
  defaultAnimation?: string;
}

let _collected: CollectedJointsView | null = null;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isVec3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]) && isFiniteNumber(value[2]);

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
    hidden: joint.hidden === true ? true : undefined,
  };
};

const normalizeAnimation = (animation: JointViewAnimationInput): JointViewAnimationDef => {
  if (!animation || typeof animation !== 'object') {
    throw new Error('jointsView animations entries must be objects');
  }

  const name = typeof animation.name === 'string' ? animation.name.trim() : '';
  if (!name) throw new Error('jointsView animation.name is required');

  if (animation.duration !== undefined && (!isFiniteNumber(animation.duration) || animation.duration <= 0)) {
    throw new Error(`jointsView animation "${name}" duration must be a positive number`);
  }
  const duration = animation.duration ?? 2;
  const loop = animation.loop ?? true;
  if (animation.continuous !== undefined && typeof animation.continuous !== 'boolean') {
    throw new Error(`jointsView animation "${name}" continuous must be a boolean`);
  }
  const continuous = animation.continuous ?? false;

  if (!Array.isArray(animation.keyframes) || animation.keyframes.length === 0) {
    throw new Error(`jointsView animation "${name}" keyframes must be a non-empty array`);
  }

  // Detect tick-based vs explicit-at mode
  const hasExplicitAt = animation.keyframes.some((kf) => kf && typeof kf === 'object' && kf.at !== undefined);
  const hasImplicitAt = animation.keyframes.some((kf) => kf && typeof kf === 'object' && kf.at === undefined);
  if (hasExplicitAt && hasImplicitAt) {
    throw new Error(
      `jointsView animation "${name}" keyframes must either all have "at" or all omit it (tick-based); mixing is not allowed`,
    );
  }
  const tickBased = !hasExplicitAt;

  // Pre-validate ticks weights and compute cumulative positions for tick-based mode
  let tickPositions: number[] | null = null;
  if (tickBased && animation.keyframes.length > 1) {
    // Collect weights: each keyframe's `ticks` is the relative duration of the segment
    // from this keyframe to the next. Last keyframe's ticks is ignored.
    const weights: number[] = [];
    for (let i = 0; i < animation.keyframes.length - 1; i++) {
      const kf = animation.keyframes[i];
      if (kf && typeof kf === 'object' && kf.ticks !== undefined) {
        if (!isFiniteNumber(kf.ticks) || kf.ticks <= 0) {
          throw new Error(`jointsView animation "${name}" keyframes[${i}].ticks must be a positive number`);
        }
        weights.push(kf.ticks);
      } else {
        weights.push(1);
      }
    }
    // Validate last keyframe's ticks if present (we ignore it but still reject bad values)
    const lastKf = animation.keyframes[animation.keyframes.length - 1];
    if (lastKf && typeof lastKf === 'object' && lastKf.ticks !== undefined) {
      if (!isFiniteNumber(lastKf.ticks) || lastKf.ticks <= 0) {
        throw new Error(`jointsView animation "${name}" keyframes[${animation.keyframes.length - 1}].ticks must be a positive number`);
      }
    }

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    tickPositions = [0];
    let cumulative = 0;
    for (const w of weights) {
      cumulative += w;
      tickPositions.push(cumulative / totalWeight);
    }
  }

  const keyframes = animation.keyframes
    .map((keyframe, index): JointViewAnimationKeyframeDef => {
      if (!keyframe || typeof keyframe !== 'object') {
        throw new Error(`jointsView animation "${name}" keyframes[${index}] must be an object`);
      }

      let at: number;
      if (tickBased) {
        if (animation.keyframes.length === 1) {
          at = 0;
        } else {
          at = tickPositions![index];
        }
      } else {
        if (keyframe.ticks !== undefined) {
          throw new Error(`jointsView animation "${name}" keyframes[${index}].ticks cannot be used with explicit "at" values`);
        }
        if (!isFiniteNumber(keyframe.at)) {
          throw new Error(`jointsView animation "${name}" keyframes[${index}].at must be a finite number`);
        }
        if (keyframe.at! < 0 || keyframe.at! > 1) {
          throw new Error(`jointsView animation "${name}" keyframes[${index}].at must be within [0, 1]`);
        }
        at = keyframe.at!;
      }

      if (!keyframe.values || typeof keyframe.values !== 'object') {
        throw new Error(`jointsView animation "${name}" keyframes[${index}].values must be an object map`);
      }
      const values: Record<string, number> = {};
      Object.entries(keyframe.values).forEach(([jointName, value]) => {
        if (!isFiniteNumber(value)) {
          throw new Error(`jointsView animation "${name}" keyframes[${index}].values["${jointName}"] must be finite`);
        }
        values[jointName] = value;
      });
      if (Object.keys(values).length === 0) {
        throw new Error(`jointsView animation "${name}" keyframes[${index}] must animate at least one joint`);
      }
      return { at, values };
    })
    .sort((a, b) => a.at - b.at);

  return {
    name,
    duration,
    loop,
    continuous,
    keyframes,
  };
};

const normalizeCoupling = (coupling: JointViewCouplingInput): JointViewCouplingDef => {
  if (!coupling || typeof coupling !== 'object') {
    throw new Error('jointsView couplings entries must be objects');
  }

  const joint = typeof coupling.joint === 'string' ? coupling.joint.trim() : '';
  if (!joint) throw new Error('jointsView coupling.joint is required');

  if (!Array.isArray(coupling.terms) || coupling.terms.length === 0) {
    throw new Error(`jointsView coupling "${joint}" terms must be a non-empty array`);
  }

  const seen = new Set<string>();
  const terms = coupling.terms.map((term, index): JointViewCouplingTermDef => {
    if (!term || typeof term !== 'object') {
      throw new Error(`jointsView coupling "${joint}" terms[${index}] must be an object`);
    }
    const source = typeof term.joint === 'string' ? term.joint.trim() : '';
    if (!source) {
      throw new Error(`jointsView coupling "${joint}" terms[${index}].joint is required`);
    }
    if (seen.has(source)) {
      throw new Error(`jointsView coupling "${joint}" has duplicate source "${source}"`);
    }
    seen.add(source);
    const ratio = term.ratio ?? 1;
    if (!isFiniteNumber(ratio)) {
      throw new Error(`jointsView coupling "${joint}" terms[${index}].ratio must be finite`);
    }
    return { joint: source, ratio };
  });

  if (coupling.offset !== undefined && !isFiniteNumber(coupling.offset)) {
    throw new Error(`jointsView coupling "${joint}" offset must be finite`);
  }

  return {
    joint,
    terms,
    offset: coupling.offset ?? 0,
  };
};

const cloneJoint = (joint: JointViewDef): JointViewDef => ({
  ...joint,
  axis: [joint.axis[0], joint.axis[1], joint.axis[2]],
  pivot: [joint.pivot[0], joint.pivot[1], joint.pivot[2]],
});

const cloneAnimation = (animation: JointViewAnimationDef): JointViewAnimationDef => ({
  ...animation,
  keyframes: animation.keyframes.map((keyframe) => ({
    at: keyframe.at,
    values: { ...keyframe.values },
  })),
});

const cloneCoupling = (coupling: JointViewCouplingDef): JointViewCouplingDef => ({
  joint: coupling.joint,
  terms: coupling.terms.map((term) => ({ joint: term.joint, ratio: term.ratio })),
  offset: coupling.offset,
});

const validateCouplings = (joints: JointViewDef[], couplings: JointViewCouplingDef[]): void => {
  const jointNames = new Set(joints.map((joint) => joint.name));
  const couplingByJoint = new Map<string, JointViewCouplingDef>();

  couplings.forEach((coupling) => {
    if (!jointNames.has(coupling.joint)) {
      throw new Error(`jointsView coupling target "${coupling.joint}" does not exist`);
    }
    if (couplingByJoint.has(coupling.joint)) {
      throw new Error(`jointsView has duplicate coupling for "${coupling.joint}"`);
    }
    coupling.terms.forEach((term) => {
      if (!jointNames.has(term.joint)) {
        throw new Error(`jointsView coupling "${coupling.joint}" references unknown joint "${term.joint}"`);
      }
      if (term.joint === coupling.joint) {
        throw new Error(`jointsView coupling "${coupling.joint}" cannot reference itself`);
      }
    });
    couplingByJoint.set(coupling.joint, coupling);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (jointName: string): void => {
    if (visited.has(jointName)) return;
    if (visiting.has(jointName)) {
      throw new Error(`jointsView coupling cycle detected at "${jointName}"`);
    }
    visiting.add(jointName);
    const coupling = couplingByJoint.get(jointName);
    if (coupling) {
      coupling.terms.forEach((term) => walk(term.joint));
    }
    visiting.delete(jointName);
    visited.add(jointName);
  };

  couplingByJoint.forEach((_, jointName) => walk(jointName));
};

const validateAnimationsAgainstCouplings = (animations: JointViewAnimationDef[], couplings: JointViewCouplingDef[]): void => {
  const coupledJointNames = new Set(couplings.map((coupling) => coupling.joint));
  if (coupledJointNames.size === 0) return;

  animations.forEach((animation) => {
    animation.keyframes.forEach((keyframe, index) => {
      Object.keys(keyframe.values).forEach((jointName) => {
        if (coupledJointNames.has(jointName)) {
          throw new Error(`jointsView animation "${animation.name}" keyframes[${index}] cannot set coupled joint "${jointName}"`);
        }
      });
    });
  });
};

const clampJointValue = (joint: JointViewDef, value: number): number => {
  let clamped = Number.isFinite(value) ? value : joint.defaultValue;
  if (joint.min !== undefined) clamped = Math.max(joint.min, clamped);
  if (joint.max !== undefined) clamped = Math.min(joint.max, clamped);
  return clamped;
};

export interface ResolveJointViewValueOptions {
  clamp?: boolean;
}

export function resolveJointViewValues(
  joints: JointViewDef[],
  couplings: JointViewCouplingDef[] = [],
  baseValues: Record<string, number> = {},
  options: ResolveJointViewValueOptions = {},
): Record<string, number> {
  const shouldClamp = options.clamp ?? false;
  const jointByName = new Map<string, JointViewDef>();
  joints.forEach((joint) => jointByName.set(joint.name, joint));
  const couplingByJoint = new Map<string, JointViewCouplingDef>();
  couplings.forEach((coupling) => couplingByJoint.set(coupling.joint, coupling));

  const cache = new Map<string, number>();
  const resolving = new Set<string>();
  const resolveValue = (jointName: string): number => {
    const cached = cache.get(jointName);
    if (cached !== undefined) return cached;

    const joint = jointByName.get(jointName);
    if (!joint) return 0;

    if (resolving.has(jointName)) {
      const cycleFallback = baseValues[jointName] ?? joint.defaultValue;
      return shouldClamp ? clampJointValue(joint, cycleFallback) : cycleFallback;
    }
    resolving.add(jointName);

    let raw = baseValues[jointName] ?? joint.defaultValue;
    const coupling = couplingByJoint.get(jointName);
    if (coupling) {
      raw = coupling.offset;
      coupling.terms.forEach((term) => {
        raw += term.ratio * resolveValue(term.joint);
      });
    }

    const resolved = shouldClamp ? clampJointValue(joint, raw) : Number.isFinite(raw) ? raw : joint.defaultValue;
    cache.set(jointName, resolved);
    resolving.delete(jointName);
    return resolved;
  };

  const out: Record<string, number> = {};
  joints.forEach((joint) => {
    out[joint.name] = resolveValue(joint.name);
  });
  return out;
}

const cloneCollected = (value: CollectedJointsView): CollectedJointsView => ({
  enabled: value.enabled,
  joints: value.joints.map(cloneJoint),
  couplings: (value.couplings ?? []).map(cloneCoupling),
  animations: (value.animations ?? []).map(cloneAnimation),
  defaultAnimation: value.defaultAnimation,
});

export function resetJointsView(): void {
  _collected = null;
}

export function getCollectedJointsView(): CollectedJointsView | null {
  return _collected ? cloneCollected(_collected) : null;
}

/** Save the current jointsView state (for restoring after child file execution). */
export function saveJointsView(): CollectedJointsView | null {
  return _collected ? cloneCollected(_collected) : null;
}

/** Restore a previously saved jointsView state. */
export function restoreJointsView(state: CollectedJointsView | null): void {
  _collected = state;
}

/**
 * Configure runtime joint controls that animate object transforms in the viewport
 * without re-running the script.
 */
export function jointsView(options: JointsViewOptions = {}): void {
  if (!options || typeof options !== 'object') {
    throw new Error('jointsView(options) expects an options object');
  }

  const next: CollectedJointsView = _collected ? cloneCollected(_collected) : { joints: [], couplings: [], animations: [] };

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

  if (options.couplings !== undefined) {
    if (!Array.isArray(options.couplings)) {
      throw new Error('jointsView.couplings must be an array');
    }
    const byJoint = new Map<string, JointViewCouplingDef>();
    next.couplings.forEach((coupling) => byJoint.set(coupling.joint, coupling));

    options.couplings.forEach((couplingInput) => {
      const normalized = normalizeCoupling(couplingInput);
      byJoint.set(normalized.joint, normalized);
    });

    next.couplings = Array.from(byJoint.values()).map(cloneCoupling);
  }

  if (options.animations !== undefined) {
    if (!Array.isArray(options.animations)) {
      throw new Error('jointsView.animations must be an array');
    }
    const byName = new Map<string, JointViewAnimationDef>();
    next.animations.forEach((animation) => byName.set(animation.name, animation));

    options.animations.forEach((animationInput) => {
      const normalized = normalizeAnimation(animationInput);
      byName.set(normalized.name, normalized);
    });

    next.animations = Array.from(byName.values()).map(cloneAnimation);
  }

  if (options.defaultAnimation !== undefined) {
    if (typeof options.defaultAnimation !== 'string') {
      throw new Error('jointsView.defaultAnimation must be a string');
    }
    const trimmed = options.defaultAnimation.trim();
    next.defaultAnimation = trimmed.length > 0 ? trimmed : undefined;
  }

  validateCouplings(next.joints, next.couplings);
  validateAnimationsAgainstCouplings(next.animations, next.couplings);

  if (next.defaultAnimation && !next.animations.some((animation) => animation.name === next.defaultAnimation)) {
    throw new Error(`jointsView defaultAnimation "${next.defaultAnimation}" does not exist in animations`);
  }

  _collected = next;
}

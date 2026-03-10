export type ExplodeAxis = 'x' | 'y' | 'z';
export type ExplodeDirection = 'radial' | ExplodeAxis | [number, number, number];

export interface ExplodeDirective {
  /** Multiplier applied to `amount` for this node */
  stage?: number;
  /** Direction mode for this node */
  direction?: ExplodeDirection;
  /** Optional axis lock after direction is resolved */
  axisLock?: ExplodeAxis;
}

export interface ExplodeConfigOptions {
  amount?: number;
  stages?: number[];
  mode?: ExplodeDirection;
  axisLock?: ExplodeAxis;
  byName?: Record<string, ExplodeDirective>;
  byPath?: Record<string, ExplodeDirective>;
}

export type ExplodeBounds = { min: [number, number, number]; max: [number, number, number] };

export interface ResolvedExplodeConfig {
  amount: number;
  stageForDepth: (depth: number) => number;
  defaultMode: ExplodeDirection;
  defaultAxisLock?: ExplodeAxis;
  byName: Record<string, ExplodeDirective>;
  byPath: Record<string, ExplodeDirective>;
}

export interface ExplodeOffsetInput {
  pathKeys: string[];
  seed: string;
  depth: number;
  center: [number, number, number];
  originCenter: [number, number, number];
  name?: string;
  local?: ExplodeDirective;
  config: ResolvedExplodeConfig;
}

export function createResolvedExplodeConfig(options: ExplodeConfigOptions = {}): ResolvedExplodeConfig {
  const stages = options.stages ?? [];
  return {
    amount: options.amount ?? 10,
    stageForDepth: (depth: number): number => {
      if (stages.length === 0) return Math.max(1, depth);
      const idx = Math.max(0, depth - 1);
      return stages[Math.min(idx, stages.length - 1)];
    },
    defaultMode: options.mode ?? 'radial',
    defaultAxisLock: options.axisLock,
    byName: options.byName ?? {},
    byPath: options.byPath ?? {},
  };
}

export function mergeExplodeDirectives(...directives: (ExplodeDirective | undefined)[]): ExplodeDirective {
  const out: ExplodeDirective = {};
  directives.forEach((directive) => {
    if (!directive) return;
    if (directive.stage !== undefined) out.stage = directive.stage;
    if (directive.direction !== undefined) out.direction = directive.direction;
    if (directive.axisLock !== undefined) out.axisLock = directive.axisLock;
  });
  return out;
}

export function resolveExplodeDirective(
  pathKeys: string[],
  name: string | undefined,
  local: ExplodeDirective | undefined,
  config: Pick<ResolvedExplodeConfig, 'byName' | 'byPath'>,
): ExplodeDirective {
  const directives: (ExplodeDirective | undefined)[] = [];
  if (name) directives.push(config.byName[name]);
  pathKeys.forEach((pathKey) => {
    directives.push(config.byPath[pathKey]);
  });
  directives.push(local);
  return mergeExplodeDirectives(...directives);
}

export function computeExplodeOffset({
  pathKeys,
  seed,
  depth,
  center,
  originCenter,
  name,
  local,
  config,
}: ExplodeOffsetInput): [number, number, number] {
  const merged = resolveExplodeDirective(pathKeys, name, local, config);
  const stage = merged.stage ?? config.stageForDepth(depth);
  const direction = resolveExplodeDirection(
    merged.direction ?? config.defaultMode,
    center,
    originCenter,
    seed,
  );
  const locked = applyExplodeAxisLock(direction, merged.axisLock ?? config.defaultAxisLock, seed);
  return explodeMul(locked, config.amount * stage);
}

export function explodeMergeBounds(a: ExplodeBounds | null, b: ExplodeBounds | null): ExplodeBounds | null {
  if (!a) return b ? { min: [...b.min], max: [...b.max] } : null;
  if (!b) return { min: [...a.min], max: [...a.max] };
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
}

export function explodeBoundsCenter(bounds: ExplodeBounds | null): [number, number, number] | null {
  if (!bounds) return null;
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

export function explodeAdd(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function explodeMul(
  v: [number, number, number],
  k: number,
): [number, number, number] {
  return [v[0] * k, v[1] * k, v[2] * k];
}

export function explodeLength(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

export function explodeNormalize(
  v: [number, number, number],
  fallback: [number, number, number],
): [number, number, number] {
  const len = explodeLength(v);
  if (len > 1e-8) return [v[0] / len, v[1] / len, v[2] / len];
  const fallbackLength = explodeLength(fallback);
  if (fallbackLength > 1e-8) {
    return [
      fallback[0] / fallbackLength,
      fallback[1] / fallbackLength,
      fallback[2] / fallbackLength,
    ];
  }
  return [1, 0, 0];
}

export function explodeHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function explodeFallbackVector(seed: string): [number, number, number] {
  const x = ((explodeHash(`${seed}|x`) % 2001) - 1000) / 1000;
  const y = ((explodeHash(`${seed}|y`) % 2001) - 1000) / 1000;
  const z = ((explodeHash(`${seed}|z`) % 2001) - 1000) / 1000;
  return [x, y, z];
}

export function resolveExplodeDirection(
  mode: ExplodeDirection,
  center: [number, number, number],
  originCenter: [number, number, number],
  seed: string,
): [number, number, number] {
  if (Array.isArray(mode)) {
    return explodeNormalize(mode, explodeFallbackVector(`${seed}|vec`));
  }
  if (mode === 'radial') {
    return explodeNormalize(
      [
        center[0] - originCenter[0],
        center[1] - originCenter[1],
        center[2] - originCenter[2],
      ],
      explodeFallbackVector(`${seed}|radial`),
    );
  }
  if (mode === 'x') return [1, 0, 0];
  if (mode === 'y') return [0, 1, 0];
  return [0, 0, 1];
}

export function applyExplodeAxisLock(
  vec: [number, number, number],
  axis: ExplodeAxis | undefined,
  seed: string,
): [number, number, number] {
  if (!axis) return vec;
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const fallback = explodeFallbackVector(`${seed}|axis`);
  const component = Math.abs(vec[index]) > 1e-8 ? vec[index] : fallback[index];
  const sign = component >= 0 ? 1 : -1;
  if (index === 0) return [sign, 0, 0];
  if (index === 1) return [0, sign, 0];
  return [0, 0, sign];
}

import type { ExplodeAxis, ExplodeDirective, ExplodeDirection } from './explodeCore';

export type ExplodeViewDirection = ExplodeDirection;
export interface ExplodeViewDirective extends ExplodeDirective {}

export interface ExplodeViewOptions {
  /** Set false to disable viewport explode offsets for this script output. */
  enabled?: boolean;
  /** Scales the UI explode amount. Default: 1 */
  amountScale?: number;
  /**
   * Per-depth stage multipliers (depth 1 = first level).
   * If depth exceeds this array, the last value is reused.
   * Default when omitted: depth number (1, 2, 3, ...)
   */
  stages?: number[];
  /** Global direction mode fallback. Default: 'radial' */
  mode?: ExplodeViewDirection;
  /** Global axis lock fallback. */
  axisLock?: ExplodeAxis;
  /** Per-object overrides by final object name. */
  byName?: Record<string, ExplodeViewDirective>;
  /** Per-tree-path overrides using slash-separated object tree segments. */
  byPath?: Record<string, ExplodeViewDirective>;
}

let _collected: ExplodeViewOptions | null = null;

const isAxis = (value: unknown): value is ExplodeAxis =>
  value === 'x' || value === 'y' || value === 'z';

const normalizeDirection = (
  value: unknown,
  label: string,
): ExplodeViewDirection => {
  if (value === 'radial' || isAxis(value)) return value;
  if (
    Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  ) {
    return [value[0], value[1], value[2]];
  }
  throw new Error(`${label} must be 'radial', 'x'|'y'|'z', or [x, y, z]`);
};

const cloneDirective = (directive: ExplodeViewDirective): ExplodeViewDirective => {
  const out: ExplodeViewDirective = {};
  if (directive.stage !== undefined) out.stage = directive.stage;
  if (directive.direction !== undefined) {
    out.direction = Array.isArray(directive.direction)
      ? [...directive.direction] as [number, number, number]
      : directive.direction;
  }
  if (directive.axisLock !== undefined) out.axisLock = directive.axisLock;
  return out;
};

const cloneOptions = (options: ExplodeViewOptions): ExplodeViewOptions => {
  const out: ExplodeViewOptions = {};
  if (options.enabled !== undefined) out.enabled = options.enabled;
  if (options.amountScale !== undefined) out.amountScale = options.amountScale;
  if (options.stages !== undefined) out.stages = [...options.stages];
  if (options.mode !== undefined) {
    out.mode = Array.isArray(options.mode)
      ? [...options.mode] as [number, number, number]
      : options.mode;
  }
  if (options.axisLock !== undefined) out.axisLock = options.axisLock;
  if (options.byName) {
    const byName: Record<string, ExplodeViewDirective> = {};
    Object.entries(options.byName).forEach(([name, directive]) => {
      byName[name] = cloneDirective(directive);
    });
    out.byName = byName;
  }
  if (options.byPath) {
    const byPath: Record<string, ExplodeViewDirective> = {};
    Object.entries(options.byPath).forEach(([path, directive]) => {
      byPath[path] = cloneDirective(directive);
    });
    out.byPath = byPath;
  }
  return out;
};

const mergeDirective = (
  target: ExplodeViewDirective,
  patch: ExplodeViewDirective,
  label: string,
): ExplodeViewDirective => {
  const out = cloneDirective(target);

  if (patch.stage !== undefined) {
    if (!Number.isFinite(patch.stage)) throw new Error(`${label}.stage must be a finite number`);
    out.stage = patch.stage;
  }
  if (patch.direction !== undefined) {
    out.direction = normalizeDirection(patch.direction, `${label}.direction`);
  }
  if (patch.axisLock !== undefined) {
    if (!isAxis(patch.axisLock)) throw new Error(`${label}.axisLock must be 'x', 'y', or 'z'`);
    out.axisLock = patch.axisLock;
  }

  return out;
};

export function resetExplodeView(): void {
  _collected = null;
}

export function getCollectedExplodeView(): ExplodeViewOptions | null {
  return _collected ? cloneOptions(_collected) : null;
}

/**
 * Configure viewport exploded-view behavior for the current script execution.
 * Multiple calls merge; later values override earlier ones.
 */
export function explodeView(options: ExplodeViewOptions = {}): void {
  if (!options || typeof options !== 'object') {
    throw new Error('explodeView(options) expects an options object');
  }

  const next: ExplodeViewOptions = _collected ? cloneOptions(_collected) : {};

  if (options.enabled !== undefined) {
    if (typeof options.enabled !== 'boolean') throw new Error('explodeView.enabled must be a boolean');
    next.enabled = options.enabled;
  }

  if (options.amountScale !== undefined) {
    if (!Number.isFinite(options.amountScale)) throw new Error('explodeView.amountScale must be a finite number');
    next.amountScale = options.amountScale;
  }

  if (options.stages !== undefined) {
    if (!Array.isArray(options.stages) || !options.stages.every((value) => Number.isFinite(value))) {
      throw new Error('explodeView.stages must be an array of finite numbers');
    }
    next.stages = [...options.stages];
  }

  if (options.mode !== undefined) {
    next.mode = normalizeDirection(options.mode, 'explodeView.mode');
  }

  if (options.axisLock !== undefined) {
    if (!isAxis(options.axisLock)) throw new Error('explodeView.axisLock must be \'x\', \'y\', or \'z\'');
    next.axisLock = options.axisLock;
  }

  if (options.byName !== undefined) {
    if (!options.byName || typeof options.byName !== 'object') {
      throw new Error('explodeView.byName must be an object map');
    }
    const byName: Record<string, ExplodeViewDirective> = { ...(next.byName ?? {}) };
    Object.entries(options.byName).forEach(([name, directive]) => {
      if (!directive || typeof directive !== 'object') {
        throw new Error(`explodeView.byName["${name}"] must be an object`);
      }
      byName[name] = mergeDirective(byName[name] ?? {}, directive, `explodeView.byName["${name}"]`);
    });
    next.byName = byName;
  }

  if (options.byPath !== undefined) {
    if (!options.byPath || typeof options.byPath !== 'object') {
      throw new Error('explodeView.byPath must be an object map');
    }
    const byPath: Record<string, ExplodeViewDirective> = { ...(next.byPath ?? {}) };
    Object.entries(options.byPath).forEach(([path, directive]) => {
      if (!directive || typeof directive !== 'object') {
        throw new Error(`explodeView.byPath["${path}"] must be an object`);
      }
      byPath[path] = mergeDirective(byPath[path] ?? {}, directive, `explodeView.byPath["${path}"]`);
    });
    next.byPath = byPath;
  }

  _collected = next;
}

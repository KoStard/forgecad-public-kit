/**
 * ForgeCAD Parameter System
 *
 * param() calls during script execution register parameters that
 * auto-generate slider UI. The runtime collects them, and the UI
 * renders controls. When a slider changes, the script re-executes
 * with the new value.
 */

export interface ParamDef {
  name: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  integer?: boolean;
  reverse?: boolean;
  boolean?: boolean;
}

interface ParamScope {
  namePrefix?: string;
  localOverrides?: Record<string, number>;
}

let _params: ParamDef[] = [];
let _overrides: Record<string, number> = {};
let _scopeStack: ParamScope[] = [];

/** Called before each script execution to reset collected params */
export function resetParams() {
  _params = [];
  _scopeStack = [];
}

/** Set parameter overrides (from slider UI) */
export function setParamOverrides(overrides: Record<string, number>) {
  _overrides = overrides;
}

/** Get all params collected during last execution */
export function getCollectedParams(): ParamDef[] {
  return _params;
}

/** Execute code inside a parameter scope (used by importPart/importSketch). */
export function runWithParamScope<T>(scope: ParamScope, fn: () => T): T {
  _scopeStack.push(scope);
  try {
    return fn();
  } finally {
    _scopeStack.pop();
  }
}

function hasOwn(obj: Record<string, number>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Declare a parameter. Returns the current value (default or overridden).
 * Each call registers the param for UI generation.
 */
export function param(
  name: string,
  defaultValue: number,
  opts: { min?: number; max?: number; step?: number; unit?: string; integer?: boolean; reverse?: boolean } = {},
): number {
  const scope = _scopeStack[_scopeStack.length - 1];
  const scopedName = scope?.namePrefix ? `${scope.namePrefix} / ${name}` : name;
  const scopedLocal = scope?.localOverrides;
  const hasLocalOverride = !!(scopedLocal && hasOwn(scopedLocal, name));

  const raw = (hasLocalOverride ? scopedLocal![name] : undefined)
    ?? _overrides[scopedName]
    ?? _overrides[name]
    ?? defaultValue;
  const integer = opts.integer ?? false;
  const value = integer ? Math.round(raw) : raw;
  const min = opts.min ?? 0;
  const max = opts.max ?? defaultValue * 4;
  const step = opts.step ?? (integer ? 1 : (max - min > 100 ? 1 : 0.1));

  if (!hasLocalOverride) {
    const def = integer ? Math.round(defaultValue) : defaultValue;
    _params.push({ name: scopedName, value, defaultValue: def, min, max, step, unit: opts.unit, integer, reverse: opts.reverse });
  }
  return value;
}

/**
 * Declare a boolean parameter. Returns the current boolean value.
 * Renders as a checkbox in the UI.
 */
export function boolParam(name: string, defaultValue: boolean): boolean {
  const scope = _scopeStack[_scopeStack.length - 1];
  const scopedName = scope?.namePrefix ? `${scope.namePrefix} / ${name}` : name;
  const scopedLocal = scope?.localOverrides;
  const hasLocalOverride = !!(scopedLocal && hasOwn(scopedLocal, name));

  const numDefault = defaultValue ? 1 : 0;
  const raw = (hasLocalOverride ? scopedLocal![name] : undefined)
    ?? _overrides[scopedName]
    ?? _overrides[name]
    ?? numDefault;
  const value = raw >= 0.5 ? 1 : 0;

  if (!hasLocalOverride) {
    _params.push({ name: scopedName, value, defaultValue: numDefault, min: 0, max: 1, step: 1, boolean: true });
  }
  return value === 1;
}

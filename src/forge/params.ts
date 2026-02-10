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
  min: number;
  max: number;
  step: number;
  unit?: string;
  integer?: boolean;
}

let _params: ParamDef[] = [];
let _overrides: Record<string, number> = {};

/** Called before each script execution to reset collected params */
export function resetParams() {
  _params = [];
}

/** Set parameter overrides (from slider UI) */
export function setParamOverrides(overrides: Record<string, number>) {
  _overrides = overrides;
}

/** Get all params collected during last execution */
export function getCollectedParams(): ParamDef[] {
  return _params;
}

/**
 * Declare a parameter. Returns the current value (default or overridden).
 * Each call registers the param for UI generation.
 */
export function param(
  name: string,
  defaultValue: number,
  opts: { min?: number; max?: number; step?: number; unit?: string; integer?: boolean } = {},
): number {
  const raw = _overrides[name] ?? defaultValue;
  const integer = opts.integer ?? false;
  const value = integer ? Math.round(raw) : raw;
  const min = opts.min ?? 0;
  const max = opts.max ?? defaultValue * 4;
  const step = opts.step ?? (integer ? 1 : (max - min > 100 ? 1 : 0.1));

  _params.push({ name, value, min, max, step, unit: opts.unit, integer });
  return value;
}

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
  /** Keys from localOverrides that were consumed by param()/boolParam() calls */
  consumedKeys?: Set<string>;
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

/** Execute code inside a parameter scope (used by require() with param overrides). */
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

  if (hasLocalOverride) scope!.consumedKeys?.add(name);

  const raw = (hasLocalOverride ? scopedLocal![name] : undefined) ?? _overrides[scopedName] ?? _overrides[name] ?? defaultValue;
  const integer = opts.integer ?? false;
  const value = integer ? Math.round(raw) : raw;
  const min = opts.min ?? 0;
  const max = opts.max ?? defaultValue * 4;
  const step = opts.step ?? (integer ? 1 : max - min > 100 ? 1 : 0.1);

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

  if (hasLocalOverride) scope!.consumedKeys?.add(name);

  const numDefault = defaultValue ? 1 : 0;
  const raw = (hasLocalOverride ? scopedLocal![name] : undefined) ?? _overrides[scopedName] ?? _overrides[name] ?? numDefault;
  const value = raw >= 0.5 ? 1 : 0;

  if (!hasLocalOverride) {
    _params.push({ name: scopedName, value, defaultValue: numDefault, min: 0, max: 1, step: 1, boolean: true });
  }
  return value === 1;
}

/**
 * Create a scope with consumed-key tracking enabled.
 * Pass the returned scope to runWithParamScope(), then call
 * validateConsumedOverrides() after execution completes.
 */
export function createTrackedScope(namePrefix: string, localOverrides: Record<string, number>): ParamScope {
  return { namePrefix, localOverrides, consumedKeys: new Set() };
}

/**
 * After executing an imported file, check that every key in localOverrides
 * was consumed by a param()/boolParam() call. Throws if any keys were not
 * recognized, with fuzzy-match suggestions.
 */
export function validateConsumedOverrides(scope: ParamScope, importKind: string, resolvedPath: string): void {
  const overrides = scope.localOverrides;
  const consumed = scope.consumedKeys;
  if (!overrides || !consumed) return;

  const unconsumed = Object.keys(overrides).filter((k) => !consumed.has(k));
  if (unconsumed.length === 0) return;

  // Collect known param names for suggestions
  const knownNames = new Set<string>();
  for (const p of _params) {
    // Strip scope prefix to get local name
    const slashIdx = p.name.lastIndexOf(' / ');
    knownNames.add(slashIdx >= 0 ? p.name.slice(slashIdx + 3) : p.name);
  }
  // Also include consumed keys (they are valid names)
  for (const k of consumed) knownNames.add(k);

  const suggestions = unconsumed.map((name) => {
    const close = findClosestMatch(name, knownNames);
    return close ? `  "${name}" (did you mean "${close}"?)` : `  "${name}"`;
  });

  throw new Error(
    `${importKind}("${resolvedPath}"): unrecognized parameter override${unconsumed.length > 1 ? 's' : ''}:\n` +
      suggestions.join('\n') +
      `\n\nAvailable parameters: ${[...knownNames].map((n) => `"${n}"`).join(', ') || '(none)'}`,
  );
}

/** Simple Levenshtein-based closest match for typo suggestions. */
function findClosestMatch(input: string, candidates: Set<string>): string | null {
  const inputLower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const dist = levenshtein(inputLower, candidate.toLowerCase());
    if (dist < bestDist && dist <= Math.max(input.length, candidate.length) * 0.5) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

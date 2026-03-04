/** Cut plane definitions collected during script execution. */

export type CutPlaneExcludeInput = string | string[];

export interface CutPlaneOptions {
  /** Optional offset along the plane normal (primarily for object-form overload). */
  offset?: number;
  /** Object names to keep uncut for this plane. */
  exclude?: CutPlaneExcludeInput;
}

export interface CutPlaneDef {
  name: string;
  normal: [number, number, number];
  offset: number;
  excludeObjectNames?: string[];
}

let _collected: CutPlaneDef[] = [];

export function resetCutPlanes() {
  _collected = [];
}

export function getCollectedCutPlanes(): CutPlaneDef[] {
  return _collected.slice();
}

function normalizeExcludedObjectNames(input: CutPlaneExcludeInput | undefined): string[] | undefined {
  if (input === undefined) return undefined;
  const values = Array.isArray(input) ? input : [input];
  const cleaned = Array.from(new Set(
    values
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  ));
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Define a named section/cut plane. Appears as a toggle in the View Panel.
 * When enabled, geometry on the positive side of the plane is clipped away.
 *
 * @param name   Display name in the View Panel
 * @param normal Plane normal direction [x, y, z] — geometry on this side is removed
 * @param offset Distance from origin along the normal. Default: 0
 * @param options.exclude Names of returned scene objects to keep uncut for this plane
 */
export function cutPlane(name: string, normal: [number, number, number], offset?: number, options?: CutPlaneOptions): void;
export function cutPlane(name: string, normal: [number, number, number], options?: CutPlaneOptions): void;
export function cutPlane(
  name: string,
  normal: [number, number, number],
  offsetOrOptions: number | CutPlaneOptions = 0,
  maybeOptions: CutPlaneOptions = {},
): void {
  const usingOffsetArg = typeof offsetOrOptions === 'number';
  const rawOffset = usingOffsetArg ? offsetOrOptions : offsetOrOptions.offset ?? 0;
  const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
  const options = usingOffsetArg ? maybeOptions : offsetOrOptions;
  const excludeObjectNames = normalizeExcludedObjectNames(options.exclude);
  _collected.push({ name, normal, offset, excludeObjectNames });
}

/** Cut plane definitions collected during script execution. */

export interface CutPlaneDef {
  name: string;
  normal: [number, number, number];
  offset: number;
}

let _collected: CutPlaneDef[] = [];

export function resetCutPlanes() {
  _collected = [];
}

export function getCollectedCutPlanes(): CutPlaneDef[] {
  return _collected.slice();
}

/**
 * Define a named section/cut plane. Appears as a toggle in the View Panel.
 * When enabled, geometry on the positive side of the plane is clipped away.
 *
 * @param name   Display name in the View Panel
 * @param normal Plane normal direction [x, y, z] — geometry on this side is removed
 * @param offset Distance from origin along the normal. Default: 0
 */
export function cutPlane(name: string, normal: [number, number, number], offset = 0): void {
  _collected.push({ name, normal, offset });
}

/**
 * Dimension Annotations
 *
 * Purely visual dimension callouts for code-generated models.
 * Not constraints — just reporting labels rendered in the viewport.
 *
 * Usage:
 *   dim([0,0,0], [100,0,0]);                    // basic 2-point dimension
 *   dim([0,0,0], [100,0,0], { offset: 15 });    // with offset
 *   dim([0,0,0], [100,0,0], { label: "Width" });
 */

import { Point2D, Line2D } from './entities';

export interface DimensionDef {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  offset: number;
  label?: string;
  color?: string;
}

let collectedDimensions: DimensionDef[] = [];
let dimCounter = 0;

export function resetDimensions(): void {
  collectedDimensions = [];
  dimCounter = 0;
}

export function getCollectedDimensions(): DimensionDef[] {
  return collectedDimensions;
}

type PointArg = [number, number] | [number, number, number] | Point2D;

function toVec3(p: PointArg): [number, number, number] {
  if (p instanceof Point2D) return [p.x, p.y, 0];
  if (p.length === 2) return [p[0], p[1], 0];
  return [p[0], p[1], p[2]];
}

interface DimOpts {
  offset?: number;
  label?: string;
  color?: string;
}

/**
 * Add a dimension annotation between two points.
 */
export function dim(from: PointArg, to: PointArg, opts?: DimOpts): void {
  dimCounter++;
  collectedDimensions.push({
    id: `dim-${dimCounter}`,
    from: toVec3(from),
    to: toVec3(to),
    offset: opts?.offset ?? 10,
    label: opts?.label,
    color: opts?.color,
  });
}

/**
 * Add a dimension annotation along a Line2D.
 */
export function dimLine(l: Line2D, opts?: DimOpts): void {
  dim([l.start.x, l.start.y], [l.end.x, l.end.y], opts);
}

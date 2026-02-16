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
 *   dim([0,0,0], [100,0,0], { component: "Base" }); // bind for disassembled reports
 *   dim([0,0,0], [100,0,0], { currentComponent: true }); // bind to owning imported instance
 */

import { Point2D, Line2D } from './entities';

export interface DimensionDef {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  offset: number;
  /** True when offset was not explicitly provided by the script author. */
  autoOffset?: boolean;
  label?: string;
  color?: string;
  /**
   * Optional component binding for report exports.
   * Names should match returned object names.
   */
  components?: string[];
  /**
   * If true, bind ownership to the current returned component instance.
   * This is resolved during script flattening (after imported-part transforms).
   */
  currentComponent?: boolean;
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

/**
 * Remove and return dimensions collected since `startIndex`.
 * Useful for scoping dimensions to imported components.
 */
export function takeCollectedDimensions(startIndex: number): DimensionDef[] {
  const idx = Math.max(0, Math.min(startIndex, collectedDimensions.length));
  const taken = collectedDimensions.slice(idx);
  collectedDimensions = collectedDimensions.slice(0, idx);
  return taken;
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
  component?: string | string[];
  currentComponent?: boolean;
}

/**
 * Add a dimension annotation between two points.
 */
export function dim(from: PointArg, to: PointArg, opts?: DimOpts): void {
  dimCounter++;
  const components = (() => {
    if (typeof opts?.component === 'string') {
      const v = opts.component.trim();
      return v ? [v] : undefined;
    }
    if (Array.isArray(opts?.component)) {
      const unique = Array.from(new Set(
        opts.component.map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean),
      ));
      return unique.length > 0 ? unique : undefined;
    }
    return undefined;
  })();

  collectedDimensions.push({
    id: `dim-${dimCounter}`,
    from: toVec3(from),
    to: toVec3(to),
    offset: opts?.offset ?? 10,
    autoOffset: opts?.offset === undefined,
    label: opts?.label,
    color: opts?.color,
    components,
    currentComponent: !!opts?.currentComponent,
  });
}

/**
 * Add a dimension annotation along a Line2D.
 */
export function dimLine(l: Line2D, opts?: DimOpts): void {
  dim([l.start.x, l.start.y], [l.end.x, l.end.y], opts);
}

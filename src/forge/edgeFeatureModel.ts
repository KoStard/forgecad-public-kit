import type { Vec3 } from './transform';

export type EdgeFinishQuadrant = [number, number];

export interface EdgeFeatureResolvedSelector {
  kind: 'line-segment';
  edgeName: string;
  start: Vec3;
  end: Vec3;
  midpoint: Vec3;
}

export interface ResolvedEdgeFeatureSelection extends EdgeFeatureResolvedSelector {
  axis: Vec3;
  basisX: Vec3;
  basisY: Vec3;
  quadrant: EdgeFinishQuadrant;
  /**
   * Dihedral angle between the two adjacent faces, in degrees (0–180).
   * When present, the runtime uses angle-aware wedge geometry instead of a
   * hard-coded square cross-section.
   */
  dihedralAngleDeg?: number;
  /**
   * Unit direction along face A's surface in the (basisX, basisY) cross-section
   * plane, pointing toward the sharp feature (into material for convex, into
   * groove for concave).
   */
  surfaceDirA?: [number, number];
  /** Same as surfaceDirA but for face B. */
  surfaceDirB?: [number, number];
  /** Whether this edge is convex (external corner). */
  isConvex?: boolean;
}

export function cloneEdgeFinishQuadrant(
  quadrant: EdgeFinishQuadrant | undefined,
): EdgeFinishQuadrant | undefined {
  if (!quadrant) return undefined;
  return [quadrant[0], quadrant[1]];
}

export function cloneEdgeFeatureResolvedSelector(
  selector: EdgeFeatureResolvedSelector | undefined,
): EdgeFeatureResolvedSelector | undefined {
  if (!selector) return undefined;
  return {
    kind: selector.kind,
    edgeName: selector.edgeName,
    start: [selector.start[0], selector.start[1], selector.start[2]],
    end: [selector.end[0], selector.end[1], selector.end[2]],
    midpoint: [selector.midpoint[0], selector.midpoint[1], selector.midpoint[2]],
  };
}

export function cloneResolvedEdgeFeatureSelection(
  selection: ResolvedEdgeFeatureSelection | undefined,
): ResolvedEdgeFeatureSelection | undefined {
  if (!selection) return undefined;
  return {
    kind: selection.kind,
    edgeName: selection.edgeName,
    start: [selection.start[0], selection.start[1], selection.start[2]],
    end: [selection.end[0], selection.end[1], selection.end[2]],
    midpoint: [selection.midpoint[0], selection.midpoint[1], selection.midpoint[2]],
    axis: [selection.axis[0], selection.axis[1], selection.axis[2]],
    basisX: [selection.basisX[0], selection.basisX[1], selection.basisX[2]],
    basisY: [selection.basisY[0], selection.basisY[1], selection.basisY[2]],
    quadrant: [selection.quadrant[0], selection.quadrant[1]],
    dihedralAngleDeg: selection.dihedralAngleDeg,
    surfaceDirA: selection.surfaceDirA ? [selection.surfaceDirA[0], selection.surfaceDirA[1]] : undefined,
    surfaceDirB: selection.surfaceDirB ? [selection.surfaceDirB[0], selection.surfaceDirB[1]] : undefined,
    isConvex: selection.isConvex,
  };
}

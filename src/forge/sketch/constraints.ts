import { Sketch } from './core';
import { polygon } from './primitives';
import { union2d } from './booleans';
import { getWasm } from '../kernel';

export type PointId = string;
export type LineId = string;
export type CircleId = string;

export type ConstraintType =
  | 'coincident'
  | 'horizontal'
  | 'vertical'
  | 'parallel'
  | 'perpendicular'
  | 'tangent'
  | 'equal'
  | 'symmetric'
  | 'concentric'
  | 'collinear'
  | 'fixed'
  | 'distance'
  | 'length'
  | 'angle'
  | 'radius'
  | 'diameter'
  | 'hDistance'
  | 'vDistance';

export interface SketchPoint {
  id: PointId;
  x: number;
  y: number;
  fixed: boolean;
}

export interface SketchLine {
  id: LineId;
  a: PointId;
  b: PointId;
  construction: boolean;
}

export interface SketchCircle {
  id: CircleId;
  center: PointId;
  radius: number;
  construction: boolean;
  fixedRadius: boolean;
  segments: number;
}

export type SketchLoop =
  | { type: 'poly'; points: PointId[] }
  | { type: 'circle'; circle: CircleId };

interface BaseConstraint {
  id: string;
  type: ConstraintType;
}

export interface CoincidentConstraint extends BaseConstraint {
  type: 'coincident';
  a: PointId;
  b: PointId;
}

export interface HorizontalConstraint extends BaseConstraint {
  type: 'horizontal';
  line: LineId;
}

export interface VerticalConstraint extends BaseConstraint {
  type: 'vertical';
  line: LineId;
}

export interface ParallelConstraint extends BaseConstraint {
  type: 'parallel';
  a: LineId;
  b: LineId;
}

export interface PerpendicularConstraint extends BaseConstraint {
  type: 'perpendicular';
  a: LineId;
  b: LineId;
}

export interface TangentConstraint extends BaseConstraint {
  type: 'tangent';
  line?: LineId;
  circle?: CircleId;
  a?: CircleId;
  b?: CircleId;
}

export interface EqualConstraint extends BaseConstraint {
  type: 'equal';
  a: LineId;
  b: LineId;
}

export interface SymmetricConstraint extends BaseConstraint {
  type: 'symmetric';
  a: PointId;
  b: PointId;
  axis: LineId;
}

export interface ConcentricConstraint extends BaseConstraint {
  type: 'concentric';
  a: CircleId;
  b: CircleId;
}

export interface CollinearConstraint extends BaseConstraint {
  type: 'collinear';
  point: PointId;
  line: LineId;
}

export interface FixedConstraint extends BaseConstraint {
  type: 'fixed';
  point: PointId;
  x: number;
  y: number;
}

export interface DistanceConstraint extends BaseConstraint {
  type: 'distance';
  a: PointId;
  b: PointId;
  value: number;
}

export interface LengthConstraint extends BaseConstraint {
  type: 'length';
  line: LineId;
  value: number;
}

export interface AngleConstraint extends BaseConstraint {
  type: 'angle';
  a: LineId;
  b: LineId;
  value: number;
}

export interface RadiusConstraint extends BaseConstraint {
  type: 'radius';
  circle: CircleId;
  value: number;
}

export interface DiameterConstraint extends BaseConstraint {
  type: 'diameter';
  circle: CircleId;
  value: number;
}

export interface HorizontalDistanceConstraint extends BaseConstraint {
  type: 'hDistance';
  a: PointId;
  b: PointId;
  value: number;
}

export interface VerticalDistanceConstraint extends BaseConstraint {
  type: 'vDistance';
  a: PointId;
  b: PointId;
  value: number;
}

export type SketchConstraint =
  | CoincidentConstraint
  | HorizontalConstraint
  | VerticalConstraint
  | ParallelConstraint
  | PerpendicularConstraint
  | TangentConstraint
  | EqualConstraint
  | SymmetricConstraint
  | ConcentricConstraint
  | CollinearConstraint
  | FixedConstraint
  | DistanceConstraint
  | LengthConstraint
  | AngleConstraint
  | RadiusConstraint
  | DiameterConstraint
  | HorizontalDistanceConstraint
  | VerticalDistanceConstraint;

export interface ConstraintDisplay {
  id: string;
  type: ConstraintType;
  label: string;
  position: [number, number];
  value?: number;
  isDimension: boolean;
  isConflicting: boolean;
}

export interface SketchConstraintMeta {
  status: 'under' | 'fully' | 'over';
  maxError: number;
  constraints: ConstraintDisplay[];
  rejected: ConstraintDisplay[];
  construction: {
    lines: { a: [number, number]; b: [number, number] }[];
    circles: { center: [number, number]; radius: number }[];
  };
}

export interface ConstraintDefinition {
  points: SketchPoint[];
  lines: SketchLine[];
  circles: SketchCircle[];
  loops: SketchLoop[];
  constraints: SketchConstraint[];
  rejectedConstraints: SketchConstraint[];
}

interface SolveOptions {
  iterations?: number;
  tolerance?: number;
}

const DEFAULT_TOLERANCE = 1e-3;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

const distance = (a: SketchPoint, b: SketchPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const midpoint = (a: SketchPoint, b: SketchPoint): [number, number] => [
  (a.x + b.x) / 2,
  (a.y + b.y) / 2,
];

const lineDirection = (a: SketchPoint, b: SketchPoint): [number, number] => {
  const len = distance(a, b) || 1;
  return [(b.x - a.x) / len, (b.y - a.y) / len];
};

const angleOfLine = (a: SketchPoint, b: SketchPoint): number => Math.atan2(b.y - a.y, b.x - a.x);

const normalizeAngle = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const projectPointToLine = (pt: SketchPoint, a: SketchPoint, b: SketchPoint): [number, number] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [a.x, a.y];
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
  return [a.x + t * dx, a.y + t * dy];
};

const reflectPointAcrossLine = (pt: SketchPoint, a: SketchPoint, b: SketchPoint): [number, number] => {
  const proj = projectPointToLine(pt, a, b);
  return [2 * proj[0] - pt.x, 2 * proj[1] - pt.y];
};

const cloneDefinition = (def: ConstraintDefinition): ConstraintDefinition => ({
  points: def.points.map((p) => ({ ...p })),
  lines: def.lines.map((l) => ({ ...l })),
  circles: def.circles.map((c) => ({ ...c })),
  loops: def.loops.map((loop) => (loop.type === 'poly'
    ? { type: 'poly', points: [...loop.points] }
    : { type: 'circle', circle: loop.circle })),
  constraints: def.constraints.map((c) => ({ ...c } as SketchConstraint)),
  rejectedConstraints: def.rejectedConstraints.map((c) => ({ ...c } as SketchConstraint)),
});

const buildLabel = (type: ConstraintType): string => {
  switch (type) {
    case 'coincident':
      return 'COINC';
    case 'horizontal':
      return 'H';
    case 'vertical':
      return 'V';
    case 'parallel':
      return 'PAR';
    case 'perpendicular':
      return 'PERP';
    case 'tangent':
      return 'TAN';
    case 'equal':
      return 'EQ';
    case 'symmetric':
      return 'SYM';
    case 'concentric':
      return 'CONC';
    case 'collinear':
      return 'COLL';
    case 'fixed':
      return 'FIX';
    case 'distance':
      return 'DIST';
    case 'length':
      return 'LEN';
    case 'angle':
      return 'ANG';
    case 'radius':
      return 'R';
    case 'diameter':
      return 'DIA';
    case 'hDistance':
      return 'HD';
    case 'vDistance':
      return 'VD';
    default:
      return 'C';
  }
};

const isDimensionConstraint = (type: ConstraintType): boolean => (
  type === 'distance'
  || type === 'length'
  || type === 'angle'
  || type === 'radius'
  || type === 'diameter'
  || type === 'hDistance'
  || type === 'vDistance'
);

const getConstraintValue = (constraint: SketchConstraint): number | undefined => {
  if (constraint.type === 'distance') return constraint.value;
  if (constraint.type === 'length') return constraint.value;
  if (constraint.type === 'angle') return constraint.value;
  if (constraint.type === 'radius') return constraint.value;
  if (constraint.type === 'diameter') return constraint.value;
  if (constraint.type === 'hDistance') return constraint.value;
  if (constraint.type === 'vDistance') return constraint.value;
  return undefined;
};

const setConstraintValue = (constraint: SketchConstraint, value: number): void => {
  if (constraint.type === 'distance') constraint.value = value;
  if (constraint.type === 'length') constraint.value = value;
  if (constraint.type === 'angle') constraint.value = value;
  if (constraint.type === 'radius') constraint.value = value;
  if (constraint.type === 'diameter') constraint.value = value;
  if (constraint.type === 'hDistance') constraint.value = value;
  if (constraint.type === 'vDistance') constraint.value = value;
};

const buildConstraintDisplays = (
  def: ConstraintDefinition,
  conflictingIds: Set<string>,
): ConstraintDisplay[] => {
  const points = new Map(def.points.map((p) => [p.id, p] as const));
  const lines = new Map(def.lines.map((l) => [l.id, l] as const));
  const circles = new Map(def.circles.map((c) => [c.id, c] as const));

  const displays: ConstraintDisplay[] = [];
  def.constraints.forEach((constraint) => {
    let position: [number, number] = [0, 0];

    if (constraint.type === 'coincident' || constraint.type === 'distance' || constraint.type === 'hDistance' || constraint.type === 'vDistance') {
      const a = points.get(constraint.a);
      const b = points.get(constraint.b);
      if (a && b) position = midpoint(a, b);
    } else if (constraint.type === 'horizontal' || constraint.type === 'vertical' || constraint.type === 'length') {
      const line = lines.get(constraint.line);
      if (line) {
        const a = points.get(line.a);
        const b = points.get(line.b);
        if (a && b) position = midpoint(a, b);
      }
    } else if (constraint.type === 'parallel' || constraint.type === 'perpendicular' || constraint.type === 'equal' || constraint.type === 'angle') {
      const lineA = lines.get(constraint.a);
      const lineB = lines.get(constraint.b);
      if (lineA && lineB) {
        const a1 = points.get(lineA.a);
        const a2 = points.get(lineA.b);
        const b1 = points.get(lineB.a);
        const b2 = points.get(lineB.b);
        if (a1 && a2 && b1 && b2) {
          const midA = midpoint(a1, a2);
          const midB = midpoint(b1, b2);
          position = [(midA[0] + midB[0]) / 2, (midA[1] + midB[1]) / 2];
        }
      }
    } else if (constraint.type === 'radius' || constraint.type === 'diameter') {
      const circle = circles.get(constraint.circle);
      if (circle) {
        const c = points.get(circle.center);
        if (c) position = [c.x + circle.radius, c.y];
      }
    } else if (constraint.type === 'concentric') {
      const a = circles.get(constraint.a);
      const b = circles.get(constraint.b);
      if (a && b) {
        const c1 = points.get(a.center);
        const c2 = points.get(b.center);
        if (c1 && c2) position = midpoint(c1, c2);
      }
    } else if (constraint.type === 'collinear') {
      const pt = points.get(constraint.point);
      if (pt) position = [pt.x, pt.y];
    } else if (constraint.type === 'fixed') {
      const pt = points.get(constraint.point);
      if (pt) position = [pt.x, pt.y];
    } else if (constraint.type === 'symmetric') {
      const a = points.get(constraint.a);
      const b = points.get(constraint.b);
      if (a && b) position = midpoint(a, b);
    } else if (constraint.type === 'tangent') {
      if (constraint.line && constraint.circle) {
        const line = lines.get(constraint.line);
        const circle = circles.get(constraint.circle);
        if (line && circle) {
          const a = points.get(line.a);
          const b = points.get(line.b);
          if (a && b) position = midpoint(a, b);
        }
      } else if (constraint.a && constraint.b) {
        const c1 = circles.get(constraint.a);
        const c2 = circles.get(constraint.b);
        if (c1 && c2) {
          const p1 = points.get(c1.center);
          const p2 = points.get(c2.center);
          if (p1 && p2) position = midpoint(p1, p2);
        }
      }
    }

    displays.push({
      id: constraint.id,
      type: constraint.type,
      label: buildLabel(constraint.type),
      position,
      value: getConstraintValue(constraint),
      isDimension: isDimensionConstraint(constraint.type),
      isConflicting: conflictingIds.has(constraint.id),
    });
  });

  return displays;
};

const buildSketchFromDefinition = (def: ConstraintDefinition): Sketch => {
  const loops: Sketch[] = [];
  def.loops.forEach((loop) => {
    if (loop.type === 'poly') {
      const pts: [number, number][] = loop.points.map((id) => {
        const pt = def.points.find((p) => p.id === id);
        if (!pt) throw new Error(`Missing point ${id}`);
        return [pt.x, pt.y];
      });
      if (pts.length >= 3) loops.push(polygon(pts));
    } else if (loop.type === 'circle') {
      const circleDef = def.circles.find((c) => c.id === loop.circle);
      if (!circleDef) throw new Error(`Missing circle ${loop.circle}`);
      const center = def.points.find((p) => p.id === circleDef.center);
      if (!center) throw new Error(`Missing center ${circleDef.center}`);
      const circle = new Sketch(getWasm().CrossSection.circle(circleDef.radius, circleDef.segments));
      loops.push(circle.translate(center.x, center.y));
    }
  });

  if (loops.length === 0) {
    throw new Error('Constrained sketch needs at least one closed loop');
  }

  return union2d(...loops);
};

const buildConstructionGeometry = (def: ConstraintDefinition): SketchConstraintMeta['construction'] => {
  const pointMap = new Map(def.points.map((p) => [p.id, p] as const));
  const lines = def.lines
    .filter((line) => line.construction)
    .map((line) => {
      const a = pointMap.get(line.a);
      const b = pointMap.get(line.b);
      if (!a || !b) return null;
      return { a: [a.x, a.y] as [number, number], b: [b.x, b.y] as [number, number] };
    })
    .filter((line): line is { a: [number, number]; b: [number, number] } => line !== null);

  const circles = def.circles
    .filter((circle) => circle.construction)
    .map((circle) => {
      const center = pointMap.get(circle.center);
      if (!center) return null;
      return { center: [center.x, center.y] as [number, number], radius: circle.radius };
    })
    .filter((circle): circle is { center: [number, number]; radius: number } => circle !== null);

  return { lines, circles };
};

const applyFixedConstraint = (pt: SketchPoint, constraint: FixedConstraint): void => {
  pt.fixed = true;
  pt.x = constraint.x;
  pt.y = constraint.y;
};

const solveConstraints = (
  def: ConstraintDefinition,
  options: SolveOptions,
): { maxError: number } => {
  const iterations = options.iterations ?? 40;
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const points = new Map(def.points.map((p) => [p.id, p] as const));
  const lines = new Map(def.lines.map((l) => [l.id, l] as const));
  const circles = new Map(def.circles.map((c) => [c.id, c] as const));

  def.constraints.forEach((constraint) => {
    if (constraint.type === 'fixed') {
      const pt = points.get(constraint.point);
      if (pt) applyFixedConstraint(pt, constraint);
    }
  });

  const movePoint = (pt: SketchPoint, dx: number, dy: number): boolean => {
    if (pt.fixed) return false;
    pt.x += dx;
    pt.y += dy;
    return true;
  };

  let maxError = 0;

  for (let i = 0; i < iterations; i += 1) {
    maxError = 0;
    def.constraints.forEach((constraint) => {
      let err = 0;

      if (constraint.type === 'coincident') {
        const a = points.get(constraint.a);
        const b = points.get(constraint.b);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        err = Math.sqrt(dx * dx + dy * dy);
        if (err <= tolerance) return;
        if (a.fixed && b.fixed) return;
        if (a.fixed) {
          b.x = a.x;
          b.y = a.y;
          return;
        }
        if (b.fixed) {
          a.x = b.x;
          a.y = b.y;
          return;
        }
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        a.x = mx;
        a.y = my;
        b.x = mx;
        b.y = my;
      }

      if (constraint.type === 'horizontal') {
        const line = lines.get(constraint.line);
        if (!line) return;
        const a = points.get(line.a);
        const b = points.get(line.b);
        if (!a || !b) return;
        err = Math.abs(b.y - a.y);
        if (err <= tolerance) return;
        if (a.fixed && b.fixed) return;
        const y = (a.y + b.y) / 2;
        if (!a.fixed) a.y = y;
        if (!b.fixed) b.y = y;
      }

      if (constraint.type === 'vertical') {
        const line = lines.get(constraint.line);
        if (!line) return;
        const a = points.get(line.a);
        const b = points.get(line.b);
        if (!a || !b) return;
        err = Math.abs(b.x - a.x);
        if (err <= tolerance) return;
        if (a.fixed && b.fixed) return;
        const x = (a.x + b.x) / 2;
        if (!a.fixed) a.x = x;
        if (!b.fixed) b.x = x;
      }

      if (constraint.type === 'parallel' || constraint.type === 'perpendicular' || constraint.type === 'angle') {
        const lineA = lines.get(constraint.a);
        const lineB = lines.get(constraint.b);
        if (!lineA || !lineB) return;
        const a1 = points.get(lineA.a);
        const a2 = points.get(lineA.b);
        const b1 = points.get(lineB.a);
        const b2 = points.get(lineB.b);
        if (!a1 || !a2 || !b1 || !b2) return;
        const baseAngle = angleOfLine(a1, a2);
        const target = constraint.type === 'parallel'
          ? baseAngle
          : constraint.type === 'perpendicular'
            ? baseAngle + Math.PI / 2
            : baseAngle + toRad(constraint.value);
        const current = angleOfLine(b1, b2);
        const delta = normalizeAngle(current - target);
        err = Math.abs(delta);
        if (err <= tolerance) return;
        if (b1.fixed && b2.fixed) return;
        const len = distance(b1, b2) || 1;
        const dir: [number, number] = [Math.cos(target), Math.sin(target)];
        if (b1.fixed) {
          b2.x = b1.x + dir[0] * len;
          b2.y = b1.y + dir[1] * len;
        } else if (b2.fixed) {
          b1.x = b2.x - dir[0] * len;
          b1.y = b2.y - dir[1] * len;
        } else {
          const mid = midpoint(b1, b2);
          b1.x = mid[0] - dir[0] * len / 2;
          b1.y = mid[1] - dir[1] * len / 2;
          b2.x = mid[0] + dir[0] * len / 2;
          b2.y = mid[1] + dir[1] * len / 2;
        }
      }

      if (constraint.type === 'equal') {
        const lineA = lines.get(constraint.a);
        const lineB = lines.get(constraint.b);
        if (!lineA || !lineB) return;
        const a1 = points.get(lineA.a);
        const a2 = points.get(lineA.b);
        const b1 = points.get(lineB.a);
        const b2 = points.get(lineB.b);
        if (!a1 || !a2 || !b1 || !b2) return;
        const lenA = distance(a1, a2);
        const lenB = distance(b1, b2) || 1;
        err = Math.abs(lenB - lenA);
        if (err <= tolerance) return;
        if (b1.fixed && b2.fixed) return;
        const dir = lineDirection(b1, b2);
        if (b1.fixed) {
          b2.x = b1.x + dir[0] * lenA;
          b2.y = b1.y + dir[1] * lenA;
        } else if (b2.fixed) {
          b1.x = b2.x - dir[0] * lenA;
          b1.y = b2.y - dir[1] * lenA;
        } else {
          const mid = midpoint(b1, b2);
          b1.x = mid[0] - dir[0] * lenA / 2;
          b1.y = mid[1] - dir[1] * lenA / 2;
          b2.x = mid[0] + dir[0] * lenA / 2;
          b2.y = mid[1] + dir[1] * lenA / 2;
        }
      }

      if (constraint.type === 'distance') {
        const a = points.get(constraint.a);
        const b = points.get(constraint.b);
        if (!a || !b) return;
        const len = distance(a, b) || 1;
        err = Math.abs(len - constraint.value);
        if (err <= tolerance) return;
        const dir: [number, number] = [(b.x - a.x) / len, (b.y - a.y) / len];
        if (a.fixed && b.fixed) return;
        if (a.fixed) {
          b.x = a.x + dir[0] * constraint.value;
          b.y = a.y + dir[1] * constraint.value;
        } else if (b.fixed) {
          a.x = b.x - dir[0] * constraint.value;
          a.y = b.y - dir[1] * constraint.value;
        } else {
          const mid = midpoint(a, b);
          a.x = mid[0] - dir[0] * constraint.value / 2;
          a.y = mid[1] - dir[1] * constraint.value / 2;
          b.x = mid[0] + dir[0] * constraint.value / 2;
          b.y = mid[1] + dir[1] * constraint.value / 2;
        }
      }

      if (constraint.type === 'length') {
        const line = lines.get(constraint.line);
        if (!line) return;
        const a = points.get(line.a);
        const b = points.get(line.b);
        if (!a || !b) return;
        const len = distance(a, b) || 1;
        err = Math.abs(len - constraint.value);
        if (err <= tolerance) return;
        const dir = lineDirection(a, b);
        if (a.fixed && b.fixed) return;
        if (a.fixed) {
          b.x = a.x + dir[0] * constraint.value;
          b.y = a.y + dir[1] * constraint.value;
        } else if (b.fixed) {
          a.x = b.x - dir[0] * constraint.value;
          a.y = b.y - dir[1] * constraint.value;
        } else {
          const mid = midpoint(a, b);
          a.x = mid[0] - dir[0] * constraint.value / 2;
          a.y = mid[1] - dir[1] * constraint.value / 2;
          b.x = mid[0] + dir[0] * constraint.value / 2;
          b.y = mid[1] + dir[1] * constraint.value / 2;
        }
      }

      if (constraint.type === 'radius' || constraint.type === 'diameter') {
        const circle = circles.get(constraint.circle);
        if (!circle) return;
        const target = constraint.type === 'radius' ? constraint.value : constraint.value / 2;
        err = Math.abs(circle.radius - target);
        if (err <= tolerance) return;
        if (!circle.fixedRadius) circle.radius = target;
      }

      if (constraint.type === 'hDistance') {
        const a = points.get(constraint.a);
        const b = points.get(constraint.b);
        if (!a || !b) return;
        err = Math.abs((b.x - a.x) - constraint.value);
        if (err <= tolerance) return;
        if (a.fixed && b.fixed) return;
        if (a.fixed) {
          b.x = a.x + constraint.value;
        } else if (b.fixed) {
          a.x = b.x - constraint.value;
        } else {
          const midX = (a.x + b.x) / 2;
          a.x = midX - constraint.value / 2;
          b.x = midX + constraint.value / 2;
        }
      }

      if (constraint.type === 'vDistance') {
        const a = points.get(constraint.a);
        const b = points.get(constraint.b);
        if (!a || !b) return;
        err = Math.abs((b.y - a.y) - constraint.value);
        if (err <= tolerance) return;
        if (a.fixed && b.fixed) return;
        if (a.fixed) {
          b.y = a.y + constraint.value;
        } else if (b.fixed) {
          a.y = b.y - constraint.value;
        } else {
          const midY = (a.y + b.y) / 2;
          a.y = midY - constraint.value / 2;
          b.y = midY + constraint.value / 2;
        }
      }

      if (constraint.type === 'concentric') {
        const c1 = circles.get(constraint.a);
        const c2 = circles.get(constraint.b);
        if (!c1 || !c2) return;
        const p1 = points.get(c1.center);
        const p2 = points.get(c2.center);
        if (!p1 || !p2) return;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        err = Math.sqrt(dx * dx + dy * dy);
        if (err <= tolerance) return;
        if (p1.fixed && p2.fixed) return;
        if (p1.fixed) {
          p2.x = p1.x;
          p2.y = p1.y;
        } else if (p2.fixed) {
          p1.x = p2.x;
          p1.y = p2.y;
        } else {
          const mid = midpoint(p1, p2);
          p1.x = mid[0];
          p1.y = mid[1];
          p2.x = mid[0];
          p2.y = mid[1];
        }
      }

      if (constraint.type === 'collinear') {
        const pt = points.get(constraint.point);
        const line = lines.get(constraint.line);
        if (!pt || !line) return;
        const a = points.get(line.a);
        const b = points.get(line.b);
        if (!a || !b) return;
        const proj = projectPointToLine(pt, a, b);
        err = Math.sqrt((pt.x - proj[0]) ** 2 + (pt.y - proj[1]) ** 2);
        if (err <= tolerance) return;
        if (!pt.fixed) {
          pt.x = proj[0];
          pt.y = proj[1];
        } else {
          const dx = proj[0] - pt.x;
          const dy = proj[1] - pt.y;
          if (!a.fixed) movePoint(a, -dx, -dy);
          if (!b.fixed) movePoint(b, -dx, -dy);
        }
      }

      if (constraint.type === 'symmetric') {
        const a = points.get(constraint.a);
        const b = points.get(constraint.b);
        const axis = lines.get(constraint.axis);
        if (!a || !b || !axis) return;
        const ax1 = points.get(axis.a);
        const ax2 = points.get(axis.b);
        if (!ax1 || !ax2) return;
        const ra = reflectPointAcrossLine(a, ax1, ax2);
        const rb = reflectPointAcrossLine(b, ax1, ax2);
        err = Math.sqrt((b.x - ra[0]) ** 2 + (b.y - ra[1]) ** 2);
        if (err <= tolerance) return;
        if (a.fixed && b.fixed) return;
        if (a.fixed) {
          b.x = ra[0];
          b.y = ra[1];
        } else if (b.fixed) {
          a.x = rb[0];
          a.y = rb[1];
        } else {
          b.x = ra[0];
          b.y = ra[1];
        }
      }

      if (constraint.type === 'tangent') {
        if (constraint.line && constraint.circle) {
          const line = lines.get(constraint.line);
          const circle = circles.get(constraint.circle);
          if (!line || !circle) return;
          const a = points.get(line.a);
          const b = points.get(line.b);
          const c = points.get(circle.center);
          if (!a || !b || !c) return;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const dist = (c.x - a.x) * nx + (c.y - a.y) * ny;
          err = Math.abs(Math.abs(dist) - circle.radius);
          if (err <= tolerance) return;
          const shift = dist > 0 ? dist - circle.radius : dist + circle.radius;
          if (!a.fixed || !b.fixed) {
            if (!a.fixed) { a.x += nx * (-shift); a.y += ny * (-shift); }
            if (!b.fixed) { b.x += nx * (-shift); b.y += ny * (-shift); }
          } else if (!c.fixed) {
            c.x += nx * (-shift);
            c.y += ny * (-shift);
          }
        } else if (constraint.a && constraint.b) {
          const c1 = circles.get(constraint.a);
          const c2 = circles.get(constraint.b);
          if (!c1 || !c2) return;
          const p1 = points.get(c1.center);
          const p2 = points.get(c2.center);
          if (!p1 || !p2) return;
          const target = c1.radius + c2.radius;
          const len = distance(p1, p2) || 1;
          err = Math.abs(len - target);
          if (err <= tolerance) return;
          const dir: [number, number] = [(p2.x - p1.x) / len, (p2.y - p1.y) / len];
          if (p1.fixed && p2.fixed) return;
          if (p1.fixed) {
            p2.x = p1.x + dir[0] * target;
            p2.y = p1.y + dir[1] * target;
          } else if (p2.fixed) {
            p1.x = p2.x - dir[0] * target;
            p1.y = p2.y - dir[1] * target;
          } else {
            const mid = midpoint(p1, p2);
            p1.x = mid[0] - dir[0] * target / 2;
            p1.y = mid[1] - dir[1] * target / 2;
            p2.x = mid[0] + dir[0] * target / 2;
            p2.y = mid[1] + dir[1] * target / 2;
          }
        }
      }

      maxError = Math.max(maxError, err);
    });

    if (maxError <= tolerance) break;
  }

  return { maxError };
};

const computeStatus = (def: ConstraintDefinition, maxError: number, tolerance: number): 'under' | 'fully' | 'over' => {
  if (maxError > tolerance * 5) return 'over';
  const refCount = new Map<PointId, number>();
  def.points.forEach((p) => refCount.set(p.id, 0));
  def.constraints.forEach((constraint) => {
    if (constraint.type === 'fixed') {
      const count = refCount.get(constraint.point) ?? 0;
      refCount.set(constraint.point, count + 2);
      return;
    }
    if (constraint.type === 'coincident' || constraint.type === 'distance' || constraint.type === 'hDistance' || constraint.type === 'vDistance') {
      refCount.set(constraint.a, (refCount.get(constraint.a) ?? 0) + 1);
      refCount.set(constraint.b, (refCount.get(constraint.b) ?? 0) + 1);
      return;
    }
    if (constraint.type === 'collinear') {
      refCount.set(constraint.point, (refCount.get(constraint.point) ?? 0) + 1);
      return;
    }
    if (constraint.type === 'symmetric') {
      refCount.set(constraint.a, (refCount.get(constraint.a) ?? 0) + 1);
      refCount.set(constraint.b, (refCount.get(constraint.b) ?? 0) + 1);
      return;
    }
    if (constraint.type === 'horizontal' || constraint.type === 'vertical' || constraint.type === 'length') {
      const line = def.lines.find((l) => l.id === constraint.line);
      if (line) {
        refCount.set(line.a, (refCount.get(line.a) ?? 0) + 1);
        refCount.set(line.b, (refCount.get(line.b) ?? 0) + 1);
      }
      return;
    }
    if (constraint.type === 'parallel' || constraint.type === 'perpendicular' || constraint.type === 'equal' || constraint.type === 'angle') {
      const lineA = def.lines.find((l) => l.id === constraint.a);
      const lineB = def.lines.find((l) => l.id === constraint.b);
      if (lineA) {
        refCount.set(lineA.a, (refCount.get(lineA.a) ?? 0) + 1);
        refCount.set(lineA.b, (refCount.get(lineA.b) ?? 0) + 1);
      }
      if (lineB) {
        refCount.set(lineB.a, (refCount.get(lineB.a) ?? 0) + 1);
        refCount.set(lineB.b, (refCount.get(lineB.b) ?? 0) + 1);
      }
      return;
    }
  });

  const under = def.points.some((p) => !p.fixed && (refCount.get(p.id) ?? 0) < 2);
  return under ? 'under' : 'fully';
};

export class ConstraintSketch extends Sketch {
  constructor(
    cross: Sketch['cross'],
    public readonly constraintMeta: SketchConstraintMeta,
    public readonly definition: ConstraintDefinition,
  ) {
    super(cross);
  }

  withUpdatedConstraint(constraintId: string, value: number): ConstraintSketch {
    const next = cloneDefinition(this.definition);
    const target = next.constraints.find((c) => c.id === constraintId);
    if (!target) return this;
    setConstraintValue(target, value);
    return solveConstraintDefinition(next);
  }
}

export const isConstraintSketch = (sketch: Sketch | null | undefined): sketch is ConstraintSketch => {
  return sketch instanceof ConstraintSketch;
};

export class ConstrainedSketchBuilder {
  private points: SketchPoint[] = [];
  private lines: SketchLine[] = [];
  private circles: SketchCircle[] = [];
  private constraints: SketchConstraint[] = [];
  private loops: SketchLoop[] = [];
  private rejectedConstraints: SketchConstraint[] = [];
  private cursor: PointId | null = null;
  private loopStart: PointId | null = null;
  private nextId = 1;

  point(x: number, y: number, fixed = false): PointId {
    const id = `pt-${this.nextId++}`;
    this.points.push({ id, x, y, fixed });
    return id;
  }

  pointAt(index: number): PointId {
    const pt = this.points[index];
    if (!pt) throw new Error(`Point index ${index} out of range`);
    return pt.id;
  }

  line(a: PointId, b: PointId, construction = false): LineId {
    const id = `ln-${this.nextId++}`;
    this.lines.push({ id, a, b, construction });
    return id;
  }

  lineAt(index: number): LineId {
    const line = this.lines[index];
    if (!line) throw new Error(`Line index ${index} out of range`);
    return line.id;
  }

  circle(center: PointId, radius: number, construction = false, segments = 48): CircleId {
    const id = `c-${this.nextId++}`;
    this.circles.push({ id, center, radius, construction, fixedRadius: false, segments });
    if (!construction) {
      this.loops.push({ type: 'circle', circle: id });
    }
    return id;
  }

  circleAt(index: number): CircleId {
    const circle = this.circles[index];
    if (!circle) throw new Error(`Circle index ${index} out of range`);
    return circle.id;
  }

  moveTo(x: number, y: number): this {
    const id = this.point(x, y);
    this.cursor = id;
    this.loopStart = id;
    this.loops.push({ type: 'poly', points: [id] });
    return this;
  }

  lineTo(x: number, y: number): this {
    if (!this.cursor) return this.moveTo(x, y);
    const id = this.point(x, y);
    this.line(this.cursor, id);
    const loop = this.loops[this.loops.length - 1];
    if (loop && loop.type === 'poly') loop.points.push(id);
    this.cursor = id;
    return this;
  }

  lineH(dx: number): this {
    const cursorPt = this.getPoint(this.cursor);
    if (!cursorPt) return this;
    return this.lineTo(cursorPt.x + dx, cursorPt.y);
  }

  lineV(dy: number): this {
    const cursorPt = this.getPoint(this.cursor);
    if (!cursorPt) return this;
    return this.lineTo(cursorPt.x, cursorPt.y + dy);
  }

  lineAngled(length: number, degrees: number): this {
    const cursorPt = this.getPoint(this.cursor);
    if (!cursorPt) return this;
    const rad = toRad(degrees);
    return this.lineTo(cursorPt.x + Math.cos(rad) * length, cursorPt.y + Math.sin(rad) * length);
  }

  close(): this {
    if (!this.cursor || !this.loopStart || this.cursor === this.loopStart) return this;
    this.line(this.cursor, this.loopStart);
    this.cursor = this.loopStart;
    return this;
  }

  addLoopCircle(center: PointId, radius: number, segments = 48): this {
    this.circle(center, radius, false, segments);
    return this;
  }

  constrain(constraint: Omit<SketchConstraint, 'id'>): this {
    const id = `cst-${this.nextId++}`;
    const next = { ...constraint, id } as SketchConstraint;
    const def = this.buildDefinition(next);
    const { maxError } = solveConstraints(def, { iterations: 30, tolerance: DEFAULT_TOLERANCE });
    if (maxError > DEFAULT_TOLERANCE * 5) {
      this.rejectedConstraints.push(next);
      return this;
    }
    if (next.type === 'fixed') {
      const pt = this.points.find((p) => p.id === next.point);
      if (pt) {
        pt.fixed = true;
        pt.x = next.x;
        pt.y = next.y;
      }
    }
    this.constraints.push(next);
    return this;
  }

  solve(options: SolveOptions = {}): ConstraintSketch {
    return solveConstraintDefinition(this.buildDefinition(), options);
  }

  private buildDefinition(extraConstraint?: SketchConstraint): ConstraintDefinition {
    return {
      points: this.points.map((p) => ({ ...p })),
      lines: this.lines.map((l) => ({ ...l })),
      circles: this.circles.map((c) => ({ ...c })),
      loops: this.loops.map((loop) => loop.type === 'poly'
        ? { type: 'poly', points: [...loop.points] }
        : { type: 'circle', circle: loop.circle }),
      constraints: extraConstraint ? [...this.constraints, extraConstraint] : [...this.constraints],
      rejectedConstraints: [...this.rejectedConstraints],
    };
  }

  private getPoint(id: PointId | null): SketchPoint | null {
    if (!id) return null;
    return this.points.find((p) => p.id === id) ?? null;
  }

  /** Import a Point2D, returning its PointId */
  importPoint(pt: { x: number; y: number }, fixed = false): PointId {
    return this.point(pt.x, pt.y, fixed);
  }

  /** Import a Line2D (two points + line), returning its LineId */
  importLine(l: { start: { x: number; y: number }; end: { x: number; y: number } }, fixed = false): LineId {
    const a = this.importPoint(l.start, fixed);
    const b = this.importPoint(l.end, fixed);
    return this.line(a, b);
  }

  /** Import a Rectangle2D as 4 points + 4 lines, returning side LineIds keyed by name */
  importRectangle(r: {
    vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  }, fixed = false): { bottom: LineId; right: LineId; top: LineId; left: LineId; points: [PointId, PointId, PointId, PointId] } {
    const [bl, br, tr, tl] = r.vertices.map(v => this.importPoint(v, fixed)) as [PointId, PointId, PointId, PointId];
    return {
      bottom: this.line(bl, br),
      right: this.line(br, tr),
      top: this.line(tr, tl),
      left: this.line(tl, bl),
      points: [bl, br, tr, tl],
    };
  }
}

export function constrainedSketch(): ConstrainedSketchBuilder {
  return new ConstrainedSketchBuilder();
}

export const solveConstraintDefinition = (
  def: ConstraintDefinition,
  options: SolveOptions = {},
): ConstraintSketch => {
  const working = cloneDefinition(def);
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const { maxError } = solveConstraints(working, options);
  const status = computeStatus(working, maxError, tolerance);
  const conflicts = new Set<string>(status === 'over' ? working.constraints.map((c) => c.id) : []);
  const constraints = buildConstraintDisplays(working, conflicts);
  const rejected = buildConstraintDisplays(
    { ...working, constraints: working.rejectedConstraints, rejectedConstraints: [] },
    new Set(working.rejectedConstraints.map((c) => c.id)),
  );
  const sketch = buildSketchFromDefinition(working);
  const construction = buildConstructionGeometry(working);
  return new ConstraintSketch(sketch.cross, { status, maxError, constraints, rejected, construction }, working);
};

export const updateConstraintValue = (
  sketch: ConstraintSketch,
  constraintId: string,
  value: number,
): ConstraintSketch => {
  const next = cloneDefinition(sketch.definition);
  const target = next.constraints.find((c) => c.id === constraintId);
  if (!target) return sketch;
  setConstraintValue(target, value);
  return solveConstraintDefinition(next);
};

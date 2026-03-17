import type { ArcId, ConstraintTypeMap } from '../types';
import { registerConstraint } from '../registry';

declare module '../types' {
  interface ConstraintTypeMap {
    arcLength: { arc: ArcId; value: number };
  }
}

/** Sweep angle (in radians) from start to end, signed by clockwise flag. */
const arcSweep = (
  startAngle: number, endAngle: number, clockwise: boolean,
): number => {
  const sweep = clockwise
    ? (startAngle - endAngle + 2 * Math.PI) % (2 * Math.PI)
    : (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
  return sweep < 1e-9 ? 2 * Math.PI : sweep;
};

registerConstraint<'arcLength', ConstraintTypeMap['arcLength']>({
  type: 'arcLength',
  label: 'ARCL',
  isDimension: true,
  equations: 1,

  displayPosition(c, { arcs, points }) {
    const arc = arcs.get(c.arc);
    if (!arc) return [0, 0];
    const center = points.get(arc.center);
    const start = points.get(arc.start);
    if (!center || !start) return [0, 0];
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const midAngle = startAngle + (arc.clockwise ? -1 : 1) * Math.PI / 4;
    return [
      center.x + (arc.radius + 8) * Math.cos(midAngle),
      center.y + (arc.radius + 8) * Math.sin(midAngle),
    ];
  },

  solve(c, { arcs, points, tolerance }) {
    const arc = arcs.get(c.arc);
    if (!arc) return 0;
    const center = points.get(arc.center);
    const start = points.get(arc.start);
    const end = points.get(arc.end);
    if (!center || !start || !end) return 0;

    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    const sweep = arcSweep(startAngle, endAngle, arc.clockwise);
    const current = arc.radius * sweep;
    const err = Math.abs(current - c.value);
    if (err <= tolerance) return err;

    // Move the end point to achieve the target arc length given current radius.
    if (!end.fixed && arc.radius > 1e-9) {
      const targetSweep = c.value / arc.radius;
      const dir = arc.clockwise ? -1 : 1;
      const newEndAngle = startAngle + dir * targetSweep;
      end.x = center.x + arc.radius * Math.cos(newEndAngle);
      end.y = center.y + arc.radius * Math.sin(newEndAngle);
    }
    return err;
  },


  residual(c, { arcs, points }) {
    const arc = arcs.get(c.arc);
    if (!arc) return [0];
    const center = points.get(arc.center);
    const start = points.get(arc.start);
    const end = points.get(arc.end);
    if (!center || !start || !end) return [0];
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    let sweep = arc.clockwise
      ? (startAngle - endAngle + 2 * Math.PI) % (2 * Math.PI)
      : (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
    if (sweep < 1e-9) sweep = 2 * Math.PI;
    return [arc.radius * sweep - c.value];
  },

  computeDof(_c, _ctx) {
    // Constrains arc end-point angle — DOF accounted for by equations count.
  },
});

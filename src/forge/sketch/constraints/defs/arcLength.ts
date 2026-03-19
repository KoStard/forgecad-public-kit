import type { ArcId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { arcSweep } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the arc length of an arc to `value`.
     *
     * Arc length is defined as `radius × sweep`, where `sweep` is the angle
     * (in radians) from the start point to the end point in the arc's direction.
     * A zero-length sweep is treated as a full circle (2π).
     *
     * The solver achieves the target by relocating the arc's end point along
     * the circle; the radius and start point are left unchanged.
     * Contributes **1 equation**: `radius × sweep − value = 0`.
     */
    arcLength: { arc: ArcId; value: number };
  }
}

registerConstraint<'arcLength', ConstraintTypeMap['arcLength']>({
  type: 'arcLength',
  label: '⌒',
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

  displayAnnotations(c, { arcs, points }): AnnotationElement[] {
    const arc = arcs.get(c.arc);
    if (!arc) return [];
    const center = points.get(arc.center);
    const start = points.get(arc.start);
    if (!center || !start) return [];
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const midAngle = startAngle + (arc.clockwise ? -1 : 1) * Math.PI / 4;
    const pos: [number, number] = [
      center.x + (arc.radius + 8) * Math.cos(midAngle),
      center.y + (arc.radius + 8) * Math.sin(midAngle),
    ];
    return [{ kind: 'text', position: pos, text: `⌒${c.value}` }];
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
    return [arc.radius * arcSweep(startAngle, endAngle, arc.clockwise) - c.value];
  },

  jacobian(c, { arcs, points }) {
    const arc = arcs.get(c.arc);
    if (!arc) return { residuals: [0], partials: {} };
    const center = points.get(arc.center);
    const start = points.get(arc.start);
    const end = points.get(arc.end);
    if (!center || !start || !end) return { residuals: [0], partials: {} };
    const sx = start.x - center.x, sy = start.y - center.y;
    const ex = end.x - center.x, ey = end.y - center.y;
    const rs2 = sx * sx + sy * sy || 1e-24;
    const re2 = ex * ex + ey * ey || 1e-24;
    const startAngle = Math.atan2(sy, sx);
    const endAngle = Math.atan2(ey, ex);
    const sweep = arcSweep(startAngle, endAngle, arc.clockwise);
    const r = arc.radius * sweep - c.value;
    const dir = arc.clockwise ? -1 : 1;
    const R = arc.radius;
    return {
      residuals: [r],
      partials: {
        [`${arc.end}.x`]: [R * dir * (-ey / re2)],
        [`${arc.end}.y`]: [R * dir * (ex / re2)],
        [`${arc.start}.x`]: [R * dir * (sy / rs2)],
        [`${arc.start}.y`]: [R * dir * (-sx / rs2)],
        [`${arc.center}.x`]: [R * dir * ((ey / re2) - (sy / rs2))],
        [`${arc.center}.y`]: [R * dir * ((-ex / re2) + (sx / rs2))],
        [`${c.arc}.r`]: [sweep],
      },
    };
  },

  computeDof(_c, _ctx) {
    // Constrains arc end-point angle — DOF accounted for by equations count.
  },
});

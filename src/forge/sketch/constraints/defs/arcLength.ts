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

  computeDof(_c, _ctx) {
    // Constrains arc end-point angle — DOF accounted for by equations count.
  },
});

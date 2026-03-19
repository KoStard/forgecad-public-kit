import type { LineId, ConstraintTypeMap, AnnotationElement } from '../types';
import { registerConstraint } from '../registry';
import { angleOfLine, distance, midpointPerp, normalizeAngle } from '../helpers';

declare module '../types' {
  interface ConstraintTypeMap {
    /**
     * Sets the angle of a line from the positive X axis to exactly `value` degrees.
     * The direction is enforced as-is (a→b). Contributes **1 equation**:
     * `normalizeAngle(angle − target) = 0`.
     */
    absoluteAngle: { line: LineId; value: number };
  }
}

/** Count how many lines reference a given point ID. */
const pointLineRefs = (
  ptId: string,
  lines: ReadonlyMap<string, { a: string; b: string }>,
): number => {
  let n = 0;
  for (const l of lines.values()) {
    if (l.a === ptId || l.b === ptId) n++;
  }
  return n;
};

registerConstraint<'absoluteAngle', ConstraintTypeMap['absoluteAngle']>({
  type: 'absoluteAngle',
  label: '∠',
  isDimension: true,
  equations: 1,

  displayPosition(c, { lines, points }) {
    const line = lines.get(c.line);
    if (!line) return [0, 0];
    const a = points.get(line.a);
    const b = points.get(line.b);
    if (!a || !b) return [0, 0];
    return midpointPerp(a, b, 3);
  },

  displayAnnotations(c, { lines, points }): AnnotationElement[] {
    const line = lines.get(c.line);
    if (!line) return [];
    const a = points.get(line.a), b = points.get(line.b);
    if (!a || !b) return [];
    const angleDeg = c.value;
    const angleRad = angleDeg * Math.PI / 180;
    const lineLen = Math.hypot(b.x - a.x, b.y - a.y);
    const arcRadius = Math.max(1.5, Math.min(4, lineLen * 0.3));
    return [{ kind: 'angle-arc', center: [a.x, a.y], startAngle: 0, endAngle: angleRad, radius: arcRadius, value: `${angleDeg}°` }];
  },

  computeDof(c, { refCount, lines }) {
    const line = lines.find((l) => l.id === c.line);
    if (!line) return;
    for (const ptId of [line.a, line.b]) {
      refCount.set(ptId, (refCount.get(ptId) ?? 0) + 1);
    }
  },
});

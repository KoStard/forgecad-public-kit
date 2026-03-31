/**
 * Layout helpers — eliminate manual trigonometry for common positioning patterns.
 *
 * These functions return arrays of {x, y} positions that can be used with
 * translate(), circularPattern seed placement, or any other positioning API.
 */

const DEG_TO_RAD = Math.PI / 180;

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface CircularLayoutOptions {
  /** Angle of the first element in degrees (default: 0 = +X axis). */
  startDeg?: number;
  /** Center X coordinate (default: 0). */
  centerX?: number;
  /** Center Y coordinate (default: 0). */
  centerY?: number;
}

/**
 * Compute evenly-spaced positions around a circle.
 *
 * Eliminates the most common trig pattern in CAD scripts:
 * ```js
 * // Before — manual trig
 * for (let i = 0; i < 12; i++) {
 *   const angle = i * 30 * Math.PI / 180;
 *   markers.push(marker.translate(r * Math.cos(angle), r * Math.sin(angle), 0));
 * }
 *
 * // After — declarative
 * for (const {x, y} of circularLayout(12, r)) {
 *   markers.push(marker.translate(x, y, 0));
 * }
 * ```
 */
export function circularLayout(count: number, radius: number, options?: CircularLayoutOptions): LayoutPoint[] {
  if (count <= 0) return [];
  const startRad = (options?.startDeg ?? 0) * DEG_TO_RAD;
  const cx = options?.centerX ?? 0;
  const cy = options?.centerY ?? 0;
  const step = (2 * Math.PI) / count;
  const points: LayoutPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = startRad + step * i;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return points;
}

export interface PolygonVerticesOptions {
  /** Angle of the first vertex in degrees (default: 90 = top). */
  startDeg?: number;
  /** Center X coordinate (default: 0). */
  centerX?: number;
  /** Center Y coordinate (default: 0). */
  centerY?: number;
}

/**
 * Compute the vertex positions of a regular polygon.
 *
 * Default orientation places the first vertex at the top (90 degrees),
 * matching the convention used by `ngon()`.
 *
 * Eliminates manual Math.sqrt(3) for triangles, pentagon vertex math, etc:
 * ```js
 * // Before — manual equilateral triangle
 * const v1 = [center.x - r/2, center.y + r * Math.sqrt(3)/2];
 * const v2 = [center.x - r/2, center.y - r * Math.sqrt(3)/2];
 * const v3 = [center.x + r, center.y];
 *
 * // After — declarative
 * const [v1, v2, v3] = polygonVertices(3, r);
 * ```
 */
export function polygonVertices(sides: number, radius: number, options?: PolygonVerticesOptions): LayoutPoint[] {
  if (sides < 3) throw new Error(`polygonVertices() requires at least 3 sides, got ${sides}`);
  // Default start at 90° (top) to match ngon() convention
  return circularLayout(sides, radius, {
    startDeg: options?.startDeg ?? 90,
    centerX: options?.centerX,
    centerY: options?.centerY,
  });
}

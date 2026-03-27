import { Sketch } from './core';
import { polygon } from './primitives';

// ── Typed segment store ───────────────────────────────────────────────────────

type PathSeg =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'line'; x: number; y: number }
  | { kind: 'arc'; x: number; y: number; radius: number; clockwise: boolean };

// ── Pure arc geometry helpers (exported for testing) ─────────────────────────

/**
 * Compute the arc center from start/end points, radius, and winding direction.
 * Matches the convention in ConstrainedSketchBuilder.addArc:
 *   clockwise=true  → center to the right of the start→end direction
 *   clockwise=false → center to the left  of the start→end direction
 * Radius is clamped to the minimum viable value (half the chord length).
 */
export function arcCenter(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  radius: number,
  clockwise: boolean,
): [number, number] {
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const dx = ex - sx;
  const dy = ey - sy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const r = Math.max(radius, d / 2 + 1e-9);
  const h = Math.sqrt(r * r - (d / 2) * (d / 2));
  const invD = d > 1e-9 ? 1 / d : 0;
  // Left-perpendicular of start→end
  const px = -dy * invD;
  const py = dx * invD;
  const sign = clockwise ? -1 : 1;
  return [mx + sign * h * px, my + sign * h * py];
}

/**
 * Sample N evenly-spaced points along a circular arc from (sx,sy) to (ex,ey).
 * The center (cx,cy) must already be computed via arcCenter().
 * Returns only the intermediate + final point (start is excluded, as it's
 * the previous cursor position already in the point list).
 */
export function sampleArc(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  cx: number,
  cy: number,
  clockwise: boolean,
  segments = 32,
): [number, number][] {
  const r = Math.hypot(sx - cx, sy - cy);
  let startAngle = Math.atan2(sy - cy, sx - cx);
  let endAngle = Math.atan2(ey - cy, ex - cx);

  // Normalise sweep to the correct direction
  if (clockwise) {
    if (endAngle >= startAngle) endAngle -= 2 * Math.PI;
  } else {
    if (endAngle <= startAngle) endAngle += 2 * Math.PI;
  }

  const pts: [number, number][] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const a = startAngle + t * (endAngle - startAngle);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// ── PathBuilder ───────────────────────────────────────────────────────────────

export class PathBuilder {
  private segs: PathSeg[] = [];
  private x = 0;
  private y = 0;

  moveTo(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.segs.push({ kind: 'move', x, y });
    return this;
  }

  lineTo(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.segs.push({ kind: 'line', x, y });
    return this;
  }

  lineH(dx: number): this {
    return this.lineTo(this.x + dx, this.y);
  }

  lineV(dy: number): this {
    return this.lineTo(this.x, this.y + dy);
  }

  lineAngled(length: number, degrees: number): this {
    const rad = (degrees * Math.PI) / 180;
    return this.lineTo(this.x + length * Math.cos(rad), this.y + length * Math.sin(rad));
  }

  /**
   * Draw a circular arc from the current position to (x, y) with the given radius.
   * `clockwise=true`  → arc curves to the right of the start→end direction.
   * `clockwise=false` → arc curves to the left  of the start→end direction.
   * Matches the convention of ConstrainedSketchBuilder.arcTo().
   */
  arcTo(x: number, y: number, radius: number, clockwise = false): this {
    this.segs.push({ kind: 'arc', x, y, radius, clockwise });
    this.x = x;
    this.y = y;
    return this;
  }

  /** Expand all stored segments into a flat polyline of [x,y] points. */
  private tessellate(): [number, number][] {
    const pts: [number, number][] = [];
    let cx = 0;
    let cy = 0;

    for (const seg of this.segs) {
      if (seg.kind === 'move' || seg.kind === 'line') {
        pts.push([seg.x, seg.y]);
        cx = seg.x;
        cy = seg.y;
      } else {
        // Arc: need the previous cursor position as the start point
        const [acx, acy] = arcCenter(cx, cy, seg.x, seg.y, seg.radius, seg.clockwise);
        const sampled = sampleArc(cx, cy, seg.x, seg.y, acx, acy, seg.clockwise);
        for (const p of sampled) pts.push(p);
        cx = seg.x;
        cy = seg.y;
      }
    }
    return pts;
  }

  close(): Sketch {
    const pts = this.tessellate();
    if (pts.length < 3) throw new Error('Path needs at least 3 points');
    let signedArea = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      signedArea += (x2 - x1) * (y2 + y1);
    }
    if (signedArea > 0) pts.reverse();
    return polygon(pts);
  }

  stroke(width: number, join: 'Round' | 'Square' = 'Square'): Sketch {
    const pts = this.tessellate();
    if (pts.length < 2) throw new Error('Stroke needs at least 2 points');
    const hw = width / 2;
    const n = pts.length;

    const normals: [number, number][] = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0],
        dy = pts[i + 1][1] - pts[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      normals.push([-dy / len, dx / len]);
    }

    const left: [number, number][] = [],
      right: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[i];
      if (i === 0 || i === n - 1) {
        const ni = normals[i === 0 ? 0 : n - 2];
        left.push([px + ni[0] * hw, py + ni[1] * hw]);
        right.push([px - ni[0] * hw, py - ni[1] * hw]);
      } else {
        const n1 = normals[i - 1],
          n2 = normals[i];
        let mx = n1[0] + n2[0],
          my = n1[1] + n2[1];
        let mlen = Math.sqrt(mx * mx + my * my);
        if (mlen < 1e-9) {
          mx = n1[0];
          my = n1[1];
          mlen = 1;
        }
        mx /= mlen;
        my /= mlen;
        const scale = hw / (mx * n1[0] + my * n1[1]);
        left.push([px + mx * scale, py + my * scale]);
        right.push([px - mx * scale, py - my * scale]);
      }
    }

    const poly: [number, number][] = [...left, ...right.reverse()];
    let sa = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      sa += (x2 - x1) * (y2 + y1);
    }
    if (sa > 0) poly.reverse();

    let result = polygon(poly);
    if (join === 'Round') result = result.offset(-hw / 2, 'Round').offset(hw / 2, 'Round');
    return result;
  }
}

/** Create a path builder for constructing 2D outlines with moveTo/lineTo/arcTo/close/stroke. */
export function path(): PathBuilder {
  return new PathBuilder();
}

/** Create a stroked polyline sketch from an array of 2D points with the given width and corner join style. */
export function stroke(points: [number, number][], width: number, join: 'Round' | 'Square' = 'Square'): Sketch {
  const builder = new PathBuilder();
  builder.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) builder.lineTo(points[i][0], points[i][1]);
  return builder.stroke(width, join);
}

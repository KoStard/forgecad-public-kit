import { Sketch } from './core';
import { polygon } from './primitives';

// ── Typed segment store ───────────────────────────────────────────────────────

type PathSeg =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'line'; x: number; y: number }
  // Center stored explicitly — avoids recomputing it in tessellate and keeps
  // arcTo (midpoint-based) and tangentArcTo (tangent-based) in the same type.
  | { kind: 'arc'; x: number; y: number; cx: number; cy: number; clockwise: boolean };

// ── Pure geometry helpers (exported for testing) ──────────────────────────────

/**
 * Arc center from start/end/radius/winding — matches ConstrainedSketchBuilder convention.
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
  const px = -dy * invD; // left-perpendicular of start→end
  const py = dx * invD;
  const sign = clockwise ? -1 : 1;
  return [mx + sign * h * px, my + sign * h * py];
}

/**
 * Sample N evenly-spaced points along a circular arc from (sx,sy) to (ex,ey).
 * Center (cx,cy) must be provided. Start point is excluded (it's already in
 * the caller's point list); only intermediate + final points are returned.
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

/**
 * Compute the arc that starts tangent to (tx,ty) at (sx,sy) and ends at (ex,ey).
 * The winding direction and radius are derived from the geometry — there is
 * exactly one such arc (for a given side choice, which is auto-selected).
 *
 * Returns the center, radius, and winding for use in tessellation.
 * Throws if start and end are collinear with the tangent (use lineTo instead).
 */
export function tangentArcGeom(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  ex: number,
  ey: number,
): { cx: number; cy: number; radius: number; clockwise: boolean } {
  const dx = ex - sx;
  const dy = ey - sy;
  // Signed: cross > 0 → end is to the RIGHT of tangent → CW; < 0 → CCW.
  const cross = dx * ty - dy * tx;
  if (Math.abs(cross) < 1e-9) {
    throw new Error(
      'tangentArcTo: endpoint lies along the current direction — use lineTo instead.',
    );
  }
  const d2 = dx * dx + dy * dy;
  const clockwise = cross > 0;
  const R = Math.abs(d2 / (2 * cross)); // always positive
  const sign = clockwise ? 1 : -1;
  const cx = sx + sign * ty * R;
  const cy = sy - sign * tx * R;
  return { cx, cy, radius: R, clockwise };
}

/** Departure tangent of an arc at its end point, given its center and winding. */
function arcEndTangent(
  ex: number,
  ey: number,
  cx: number,
  cy: number,
  clockwise: boolean,
): [number, number] {
  const rx = ex - cx;
  const ry = ey - cy;
  const r = Math.hypot(rx, ry);
  return clockwise ? [ry / r, -rx / r] : [-ry / r, rx / r];
}

// ── PathBuilder ───────────────────────────────────────────────────────────────

export class PathBuilder {
  private segs: PathSeg[] = [];
  private x = 0;
  private y = 0;
  /** Current departure tangent unit vector. Updated by lineTo / arcTo / tangentArcTo. */
  private dirX = 1;
  private dirY = 0;

  moveTo(x: number, y: number): this {
    this.x = x;
    this.y = y;
    this.segs.push({ kind: 'move', x, y });
    return this;
  }

  lineTo(x: number, y: number): this {
    const dx = x - this.x;
    const dy = y - this.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-9) {
      this.dirX = dx / len;
      this.dirY = dy / len;
    }
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
   * Center is determined by the midpoint formula (not tangent-aware).
   * For a G1-continuous arc chain use `tangentArcTo` instead.
   */
  arcTo(x: number, y: number, radius: number, clockwise = false): this {
    const [cx, cy] = arcCenter(this.x, this.y, x, y, radius, clockwise);
    this.segs.push({ kind: 'arc', x, y, cx, cy, clockwise });
    const [dx, dy] = arcEndTangent(x, y, cx, cy, clockwise);
    this.x = x;
    this.y = y;
    this.dirX = dx;
    this.dirY = dy;
    return this;
  }

  /**
   * Draw a circular arc from the current position to (x, y) that is tangent
   * to the current path direction at the start.
   *
   * Unlike `arcTo`, the radius is not specified — it is derived from the
   * departure direction and the endpoint, guaranteeing G1 continuity with the
   * previous segment. Chaining multiple `tangentArcTo` calls produces a fully
   * smooth, kink-free curve.
   *
   * Throws if the endpoint lies exactly along the current direction (use lineTo).
   */
  tangentArcTo(x: number, y: number): this {
    const { cx, cy, clockwise } = tangentArcGeom(this.x, this.y, this.dirX, this.dirY, x, y);
    this.segs.push({ kind: 'arc', x, y, cx, cy, clockwise });
    const [dx, dy] = arcEndTangent(x, y, cx, cy, clockwise);
    this.x = x;
    this.y = y;
    this.dirX = dx;
    this.dirY = dy;
    return this;
  }

  /**
   * Smooth three-arc end cap from the current position to (endX, endY).
   *
   * Inserts: small corner arc → large cap arc → small corner arc, all G1-
   * continuous with each other and with the preceding/following segments.
   *
   * Geometry is computed automatically — no need to know junction points.
   *
   * @param endX / endY  — target position (end of the cap sequence)
   * @param cornerRadius — radius of the two small corner arcs
   * @param capRadius    — radius of the large outward-bulging arc
   *
   * Example — slot with a bumped end cap:
   * ```js
   * path()
   *   .moveTo(0, 0).lineTo(40, 0)
   *   .smoothCapTo(40, 20, 4, 12)
   *   .lineTo(0, 20).close().extrude(5)
   * ```
   */
  smoothCapTo(endX: number, endY: number, cornerRadius: number, capRadius: number): this {
    const rc = cornerRadius;
    const R = capRadius;
    const tx = this.dirX;
    const ty = this.dirY;

    // Corner arc centers — both are perpendicular (left) to the tangent at
    // their respective endpoints, at distance rc.
    // C_start: perpendicular-left of (tx,ty) at current position.
    const csx = this.x - ty * rc;
    const csy = this.y + tx * rc;
    // C_end: the cap arrives at (endX,endY) with reversed tangent (-tx,-ty).
    // Perpendicular-left of (-tx,-ty) is (ty,-tx) … wait — arriving tangent
    // means the arc ends at endX/endY going in that direction. For a symmetric
    // cap, the arriving direction is the same as the start direction (not
    // reversed); the arc curves back on itself.
    //
    // For a standard slot end (two parallel lines), the path enters the cap
    // going in direction (tx,ty) and must exit continuing in the same
    // direction (-tx,-ty) rotated 180°.  The end corner arc ends at (endX,endY)
    // with departure tangent (-tx,-ty) so the following lineTo continues
    // back.  Its center is perpendicular-left of (-tx,-ty) at (endX,endY):
    //   left of (-tx,-ty) = (ty,-tx)
    // C_end = endX + ty*rc, endY - tx*rc  (perpendicular into the cap)
    const cex = endX + ty * rc;
    const cey = endY - tx * rc;

    // Large cap center — on the perpendicular bisector of (C_start, C_end),
    // on the outward (cap-bulge) side.
    const mcx = (csx + cex) / 2;
    const mcy = (csy + cey) / 2;
    // Direction C_start → C_end:
    const dccx = cex - csx;
    const dccy = cey - csy;
    const dccLen = Math.hypot(dccx, dccy);
    if (dccLen < 1e-9) throw new Error('smoothCapTo: start and end corner centers coincide');
    // Perpendicular (90° CCW rotation):
    let perpX = -dccy / dccLen;
    let perpY = dccx / dccLen;
    // Ensure it points outward (in the general direction of the tangent):
    if (perpX * tx + perpY * ty < 0) {
      perpX = -perpX;
      perpY = -perpY;
    }

    const halfDist = dccLen / 2;
    const capDist = R + rc; // external tangency: dist(C_cap, C_corner) = R + rc
    if (capDist < halfDist) {
      throw new Error(
        `smoothCapTo: capRadius ${R} too small — minimum is ${(halfDist - rc).toFixed(2)}`,
      );
    }
    const t = Math.sqrt(capDist * capDist - halfDist * halfDist);
    const ccx = mcx + t * perpX;
    const ccy = mcy + t * perpY;

    // Junction points — each is on the line from a corner center through C_cap,
    // at distance rc from the corner center (external tangency).
    const top1x = csx + rc * (ccx - csx) / capDist;
    const top1y = csy + rc * (ccy - csy) / capDist;
    const top2x = cex + rc * (ccx - cex) / capDist;
    const top2y = cey + rc * (ccy - cey) / capDist;

    // All three arcs are CCW (for a CCW-wound closed shape).
    this.segs.push({ kind: 'arc', x: top1x, y: top1y, cx: csx, cy: csy, clockwise: false });
    const [d1x, d1y] = arcEndTangent(top1x, top1y, csx, csy, false);
    this.x = top1x;
    this.y = top1y;
    this.dirX = d1x;
    this.dirY = d1y;

    this.segs.push({ kind: 'arc', x: top2x, y: top2y, cx: ccx, cy: ccy, clockwise: false });
    const [d2x, d2y] = arcEndTangent(top2x, top2y, ccx, ccy, false);
    this.x = top2x;
    this.y = top2y;
    this.dirX = d2x;
    this.dirY = d2y;

    this.segs.push({ kind: 'arc', x: endX, y: endY, cx: cex, cy: cey, clockwise: false });
    const [d3x, d3y] = arcEndTangent(endX, endY, cex, cey, false);
    this.x = endX;
    this.y = endY;
    this.dirX = d3x;
    this.dirY = d3y;

    return this;
  }

  /** Expand all segments into a flat tessellated polyline. */
  private tessellate(): [number, number][] {
    const pts: [number, number][] = [];
    let px = 0;
    let py = 0;

    for (const seg of this.segs) {
      if (seg.kind === 'move' || seg.kind === 'line') {
        pts.push([seg.x, seg.y]);
        px = seg.x;
        py = seg.y;
      } else {
        const sampled = sampleArc(px, py, seg.x, seg.y, seg.cx, seg.cy, seg.clockwise);
        for (const p of sampled) pts.push(p);
        px = seg.x;
        py = seg.y;
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
      const dx = pts[i + 1][0] - pts[i][0];
      const dy = pts[i + 1][1] - pts[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      normals.push([-dy / len, dx / len]);
    }

    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const [qx, qy] = pts[i];
      if (i === 0 || i === n - 1) {
        const ni = normals[i === 0 ? 0 : n - 2];
        left.push([qx + ni[0] * hw, qy + ni[1] * hw]);
        right.push([qx - ni[0] * hw, qy - ni[1] * hw]);
      } else {
        const n1 = normals[i - 1];
        const n2 = normals[i];
        let mx = n1[0] + n2[0];
        let my = n1[1] + n2[1];
        let mlen = Math.sqrt(mx * mx + my * my);
        if (mlen < 1e-9) {
          mx = n1[0];
          my = n1[1];
          mlen = 1;
        }
        mx /= mlen;
        my /= mlen;
        const scale = hw / (mx * n1[0] + my * n1[1]);
        left.push([qx + mx * scale, qy + my * scale]);
        right.push([qx - mx * scale, qy - my * scale]);
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
export function stroke(
  points: [number, number][],
  width: number,
  join: 'Round' | 'Square' = 'Square',
): Sketch {
  const builder = new PathBuilder();
  builder.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) builder.lineTo(points[i][0], points[i][1]);
  return builder.stroke(width, join);
}

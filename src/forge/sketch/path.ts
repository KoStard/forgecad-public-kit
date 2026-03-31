import { Sketch } from './core';
import { polygon } from './primitives';

// ── Typed segment store ───────────────────────────────────────────────────────

type PathSeg =
  | { kind: 'move'; x: number; y: number }
  | { kind: 'line'; x: number; y: number }
  | { kind: 'arc'; x: number; y: number; cx: number; cy: number; clockwise: boolean }
  | { kind: 'bezier'; x: number; y: number; cp1x: number; cp1y: number; cp2x: number; cp2y: number }
  | { kind: 'spline'; x: number; y: number; points: [number, number][]; tension: number };

// ── Tessellation tolerance ───────────────────────────────────────────────────

/** Default chord-error tolerance for adaptive tessellation (in model units). */
const DEFAULT_TOLERANCE = 0.05;

/**
 * Compute the number of segments needed for an arc of given radius and sweep
 * angle so that the maximum chord error stays below `tol`.
 *
 * Formula: sagitta = r * (1 - cos(θ/2)) ≤ tol  →  θ ≤ 2·acos(1 - tol/r)
 * segments = ceil(|sweep| / θ_max), clamped to [4, 256].
 */
export function adaptiveArcSegments(radius: number, sweepRadians: number, tol = DEFAULT_TOLERANCE): number {
  const r = Math.abs(radius);
  const sweep = Math.abs(sweepRadians);
  if (r < 1e-9 || sweep < 1e-9) return 4;
  const ratio = Math.min(tol / r, 1);
  const thetaMax = 2 * Math.acos(1 - ratio);
  return Math.max(4, Math.min(256, Math.ceil(sweep / thetaMax)));
}

// ── Pure geometry helpers (exported for testing) ──────────────────────────────

/**
 * Arc center from start/end/radius/winding — matches ConstrainedSketchBuilder convention.
 * Radius is clamped to the minimum viable value (half the chord length).
 */
export function arcCenter(sx: number, sy: number, ex: number, ey: number, radius: number, clockwise: boolean): [number, number] {
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
 * Sample points along a circular arc from (sx,sy) to (ex,ey).
 * Uses adaptive tessellation by default. Start point is excluded.
 */
export function sampleArc(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  cx: number,
  cy: number,
  clockwise: boolean,
  segments?: number,
): [number, number][] {
  const r = Math.hypot(sx - cx, sy - cy);
  const startAngle = Math.atan2(sy - cy, sx - cx);
  let endAngle = Math.atan2(ey - cy, ex - cx);

  if (clockwise) {
    if (endAngle >= startAngle) endAngle -= 2 * Math.PI;
  } else {
    if (endAngle <= startAngle) endAngle += 2 * Math.PI;
  }

  const sweep = endAngle - startAngle;
  const n = segments ?? adaptiveArcSegments(r, sweep);

  const pts: [number, number][] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = startAngle + t * sweep;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Compute the arc that starts tangent to (tx,ty) at (sx,sy) and ends at (ex,ey).
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
  const cross = dx * ty - dy * tx;
  if (Math.abs(cross) < 1e-9) {
    throw new Error('tangentArcTo: endpoint lies along the current direction — use lineTo instead.');
  }
  const d2 = dx * dx + dy * dy;
  const clockwise = cross > 0;
  const R = Math.abs(d2 / (2 * cross));
  const sign = clockwise ? 1 : -1;
  const cx = sx + sign * ty * R;
  const cy = sy - sign * tx * R;
  return { cx, cy, radius: R, clockwise };
}

/** Departure tangent of an arc at its end point, given its center and winding. */
function arcEndTangent(ex: number, ey: number, cx: number, cy: number, clockwise: boolean): [number, number] {
  const rx = ex - cx;
  const ry = ey - cy;
  const r = Math.hypot(rx, ry);
  return clockwise ? [ry / r, -rx / r] : [-ry / r, rx / r];
}

/**
 * Sample a cubic bezier curve from (sx,sy) to (ex,ey) with control points.
 * Uses adaptive tessellation based on control polygon length.
 * Start point is excluded.
 */
export function sampleBezier(
  sx: number,
  sy: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  ex: number,
  ey: number,
  segments?: number,
): [number, number][] {
  const n = segments ?? adaptiveBezierSegments(sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey);
  const pts: [number, number][] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const uu = u * u;
    const uuu = uu * u;
    const tt = t * t;
    const ttt = tt * t;
    pts.push([uuu * sx + 3 * uu * t * cp1x + 3 * u * tt * cp2x + ttt * ex, uuu * sy + 3 * uu * t * cp1y + 3 * u * tt * cp2y + ttt * ey]);
  }
  return pts;
}

/** Adaptive segment count for a cubic bezier based on control polygon length. */
function adaptiveBezierSegments(
  sx: number,
  sy: number,
  cp1x: number,
  cp1y: number,
  cp2x: number,
  cp2y: number,
  ex: number,
  ey: number,
  tol = DEFAULT_TOLERANCE,
): number {
  const polyLen = Math.hypot(cp1x - sx, cp1y - sy) + Math.hypot(cp2x - cp1x, cp2y - cp1y) + Math.hypot(ex - cp2x, ey - cp2y);
  const chordLen = Math.hypot(ex - sx, ey - sy);
  const deviation = polyLen - chordLen;
  if (deviation < tol) return 4;
  return Math.max(4, Math.min(256, Math.ceil(polyLen / tol)));
}

/**
 * Sample a Catmull-Rom spline through a sequence of points.
 * Returns all intermediate samples (excluding the first control point, which
 * is assumed to be the current cursor).
 */
export function sampleCatmullRomSegment(points: [number, number][], tension: number, samplesPerSeg = 16): [number, number][] {
  const n = points.length;
  if (n < 2) return points.slice();
  const pts: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = i === 0 ? points[0] : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < n ? points[i + 2] : points[n - 1];
    const startJ = i === 0 ? 0 : 1; // skip first point of subsequent segments (already in list)
    for (let s = startJ; s <= samplesPerSeg; s++) {
      const t = s / samplesPerSeg;
      pts.push(catmullRom2D(p0, p1, p2, p3, t, tension));
    }
  }
  return pts;
}

function catmullRom2D(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
  tension: number,
): [number, number] {
  const tt = t * t;
  const ttt = tt * t;
  const s = (1 - tension) * 0.5;
  const m1x = (p2[0] - p0[0]) * s;
  const m1y = (p2[1] - p0[1]) * s;
  const m2x = (p3[0] - p1[0]) * s;
  const m2y = (p3[1] - p1[1]) * s;
  const h00 = 2 * ttt - 3 * tt + 1;
  const h10 = ttt - 2 * tt + t;
  const h01 = -2 * ttt + 3 * tt;
  const h11 = ttt - tt;
  return [h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x, h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y];
}

// ── Polygon winding helper ───────────────────────────────────────────────────

function ensureCCW(pts: [number, number][]): void {
  let signedArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    signedArea += (x2 - x1) * (y2 + y1);
  }
  if (signedArea > 0) pts.reverse();
}

// ── PathBuilder ───────────────────────────────────────────────────────────────

export class PathBuilder {
  private segs: PathSeg[] = [];
  private x = 0;
  private y = 0;
  /** Current departure tangent unit vector. */
  private dirX = 1;
  private dirY = 0;

  /** Current cursor X position. */
  getX(): number { return this.x; }
  /** Current cursor Y position. */
  getY(): number { return this.y; }

  // ── Basic drawing ─────────────────────────────────────────────────────────

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

  // ── Relative moves ────────────────────────────────────────────────────────

  lineBy(dx: number, dy: number): this {
    return this.lineTo(this.x + dx, this.y + dy);
  }

  arcBy(dx: number, dy: number, radius: number, clockwise = false): this {
    return this.arcTo(this.x + dx, this.y + dy, radius, clockwise);
  }

  bezierBy(dcp1x: number, dcp1y: number, dcp2x: number, dcp2y: number, dx: number, dy: number): this {
    return this.bezierTo(this.x + dcp1x, this.y + dcp1y, this.x + dcp2x, this.y + dcp2y, this.x + dx, this.y + dy);
  }

  // ── Arcs ──────────────────────────────────────────────────────────────────

  /**
   * Draw a circular arc from the current position to (x, y) with the given radius.
   * `clockwise=true`  → arc curves to the right of the start→end direction.
   * `clockwise=false` → arc curves to the left  of the start→end direction.
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
   * G1-continuous arc — radius derived from current tangent + endpoint.
   * Throws if endpoint is collinear with current direction.
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
   * Arc around a known center point, sweeping by the given angle.
   * Radius is derived from the distance between the current position and the center.
   * Positive sweep = CCW (math convention), negative = CW.
   *
   * ```js
   * // Arc 90° CCW around (50, 50)
   * path().moveTo(70, 50).arcAround(50, 50, 90)
   * // Arc 45° CW around the origin
   * path().moveTo(10, 0).arcAround(0, 0, -45)
   * ```
   */
  arcAround(cx: number, cy: number, sweepDeg: number): this {
    const radius = Math.hypot(this.x - cx, this.y - cy);
    if (radius < 1e-9) throw new Error('arcAround: current position coincides with center');
    if (Math.abs(sweepDeg) < 1e-9) return this; // no-op

    const startAngle = Math.atan2(this.y - cy, this.x - cx);
    const sweepRad = (sweepDeg * Math.PI) / 180;
    const endAngle = startAngle + sweepRad;
    const x = cx + radius * Math.cos(endAngle);
    const y = cy + radius * Math.sin(endAngle);
    const clockwise = sweepDeg < 0;

    this.segs.push({ kind: 'arc', x, y, cx, cy, clockwise });
    const [dx, dy] = arcEndTangent(x, y, cx, cy, clockwise);
    this.x = x;
    this.y = y;
    this.dirX = dx;
    this.dirY = dy;
    return this;
  }

  /**
   * Arc around a center point given as an offset from the current position.
   * `(dx, dy)` is the vector from the current point to the center.
   * Positive sweep = CCW (math convention), negative = CW.
   *
   * ```js
   * // Arc 90° CCW around a center 20 units to the right
   * path().moveTo(50, 50).arcAroundRelative(20, 0, 90)
   * // Equivalent to: path().moveTo(50, 50).arcAround(70, 50, 90)
   * ```
   */
  arcAroundRelative(dx: number, dy: number, sweepDeg: number): this {
    return this.arcAround(this.x + dx, this.y + dy, sweepDeg);
  }

  /**
   * Smooth three-arc end cap from the current position to (endX, endY).
   * Inserts: small corner arc → large cap arc → small corner arc, all G1-continuous.
   */
  smoothCapTo(endX: number, endY: number, cornerRadius: number, capRadius: number): this {
    const rc = cornerRadius;
    const R = capRadius;
    const tx = this.dirX;
    const ty = this.dirY;

    const csx = this.x - ty * rc;
    const csy = this.y + tx * rc;
    const cex = endX + ty * rc;
    const cey = endY - tx * rc;

    const mcx = (csx + cex) / 2;
    const mcy = (csy + cey) / 2;
    const dccx = cex - csx;
    const dccy = cey - csy;
    const dccLen = Math.hypot(dccx, dccy);
    if (dccLen < 1e-9) throw new Error('smoothCapTo: start and end corner centers coincide');
    let perpX = -dccy / dccLen;
    let perpY = dccx / dccLen;
    if (perpX * tx + perpY * ty < 0) {
      perpX = -perpX;
      perpY = -perpY;
    }

    const halfDist = dccLen / 2;
    const capDist = R + rc;
    if (capDist < halfDist) {
      throw new Error(`smoothCapTo: capRadius ${R} too small — minimum is ${(halfDist - rc).toFixed(2)}`);
    }
    const t = Math.sqrt(capDist * capDist - halfDist * halfDist);
    const ccx = mcx + t * perpX;
    const ccy = mcy + t * perpY;

    const top1x = csx + (rc * (ccx - csx)) / capDist;
    const top1y = csy + (rc * (ccy - csy)) / capDist;
    const top2x = cex + (rc * (ccx - cex)) / capDist;
    const top2y = cey + (rc * (ccy - cey)) / capDist;

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

  // ── Bezier curves ─────────────────────────────────────────────────────────

  /**
   * Cubic bezier from current position to (x, y) via two control points.
   */
  bezierTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this {
    this.segs.push({ kind: 'bezier', x, y, cp1x, cp1y, cp2x, cp2y });
    // Departure tangent at end = direction from cp2 to endpoint
    const tdx = x - cp2x;
    const tdy = y - cp2y;
    const tlen = Math.hypot(tdx, tdy);
    if (tlen > 1e-9) {
      this.dirX = tdx / tlen;
      this.dirY = tdy / tlen;
    }
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * G1-continuous cubic bezier — first control point is auto-derived from
   * the current tangent direction. `weight` controls how far the auto-placed
   * control point extends along the tangent (default: 1/3 of the chord).
   *
   * The second control point `(cp2x, cp2y)` must be provided — it controls
   * the arrival curvature. For a fully automatic smooth curve, see `smoothThrough`.
   */
  tangentBezierTo(cp2x: number, cp2y: number, x: number, y: number, weight?: number): this {
    const chord = Math.hypot(x - this.x, y - this.y);
    const w = weight ?? chord / 3;
    const cp1x = this.x + this.dirX * w;
    const cp1y = this.y + this.dirY * w;
    return this.bezierTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }

  // ── Spline ────────────────────────────────────────────────────────────────

  /**
   * Catmull-Rom spline through a list of waypoints from the current position.
   * The current position is included as the first point. The last waypoint
   * becomes the new cursor position.
   *
   * @param waypoints — intermediate + final points (at least 1)
   * @param tension — 0 = very round, 1 = linear (default 0.5)
   */
  smoothThrough(waypoints: [number, number][], tension = 0.5): this {
    if (waypoints.length === 0) throw new Error('smoothThrough requires at least 1 waypoint');
    const allPts: [number, number][] = [[this.x, this.y], ...waypoints];
    const last = waypoints[waypoints.length - 1];
    this.segs.push({ kind: 'spline', x: last[0], y: last[1], points: allPts, tension });
    // Departure tangent: direction of last segment
    if (allPts.length >= 2) {
      const prev = allPts[allPts.length - 2];
      const dx = last[0] - prev[0];
      const dy = last[1] - prev[1];
      const len = Math.hypot(dx, dy);
      if (len > 1e-9) {
        this.dirX = dx / len;
        this.dirY = dy / len;
      }
    }
    this.x = last[0];
    this.y = last[1];
    return this;
  }

  // ── Corner modifiers ──────────────────────────────────────────────────────

  /**
   * Round the last corner (the junction between the previous two segments)
   * with a tangent arc of the given radius.
   *
   * Must be called after at least two line/arc segments that form a corner.
   * The fillet trims back both segments and inserts a tangent arc.
   *
   * ```js
   * path().moveTo(0,0).lineTo(10,0).lineTo(10,10).fillet(2).lineTo(0,10).close()
   * ```
   */
  fillet(radius: number): this {
    if (radius <= 0) throw new Error('fillet: radius must be positive');
    const n = this.segs.length;
    if (n < 2) throw new Error('fillet: need at least 2 segments before a fillet');

    const prev = this.segs[n - 2];
    const curr = this.segs[n - 1];

    // We only fillet line-line corners for now (the common case).
    // The corner point is the start of `curr` = end of `prev`.
    // We need the direction of each segment to compute the trim.
    const cornerX = curr.kind === 'line' || curr.kind === 'move' ? (prev.kind === 'line' || prev.kind === 'move' ? 0 : 0) : 0;
    // Get the two directions meeting at the corner
    const { trimA, trimB, arcSeg } = this.computeFilletGeom(radius);
    if (!arcSeg) throw new Error('fillet: cannot fillet these segments (parallel or degenerate)');

    // Trim the previous segment endpoint
    this.trimLastSegEnd(n - 2, trimA[0], trimA[1]);
    // Replace current segment start → fillet arc + trimmed continuation
    const trimmedSeg = { ...curr } as PathSeg;
    if (trimmedSeg.kind === 'line') {
      // current segment now starts from trimB instead of corner
      // We keep the current endpoint the same
    }
    // Insert arc between trimmed prev and trimmed curr
    this.segs.splice(n - 1, 1, arcSeg, trimmedSeg);

    // Update cursor to current endpoint (unchanged)
    return this;
  }

  /**
   * Chamfer the last corner with a straight cut of the given distance.
   *
   * ```js
   * path().moveTo(0,0).lineTo(10,0).lineTo(10,10).chamfer(2).lineTo(0,10).close()
   * ```
   */
  chamfer(distance: number): this {
    if (distance <= 0) throw new Error('chamfer: distance must be positive');
    const n = this.segs.length;
    if (n < 2) throw new Error('chamfer: need at least 2 segments before a chamfer');

    const { trimA, trimB } = this.computeChamferGeom(distance);

    // Trim prev end to trimA, insert line from trimA to trimB, keep curr from trimB
    this.trimLastSegEnd(n - 2, trimA[0], trimA[1]);
    const chamferLine: PathSeg = { kind: 'line', x: trimB[0], y: trimB[1] };
    this.segs.splice(n - 1, 0, chamferLine);

    return this;
  }

  private computeFilletGeom(radius: number): {
    trimA: [number, number];
    trimB: [number, number];
    arcSeg: PathSeg | null;
  } {
    const n = this.segs.length;
    const prev = this.segs[n - 2];
    const curr = this.segs[n - 1];

    // Get the corner point (endpoint of prev)
    const cx = this.getSegEnd(prev)[0];
    const cy = this.getSegEnd(prev)[1];

    // Direction of prev entering corner
    const [d1x, d1y] = this.getSegDirAt(prev, 'end');
    // Direction of curr leaving corner
    const [d2x, d2y] = this.getSegDirAt(curr, 'start');

    // Half-angle between incoming and outgoing
    const cross = d1x * d2y - d1y * d2x;
    const dot = d1x * d2x + d1y * d2y;
    if (Math.abs(cross) < 1e-9) return { trimA: [cx, cy], trimB: [cx, cy], arcSeg: null };

    const halfAngle = Math.atan2(Math.abs(cross), dot) / 2;
    const trimDist = radius / Math.tan(halfAngle);

    // Trim points
    const trimA: [number, number] = [cx - d1x * trimDist, cy - d1y * trimDist];
    const trimB: [number, number] = [cx + d2x * trimDist, cy + d2y * trimDist];

    // Arc center is at distance radius from both trim points, perpendicular to the directions
    // It's on the inside of the corner
    const clockwise = cross > 0; // CW if turning right
    const perpX = clockwise ? d1y : -d1y;
    const perpY = clockwise ? -d1x : d1x;
    const acx = trimA[0] + perpX * radius;
    const acy = trimA[1] + perpY * radius;

    const arcSeg: PathSeg = {
      kind: 'arc',
      x: trimB[0],
      y: trimB[1],
      cx: acx,
      cy: acy,
      clockwise,
    };

    return { trimA, trimB, arcSeg };
  }

  private computeChamferGeom(distance: number): {
    trimA: [number, number];
    trimB: [number, number];
  } {
    const n = this.segs.length;
    const prev = this.segs[n - 2];
    const curr = this.segs[n - 1];

    const cx = this.getSegEnd(prev)[0];
    const cy = this.getSegEnd(prev)[1];

    const [d1x, d1y] = this.getSegDirAt(prev, 'end');
    const [d2x, d2y] = this.getSegDirAt(curr, 'start');

    const trimA: [number, number] = [cx - d1x * distance, cy - d1y * distance];
    const trimB: [number, number] = [cx + d2x * distance, cy + d2y * distance];

    return { trimA, trimB };
  }

  private getSegEnd(seg: PathSeg): [number, number] {
    return [seg.x, seg.kind === 'spline' ? seg.points[seg.points.length - 1][1] : seg.y];
  }

  private getSegDirAt(seg: PathSeg, which: 'start' | 'end'): [number, number] {
    if (seg.kind === 'line' || seg.kind === 'move') {
      // For a line, we need to know its start. We get it from the segment list context.
      // This helper is only called for the two segments surrounding the corner.
      const n = this.segs.length;
      const idx = this.segs.indexOf(seg);
      if (seg.kind === 'line') {
        let sx: number, sy: number;
        if (idx > 0) {
          const prevSeg = this.segs[idx - 1];
          sx = prevSeg.x;
          sy = prevSeg.y;
        } else {
          sx = 0;
          sy = 0;
        }
        const dx = seg.x - sx;
        const dy = seg.y - sy;
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) return [this.dirX, this.dirY];
        return [dx / len, dy / len];
      }
      return [this.dirX, this.dirY];
    }
    if (seg.kind === 'arc') {
      if (which === 'start') {
        // Start tangent: reverse of arcEndTangent at start
        // Actually we need the tangent at the start of this arc
        const idx = this.segs.indexOf(seg);
        let sx: number, sy: number;
        if (idx > 0) {
          sx = this.segs[idx - 1].x;
          sy = this.segs[idx - 1].y;
        } else {
          sx = 0;
          sy = 0;
        }
        // Tangent at start = perpendicular to radius at start
        const rx = sx - seg.cx;
        const ry = sy - seg.cy;
        const r = Math.hypot(rx, ry);
        return seg.clockwise ? [ry / r, -rx / r] : [-ry / r, rx / r];
      }
      return arcEndTangent(seg.x, seg.y, seg.cx, seg.cy, seg.clockwise);
    }
    if (seg.kind === 'bezier') {
      if (which === 'start') {
        const idx = this.segs.indexOf(seg);
        let sx: number, sy: number;
        if (idx > 0) {
          sx = this.segs[idx - 1].x;
          sy = this.segs[idx - 1].y;
        } else {
          sx = 0;
          sy = 0;
        }
        const dx = seg.cp1x - sx;
        const dy = seg.cp1y - sy;
        const len = Math.hypot(dx, dy);
        return len > 1e-9 ? [dx / len, dy / len] : [this.dirX, this.dirY];
      }
      const dx = seg.x - seg.cp2x;
      const dy = seg.y - seg.cp2y;
      const len = Math.hypot(dx, dy);
      return len > 1e-9 ? [dx / len, dy / len] : [this.dirX, this.dirY];
    }
    return [this.dirX, this.dirY];
  }

  private trimLastSegEnd(idx: number, newX: number, newY: number): void {
    const seg = this.segs[idx];
    if (seg.kind === 'line' || seg.kind === 'move') {
      seg.x = newX;
      seg.y = newY;
    }
    // For arcs/beziers: we could adjust the endpoint, but for now only line-line fillet is common
  }

  // ── Path-level transforms ─────────────────────────────────────────────────

  /**
   * Mirror all existing segments across an axis and append the mirrored copy
   * in reverse order, creating a symmetric path. The axis passes through the
   * current cursor position.
   *
   * @param axis — 'x' mirrors across the local X-axis (flips Y),
   *               'y' mirrors across the local Y-axis (flips X),
   *               or `[nx, ny]` for an arbitrary axis direction.
   *
   * ```js
   * // Build right half, mirror to get full symmetric profile
   * path().moveTo(0,0).lineTo(10,0).lineTo(10,5).mirror('x').close()
   * ```
   */
  mirror(axis: 'x' | 'y' | [number, number]): this {
    let nx: number, ny: number;
    if (axis === 'x') {
      nx = 0;
      ny = 1;
    } else if (axis === 'y') {
      nx = 1;
      ny = 0;
    } else {
      const len = Math.hypot(axis[0], axis[1]);
      nx = axis[0] / len;
      ny = axis[1] / len;
    }

    // Mirror point across axis through origin (0,0) — we'll translate to pivot after
    const pivotX = this.x;
    const pivotY = this.y;

    // Reflect point (px,py) across line through (pivotX,pivotY) with normal (nx,ny)
    const reflect = (px: number, py: number): [number, number] => {
      const dx = px - pivotX;
      const dy = py - pivotY;
      const dot = dx * nx + dy * ny;
      return [px - 2 * dot * nx, py - 2 * dot * ny];
    };

    // Collect segments to mirror (skip initial moveTo, reverse order)
    const toMirror = this.segs.slice(1).reverse();
    for (const seg of toMirror) {
      if (seg.kind === 'move') continue;
      if (seg.kind === 'line') {
        // Find this segment's start point (= its predecessor's end)
        const idx = this.segs.indexOf(seg);
        let sx: number, sy: number;
        if (idx > 0) {
          sx = this.segs[idx - 1].x;
          sy = this.segs[idx - 1].y;
        } else {
          sx = 0;
          sy = 0;
        }
        // Mirror the start point (which becomes the endpoint in the reversed path)
        const [mx, my] = reflect(sx, sy);
        this.segs.push({ kind: 'line', x: mx, y: my });
        this.x = mx;
        this.y = my;
      } else if (seg.kind === 'arc') {
        const idx = this.segs.indexOf(seg);
        let sx: number, sy: number;
        if (idx > 0) {
          sx = this.segs[idx - 1].x;
          sy = this.segs[idx - 1].y;
        } else {
          sx = 0;
          sy = 0;
        }
        const [mx, my] = reflect(sx, sy);
        const [mcx, mcy] = reflect(seg.cx, seg.cy);
        // Mirroring flips the winding
        this.segs.push({ kind: 'arc', x: mx, y: my, cx: mcx, cy: mcy, clockwise: !seg.clockwise });
        this.x = mx;
        this.y = my;
      } else if (seg.kind === 'bezier') {
        const idx = this.segs.indexOf(seg);
        let sx: number, sy: number;
        if (idx > 0) {
          sx = this.segs[idx - 1].x;
          sy = this.segs[idx - 1].y;
        } else {
          sx = 0;
          sy = 0;
        }
        const [mx, my] = reflect(sx, sy);
        const [mcp1x, mcp1y] = reflect(seg.cp2x, seg.cp2y); // swap cp1/cp2 for reversal
        const [mcp2x, mcp2y] = reflect(seg.cp1x, seg.cp1y);
        this.segs.push({ kind: 'bezier', x: mx, y: my, cp1x: mcp1x, cp1y: mcp1y, cp2x: mcp2x, cp2y: mcp2y });
        this.x = mx;
        this.y = my;
      }
      // spline mirror: flatten to lines (simplest correct approach)
      else if (seg.kind === 'spline') {
        const sampled = sampleCatmullRomSegment(seg.points, seg.tension);
        const reversed = sampled.reverse();
        for (const [px, py] of reversed) {
          const [mx, my] = reflect(px, py);
          this.segs.push({ kind: 'line', x: mx, y: my });
          this.x = mx;
          this.y = my;
        }
      }
    }

    // Update direction
    const lastTwo = this.segs.slice(-2);
    if (lastTwo.length === 2) {
      const dx = lastTwo[1].x - lastTwo[0].x;
      const dy = lastTwo[1].y - lastTwo[0].y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-9) {
        this.dirX = dx / len;
        this.dirY = dy / len;
      }
    }
    return this;
  }

  // ── Tessellation ──────────────────────────────────────────────────────────

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
      } else if (seg.kind === 'arc') {
        const sampled = sampleArc(px, py, seg.x, seg.y, seg.cx, seg.cy, seg.clockwise);
        for (const p of sampled) pts.push(p);
        px = seg.x;
        py = seg.y;
      } else if (seg.kind === 'bezier') {
        const sampled = sampleBezier(px, py, seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
        for (const p of sampled) pts.push(p);
        px = seg.x;
        py = seg.y;
      } else if (seg.kind === 'spline') {
        // First point of spline is the current cursor (already in pts)
        const sampled = sampleCatmullRomSegment(seg.points, seg.tension);
        // Skip the first sampled point if it matches current cursor
        const startIdx = sampled.length > 0 && Math.hypot(sampled[0][0] - px, sampled[0][1] - py) < 1e-6 ? 1 : 0;
        for (let i = startIdx; i < sampled.length; i++) pts.push(sampled[i]);
        const last = seg.points[seg.points.length - 1];
        px = last[0];
        py = last[1];
      }
    }
    return pts;
  }

  // ── Output ────────────────────────────────────────────────────────────────

  /**
   * Close the path and return a filled Sketch.
   *
   * If the path contains multiple sub-paths (multiple moveTo calls), the
   * first sub-path is the outer contour and subsequent sub-paths are holes
   * (subtracted from the outer contour).
   */
  close(): Sketch {
    const subPaths = this.splitSubPaths();

    if (subPaths.length === 0) throw new Error('Path needs at least 3 points');

    // Tessellate each sub-path
    const tessellated = subPaths.map((segs) => this.tessellateSegs(segs));

    // First sub-path is the outer contour
    const outer = tessellated[0];
    if (outer.length < 3) throw new Error('Path needs at least 3 points');
    ensureCCW(outer);
    let result = polygon(outer);

    // Subsequent sub-paths are holes
    for (let i = 1; i < tessellated.length; i++) {
      const hole = tessellated[i];
      if (hole.length < 3) continue;
      ensureCCW(hole);
      result = result.subtract(polygon(hole));
    }

    return result;
  }

  /**
   * Close the path and return an offset version of the filled Sketch.
   * Positive delta expands outward, negative shrinks inward.
   */
  closeOffset(delta: number, join: 'Round' | 'Square' | 'Miter' = 'Round'): Sketch {
    return this.close().offset(delta, join);
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
    ensureCCW(poly);

    let result = polygon(poly);
    if (join === 'Round') result = result.offset(-hw / 2, 'Round').offset(hw / 2, 'Round');
    return result;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /** Split segments into sub-paths at each moveTo. */
  private splitSubPaths(): PathSeg[][] {
    const paths: PathSeg[][] = [];
    let current: PathSeg[] = [];
    for (const seg of this.segs) {
      if (seg.kind === 'move') {
        if (current.length > 0) paths.push(current);
        current = [seg];
      } else {
        current.push(seg);
      }
    }
    if (current.length > 0) paths.push(current);
    return paths;
  }

  /** Tessellate a sub-path (sequence of segments). */
  private tessellateSegs(segs: PathSeg[]): [number, number][] {
    const pts: [number, number][] = [];
    let px = 0;
    let py = 0;

    for (const seg of segs) {
      if (seg.kind === 'move' || seg.kind === 'line') {
        pts.push([seg.x, seg.y]);
        px = seg.x;
        py = seg.y;
      } else if (seg.kind === 'arc') {
        const sampled = sampleArc(px, py, seg.x, seg.y, seg.cx, seg.cy, seg.clockwise);
        for (const p of sampled) pts.push(p);
        px = seg.x;
        py = seg.y;
      } else if (seg.kind === 'bezier') {
        const sampled = sampleBezier(px, py, seg.cp1x, seg.cp1y, seg.cp2x, seg.cp2y, seg.x, seg.y);
        for (const p of sampled) pts.push(p);
        px = seg.x;
        py = seg.y;
      } else if (seg.kind === 'spline') {
        const sampled = sampleCatmullRomSegment(seg.points, seg.tension);
        const startIdx = sampled.length > 0 && Math.hypot(sampled[0][0] - px, sampled[0][1] - py) < 1e-6 ? 1 : 0;
        for (let i = startIdx; i < sampled.length; i++) pts.push(sampled[i]);
        const last = seg.points[seg.points.length - 1];
        px = last[0];
        py = last[1];
      }
    }
    return pts;
  }
}

/** Create a path builder for constructing 2D outlines. */
export function path(): PathBuilder {
  return new PathBuilder();
}

// ── Route-perimeter types & implementation ──────────────────────────────────

export interface PerimeterCircle {
  center: [number, number];
  radius: number;
}

export interface PerimeterFillet {
  fillet: number;
  /** When 'tangent', adds a tangent line from the previous circle (radial to the next circle) before the fillet. */
  approach?: 'tangent';
}

export type PerimeterStep = PerimeterCircle | PerimeterFillet;

function isCircle(s: PerimeterStep): s is PerimeterCircle {
  return 'radius' in s;
}

/**
 * Intersect two circles (c1, r1) and (c2, r2).
 * Returns the two intersection points, or throws if they don't intersect.
 * The first point is the one to the LEFT of the c1→c2 vector (CCW side).
 */
function circleCircleIntersect(
  c1x: number, c1y: number, r1: number,
  c2x: number, c2y: number, r2: number,
): [[number, number], [number, number]] {
  const dx = c2x - c1x;
  const dy = c2y - c1y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) throw new Error('routePerimeter: two circles have the same center');
  if (d > r1 + r2 + 1e-9) throw new Error(`routePerimeter: circles too far apart to intersect (d=${d.toFixed(3)}, r1+r2=${(r1 + r2).toFixed(3)})`);
  if (d < Math.abs(r1 - r2) - 1e-9) throw new Error('routePerimeter: one circle is inside the other');

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, hSq));

  // Unit vectors: along c1→c2 and perpendicular (left = CCW)
  const ux = dx / d;
  const uy = dy / d;
  const px = -uy; // left perpendicular
  const py = ux;

  const mx = c1x + a * ux;
  const my = c1y + a * uy;

  return [
    [mx + h * px, my + h * py], // left (CCW) candidate
    [mx - h * px, my - h * py], // right (CW) candidate
  ];
}

/**
 * Compute the signed angle (radians, CCW-positive) from angle `a` to angle `b`,
 * constrained to (0, 2π]. Used to walk CCW arcs on construction circles.
 */
function ccwSweep(fromRad: number, toRad: number): number {
  let sweep = toRad - fromRad;
  // Normalize to (0, 2π]
  while (sweep <= 1e-9) sweep += 2 * Math.PI;
  while (sweep > 2 * Math.PI + 1e-9) sweep -= 2 * Math.PI;
  return sweep;
}

/**
 * Route a smooth closed perimeter around a sequence of construction circles,
 * connected by tangent fillet arcs.
 *
 * Steps must alternate: circle, fillet, circle, fillet, ...
 * The sequence wraps — the last fillet connects back to the first circle.
 *
 * ```js
 * const outline = routePerimeter([
 *   { center: [0, 0], radius: 45 },
 *   { fillet: 5 },
 *   { center: polar(60, 60), radius: 18 },
 *   { fillet: 17 },
 *   { center: polar(60, 120), radius: 18 },
 *   { fillet: 5 },
 * ])
 * ```
 */
export function routePerimeter(steps: PerimeterStep[]): Sketch {
  if (steps.length < 4) throw new Error('routePerimeter: need at least 2 circles and 2 fillets');
  if (steps.length % 2 !== 0) throw new Error('routePerimeter: steps must alternate circle, fillet (even count)');

  // Separate circles and fillets
  const circles: PerimeterCircle[] = [];
  const filletSteps: PerimeterFillet[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (i % 2 === 0) {
      if (!isCircle(s)) throw new Error(`routePerimeter: step ${i} should be a circle, got fillet`);
      circles.push(s);
    } else {
      if (isCircle(s)) throw new Error(`routePerimeter: step ${i} should be a fillet, got circle`);
      filletSteps.push(s);
    }
  }

  const n = circles.length;

  // Per-connection data between circle[i] and circle[(i+1)%n]
  // Segments emitted between the circle arcs: line segments and/or fillet arcs
  type Segment =
    | { type: 'line'; to: [number, number] }
    | { type: 'fillet'; center: [number, number]; to: [number, number] };

  interface Connection {
    entryOnA: [number, number];
    exitOnB: [number, number];
    segments: Segment[];
  }
  const connections: Connection[] = [];

  // Helper: compute tangent-line + fillet connection.
  // The tangent line is tangent to cSmall and radial to cBig (passes through cBig center).
  // The fillet smooths the line-to-cBig junction.
  // Returns: tangent point T on cSmall, fillet center, line-fillet junction, fillet point on cBig.
  function tangentFilletGeometry(
    cSmall: PerimeterCircle, cBig: PerimeterCircle, rf: number, thetaSign: number,
  ) {
    const dx = cBig.center[0] - cSmall.center[0];
    const dy = cBig.center[1] - cSmall.center[1];
    const d = Math.hypot(dx, dy);
    if (d < cSmall.radius + 1e-9) throw new Error('routePerimeter: tangent approach requires non-overlapping circles');

    // Step 1: Fillet center via circle-circle intersection (externally tangent to BOTH circles).
    // This guarantees the fillet arc never enters either circle.
    // The "right" side is relative to the PERIMETER direction (cA→cB), not cSmall→cBig.
    const [left, right] = circleCircleIntersect(
      cSmall.center[0], cSmall.center[1], cSmall.radius + rf,
      cBig.center[0], cBig.center[1], cBig.radius + rf,
    );
    // When aIsSmaller, perimeter goes cSmall→cBig → right is correct.
    // When !aIsSmaller, perimeter goes cBig→cSmall → left of cSmall→cBig = right of cBig→cSmall.
    const fc = thetaSign < 0 ? right : left;

    // Step 2: Tangent point T on cSmall.
    // The tangent line passes through cBig center and is tangent to cSmall.
    const theta = Math.atan2(dy, dx);
    const alpha = Math.acos(Math.min(1, cSmall.radius / d));
    const tangentAngle = theta + thetaSign * alpha;
    const T: [number, number] = [
      cSmall.center[0] + cSmall.radius * Math.cos(tangentAngle),
      cSmall.center[1] + cSmall.radius * Math.sin(tangentAngle),
    ];

    // Step 3: Line-fillet junction = projection of fillet center onto the tangent line.
    const ldx = cBig.center[0] - T[0];
    const ldy = cBig.center[1] - T[1];
    const lLen = Math.hypot(ldx, ldy);
    const lux = ldx / lLen, luy = ldy / lLen;
    const t = (fc[0] - T[0]) * lux + (fc[1] - T[1]) * luy;
    const lineEnd: [number, number] = [T[0] + t * lux, T[1] + t * luy];

    // Step 4: Fillet tangent point on cBig (from cBig center toward fillet center).
    const Rb = cBig.radius;
    const fbX = fc[0] - cBig.center[0], fbY = fc[1] - cBig.center[1];
    const fbLen = Math.hypot(fbX, fbY);
    const filletOnBig: [number, number] = [cBig.center[0] + (fbX / fbLen) * Rb, cBig.center[1] + (fbY / fbLen) * Rb];

    return { T, lineEnd, filletCenter: fc, filletOnBig };
  }

  for (let i = 0; i < n; i++) {
    const cA = circles[i];
    const cB = circles[(i + 1) % n];
    const fStep = filletSteps[i];
    const rf = fStep.fillet;

    if (fStep.approach === 'tangent') {
      // Tangent line on the smaller circle, fillet at the larger circle.
      const aIsSmaller = cA.radius <= cB.radius;
      const cSmall = aIsSmaller ? cA : cB;
      const cBig = aIsSmaller ? cB : cA;

      // thetaSign: for CCW perimeter, right side of A→B = -1 when tangent is on cA, +1 when on cB
      const thetaSign = aIsSmaller ? -1 : 1;
      const { T, lineEnd, filletCenter, filletOnBig } = tangentFilletGeometry(cSmall, cBig, rf, thetaSign);

      if (aIsSmaller) {
        // Tangent on cA side: cA arc → line → fillet → cB arc
        // Path: entryOnA=T, line to lineEnd, fillet arc to filletOnBig=exitOnB
        connections.push({
          entryOnA: T,
          exitOnB: filletOnBig,
          segments: [
            { type: 'line', to: lineEnd },
            { type: 'fillet', center: filletCenter, to: filletOnBig },
          ],
        });
      } else {
        // Tangent on cB side: cA arc → fillet → line → cB arc
        // Path: entryOnA=filletOnBig (on cA=cBig), fillet arc to lineEnd, line to T=exitOnB
        connections.push({
          entryOnA: filletOnBig,
          exitOnB: T,
          segments: [
            { type: 'fillet', center: filletCenter, to: lineEnd },
            { type: 'line', to: T },
          ],
        });
      }
    } else {
      // ── Simple fillet: circle-circle intersection ──
      const [, right] = circleCircleIntersect(
        cA.center[0], cA.center[1], cA.radius + rf,
        cB.center[0], cB.center[1], cB.radius + rf,
      );
      const fc = right;

      const dxA = fc[0] - cA.center[0];
      const dyA = fc[1] - cA.center[1];
      const lenA = Math.hypot(dxA, dyA);
      const entryOnA: [number, number] = [cA.center[0] + (dxA / lenA) * cA.radius, cA.center[1] + (dyA / lenA) * cA.radius];

      const dxB = fc[0] - cB.center[0];
      const dyB = fc[1] - cB.center[1];
      const lenB = Math.hypot(dxB, dyB);
      const exitOnB: [number, number] = [cB.center[0] + (dxB / lenB) * cB.radius, cB.center[1] + (dyB / lenB) * cB.radius];

      connections.push({
        entryOnA, exitOnB,
        segments: [{ type: 'fillet', center: fc, to: exitOnB }],
      });
    }
  }

  // Centroid of all circle centers — used to determine exterior vs interior arcs
  let centroidX = 0, centroidY = 0;
  for (const c of circles) { centroidX += c.center[0]; centroidY += c.center[1]; }
  centroidX /= n; centroidY /= n;

  // Build the path: for each circle, arc from the previous connection's exit to this connection's entry,
  // then emit the connection (optional line + fillet arc).
  const p = new PathBuilder();
  const lastConn = connections[n - 1];
  p.moveTo(lastConn.exitOnB[0], lastConn.exitOnB[1]);

  for (let i = 0; i < n; i++) {
    const prevConn = connections[(i + n - 1) % n];
    const conn = connections[i];
    const circ = circles[i];

    // Arc along construction circle from prevConn.exitOnB to conn.entryOnA.
    // Choose CCW vs CW based on which arc midpoint is farther from the centroid (exterior).
    const fromAngle = Math.atan2(
      prevConn.exitOnB[1] - circ.center[1],
      prevConn.exitOnB[0] - circ.center[0],
    );
    const toAngle = Math.atan2(
      conn.entryOnA[1] - circ.center[1],
      conn.entryOnA[0] - circ.center[0],
    );
    const ccwSweepAngle = ccwSweep(fromAngle, toAngle);
    const cwSweepAngle = ccwSweepAngle - 2 * Math.PI;

    const ccwMidAngle = fromAngle + ccwSweepAngle / 2;
    const cwMidAngle = fromAngle + cwSweepAngle / 2;
    const ccwDist = Math.hypot(
      circ.center[0] + circ.radius * Math.cos(ccwMidAngle) - centroidX,
      circ.center[1] + circ.radius * Math.sin(ccwMidAngle) - centroidY,
    );
    const cwDist = Math.hypot(
      circ.center[0] + circ.radius * Math.cos(cwMidAngle) - centroidX,
      circ.center[1] + circ.radius * Math.sin(cwMidAngle) - centroidY,
    );
    const circSweepDeg = (cwDist > ccwDist ? cwSweepAngle : ccwSweepAngle) * (180 / Math.PI);

    if (Math.abs(circSweepDeg) > 0.01) {
      p.arcAround(circ.center[0], circ.center[1], circSweepDeg);
    }

    // Emit connection segments (lines and fillet arcs)
    for (const seg of conn.segments) {
      if (seg.type === 'line') {
        p.lineTo(seg.to[0], seg.to[1]);
      } else {
        // Fillet arc: always take the shorter arc (fillets are small roundings)
        const fFromAngle = Math.atan2(p.getY() - seg.center[1], p.getX() - seg.center[0]);
        const fToAngle = Math.atan2(seg.to[1] - seg.center[1], seg.to[0] - seg.center[0]);
        const ccwA = ccwSweep(fFromAngle, fToAngle);
        const cwA = ccwA - 2 * Math.PI;
        // Pick the shorter sweep
        const fSweepDeg = (Math.abs(cwA) < Math.abs(ccwA) ? cwA : ccwA) * (180 / Math.PI);
        if (Math.abs(fSweepDeg) > 0.01) {
          p.arcAround(seg.center[0], seg.center[1], fSweepDeg);
        }
      }
    }
  }

  return p.close();
}

/** Create a stroked polyline sketch from an array of 2D points. */
export function stroke(points: [number, number][], width: number, join: 'Round' | 'Square' = 'Square'): Sketch {
  const builder = new PathBuilder();
  builder.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) builder.lineTo(points[i][0], points[i][1]);
  return builder.stroke(width, join);
}

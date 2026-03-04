import { getWasm } from '../kernel';
import { difference2d, union2d } from './booleans';
import { Sketch } from './core';
import { stroke as strokePolyline } from './path';
import { polygon } from './primitives';

type Vec2 = [number, number];
type Mat2 = [number, number, number, number, number, number];

type FillRule = 'nonzero' | 'evenodd';
type StrokeJoin = 'miter' | 'round' | 'bevel';

type NormalizedRegionSelection = 'all' | 'largest';

export interface SvgImportOptions {
  /**
   * Which geometry channels to include:
   * - `auto`: prefer fills; if no fill geometry exists, fall back to strokes
   * - `fill`: import only filled regions
   * - `stroke`: import only stroke geometry
   * - `fill-and-stroke`: include both
   */
  include?: 'auto' | 'fill' | 'stroke' | 'fill-and-stroke';
  /** Keep all disconnected regions, or only the largest. */
  regionSelection?: 'all' | 'largest';
  /** Keep at most this many regions (largest-first). */
  maxRegions?: number;
  /** Drop regions below this absolute area threshold. */
  minRegionArea?: number;
  /** Drop regions below this ratio of largest-region area. */
  minRegionAreaRatio?: number;
  /**
   * Curve flattening tolerance in SVG user units.
   * Smaller = more segments, higher fidelity.
   */
  flattenTolerance?: number;
  /** Minimum segment count for arc discretization. */
  arcSegments?: number;
  /** Global scale applied after SVG parsing. */
  scale?: number;
  /**
   * Maximum imported sketch width.
   * If exceeded, geometry is uniformly downscaled to fit.
   */
  maxWidth?: number;
  /**
   * Maximum imported sketch height.
   * If exceeded, geometry is uniformly downscaled to fit.
   */
  maxHeight?: number;
  /** Simplification tolerance for final sketch cleanup. */
  simplify?: number;
  /**
   * Flip SVG Y-down coordinates to CAD Y-up.
   * Enabled by default.
   */
  invertY?: boolean;
}

interface NormalizedSvgImportOptions {
  include: 'auto' | 'fill' | 'stroke' | 'fill-and-stroke';
  regionSelection: NormalizedRegionSelection;
  maxRegions: number;
  minRegionArea: number;
  minRegionAreaRatio: number;
  flattenTolerance: number;
  arcSegments: number;
  scale: number;
  maxWidth: number;
  maxHeight: number;
  simplify: number;
  invertY: boolean;
}

interface SvgStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillRule: FillRule;
  strokeJoin: StrokeJoin;
  display: string;
  visibility: string;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
}

interface SvgContext {
  transform: Mat2;
  style: SvgStyle;
  hidden: boolean;
  inDefs: boolean;
}

interface SvgSubpath {
  points: Vec2[];
  closed: boolean;
}

interface SvgGeometryEntry {
  subpaths: SvgSubpath[];
  style: SvgStyle;
}

interface LoopInfo {
  points: Vec2[];
  area: number;
  absArea: number;
  sample: Vec2;
}

interface RegionInfo {
  sketch: Sketch;
  area: number;
}

const MIN_POINT_DIST = 1e-7;
const EPS = 1e-9;

const IDENTITY: Mat2 = [1, 0, 0, 1, 0, 0];

const DEFAULT_STYLE: SvgStyle = {
  fill: 'black',
  stroke: 'none',
  strokeWidth: 1,
  fillRule: 'nonzero',
  strokeJoin: 'miter',
  display: 'inline',
  visibility: 'visible',
  opacity: 1,
  fillOpacity: 1,
  strokeOpacity: 1,
};

const LENGTH_UNIT_SCALE: Record<string, number> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sqr(value: number): number {
  return value * value;
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function signedArea(points: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function centroidFallback(points: Vec2[]): Vec2 {
  if (points.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  return [sx / points.length, sy / points.length];
}

function polygonCentroid(points: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  let a2 = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    a2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a2) < EPS) return centroidFallback(points);
  const factor = 1 / (3 * a2);
  return [cx * factor, cy * factor];
}

function pointInPolygon(point: Vec2, polygonPoints: Vec2[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const [xi, yi] = polygonPoints[i];
    const [xj, yj] = polygonPoints[j];
    const intersects = ((yi > py) !== (yj > py))
      && (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-20) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function identityMatrix(): Mat2 {
  return [1, 0, 0, 1, 0, 0];
}

function multiplyMatrix(a: Mat2, b: Mat2): Mat2 {
  // Composition: apply b first, then a.
  const [a1, b1, c1, d1, e1, f1] = a;
  const [a2, b2, c2, d2, e2, f2] = b;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyMatrix(m: Mat2, p: Vec2): Vec2 {
  const [a, b, c, d, e, f] = m;
  const [x, y] = p;
  return [a * x + c * y + e, b * x + d * y + f];
}

function matrixTranslate(tx: number, ty: number): Mat2 {
  return [1, 0, 0, 1, tx, ty];
}

function matrixScale(sx: number, sy: number): Mat2 {
  return [sx, 0, 0, sy, 0, 0];
}

function matrixRotate(deg: number): Mat2 {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0];
}

function matrixSkewX(deg: number): Mat2 {
  const rad = (deg * Math.PI) / 180;
  return [1, 0, Math.tan(rad), 1, 0, 0];
}

function matrixSkewY(deg: number): Mat2 {
  const rad = (deg * Math.PI) / 180;
  return [1, Math.tan(rad), 0, 1, 0, 0];
}

function parseNumber(value: string | undefined): number {
  if (!value) return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function parseLength(value: string | undefined, fallback = NaN): number {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const match = trimmed.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)([a-z%]*)$/i);
  if (!match) return fallback;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw)) return fallback;
  const unit = match[2].toLowerCase();
  if (unit === '' || unit === 'px') return raw;
  if (unit === '%') return fallback;
  return raw * (LENGTH_UNIT_SCALE[unit] ?? 1);
}

function parseNumberList(value: string | undefined): number[] {
  if (!value) return [];
  const out: number[] = [];
  const re = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_match, token: string) => {
    switch (token) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return '\'';
      default:
        if (token.startsWith('#x') || token.startsWith('#X')) {
          const code = Number.parseInt(token.slice(2), 16);
          return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        }
        if (token.startsWith('#')) {
          const code = Number.parseInt(token.slice(1), 10);
          return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        }
        return '';
    }
  });
}

function parseAttributes(content: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([:@A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(content)) !== null) {
    const key = m[1];
    const rawValue = m[3] ?? m[4] ?? m[5] ?? '';
    attrs[key] = decodeXmlEntities(rawValue);
  }
  return attrs;
}

function parseStyleString(value: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value) return out;
  value.split(';').forEach((entry) => {
    const idx = entry.indexOf(':');
    if (idx < 0) return;
    const key = entry.slice(0, idx).trim().toLowerCase();
    const val = entry.slice(idx + 1).trim();
    if (key) out[key] = val;
  });
  return out;
}

function parseFillRule(value: string | undefined, fallback: FillRule): FillRule {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  return v === 'evenodd' ? 'evenodd' : 'nonzero';
}

function parseStrokeJoin(value: string | undefined, fallback: StrokeJoin): StrokeJoin {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'round' || v === 'bevel') return v;
  return 'miter';
}

function parseOpacity(value: string | undefined, fallback: number): number {
  const n = parseLength(value, NaN);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, 0, 1);
}

function normalizePaint(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  if (!v) return fallback;
  return v;
}

function mergeStyle(parent: SvgStyle, attrs: Record<string, string>): SvgStyle {
  const style: SvgStyle = { ...parent };
  const inline = parseStyleString(attrs.style);

  const pick = (name: string): string | undefined => inline[name] ?? attrs[name];

  style.fill = normalizePaint(pick('fill'), style.fill);
  style.stroke = normalizePaint(pick('stroke'), style.stroke);

  const strokeWidth = parseLength(pick('stroke-width'), NaN);
  if (Number.isFinite(strokeWidth) && strokeWidth >= 0) style.strokeWidth = strokeWidth;

  style.fillRule = parseFillRule(pick('fill-rule'), style.fillRule);
  style.strokeJoin = parseStrokeJoin(pick('stroke-linejoin'), style.strokeJoin);

  style.display = normalizePaint(pick('display'), style.display);
  style.visibility = normalizePaint(pick('visibility'), style.visibility);

  style.opacity = parseOpacity(pick('opacity'), style.opacity);
  style.fillOpacity = parseOpacity(pick('fill-opacity'), style.fillOpacity);
  style.strokeOpacity = parseOpacity(pick('stroke-opacity'), style.strokeOpacity);

  return style;
}

function parseTransform(value: string | undefined): Mat2 {
  if (!value) return identityMatrix();
  const text = value.trim();
  if (!text) return identityMatrix();

  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  let out = identityMatrix();
  while ((m = re.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    const args = parseNumberList(m[2]);
    let op = identityMatrix();
    if (name === 'matrix' && args.length >= 6) {
      op = [args[0], args[1], args[2], args[3], args[4], args[5]];
    } else if (name === 'translate' && args.length >= 1) {
      op = matrixTranslate(args[0], args.length >= 2 ? args[1] : 0);
    } else if (name === 'scale' && args.length >= 1) {
      op = matrixScale(args[0], args.length >= 2 ? args[1] : args[0]);
    } else if (name === 'rotate' && args.length >= 1) {
      if (args.length >= 3) {
        op = multiplyMatrix(
          matrixTranslate(args[1], args[2]),
          multiplyMatrix(matrixRotate(args[0]), matrixTranslate(-args[1], -args[2])),
        );
      } else {
        op = matrixRotate(args[0]);
      }
    } else if (name === 'skewx' && args.length >= 1) {
      op = matrixSkewX(args[0]);
    } else if (name === 'skewy' && args.length >= 1) {
      op = matrixSkewY(args[0]);
    }
    out = multiplyMatrix(op, out);
  }
  return out;
}

function pushPoint(points: Vec2[], p: Vec2): void {
  if (points.length === 0) {
    points.push([p[0], p[1]]);
    return;
  }
  const last = points[points.length - 1];
  if (dist(last, p) > MIN_POINT_DIST) {
    points.push([p[0], p[1]]);
  }
}

function removeDuplicateClosingPoint(points: Vec2[]): Vec2[] {
  if (points.length <= 1) return points;
  if (dist(points[0], points[points.length - 1]) <= MIN_POINT_DIST) {
    return points.slice(0, -1);
  }
  return points;
}

function sampleCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number): Vec2[] {
  const estimate = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
  const segments = clamp(Math.ceil(estimate / Math.max(tolerance, 1e-4)), 4, 512);
  const out: Vec2[] = [];
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const u = 1 - t;
    const x = u * u * u * p0[0]
      + 3 * u * u * t * p1[0]
      + 3 * u * t * t * p2[0]
      + t * t * t * p3[0];
    const y = u * u * u * p0[1]
      + 3 * u * u * t * p1[1]
      + 3 * u * t * t * p2[1]
      + t * t * t * p3[1];
    out.push([x, y]);
  }
  return out;
}

function sampleQuadratic(p0: Vec2, p1: Vec2, p2: Vec2, tolerance: number): Vec2[] {
  const estimate = dist(p0, p1) + dist(p1, p2);
  const segments = clamp(Math.ceil(estimate / Math.max(tolerance, 1e-4)), 4, 512);
  const out: Vec2[] = [];
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    out.push([x, y]);
  }
  return out;
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy;
  const det = ux * vy - uy * vx;
  return Math.atan2(det, dot);
}

function sampleArc(
  x1: number,
  y1: number,
  rxInput: number,
  ryInput: number,
  xAxisRotation: number,
  largeArcFlag: boolean,
  sweepFlag: boolean,
  x2: number,
  y2: number,
  tolerance: number,
  arcSegmentsMin: number,
): Vec2[] {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if (rx < EPS || ry < EPS) return [[x2, y2]];

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;

  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lambda = sqr(x1p) / sqr(rx) + sqr(y1p) / sqr(ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rx2 = sqr(rx);
  const ry2 = sqr(ry);
  const x1p2 = sqr(x1p);
  const y1p2 = sqr(y1p);

  let factorNum = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
  let factorDen = rx2 * y1p2 + ry2 * x1p2;
  if (factorDen < EPS) factorDen = EPS;
  factorNum = Math.max(0, factorNum);
  const factor = ((largeArcFlag === sweepFlag) ? -1 : 1) * Math.sqrt(factorNum / factorDen);

  const cxp = factor * ((rx * y1p) / ry);
  const cyp = factor * (-(ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  let theta1 = vectorAngle(1, 0, ux, uy);
  let deltaTheta = vectorAngle(ux, uy, vx, vy);
  if (!sweepFlag && deltaTheta > 0) deltaTheta -= Math.PI * 2;
  if (sweepFlag && deltaTheta < 0) deltaTheta += Math.PI * 2;

  const approxRadius = Math.max(rx, ry);
  const segments = Math.max(
    arcSegmentsMin,
    Math.ceil((Math.abs(deltaTheta) * approxRadius) / Math.max(tolerance, 1e-4)),
  );

  const out: Vec2[] = [];
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments;
    const theta = theta1 + deltaTheta * t;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const x = cosPhi * rx * cosTheta - sinPhi * ry * sinTheta + cx;
    const y = sinPhi * rx * cosTheta + cosPhi * ry * sinTheta + cy;
    out.push([x, y]);
  }
  return out;
}

function transformSubpaths(subpaths: SvgSubpath[], transform: Mat2): SvgSubpath[] {
  return subpaths.map((subpath) => {
    const points: Vec2[] = [];
    for (const point of subpath.points) {
      pushPoint(points, applyMatrix(transform, point));
    }
    return { points, closed: subpath.closed };
  });
}

function parsePathData(d: string, tolerance: number, arcSegments: number): SvgSubpath[] {
  const tokens = (d.match(/[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []);
  const out: SvgSubpath[] = [];

  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let current: SvgSubpath | null = null;
  let prevCubicCtrl: Vec2 | null = null;
  let prevQuadCtrl: Vec2 | null = null;

  const closeCurrent = (closed: boolean) => {
    if (!current) return;
    const cleaned = removeDuplicateClosingPoint(current.points);
    if (cleaned.length >= 2) {
      out.push({ points: cleaned, closed });
    }
    current = null;
  };

  const ensureCurrent = () => {
    if (current) return;
    current = { points: [[cx, cy]], closed: false };
  };

  const readNum = (): number | null => {
    if (i >= tokens.length) return null;
    const token = tokens[i];
    if (/^[AaCcHhLlMmQqSsTtVvZz]$/.test(token)) return null;
    i += 1;
    const n = Number(token);
    return Number.isFinite(n) ? n : null;
  };

  while (i < tokens.length) {
    if (/^[AaCcHhLlMmQqSsTtVvZz]$/.test(tokens[i])) {
      cmd = tokens[i];
      i += 1;
    } else if (!cmd) {
      i += 1;
      continue;
    }

    switch (cmd) {
      case 'M':
      case 'm': {
        let first = true;
        while (true) {
          const xRaw = readNum();
          const yRaw = readNum();
          if (xRaw == null || yRaw == null) break;
          const x = cmd === 'm' ? cx + xRaw : xRaw;
          const y = cmd === 'm' ? cy + yRaw : yRaw;
          if (first) {
            closeCurrent(false);
            current = { points: [[x, y]], closed: false };
            cx = x;
            cy = y;
            sx = x;
            sy = y;
            first = false;
          } else {
            ensureCurrent();
            pushPoint(current!.points, [x, y]);
            cx = x;
            cy = y;
          }
        }
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      case 'L':
      case 'l': {
        while (true) {
          const xRaw = readNum();
          const yRaw = readNum();
          if (xRaw == null || yRaw == null) break;
          const x = cmd === 'l' ? cx + xRaw : xRaw;
          const y = cmd === 'l' ? cy + yRaw : yRaw;
          ensureCurrent();
          pushPoint(current!.points, [x, y]);
          cx = x;
          cy = y;
        }
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      case 'H':
      case 'h': {
        while (true) {
          const xRaw = readNum();
          if (xRaw == null) break;
          const x = cmd === 'h' ? cx + xRaw : xRaw;
          ensureCurrent();
          pushPoint(current!.points, [x, cy]);
          cx = x;
        }
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      case 'V':
      case 'v': {
        while (true) {
          const yRaw = readNum();
          if (yRaw == null) break;
          const y = cmd === 'v' ? cy + yRaw : yRaw;
          ensureCurrent();
          pushPoint(current!.points, [cx, y]);
          cy = y;
        }
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      case 'C':
      case 'c': {
        while (true) {
          const x1Raw = readNum();
          const y1Raw = readNum();
          const x2Raw = readNum();
          const y2Raw = readNum();
          const xRaw = readNum();
          const yRaw = readNum();
          if (
            x1Raw == null || y1Raw == null
            || x2Raw == null || y2Raw == null
            || xRaw == null || yRaw == null
          ) break;
          const p0: Vec2 = [cx, cy];
          const p1: Vec2 = [cmd === 'c' ? cx + x1Raw : x1Raw, cmd === 'c' ? cy + y1Raw : y1Raw];
          const p2: Vec2 = [cmd === 'c' ? cx + x2Raw : x2Raw, cmd === 'c' ? cy + y2Raw : y2Raw];
          const p3: Vec2 = [cmd === 'c' ? cx + xRaw : xRaw, cmd === 'c' ? cy + yRaw : yRaw];
          ensureCurrent();
          sampleCubic(p0, p1, p2, p3, tolerance).forEach((pt) => pushPoint(current!.points, pt));
          cx = p3[0];
          cy = p3[1];
          prevCubicCtrl = p2;
          prevQuadCtrl = null;
        }
        break;
      }
      case 'S':
      case 's': {
        while (true) {
          const x2Raw = readNum();
          const y2Raw = readNum();
          const xRaw = readNum();
          const yRaw = readNum();
          if (x2Raw == null || y2Raw == null || xRaw == null || yRaw == null) break;
          const p0: Vec2 = [cx, cy];
          const p1: Vec2 = prevCubicCtrl
            ? [2 * cx - prevCubicCtrl[0], 2 * cy - prevCubicCtrl[1]]
            : [cx, cy];
          const p2: Vec2 = [cmd === 's' ? cx + x2Raw : x2Raw, cmd === 's' ? cy + y2Raw : y2Raw];
          const p3: Vec2 = [cmd === 's' ? cx + xRaw : xRaw, cmd === 's' ? cy + yRaw : yRaw];
          ensureCurrent();
          sampleCubic(p0, p1, p2, p3, tolerance).forEach((pt) => pushPoint(current!.points, pt));
          cx = p3[0];
          cy = p3[1];
          prevCubicCtrl = p2;
          prevQuadCtrl = null;
        }
        break;
      }
      case 'Q':
      case 'q': {
        while (true) {
          const x1Raw = readNum();
          const y1Raw = readNum();
          const xRaw = readNum();
          const yRaw = readNum();
          if (x1Raw == null || y1Raw == null || xRaw == null || yRaw == null) break;
          const p0: Vec2 = [cx, cy];
          const p1: Vec2 = [cmd === 'q' ? cx + x1Raw : x1Raw, cmd === 'q' ? cy + y1Raw : y1Raw];
          const p2: Vec2 = [cmd === 'q' ? cx + xRaw : xRaw, cmd === 'q' ? cy + yRaw : yRaw];
          ensureCurrent();
          sampleQuadratic(p0, p1, p2, tolerance).forEach((pt) => pushPoint(current!.points, pt));
          cx = p2[0];
          cy = p2[1];
          prevQuadCtrl = p1;
          prevCubicCtrl = null;
        }
        break;
      }
      case 'T':
      case 't': {
        while (true) {
          const xRaw = readNum();
          const yRaw = readNum();
          if (xRaw == null || yRaw == null) break;
          const p0: Vec2 = [cx, cy];
          const p1: Vec2 = prevQuadCtrl
            ? [2 * cx - prevQuadCtrl[0], 2 * cy - prevQuadCtrl[1]]
            : [cx, cy];
          const p2: Vec2 = [cmd === 't' ? cx + xRaw : xRaw, cmd === 't' ? cy + yRaw : yRaw];
          ensureCurrent();
          sampleQuadratic(p0, p1, p2, tolerance).forEach((pt) => pushPoint(current!.points, pt));
          cx = p2[0];
          cy = p2[1];
          prevQuadCtrl = p1;
          prevCubicCtrl = null;
        }
        break;
      }
      case 'A':
      case 'a': {
        while (true) {
          const rxRaw = readNum();
          const ryRaw = readNum();
          const rotRaw = readNum();
          const lafRaw = readNum();
          const sfRaw = readNum();
          const xRaw = readNum();
          const yRaw = readNum();
          if (
            rxRaw == null || ryRaw == null || rotRaw == null
            || lafRaw == null || sfRaw == null || xRaw == null || yRaw == null
          ) break;
          const x = cmd === 'a' ? cx + xRaw : xRaw;
          const y = cmd === 'a' ? cy + yRaw : yRaw;
          ensureCurrent();
          sampleArc(
            cx, cy, rxRaw, ryRaw, rotRaw,
            Math.abs(lafRaw) >= 0.5,
            Math.abs(sfRaw) >= 0.5,
            x, y,
            tolerance,
            arcSegments,
          ).forEach((pt) => pushPoint(current!.points, pt));
          cx = x;
          cy = y;
          prevCubicCtrl = null;
          prevQuadCtrl = null;
        }
        break;
      }
      case 'Z':
      case 'z': {
        if (current) {
          pushPoint(current.points, [sx, sy]);
        }
        closeCurrent(true);
        cx = sx;
        cy = sy;
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
      default: {
        prevCubicCtrl = null;
        prevQuadCtrl = null;
        break;
      }
    }
  }

  closeCurrent(false);
  return out;
}

function buildCircleSubpath(cx: number, cy: number, rx: number, ry: number, tolerance: number): SvgSubpath[] {
  if (!(rx > EPS) || !(ry > EPS)) return [];
  const circumference = 2 * Math.PI * Math.max(rx, ry);
  const segments = clamp(Math.ceil(circumference / Math.max(tolerance, 1e-4)), 16, 720);
  const points: Vec2[] = [];
  for (let i = 0; i < segments; i += 1) {
    const t = (2 * Math.PI * i) / segments;
    points.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return [{ points, closed: true }];
}

function appendArcSegment(
  points: Vec2[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startAngle: number,
  endAngle: number,
  tolerance: number,
): void {
  const span = Math.abs(endAngle - startAngle);
  const segments = clamp(Math.ceil((span * Math.max(rx, ry)) / Math.max(tolerance, 1e-4)), 2, 180);
  for (let i = 1; i <= segments; i += 1) {
    const t = startAngle + (span * i / segments) * Math.sign(endAngle - startAngle);
    pushPoint(points, [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
}

function buildRoundedRectSubpath(
  x: number,
  y: number,
  width: number,
  height: number,
  rxInput: number,
  ryInput: number,
  tolerance: number,
): SvgSubpath[] {
  const w = width;
  const h = height;
  if (!(w > EPS) || !(h > EPS)) return [];

  const rx = clamp(rxInput, 0, w / 2);
  const ry = clamp(ryInput, 0, h / 2);
  if (rx < EPS || ry < EPS) {
    return [{
      points: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      closed: true,
    }];
  }

  const points: Vec2[] = [];
  pushPoint(points, [x + rx, y]);
  pushPoint(points, [x + w - rx, y]);
  appendArcSegment(points, x + w - rx, y + ry, rx, ry, -Math.PI / 2, 0, tolerance);
  pushPoint(points, [x + w, y + h - ry]);
  appendArcSegment(points, x + w - rx, y + h - ry, rx, ry, 0, Math.PI / 2, tolerance);
  pushPoint(points, [x + rx, y + h]);
  appendArcSegment(points, x + rx, y + h - ry, rx, ry, Math.PI / 2, Math.PI, tolerance);
  pushPoint(points, [x, y + ry]);
  appendArcSegment(points, x + rx, y + ry, rx, ry, Math.PI, (3 * Math.PI) / 2, tolerance);
  return [{ points: removeDuplicateClosingPoint(points), closed: true }];
}

function parsePointsAttribute(pointsAttr: string | undefined): Vec2[] {
  const nums = parseNumberList(pointsAttr);
  const points: Vec2[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    points.push([nums[i], nums[i + 1]]);
  }
  return removeDuplicateClosingPoint(points);
}

function geometryFromElement(
  tag: string,
  attrs: Record<string, string>,
  tolerance: number,
  arcSegments: number,
): SvgSubpath[] {
  const t = tag.toLowerCase();
  if (t === 'path') {
    const d = attrs.d ?? '';
    if (!d.trim()) return [];
    return parsePathData(d, tolerance, arcSegments);
  }
  if (t === 'rect') {
    const x = parseLength(attrs.x, 0);
    const y = parseLength(attrs.y, 0);
    const width = parseLength(attrs.width, NaN);
    const height = parseLength(attrs.height, NaN);
    if (!(width > EPS) || !(height > EPS)) return [];
    let rx = parseLength(attrs.rx, NaN);
    let ry = parseLength(attrs.ry, NaN);
    if (!Number.isFinite(rx) && Number.isFinite(ry)) rx = ry;
    if (!Number.isFinite(ry) && Number.isFinite(rx)) ry = rx;
    if (!Number.isFinite(rx)) rx = 0;
    if (!Number.isFinite(ry)) ry = 0;
    return buildRoundedRectSubpath(x, y, width, height, rx, ry, tolerance);
  }
  if (t === 'circle') {
    const cx = parseLength(attrs.cx, 0);
    const cy = parseLength(attrs.cy, 0);
    const r = parseLength(attrs.r, NaN);
    if (!(r > EPS)) return [];
    return buildCircleSubpath(cx, cy, r, r, tolerance);
  }
  if (t === 'ellipse') {
    const cx = parseLength(attrs.cx, 0);
    const cy = parseLength(attrs.cy, 0);
    const rx = parseLength(attrs.rx, NaN);
    const ry = parseLength(attrs.ry, NaN);
    if (!(rx > EPS) || !(ry > EPS)) return [];
    return buildCircleSubpath(cx, cy, rx, ry, tolerance);
  }
  if (t === 'line') {
    const x1 = parseLength(attrs.x1, 0);
    const y1 = parseLength(attrs.y1, 0);
    const x2 = parseLength(attrs.x2, 0);
    const y2 = parseLength(attrs.y2, 0);
    return [{ points: [[x1, y1], [x2, y2]], closed: false }];
  }
  if (t === 'polyline') {
    const points = parsePointsAttribute(attrs.points);
    if (points.length < 2) return [];
    return [{ points, closed: false }];
  }
  if (t === 'polygon') {
    const points = parsePointsAttribute(attrs.points);
    if (points.length < 3) return [];
    return [{ points, closed: true }];
  }
  return [];
}

function sanitizeSubpaths(subpaths: SvgSubpath[]): SvgSubpath[] {
  const out: SvgSubpath[] = [];
  for (const subpath of subpaths) {
    const points = removeDuplicateClosingPoint(subpath.points);
    if (subpath.closed) {
      if (points.length >= 3 && Math.abs(signedArea(points)) > EPS) {
        out.push({ points, closed: true });
      }
    } else if (points.length >= 2) {
      out.push({ points, closed: false });
    }
  }
  return out;
}

function styleHasFill(style: SvgStyle): boolean {
  return style.fill !== 'none'
    && style.fill !== 'transparent'
    && style.opacity > EPS
    && style.fillOpacity > EPS;
}

function styleHasStroke(style: SvgStyle): boolean {
  return style.stroke !== 'none'
    && style.stroke !== 'transparent'
    && style.strokeWidth > EPS
    && style.opacity > EPS
    && style.strokeOpacity > EPS;
}

function loopInfosFromClosedSubpaths(subpaths: SvgSubpath[]): LoopInfo[] {
  const loops: LoopInfo[] = [];
  for (const subpath of subpaths) {
    if (!subpath.closed) continue;
    const points = removeDuplicateClosingPoint(subpath.points);
    if (points.length < 3) continue;
    const area = signedArea(points);
    const absArea = Math.abs(area);
    if (absArea <= EPS) continue;
    loops.push({
      points,
      area,
      absArea,
      sample: polygonCentroid(points),
    });
  }
  return loops;
}

function buildFilledSketch(subpaths: SvgSubpath[], fillRule: FillRule): Sketch | null {
  const loops = loopInfosFromClosedSubpaths(subpaths);
  if (loops.length === 0) return null;

  const adders: Sketch[] = [];
  const subtractors: Sketch[] = [];

  if (fillRule === 'evenodd') {
    const sorted = [...loops].sort((a, b) => a.absArea - b.absArea);
    for (const loop of sorted) {
      let depth = 0;
      for (const other of loops) {
        if (other === loop) continue;
        if (other.absArea <= loop.absArea + EPS) continue;
        if (pointInPolygon(loop.sample, other.points)) depth += 1;
      }
      const loopSketch = polygon(loop.points);
      if (depth % 2 === 0) adders.push(loopSketch);
      else subtractors.push(loopSketch);
    }
  } else {
    const dominant = [...loops].sort((a, b) => b.absArea - a.absArea)[0];
    const dominantSign = dominant.area >= 0 ? 1 : -1;
    for (const loop of loops) {
      const loopSketch = polygon(loop.points);
      const sign = loop.area >= 0 ? 1 : -1;
      if (sign === dominantSign) adders.push(loopSketch);
      else subtractors.push(loopSketch);
    }
  }

  if (adders.length === 0) {
    adders.push(polygon(loops[0].points));
  }

  let fillSketch = adders.length === 1 ? adders[0] : union2d(...adders);
  if (subtractors.length > 0) {
    fillSketch = difference2d(fillSketch, ...subtractors);
  }
  return fillSketch.isEmpty() ? null : fillSketch;
}

function strokeJoinToSketchJoin(join: StrokeJoin): 'Round' | 'Square' {
  return join === 'round' ? 'Round' : 'Square';
}

function buildClosedStroke(loopPoints: Vec2[], width: number, join: 'Round' | 'Square'): Sketch | null {
  const base = polygon(loopPoints);
  const outer = base.offset(width / 2, join);
  const inner = base.offset(-width / 2, join);
  if (inner.isEmpty()) return outer.isEmpty() ? null : outer;
  const ring = difference2d(outer, inner);
  return ring.isEmpty() ? null : ring;
}

function buildStrokeSketch(subpaths: SvgSubpath[], width: number, join: StrokeJoin): Sketch | null {
  if (!(width > EPS)) return null;
  const joinMode = strokeJoinToSketchJoin(join);
  const parts: Sketch[] = [];
  for (const subpath of subpaths) {
    const points = removeDuplicateClosingPoint(subpath.points);
    if (subpath.closed) {
      if (points.length < 3) continue;
      const ring = buildClosedStroke(points, width, joinMode);
      if (ring && !ring.isEmpty()) parts.push(ring);
    } else {
      if (points.length < 2) continue;
      const s = strokePolyline(points, width, joinMode);
      if (!s.isEmpty()) parts.push(s);
    }
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : union2d(...parts);
}

function buildRegionSketches(sketch: Sketch): RegionInfo[] {
  const rawLoops = sketch.toPolygons() as number[][][];
  const loops: LoopInfo[] = rawLoops
    .map((loop) => loop.map(([x, y]) => [x, y] as Vec2))
    .map((points) => removeDuplicateClosingPoint(points))
    .filter((points) => points.length >= 3)
    .map((points) => {
      const area = signedArea(points);
      return { points, area, absArea: Math.abs(area), sample: polygonCentroid(points) };
    })
    .filter((loop) => loop.absArea > EPS);

  if (loops.length === 0) return [];

  const outers = loops.filter((loop) => loop.area > 0);
  const holes = loops.filter((loop) => loop.area < 0);
  if (outers.length === 0) {
    const fallback = polygon(loops[0].points);
    return fallback.isEmpty() ? [] : [{ sketch: fallback, area: fallback.area() }];
  }

  const regions = outers.map((outer) => ({
    outer,
    holes: [] as LoopInfo[],
  }));

  for (const hole of holes) {
    const containers = regions
      .filter((region) => pointInPolygon(hole.sample, region.outer.points))
      .sort((a, b) => a.outer.absArea - b.outer.absArea);
    if (containers.length > 0) {
      containers[0].holes.push(hole);
    }
  }

  const built: RegionInfo[] = [];
  for (const region of regions) {
    let regionSketch = polygon(region.outer.points);
    if (region.holes.length > 0) {
      const holeSketches = region.holes.map((hole) => polygon(hole.points));
      regionSketch = difference2d(regionSketch, ...holeSketches);
    }
    if (!regionSketch.isEmpty()) {
      built.push({
        area: Math.abs(regionSketch.area()),
        sketch: regionSketch,
      });
    }
  }
  built.sort((a, b) => b.area - a.area);
  return built;
}

function filterRegions(sketch: Sketch, options: NormalizedSvgImportOptions): Sketch {
  const regions = buildRegionSketches(sketch);
  if (regions.length === 0) return sketch;

  const largestArea = regions[0].area;
  const minArea = Math.max(options.minRegionArea, largestArea * options.minRegionAreaRatio);

  let kept = regions.filter((region) => region.area + EPS >= minArea);
  if (kept.length === 0) kept = [regions[0]];

  if (options.regionSelection === 'largest') {
    kept = [kept[0]];
  }

  if (Number.isFinite(options.maxRegions)) {
    const limit = Math.max(1, Math.floor(options.maxRegions));
    kept = kept.slice(0, limit);
  }

  if (kept.length === 1) return kept[0].sketch;
  return union2d(...kept.map((region) => region.sketch));
}

function fitSketchToMaxDimensions(sketch: Sketch, options: NormalizedSvgImportOptions): Sketch {
  const constrainWidth = Number.isFinite(options.maxWidth);
  const constrainHeight = Number.isFinite(options.maxHeight);
  if (!constrainWidth && !constrainHeight) return sketch;

  const bounds = sketch.bounds();
  const min = bounds.min as ArrayLike<number>;
  const max = bounds.max as ArrayLike<number>;
  const width = Math.max(0, (max[0] ?? 0) - (min[0] ?? 0));
  const height = Math.max(0, (max[1] ?? 0) - (min[1] ?? 0));

  let fitScale = Number.POSITIVE_INFINITY;
  if (constrainWidth && width > EPS) {
    fitScale = Math.min(fitScale, options.maxWidth / width);
  }
  if (constrainHeight && height > EPS) {
    fitScale = Math.min(fitScale, options.maxHeight / height);
  }

  if (!Number.isFinite(fitScale) || fitScale <= 0 || fitScale >= (1 - EPS)) {
    return sketch;
  }
  return sketch.scale(fitScale);
}

function computeRootNormalizeMatrix(
  attrs: Record<string, string>,
  options: NormalizedSvgImportOptions,
): Mat2 {
  let matrix = identityMatrix();
  if (options.invertY) {
    const viewBox = parseNumberList(attrs.viewBox);
    const fallbackHeight = parseLength(attrs.height, NaN);
    const flipY = viewBox.length >= 4
      ? viewBox[1] + viewBox[3]
      : (Number.isFinite(fallbackHeight) ? fallbackHeight : 0);
    matrix = multiplyMatrix(matrixTranslate(0, flipY), matrixScale(1, -1));
  }
  if (Math.abs(options.scale - 1) > EPS) {
    matrix = multiplyMatrix(matrixScale(options.scale, options.scale), matrix);
  }
  return matrix;
}

const SHAPE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

function parseSvgGeometry(svgText: string, options: NormalizedSvgImportOptions): SvgGeometryEntry[] {
  const entries: SvgGeometryEntry[] = [];
  const stack: Array<{ tag: string; ctx: SvgContext }> = [{
    tag: '__root__',
    ctx: {
      transform: identityMatrix(),
      style: { ...DEFAULT_STYLE },
      hidden: false,
      inDefs: false,
    },
  }];

  let topLevelSvgSeen = false;
  const tagRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(svgText)) !== null) {
    const rawTag = match[0];
    if (rawTag.startsWith('<!--') || rawTag.startsWith('<?') || rawTag.startsWith('<!')) {
      continue;
    }

    const isClosing = rawTag.startsWith('</');
    if (isClosing) {
      const closeName = rawTag.slice(2, -1).trim().toLowerCase();
      while (stack.length > 1) {
        const top = stack.pop();
        if (!top || top.tag === closeName) break;
      }
      continue;
    }

    const selfClosing = rawTag.endsWith('/>');
    const body = rawTag.slice(1, rawTag.length - (selfClosing ? 2 : 1)).trim();
    if (!body) continue;

    const space = body.search(/\s/);
    const tag = (space < 0 ? body : body.slice(0, space)).toLowerCase();
    const attrText = space < 0 ? '' : body.slice(space + 1);
    const attrs = parseAttributes(attrText);

    const parent = stack[stack.length - 1].ctx;
    const mergedStyle = mergeStyle(parent.style, attrs);
    const localTransform = parseTransform(attrs.transform);
    let combinedTransform = multiplyMatrix(parent.transform, localTransform);

    if (!topLevelSvgSeen && tag === 'svg') {
      topLevelSvgSeen = true;
      combinedTransform = multiplyMatrix(computeRootNormalizeMatrix(attrs, options), combinedTransform);
    }

    const hidden = parent.hidden
      || mergedStyle.display === 'none'
      || mergedStyle.visibility === 'hidden'
      || mergedStyle.opacity <= EPS;

    const inDefs = parent.inDefs || tag === 'defs' || tag === 'symbol' || tag === 'clipPath' || tag === 'mask' || tag === 'pattern';

    const ctx: SvgContext = {
      transform: combinedTransform,
      style: mergedStyle,
      hidden,
      inDefs,
    };

    if (!ctx.hidden && !ctx.inDefs && SHAPE_TAGS.has(tag)) {
      const rawSubpaths = geometryFromElement(tag, attrs, options.flattenTolerance, options.arcSegments);
      const transformed = sanitizeSubpaths(transformSubpaths(rawSubpaths, ctx.transform));
      if (transformed.length > 0) {
        entries.push({
          subpaths: transformed,
          style: { ...ctx.style },
        });
      }
    }

    if (!selfClosing) {
      stack.push({ tag, ctx });
    }
  }

  return entries;
}

function normalizeSvgImportOptions(options: SvgImportOptions = {}): NormalizedSvgImportOptions {
  const include = options.include ?? 'auto';
  const regionSelection = options.regionSelection ?? 'all';
  const flattenTolerance = Number.isFinite(options.flattenTolerance)
    ? Math.max(0.01, options.flattenTolerance as number)
    : 0.35;
  const arcSegments = Number.isFinite(options.arcSegments)
    ? Math.max(2, Math.floor(options.arcSegments as number))
    : 12;
  const maxRegions = Number.isFinite(options.maxRegions)
    ? Math.max(1, Math.floor(options.maxRegions as number))
    : Number.POSITIVE_INFINITY;
  const minRegionArea = Number.isFinite(options.minRegionArea)
    ? Math.max(0, options.minRegionArea as number)
    : 0;
  const minRegionAreaRatio = Number.isFinite(options.minRegionAreaRatio)
    ? Math.max(0, options.minRegionAreaRatio as number)
    : 0;
  const scale = Number.isFinite(options.scale)
    ? Math.max(1e-6, options.scale as number)
    : 1;
  const maxWidth = Number.isFinite(options.maxWidth)
    ? Math.max(1e-6, options.maxWidth as number)
    : Number.POSITIVE_INFINITY;
  const maxHeight = Number.isFinite(options.maxHeight)
    ? Math.max(1e-6, options.maxHeight as number)
    : Number.POSITIVE_INFINITY;
  const simplify = Number.isFinite(options.simplify)
    ? Math.max(0, options.simplify as number)
    : 1e-5;
  const invertY = options.invertY ?? true;

  return {
    include,
    regionSelection,
    maxRegions,
    minRegionArea,
    minRegionAreaRatio,
    flattenTolerance,
    arcSegments,
    scale,
    maxWidth,
    maxHeight,
    simplify,
    invertY,
  };
}

function validateSvgImportOptions(options: SvgImportOptions = {}): void {
  const checkNumber = (value: unknown, name: string, allowZero = true) => {
    if (value == null) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`SVG import option "${name}" must be a finite number`);
    }
    if (!allowZero && value <= 0) {
      throw new Error(`SVG import option "${name}" must be > 0`);
    }
  };

  if (options.include != null && !['auto', 'fill', 'stroke', 'fill-and-stroke'].includes(options.include)) {
    throw new Error('SVG import option "include" must be one of: auto, fill, stroke, fill-and-stroke');
  }
  if (options.regionSelection != null && !['all', 'largest'].includes(options.regionSelection)) {
    throw new Error('SVG import option "regionSelection" must be one of: all, largest');
  }
  checkNumber(options.maxRegions, 'maxRegions');
  checkNumber(options.minRegionArea, 'minRegionArea');
  checkNumber(options.minRegionAreaRatio, 'minRegionAreaRatio');
  checkNumber(options.flattenTolerance, 'flattenTolerance', false);
  checkNumber(options.arcSegments, 'arcSegments', false);
  checkNumber(options.scale, 'scale', false);
  checkNumber(options.maxWidth, 'maxWidth', false);
  checkNumber(options.maxHeight, 'maxHeight', false);
  checkNumber(options.simplify, 'simplify');
  if (options.invertY != null && typeof options.invertY !== 'boolean') {
    throw new Error('SVG import option "invertY" must be a boolean');
  }
}

function pickChannels(
  fillSketches: Sketch[],
  strokeSketches: Sketch[],
  mode: NormalizedSvgImportOptions['include'],
): Sketch[] {
  if (mode === 'fill') return fillSketches;
  if (mode === 'stroke') return strokeSketches;
  if (mode === 'fill-and-stroke') return [...fillSketches, ...strokeSketches];
  if (fillSketches.length > 0) return fillSketches;
  return strokeSketches;
}

export function sketchFromSvg(svgText: string, options: SvgImportOptions = {}): Sketch {
  if (typeof svgText !== 'string' || svgText.trim().length === 0) {
    throw new Error('SVG import requires non-empty SVG content');
  }
  if (!/<svg[\s>]/i.test(svgText)) {
    throw new Error('SVG import expects content containing an <svg> root element');
  }

  validateSvgImportOptions(options);
  const normalized = normalizeSvgImportOptions(options);
  const entries = parseSvgGeometry(svgText, normalized);
  if (entries.length === 0) {
    throw new Error('SVG import produced no supported shape geometry');
  }

  const fillSketches: Sketch[] = [];
  const strokeSketches: Sketch[] = [];

  for (const entry of entries) {
    if (styleHasFill(entry.style)) {
      const fill = buildFilledSketch(entry.subpaths, entry.style.fillRule);
      if (fill && !fill.isEmpty()) fillSketches.push(fill);
    }
    if (styleHasStroke(entry.style)) {
      const stroke = buildStrokeSketch(entry.subpaths, entry.style.strokeWidth, entry.style.strokeJoin);
      if (stroke && !stroke.isEmpty()) strokeSketches.push(stroke);
    }
  }

  const selected = pickChannels(fillSketches, strokeSketches, normalized.include);
  if (selected.length === 0) {
    throw new Error('SVG import found no fill/stroke geometry after style filtering');
  }

  let sketch = selected.length === 1 ? selected[0] : union2d(...selected);
  sketch = filterRegions(sketch, normalized);
  sketch = fitSketchToMaxDimensions(sketch, normalized);
  if (normalized.simplify > 0) {
    sketch = sketch.simplify(normalized.simplify);
  }
  if (sketch.isEmpty()) {
    throw new Error('SVG import generated an empty sketch');
  }
  return sketch;
}

export function sketchFromSvgLoops(loops: Vec2[][]): Sketch {
  if (!Array.isArray(loops) || loops.length === 0) {
    throw new Error('sketchFromSvgLoops requires at least one loop');
  }
  const validLoops = loops
    .map((loop) => removeDuplicateClosingPoint(loop))
    .filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) > EPS);
  if (validLoops.length === 0) {
    throw new Error('sketchFromSvgLoops did not receive any valid non-degenerate loops');
  }
  return new Sketch(new (getWasm().CrossSection)(validLoops as any));
}

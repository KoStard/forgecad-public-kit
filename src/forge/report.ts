import type { Shape } from './kernel';
import { shapeToGeometry } from './meshToGeometry';
import type { RunResult, SceneObject } from './runner';
import type { DimensionDef } from './sketch/dimensions';

export type ReportViewId = 'front' | 'right' | 'top' | 'iso';

export interface ReportObjectVisual {
  visible?: boolean;
  color?: string;
  opacity?: number;
}

export interface ReportOptions {
  title?: string;
  views?: ReportViewId[];
  includeDisassembled?: boolean;
  objectVisuals?: Record<string, ReportObjectVisual>;
  /**
   * Max angular difference (degrees) from nearest projected view axis
   * for a dimension to be included in that view.
   */
  dimensionDirectionToleranceDeg?: number;
  generatedAt?: Date;
}

export interface ReportGenerationResult {
  pdf: Uint8Array;
  pageCount: number;
  componentCount: number;
  viewCount: number;
}

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Segment2 = { a: Vec2; b: Vec2 };

type Bounds2 = { minX: number; minY: number; maxX: number; maxY: number };
type Bounds3 = { min: Vec3; max: Vec3 };
type ColorRgb = [number, number, number];

interface ProjectedEdge {
  modelA: Vec2;
  modelB: Vec2;
  mid: Vec2;
  lenModel: number;
}

interface ReportTriangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  normal: Vec3;
}

interface ReportEdge {
  a: Vec3;
  b: Vec3;
}

interface ReportObject {
  id: string;
  name: string;
  groupName?: string;
  bbox: Bounds3;
  color: ColorRgb;
  opacity: number;
  triangles: ReportTriangle[];
  edges: ReportEdge[];
}

interface ViewFrame {
  id: ReportViewId;
  label: string;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

interface ViewProjection {
  x: number;
  y: number;
  depth: number;
}

interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface StandardPageSpec {
  kind: 'standard';
  title: string;
  subtitle: string;
  objects: ReportObject[];
  dimensions: DimensionDef[];
}

interface DetailPageSpec {
  kind: 'detail';
  title: string;
  subtitle: string;
  objects: ReportObject[];
  dimensions: DimensionDef[];
  view: ViewFrame;
  source: Bounds2;
}

type PageSpec = StandardPageSpec | DetailPageSpec;

interface DimensionOwnership {
  byId: Map<string, string[]>;
  combined: DimensionDef[];
  byComponent: Map<string, DimensionDef[]>;
}

const DEFAULT_VIEWS: ReportViewId[] = ['front', 'right', 'top', 'iso'];
const DEFAULT_COLOR_HEX = '#5b9bd5';
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PAGE_MARGIN = 36;
const HEADER_HEIGHT = 44;
const CELL_GAP = 14;
const CELL_PADDING = 14;
const DEFAULT_DIM_DIRECTION_TOLERANCE_DEG = 60;
const MAX_FILL_TRIANGLES_PER_OBJECT = 12000;
const MAX_EDGE_SEGMENTS_PER_OBJECT = 45000;

const encoder = new TextEncoder();

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function bboxCenter(b: Bounds3): Vec3 {
  return [
    (b.min[0] + b.max[0]) * 0.5,
    (b.min[1] + b.max[1]) * 0.5,
    (b.min[2] + b.max[2]) * 0.5,
  ];
}

function mergeBounds3(bounds: Bounds3[]): Bounds3 | null {
  if (bounds.length === 0) return null;
  const out: Bounds3 = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  bounds.forEach((b) => {
    out.min[0] = Math.min(out.min[0], b.min[0]);
    out.min[1] = Math.min(out.min[1], b.min[1]);
    out.min[2] = Math.min(out.min[2], b.min[2]);
    out.max[0] = Math.max(out.max[0], b.max[0]);
    out.max[1] = Math.max(out.max[1], b.max[1]);
    out.max[2] = Math.max(out.max[2], b.max[2]);
  });
  return out;
}

function bboxCorners(bounds: Bounds3): Vec3[] {
  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  return [
    [x0, y0, z0], [x1, y0, z0], [x0, y1, z0], [x1, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x0, y1, z1], [x1, y1, z1],
  ];
}

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(3);
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normalizeToleranceDeg(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_DIM_DIRECTION_TOLERANCE_DEG;
  return clamp(v, 0, 90);
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function hexToRgb01(hex: string | undefined): ColorRgb {
  const input = (hex || DEFAULT_COLOR_HEX).trim();
  const m = input.match(/^#?([0-9a-f]{6})$/i);
  if (!m) {
    return [0x5b / 255, 0x9b / 255, 0xd5 / 255];
  }
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return [r / 255, g / 255, b / 255];
}

function makeViewFrame(view: ReportViewId): ViewFrame {
  const cfg: Record<ReportViewId, { label: string; camDir: Vec3; up: Vec3 }> = {
    front: { label: 'Front', camDir: [0, -1, 0], up: [0, 0, 1] },
    right: { label: 'Right', camDir: [1, 0, 0], up: [0, 0, 1] },
    top: { label: 'Top', camDir: [0, 0, 1], up: [0, 1, 0] },
    iso: { label: 'Isometric', camDir: [1, -1, 1], up: [0, 0, 1] },
  };

  const c = cfg[view];
  const forward = norm(mul3(c.camDir, -1));
  const right = norm(cross3(forward, c.up));
  const up = norm(cross3(right, forward));

  return { id: view, label: c.label, right, up, forward };
}

function projectPoint(point: Vec3, center: Vec3, frame: ViewFrame): ViewProjection {
  const rel = sub3(point, center);
  return {
    x: dot3(rel, frame.right),
    y: dot3(rel, frame.up),
    depth: dot3(rel, frame.forward),
  };
}

function pointInBounds(point: Vec3, bounds: Bounds3, tolerance: number): boolean {
  return point[0] >= bounds.min[0] - tolerance && point[0] <= bounds.max[0] + tolerance
    && point[1] >= bounds.min[1] - tolerance && point[1] <= bounds.max[1] + tolerance
    && point[2] >= bounds.min[2] - tolerance && point[2] <= bounds.max[2] + tolerance;
}

function isDimensionVisibleInView(
  dim: DimensionDef,
  frame: ViewFrame,
  toleranceDeg: number,
): boolean {
  const dir = sub3(dim.to, dim.from);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-9) return false;

  const d = [dir[0] / len, dir[1] / len, dir[2] / len] as Vec3;
  const alignRight = clamp(Math.abs(dot3(d, frame.right)), 0, 1);
  const alignUp = clamp(Math.abs(dot3(d, frame.up)), 0, 1);
  const angleRight = Math.acos(alignRight) * 180 / Math.PI;
  const angleUp = Math.acos(alignUp) * 180 / Math.PI;
  const minAngle = Math.min(angleRight, angleUp);
  return minAngle <= toleranceDeg;
}

function collectShapeTriangles(shape: Shape): ReportTriangle[] {
  const mesh = shape.getMesh();
  const triCount = mesh.numTri;
  if (triCount <= 0 || triCount > MAX_FILL_TRIANGLES_PER_OBJECT) return [];

  const tris: ReportTriangle[] = [];
  const numProp = mesh.numProp;
  for (let t = 0; t < triCount; t += 1) {
    const i0 = mesh.triVerts[t * 3];
    const i1 = mesh.triVerts[t * 3 + 1];
    const i2 = mesh.triVerts[t * 3 + 2];

    const a: Vec3 = [
      mesh.vertProperties[i0 * numProp],
      mesh.vertProperties[i0 * numProp + 1],
      mesh.vertProperties[i0 * numProp + 2],
    ];
    const b: Vec3 = [
      mesh.vertProperties[i1 * numProp],
      mesh.vertProperties[i1 * numProp + 1],
      mesh.vertProperties[i1 * numProp + 2],
    ];
    const c: Vec3 = [
      mesh.vertProperties[i2 * numProp],
      mesh.vertProperties[i2 * numProp + 1],
      mesh.vertProperties[i2 * numProp + 2],
    ];

    const n = norm(cross3(sub3(b, a), sub3(c, a)));
    tris.push({ a, b, c, normal: n });
  }
  return tris;
}

function collectShapeEdges(shape: Shape): ReportEdge[] {
  const { solid, edges: edgesGeo } = shapeToGeometry(shape);
  const attr = edgesGeo.getAttribute('position');
  const count = Math.floor(attr.count / 2);
  const stride = count > MAX_EDGE_SEGMENTS_PER_OBJECT ? Math.ceil(count / MAX_EDGE_SEGMENTS_PER_OBJECT) : 1;

  const edges: ReportEdge[] = [];
  for (let i = 0; i < count; i += stride) {
    const i0 = i * 2;
    const i1 = i0 + 1;
    const a: Vec3 = [attr.getX(i0), attr.getY(i0), attr.getZ(i0)];
    const b: Vec3 = [attr.getX(i1), attr.getY(i1), attr.getZ(i1)];
    edges.push({ a, b });
  }

  edgesGeo.dispose();
  solid.dispose();
  return edges;
}

function collectReportObjects(
  objects: SceneObject[],
  visuals: Record<string, ReportObjectVisual> | undefined,
): ReportObject[] {
  const out: ReportObject[] = [];

  for (const obj of objects) {
    if (!obj.shape) continue;

    const visual = visuals?.[obj.id];
    if (visual?.visible === false) continue;

    const bb = obj.shape.boundingBox();
    const bbox: Bounds3 = {
      min: [bb.min[0], bb.min[1], bb.min[2]],
      max: [bb.max[0], bb.max[1], bb.max[2]],
    };

    const triangles = collectShapeTriangles(obj.shape);
    const edges = collectShapeEdges(obj.shape);
    const opacity = clamp(visual?.opacity ?? 1, 0.08, 1);
    const baseColor = hexToRgb01(visual?.color || obj.color || DEFAULT_COLOR_HEX);
    const color: ColorRgb = [
      1 - (1 - baseColor[0]) * opacity,
      1 - (1 - baseColor[1]) * opacity,
      1 - (1 - baseColor[2]) * opacity,
    ];

    out.push({
      id: obj.id,
      name: obj.name,
      groupName: obj.groupName,
      bbox,
      color,
      opacity,
      triangles,
      edges,
    });
  }

  return out;
}

function mapDimensionsToOwners(
  dimensions: DimensionDef[],
  objects: ReportObject[],
): Map<string, string[]> {
  const byName = new Map<string, ReportObject[]>();
  objects.forEach((obj) => {
    const list = byName.get(obj.name) || [];
    list.push(obj);
    byName.set(obj.name, list);
  });

  const out = new Map<string, string[]>();

  for (const dim of dimensions) {
    const explicitNames = dim.components ?? [];
    if (explicitNames.length > 0) {
      const ids = Array.from(new Set(explicitNames.flatMap((name) => {
        const hit = byName.get(name);
        if (!hit || hit.length !== 1) return [];
        return [hit[0].id];
      })));
      out.set(dim.id, ids);
      continue;
    }

    const tolerance = 1e-3;
    const candidates = objects
      .filter((obj) => pointInBounds(dim.from, obj.bbox, tolerance) && pointInBounds(dim.to, obj.bbox, tolerance))
      .map((obj) => obj.id);

    out.set(dim.id, candidates.length === 1 ? candidates : []);
  }

  return out;
}

function buildDimensionOwnership(
  dimensions: DimensionDef[],
  objects: ReportObject[],
): DimensionOwnership {
  const byId = mapDimensionsToOwners(dimensions, objects);
  const combined: DimensionDef[] = [];
  const byComponent = new Map<string, DimensionDef[]>();
  objects.forEach((obj) => byComponent.set(obj.id, []));

  dimensions.forEach((dim) => {
    const owners = byId.get(dim.id) || [];
    if (owners.length === 1) {
      const list = byComponent.get(owners[0]);
      if (list) list.push(dim);
      else combined.push(dim);
      return;
    }
    combined.push(dim);
  });

  return { byId, combined, byComponent };
}

function projectedBounds(
  center: Vec3,
  frame: ViewFrame,
  objects: ReportObject[],
  dimensions: DimensionDef[],
): Bounds2 {
  const bounds: Bounds2 = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const include = (p: Vec3) => {
    const pr = projectPoint(p, center, frame);
    bounds.minX = Math.min(bounds.minX, pr.x);
    bounds.minY = Math.min(bounds.minY, pr.y);
    bounds.maxX = Math.max(bounds.maxX, pr.x);
    bounds.maxY = Math.max(bounds.maxY, pr.y);
  };

  objects.forEach((obj) => {
    bboxCorners(obj.bbox).forEach(include);
  });

  dimensions.forEach((d) => {
    include(d.from);
    include(d.to);
  });

  if (!Number.isFinite(bounds.minX)) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  }

  if (Math.abs(bounds.maxX - bounds.minX) < 1e-6) {
    bounds.minX -= 1;
    bounds.maxX += 1;
  }
  if (Math.abs(bounds.maxY - bounds.minY) < 1e-6) {
    bounds.minY -= 1;
    bounds.maxY += 1;
  }

  return bounds;
}

function scaleBounds2(bounds: Bounds2, factor: number): Bounds2 {
  if (!Number.isFinite(factor) || factor <= 1) return bounds;
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const hx = (bounds.maxX - bounds.minX) * 0.5 * factor;
  const hy = (bounds.maxY - bounds.minY) * 0.5 * factor;
  return {
    minX: cx - hx,
    minY: cy - hy,
    maxX: cx + hx,
    maxY: cy + hy,
  };
}

function clampBounds2(bounds: Bounds2, limit: Bounds2): Bounds2 {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const cx = clamp((bounds.minX + bounds.maxX) * 0.5, limit.minX + spanX * 0.5, limit.maxX - spanX * 0.5);
  const cy = clamp((bounds.minY + bounds.maxY) * 0.5, limit.minY + spanY * 0.5, limit.maxY - spanY * 0.5);
  return {
    minX: cx - spanX * 0.5,
    maxX: cx + spanX * 0.5,
    minY: cy - spanY * 0.5,
    maxY: cy + spanY * 0.5,
  };
}

function boundsCenter2(b: Bounds2): Vec2 {
  return [(b.minX + b.maxX) * 0.5, (b.minY + b.maxY) * 0.5];
}

function makeCellMapper(bounds: Bounds2, cell: CellRect): { map: (p: Vec2) => Vec2; scale: number } {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const scale = Math.min((cell.w - CELL_PADDING * 2) / spanX, (cell.h - CELL_PADDING * 2) / spanY);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const ox = cell.x + cell.w * 0.5;
  const oy = cell.y + cell.h * 0.5;

  return {
    map: ([x, y]) => [ox + (x - cx) * scale, oy + (y - cy) * scale],
    scale,
  };
}

function commandSetFill(color: ColorRgb): string {
  return `${formatNumber(color[0])} ${formatNumber(color[1])} ${formatNumber(color[2])} rg\n`;
}

function commandSetStroke(color: ColorRgb): string {
  return `${formatNumber(color[0])} ${formatNumber(color[1])} ${formatNumber(color[2])} RG\n`;
}

function commandText(text: string, x: number, y: number, size: number): string {
  return `BT /F1 ${formatNumber(size)} Tf 1 0 0 1 ${formatNumber(x)} ${formatNumber(y)} Tm (${escapePdfText(text)}) Tj ET\n`;
}

function commandLine(a: Vec2, b: Vec2): string {
  return `${formatNumber(a[0])} ${formatNumber(a[1])} m ${formatNumber(b[0])} ${formatNumber(b[1])} l S\n`;
}

function commandTriangleFill(a: Vec2, b: Vec2, c: Vec2): string {
  return `${formatNumber(a[0])} ${formatNumber(a[1])} m ${formatNumber(b[0])} ${formatNumber(b[1])} l ${formatNumber(c[0])} ${formatNumber(c[1])} l h f\n`;
}

function buildGridCells(viewCount: number): CellRect[] {
  const cols = viewCount === 1 ? 1 : 2;
  const rows = Math.ceil(viewCount / cols);
  const contentWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const contentHeight = PAGE_HEIGHT - PAGE_MARGIN * 2 - HEADER_HEIGHT;
  const totalGapX = CELL_GAP * Math.max(0, cols - 1);
  const totalGapY = CELL_GAP * Math.max(0, rows - 1);
  const cellW = (contentWidth - totalGapX) / cols;
  const cellH = (contentHeight - totalGapY) / rows;

  const topY = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT;

  const out: CellRect[] = [];
  for (let i = 0; i < viewCount; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = PAGE_MARGIN + col * (cellW + CELL_GAP);
    const y = topY - (row + 1) * cellH - row * CELL_GAP;
    out.push({ x, y, w: cellW, h: cellH });
  }
  return out;
}

function makeMapperForRect(bounds: Bounds2, rect: CellRect, padding = CELL_PADDING): { map: (p: Vec2) => Vec2; scale: number } {
  const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
  const scale = Math.min((rect.w - padding * 2) / spanX, (rect.h - padding * 2) / spanY);
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const ox = rect.x + rect.w * 0.5;
  const oy = rect.y + rect.h * 0.5;
  return {
    map: ([x, y]) => [ox + (x - cx) * scale, oy + (y - cy) * scale],
    scale,
  };
}

interface DetailRegion {
  label: string;
  source: Bounds2;
  edges: ProjectedEdge[];
}

function collectProjectedEdges(
  frame: ViewFrame,
  center: Vec3,
  objects: ReportObject[],
): ProjectedEdge[] {
  const out: ProjectedEdge[] = [];
  objects.forEach((obj) => {
    obj.edges.forEach((edge) => {
      const a = projectPoint(edge.a, center, frame);
      const b = projectPoint(edge.b, center, frame);
      const modelA: Vec2 = [a.x, a.y];
      const modelB: Vec2 = [b.x, b.y];
      out.push({
        modelA,
        modelB,
        mid: [(modelA[0] + modelB[0]) * 0.5, (modelA[1] + modelB[1]) * 0.5],
        lenModel: Math.hypot(modelB[0] - modelA[0], modelB[1] - modelA[1]),
      });
    });
  });
  return out;
}

function selectDetailRegions(
  projectedEdges: ProjectedEdge[],
  modelBounds: Bounds2,
): DetailRegion[] {
  const spanX = modelBounds.maxX - modelBounds.minX;
  const spanY = modelBounds.maxY - modelBounds.minY;
  const majorIsX = spanX >= spanY;
  const longSpan = Math.max(spanX, spanY);
  const shortSpan = Math.max(1e-6, Math.min(spanX, spanY));
  const aspect = longSpan / shortSpan;

  if (aspect < 2.8) return [];
  if (projectedEdges.length < 90 || projectedEdges.length > 14000) return [];

  const gridMajor = 14;
  const gridMinor = 6;
  const bins = Array.from({ length: gridMajor * gridMinor }, () => ({
    score: 0,
    count: 0,
    major: 0,
    minor: 0,
  }));

  const normMajor = (p: Vec2): number => {
    if (majorIsX) return clamp((p[0] - modelBounds.minX) / Math.max(1e-6, spanX), 0, 1);
    return clamp((p[1] - modelBounds.minY) / Math.max(1e-6, spanY), 0, 1);
  };
  const normMinor = (p: Vec2): number => {
    if (majorIsX) return clamp((p[1] - modelBounds.minY) / Math.max(1e-6, spanY), 0, 1);
    return clamp((p[0] - modelBounds.minX) / Math.max(1e-6, spanX), 0, 1);
  };

  projectedEdges.forEach((edge) => {
    const u = normMajor(edge.mid);
    const v = normMinor(edge.mid);
    const iMaj = Math.min(gridMajor - 1, Math.floor(u * gridMajor));
    const iMin = Math.min(gridMinor - 1, Math.floor(v * gridMinor));
    const idx = iMin * gridMajor + iMaj;
    const bin = bins[idx];
    const shortBoost = edge.lenModel < longSpan * 0.03 ? 1.7 : 0;
    bin.score += 1 + shortBoost;
    bin.count += 1;
    bin.major = iMaj;
    bin.minor = iMin;
  });

  const denseBins = bins
    .filter((b) => b.count >= 6)
    .sort((a, b) => b.score - a.score);

  if (denseBins.length === 0) return [];

  const picked: Array<{ major: number; minor: number; score: number }> = [];
  for (const bin of denseBins) {
    const tooClose = picked.some((p) => Math.abs(p.major - bin.major) <= 2 && Math.abs(p.minor - bin.minor) <= 1);
    if (tooClose) continue;
    picked.push({ major: bin.major, minor: bin.minor, score: bin.score });
    if (picked.length >= 2) break;
  }
  if (picked.length === 0) return [];

  const regions: DetailRegion[] = [];
  const detailLabels = ['Detail A', 'Detail B'];
  for (let i = 0; i < Math.min(picked.length, 2); i += 1) {
    const pick = picked[i];
    const u = (pick.major + 0.5) / gridMajor;
    const v = (pick.minor + 0.5) / gridMinor;
    const cx = majorIsX
      ? modelBounds.minX + u * spanX
      : modelBounds.minX + v * spanX;
    const cy = majorIsX
      ? modelBounds.minY + v * spanY
      : modelBounds.minY + u * spanY;

    const source = clampBounds2({
      minX: cx - (majorIsX ? spanX * 0.18 : Math.max(spanX * 0.55, longSpan * 0.04)) * 0.5,
      maxX: cx + (majorIsX ? spanX * 0.18 : Math.max(spanX * 0.55, longSpan * 0.04)) * 0.5,
      minY: cy - (majorIsX ? Math.max(spanY * 0.55, longSpan * 0.04) : spanY * 0.18) * 0.5,
      maxY: cy + (majorIsX ? Math.max(spanY * 0.55, longSpan * 0.04) : spanY * 0.18) * 0.5,
    }, modelBounds);

    const insetEdges = projectedEdges.filter((edge) => (
      edge.mid[0] >= source.minX && edge.mid[0] <= source.maxX
      && edge.mid[1] >= source.minY && edge.mid[1] <= source.maxY
    ));
    if (insetEdges.length < 18) continue;

    regions.push({
      label: detailLabels[i] ?? `Detail ${i + 1}`,
      source,
      edges: insetEdges,
    });
  }

  return regions;
}

type LabelBox = { minX: number; minY: number; maxX: number; maxY: number };

interface DimensionLabelPlan {
  label: string;
  color: ColorRgb;
  fontSize: number;
  preferred: Vec2;
  anchor: Vec2;
  tangent: Vec2;
  textHalfW: number;
  textHalfH: number;
  candidates: Vec2[];
}

interface DrawDimensionResult {
  graphicsCmd: string;
  labelPlan: DimensionLabelPlan | null;
  lineSegments: Segment2[];
}

function makeLabelBox(center: Vec2, textHalfW: number, textHalfH: number): LabelBox {
  return {
    minX: center[0] - textHalfW,
    minY: center[1] - textHalfH,
    maxX: center[0] + textHalfW,
    maxY: center[1] + textHalfH,
  };
}

function overlapArea(a: LabelBox, b: LabelBox): number {
  const x = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const y = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return x * y;
}

function boxDistance(a: LabelBox, b: LabelBox): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

function expandBox(box: LabelBox, pad: number): LabelBox {
  return {
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad,
  };
}

function clampLabelCenter(center: Vec2, textHalfW: number, textHalfH: number, cell: CellRect): Vec2 {
  const inset = 4;
  const minX = cell.x + inset + textHalfW;
  const maxX = cell.x + cell.w - inset - textHalfW;
  const minY = cell.y + inset + textHalfH;
  const maxY = cell.y + cell.h - inset - textHalfH;
  if (minX > maxX || minY > maxY) return [cell.x + cell.w * 0.5, cell.y + cell.h * 0.5];
  return [
    clamp(center[0], minX, maxX),
    clamp(center[1], minY, maxY),
  ];
}

function closestPointOnBox(box: LabelBox, point: Vec2): Vec2 {
  return [
    clamp(point[0], box.minX, box.maxX),
    clamp(point[1], box.minY, box.maxY),
  ];
}

function pointInBox(point: Vec2, box: LabelBox): boolean {
  return point[0] >= box.minX && point[0] <= box.maxX && point[1] >= box.minY && point[1] <= box.maxY;
}

function orientation2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment2(a: Vec2, b: Vec2, p: Vec2): boolean {
  return p[0] >= Math.min(a[0], b[0]) - 1e-6
    && p[0] <= Math.max(a[0], b[0]) + 1e-6
    && p[1] >= Math.min(a[1], b[1]) - 1e-6
    && p[1] <= Math.max(a[1], b[1]) + 1e-6;
}

function segmentsIntersect2(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const o1 = orientation2(a1, a2, b1);
  const o2 = orientation2(a1, a2, b2);
  const o3 = orientation2(b1, b2, a1);
  const o4 = orientation2(b1, b2, a2);

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;
  if (Math.abs(o1) <= 1e-6 && onSegment2(a1, a2, b1)) return true;
  if (Math.abs(o2) <= 1e-6 && onSegment2(a1, a2, b2)) return true;
  if (Math.abs(o3) <= 1e-6 && onSegment2(b1, b2, a1)) return true;
  if (Math.abs(o4) <= 1e-6 && onSegment2(b1, b2, a2)) return true;
  return false;
}

function pointToSegmentDistance(point: Vec2, seg: Segment2): number {
  const vx = seg.b[0] - seg.a[0];
  const vy = seg.b[1] - seg.a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-8) return Math.hypot(point[0] - seg.a[0], point[1] - seg.a[1]);
  const t = clamp(((point[0] - seg.a[0]) * vx + (point[1] - seg.a[1]) * vy) / len2, 0, 1);
  const px = seg.a[0] + vx * t;
  const py = seg.a[1] + vy * t;
  return Math.hypot(point[0] - px, point[1] - py);
}

function pointToBoxDistance(point: Vec2, box: LabelBox): number {
  const dx = Math.max(box.minX - point[0], 0, point[0] - box.maxX);
  const dy = Math.max(box.minY - point[1], 0, point[1] - box.maxY);
  return Math.hypot(dx, dy);
}

function segmentIntersectsBox(seg: Segment2, box: LabelBox): boolean {
  if (pointInBox(seg.a, box) || pointInBox(seg.b, box)) return true;
  const edges: Segment2[] = [
    { a: [box.minX, box.minY], b: [box.maxX, box.minY] },
    { a: [box.maxX, box.minY], b: [box.maxX, box.maxY] },
    { a: [box.maxX, box.maxY], b: [box.minX, box.maxY] },
    { a: [box.minX, box.maxY], b: [box.minX, box.minY] },
  ];
  return edges.some((edge) => segmentsIntersect2(seg.a, seg.b, edge.a, edge.b));
}

function segmentToBoxDistance(seg: Segment2, box: LabelBox): number {
  if (segmentIntersectsBox(seg, box)) return 0;
  const corners: Vec2[] = [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.maxX, box.maxY],
    [box.minX, box.maxY],
  ];
  let best = Infinity;
  best = Math.min(best, pointToBoxDistance(seg.a, box));
  best = Math.min(best, pointToBoxDistance(seg.b, box));
  corners.forEach((corner) => {
    best = Math.min(best, pointToSegmentDistance(corner, seg));
  });
  return best;
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.max(8, text.length * fontSize * 0.52);
}

function layoutDimensionLabels(
  plans: DimensionLabelPlan[],
  cell: CellRect,
  blockedSegments: Segment2[],
  avoidBoxes: LabelBox[] = [],
): Array<{ plan: DimensionLabelPlan; pos: Vec2; box: LabelBox }> {
  const placed: Array<{ plan: DimensionLabelPlan; pos: Vec2; box: LabelBox }> = [];
  const order = plans
    .map((plan, idx) => ({ plan, idx }))
    .sort((a, b) => {
      const aw = a.plan.textHalfW * 2;
      const bw = b.plan.textHalfW * 2;
      if (bw !== aw) return bw - aw;
      return a.idx - b.idx;
    });

  for (const entry of order) {
    const plan = entry.plan;
    let bestPos = clampLabelCenter(plan.preferred, plan.textHalfW, plan.textHalfH, cell);
    let bestBox = makeLabelBox(bestPos, plan.textHalfW, plan.textHalfH);
    let bestScore = Number.POSITIVE_INFINITY;

    const tested = plan.candidates.length > 0 ? plan.candidates : [plan.preferred];
    tested.forEach((candidate, ci) => {
      const pos = clampLabelCenter(candidate, plan.textHalfW, plan.textHalfH, cell);
      const box = makeLabelBox(pos, plan.textHalfW, plan.textHalfH);
      const overlap = placed.reduce((sum, p) => sum + overlapArea(expandBox(box, 2), expandBox(p.box, 2)), 0);
      const avoidPenalty = avoidBoxes.reduce((sum, b) => {
        const ov = overlapArea(box, b);
        if (ov > 0) return sum + ov * 1200;
        const d = boxDistance(box, b);
        if (d < 2) return sum + (2 - d) * 40;
        return sum;
      }, 0);
      const linePenalty = blockedSegments.reduce((sum, seg) => {
        const dist = segmentToBoxDistance(seg, box);
        if (dist <= 0.1) return sum + 1500;
        if (dist < 2) return sum + (2 - dist) * 220;
        if (dist < 6) return sum + (6 - dist) * 20;
        return sum;
      }, 0);
      const distFromPreferred = Math.hypot(pos[0] - plan.preferred[0], pos[1] - plan.preferred[1]);
      const axisBias = Math.abs((pos[0] - plan.preferred[0]) * plan.tangent[0] + (pos[1] - plan.preferred[1]) * plan.tangent[1]);
      const score = overlap * 1000 + avoidPenalty + linePenalty + distFromPreferred * 0.3 + axisBias * 0.05 + ci * 0.01;
      if (score < bestScore) {
        bestScore = score;
        bestPos = pos;
        bestBox = box;
      }
    });

    placed.push({ plan, pos: bestPos, box: bestBox });
  }

  return placed;
}

function drawDimension(
  dim: DimensionDef,
  mapPoint: (p: Vec2) => Vec2,
  mapScale: number,
  color: ColorRgb,
  cell: CellRect,
  fromProjected: Vec2,
  toProjected: Vec2,
): DrawDimensionResult {
  const dx = toProjected[0] - fromProjected[0];
  const dy = toProjected[1] - fromProjected[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-8) return { graphicsCmd: '', labelPlan: null, lineSegments: [] };

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const offset = dim.offset;

  const a0: Vec2 = fromProjected;
  const b0: Vec2 = toProjected;
  const a1: Vec2 = [fromProjected[0] + px * offset, fromProjected[1] + py * offset];
  const b1: Vec2 = [toProjected[0] + px * offset, toProjected[1] + py * offset];

  const pa0 = mapPoint(a0);
  const pb0 = mapPoint(b0);
  const pa1 = mapPoint(a1);
  const pb1 = mapPoint(b1);

  const arrowSize = clamp((len * mapScale) * 0.045, 3, 7.5);
  const extGap = clamp(Math.abs(offset) * mapScale * 0.1, 0.8, 2.5);
  const dmm = distance3(dim.from, dim.to);
  const baseLabel = dim.label ? `${dim.label}: ${dmm.toFixed(1)} mm` : `${dmm.toFixed(1)} mm`;

  const cmd: string[] = [];
  cmd.push(commandSetStroke(color));
  cmd.push(commandSetFill(color));
  cmd.push('0.8 w\n');

  const extAFrom: Vec2 = [pa0[0] + (pa1[0] - pa0[0]) * (extGap / Math.max(1e-6, Math.hypot(pa1[0] - pa0[0], pa1[1] - pa0[1]))), pa0[1] + (pa1[1] - pa0[1]) * (extGap / Math.max(1e-6, Math.hypot(pa1[0] - pa0[0], pa1[1] - pa0[1])))];
  const extBFrom: Vec2 = [pb0[0] + (pb1[0] - pb0[0]) * (extGap / Math.max(1e-6, Math.hypot(pb1[0] - pb0[0], pb1[1] - pb0[1]))), pb0[1] + (pb1[1] - pb0[1]) * (extGap / Math.max(1e-6, Math.hypot(pb1[0] - pb0[0], pb1[1] - pb0[1])))];
  const lineSegments: Segment2[] = [
    { a: extAFrom, b: pa1 },
    { a: extBFrom, b: pb1 },
    { a: pa1, b: pb1 },
  ];

  cmd.push(commandLine(extAFrom, pa1));
  cmd.push(commandLine(extBFrom, pb1));
  cmd.push(commandLine(pa1, pb1));

  const uxS = (pb1[0] - pa1[0]) / Math.max(1e-6, Math.hypot(pb1[0] - pa1[0], pb1[1] - pa1[1]));
  const uyS = (pb1[1] - pa1[1]) / Math.max(1e-6, Math.hypot(pb1[0] - pa1[0], pb1[1] - pa1[1]));
  const pxS = -uyS;
  const pyS = uxS;

  const leftA: Vec2 = [pa1[0] + uxS * arrowSize + pxS * arrowSize * 0.45, pa1[1] + uyS * arrowSize + pyS * arrowSize * 0.45];
  const rightA: Vec2 = [pa1[0] + uxS * arrowSize - pxS * arrowSize * 0.45, pa1[1] + uyS * arrowSize - pyS * arrowSize * 0.45];
  const leftB: Vec2 = [pb1[0] - uxS * arrowSize + pxS * arrowSize * 0.45, pb1[1] - uyS * arrowSize + pyS * arrowSize * 0.45];
  const rightB: Vec2 = [pb1[0] - uxS * arrowSize - pxS * arrowSize * 0.45, pb1[1] - uyS * arrowSize - pyS * arrowSize * 0.45];

  cmd.push(commandTriangleFill(pa1, leftA, rightA));
  cmd.push(commandTriangleFill(pb1, leftB, rightB));

  const mid: Vec2 = [(pa1[0] + pb1[0]) * 0.5, (pa1[1] + pb1[1]) * 0.5];
  let fontSize = 8;
  const maxLabelWidth = Math.max(28, cell.w - 12);
  const maxLabelHeight = Math.max(7, cell.h - 12);
  let label = baseLabel;
  let textWidth = estimateTextWidth(label, fontSize);
  if (textWidth > maxLabelWidth) {
    fontSize = Math.max(5, fontSize * (maxLabelWidth / textWidth));
    textWidth = estimateTextWidth(label, fontSize);
  }
  if (fontSize > maxLabelHeight) {
    fontSize = maxLabelHeight;
    textWidth = estimateTextWidth(label, fontSize);
  }
  if (textWidth > maxLabelWidth) {
    const maxChars = Math.max(4, Math.floor(maxLabelWidth / Math.max(1, fontSize * 0.52)) - 1);
    if (label.length > maxChars) label = `${label.slice(0, Math.max(1, maxChars - 1))}…`;
    textWidth = estimateTextWidth(label, fontSize);
  }
  const textHalfW = Math.max(8, textWidth * 0.5 + 2);
  const textHalfH = Math.max(3.5, fontSize * 0.62);
  const base = 6;
  const normalSteps = [0, 6, 12, 18, 26];
  const tangentSteps = [0, -12, 12, -22, 22, -34, 34];

  const candidates: Vec2[] = [];
  [1, -1].forEach((side) => {
    normalSteps.forEach((n) => {
      tangentSteps.forEach((t) => {
        candidates.push([
          mid[0] + pxS * side * (base + n) + uxS * t,
          mid[1] + pyS * side * (base + n) + uyS * t,
        ]);
      });
    });
  });

  const preferred: Vec2 = [mid[0] + pxS * base, mid[1] + pyS * base];

  return {
    graphicsCmd: cmd.join(''),
    labelPlan: {
      label,
      color,
      fontSize,
      preferred,
      anchor: mid,
      tangent: [uxS, uyS],
      textHalfW,
      textHalfH,
      candidates,
    },
    lineSegments,
  };
}

interface RenderViewCellOptions {
  boundsOverride?: Bounds2;
  drawFrame?: boolean;
  viewLabelOverride?: string;
}

function renderViewCell(
  cell: CellRect,
  frame: ViewFrame,
  center: Vec3,
  objects: ReportObject[],
  dimensions: DimensionDef[],
  dimDirectionToleranceDeg: number,
  options: RenderViewCellOptions = {},
): string {
  const viewDims = dimensions.filter((d) => isDimensionVisibleInView(d, frame, dimDirectionToleranceDeg));
  const baseBounds = projectedBounds(center, frame, objects, viewDims);
  const zoomOut = 1 + (viewDims.length > 0 ? Math.min(0.24, 0.08 + Math.sqrt(viewDims.length) * 0.03) : 0);
  const bounds = options.boundsOverride ?? scaleBounds2(baseBounds, zoomOut);
  const mapper = makeCellMapper(bounds, cell);

  const cmd: string[] = [];

  cmd.push('q\n');
  cmd.push(`${formatNumber(cell.x)} ${formatNumber(cell.y)} ${formatNumber(cell.w)} ${formatNumber(cell.h)} re W n\n`);

  type TriDraw = {
    a: Vec2;
    b: Vec2;
    c: Vec2;
    depth: number;
    color: ColorRgb;
    opacity: number;
  };

  const triangles: TriDraw[] = [];

  objects.forEach((obj) => {
    obj.triangles.forEach((tri) => {
      if (dot3(tri.normal, frame.forward) >= 0) return;
      const pa = projectPoint(tri.a, center, frame);
      const pb = projectPoint(tri.b, center, frame);
      const pc = projectPoint(tri.c, center, frame);
      const a = mapper.map([pa.x, pa.y]);
      const b = mapper.map([pb.x, pb.y]);
      const c = mapper.map([pc.x, pc.y]);
      triangles.push({
        a,
        b,
        c,
        depth: (pa.depth + pb.depth + pc.depth) / 3,
        color: obj.color,
        opacity: obj.opacity,
      });
    });
  });

  triangles.sort((lhs, rhs) => rhs.depth - lhs.depth);

  cmd.push('q\n');
  cmd.push('/GSfill gs\n');
  triangles.forEach((tri) => {
    cmd.push(commandSetFill(tri.color));
    cmd.push(commandTriangleFill(tri.a, tri.b, tri.c));
  });
  cmd.push('Q\n');

  const projectedEdges = collectProjectedEdges(frame, center, objects);

  cmd.push(commandSetStroke([0.1, 0.1, 0.12]));
  cmd.push('0.45 w\n');
  projectedEdges.forEach((edge) => {
    cmd.push(commandLine(mapper.map(edge.modelA), mapper.map(edge.modelB)));
  });

  const labelPlans: DimensionLabelPlan[] = [];
  const blockedLabelSegments: Segment2[] = [];
  viewDims.forEach((dim) => {
    const pFrom = projectPoint(dim.from, center, frame);
    const pTo = projectPoint(dim.to, center, frame);
    const result = drawDimension(dim, mapper.map, mapper.scale, hexToRgb01(dim.color || '#2b2b2b'), cell, [pFrom.x, pFrom.y], [pTo.x, pTo.y]);
    cmd.push(result.graphicsCmd);
    if (result.labelPlan) labelPlans.push(result.labelPlan);
    blockedLabelSegments.push(...result.lineSegments);
  });

  const placedLabels = layoutDimensionLabels(labelPlans, cell, blockedLabelSegments);
  placedLabels.forEach(({ plan, pos, box }) => {
    const leaderStart = plan.anchor;
    const leaderEnd = closestPointOnBox(box, leaderStart);
    const leaderDist = Math.hypot(leaderEnd[0] - leaderStart[0], leaderEnd[1] - leaderStart[1]);
    const textW = estimateTextWidth(plan.label, plan.fontSize);
    const leftEdge = cell.x + 4;
    const rightEdge = cell.x + cell.w - 4;
    let textX = pos[0] - textW * 0.5 + 1.5; // centered baseline by default
    if (textX + textW > rightEdge) textX = rightEdge - textW; // right-aligned near right edge
    if (textX < leftEdge) textX = leftEdge; // left-aligned near left edge
    cmd.push(commandSetStroke(plan.color));
    cmd.push(commandSetFill(plan.color));
    if (leaderDist > 10) {
      cmd.push('0.35 w\n');
      cmd.push(commandLine(leaderStart, leaderEnd));
    }
    cmd.push(commandText(plan.label, textX, pos[1] - 3, plan.fontSize));
  });

  cmd.push('Q\n');

  if (options.drawFrame !== false) {
    cmd.push(commandSetStroke([0.72, 0.72, 0.76]));
    cmd.push('0.7 w\n');
    cmd.push(`${formatNumber(cell.x)} ${formatNumber(cell.y)} ${formatNumber(cell.w)} ${formatNumber(cell.h)} re S\n`);
    cmd.push(commandSetFill([0.2, 0.2, 0.22]));
    cmd.push(commandText(options.viewLabelOverride ?? frame.label, cell.x + 6, cell.y + cell.h - 16, 10));
  }

  return cmd.join('');
}

function buildPageContent(
  page: PageSpec,
  views: ViewFrame[],
  dimDirectionToleranceDeg: number,
): string {
  const cmd: string[] = [];

  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText(page.title, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN + 2, 15));
  cmd.push(commandSetFill([0.4, 0.4, 0.44]));
  cmd.push(commandText(page.subtitle, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 14, 9));

  const merged = mergeBounds3(page.objects.map((o) => o.bbox));
  const center = merged ? bboxCenter(merged) : [0, 0, 0] as Vec3;

  if (page.kind === 'detail') {
    const cell: CellRect = {
      x: PAGE_MARGIN,
      y: PAGE_MARGIN,
      w: PAGE_WIDTH - PAGE_MARGIN * 2,
      h: PAGE_HEIGHT - PAGE_MARGIN * 2 - HEADER_HEIGHT,
    };
    cmd.push(renderViewCell(
      cell,
      page.view,
      center,
      page.objects,
      page.dimensions,
      dimDirectionToleranceDeg,
      {
        boundsOverride: page.source,
        viewLabelOverride: `${page.view.label} - Zoom`,
      },
    ));
    return cmd.join('');
  }

  const cells = buildGridCells(views.length);
  views.forEach((view, i) => {
    const cell = cells[i];
    if (!cell) return;
    cmd.push(renderViewCell(cell, view, center, page.objects, page.dimensions, dimDirectionToleranceDeg));
  });

  return cmd.join('');
}

function pointInBounds2(p: Vec2, b: Bounds2): boolean {
  return p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY;
}

function segmentIntersectsBounds2(a: Vec2, b: Vec2, bounds: Bounds2): boolean {
  if (pointInBounds2(a, bounds) || pointInBounds2(b, bounds)) return true;
  const corners: Vec2[] = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY],
  ];
  const edges: Segment2[] = [
    { a: corners[0], b: corners[1] },
    { a: corners[1], b: corners[2] },
    { a: corners[2], b: corners[3] },
    { a: corners[3], b: corners[0] },
  ];
  return edges.some((edge) => segmentsIntersect2(a, b, edge.a, edge.b));
}

function dimensionTouchesBounds(
  dim: DimensionDef,
  frame: ViewFrame,
  center: Vec3,
  bounds: Bounds2,
): boolean {
  const p0 = projectPoint(dim.from, center, frame);
  const p1 = projectPoint(dim.to, center, frame);
  return segmentIntersectsBounds2([p0.x, p0.y], [p1.x, p1.y], bounds);
}

function collectDetailPagesFor(
  page: StandardPageSpec,
  views: ViewFrame[],
  dimDirectionToleranceDeg: number,
): DetailPageSpec[] {
  const out: DetailPageSpec[] = [];
  const merged = mergeBounds3(page.objects.map((o) => o.bbox));
  const center = merged ? bboxCenter(merged) : [0, 0, 0] as Vec3;

  views.forEach((view) => {
    const viewDims = page.dimensions.filter((d) => isDimensionVisibleInView(d, view, dimDirectionToleranceDeg));
    const baseBounds = projectedBounds(center, view, page.objects, viewDims);
    const zoomOut = 1 + (viewDims.length > 0 ? Math.min(0.24, 0.08 + Math.sqrt(viewDims.length) * 0.03) : 0);
    const drawBounds = scaleBounds2(baseBounds, zoomOut);
    const regions = selectDetailRegions(collectProjectedEdges(view, center, page.objects), drawBounds);
    regions.forEach((region) => {
      const dims = page.dimensions.filter((d) => (
        isDimensionVisibleInView(d, view, dimDirectionToleranceDeg)
        && dimensionTouchesBounds(d, view, center, region.source)
      ));
      out.push({
        kind: 'detail',
        title: `${page.title} | ${view.label.toUpperCase()} ${region.label.toUpperCase()}`,
        subtitle: 'Zoom continuation',
        objects: page.objects,
        dimensions: dims,
        view,
        source: scaleBounds2(region.source, 1.08),
      });
    });
  });

  return out;
}

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

class PdfBuilder {
  private objects: string[] = [];

  addObject(content: string): number {
    this.objects.push(content);
    return this.objects.length;
  }

  addStreamObject(dictBody: string, streamContent: string): number {
    const data = streamContent.endsWith('\n') ? streamContent : `${streamContent}\n`;
    const length = byteLength(data);
    return this.addObject(`<< ${dictBody} /Length ${length} >>\nstream\n${data}endstream`);
  }

  build(rootId: number): Uint8Array {
    const parts: string[] = [];
    const offsets: number[] = [0];
    let cursor = 0;

    const push = (chunk: string) => {
      parts.push(chunk);
      cursor += byteLength(chunk);
    };

    push('%PDF-1.4\n%\u00a0\u00a1\u00a2\u00a3\n');

    for (let i = 0; i < this.objects.length; i += 1) {
      offsets.push(cursor);
      push(`${i + 1} 0 obj\n${this.objects[i]}\nendobj\n`);
    }

    const xrefPos = cursor;
    push(`xref\n0 ${this.objects.length + 1}\n`);
    push('0000000000 65535 f \n');
    for (let i = 1; i <= this.objects.length; i += 1) {
      push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
    }

    push(`trailer\n<< /Size ${this.objects.length + 1} /Root ${rootId} 0 R >>\n`);
    push(`startxref\n${xrefPos}\n%%EOF\n`);

    return encoder.encode(parts.join(''));
  }
}

function buildPages(
  objects: ReportObject[],
  dimensions: DimensionDef[],
  views: ViewFrame[],
  title: string,
  includeDisassembled: boolean,
  dimDirectionToleranceDeg: number,
): PageSpec[] {
  const pages: PageSpec[] = [];
  const basePages: StandardPageSpec[] = [];
  const generated = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const ownership = buildDimensionOwnership(dimensions, objects);

  basePages.push({
    kind: 'standard',
    title: 'ASSEMBLY OVERVIEW',
    subtitle: `${objects.length} components | ${ownership.combined.length} shared dimensions | ${generated} UTC`,
    objects,
    dimensions: ownership.combined,
  });

  if (includeDisassembled) {
    objects.forEach((obj) => {
      const dims = ownership.byComponent.get(obj.id) || [];
      basePages.push({
        kind: 'standard',
        title: `COMPONENT: ${obj.name}`,
        subtitle: `${obj.groupName ? `Group ${obj.groupName} | ` : ''}${dims.length} component dimensions`,
        objects: [obj],
        dimensions: dims,
      });
    });
  }

  if (views.length === 0) {
    throw new Error('Report requires at least one view');
  }

  basePages.forEach((base) => {
    pages.push(base);
    pages.push(...collectDetailPagesFor(base, views, dimDirectionToleranceDeg));
  });

  return pages;
}

export function generateReportPdf(
  result: RunResult,
  options: ReportOptions = {},
): ReportGenerationResult {
  const views = (options.views && options.views.length > 0 ? options.views : DEFAULT_VIEWS)
    .map(makeViewFrame);

  const reportObjects = collectReportObjects(result.objects, options.objectVisuals);
  if (reportObjects.length === 0) {
    throw new Error('No 3D objects available for report export.');
  }

  const dimensions = result.dimensions || [];
  const title = (options.title || 'ForgeCAD Report').trim() || 'ForgeCAD Report';
  const includeDisassembled = options.includeDisassembled !== false;
  const dimDirectionToleranceDeg = normalizeToleranceDeg(options.dimensionDirectionToleranceDeg);

  const pages = buildPages(reportObjects, dimensions, views, title, includeDisassembled, dimDirectionToleranceDeg);

  const pdf = new PdfBuilder();

  const fontId = pdf.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const gsFillId = pdf.addObject('<< /Type /ExtGState /CA 0.28 /ca 0.28 >>');
  const resourcesId = pdf.addObject(`<< /Font << /F1 ${fontId} 0 R >> /ExtGState << /GSfill ${gsFillId} 0 R >> >>`);

  const pagesId = 3 + pages.length * 2 + 1;
  const pageIds: number[] = [];

  pages.forEach((page) => {
    const content = buildPageContent(page, views, dimDirectionToleranceDeg);
    const contentId = pdf.addStreamObject('', content);
    const pageId = pdf.addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const actualPagesId = pdf.addObject(`<< /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >>`);
  if (actualPagesId !== pagesId) {
    throw new Error('Internal report PDF generation error (page tree mismatch).');
  }

  const catalogId = pdf.addObject(`<< /Type /Catalog /Pages ${actualPagesId} 0 R >>`);

  return {
    pdf: pdf.build(catalogId),
    pageCount: pages.length,
    componentCount: reportObjects.length,
    viewCount: views.length,
  };
}

import type { BomDef } from './bom';
import type { Shape } from './kernel';
import { shapeToGeometry } from './mesh/meshToGeometry';
import {
  type ColorRgb,
  commandLine,
  commandSetFill,
  commandSetStroke,
  commandText,
  estimateTextWidth,
  formatNumber,
  PAGE_HEIGHT,
  PAGE_MARGIN,
  PAGE_WIDTH,
  PdfBuilder,
  truncateToWidth,
  type Vec2,
} from './pdfUtils';
import { mapDimensionsToOwnerIds } from './reportDimensionOwnership';
import type { RunResult, SceneObject } from './runner';
import type { DimensionDef } from './sketch/dimensions';
import { formatLength, type LengthUnit } from './units';

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
  lengthUnit?: LengthUnit;
}

export interface ReportGenerationResult {
  pdf: Uint8Array;
  pageCount: number;
  componentCount: number;
  viewCount: number;
  bomItemCount: number;
}

type Vec3 = [number, number, number];
type Segment2 = { a: Vec2; b: Vec2 };

type Bounds2 = { minX: number; minY: number; maxX: number; maxY: number };
type Bounds3 = { min: Vec3; max: Vec3 };

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

interface BomReportRow {
  key: string;
  description: string;
  unit: string;
  quantity: number;
}

interface BomPageSpec {
  kind: 'bom';
  title: string;
  subtitle: string;
  rows: BomReportRow[];
  rowOffset: number;
  pageIndex: number;
  pageCount: number;
}

type PageSpec = StandardPageSpec | BomPageSpec;

interface DimensionOwnership {
  byId: Map<string, string[]>;
  combined: DimensionDef[];
  byComponent: Map<string, DimensionDef[]>;
}

interface ComponentPageGroup {
  representative: ReportObject;
  dimensions: DimensionDef[];
  instanceCount: number;
}

const DEFAULT_VIEWS: ReportViewId[] = ['front', 'right', 'top', 'iso'];
const DEFAULT_COLOR_HEX = '#5b9bd5';
const HEADER_HEIGHT = 44;
const CELL_GAP = 14;
const CELL_PADDING = 14;
const BOM_TABLE_ROW_HEIGHT = 18;
const BOM_TABLE_HEADER_HEIGHT = 22;
const BOM_TABLE_BOTTOM_PAD = 10;
const BOM_MAX_ROWS_PER_PAGE = 22;
const DEFAULT_DIM_DIRECTION_TOLERANCE_DEG = 60;
const MIN_DIM_OFFSET_PX = 10;
const DIM_CLEARANCE_PX = 6;
const DENSE_DIM_COLOR_PALETTE: ColorRgb[] = [
  [0.91, 0.38, 0.27], // warm red
  [0.16, 0.62, 0.86], // cyan blue
  [0.96, 0.72, 0.2], // amber
  [0.34, 0.76, 0.43], // green
  [0.77, 0.52, 0.92], // violet
  [0.93, 0.45, 0.65], // rose
  [0.44, 0.83, 0.78], // teal
];
const MAX_LABEL_GEOMETRY_SEGMENTS = 2200;
const MAX_FILL_TRIANGLES_PER_OBJECT = 12000;
const MAX_EDGE_SEGMENTS_PER_OBJECT = 45000;

/** Module-level length unit for the current report generation. Set by generateReportPdf. */
let _reportLengthUnit: LengthUnit = 'mm';

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function _add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function bboxCenter(b: Bounds3): Vec3 {
  return [(b.min[0] + b.max[0]) * 0.5, (b.min[1] + b.max[1]) * 0.5, (b.min[2] + b.max[2]) * 0.5];
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
    [x0, y0, z0],
    [x1, y0, z0],
    [x0, y1, z0],
    [x1, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x0, y1, z1],
    [x1, y1, z1],
  ];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normalizeToleranceDeg(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_DIM_DIRECTION_TOLERANCE_DEG;
  return clamp(v, 0, 90);
}

function normalizeBomUnit(unit: string | undefined): string {
  const value = typeof unit === 'string' ? unit.trim() : '';
  return value.length > 0 ? value : 'pieces';
}

function normalizeBomDescription(description: string | undefined): string {
  const value = typeof description === 'string' ? description.trim() : '';
  return value.length > 0 ? value : 'Unspecified item';
}

function normalizeBomKey(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim();
  return key.length > 0 ? key : undefined;
}

function collectBomRows(entries: BomDef[]): BomReportRow[] {
  const byKey = new Map<string, BomReportRow>();
  for (const entry of entries) {
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const description = normalizeBomDescription(entry.description);
    const unit = normalizeBomUnit(entry.unit);
    const normalizedKey = normalizeBomKey(entry.key);
    const key = normalizedKey ?? `${description.toLowerCase()}|${unit.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += qty;
      continue;
    }
    byKey.set(key, {
      key,
      description,
      unit,
      quantity: qty,
    });
  }
  return Array.from(byKey.values());
}

function splitBomRowsIntoPages(rows: BomReportRow[]): BomReportRow[][] {
  if (rows.length === 0) return [];

  const maxRowsByGeometry = Math.max(
    1,
    Math.floor((PAGE_HEIGHT - PAGE_MARGIN * 2 - HEADER_HEIGHT - BOM_TABLE_BOTTOM_PAD * 2 - BOM_TABLE_HEADER_HEIGHT) / BOM_TABLE_ROW_HEIGHT),
  );
  const perPage = Math.max(1, Math.min(BOM_MAX_ROWS_PER_PAGE, maxRowsByGeometry));
  const out: BomReportRow[][] = [];
  for (let i = 0; i < rows.length; i += perPage) {
    out.push(rows.slice(i, i + perPage));
  }
  return out;
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

function _pointInBounds(point: Vec3, bounds: Bounds3, tolerance: number): boolean {
  return (
    point[0] >= bounds.min[0] - tolerance &&
    point[0] <= bounds.max[0] + tolerance &&
    point[1] >= bounds.min[1] - tolerance &&
    point[1] <= bounds.max[1] + tolerance &&
    point[2] >= bounds.min[2] - tolerance &&
    point[2] <= bounds.max[2] + tolerance
  );
}

function isDimensionVisibleInView(dim: DimensionDef, frame: ViewFrame, toleranceDeg: number): boolean {
  const dir = sub3(dim.to, dim.from);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-9) return false;

  const d = [dir[0] / len, dir[1] / len, dir[2] / len] as Vec3;
  const alignRight = clamp(Math.abs(dot3(d, frame.right)), 0, 1);
  const alignUp = clamp(Math.abs(dot3(d, frame.up)), 0, 1);
  const angleRight = (Math.acos(alignRight) * 180) / Math.PI;
  const angleUp = (Math.acos(alignUp) * 180) / Math.PI;
  const minAngle = Math.min(angleRight, angleUp);
  return minAngle <= toleranceDeg;
}

function dimensionZoomOutFactor(dimensionCount: number): number {
  if (dimensionCount <= 0) return 1;
  return 1 + Math.min(0.58, 0.3 + Math.sqrt(dimensionCount) * 0.07);
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

    const a: Vec3 = [mesh.vertProperties[i0 * numProp], mesh.vertProperties[i0 * numProp + 1], mesh.vertProperties[i0 * numProp + 2]];
    const b: Vec3 = [mesh.vertProperties[i1 * numProp], mesh.vertProperties[i1 * numProp + 1], mesh.vertProperties[i1 * numProp + 2]];
    const c: Vec3 = [mesh.vertProperties[i2 * numProp], mesh.vertProperties[i2 * numProp + 1], mesh.vertProperties[i2 * numProp + 2]];

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

function collectReportObjects(objects: SceneObject[], visuals: Record<string, ReportObjectVisual> | undefined): ReportObject[] {
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
    const color: ColorRgb = [1 - (1 - baseColor[0]) * opacity, 1 - (1 - baseColor[1]) * opacity, 1 - (1 - baseColor[2]) * opacity];

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

function mapDimensionsToOwners(dimensions: DimensionDef[], objects: ReportObject[]): Map<string, string[]> {
  return mapDimensionsToOwnerIds(dimensions, objects);
}

function buildDimensionOwnership(dimensions: DimensionDef[], objects: ReportObject[]): DimensionOwnership {
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

function signatureNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(4);
}

function summarizeMetricSeries(values: number[]): string {
  if (values.length === 0) return '0:0:0:0';

  let sum = 0;
  let sumSquares = 0;
  let min = Infinity;
  let max = -Infinity;

  values.forEach((value) => {
    sum += value;
    sumSquares += value * value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  });

  return [signatureNumber(sum), signatureNumber(sumSquares), signatureNumber(min), signatureNumber(max)].join(':');
}

function triangleArea(triangle: ReportTriangle): number {
  const cross = cross3(sub3(triangle.b, triangle.a), sub3(triangle.c, triangle.a));
  return Math.hypot(cross[0], cross[1], cross[2]) * 0.5;
}

function makeComponentPageSignature(object: ReportObject): string {
  const extents = [
    Math.abs(object.bbox.max[0] - object.bbox.min[0]),
    Math.abs(object.bbox.max[1] - object.bbox.min[1]),
    Math.abs(object.bbox.max[2] - object.bbox.min[2]),
  ]
    .sort((a, b) => a - b)
    .map(signatureNumber)
    .join(':');
  const triangleAreas = object.triangles.map(triangleArea);
  const edgeLengths = object.edges.map((edge) => distance3(edge.a, edge.b));

  return [
    extents,
    object.triangles.length,
    summarizeMetricSeries(triangleAreas),
    object.edges.length,
    summarizeMetricSeries(edgeLengths),
  ].join('|');
}

function collectComponentPageGroups(objects: ReportObject[], ownership: DimensionOwnership): ComponentPageGroup[] {
  const grouped = new Map<string, ReportObject[]>();

  objects.forEach((object) => {
    const key = makeComponentPageSignature(object);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(object);
      return;
    }
    grouped.set(key, [object]);
  });

  return Array.from(grouped.values()).map((groupObjects) => {
    let representative = groupObjects[0];
    let dimensions = ownership.byComponent.get(representative.id) || [];

    groupObjects.slice(1).forEach((object) => {
      const candidateDimensions = ownership.byComponent.get(object.id) || [];
      if (candidateDimensions.length > dimensions.length) {
        representative = object;
        dimensions = candidateDimensions;
      }
    });

    return {
      representative,
      dimensions,
      instanceCount: groupObjects.length,
    };
  });
}

function projectedBounds(center: Vec3, frame: ViewFrame, objects: ReportObject[], dimensions: DimensionDef[]): Bounds2 {
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

function expandBounds2(bounds: Bounds2, pad: number): Bounds2 {
  if (!Number.isFinite(pad) || pad <= 0) return bounds;
  return {
    minX: bounds.minX - pad,
    minY: bounds.minY - pad,
    maxX: bounds.maxX + pad,
    maxY: bounds.maxY + pad,
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

function commandTriangleFill(a: Vec2, b: Vec2, c: Vec2): string {
  return `${formatNumber(a[0])} ${formatNumber(a[1])} m ${formatNumber(b[0])} ${formatNumber(b[1])} l ${formatNumber(c[0])} ${formatNumber(c[1])} l h f\n`;
}

interface DimensionOffsetBasis {
  dir3: Vec3;
  proj: Vec2;
  projDir: Vec2;
  projLen: number;
}

function projectVectorToView(v: Vec3, frame: ViewFrame): Vec2 {
  return [dot3(v, frame.right), dot3(v, frame.up)];
}

function pickDimensionOffsetBasis(dirModel: Vec3, frame: ViewFrame): DimensionOffsetBasis {
  const worldAxes: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const candidates: DimensionOffsetBasis[] = [];

  const pushCandidate = (candidate: Vec3) => {
    const len3 = Math.hypot(candidate[0], candidate[1], candidate[2]);
    if (len3 < 1e-8) return;
    const dir3: Vec3 = [candidate[0] / len3, candidate[1] / len3, candidate[2] / len3];
    const proj = projectVectorToView(dir3, frame);
    const projLen = Math.hypot(proj[0], proj[1]);
    if (projLen < 1e-6) return;
    const projDir: Vec2 = [proj[0] / projLen, proj[1] / projLen];
    candidates.push({ dir3, proj, projDir, projLen });
  };

  worldAxes.forEach((axis) => {
    const axisPerp = sub3(axis, mul3(dirModel, dot3(axis, dirModel)));
    pushCandidate(axisPerp);
  });

  if (candidates.length === 0) {
    pushCandidate(cross3(dirModel, frame.forward));
    pushCandidate(cross3(dirModel, frame.up));
    pushCandidate(cross3(dirModel, frame.right));
  }

  if (candidates.length === 0) {
    return { dir3: [0, 0, 1], proj: [0, 1], projDir: [0, 1], projLen: 1 };
  }

  candidates.sort((a, b) => b.projLen + Math.abs(b.projDir[1]) * 0.18 - (a.projLen + Math.abs(a.projDir[1]) * 0.18));
  return candidates[0];
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

function _makeMapperForRect(bounds: Bounds2, rect: CellRect, padding = CELL_PADDING): { map: (p: Vec2) => Vec2; scale: number } {
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

function collectProjectedEdges(frame: ViewFrame, center: Vec3, objects: ReportObject[]): ProjectedEdge[] {
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

function projectedObjectBounds(object: ReportObject, center: Vec3, frame: ViewFrame): Bounds2 {
  const bounds: Bounds2 = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  bboxCorners(object.bbox).forEach((corner) => {
    const p = projectPoint(corner, center, frame);
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.maxY = Math.max(bounds.maxY, p.y);
  });
  if (!Number.isFinite(bounds.minX)) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  }
  return bounds;
}

type LabelBox = { minX: number; minY: number; maxX: number; maxY: number };

function mapBoundsToLabelBox(bounds: Bounds2, mapPoint: (p: Vec2) => Vec2): LabelBox {
  const p0 = mapPoint([bounds.minX, bounds.minY]);
  const p1 = mapPoint([bounds.maxX, bounds.maxY]);
  return {
    minX: Math.min(p0[0], p1[0]),
    minY: Math.min(p0[1], p1[1]),
    maxX: Math.max(p0[0], p1[0]),
    maxY: Math.max(p0[1], p1[1]),
  };
}

interface DimensionLabelPlan {
  dimId: string;
  label: string;
  color: ColorRgb;
  fontSize: number;
  leaderMinLength: number;
  preferred: Vec2;
  anchor: Vec2;
  tangent: Vec2;
  textHalfW: number;
  textHalfH: number;
  candidates: Vec2[];
  ownLineSegments: Segment2[];
}

interface PlacedLabel {
  plan: DimensionLabelPlan;
  pos: Vec2;
  box: LabelBox;
  text: string;
  fallback: boolean;
}

interface LabelLegendEntry {
  index: number;
  text: string;
  color: ColorRgb;
}

interface DimensionLabelLayout {
  placements: PlacedLabel[];
  legend: LabelLegendEntry[];
}

interface LegendPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  lineHeight: number;
  rows: LabelLegendEntry[];
  hiddenCount: number;
}

interface DrawDimensionResult {
  graphicsCmd: string;
  labelPlan: DimensionLabelPlan | null;
  lineSegments: Segment2[];
}

interface AutoLaneEntry {
  dimId: string;
  angle: number;
  tangent: Vec2;
  spanMin: number;
  spanMax: number;
  normalCoord: number;
  preferredSide: number;
  lenPx: number;
}

interface DenseColorEntry {
  dimId: string;
  p0: Vec2;
  p1: Vec2;
  mid: Vec2;
  tangent: Vec2;
  spanMin: number;
  spanMax: number;
  normalCoord: number;
  lenPx: number;
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

function _boxDistance(a: LabelBox, b: LabelBox): number {
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
  return [clamp(center[0], minX, maxX), clamp(center[1], minY, maxY)];
}

function closestPointOnBox(box: LabelBox, point: Vec2): Vec2 {
  return [clamp(point[0], box.minX, box.maxX), clamp(point[1], box.minY, box.maxY)];
}

function pointInBox(point: Vec2, box: LabelBox): boolean {
  return point[0] >= box.minX && point[0] <= box.maxX && point[1] >= box.minY && point[1] <= box.maxY;
}

function orientation2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment2(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) - 1e-6 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-6 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-6 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-6
  );
}

function segmentsIntersect2(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const o1 = orientation2(a1, a2, b1);
  const o2 = orientation2(a1, a2, b2);
  const o3 = orientation2(b1, b2, a1);
  const o4 = orientation2(b1, b2, a2);

  if (o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0) return true;
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

function sampleSegments(segments: Segment2[], maxCount: number): Segment2[] {
  if (!Number.isFinite(maxCount) || maxCount <= 0 || segments.length <= maxCount) return segments;
  const out: Segment2[] = [];
  const step = segments.length / maxCount;
  for (let i = 0; i < maxCount; i += 1) {
    out.push(segments[Math.floor(i * step)]);
  }
  return out;
}

function autoLaneOffsetPx(colorIndex: number, isIso: boolean): number {
  if (colorIndex <= 0) return 0;
  const step = isIso ? 7.5 : 10;
  const compressedIndex = colorIndex <= 3 ? colorIndex : 3 + (colorIndex - 3) * (isIso ? 0.45 : 0.55);
  return compressedIndex * step;
}

function intervalOverlap1D(a0: number, a1: number, b0: number, b1: number, pad: number): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) >= -pad;
}

function intervalContains1D(container0: number, container1: number, inner0: number, inner1: number, tol: number): boolean {
  return container0 <= inner0 + tol && container1 >= inner1 - tol;
}

function hasExplicitDimensionColor(dim: DimensionDef): boolean {
  return typeof dim.color === 'string' && dim.color.trim().length > 0;
}

function assignCrowdedDimensionColors(
  dims: DimensionDef[],
  frame: ViewFrame,
  center: Vec3,
  mapper: { map: (p: Vec2) => Vec2 },
): Map<string, ColorRgb> {
  const out = new Map<string, ColorRgb>();
  if (dims.length < 5) return out;

  const entries: DenseColorEntry[] = [];
  dims.forEach((dim) => {
    if (hasExplicitDimensionColor(dim)) return;
    const pFrom = projectPoint(dim.from, center, frame);
    const pTo = projectPoint(dim.to, center, frame);
    const p0 = mapper.map([pFrom.x, pFrom.y]);
    const p1 = mapper.map([pTo.x, pTo.y]);
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 8) return;

    let tx = dx / len;
    let ty = dy / len;
    if (tx < -1e-6 || (Math.abs(tx) <= 1e-6 && ty < 0)) {
      tx = -tx;
      ty = -ty;
    }
    const nx = -ty;
    const ny = tx;
    const t0 = p0[0] * tx + p0[1] * ty;
    const t1 = p1[0] * tx + p1[1] * ty;
    const mid: Vec2 = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5];
    entries.push({
      dimId: dim.id,
      p0,
      p1,
      mid,
      tangent: [tx, ty],
      spanMin: Math.min(t0, t1),
      spanMax: Math.max(t0, t1),
      normalCoord: mid[0] * nx + mid[1] * ny,
      lenPx: len,
    });
  });

  if (entries.length < 5) return out;

  const alignThreshold = frame.id === 'iso' ? 0.952 : 0.968;
  const overlapPadPx = frame.id === 'iso' ? 10 : 12;
  const normalBandPx = frame.id === 'iso' ? 20 : 18;
  const nearMidPx = frame.id === 'iso' ? 30 : 26;

  const neighbors = new Map<number, Set<number>>();
  entries.forEach((_, idx) => neighbors.set(idx, new Set<number>()));

  for (let i = 0; i < entries.length; i += 1) {
    const a = entries[i];
    for (let j = i + 1; j < entries.length; j += 1) {
      const b = entries[j];
      const align = Math.abs(a.tangent[0] * b.tangent[0] + a.tangent[1] * b.tangent[1]);
      const overlap = intervalOverlap1D(a.spanMin, a.spanMax, b.spanMin, b.spanMax, overlapPadPx);
      const normalClose = Math.abs(a.normalCoord - b.normalCoord) <= normalBandPx;
      const midDist = Math.hypot(a.mid[0] - b.mid[0], a.mid[1] - b.mid[1]);
      const intersects = segmentsIntersect2(a.p0, a.p1, b.p0, b.p1);
      const closeParallel = align >= alignThreshold && overlap && normalClose;
      const closeCross = intersects && midDist <= nearMidPx * 2.2;
      const nearBundle = align >= 0.88 && overlap && midDist <= nearMidPx;
      if (!closeParallel && !closeCross && !nearBundle) continue;
      neighbors.get(i)?.add(j);
      neighbors.get(j)?.add(i);
    }
  }

  const crowdedIdxs = entries.map((_, idx) => idx).filter((idx) => (neighbors.get(idx)?.size ?? 0) > 0);
  if (crowdedIdxs.length < 4) return out;

  const inCrowd = new Set(crowdedIdxs);
  const components: number[][] = [];
  const seen = new Set<number>();
  crowdedIdxs.forEach((start) => {
    if (seen.has(start)) return;
    const comp: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const cur = queue.shift() as number;
      comp.push(cur);
      const nset = neighbors.get(cur);
      if (!nset) continue;
      nset.forEach((nei) => {
        if (!inCrowd.has(nei) || seen.has(nei)) return;
        seen.add(nei);
        queue.push(nei);
      });
    }
    if (comp.length >= 3) components.push(comp);
  });

  if (components.length === 0) return out;

  const colorByEntry = new Array(entries.length).fill(-1);
  const paletteLen = DENSE_DIM_COLOR_PALETTE.length;

  components.forEach((comp) => {
    const order = [...comp].sort((lhs, rhs) => {
      const lDeg = neighbors.get(lhs)?.size ?? 0;
      const rDeg = neighbors.get(rhs)?.size ?? 0;
      if (rDeg !== lDeg) return rDeg - lDeg;
      if (entries[lhs].lenPx !== entries[rhs].lenPx) return entries[lhs].lenPx - entries[rhs].lenPx;
      return entries[lhs].dimId.localeCompare(entries[rhs].dimId);
    });

    order.forEach((idx) => {
      const used = new Set<number>();
      neighbors.get(idx)?.forEach((nei) => {
        const c = colorByEntry[nei];
        if (c >= 0) used.add(c);
      });

      let picked = -1;
      for (let c = 0; c < paletteLen; c += 1) {
        if (!used.has(c)) {
          picked = c;
          break;
        }
      }
      if (picked < 0) {
        // If palette is exhausted in a dense cluster, pick the color with least immediate neighbor collisions.
        let bestColor = 0;
        let bestConflicts = Number.POSITIVE_INFINITY;
        for (let c = 0; c < paletteLen; c += 1) {
          let conflicts = 0;
          neighbors.get(idx)?.forEach((nei) => {
            if (colorByEntry[nei] === c) conflicts += 1;
          });
          if (conflicts < bestConflicts) {
            bestConflicts = conflicts;
            bestColor = c;
          }
        }
        picked = bestColor;
      }

      colorByEntry[idx] = picked;
      out.set(entries[idx].dimId, DENSE_DIM_COLOR_PALETTE[picked % paletteLen]);
    });
  });

  return out;
}

function assignAutoOffsetLanes(
  dims: DimensionDef[],
  frame: ViewFrame,
  center: Vec3,
  mapper: { map: (p: Vec2) => Vec2; scale: number },
  placementCenter: Vec2,
): Map<string, number> {
  const out = new Map<string, number>();
  if (dims.length <= 1) return out;

  const centerPx = mapper.map(placementCenter);
  const laneStepPx = frame.id === 'iso' ? 7.5 : 10;
  const overlapPadPx = frame.id === 'iso' ? 8 : 10;
  const alignThreshold = frame.id === 'iso' ? 0.98 : 0.985;
  const normalBandPx = laneStepPx * 1.35;
  const angleBucketRad = frame.id === 'iso' ? Math.PI / 42 : Math.PI / 54;
  const containTolPx = frame.id === 'iso' ? 4 : 5;

  const entries: AutoLaneEntry[] = [];

  dims.forEach((dim) => {
    const autoOffset = dim.autoOffset ?? Math.abs(dim.offset - 10) < 1e-6;
    if (!autoOffset) return;

    const pFromModel = projectPoint(dim.from, center, frame);
    const pToModel = projectPoint(dim.to, center, frame);
    const p0 = mapper.map([pFromModel.x, pFromModel.y]);
    const p1 = mapper.map([pToModel.x, pToModel.y]);
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy);
    if (len < 6) return;

    let tx = dx / len;
    let ty = dy / len;
    if (tx < -1e-6 || (Math.abs(tx) <= 1e-6 && ty < 0)) {
      tx = -tx;
      ty = -ty;
    }
    const angle = Math.atan2(ty, tx);
    const nx = -ty;
    const ny = tx;
    const t0 = p0[0] * tx + p0[1] * ty;
    const t1 = p1[0] * tx + p1[1] * ty;
    const spanMin = Math.min(t0, t1);
    const spanMax = Math.max(t0, t1);
    const mid: Vec2 = [(p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5];
    const normalCoord = mid[0] * nx + mid[1] * ny;
    const requestedSign = dim.offset < 0 ? -1 : 1;
    const centerPref = (mid[0] - centerPx[0]) * nx + (mid[1] - centerPx[1]) * ny;
    const centerSign = Math.abs(centerPref) > 0.8 ? (centerPref >= 0 ? 1 : -1) : 0;
    const preferredSide = centerSign || requestedSign;

    entries.push({
      dimId: dim.id,
      angle,
      tangent: [tx, ty],
      spanMin,
      spanMax,
      normalCoord,
      preferredSide,
      lenPx: len,
    });
  });

  if (entries.length <= 1) return out;

  const familyMap = new Map<string, number[]>();
  entries.forEach((entry, idx) => {
    const bucket = Math.round(entry.angle / angleBucketRad);
    const key = `${entry.preferredSide}:${bucket}`;
    const list = familyMap.get(key) || [];
    list.push(idx);
    familyMap.set(key, list);
  });

  const laneByEntry = new Array(entries.length).fill(0);

  const assignFamilyGroup = (groupIdxs: number[]) => {
    if (groupIdxs.length <= 1) return;

    const neighbors = new Map<number, Set<number>>();
    groupIdxs.forEach((idx) => neighbors.set(idx, new Set<number>()));

    for (let i = 0; i < groupIdxs.length; i += 1) {
      const ia = groupIdxs[i];
      const a = entries[ia];
      for (let j = i + 1; j < groupIdxs.length; j += 1) {
        const ib = groupIdxs[j];
        const b = entries[ib];
        const align = Math.abs(a.tangent[0] * b.tangent[0] + a.tangent[1] * b.tangent[1]);
        if (align < alignThreshold) continue;
        if (Math.abs(a.normalCoord - b.normalCoord) > normalBandPx) continue;
        if (!intervalOverlap1D(a.spanMin, a.spanMax, b.spanMin, b.spanMax, overlapPadPx)) continue;
        neighbors.get(ia)?.add(ib);
        neighbors.get(ib)?.add(ia);
      }
    }

    const order = groupIdxs
      .map((idx) => ({
        idx,
        span: entries[idx].spanMax - entries[idx].spanMin,
        degree: neighbors.get(idx)?.size ?? 0,
      }))
      .sort((lhs, rhs) => lhs.span - rhs.span || rhs.degree - lhs.degree || lhs.idx - rhs.idx);

    order.forEach(({ idx }) => {
      const used = new Set<number>();
      const nset = neighbors.get(idx) || new Set<number>();
      nset.forEach((nei) => {
        used.add(laneByEntry[nei]);
      });
      let lane = 0;
      while (used.has(lane)) lane += 1;
      laneByEntry[idx] = lane;
    });

    let adjusted = true;
    for (let guard = 0; guard < 6 && adjusted; guard += 1) {
      adjusted = false;
      for (let i = 0; i < groupIdxs.length; i += 1) {
        const ia = groupIdxs[i];
        const a = entries[ia];
        for (let j = 0; j < groupIdxs.length; j += 1) {
          if (i === j) continue;
          const ib = groupIdxs[j];
          const b = entries[ib];
          if (!intervalContains1D(a.spanMin, a.spanMax, b.spanMin, b.spanMax, containTolPx)) continue;
          if (Math.abs(a.normalCoord - b.normalCoord) > normalBandPx) continue;
          if (laneByEntry[ia] <= laneByEntry[ib]) {
            laneByEntry[ia] = laneByEntry[ib] + 1;
            adjusted = true;
          }
        }
      }
    }
  };

  familyMap.forEach((familyIdxs) => {
    if (familyIdxs.length <= 1) return;
    const sorted = [...familyIdxs].sort((lhs, rhs) => entries[lhs].normalCoord - entries[rhs].normalCoord);
    let cluster: number[] = [];
    let lastNormal = 0;
    sorted.forEach((idx, i) => {
      const n = entries[idx].normalCoord;
      if (i === 0 || Math.abs(n - lastNormal) <= normalBandPx) {
        cluster.push(idx);
      } else {
        assignFamilyGroup(cluster);
        cluster = [idx];
      }
      lastNormal = n;
    });
    assignFamilyGroup(cluster);
  });

  entries.forEach((entry, idx) => {
    const extraPx = autoLaneOffsetPx(laneByEntry[idx], frame.id === 'iso');
    if (extraPx <= 0) return;
    out.set(entry.dimId, extraPx / Math.max(1e-6, mapper.scale));
  });

  if (out.size === 0 && entries.length > 2) {
    const order = entries.map((entry, idx) => ({ entry, idx })).sort((lhs, rhs) => lhs.entry.lenPx - rhs.entry.lenPx || lhs.idx - rhs.idx);
    order.forEach(({ entry, idx }) => {
      const extraPx = autoLaneOffsetPx(idx, frame.id === 'iso');
      if (extraPx <= 0) return;
      out.set(entry.dimId, extraPx / Math.max(1e-6, mapper.scale));
    });
  }

  return out;
}

function candidateOrderFromCenter(center: number, min: number, max: number, step: number): number[] {
  const out: number[] = [];
  const clampedCenter = clamp(center, min, max);
  out.push(clampedCenter);
  const n = Math.max(2, Math.ceil((max - min) / Math.max(1, step)));
  for (let i = 1; i <= n; i += 1) {
    const up = clampedCenter + i * step;
    const down = clampedCenter - i * step;
    if (up <= max) out.push(up);
    if (down >= min) out.push(down);
  }
  return out;
}

function buildFallbackCandidates(plan: DimensionLabelPlan, cell: CellRect): Vec2[] {
  const inset = 6;
  const minX = cell.x + inset + plan.textHalfW;
  const maxX = cell.x + cell.w - inset - plan.textHalfW;
  const minY = cell.y + inset + plan.textHalfH;
  const maxY = cell.y + cell.h - inset - plan.textHalfH;
  if (minX > maxX || minY > maxY) return [clampLabelCenter(plan.preferred, plan.textHalfW, plan.textHalfH, cell)];

  const centerX = cell.x + cell.w * 0.5;
  const centerY = cell.y + cell.h * 0.5;
  const preferRight = plan.preferred[0] >= centerX;
  const preferTop = plan.preferred[1] >= centerY;
  const xEdges = preferRight ? [maxX, minX] : [minX, maxX];
  const yEdges = preferTop ? [maxY, minY] : [minY, maxY];

  const stepY = Math.max(10, plan.textHalfH * 2 + 3);
  const stepX = Math.max(10, plan.textHalfW * 0.8 + 4);
  const yOrder = candidateOrderFromCenter(plan.anchor[1], minY, maxY, stepY);
  const xOrder = candidateOrderFromCenter(plan.anchor[0], minX, maxX, stepX);

  const out: Vec2[] = [];
  xEdges.forEach((x) => {
    yOrder.forEach((y) => out.push([x, y]));
  });
  yEdges.forEach((y) => {
    xOrder.forEach((x) => out.push([x, y]));
  });
  return out;
}

function hasHardLabelConflict(
  ownLineSegments: Segment2[],
  box: LabelBox,
  placed: PlacedLabel[],
  blockedSegments: Segment2[],
  avoidBoxes: LabelBox[],
): boolean {
  const selfSegs = new Set(ownLineSegments);
  for (const p of placed) {
    if (overlapArea(expandBox(box, 2.2), expandBox(p.box, 2.2)) > 0) return true;
  }
  for (const b of avoidBoxes) {
    if (overlapArea(box, b) > 0) return true;
  }
  for (const seg of blockedSegments) {
    if (selfSegs.has(seg)) continue;
    const dist = segmentToBoxDistance(seg, box);
    if (dist < 2.6) return true;
  }
  return false;
}

function chooseLegendPlacement(
  legendEntries: LabelLegendEntry[],
  cell: CellRect,
  renderedLabelBoxes: LabelBox[],
  blockedSegments: Segment2[],
  avoidBoxes: LabelBox[],
): LegendPlacement | null {
  if (legendEntries.length === 0) return null;

  const fontSize = 6.2;
  const lineHeight = 7.2;
  const inset = 6;
  const width = Math.min(190, cell.w * 0.52);
  const maxRows = Math.max(3, Math.floor((cell.h * 0.34) / lineHeight));
  const shown = legendEntries.slice(0, maxRows);
  const hiddenCount = Math.max(0, legendEntries.length - shown.length);
  const rows = shown;
  const height = rows.length * lineHeight + 6 + (hiddenCount > 0 ? lineHeight : 0);

  const minX = cell.x + inset;
  const maxX = cell.x + cell.w - inset - width;
  const minY = cell.y + inset;
  const maxY = cell.y + cell.h - inset - height;
  if (maxX < minX || maxY < minY) return null;

  const midY = clamp(cell.y + (cell.h - height) * 0.5, minY, maxY);
  const midX = clamp(cell.x + (cell.w - width) * 0.5, minX, maxX);
  const candidates: Array<{ x: number; y: number }> = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
    { x: minX, y: midY },
    { x: maxX, y: midY },
    { x: midX, y: minY },
    { x: midX, y: maxY },
  ];

  let best: { x: number; y: number; score: number } | null = null;
  for (let idx = 0; idx < candidates.length; idx += 1) {
    const c = candidates[idx];
    const box: LabelBox = {
      minX: c.x,
      minY: c.y,
      maxX: c.x + width,
      maxY: c.y + height,
    };
    const labelPenalty = renderedLabelBoxes.reduce((sum, b) => sum + overlapArea(expandBox(box, 2.2), expandBox(b, 2.2)) * 700, 0);
    const avoidPenalty = avoidBoxes.reduce((sum, b) => sum + overlapArea(box, b) * 120, 0);
    const segPenalty = blockedSegments.reduce((sum, seg) => {
      const d = segmentToBoxDistance(seg, box);
      if (d <= 0.1) return sum + 80;
      if (d < 2.8) return sum + (2.8 - d) * 22;
      return sum;
    }, 0);
    const edgePref = idx < 4 ? 0 : 4;
    const score = labelPenalty + avoidPenalty + segPenalty + edgePref;
    if (!best || score < best.score) {
      best = { x: c.x, y: c.y, score };
    }
  }

  if (!best) return null;
  return {
    x: best.x,
    y: best.y,
    w: width,
    h: height,
    fontSize,
    lineHeight,
    rows,
    hiddenCount,
  };
}

function layoutDimensionLabels(
  plans: DimensionLabelPlan[],
  cell: CellRect,
  blockedSegments: Segment2[],
  avoidBoxes: LabelBox[] = [],
): DimensionLabelLayout {
  const placed: PlacedLabel[] = [];
  const unresolved: DimensionLabelPlan[] = [];
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
    let bestPos: Vec2 | null = null;
    let bestBox: LabelBox | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    const tested = plan.candidates.length > 0 ? plan.candidates : [plan.preferred];
    tested.forEach((candidate, ci) => {
      const pos = clampLabelCenter(candidate, plan.textHalfW, plan.textHalfH, cell);
      const box = makeLabelBox(pos, plan.textHalfW, plan.textHalfH);
      if (hasHardLabelConflict(plan.ownLineSegments, box, placed, blockedSegments, avoidBoxes)) return;

      const linePenalty = blockedSegments.reduce((sum, seg) => {
        if (plan.ownLineSegments.includes(seg)) return sum;
        const dist = segmentToBoxDistance(seg, box);
        if (dist < 3) return sum + (3 - dist) * 18;
        return sum;
      }, 0);
      const distFromPreferred = Math.hypot(pos[0] - plan.preferred[0], pos[1] - plan.preferred[1]);
      const axisBias = Math.abs((pos[0] - plan.preferred[0]) * plan.tangent[0] + (pos[1] - plan.preferred[1]) * plan.tangent[1]);
      const leaderEnd = closestPointOnBox(box, plan.anchor);
      const leaderLen = Math.hypot(leaderEnd[0] - plan.anchor[0], leaderEnd[1] - plan.anchor[1]);
      const leaderPenalty = blockedSegments.reduce((sum, seg) => {
        if (plan.ownLineSegments.includes(seg)) return sum;
        if (segmentsIntersect2(plan.anchor, leaderEnd, seg.a, seg.b)) return sum + 10;
        return sum;
      }, 0);
      const score = linePenalty + distFromPreferred * 0.9 + axisBias * 0.7 + leaderLen * 0.1 + leaderPenalty + ci * 0.03;
      if (score < bestScore) {
        bestScore = score;
        bestPos = pos;
        bestBox = box;
      }
    });

    if (bestPos && bestBox) {
      placed.push({ plan, pos: bestPos, box: bestBox, text: plan.label, fallback: false });
    } else {
      unresolved.push(plan);
    }
  }

  unresolved.forEach((plan) => {
    const fallbackCandidates = buildFallbackCandidates(plan, cell);
    let bestPos: Vec2 | null = null;
    let bestBox: LabelBox | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const textW = estimateTextWidth(plan.label, plan.fontSize);
    const textHalfW = Math.max(8, textW * 0.5 + 2);
    const textHalfH = plan.textHalfH;

    fallbackCandidates.forEach((candidate, ci) => {
      const pos = clampLabelCenter(candidate, textHalfW, textHalfH, cell);
      const box = makeLabelBox(pos, textHalfW, textHalfH);
      if (hasHardLabelConflict(plan.ownLineSegments, box, placed, blockedSegments, avoidBoxes)) return;
      const leaderEnd = closestPointOnBox(box, plan.anchor);
      const leaderLen = Math.hypot(leaderEnd[0] - plan.anchor[0], leaderEnd[1] - plan.anchor[1]);
      const leaderPenalty = blockedSegments.reduce(
        (sum, seg) => (plan.ownLineSegments.includes(seg) ? sum : segmentsIntersect2(plan.anchor, leaderEnd, seg.a, seg.b) ? sum + 5 : sum),
        0,
      );
      const score = leaderLen * 0.35 + leaderPenalty * 6 + ci * 0.1;
      if (score < bestScore) {
        bestScore = score;
        bestPos = pos;
        bestBox = box;
      }
    });

    if (!bestPos || !bestBox) {
      const fallbackPos = clampLabelCenter([cell.x + cell.w - 8 - textHalfW, cell.y + cell.h - 8 - textHalfH], textHalfW, textHalfH, cell);
      const fallbackBox = makeLabelBox(fallbackPos, textHalfW, textHalfH);
      placed.push({ plan, pos: fallbackPos, box: fallbackBox, text: plan.label, fallback: true });
    } else {
      placed.push({ plan, pos: bestPos, box: bestBox, text: plan.label, fallback: true });
    }
  });

  const legend: LabelLegendEntry[] = [];
  const denseMode = unresolved.length > Math.max(2, Math.floor(plans.length * 0.25)) || plans.length >= 10;
  const shouldIndex = denseMode || placed.some((p) => p.fallback);

  if (shouldIndex) {
    const indexed = [...placed].sort(
      (lhs, rhs) =>
        rhs.plan.anchor[1] - lhs.plan.anchor[1] || lhs.plan.anchor[0] - rhs.plan.anchor[0] || lhs.plan.dimId.localeCompare(rhs.plan.dimId),
    );
    let counter = 1;
    indexed.forEach((p) => {
      if (!denseMode && !p.fallback) return;
      p.text = `[${counter}]`;
      legend.push({
        index: counter,
        text: p.plan.label,
        color: p.plan.color,
      });
      counter += 1;
    });
  }

  return { placements: placed, legend };
}

function drawDimension(
  dim: DimensionDef,
  frame: ViewFrame,
  mapPoint: (p: Vec2) => Vec2,
  mapScale: number,
  color: ColorRgb,
  cell: CellRect,
  fromProjected: Vec2,
  toProjected: Vec2,
  placementBounds: Bounds2 | null,
  placementCenter: Vec2,
  autoLaneNudgeModel = 0,
): DrawDimensionResult {
  const from = fromProjected;
  const to = toProjected;

  const dx = toProjected[0] - fromProjected[0];
  const dy = toProjected[1] - fromProjected[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-8) return { graphicsCmd: '', labelPlan: null, lineSegments: [] };

  const modelDirRaw = sub3(dim.to, dim.from);
  const modelLen = Math.hypot(modelDirRaw[0], modelDirRaw[1], modelDirRaw[2]);
  if (modelLen < 1e-9) return { graphicsCmd: '', labelPlan: null, lineSegments: [] };
  const modelDir: Vec3 = [modelDirRaw[0] / modelLen, modelDirRaw[1] / modelLen, modelDirRaw[2] / modelLen];
  const offsetBasis = pickDimensionOffsetBasis(modelDir, frame);

  const _ux = dx / len;
  const _uy = dy / len;
  const isIsoView = frame.id === 'iso';

  const requestedOffset = Number.isFinite(dim.offset) ? dim.offset : 0;
  const requestedSign = requestedOffset < 0 ? -1 : 1;
  const projectedModelScale = Math.max(1e-6, mapScale * offsetBasis.projLen);
  const minReadableOffset = MIN_DIM_OFFSET_PX / projectedModelScale;
  const autoLaneOffsetModel = Math.max(0, autoLaneNudgeModel / Math.max(1e-6, offsetBasis.projLen));
  const baseOffsetAbs = Math.max(Math.abs(requestedOffset), minReadableOffset) + autoLaneOffsetModel;
  const boundsForPlacement = placementBounds ? expandBounds2(placementBounds, DIM_CLEARANCE_PX / Math.max(1e-6, mapScale)) : null;
  const placementSpan = boundsForPlacement
    ? Math.max(1e-6, Math.max(boundsForPlacement.maxX - boundsForPlacement.minX, boundsForPlacement.maxY - boundsForPlacement.minY))
    : 1;
  const midProjected: Vec2 = [(fromProjected[0] + toProjected[0]) * 0.5, (fromProjected[1] + toProjected[1]) * 0.5];
  const centerPref =
    (midProjected[0] - placementCenter[0]) * offsetBasis.projDir[0] + (midProjected[1] - placementCenter[1]) * offsetBasis.projDir[1];
  const centerSign = Math.abs(centerPref) > 1e-6 ? (centerPref >= 0 ? 1 : -1) : 0;
  const candidateSides = Array.from(new Set([centerSign || requestedSign, requestedSign, -(centerSign || requestedSign)]));
  const stepOffset = Math.max(
    minReadableOffset * (isIsoView ? 0.55 : 0.8),
    (placementSpan * (isIsoView ? 0.008 : 0.015)) / Math.max(1e-6, offsetBasis.projLen),
  );
  const maxBoostSteps = isIsoView ? 5 : 12;
  const maxOffsetAbs = baseOffsetAbs + (isIsoView ? 14 : 28) / projectedModelScale;
  const fullSegmentClear = !isIsoView;

  const solveForSide = (side: number): { side: number; offsetAbs: number; intersects: boolean; outwardScore: number } => {
    let offsetAbs = baseOffsetAbs;
    let intersects = false;
    for (let i = 0; i < maxBoostSteps; i += 1) {
      const shift: Vec2 = [offsetBasis.proj[0] * side * offsetAbs, offsetBasis.proj[1] * side * offsetAbs];
      const a1: Vec2 = [from[0] + shift[0], from[1] + shift[1]];
      const b1: Vec2 = [to[0] + shift[0], to[1] + shift[1]];
      const shiftedMid: Vec2 = [midProjected[0] + shift[0], midProjected[1] + shift[1]];
      intersects = boundsForPlacement
        ? fullSegmentClear
          ? segmentIntersectsBounds2(a1, b1, boundsForPlacement)
          : pointInBounds2(shiftedMid, boundsForPlacement)
        : false;
      if (!intersects) break;
      const nextOffset = Math.min(maxOffsetAbs, offsetAbs + stepOffset);
      if (nextOffset <= offsetAbs + 1e-6) break;
      offsetAbs = nextOffset;
    }

    const shift: Vec2 = [offsetBasis.proj[0] * side * offsetAbs, offsetBasis.proj[1] * side * offsetAbs];
    const shiftedMid: Vec2 = [midProjected[0] + shift[0], midProjected[1] + shift[1]];
    const outwardDir: Vec2 = [offsetBasis.projDir[0] * side, offsetBasis.projDir[1] * side];
    const outwardScore = (shiftedMid[0] - placementCenter[0]) * outwardDir[0] + (shiftedMid[1] - placementCenter[1]) * outwardDir[1];
    return { side, offsetAbs, intersects, outwardScore };
  };

  const solved = candidateSides
    .map((side) => solveForSide(side))
    .map((entry) => {
      const inwardPenalty = entry.outwardScore < 0 ? (-entry.outwardScore / placementSpan) * 1800 : 0;
      const growthPenalty = (((entry.offsetAbs - baseOffsetAbs) * offsetBasis.projLen) / placementSpan) * 140;
      const signPenalty = entry.side === requestedSign ? 0 : 8;
      const intersectPenalty = entry.intersects ? 250000 : 0;
      return { ...entry, score: inwardPenalty + growthPenalty + signPenalty + intersectPenalty };
    })
    .sort((a, b) => a.score - b.score);

  const winner = solved[0];
  const offset = (winner?.side ?? requestedSign) * (winner?.offsetAbs ?? baseOffsetAbs);
  const winShift: Vec2 = [offsetBasis.proj[0] * offset, offsetBasis.proj[1] * offset];

  const a0: Vec2 = from;
  const b0: Vec2 = to;
  const a1: Vec2 = [from[0] + winShift[0], from[1] + winShift[1]];
  const b1: Vec2 = [to[0] + winShift[0], to[1] + winShift[1]];

  const pa0 = mapPoint(a0);
  const pb0 = mapPoint(b0);
  const pa1 = mapPoint(a1);
  const pb1 = mapPoint(b1);

  const arrowSize = clamp(len * mapScale * 0.045, 3, 7.5);
  const extGap = clamp(Math.abs(offset) * projectedModelScale * 0.1, 0.8, 2.5);
  const dmm = distance3(dim.from, dim.to);
  const baseLabel = dim.label ? `${dim.label}: ${formatLength(dmm, _reportLengthUnit, 1)}` : formatLength(dmm, _reportLengthUnit, 1);

  const cmd: string[] = [];
  cmd.push(commandSetStroke(color));
  cmd.push(commandSetFill(color));
  cmd.push('0.8 w\n');

  const extAFrom: Vec2 = [
    pa0[0] + (pa1[0] - pa0[0]) * (extGap / Math.max(1e-6, Math.hypot(pa1[0] - pa0[0], pa1[1] - pa0[1]))),
    pa0[1] + (pa1[1] - pa0[1]) * (extGap / Math.max(1e-6, Math.hypot(pa1[0] - pa0[0], pa1[1] - pa0[1]))),
  ];
  const extBFrom: Vec2 = [
    pb0[0] + (pb1[0] - pb0[0]) * (extGap / Math.max(1e-6, Math.hypot(pb1[0] - pb0[0], pb1[1] - pb0[1]))),
    pb0[1] + (pb1[1] - pb0[1]) * (extGap / Math.max(1e-6, Math.hypot(pb1[0] - pb0[0], pb1[1] - pb0[1]))),
  ];
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
  const lineLenPx = Math.hypot(pb1[0] - pa1[0], pb1[1] - pa1[1]);
  const tangentMax = isIsoView ? clamp(lineLenPx * 0.2, 16, 38) : clamp(lineLenPx * 0.32, 20, 72);
  const tangentMid = Math.max(isIsoView ? 12 : 16, tangentMax * 0.55);
  const normalSteps = isIsoView ? [0, 5, 10, 16, 22] : [0, 6, 12, 18, 26, 34];
  const tangentSteps = isIsoView
    ? [0, -8, 8, -14, 14, -tangentMid, tangentMid, -tangentMax, tangentMax]
    : [0, -10, 10, -18, 18, -28, 28, -tangentMid, tangentMid, -tangentMax, tangentMax];

  const candidates: Vec2[] = [];
  [1, -1].forEach((side) => {
    normalSteps.forEach((n) => {
      tangentSteps.forEach((t) => {
        candidates.push([mid[0] + pxS * side * (base + n) + uxS * t, mid[1] + pyS * side * (base + n) + uyS * t]);
      });
    });
  });

  const preferred: Vec2 = [mid[0] + pxS * base, mid[1] + pyS * base];

  return {
    graphicsCmd: cmd.join(''),
    labelPlan: {
      dimId: dim.id,
      label,
      color,
      fontSize,
      leaderMinLength: isIsoView ? 14 : 10,
      preferred,
      anchor: mid,
      tangent: [uxS, uyS],
      textHalfW,
      textHalfH,
      candidates,
      ownLineSegments: lineSegments,
    },
    lineSegments,
  };
}

interface RenderViewCellOptions {
  drawFrame?: boolean;
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
  const objectBounds = projectedBounds(center, frame, objects, []);
  const placementBounds = objectBounds;
  const placementCenter = boundsCenter2(placementBounds);
  const zoomOut = dimensionZoomOutFactor(viewDims.length);
  const bounds = scaleBounds2(baseBounds, zoomOut);
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
  const geometryLabelSegments = sampleSegments(
    projectedEdges.map((edge) => ({ a: mapper.map(edge.modelA), b: mapper.map(edge.modelB) })),
    MAX_LABEL_GEOMETRY_SEGMENTS,
  );
  const geometryAvoidBoxes = objects.map((obj) => mapBoundsToLabelBox(projectedObjectBounds(obj, center, frame), mapper.map));

  cmd.push(commandSetStroke([0.1, 0.1, 0.12]));
  cmd.push('0.45 w\n');
  projectedEdges.forEach((edge) => {
    cmd.push(commandLine(mapper.map(edge.modelA), mapper.map(edge.modelB)));
  });

  const labelPlans: DimensionLabelPlan[] = [];
  const blockedLabelSegments: Segment2[] = [...geometryLabelSegments];
  const autoLaneNudges = assignAutoOffsetLanes(viewDims, frame, center, mapper, placementCenter);
  const crowdedColorOverrides = assignCrowdedDimensionColors(viewDims, frame, center, mapper);
  viewDims.forEach((dim) => {
    const pFrom = projectPoint(dim.from, center, frame);
    const pTo = projectPoint(dim.to, center, frame);
    const dimColor = hasExplicitDimensionColor(dim) ? hexToRgb01(dim.color) : crowdedColorOverrides.get(dim.id) || hexToRgb01('#2b2b2b');
    const result = drawDimension(
      dim,
      frame,
      mapper.map,
      mapper.scale,
      dimColor,
      cell,
      [pFrom.x, pFrom.y],
      [pTo.x, pTo.y],
      placementBounds,
      placementCenter,
      autoLaneNudges.get(dim.id) ?? 0,
    );
    cmd.push(result.graphicsCmd);
    if (result.labelPlan) labelPlans.push(result.labelPlan);
    blockedLabelSegments.push(...result.lineSegments);
  });

  const labelLayout = layoutDimensionLabels(labelPlans, cell, blockedLabelSegments, geometryAvoidBoxes);
  const placedLabels = labelLayout.placements;
  const renderedLabelBoxes: LabelBox[] = [];
  placedLabels.forEach(({ plan, pos, text, fallback }) => {
    const leaderStart = plan.anchor;
    const textW = estimateTextWidth(text, plan.fontSize);
    const textHalfW = Math.max(8, textW * 0.5 + 2);
    const leftEdge = cell.x + 4;
    const rightEdge = cell.x + cell.w - 4;
    let textX = pos[0] - textW * 0.5 + 1.5; // centered baseline by default
    if (textX + textW > rightEdge) textX = rightEdge - textW; // right-aligned near right edge
    if (textX < leftEdge) textX = leftEdge; // left-aligned near left edge
    const renderedCenter: Vec2 = [textX + textW * 0.5 - 1.5, pos[1]];
    const renderedBox = makeLabelBox(renderedCenter, textHalfW, plan.textHalfH);
    renderedLabelBoxes.push(renderedBox);
    const leaderEnd = closestPointOnBox(renderedBox, leaderStart);
    const leaderDist = Math.hypot(leaderEnd[0] - leaderStart[0], leaderEnd[1] - leaderStart[1]);
    cmd.push(commandSetStroke(plan.color));
    cmd.push(commandSetFill(plan.color));
    if (leaderDist > plan.leaderMinLength) {
      cmd.push(fallback ? '0.45 w\n' : '0.35 w\n');
      cmd.push(commandLine(leaderStart, leaderEnd));
    }
    cmd.push(commandText(text, textX, pos[1] - 3, plan.fontSize));
  });

  const legendPlacement = chooseLegendPlacement(labelLayout.legend, cell, renderedLabelBoxes, blockedLabelSegments, geometryAvoidBoxes);
  if (legendPlacement) {
    const rows =
      legendPlacement.hiddenCount > 0
        ? [...legendPlacement.rows, { index: 0, text: `+${legendPlacement.hiddenCount} more`, color: [0.45, 0.45, 0.48] as ColorRgb }]
        : legendPlacement.rows;
    cmd.push(commandSetStroke([0.42, 0.42, 0.46]));
    cmd.push('0.35 w\n');
    cmd.push(
      `${formatNumber(legendPlacement.x)} ${formatNumber(legendPlacement.y)} ${formatNumber(legendPlacement.w)} ${formatNumber(legendPlacement.h)} re S\n`,
    );

    rows.forEach((row, i) => {
      const y = legendPlacement.y + legendPlacement.h - 3 - (i + 1) * legendPlacement.lineHeight;
      const prefix = row.index > 0 ? `[${row.index}] ` : '';
      const text = truncateToWidth(`${prefix}${row.text}`, legendPlacement.w - 8, legendPlacement.fontSize);
      cmd.push(commandSetFill(row.color));
      cmd.push(commandText(text, legendPlacement.x + 4, y, legendPlacement.fontSize));
    });
  }

  cmd.push('Q\n');

  if (options.drawFrame !== false) {
    cmd.push(commandSetStroke([0.72, 0.72, 0.76]));
    cmd.push('0.7 w\n');
    cmd.push(`${formatNumber(cell.x)} ${formatNumber(cell.y)} ${formatNumber(cell.w)} ${formatNumber(cell.h)} re S\n`);
    cmd.push(commandSetFill([0.2, 0.2, 0.22]));
    cmd.push(commandText(frame.label, cell.x + 6, cell.y + cell.h - 16, 10));
  }

  return cmd.join('');
}

function renderBomPage(page: BomPageSpec): string {
  const cmd: string[] = [];

  const tableX = PAGE_MARGIN;
  const tableW = PAGE_WIDTH - PAGE_MARGIN * 2;
  const tableTop = PAGE_HEIGHT - PAGE_MARGIN - HEADER_HEIGHT - BOM_TABLE_BOTTOM_PAD;
  const tableBottom = PAGE_MARGIN + BOM_TABLE_BOTTOM_PAD;
  const tableH = Math.max(40, tableTop - tableBottom);

  const indexW = 34;
  const qtyW = 92;
  const unitW = 74;
  const descW = Math.max(120, tableW - indexW - qtyW - unitW);

  const xIndex = tableX;
  const xDesc = xIndex + indexW;
  const xQty = xDesc + descW;
  const xUnit = xQty + qtyW;

  const headerTop = tableTop;
  const headerBottom = headerTop - BOM_TABLE_HEADER_HEIGHT;

  cmd.push(commandSetStroke([0.7, 0.7, 0.74]));
  cmd.push('0.8 w\n');
  cmd.push(`${formatNumber(tableX)} ${formatNumber(tableBottom)} ${formatNumber(tableW)} ${formatNumber(tableH)} re S\n`);
  cmd.push(commandLine([tableX, headerBottom], [tableX + tableW, headerBottom]));
  cmd.push(commandLine([xDesc, tableBottom], [xDesc, tableTop]));
  cmd.push(commandLine([xQty, tableBottom], [xQty, tableTop]));
  cmd.push(commandLine([xUnit, tableBottom], [xUnit, tableTop]));

  cmd.push(commandSetFill([0.22, 0.22, 0.24]));
  cmd.push(commandText('#', xIndex + 6, headerBottom + 6, 9));
  cmd.push(commandText('Item', xDesc + 6, headerBottom + 6, 9));
  cmd.push(commandText('Quantity', xQty + 6, headerBottom + 6, 9));
  cmd.push(commandText('Unit', xUnit + 6, headerBottom + 6, 9));

  page.rows.forEach((row, i) => {
    const rowTop = headerBottom - i * BOM_TABLE_ROW_HEIGHT;
    const rowBottom = rowTop - BOM_TABLE_ROW_HEIGHT;
    if (rowBottom < tableBottom) return;

    cmd.push(commandSetStroke([0.86, 0.86, 0.88]));
    cmd.push('0.45 w\n');
    cmd.push(commandLine([tableX, rowBottom], [tableX + tableW, rowBottom]));

    const textY = rowBottom + 5;
    const indexText = String(page.rowOffset + i + 1);
    const descText = truncateToWidth(row.description, descW - 12, 9);
    const qtyText = formatNumber(row.quantity);
    const qtyX = xUnit - 6 - estimateTextWidth(qtyText, 9);

    cmd.push(commandSetFill([0.14, 0.14, 0.16]));
    cmd.push(commandText(indexText, xIndex + 6, textY, 9));
    cmd.push(commandText(descText, xDesc + 6, textY, 9));
    cmd.push(commandText(qtyText, qtyX, textY, 9));
    cmd.push(commandText(row.unit, xUnit + 6, textY, 9));
  });

  if (page.pageCount > 1) {
    cmd.push(commandSetFill([0.42, 0.42, 0.45]));
    cmd.push(commandText(`Page ${page.pageIndex}/${page.pageCount}`, PAGE_WIDTH - PAGE_MARGIN - 66, PAGE_MARGIN - 2, 8));
  }

  return cmd.join('');
}

function buildPageContent(page: PageSpec, views: ViewFrame[], dimDirectionToleranceDeg: number): string {
  const cmd: string[] = [];

  cmd.push(commandSetFill([0.12, 0.12, 0.14]));
  cmd.push(commandText(page.title, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN + 2, 15));
  cmd.push(commandSetFill([0.4, 0.4, 0.44]));
  cmd.push(commandText(page.subtitle, PAGE_MARGIN, PAGE_HEIGHT - PAGE_MARGIN - 14, 9));

  if (page.kind === 'bom') {
    cmd.push(renderBomPage(page));
    return cmd.join('');
  }

  const merged = mergeBounds3(page.objects.map((o) => o.bbox));
  const center = merged ? bboxCenter(merged) : ([0, 0, 0] as Vec3);

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

function buildPages(
  objects: ReportObject[],
  dimensions: DimensionDef[],
  bomEntries: BomDef[],
  views: ViewFrame[],
  title: string,
  includeDisassembled: boolean,
  _dimDirectionToleranceDeg: number,
): PageSpec[] {
  const pages: PageSpec[] = [];
  const basePages: StandardPageSpec[] = [];
  const bomRows = collectBomRows(bomEntries);
  const bomChunks = splitBomRowsIntoPages(bomRows);
  const generated = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const ownership = buildDimensionOwnership(dimensions, objects);
  const componentGroups = collectComponentPageGroups(objects, ownership);

  if (bomRows.length > 0) {
    let rowOffset = 0;
    bomChunks.forEach((rows, pageIndex) => {
      pages.push({
        kind: 'bom',
        title: `${title.toUpperCase()} | BILL OF MATERIALS`,
        subtitle: `${bomRows.length} unique items | Summed from ${bomEntries.length} bom() entries`,
        rows,
        rowOffset,
        pageIndex: pageIndex + 1,
        pageCount: bomChunks.length,
      });
      rowOffset += rows.length;
    });
  }

  basePages.push({
    kind: 'standard',
    title: 'ASSEMBLY OVERVIEW',
    subtitle: `${objects.length} components | ${componentGroups.length} unique item pages | ${ownership.combined.length} shared dimensions | ${generated} UTC`,
    objects,
    dimensions: ownership.combined,
  });

  if (includeDisassembled) {
    componentGroups.forEach((group) => {
      const obj = group.representative;
      const subtitleParts = [obj.groupName ? `Group ${obj.groupName}` : '', `${group.dimensions.length} component dimensions`].filter(
        Boolean,
      );
      if (group.instanceCount > 1) {
        subtitleParts.push(`${group.instanceCount} identical instances merged`);
      }
      basePages.push({
        kind: 'standard',
        title: `COMPONENT: ${obj.name}`,
        subtitle: subtitleParts.join(' | '),
        objects: [obj],
        dimensions: group.dimensions,
      });
    });
  }

  if (views.length === 0) {
    throw new Error('Report requires at least one view');
  }

  basePages.forEach((base) => {
    pages.push(base);
  });

  return pages;
}

export function generateReportPdf(result: RunResult, options: ReportOptions = {}): ReportGenerationResult {
  _reportLengthUnit = options.lengthUnit ?? 'mm';

  const views = (options.views && options.views.length > 0 ? options.views : DEFAULT_VIEWS).map(makeViewFrame);

  const reportObjects = collectReportObjects(result.objects, options.objectVisuals);
  if (reportObjects.length === 0) {
    throw new Error('No 3D objects available for report export.');
  }

  const dimensions = result.dimensions || [];
  const bomEntries = result.bom || [];
  const title = (options.title || 'ForgeCAD Report').trim() || 'ForgeCAD Report';
  const includeDisassembled = options.includeDisassembled !== false;
  const dimDirectionToleranceDeg = normalizeToleranceDeg(options.dimensionDirectionToleranceDeg);

  const pages = buildPages(reportObjects, dimensions, bomEntries, views, title, includeDisassembled, dimDirectionToleranceDeg);

  const pdf = new PdfBuilder();

  const fontId = pdf.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const gsFillId = pdf.addObject('<< /Type /ExtGState /CA 0.28 /ca 0.28 >>');
  const resourcesId = pdf.addObject(`<< /Font << /F1 ${fontId} 0 R >> /ExtGState << /GSfill ${gsFillId} 0 R >> >>`);

  const pagesId = 3 + pages.length * 2 + 1;
  const pageIds: number[] = [];

  pages.forEach((page) => {
    const content = buildPageContent(page, views, dimDirectionToleranceDeg);
    const contentId = pdf.addStreamObject('', content);
    const pageId = pdf.addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`,
    );
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
    bomItemCount: collectBomRows(bomEntries).length,
  };
}

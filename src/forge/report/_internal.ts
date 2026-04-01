/**
 * Shared internal types, interfaces, and constants for the report module.
 * Not exported publicly.
 */

import type { ColorRgb, Vec2 } from '../export/pdfUtils';
import type { DimensionDef } from '../sketch/dimensions';
import type { ReportViewId } from './types';

export type Vec3 = [number, number, number];
export type Segment2 = { a: Vec2; b: Vec2 };

export type Bounds2 = { minX: number; minY: number; maxX: number; maxY: number };
export type Bounds3 = { min: Vec3; max: Vec3 };

export interface ProjectedEdge {
  modelA: Vec2;
  modelB: Vec2;
  mid: Vec2;
  lenModel: number;
}

export interface ReportTriangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  normal: Vec3;
}

export interface ReportEdge {
  a: Vec3;
  b: Vec3;
}

export interface ReportObject {
  id: string;
  name: string;
  groupName?: string;
  bbox: Bounds3;
  color: ColorRgb;
  opacity: number;
  triangles: ReportTriangle[];
  edges: ReportEdge[];
}

export interface ViewFrame {
  id: ReportViewId;
  label: string;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
}

export interface ViewProjection {
  x: number;
  y: number;
  depth: number;
}

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StandardPageSpec {
  kind: 'standard';
  title: string;
  subtitle: string;
  objects: ReportObject[];
  dimensions: DimensionDef[];
}

export interface BomReportRow {
  key: string;
  description: string;
  unit: string;
  quantity: number;
}

export interface BomPageSpec {
  kind: 'bom';
  title: string;
  subtitle: string;
  rows: BomReportRow[];
  rowOffset: number;
  pageIndex: number;
  pageCount: number;
}

export type PageSpec = StandardPageSpec | BomPageSpec;

export interface DimensionOwnership {
  byId: Map<string, string[]>;
  combined: DimensionDef[];
  byComponent: Map<string, DimensionDef[]>;
}

export interface ComponentPageGroup {
  representative: ReportObject;
  dimensions: DimensionDef[];
  instanceCount: number;
}

export interface DimensionOffsetBasis {
  dir3: Vec3;
  proj: Vec2;
  projDir: Vec2;
  projLen: number;
}

export type LabelBox = { minX: number; minY: number; maxX: number; maxY: number };

export interface DimensionLabelPlan {
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

export interface PlacedLabel {
  plan: DimensionLabelPlan;
  pos: Vec2;
  box: LabelBox;
  text: string;
  fallback: boolean;
}

export interface LabelLegendEntry {
  index: number;
  text: string;
  color: ColorRgb;
}

export interface DimensionLabelLayout {
  placements: PlacedLabel[];
  legend: LabelLegendEntry[];
}

export interface LegendPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  lineHeight: number;
  rows: LabelLegendEntry[];
  hiddenCount: number;
}

export interface DrawDimensionResult {
  graphicsCmd: string;
  labelPlan: DimensionLabelPlan | null;
  lineSegments: Segment2[];
}

export interface AutoLaneEntry {
  dimId: string;
  angle: number;
  tangent: Vec2;
  spanMin: number;
  spanMax: number;
  normalCoord: number;
  preferredSide: number;
  lenPx: number;
}

export interface DenseColorEntry {
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

export interface RenderViewCellOptions {
  drawFrame?: boolean;
}

// --- Constants ---

export function normalizeToleranceDeg(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_DIM_DIRECTION_TOLERANCE_DEG;
  return Math.max(0, Math.min(90, v));
}

export const DEFAULT_VIEWS: ReportViewId[] = ['front', 'right', 'top', 'iso'];
export const DEFAULT_COLOR_HEX = '#5b9bd5';
export const HEADER_HEIGHT = 44;
export const CELL_GAP = 14;
export const CELL_PADDING = 14;
export const BOM_TABLE_ROW_HEIGHT = 18;
export const BOM_TABLE_HEADER_HEIGHT = 22;
export const BOM_TABLE_BOTTOM_PAD = 10;
export const BOM_MAX_ROWS_PER_PAGE = 22;
export const DEFAULT_DIM_DIRECTION_TOLERANCE_DEG = 60;
export const MIN_DIM_OFFSET_PX = 10;
export const DIM_CLEARANCE_PX = 6;
export const DENSE_DIM_COLOR_PALETTE: ColorRgb[] = [
  [0.91, 0.38, 0.27], // warm red
  [0.16, 0.62, 0.86], // cyan blue
  [0.96, 0.72, 0.2], // amber
  [0.34, 0.76, 0.43], // green
  [0.77, 0.52, 0.92], // violet
  [0.93, 0.45, 0.65], // rose
  [0.44, 0.83, 0.78], // teal
];
export const MAX_LABEL_GEOMETRY_SEGMENTS = 2200;
export const MAX_FILL_TRIANGLES_PER_OBJECT = 12000;
export const MAX_EDGE_SEGMENTS_PER_OBJECT = 45000;

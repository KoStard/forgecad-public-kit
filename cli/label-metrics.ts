import type { ConstraintDisplay, SketchConstraintMeta } from '../src/forge/sketch/constraints/types.js';

// ─── Public types ───────────────────────────────────────────────────────────

export interface LabelMetrics {
  /** Number of label pairs whose text bounding boxes overlap */
  labelLabelOverlaps: number;
  /** Number of labels whose bounding box intersects an edge segment */
  labelEdgeOverlaps: number;
  /** Average distance from each label to the centroid of its constrained entities */
  meanEntityDistance: number;
  /** Max distance from any label to its entity centroid */
  maxEntityDistance: number;
  /** Total number of labels */
  labelCount: number;
  /** Per-label details for debugging */
  details: LabelDetail[];
}

export interface LabelDetail {
  id: string;
  label: string;
  position: [number, number];
  bbox: BBox;
  entityDistance: number;
  overlapsLabels: string[]; // IDs of overlapping labels
  overlapsEdges: number; // count of edge intersections
}

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Text bounding-box estimation ───────────────────────────────────────────

const FONT_SIZE = 2;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const TEXT_HEIGHT = FONT_SIZE * 1.2;

function estimateBBox(pos: [number, number], text: string): BBox {
  const textWidth = text.length * CHAR_WIDTH;
  return {
    x: pos[0] - textWidth / 2,
    y: pos[1] - TEXT_HEIGHT / 2,
    width: textWidth,
    height: TEXT_HEIGHT,
  };
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

function bboxesOverlap(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Test whether a line segment (p0→p1) intersects an axis-aligned bounding box. */
function segmentIntersectsAABB(x1: number, y1: number, x2: number, y2: number, box: BBox): boolean {
  // Liang-Barsky algorithm for segment vs AABB
  const dx = x2 - x1;
  const dy = y2 - y1;
  const xmin = box.x;
  const xmax = box.x + box.width;
  const ymin = box.y;
  const ymax = box.y + box.height;

  let tmin = 0;
  let tmax = 1;

  const edges = [
    { p: -dx, q: x1 - xmin },
    { p: dx, q: xmax - x1 },
    { p: -dy, q: y1 - ymin },
    { p: dy, q: ymax - y1 },
  ];

  for (const { p, q } of edges) {
    if (Math.abs(p) < 1e-12) {
      // Segment is parallel to this edge
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > tmax) return false;
        if (t > tmin) tmin = t;
      } else {
        if (t < tmin) return false;
        if (t < tmax) tmax = t;
      }
    }
  }

  return tmin <= tmax;
}

function dist(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

// ─── Entity centroid lookup ─────────────────────────────────────────────────

function computeEntityCentroid(entityIds: string[], meta: SketchConstraintMeta): [number, number] | null {
  const positions: [number, number][] = [];

  // Build lookup maps
  const pointMap = new Map(meta.edges.points.map((p) => [p.id, p.pos]));
  const lineMap = new Map(meta.edges.lines.map((l) => [l.id, l]));
  const circleMap = new Map(meta.edges.circles.map((c) => [c.id, c]));

  for (const eid of entityIds) {
    const pt = pointMap.get(eid);
    if (pt) {
      positions.push(pt);
      continue;
    }
    const line = lineMap.get(eid);
    if (line) {
      positions.push([(line.a[0] + line.b[0]) / 2, (line.a[1] + line.b[1]) / 2]);
      continue;
    }
    const circle = circleMap.get(eid);
    if (circle) {
      positions.push(circle.center);
    }
    // Entity not found in edges — skip
  }

  if (positions.length === 0) return null;

  const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length;
  const cy = positions.reduce((s, p) => s + p[1], 0) / positions.length;
  return [cx, cy];
}

// ─── Collect all line segments from edges ───────────────────────────────────

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function collectEdgeSegments(meta: SketchConstraintMeta): Segment[] {
  const segs: Segment[] = [];

  for (const line of meta.edges.lines) {
    segs.push({ x1: line.a[0], y1: line.a[1], x2: line.b[0], y2: line.b[1] });
  }

  // Approximate circles as polyline segments (16 segments per circle)
  for (const circle of meta.edges.circles) {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a0 = (2 * Math.PI * i) / n;
      const a1 = (2 * Math.PI * (i + 1)) / n;
      segs.push({
        x1: circle.center[0] + circle.radius * Math.cos(a0),
        y1: circle.center[1] + circle.radius * Math.sin(a0),
        x2: circle.center[0] + circle.radius * Math.cos(a1),
        y2: circle.center[1] + circle.radius * Math.sin(a1),
      });
    }
  }

  // Approximate arcs as polyline segments (8 segments per arc)
  for (const arc of meta.edges.arcs) {
    const startAngle = Math.atan2(arc.start[1] - arc.center[1], arc.start[0] - arc.center[0]);
    const endAngle = Math.atan2(arc.end[1] - arc.center[1], arc.end[0] - arc.center[0]);
    let sweep = endAngle - startAngle;
    if (arc.clockwise) {
      if (sweep > 0) sweep -= 2 * Math.PI;
    } else {
      if (sweep < 0) sweep += 2 * Math.PI;
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = startAngle + (sweep * i) / n;
      const a1 = startAngle + (sweep * (i + 1)) / n;
      segs.push({
        x1: arc.center[0] + arc.radius * Math.cos(a0),
        y1: arc.center[1] + arc.radius * Math.sin(a0),
        x2: arc.center[0] + arc.radius * Math.cos(a1),
        y2: arc.center[1] + arc.radius * Math.sin(a1),
      });
    }
  }

  return segs;
}

// ─── Main metric computation ────────────────────────────────────────────────

export function computeLabelMetrics(meta: SketchConstraintMeta): LabelMetrics {
  const allConstraints: ConstraintDisplay[] = [...meta.constraints, ...meta.rejected];
  const edgeSegments = collectEdgeSegments(meta);

  // Build per-label details
  const details: LabelDetail[] = allConstraints.map((c) => {
    const displayText = c.isDimension && c.value !== undefined ? `${c.label}${c.value}` : c.label;
    const bbox = estimateBBox(c.position, displayText);
    const centroid = computeEntityCentroid(c.entityIds, meta);
    const entityDistance = centroid ? dist(c.position, centroid) : 0;

    return {
      id: c.id,
      label: c.label,
      position: c.position,
      bbox,
      entityDistance,
      overlapsLabels: [],
      overlapsEdges: 0,
    };
  });

  // Label-label overlaps
  let labelLabelOverlaps = 0;
  for (let i = 0; i < details.length; i++) {
    for (let j = i + 1; j < details.length; j++) {
      if (bboxesOverlap(details[i].bbox, details[j].bbox)) {
        labelLabelOverlaps++;
        details[i].overlapsLabels.push(details[j].id);
        details[j].overlapsLabels.push(details[i].id);
      }
    }
  }

  // Label-edge overlaps
  let labelEdgeOverlaps = 0;
  for (const detail of details) {
    let count = 0;
    for (const seg of edgeSegments) {
      if (segmentIntersectsAABB(seg.x1, seg.y1, seg.x2, seg.y2, detail.bbox)) {
        count++;
      }
    }
    detail.overlapsEdges = count;
    if (count > 0) labelEdgeOverlaps++;
  }

  // Entity distance stats
  const distances = details.map((d) => d.entityDistance);
  const meanEntityDistance = distances.length > 0 ? distances.reduce((s, d) => s + d, 0) / distances.length : 0;
  const maxEntityDistance = distances.length > 0 ? Math.max(...distances) : 0;

  return {
    labelLabelOverlaps,
    labelEdgeOverlaps,
    meanEntityDistance,
    maxEntityDistance,
    labelCount: details.length,
    details,
  };
}

// ─── Human-readable summary ─────────────────────────────────────────────────

export function formatMetrics(metrics: LabelMetrics): string {
  return [
    `Label Quality Metrics (${metrics.labelCount} labels):`,
    `  Label-label overlaps:  ${metrics.labelLabelOverlaps}`,
    `  Label-edge overlaps:   ${metrics.labelEdgeOverlaps}`,
    `  Mean entity distance:  ${metrics.meanEntityDistance.toFixed(1)}`,
    `  Max entity distance:   ${metrics.maxEntityDistance.toFixed(1)}`,
  ].join('\n');
}

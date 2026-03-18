import type { Sketch } from './core';
import { isConstraintSketch } from './constraints/sketch';
import type { SketchConstraintMeta } from './constraints/types';

export interface SketchDxfOptions {
  /** DXF layer name. Default: "0" */
  layer?: string;
  /** DXF color index (1–255, AutoCAD ACI). Default: 7 (white/black) */
  colorIndex?: number;
}

/**
 * Export a 2D sketch as a DXF string (R12/AC1009 — maximally compatible).
 *
 * For regular sketches, each polygon loop becomes a closed LWPOLYLINE.
 * For constraint sketches, exports LINE, CIRCLE, and ARC entities from
 * the constraint edge geometry.
 */
export function sketchToDxf(sketch: Sketch, options: SketchDxfOptions = {}): string {
  const { layer = '0', colorIndex = 7 } = options;

  const loops = sketch.toPolygons() as number[][][];

  if (loops.length > 0) {
    return buildPolygonDxf(loops, layer, colorIndex);
  }

  // For constraint sketches with no polygon loops, export edge geometry.
  if (isConstraintSketch(sketch)) {
    return buildEdgeDxf(sketch.constraintMeta, layer, colorIndex);
  }

  // Empty sketch — return minimal valid DXF.
  return buildDxf([]);
}

// ─── Polygon-based DXF (regular sketches) ─────────────────────────────────

function buildPolygonDxf(loops: number[][][], layer: string, colorIndex: number): string {
  const entities: string[][] = [];

  for (const loop of loops) {
    if (loop.length < 2) continue;
    entities.push([
      '0', 'LWPOLYLINE',
      '8', layer,
      '62', String(colorIndex),
      '90', String(loop.length),
      '70', '1', // closed
      ...loop.flatMap(([x, y]) => ['10', fmtDxf(x), '20', fmtDxf(y)]),
    ]);
  }

  return buildDxf(entities);
}

// ─── Edge-based DXF (constraint sketches) ─────────────────────────────────

function buildEdgeDxf(meta: SketchConstraintMeta, layer: string, colorIndex: number): string {
  const { edges } = meta;
  const entities: string[][] = [];

  for (const l of edges.lines) {
    entities.push([
      '0', 'LINE',
      '8', layer,
      '62', String(colorIndex),
      '10', fmtDxf(l.a[0]),
      '20', fmtDxf(l.a[1]),
      '11', fmtDxf(l.b[0]),
      '21', fmtDxf(l.b[1]),
    ]);
  }

  for (const c of edges.circles) {
    entities.push([
      '0', 'CIRCLE',
      '8', layer,
      '62', String(colorIndex),
      '10', fmtDxf(c.center[0]),
      '20', fmtDxf(c.center[1]),
      '40', fmtDxf(c.radius),
    ]);
  }

  for (const a of edges.arcs) {
    const startAngle = Math.atan2(a.start[1] - a.center[1], a.start[0] - a.center[0]) * 180 / Math.PI;
    const endAngle = Math.atan2(a.end[1] - a.center[1], a.end[0] - a.center[0]) * 180 / Math.PI;

    // DXF ARC goes counter-clockwise from start to end angle.
    // If the arc is clockwise, swap start/end.
    entities.push([
      '0', 'ARC',
      '8', layer,
      '62', String(colorIndex),
      '10', fmtDxf(a.center[0]),
      '20', fmtDxf(a.center[1]),
      '40', fmtDxf(a.radius),
      '50', fmtDxf(a.clockwise ? endAngle : startAngle),
      '51', fmtDxf(a.clockwise ? startAngle : endAngle),
    ]);
  }

  return buildDxf(entities);
}

// ─── Shared DXF builder ───────────────────────────────────────────────────

function buildDxf(entities: string[][]): string {
  const sections: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  for (const entity of entities) {
    sections.push(...entity);
  }

  sections.push('0', 'ENDSEC', '0', 'EOF');
  return sections.join('\n') + '\n';
}

function fmtDxf(n: number): string {
  return n.toFixed(6);
}

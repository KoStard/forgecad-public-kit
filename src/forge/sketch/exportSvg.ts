import type { Sketch } from './core';
import { isConstraintSketch } from './constraints/sketch';
import type { SketchConstraintMeta } from './constraints/types';

export interface SketchSvgOptions {
  /** Stroke color. Default: "black" */
  stroke?: string;
  /** Stroke width in sketch units. Default: 0.5 */
  strokeWidth?: number;
  /** Fill color. Default: "none" */
  fill?: string;
  /** Padding around the sketch bounding box in sketch units. Default: 2 */
  padding?: number;
  /** If set, scale so 1 sketch-unit = this many px. Otherwise auto-fit. */
  pixelsPerUnit?: number;
}

/**
 * Export a 2D sketch as an SVG string.
 *
 * For regular sketches, exports filled polygon regions.
 * For constraint sketches, exports line/arc/circle edge geometry.
 *
 * The SVG uses the sketch's native coordinate system (Y-up) with a
 * transform that flips Y so the output renders correctly in SVG's Y-down
 * space. Coordinates are in sketch units (typically mm).
 */
export function sketchToSvg(sketch: Sketch, options: SketchSvgOptions = {}): string {
  const {
    stroke = 'black',
    strokeWidth = 0.5,
    fill = 'none',
    padding = 2,
  } = options;

  // Constraint sketches: always use edge geometry to preserve all individual
  // lines (including internal/shared edges that toPolygons() would merge away).
  if (isConstraintSketch(sketch)) {
    return buildEdgeSvg(sketch.constraintMeta, stroke, strokeWidth, padding, options.pixelsPerUnit);
  }

  // Regular sketches: export filled polygon regions.
  const loops = sketch.toPolygons() as number[][][];
  if (loops.length > 0) {
    return buildPolygonSvg(loops, stroke, strokeWidth, fill, padding, options.pixelsPerUnit);
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"/>';
}

// ─── Polygon-based SVG (regular sketches with filled regions) ─────────────

function buildPolygonSvg(
  loops: number[][][],
  stroke: string,
  strokeWidth: number,
  fill: string,
  padding: number,
  pixelsPerUnit?: number,
): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const loop of loops) {
    for (const [x, y] of loop) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const pathParts: string[] = [];
  for (const loop of loops) {
    if (loop.length < 2) continue;
    const [sx, sy] = loop[0];
    const segments = [`M ${fmt(sx)} ${fmt(sy)}`];
    for (let i = 1; i < loop.length; i++) {
      segments.push(`L ${fmt(loop[i][0])} ${fmt(loop[i][1])}`);
    }
    segments.push('Z');
    pathParts.push(segments.join(' '));
  }

  return wrapSvg(
    minX, minY, maxX, maxY, padding, pixelsPerUnit,
    `    <path d="${pathParts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}" fill-rule="evenodd"/>`,
  );
}

// ─── Edge-based SVG (constraint sketches — lines, arcs, circles) ──────────

function buildEdgeSvg(
  meta: SketchConstraintMeta,
  stroke: string,
  strokeWidth: number,
  padding: number,
  pixelsPerUnit?: number,
): string {
  const { edges } = meta;
  if (edges.lines.length === 0 && edges.circles.length === 0 && edges.arcs.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"/>';
  }

  // Compute bounding box from all edge geometry.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const expand = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const l of edges.lines) {
    expand(l.a[0], l.a[1]);
    expand(l.b[0], l.b[1]);
  }
  for (const c of edges.circles) {
    expand(c.center[0] - c.radius, c.center[1] - c.radius);
    expand(c.center[0] + c.radius, c.center[1] + c.radius);
  }
  for (const a of edges.arcs) {
    expand(a.start[0], a.start[1]);
    expand(a.end[0], a.end[1]);
    expand(a.center[0], a.center[1]);
  }

  // Build SVG elements.
  const elements: string[] = [];

  for (const l of edges.lines) {
    elements.push(
      `    <line x1="${fmt(l.a[0])}" y1="${fmt(l.a[1])}" x2="${fmt(l.b[0])}" y2="${fmt(l.b[1])}" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}"/>`,
    );
  }

  for (const c of edges.circles) {
    elements.push(
      `    <circle cx="${fmt(c.center[0])}" cy="${fmt(c.center[1])}" r="${fmt(c.radius)}" fill="none" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}"/>`,
    );
  }

  for (const a of edges.arcs) {
    const dx1 = a.start[0] - a.center[0];
    const dy1 = a.start[1] - a.center[1];
    const dx2 = a.end[0] - a.center[0];
    const dy2 = a.end[1] - a.center[1];
    let startAngle = Math.atan2(dy1, dx1);
    let endAngle = Math.atan2(dy2, dx2);

    // Compute sweep angle.
    let sweep: number;
    if (a.clockwise) {
      sweep = startAngle - endAngle;
      if (sweep <= 0) sweep += 2 * Math.PI;
    } else {
      sweep = endAngle - startAngle;
      if (sweep <= 0) sweep += 2 * Math.PI;
    }

    const largeArc = sweep > Math.PI ? 1 : 0;
    // SVG sweep-flag: 1 = clockwise in SVG's Y-down space.
    // Since we flip Y, we invert the sweep direction.
    const sweepFlag = a.clockwise ? 0 : 1;

    elements.push(
      `    <path d="M ${fmt(a.start[0])} ${fmt(a.start[1])} A ${fmt(a.radius)} ${fmt(a.radius)} 0 ${largeArc} ${sweepFlag} ${fmt(a.end[0])} ${fmt(a.end[1])}" fill="none" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}"/>`,
    );
  }

  return wrapSvg(minX, minY, maxX, maxY, padding, pixelsPerUnit, elements.join('\n'));
}

// ─── Shared SVG wrapper ───────────────────────────────────────────────────

function wrapSvg(
  minX: number, minY: number, maxX: number, maxY: number,
  padding: number, pixelsPerUnit: number | undefined,
  content: string,
): string {
  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = maxX - minX + padding * 2;
  const vbH = maxY - minY + padding * 2;

  const flipY = `translate(0, ${fmt(minY + maxY)}) scale(1, -1)`;

  let widthHeight = '';
  if (pixelsPerUnit) {
    const w = vbW * pixelsPerUnit;
    const h = vbH * pixelsPerUnit;
    widthHeight = ` width="${fmt(w)}" height="${fmt(h)}"`;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}"${widthHeight}>`,
    `  <g transform="${flipY}">`,
    content,
    `  </g>`,
    `</svg>`,
  ].join('\n');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

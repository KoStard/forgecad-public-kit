import type { Sketch } from './core';

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

  const loops = sketch.toPolygons() as number[][][];
  if (loops.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"/>';
  }

  // Compute bounding box across all loops.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const loop of loops) {
    for (const [x, y] of loop) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const vbX = minX - padding;
  const vbY = minY - padding;
  const vbW = maxX - minX + padding * 2;
  const vbH = maxY - minY + padding * 2;

  // Build path data — one sub-path per loop.
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

  const d = pathParts.join(' ');

  // SVG coordinate system is Y-down; sketch is Y-up. We flip Y via a
  // transform on the group so exported coordinates stay in sketch units.
  const flipY = `translate(0, ${fmt(minY + maxY)}) scale(1, -1)`;

  let widthHeight = '';
  if (options.pixelsPerUnit) {
    const w = vbW * options.pixelsPerUnit;
    const h = vbH * options.pixelsPerUnit;
    widthHeight = ` width="${fmt(w)}" height="${fmt(h)}"`;
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(vbX)} ${fmt(vbY)} ${fmt(vbW)} ${fmt(vbH)}"${widthHeight}>`,
    `  <g transform="${flipY}">`,
    `    <path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${fmt(strokeWidth)}" fill-rule="evenodd"/>`,
    `  </g>`,
    `</svg>`,
  ].join('\n');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

import type { Sketch } from '../src/forge/headless';

export interface SketchSvgEntry {
  name?: string;
  sketch: Sketch;
}

export interface SketchSvgDocument {
  svg: string;
  width: number;
  height: number;
  area: number;
  pathCount: number;
}

interface SketchBounds {
  min: [number, number];
  max: [number, number];
}

interface PreparedSketchSvgEntry {
  name?: string;
  polygons: number[][][];
  bounds: SketchBounds;
  area: number;
}

function combineBounds(left: SketchBounds, right: SketchBounds): SketchBounds {
  return {
    min: [
      Math.min(left.min[0], right.min[0]),
      Math.min(left.min[1], right.min[1]),
    ],
    max: [
      Math.max(left.max[0], right.max[0]),
      Math.max(left.max[1], right.max[1]),
    ],
  };
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function polygonPath(poly: number[][]): string {
  return `${poly
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(3)},${(-point[1]).toFixed(3)}`)
    .join(' ')} Z`;
}

function prepareEntry(entry: SketchSvgEntry): PreparedSketchSvgEntry {
  const polygons = entry.sketch.toPolygons();
  if (polygons.length === 0) {
    throw new Error(
      entry.name
        ? `Sketch "${entry.name}" exported no polygons.`
        : 'Sketch export produced no polygons.',
    );
  }

  const bounds = entry.sketch.bounds();
  return {
    name: entry.name,
    polygons,
    bounds: {
      min: [bounds.min[0], bounds.min[1]],
      max: [bounds.max[0], bounds.max[1]],
    },
    area: entry.sketch.area(),
  };
}

export function buildSketchSvgDocument(entries: readonly SketchSvgEntry[]): SketchSvgDocument {
  if (entries.length === 0) {
    throw new Error('Sketch SVG export requires at least one sketch payload.');
  }

  const prepared = entries.map(prepareEntry);
  const combinedBounds = prepared.reduce((acc, entry) => combineBounds(acc, entry.bounds), prepared[0].bounds);
  const margin = 2;
  const minX = combinedBounds.min[0] - margin;
  const maxX = combinedBounds.max[0] + margin;
  const minY = combinedBounds.min[1] - margin;
  const maxY = combinedBounds.max[1] + margin;
  const width = maxX - minX;
  const height = maxY - minY;

  let pathCount = 0;
  const body = prepared.map((entry) => {
    const label = entry.name ? ` data-name="${escapeAttribute(entry.name)}"` : '';
    const paths = entry.polygons.map((poly) => {
      pathCount += 1;
      return `    <path d="${polygonPath(poly)}" fill="#4488cc" stroke="#224466" stroke-width="0.3"/>`;
    }).join('\n');
    return `  <g${label}>\n${paths}\n  </g>`;
  }).join('\n');

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${(-maxY).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}" width="${Math.max(width * 4, 400)}" height="${Math.max(height * 4, 400)}">
  <rect x="${minX.toFixed(1)}" y="${(-maxY).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="#2a2a2a"/>
${body}
</svg>`,
    width,
    height,
    area: prepared.reduce((sum, entry) => sum + entry.area, 0),
    pathCount,
  };
}

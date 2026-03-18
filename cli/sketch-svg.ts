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

// ─── Constraint wireframe SVG renderer ─────────────────────────────────────────

import type { SketchConstraintMeta, ConstraintDisplay, AnnotationElement, ConstraintSymbol } from '../src/forge/sketch/constraints/types';

export interface ConstraintSvgOptions {
  /** Show constraint labels. Default true. */
  showLabels?: boolean;
  /** Show construction geometry. Default true. */
  showConstruction?: boolean;
  /** Show vertex dots. Default true. */
  showPoints?: boolean;
  /** Show rejected constraints list. Default true. */
  showRejected?: boolean;
}

function tessellateArc(
  center: [number, number],
  start: [number, number],
  end: [number, number],
  radius: number,
  clockwise: boolean,
  segments: number,
): [number, number][] {
  const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
  const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);

  let sweep = endAngle - startAngle;
  const direction = clockwise ? -1 : 1;

  // Normalize sweep to match direction
  if (clockwise) {
    if (sweep > 0) sweep -= 2 * Math.PI;
    sweep = -sweep; // make positive for iteration
  } else {
    if (sweep < 0) sweep += 2 * Math.PI;
  }

  const points: [number, number][] = [start];
  for (let k = 1; k <= segments; k++) {
    const t = (k / segments) * sweep;
    const angle = startAngle + direction * t;
    points.push([
      center[0] + radius * Math.cos(angle),
      center[1] + radius * Math.sin(angle),
    ]);
  }
  return points;
}

function computeConstraintBounds(meta: SketchConstraintMeta, opts: Required<ConstraintSvgOptions>): SketchBounds {
  const bounds: SketchBounds = {
    min: [Infinity, Infinity],
    max: [-Infinity, -Infinity],
  };

  function expandPoint(x: number, y: number): void {
    bounds.min[0] = Math.min(bounds.min[0], x);
    bounds.min[1] = Math.min(bounds.min[1], y);
    bounds.max[0] = Math.max(bounds.max[0], x);
    bounds.max[1] = Math.max(bounds.max[1], y);
  }

  // Edge lines
  for (const line of meta.edges.lines) {
    expandPoint(line.a[0], line.a[1]);
    expandPoint(line.b[0], line.b[1]);
  }
  // Edge circles
  for (const circle of meta.edges.circles) {
    expandPoint(circle.center[0] - circle.radius, circle.center[1] - circle.radius);
    expandPoint(circle.center[0] + circle.radius, circle.center[1] + circle.radius);
  }
  // Edge arcs
  for (const arc of meta.edges.arcs) {
    expandPoint(arc.start[0], arc.start[1]);
    expandPoint(arc.end[0], arc.end[1]);
    expandPoint(arc.center[0] - arc.radius, arc.center[1] - arc.radius);
    expandPoint(arc.center[0] + arc.radius, arc.center[1] + arc.radius);
  }
  // Edge points
  for (const pt of meta.edges.points) {
    expandPoint(pt.pos[0], pt.pos[1]);
  }

  // Construction geometry
  if (opts.showConstruction) {
    for (const line of meta.construction.lines) {
      expandPoint(line.a[0], line.a[1]);
      expandPoint(line.b[0], line.b[1]);
    }
    for (const circle of meta.construction.circles) {
      expandPoint(circle.center[0] - circle.radius, circle.center[1] - circle.radius);
      expandPoint(circle.center[0] + circle.radius, circle.center[1] + circle.radius);
    }
    for (const arc of meta.construction.arcs) {
      expandPoint(arc.start[0], arc.start[1]);
      expandPoint(arc.end[0], arc.end[1]);
    }
  }

  // Fallback if nothing contributed
  if (!isFinite(bounds.min[0])) {
    bounds.min = [-10, -10];
    bounds.max = [10, 10];
  }

  return bounds;
}

function constraintColor(c: ConstraintDisplay): string {
  if (c.isConflicting) return '#ff6b6b';
  if (c.isRedundant) return '#faad14';
  return '#4ade80';
}

function statusColor(status: SketchConstraintMeta['status']): string {
  switch (status) {
    case 'fully': return '#4ade80';
    case 'under': return '#60a5fa';
    case 'over': return '#ff6b6b';
    case 'over-redundant': return '#faad14';
  }
}

// ─── SVG symbol paths for constraint annotations ─────────────────────────────
// Each symbol is rendered as SVG path(s) centered on the annotation position.
// Size is ~2 SVG units. Rotation is applied via transform.

function renderSymbol(pos: [number, number], symbol: ConstraintSymbol, color: string, rotation?: number): string[] {
  const x = pos[0].toFixed(3);
  const y = (-pos[1]).toFixed(3);
  const rot = rotation !== undefined ? ` transform="rotate(${(-rotation * 180 / Math.PI).toFixed(1)} ${x} ${y})"` : '';
  const S = 1.2; // half-size of symbol

  switch (symbol) {
    case 'parallel': {
      // Two chevron ticks >>
      const lines = [
        `<line x1="${(pos[0] - S * 0.3).toFixed(3)}" y1="${(-pos[1] - S * 0.5).toFixed(3)}" x2="${(pos[0] + S * 0.3).toFixed(3)}" y2="${(-pos[1]).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
        `<line x1="${(pos[0] + S * 0.3).toFixed(3)}" y1="${(-pos[1]).toFixed(3)}" x2="${(pos[0] - S * 0.3).toFixed(3)}" y2="${(-pos[1] + S * 0.5).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
        `<line x1="${(pos[0] + S * 0.1).toFixed(3)}" y1="${(-pos[1] - S * 0.5).toFixed(3)}" x2="${(pos[0] + S * 0.7).toFixed(3)}" y2="${(-pos[1]).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
        `<line x1="${(pos[0] + S * 0.7).toFixed(3)}" y1="${(-pos[1]).toFixed(3)}" x2="${(pos[0] + S * 0.1).toFixed(3)}" y2="${(-pos[1] + S * 0.5).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
      ];
      return lines.map(l => `    ${l}`);
    }
    case 'equal': {
      // Two horizontal tick marks =
      return [
        `    <line x1="${(pos[0] - S * 0.5).toFixed(3)}" y1="${(-pos[1] - S * 0.2).toFixed(3)}" x2="${(pos[0] + S * 0.5).toFixed(3)}" y2="${(-pos[1] - S * 0.2).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
        `    <line x1="${(pos[0] - S * 0.5).toFixed(3)}" y1="${(-pos[1] + S * 0.2).toFixed(3)}" x2="${(pos[0] + S * 0.5).toFixed(3)}" y2="${(-pos[1] + S * 0.2).toFixed(3)}" stroke="${color}" stroke-width="0.3"${rot}/>`,
      ];
    }
    case 'perpendicular': {
      // Small right-angle box
      return [
        `    <polyline points="${(pos[0] + S * 0.6).toFixed(3)},${(-pos[1]).toFixed(3)} ${(pos[0]).toFixed(3)},${(-pos[1]).toFixed(3)} ${(pos[0]).toFixed(3)},${(-pos[1] + S * 0.6).toFixed(3)}" fill="none" stroke="${color}" stroke-width="0.3"${rot}/>`,
      ];
    }
    case 'horizontal':
      return [`    <text x="${x}" y="${y}" fill="${color}" font-size="1.8" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" font-weight="bold">H</text>`];
    case 'vertical':
      return [`    <text x="${x}" y="${y}" fill="${color}" font-size="1.8" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" font-weight="bold">V</text>`];
    case 'fixed': {
      // Ground hatching: horizontal line + diagonal hash marks below
      return [
        `    <line x1="${(pos[0] - S).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0] + S).toFixed(3)}" y2="${(-pos[1] + S * 0.3).toFixed(3)}" stroke="${color}" stroke-width="0.3"/>`,
        `    <line x1="${(pos[0] - S * 0.7).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0] - S).toFixed(3)}" y2="${(-pos[1] + S * 0.8).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`,
        `    <line x1="${(pos[0] - S * 0.2).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0] - S * 0.5).toFixed(3)}" y2="${(-pos[1] + S * 0.8).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`,
        `    <line x1="${(pos[0] + S * 0.3).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0]).toFixed(3)}" y2="${(-pos[1] + S * 0.8).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`,
        `    <line x1="${(pos[0] + S * 0.8).toFixed(3)}" y1="${(-pos[1] + S * 0.3).toFixed(3)}" x2="${(pos[0] + S * 0.5).toFixed(3)}" y2="${(-pos[1] + S * 0.8).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`,
      ];
    }
    case 'midpoint': {
      // Small diamond
      return [
        `    <polygon points="${x},${(-(pos[1]) - S * 0.5).toFixed(3)} ${(pos[0] + S * 0.4).toFixed(3)},${y} ${x},${(-(pos[1]) + S * 0.5).toFixed(3)} ${(pos[0] - S * 0.4).toFixed(3)},${y}" fill="${color}" opacity="0.7"/>`,
      ];
    }
    case 'coincident': {
      // Bullseye: filled circle + ring
      return [
        `    <circle cx="${x}" cy="${y}" r="${(S * 0.5).toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.25"/>`,
        `    <circle cx="${x}" cy="${y}" r="${(S * 0.15).toFixed(2)}" fill="${color}"/>`,
      ];
    }
    case 'collinear': {
      // Small filled dot
      return [
        `    <circle cx="${x}" cy="${y}" r="${(S * 0.3).toFixed(2)}" fill="${color}" opacity="0.8"/>`,
      ];
    }
    case 'tangent':
      return [`    <text x="${x}" y="${y}" fill="${color}" font-size="1.6" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" font-weight="bold">T</text>`];
    case 'concentric': {
      // Two concentric circles
      return [
        `    <circle cx="${x}" cy="${y}" r="${(S * 0.3).toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.25"/>`,
        `    <circle cx="${x}" cy="${y}" r="${(S * 0.6).toFixed(2)}" fill="none" stroke="${color}" stroke-width="0.25"/>`,
      ];
    }
    case 'ccw': {
      // Small curved arrow (arc + arrowhead)
      const r = S * 0.6;
      return [
        `    <path d="M${(pos[0] + r).toFixed(3)},${(-pos[1]).toFixed(3)} A${r.toFixed(3)},${r.toFixed(3)} 0 1,0 ${(pos[0]).toFixed(3)},${(-pos[1] - r).toFixed(3)}" fill="none" stroke="${color}" stroke-width="0.3"/>`,
        `    <polygon points="${(pos[0]).toFixed(3)},${(-pos[1] - r - S * 0.3).toFixed(3)} ${(pos[0] + S * 0.25).toFixed(3)},${(-pos[1] - r + S * 0.1).toFixed(3)} ${(pos[0] - S * 0.25).toFixed(3)},${(-pos[1] - r + S * 0.1).toFixed(3)}" fill="${color}"/>`,
      ];
    }
    case 'symmetric': {
      // Small mirror mark (two opposing triangles)
      return [
        `    <polygon points="${(pos[0] - S * 0.3).toFixed(3)},${(-pos[1] - S * 0.3).toFixed(3)} ${(pos[0]).toFixed(3)},${(-pos[1]).toFixed(3)} ${(pos[0] - S * 0.3).toFixed(3)},${(-pos[1] + S * 0.3).toFixed(3)}" fill="${color}" opacity="0.7"/>`,
        `    <polygon points="${(pos[0] + S * 0.3).toFixed(3)},${(-pos[1] - S * 0.3).toFixed(3)} ${(pos[0]).toFixed(3)},${(-pos[1]).toFixed(3)} ${(pos[0] + S * 0.3).toFixed(3)},${(-pos[1] + S * 0.3).toFixed(3)}" fill="${color}" opacity="0.7"/>`,
      ];
    }
    default:
      return [`    <text x="${x}" y="${y}" fill="${color}" font-size="1.5" font-family="sans-serif" text-anchor="middle">?</text>`];
  }
}

function renderDimension(ann: Extract<AnnotationElement, { kind: 'dimension' }>, color: string): string[] {
  const { from, to, offset, value } = ann;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return [];

  // Perpendicular unit vector (for offset direction)
  const nx = -dy / len;
  const ny = dx / len;

  // Offset points (where the dimension line runs)
  const o = offset;
  const p1: [number, number] = [from[0] + nx * o, from[1] + ny * o];
  const p2: [number, number] = [to[0] + nx * o, to[1] + ny * o];

  // Extension lines (from entity to dimension line)
  const extLen = Math.abs(o) + 0.5;
  const extDir = o >= 0 ? 1 : -1;
  const e1a: [number, number] = [from[0] + nx * 0.3 * extDir, from[1] + ny * 0.3 * extDir];
  const e1b: [number, number] = [from[0] + nx * extLen * extDir, from[1] + ny * extLen * extDir];
  const e2a: [number, number] = [to[0] + nx * 0.3 * extDir, to[1] + ny * 0.3 * extDir];
  const e2b: [number, number] = [to[0] + nx * extLen * extDir, to[1] + ny * extLen * extDir];

  // Arrowhead size
  const arrowLen = Math.min(1.0, len * 0.15);
  const arrowW = arrowLen * 0.35;
  const udx = dx / len;
  const udy = dy / len;

  // Arrow at p1 (pointing toward p2)
  const a1tip = p1;
  const a1l: [number, number] = [p1[0] + udx * arrowLen + nx * arrowW, p1[1] + udy * arrowLen + ny * arrowW];
  const a1r: [number, number] = [p1[0] + udx * arrowLen - nx * arrowW, p1[1] + udy * arrowLen - ny * arrowW];

  // Arrow at p2 (pointing toward p1)
  const a2tip = p2;
  const a2l: [number, number] = [p2[0] - udx * arrowLen + nx * arrowW, p2[1] - udy * arrowLen + ny * arrowW];
  const a2r: [number, number] = [p2[0] - udx * arrowLen - nx * arrowW, p2[1] - udy * arrowLen - ny * arrowW];

  // Value text at midpoint of dimension line
  const mid: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

  const parts: string[] = [];

  // Extension lines (thin)
  if (Math.abs(o) > 0.5) {
    parts.push(`    <line x1="${e1a[0].toFixed(3)}" y1="${(-e1a[1]).toFixed(3)}" x2="${e1b[0].toFixed(3)}" y2="${(-e1b[1]).toFixed(3)}" stroke="${color}" stroke-width="0.15" opacity="0.6"/>`);
    parts.push(`    <line x1="${e2a[0].toFixed(3)}" y1="${(-e2a[1]).toFixed(3)}" x2="${e2b[0].toFixed(3)}" y2="${(-e2b[1]).toFixed(3)}" stroke="${color}" stroke-width="0.15" opacity="0.6"/>`);
  }

  // Dimension line
  parts.push(`    <line x1="${p1[0].toFixed(3)}" y1="${(-p1[1]).toFixed(3)}" x2="${p2[0].toFixed(3)}" y2="${(-p2[1]).toFixed(3)}" stroke="${color}" stroke-width="0.2"/>`);

  // Arrowheads
  parts.push(`    <polygon points="${a1tip[0].toFixed(3)},${(-a1tip[1]).toFixed(3)} ${a1l[0].toFixed(3)},${(-a1l[1]).toFixed(3)} ${a1r[0].toFixed(3)},${(-a1r[1]).toFixed(3)}" fill="${color}"/>`);
  parts.push(`    <polygon points="${a2tip[0].toFixed(3)},${(-a2tip[1]).toFixed(3)} ${a2l[0].toFixed(3)},${(-a2l[1]).toFixed(3)} ${a2r[0].toFixed(3)},${(-a2r[1]).toFixed(3)}" fill="${color}"/>`);

  // Value text
  parts.push(`    <text x="${mid[0].toFixed(3)}" y="${(-mid[1] - 0.8).toFixed(3)}" fill="${color}" font-size="1.8" font-family="sans-serif" text-anchor="middle" font-weight="bold">${escapeAttribute(value)}</text>`);

  return parts;
}

function renderAngleArc(ann: Extract<AnnotationElement, { kind: 'angle-arc' }>, color: string): string[] {
  const { center, startAngle, endAngle, radius, value } = ann;
  const cx = center[0];
  const cy = center[1];

  // Compute arc endpoints
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);

  // Determine sweep
  let sweep = endAngle - startAngle;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
  const sweepFlag = sweep > 0 ? 0 : 1; // SVG Y is inverted

  // Value text at arc midpoint
  const midAngle = startAngle + sweep / 2;
  const textR = radius + 1.2;
  const tx = cx + textR * Math.cos(midAngle);
  const ty = cy + textR * Math.sin(midAngle);

  return [
    `    <path d="M${x1.toFixed(3)},${(-y1).toFixed(3)} A${radius.toFixed(3)},${radius.toFixed(3)} 0 ${largeArc},${sweepFlag} ${x2.toFixed(3)},${(-y2).toFixed(3)}" fill="none" stroke="${color}" stroke-width="0.3"/>`,
    `    <text x="${tx.toFixed(3)}" y="${(-ty).toFixed(3)}" fill="${color}" font-size="1.6" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">${escapeAttribute(value)}</text>`,
  ];
}

function renderAnnotation(ann: AnnotationElement, color: string): string[] {
  switch (ann.kind) {
    case 'symbol':
      return renderSymbol(ann.position, ann.symbol, color, ann.rotation);
    case 'dimension':
      return renderDimension(ann, color);
    case 'angle-arc':
      return renderAngleArc(ann, color);
    case 'text':
      return [`    <text x="${ann.position[0].toFixed(3)}" y="${(-ann.position[1]).toFixed(3)}" fill="${color}" font-size="2" font-family="sans-serif" text-anchor="middle">${escapeAttribute(ann.text)}</text>`];
  }
}

export function buildConstraintSvgDocument(meta: SketchConstraintMeta, options?: ConstraintSvgOptions): string {
  const opts: Required<ConstraintSvgOptions> = {
    showLabels: options?.showLabels ?? true,
    showConstruction: options?.showConstruction ?? true,
    showPoints: options?.showPoints ?? true,
    showRejected: options?.showRejected ?? true,
  };

  const margin = 5;
  const bounds = computeConstraintBounds(meta, opts);
  const minX = bounds.min[0] - margin;
  const maxX = bounds.max[0] + margin;
  const minY = bounds.min[1] - margin;
  const maxY = bounds.max[1] + margin;
  const width = maxX - minX;
  const height = maxY - minY;

  const svgWidth = Math.max(width * 6, 600);
  const svgHeight = Math.max(height * 6, 600);
  const viewBox = `${minX.toFixed(1)} ${(-maxY).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`;

  const parts: string[] = [];

  // Background
  parts.push(`  <rect x="${minX.toFixed(1)}" y="${(-maxY).toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" fill="#1a1a2e"/>`);

  // ─── Surface region fills ───
  if (meta.surfaces && meta.surfaces.length > 0) {
    const palette = ['#4488cc', '#44cc88', '#cc8844', '#cc44aa', '#88cc44', '#44aacc', '#aa44cc', '#cccc44'];
    parts.push('  <g data-layer="surfaces" opacity="0.25">');
    for (const s of meta.surfaces) {
      const color = palette[s.index % palette.length];
      const d = s.polygon
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`)
        .join(' ') + 'Z';
      parts.push(`    <path d="${d}" fill="${color}" stroke="none"/>`);
    }
    parts.push('  </g>');
    // Surface index labels at centroids
    parts.push('  <g data-layer="surface-labels">');
    for (const s of meta.surfaces) {
      const color = palette[s.index % palette.length];
      const x = s.centroid[0].toFixed(3);
      const y = (-s.centroid[1]).toFixed(3);
      parts.push(`    <text x="${x}" y="${y}" fill="${color}" font-size="3" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" font-weight="bold" opacity="0.6">[${s.index}]</text>`);
    }
    parts.push('  </g>');
  }

  // ─── Edge geometry ───
  parts.push('  <g data-layer="edges">');
  for (const line of meta.edges.lines) {
    parts.push(`    <line x1="${line.a[0].toFixed(3)}" y1="${(-line.a[1]).toFixed(3)}" x2="${line.b[0].toFixed(3)}" y2="${(-line.b[1]).toFixed(3)}" stroke="#e8e8e8" stroke-width="0.4"/>`);
  }
  for (const circle of meta.edges.circles) {
    parts.push(`    <circle cx="${circle.center[0].toFixed(3)}" cy="${(-circle.center[1]).toFixed(3)}" r="${circle.radius.toFixed(3)}" stroke="#e8e8e8" stroke-width="0.4" fill="none"/>`);
  }
  for (const arc of meta.edges.arcs) {
    const pts = tessellateArc(arc.center, arc.start, arc.end, arc.radius, arc.clockwise, 32);
    const d = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`)
      .join(' ');
    parts.push(`    <path d="${d}" stroke="#e8e8e8" stroke-width="0.4" fill="none"/>`);
  }
  if (opts.showPoints) {
    for (const pt of meta.edges.points) {
      parts.push(`    <circle cx="${pt.pos[0].toFixed(3)}" cy="${(-pt.pos[1]).toFixed(3)}" r="0.6" fill="#e8e8e8"/>`);
    }
  }
  parts.push('  </g>');

  // ─── Construction geometry ───
  if (opts.showConstruction) {
    parts.push('  <g data-layer="construction">');
    for (const line of meta.construction.lines) {
      parts.push(`    <line x1="${line.a[0].toFixed(3)}" y1="${(-line.a[1]).toFixed(3)}" x2="${line.b[0].toFixed(3)}" y2="${(-line.b[1]).toFixed(3)}" stroke="#666666" stroke-width="0.3" stroke-dasharray="1,1"/>`);
    }
    for (const circle of meta.construction.circles) {
      parts.push(`    <circle cx="${circle.center[0].toFixed(3)}" cy="${(-circle.center[1]).toFixed(3)}" r="${circle.radius.toFixed(3)}" stroke="#666666" stroke-width="0.3" stroke-dasharray="1,1" fill="none"/>`);
    }
    for (const arc of meta.construction.arcs) {
      const pts = tessellateArc(arc.center, arc.start, arc.end, arc.radius, arc.clockwise, 32);
      const d = pts
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`)
        .join(' ');
      parts.push(`    <path d="${d}" stroke="#666666" stroke-width="0.3" stroke-dasharray="1,1" fill="none"/>`);
    }
    parts.push('  </g>');
  }

  // ─── Constraint annotations ───
  if (opts.showLabels) {
    parts.push('  <g data-layer="annotations">');
    for (const c of meta.constraints) {
      const color = constraintColor(c);
      for (const ann of c.annotations) {
        parts.push(...renderAnnotation(ann, color));
      }
    }
    parts.push('  </g>');
  }

  // ─── Status badge (top-left of viewbox) ───
  {
    const statusText = `${meta.status.toUpperCase()} DOF=${meta.dof} err=${meta.maxError.toFixed(4)}`;
    const badgeColor = statusColor(meta.status);
    const bx = minX + 1;
    const by = -maxY + 1;
    parts.push('  <g data-layer="status">');
    parts.push(`    <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(statusText.length * 1.3).toFixed(1)}" height="3" rx="0.5" fill="${badgeColor}" opacity="0.85"/>`);
    parts.push(`    <text x="${(bx + 0.8).toFixed(1)}" y="${(by + 2.1).toFixed(1)}" fill="#000000" font-size="1.8" font-family="sans-serif" font-weight="bold">${escapeAttribute(statusText)}</text>`);
    parts.push('  </g>');
  }

  // ─── Rejected constraints list (bottom-left) ───
  if (opts.showRejected && meta.rejected.length > 0) {
    parts.push('  <g data-layer="rejected">');
    const rx = minX + 1;
    let ry = -minY - 1.5; // bottom of viewbox in SVG coords
    for (let i = meta.rejected.length - 1; i >= 0; i--) {
      const r = meta.rejected[i];
      const reason = r.rejectionReason ? ` \u2014 ${r.rejectionReason}` : '';
      const text = `REJECTED: ${r.label} ${r.type}${reason}`;
      parts.push(`    <text x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" fill="#ff6b6b" font-size="1.5" font-family="sans-serif">${escapeAttribute(text)}</text>`);
      ry -= 2;
    }
    parts.push('  </g>');
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${svgWidth.toFixed(0)}" height="${svgHeight.toFixed(0)}">
${parts.join('\n')}
</svg>`;
}

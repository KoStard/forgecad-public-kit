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

import type { SketchConstraintMeta, ConstraintDisplay } from '../src/forge/sketch/constraints/types';

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

function statusColor(status: 'under' | 'fully' | 'over'): string {
  switch (status) {
    case 'fully': return '#4ade80';
    case 'under': return '#60a5fa';
    case 'over': return '#ff6b6b';
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

  // ─── Constraint labels ───
  if (opts.showLabels) {
    parts.push('  <g data-layer="labels">');
    for (const c of meta.constraints) {
      const color = constraintColor(c);
      const text = c.label + (c.value !== undefined ? `=${c.value}` : '');
      const x = c.position[0].toFixed(3);
      const y = (-c.position[1]).toFixed(3);
      parts.push(`    <text x="${x}" y="${y}" fill="${color}" font-size="2" font-family="sans-serif" text-anchor="middle">${escapeAttribute(text)}</text>`);
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

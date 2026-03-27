/**
 * Sketch PDF export — pure PDF generation from SketchConstraintMeta.
 *
 * No Node.js dependencies. Works in both browser (UI export) and CLI.
 * Renders edges, construction geometry, surfaces, constraint symbols,
 * dimensions, angle arcs, status badge, and rejected constraints on
 * one huge single-page PDF.
 */

import type { AnnotationElement, ConstraintDisplay, ConstraintSymbol, SketchConstraintMeta } from './constraints/types';

// ─── Minimal PDF builder (same pattern as report.ts) ─────────────────────────

const encoder = new TextEncoder();

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

  build(rootId: number): Uint8Array<ArrayBuffer> {
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

    return encoder.encode(parts.join('')) as Uint8Array<ArrayBuffer>;
  }
}

// ─── PDF drawing helpers ─────────────────────────────────────────────────────

function f(n: number): string {
  return n.toFixed(3);
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function strokeColor(r: number, g: number, b: number): string {
  return `${f(r)} ${f(g)} ${f(b)} RG`;
}

function fillColor(r: number, g: number, b: number): string {
  return `${f(r)} ${f(g)} ${f(b)} rg`;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

function moveTo(x: number, y: number): string {
  return `${f(x)} ${f(y)} m`;
}

function lineTo(x: number, y: number): string {
  return `${f(x)} ${f(y)} l`;
}

function lineCmd(x1: number, y1: number, x2: number, y2: number): string {
  return `${moveTo(x1, y1)} ${lineTo(x2, y2)} S`;
}

function filledPolygon(pts: [number, number][], r: number, g: number, b: number, opacity: number): string {
  if (pts.length < 3) return '';
  const lines: string[] = [];
  lines.push('q');
  const bg: [number, number, number] = [0.102, 0.102, 0.18];
  const blendR = bg[0] * (1 - opacity) + r * opacity;
  const blendG = bg[1] * (1 - opacity) + g * opacity;
  const blendB = bg[2] * (1 - opacity) + b * opacity;
  lines.push(fillColor(blendR, blendG, blendB));
  lines.push(moveTo(pts[0][0], pts[0][1]));
  for (let i = 1; i < pts.length; i++) {
    lines.push(lineTo(pts[i][0], pts[i][1]));
  }
  lines.push('h f');
  lines.push('Q');
  return lines.join('\n');
}

function circleStroke(cx: number, cy: number, r: number): string {
  const k = r * 0.5522847498;
  return [
    moveTo(cx + r, cy),
    `${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c`,
    `${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c`,
    `${f(cx - k)} ${f(cy - r)} ${f(cx - r)} ${f(cy - k)} ${f(cx)} ${f(cy - r)} c`,
    `${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c`,
    'S',
  ].join('\n');
}

function circleFill(cx: number, cy: number, r: number): string {
  const k = r * 0.5522847498;
  return [
    moveTo(cx + r, cy),
    `${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c`,
    `${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c`,
    `${f(cx - k)} ${f(cy - r)} ${f(cx - r)} ${f(cy - k)} ${f(cx)} ${f(cy - r)} c`,
    `${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c`,
    'h f',
  ].join('\n');
}

function textCmd(text: string, x: number, y: number, size: number): string {
  return `BT /F1 ${f(size)} Tf ${f(x)} ${f(y)} Td (${pdfEscape(text)}) Tj ET`;
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
  if (clockwise) {
    if (sweep > 0) sweep -= 2 * Math.PI;
    sweep = -sweep;
  } else {
    if (sweep < 0) sweep += 2 * Math.PI;
  }
  const points: [number, number][] = [start];
  for (let k = 1; k <= segments; k++) {
    const t = (k / segments) * sweep;
    const angle = startAngle + direction * t;
    points.push([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)]);
  }
  return points;
}

function polylineStroke(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  const cmds = [moveTo(pts[0][0], pts[0][1])];
  for (let i = 1; i < pts.length; i++) {
    cmds.push(lineTo(pts[i][0], pts[i][1]));
  }
  cmds.push('S');
  return cmds.join('\n');
}

// ─── Constraint colors ──────────────────────────────────────────────────────

function constraintColorHex(c: ConstraintDisplay): string {
  if (c.isConflicting) return '#ff6b6b';
  if (c.isRedundant) return '#faad14';
  return '#4ade80';
}

function statusColorHex(status: SketchConstraintMeta['status']): string {
  switch (status) {
    case 'fully':
      return '#4ade80';
    case 'under':
      return '#60a5fa';
    case 'over':
      return '#ff6b6b';
    case 'over-redundant':
      return '#faad14';
  }
}

const SURFACE_PALETTE = ['#4488cc', '#44cc88', '#cc8844', '#cc44aa', '#88cc44', '#44aacc', '#aa44cc', '#cccc44'];

// ─── Coordinate transform ───────────────────────────────────────────────────

interface SketchToPdfTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  pageWidth: number;
  pageHeight: number;
}

function toPage(tx: SketchToPdfTransform, x: number, y: number): [number, number] {
  return [x * tx.scale + tx.offsetX, y * tx.scale + tx.offsetY];
}

function computeBounds(meta: SketchConstraintMeta): { min: [number, number]; max: [number, number] } {
  const bounds = { min: [Infinity, Infinity] as [number, number], max: [-Infinity, -Infinity] as [number, number] };
  function expand(x: number, y: number) {
    bounds.min[0] = Math.min(bounds.min[0], x);
    bounds.min[1] = Math.min(bounds.min[1], y);
    bounds.max[0] = Math.max(bounds.max[0], x);
    bounds.max[1] = Math.max(bounds.max[1], y);
  }

  for (const line of meta.edges.lines) {
    expand(line.a[0], line.a[1]);
    expand(line.b[0], line.b[1]);
  }
  for (const circle of meta.edges.circles) {
    expand(circle.center[0] - circle.radius, circle.center[1] - circle.radius);
    expand(circle.center[0] + circle.radius, circle.center[1] + circle.radius);
  }
  for (const arc of meta.edges.arcs) {
    expand(arc.start[0], arc.start[1]);
    expand(arc.end[0], arc.end[1]);
    expand(arc.center[0] - arc.radius, arc.center[1] - arc.radius);
    expand(arc.center[0] + arc.radius, arc.center[1] + arc.radius);
  }
  for (const pt of meta.edges.points) {
    expand(pt.pos[0], pt.pos[1]);
  }
  for (const line of meta.construction.lines) {
    expand(line.a[0], line.a[1]);
    expand(line.b[0], line.b[1]);
  }
  for (const circle of meta.construction.circles) {
    expand(circle.center[0] - circle.radius, circle.center[1] - circle.radius);
    expand(circle.center[0] + circle.radius, circle.center[1] + circle.radius);
  }
  for (const arc of meta.construction.arcs) {
    expand(arc.start[0], arc.start[1]);
    expand(arc.end[0], arc.end[1]);
  }

  for (const c of meta.constraints) {
    for (const ann of c.annotations) {
      if (ann.kind === 'symbol') {
        expand(ann.position[0], ann.position[1]);
      } else if (ann.kind === 'dimension') {
        const dx = ann.to[0] - ann.from[0],
          dy = ann.to[1] - ann.from[1];
        const len = Math.hypot(dx, dy);
        if (len > 0.01) {
          const nx = (-dy / len) * ann.offset,
            ny = (dx / len) * ann.offset;
          expand(ann.from[0] + nx, ann.from[1] + ny);
          expand(ann.to[0] + nx, ann.to[1] + ny);
        }
        expand(ann.from[0], ann.from[1]);
        expand(ann.to[0], ann.to[1]);
      } else if (ann.kind === 'angle-arc') {
        expand(ann.center[0] - ann.radius - 2, ann.center[1] - ann.radius - 2);
        expand(ann.center[0] + ann.radius + 2, ann.center[1] + ann.radius + 2);
      } else if (ann.kind === 'text') {
        expand(ann.position[0], ann.position[1]);
      }
    }
  }

  if (!isFinite(bounds.min[0])) {
    bounds.min = [-10, -10];
    bounds.max = [10, 10];
  }
  return bounds;
}

function computeTransform(meta: SketchConstraintMeta, ptsPerMm: number, marginPts: number): SketchToPdfTransform {
  const bounds = computeBounds(meta);
  const sketchW = bounds.max[0] - bounds.min[0];
  const sketchH = bounds.max[1] - bounds.min[1];
  return {
    scale: ptsPerMm,
    offsetX: marginPts - bounds.min[0] * ptsPerMm,
    offsetY: marginPts - bounds.min[1] * ptsPerMm,
    pageWidth: sketchW * ptsPerMm + marginPts * 2,
    pageHeight: sketchH * ptsPerMm + marginPts * 2,
  };
}

// ─── Symbol rendering ───────────────────────────────────────────────────────

function renderSymbolPdf(
  tx: SketchToPdfTransform,
  pos: [number, number],
  symbol: ConstraintSymbol,
  color: [number, number, number],
  fontScale: number = 1,
  _rotation?: number,
): string {
  const [px, py] = toPage(tx, pos[0], pos[1]);
  const S = 4 * fontScale;
  const cmds: string[] = ['q', strokeColor(color[0], color[1], color[2]), fillColor(color[0], color[1], color[2])];

  switch (symbol) {
    case 'parallel':
      cmds.push(`${f(0.8)} w`);
      cmds.push(lineCmd(px - S * 0.3, py - S * 0.5, px + S * 0.3, py));
      cmds.push(lineCmd(px + S * 0.3, py, px - S * 0.3, py + S * 0.5));
      cmds.push(lineCmd(px + S * 0.1, py - S * 0.5, px + S * 0.7, py));
      cmds.push(lineCmd(px + S * 0.7, py, px + S * 0.1, py + S * 0.5));
      break;
    case 'equal':
      cmds.push(`${f(0.8)} w`);
      cmds.push(lineCmd(px - S * 0.5, py - S * 0.2, px + S * 0.5, py - S * 0.2));
      cmds.push(lineCmd(px - S * 0.5, py + S * 0.2, px + S * 0.5, py + S * 0.2));
      break;
    case 'perpendicular':
      cmds.push(`${f(0.8)} w`, moveTo(px + S * 0.6, py), lineTo(px, py), lineTo(px, py + S * 0.6), 'S');
      break;
    case 'horizontal':
      cmds.push(textCmd('H', px - 3 * fontScale, py - 3.5 * fontScale, 8 * fontScale));
      break;
    case 'vertical':
      cmds.push(textCmd('V', px - 3 * fontScale, py - 3.5 * fontScale, 8 * fontScale));
      break;
    case 'fixed':
      cmds.push(`${f(0.6)} w`, lineCmd(px - S, py + S * 0.3, px + S, py + S * 0.3));
      for (let i = -0.7; i <= 0.8; i += 0.5) cmds.push(lineCmd(px + S * i, py + S * 0.3, px + S * (i - 0.3), py + S * 0.8));
      break;
    case 'midpoint': {
      const pts: [number, number][] = [
        [px, py - S * 0.5],
        [px + S * 0.4, py],
        [px, py + S * 0.5],
        [px - S * 0.4, py],
      ];
      cmds.push(moveTo(pts[0][0], pts[0][1]));
      for (let i = 1; i < pts.length; i++) cmds.push(lineTo(pts[i][0], pts[i][1]));
      cmds.push('h f');
      break;
    }
    case 'coincident':
      cmds.push(`${f(0.6)} w`, circleStroke(px, py, S * 0.5), circleFill(px, py, S * 0.15));
      break;
    case 'collinear':
      cmds.push(circleFill(px, py, S * 0.3));
      break;
    case 'tangent':
      cmds.push(textCmd('T', px - 3 * fontScale, py - 3.5 * fontScale, 7 * fontScale));
      break;
    case 'concentric':
      cmds.push(`${f(0.6)} w`, circleStroke(px, py, S * 0.3), circleStroke(px, py, S * 0.6));
      break;
    case 'ccw': {
      cmds.push(`${f(0.8)} w`);
      const r = S * 0.6;
      const arcPts: [number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 1.5;
        arcPts.push([px + r * Math.cos(a), py + r * Math.sin(a)]);
      }
      cmds.push(polylineStroke(arcPts));
      const last = arcPts[arcPts.length - 1];
      cmds.push(moveTo(last[0], last[1]), lineTo(last[0] + 2, last[1] + 1), lineTo(last[0] + 1, last[1] - 2), 'h f');
      break;
    }
    case 'symmetric':
      cmds.push(moveTo(px - S * 0.3, py - S * 0.3), lineTo(px, py), lineTo(px - S * 0.3, py + S * 0.3), 'h f');
      cmds.push(moveTo(px + S * 0.3, py - S * 0.3), lineTo(px, py), lineTo(px + S * 0.3, py + S * 0.3), 'h f');
      break;
    default:
      cmds.push(textCmd('?', px - 2 * fontScale, py - 3 * fontScale, 7 * fontScale));
      break;
  }

  cmds.push('Q');
  return cmds.join('\n');
}

function renderDimensionPdf(
  tx: SketchToPdfTransform,
  ann: Extract<AnnotationElement, { kind: 'dimension' }>,
  color: [number, number, number],
  fontScale: number = 1,
): string {
  const { from, to, offset, value } = ann;
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return '';

  const nx = -dy / len,
    ny = dx / len,
    o = offset;
  const p1: [number, number] = [from[0] + nx * o, from[1] + ny * o];
  const p2: [number, number] = [to[0] + nx * o, to[1] + ny * o];
  const extLen = Math.abs(o) + 0.5;
  const extDir = o >= 0 ? 1 : -1;
  const e1a: [number, number] = [from[0] + nx * 0.3 * extDir, from[1] + ny * 0.3 * extDir];
  const e1b: [number, number] = [from[0] + nx * extLen * extDir, from[1] + ny * extLen * extDir];
  const e2a: [number, number] = [to[0] + nx * 0.3 * extDir, to[1] + ny * 0.3 * extDir];
  const e2b: [number, number] = [to[0] + nx * extLen * extDir, to[1] + ny * extLen * extDir];
  const arrowLen = Math.min(1.0, len * 0.15),
    arrowW = arrowLen * 0.35;
  const udx = dx / len,
    udy = dy / len;

  const cmds: string[] = ['q', strokeColor(color[0], color[1], color[2]), fillColor(color[0], color[1], color[2])];

  if (Math.abs(o) > 0.5) {
    cmds.push(`${f(0.3)} w`);
    const [e1ax, e1ay] = toPage(tx, e1a[0], e1a[1]);
    const [e1bx, e1by] = toPage(tx, e1b[0], e1b[1]);
    const [e2ax, e2ay] = toPage(tx, e2a[0], e2a[1]);
    const [e2bx, e2by] = toPage(tx, e2b[0], e2b[1]);
    cmds.push(lineCmd(e1ax, e1ay, e1bx, e1by), lineCmd(e2ax, e2ay, e2bx, e2by));
  }

  cmds.push(`${f(0.5)} w`);
  const [p1x, p1y] = toPage(tx, p1[0], p1[1]);
  const [p2x, p2y] = toPage(tx, p2[0], p2[1]);
  cmds.push(lineCmd(p1x, p1y, p2x, p2y));

  const a1tip = toPage(tx, p1[0], p1[1]);
  const a1l = toPage(tx, p1[0] + udx * arrowLen + nx * arrowW, p1[1] + udy * arrowLen + ny * arrowW);
  const a1r = toPage(tx, p1[0] + udx * arrowLen - nx * arrowW, p1[1] + udy * arrowLen - ny * arrowW);
  cmds.push(moveTo(a1tip[0], a1tip[1]), lineTo(a1l[0], a1l[1]), lineTo(a1r[0], a1r[1]), 'h f');

  const a2tip = toPage(tx, p2[0], p2[1]);
  const a2l = toPage(tx, p2[0] - udx * arrowLen + nx * arrowW, p2[1] - udy * arrowLen + ny * arrowW);
  const a2r = toPage(tx, p2[0] - udx * arrowLen - nx * arrowW, p2[1] - udy * arrowLen - ny * arrowW);
  cmds.push(moveTo(a2tip[0], a2tip[1]), lineTo(a2l[0], a2l[1]), lineTo(a2r[0], a2r[1]), 'h f');

  const mid = toPage(tx, (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
  cmds.push(textCmd(value, mid[0] - value.length * 2.5 * fontScale, mid[1] + 3 * fontScale, 7 * fontScale));

  cmds.push('Q');
  return cmds.join('\n');
}

function renderAngleArcPdf(
  tx: SketchToPdfTransform,
  ann: Extract<AnnotationElement, { kind: 'angle-arc' }>,
  color: [number, number, number],
  fontScale: number = 1,
): string {
  const { center, startAngle, endAngle, radius, value } = ann;
  let sweep = endAngle - startAngle;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;

  const segments = Math.max(8, Math.ceil(Math.abs(sweep) * 16));
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (i / segments) * sweep;
    pts.push(toPage(tx, center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)));
  }

  const cmds: string[] = [
    'q',
    strokeColor(color[0], color[1], color[2]),
    fillColor(color[0], color[1], color[2]),
    `${f(0.5)} w`,
    polylineStroke(pts),
  ];
  const midAngle = startAngle + sweep / 2;
  const textR = radius + 1.2;
  const [lx, ly] = toPage(tx, center[0] + textR * Math.cos(midAngle), center[1] + textR * Math.sin(midAngle));
  cmds.push(textCmd(value, lx - value.length * 2 * fontScale, ly - 3 * fontScale, 6 * fontScale), 'Q');
  return cmds.join('\n');
}

function renderAnnotationPdf(
  tx: SketchToPdfTransform,
  ann: AnnotationElement,
  color: [number, number, number],
  fontScale: number = 1,
): string {
  switch (ann.kind) {
    case 'symbol':
      return renderSymbolPdf(tx, ann.position, ann.symbol, color, fontScale, ann.rotation);
    case 'dimension':
      return renderDimensionPdf(tx, ann, color, fontScale);
    case 'angle-arc':
      return renderAngleArcPdf(tx, ann, color, fontScale);
    case 'text': {
      const [px, py] = toPage(tx, ann.position[0], ann.position[1]);
      return [
        'q',
        fillColor(color[0], color[1], color[2]),
        textCmd(ann.text, px - ann.text.length * 2.5 * fontScale, py - 3 * fontScale, 7 * fontScale),
        'Q',
      ].join('\n');
    }
  }
}

// ─── Main page content builder ──────────────────────────────────────────────

function buildSketchPdfContent(meta: SketchConstraintMeta, tx: SketchToPdfTransform, fontScale: number = 1): string {
  const cmds: string[] = [];

  // Background
  cmds.push('q', fillColor(0.102, 0.102, 0.18), `${f(0)} ${f(0)} ${f(tx.pageWidth)} ${f(tx.pageHeight)} re f`, 'Q');

  // Surface fills
  if (meta.surfaces && meta.surfaces.length > 0) {
    for (const s of meta.surfaces) {
      const [r, g, b] = hexToRgb(SURFACE_PALETTE[s.index % SURFACE_PALETTE.length]);
      const pts = s.polygon.map(([x, y]) => toPage(tx, x, y) as [number, number]);
      cmds.push(filledPolygon(pts, r, g, b, 0.25));
    }
    cmds.push('q');
    for (const s of meta.surfaces) {
      const [r, g, b] = hexToRgb(SURFACE_PALETTE[s.index % SURFACE_PALETTE.length]);
      cmds.push(fillColor(r, g, b));
      const [cx, cy] = toPage(tx, s.centroid[0], s.centroid[1]);
      cmds.push(textCmd(`[${s.index}]`, cx - 5 * fontScale, cy - 4 * fontScale, 9 * fontScale));
    }
    cmds.push('Q');
  }

  // Edge geometry
  cmds.push('q', strokeColor(0.91, 0.91, 0.91), `${f(1.0)} w`);
  for (const line of meta.edges.lines) {
    const [ax, ay] = toPage(tx, line.a[0], line.a[1]);
    const [bx, by] = toPage(tx, line.b[0], line.b[1]);
    cmds.push(lineCmd(ax, ay, bx, by));
  }
  for (const circle of meta.edges.circles) {
    const [cx, cy] = toPage(tx, circle.center[0], circle.center[1]);
    cmds.push(circleStroke(cx, cy, circle.radius * tx.scale));
  }
  for (const arc of meta.edges.arcs) {
    const pts = tessellateArc(arc.center, arc.start, arc.end, arc.radius, arc.clockwise, 32);
    cmds.push(polylineStroke(pts.map(([x, y]) => toPage(tx, x, y) as [number, number])));
  }
  cmds.push(fillColor(0.91, 0.91, 0.91));
  for (const pt of meta.edges.points) {
    const [px, py] = toPage(tx, pt.pos[0], pt.pos[1]);
    cmds.push(circleFill(px, py, 1.5));
  }
  cmds.push('Q');

  // Construction geometry
  cmds.push('q', strokeColor(0.4, 0.4, 0.4), `${f(0.6)} w`, '[2 2] 0 d');
  for (const line of meta.construction.lines) {
    const [ax, ay] = toPage(tx, line.a[0], line.a[1]);
    const [bx, by] = toPage(tx, line.b[0], line.b[1]);
    cmds.push(lineCmd(ax, ay, bx, by));
  }
  for (const circle of meta.construction.circles) {
    const [cx, cy] = toPage(tx, circle.center[0], circle.center[1]);
    cmds.push(circleStroke(cx, cy, circle.radius * tx.scale));
  }
  for (const arc of meta.construction.arcs) {
    const pts = tessellateArc(arc.center, arc.start, arc.end, arc.radius, arc.clockwise, 32);
    cmds.push(polylineStroke(pts.map(([x, y]) => toPage(tx, x, y) as [number, number])));
  }
  cmds.push('Q');

  // Constraint annotations
  for (const c of meta.constraints) {
    const color = hexToRgb(constraintColorHex(c));
    for (const ann of c.annotations) cmds.push(renderAnnotationPdf(tx, ann, color, fontScale));
  }

  // Status badge (top-left)
  {
    const statusText = `${meta.status.toUpperCase()} DOF=${meta.dof} err=${meta.maxError.toFixed(4)}`;
    const [r, g, b] = hexToRgb(statusColorHex(meta.status));
    const bx = 10,
      by = tx.pageHeight - 24 * fontScale;
    cmds.push('q', fillColor(r, g, b), `${f(bx)} ${f(by)} ${f(statusText.length * 6.5 * fontScale + 10)} ${f(18 * fontScale)} re f`);
    cmds.push(fillColor(0, 0, 0), textCmd(statusText, bx + 5, by + 5 * fontScale, 10 * fontScale), 'Q');
  }

  // Constraint summary table (top-right)
  {
    const satisfiedCount = meta.constraints.filter((c) => !c.isConflicting && !c.isRedundant).length;
    const conflictingCount = meta.constraints.filter((c) => c.isConflicting).length;
    const redundantCount = meta.constraints.filter((c) => c.isRedundant).length;
    const textLines: string[] = [`Constraints: ${meta.constraints.length}`, `  Satisfied: ${satisfiedCount}`];
    if (conflictingCount > 0) textLines.push(`  Conflicting: ${conflictingCount}`);
    if (redundantCount > 0) textLines.push(`  Redundant: ${redundantCount}`);
    if (meta.rejected.length > 0) textLines.push(`  Rejected: ${meta.rejected.length}`);
    if (meta.surfaces && meta.surfaces.length > 0) textLines.push(`Surfaces: ${meta.surfaces.length}`);

    const tableX = tx.pageWidth - 160 * fontScale;
    let tableY = tx.pageHeight - 24 * fontScale;
    cmds.push('q', fillColor(0.1, 0.1, 0.15));
    cmds.push(
      `${f(tableX - 5)} ${f(tableY - textLines.length * 13 * fontScale - 2)} ${f(155 * fontScale)} ${f(textLines.length * 13 * fontScale + 20 * fontScale)} re f`,
    );
    cmds.push(fillColor(0.8, 0.8, 0.85));
    for (const line of textLines) {
      cmds.push(textCmd(line, tableX, tableY, 9 * fontScale));
      tableY -= 13 * fontScale;
    }
    cmds.push('Q');
  }

  // Constraint detail list (right side, below summary)
  {
    const listX = tx.pageWidth - 160 * fontScale;
    let listY = tx.pageHeight - 24 * fontScale - 120 * fontScale;
    cmds.push('q', fillColor(0.7, 0.7, 0.75), textCmd('Constraint Details:', listX, listY, 8 * fontScale));
    listY -= 13.5 * fontScale;
    for (const c of meta.constraints) {
      if (listY < 20) break;
      const [r, g, b] = hexToRgb(constraintColorHex(c));
      cmds.push(fillColor(r, g, b));
      const valueStr = c.value !== undefined ? ` = ${c.value}` : '';
      const residualStr = c.residual > 0.0001 ? ` err=${c.residual.toFixed(4)}` : '';
      cmds.push(textCmd(`${c.type}${valueStr}${residualStr}`, listX, listY, 6.5 * fontScale));
      listY -= 9 * fontScale;
    }
    cmds.push('Q');
  }

  // Rejected constraints (bottom-left)
  if (meta.rejected.length > 0) {
    cmds.push('q');
    const [r, g, b] = hexToRgb('#ff6b6b');
    cmds.push(fillColor(r, g, b));
    let ry = 10 + meta.rejected.length * 12 * fontScale;
    for (const rej of meta.rejected) {
      const reason = rej.rejectionReason ? ` \u2014 ${rej.rejectionReason}` : '';
      cmds.push(textCmd(`REJECTED: ${rej.label} ${rej.type}${reason}`, 10, ry, 7 * fontScale));
      ry -= 12 * fontScale;
    }
    cmds.push('Q');
  }

  return cmds.join('\n');
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface SketchPdfResult {
  pdf: Uint8Array<ArrayBuffer>;
  pageWidth: number;
  pageHeight: number;
}

export interface SketchPdfOptions {
  /** Scale factor for all text elements. Default: auto-calculated from sketch bounds. */
  fontScale?: number;
  /** Points per mm of sketch space. Default: 8. */
  pointsPerMm?: number;
  /** Page margin in PDF points. Default: 100. */
  margin?: number;
}

/**
 * Generate a single-page PDF from a constrained sketch's metadata.
 * Pure function — no filesystem or DOM dependencies.
 */
export function generateSketchPdf(meta: SketchConstraintMeta, options?: SketchPdfOptions): SketchPdfResult {
  const POINTS_PER_MM = options?.pointsPerMm ?? 8;
  const MARGIN = options?.margin ?? 100;
  const tx = computeTransform(meta, POINTS_PER_MM, MARGIN);
  tx.pageWidth = Math.max(tx.pageWidth, 600);
  tx.pageHeight = Math.max(tx.pageHeight, 400);

  // Auto-scale font sizes based on sketch extent.
  // Base reference: a ~100mm sketch looks good with the hardcoded sizes.
  // For larger sketches, scale up proportionally.
  const bounds = computeBounds(meta);
  const extent = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], 1);
  const baseExtent = 100; // mm — reference size where hardcoded fonts look right
  const autoFontScale = Math.max(1, extent / baseExtent);
  const fontScale = options?.fontScale ?? autoFontScale;

  const pdf = new PdfBuilder();
  const fontId = pdf.addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const resourcesId = pdf.addObject(`<< /Font << /F1 ${fontId} 0 R >> >>`);
  const content = buildSketchPdfContent(meta, tx, fontScale);
  const contentId = pdf.addStreamObject('', content);

  const pagesId = 5;
  const pageId = pdf.addObject(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(tx.pageWidth)} ${f(tx.pageHeight)}] /Resources ${resourcesId} 0 R /Contents ${contentId} 0 R >>`,
  );
  const actualPagesId = pdf.addObject(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`);
  if (actualPagesId !== pagesId) {
    throw new Error('Internal sketch PDF generation error (page tree mismatch).');
  }
  const catalogId = pdf.addObject(`<< /Type /Catalog /Pages ${actualPagesId} 0 R >>`);

  return { pdf: pdf.build(catalogId), pageWidth: tx.pageWidth, pageHeight: tx.pageHeight };
}

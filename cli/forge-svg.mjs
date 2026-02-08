#!/usr/bin/env node

/**
 * ForgeCAD CLI — Render a .sketch.js to SVG
 *
 * Usage: node cli/forge-svg.mjs <script.sketch.js> [output.svg]
 *
 * Runs the sketch in Node (no browser needed) and outputs SVG.
 */

import { readFile, writeFile, readdirSync } from 'fs';
import { readFile as readFileAsync, writeFile as writeFileAsync } from 'fs/promises';
import { resolve, basename, dirname, join } from 'path';
import Module from 'manifold-3d';

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: node cli/forge-svg.mjs <script.sketch.js> [output.svg]');
  process.exit(1);
}

const outputPath = process.argv[3] || scriptPath.replace(/\.sketch\.js$/, '.svg');
const code = await readFileAsync(resolve(scriptPath), 'utf-8');

// Collect sibling files for imports
const scriptDir = dirname(resolve(scriptPath));
const allFiles = {};
for (const f of readdirSync(scriptDir)) {
  if (f.endsWith('.forge.js') || f.endsWith('.sketch.js')) {
    allFiles[f] = await readFileAsync(join(scriptDir, f), 'utf-8');
  }
}

// Init manifold
const wasm = await Module();
wasm.setup();
wasm.setMinCircularAngle(2);
wasm.setMinCircularEdgeLength(0.5);

// Minimal forge API for sketches
const { CrossSection, Manifold } = wasm;

class Sketch {
  constructor(cross) { this.cross = cross; }
  translate(x, y = 0) { return new Sketch(this.cross.translate(x, y)); }
  rotate(deg) { return new Sketch(this.cross.rotate(deg)); }
  rotateAround(deg, pivot) {
    return this.translate(-pivot[0], -pivot[1]).rotate(deg).translate(pivot[0], pivot[1]);
  }
  scale(v) { return new Sketch(this.cross.scale(v)); }
  mirror(ax) { return new Sketch(this.cross.mirror(ax)); }
  add(o) { return new Sketch(this.cross.add(o.cross)); }
  subtract(o) { return new Sketch(this.cross.subtract(o.cross)); }
  intersect(o) { return new Sketch(this.cross.intersect(o.cross)); }
  offset(d, j = 'Round') { return new Sketch(this.cross.offset(d, j)); }
  hull() { return new Sketch(this.cross.hull()); }
  simplify(e = 1e-6) { return new Sketch(this.cross.simplify(e)); }
  area() { return this.cross.area(); }
  bounds() { return this.cross.bounds(); }
  isEmpty() { return this.cross.isEmpty(); }
  numVert() { return this.cross.numVert(); }
  toPolygons() { return this.cross.toPolygons(); }
  attachTo(target, targetAnchor, selfAnchor = 'center') {
    const tp = getAnchorPoint(target, targetAnchor);
    const sp = getAnchorPoint(this, selfAnchor);
    return this.translate(tp[0] - sp[0], tp[1] - sp[1]);
  }
}

function getAnchorPoint(sketch, anchor) {
  const b = sketch.bounds();
  const [minX, minY] = b.min;
  const [maxX, maxY] = b.max;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const map = {
    'center': [cx, cy], 'top-left': [minX, maxY], 'top-right': [maxX, maxY],
    'bottom-left': [minX, minY], 'bottom-right': [maxX, minY],
    'top': [cx, maxY], 'bottom': [cx, minY], 'left': [minX, cy], 'right': [maxX, cy],
  };
  return map[anchor];
}

const rect = (w, h, center = false) => new Sketch(CrossSection.square([w, h], center));
const circle2d = (r, seg) => new Sketch(CrossSection.circle(r, seg || 0));
const roundedRect = (w, h, r, center = false) => {
  const s = rect(w, h, center);
  return new Sketch(s.cross.offset(-r, 'Round').offset(r, 'Round'));
};
const polygon = (pts) => new Sketch(new CrossSection([pts]));
const ngon = (sides, r) => {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides - Math.PI / 2;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polygon(pts);
};
const ellipse = (rx, ry, seg = 64) => {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (2 * Math.PI * i) / seg;
    pts.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  return polygon(pts);
};
const slot = (len, w) => {
  const r = w / 2;
  const body = rect(len - w, w, true);
  const cap1 = circle2d(r).translate(-(len - w) / 2, 0);
  const cap2 = circle2d(r).translate((len - w) / 2, 0);
  return union2d(body, cap1, cap2);
};
const star = (points, outerR, innerR) => {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polygon(pts);
};

const union2d = (...sketches) => sketches.reduce((a, b) => a.add(b));
const difference2d = (...sketches) => sketches.slice(1).reduce((a, b) => a.subtract(b), sketches[0]);
const intersection2d = (...sketches) => sketches.reduce((a, b) => a.intersect(b));
const hull2d = (...sketches) => new Sketch(CrossSection.hull(sketches.map(s => s.cross)));

class PathBuilder {
  constructor() { this.points = []; this.x = 0; this.y = 0; }
  moveTo(x, y) { this.x = x; this.y = y; this.points.push([x, y]); return this; }
  lineTo(x, y) { this.x = x; this.y = y; this.points.push([x, y]); return this; }
  lineH(dx) { return this.lineTo(this.x + dx, this.y); }
  lineV(dy) { return this.lineTo(this.x, this.y + dy); }
  lineAngled(len, deg) {
    const rad = deg * Math.PI / 180;
    return this.lineTo(this.x + len * Math.cos(rad), this.y + len * Math.sin(rad));
  }
  close() {
    if (this.points.length < 3) throw new Error('Path needs at least 3 points');
    const pts = this.points;
    let signedArea = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      signedArea += (x2 - x1) * (y2 + y1);
    }
    if (signedArea > 0) pts.reverse();
    return polygon(pts);
  }
}
const path = () => new PathBuilder();

// Params
const params = [];
const param = (name, def, opts = {}) => {
  params.push({ name, value: def, ...opts });
  return def;
};

// Execute
const wrapped = `"use strict";\n${code}`;
const fn = new Function(
  'rect', 'circle2d', 'roundedRect', 'polygon', 'ngon', 'ellipse', 'slot', 'star', 'path',
  'union2d', 'difference2d', 'intersection2d', 'hull2d',
  'param', 'Sketch',
  wrapped,
);

const result = fn(
  rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star, path,
  union2d, difference2d, intersection2d, hull2d,
  param, Sketch,
);

if (!(result instanceof Sketch)) {
  console.error('Script must return a Sketch');
  process.exit(1);
}

// Generate SVG
const polys = result.toPolygons();
const b = result.bounds();
const margin = 2;
const minX = b.min[0] - margin, minY = b.min[1] - margin;
const w = b.max[0] - b.min[0] + margin * 2;
const h = b.max[1] - b.min[1] + margin * 2;

let paths = '';
for (const poly of polys) {
  // Flip Y for SVG (SVG Y goes down, CAD Y goes up)
  const d = poly.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`).join(' ') + ' Z';
  paths += `  <path d="${d}" fill="#4488cc" stroke="#224466" stroke-width="0.3"/>\n`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${(-b.max[1] - margin).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" width="${Math.max(w * 4, 400)}" height="${Math.max(h * 4, 400)}">
  <rect x="${minX.toFixed(1)}" y="${(-b.max[1] - margin).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#2a2a2a"/>
${paths}</svg>`;

await writeFileAsync(resolve(outputPath), svg);

const sz = [(b.max[0] - b.min[0]).toFixed(1), (b.max[1] - b.min[1]).toFixed(1)];
console.log(`✓ ${basename(outputPath)}  ${sz[0]} × ${sz[1]} mm  area=${result.area().toFixed(1)}mm²  verts=${result.numVert()}`);

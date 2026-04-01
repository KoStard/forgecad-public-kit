/**
 * Font-based text rendering for ForgeCAD.
 *
 * Uses opentype.js to parse TTF/OTF font files and convert glyph outlines
 * (bezier curves) into polygon-based Sketches that integrate with the full
 * ForgeCAD geometry pipeline.
 *
 * @internal — consumed by text.ts, not exported directly.
 */

import opentype from 'opentype.js';
import { INTER_REGULAR_WOFF_BASE64 } from '../fonts/inter-regular-data';
import { difference2d, union2d } from './booleans';
import { Sketch } from './core';
import { polygon } from './primitives';

type Vec2 = [number, number];

// ---------------------------------------------------------------------------
// Font cache — avoid reparsing the same font file on every text2d() call
// ---------------------------------------------------------------------------

const fontCache = new Map<string, opentype.Font>();

/** Decode base64 string to ArrayBuffer. */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  if (typeof atob === 'function') {
    // Browser
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  // Node.js
  return Buffer.from(b64, 'base64').buffer;
}

/**
 * Built-in font names that resolve to bundled fonts.
 * These work everywhere (browser + CLI) without needing a file path.
 */
const BUILTIN_FONTS: Record<string, () => opentype.Font> = {
  'sans-serif': () => opentype.parse(base64ToArrayBuffer(INTER_REGULAR_WOFF_BASE64)),
  inter: () => opentype.parse(base64ToArrayBuffer(INTER_REGULAR_WOFF_BASE64)),
};

/**
 * Load and cache a font.
 *
 * @param source - One of:
 *   - A built-in font name: `'sans-serif'` or `'inter'` (works everywhere)
 *   - A file path to a TTF/OTF/WOFF file (CLI/Node only)
 *   - An ArrayBuffer of font data (works everywhere)
 * @param cacheKey - Optional cache key when passing ArrayBuffer.
 * @returns Parsed opentype.Font object.
 */
export function loadFont(source: string | ArrayBuffer, cacheKey?: string): opentype.Font {
  const key = typeof source === 'string' ? source : (cacheKey ?? `arraybuffer-${fontCache.size}`);
  const cached = fontCache.get(key);
  if (cached) return cached;

  let font: opentype.Font;
  if (typeof source === 'string' && BUILTIN_FONTS[source.toLowerCase()]) {
    font = BUILTIN_FONTS[source.toLowerCase()]();
  } else if (typeof source === 'string') {
    font = opentype.loadSync(source);
  } else {
    font = opentype.parse(source);
  }
  fontCache.set(key, font);
  return font;
}

// ---------------------------------------------------------------------------
// Bezier curve flattening
// ---------------------------------------------------------------------------

function dist(a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function sampleQuadratic(p0: Vec2, p1: Vec2, p2: Vec2, tolerance: number): Vec2[] {
  const estimate = dist(p0, p1) + dist(p1, p2);
  const segments = clamp(Math.ceil(estimate / Math.max(tolerance, 1e-4)), 4, 512);
  const out: Vec2[] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    out.push([x, y]);
  }
  return out;
}

function sampleCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tolerance: number): Vec2[] {
  const estimate = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
  const segments = clamp(Math.ceil(estimate / Math.max(tolerance, 1e-4)), 4, 512);
  const out: Vec2[] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    out.push([x, y]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geometry helpers (same approach as SVG import)
// ---------------------------------------------------------------------------

const EPS = 1e-10;

function signedArea(points: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function _pointInPolygon(point: Vec2, poly: Vec2[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-20) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function removeDuplicateClosing(points: Vec2[]): Vec2[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first[0] - last[0]) < EPS && Math.abs(first[1] - last[1]) < EPS) {
    return points.slice(0, -1);
  }
  return points;
}

// ---------------------------------------------------------------------------
// opentype path commands → polygon loops
// ---------------------------------------------------------------------------

/**
 * Convert opentype path commands into closed polygon loops.
 * Font coordinates have Y pointing down; we flip to CAD Y-up.
 */
function pathToLoops(commands: opentype.PathCommand[], tolerance: number): Vec2[][] {
  const loops: Vec2[][] = [];
  let current: Vec2[] = [];

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        // Start new subpath — close previous if non-empty
        if (current.length >= 3) {
          loops.push(removeDuplicateClosing(current));
        }
        current = [[cmd.x, -cmd.y]]; // flip Y
        break;

      case 'L':
        current.push([cmd.x, -cmd.y]);
        break;

      case 'Q': {
        const p0 = current[current.length - 1];
        const p1: Vec2 = [cmd.x1, -cmd.y1];
        const p2: Vec2 = [cmd.x, -cmd.y];
        const pts = sampleQuadratic(p0, p1, p2, tolerance);
        for (const pt of pts) current.push(pt);
        break;
      }

      case 'C': {
        const p0 = current[current.length - 1];
        const p1: Vec2 = [cmd.x1, -cmd.y1];
        const p2: Vec2 = [cmd.x2, -cmd.y2];
        const p3: Vec2 = [cmd.x, -cmd.y];
        const pts = sampleCubic(p0, p1, p2, p3, tolerance);
        for (const pt of pts) current.push(pt);
        break;
      }

      case 'Z':
        if (current.length >= 3) {
          loops.push(removeDuplicateClosing(current));
        }
        current = [];
        break;
    }
  }

  // Close any remaining path
  if (current.length >= 3) {
    loops.push(removeDuplicateClosing(current));
  }

  return loops;
}

// ---------------------------------------------------------------------------
// Loops → Sketch (nonzero fill rule, same as SVG import)
// ---------------------------------------------------------------------------

interface LoopInfo {
  points: Vec2[];
  area: number;
  absArea: number;
  sample: Vec2;
}

function loopInfo(points: Vec2[]): LoopInfo {
  const area = signedArea(points);
  // Use a point near the centroid for containment tests
  let sx = 0,
    sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  const sample: Vec2 = [sx / points.length, sy / points.length];
  return { points, area, absArea: Math.abs(area), sample };
}

/**
 * Build a filled Sketch from polygon loops using the nonzero fill rule
 * (standard for TrueType/OpenType fonts).
 */
function loopsToSketch(loops: Vec2[][]): Sketch | null {
  const infos = loops.filter((l) => l.length >= 3 && Math.abs(signedArea(l)) > EPS).map(loopInfo);

  if (infos.length === 0) return null;

  // Nonzero fill rule: dominant winding = outer, opposite = hole
  const dominant = [...infos].sort((a, b) => b.absArea - a.absArea)[0];
  const dominantSign = dominant.area >= 0 ? 1 : -1;

  const adders: Sketch[] = [];
  const subtractors: Sketch[] = [];

  for (const info of infos) {
    const loopSketch = polygon(info.points);
    const sign = info.area >= 0 ? 1 : -1;
    if (sign === dominantSign) adders.push(loopSketch);
    else subtractors.push(loopSketch);
  }

  if (adders.length === 0) {
    adders.push(polygon(infos[0].points));
  }

  let sketch = adders.length === 1 ? adders[0] : union2d(...adders);
  if (subtractors.length > 0) {
    sketch = difference2d(sketch, ...subtractors);
  }
  return sketch.isEmpty() ? null : sketch;
}

// ---------------------------------------------------------------------------
// Public: render text using an opentype font
// ---------------------------------------------------------------------------

export interface FontTextOptions {
  /** Cap height in model units. @default 10 */
  size?: number;
  /** Extra space between characters in model units. @default 0 */
  letterSpacing?: number;
  /** Horizontal alignment relative to x=0. @default 'left' */
  align?: 'left' | 'center' | 'right';
  /** Vertical alignment relative to y=0. @default 'baseline' */
  baseline?: 'baseline' | 'center' | 'top';
  /**
   * Bezier flattening tolerance in model units.
   * Smaller = more segments, smoother curves.
   * @default auto (0.5% of size)
   */
  flattenTolerance?: number;
}

/**
 * Render text as a 2D Sketch using a loaded opentype.js font.
 * This produces professional typography with proper curves, kerning,
 * and full character set support.
 */
export function fontText2d(font: opentype.Font, content: string, options: FontTextOptions = {}): Sketch {
  const { size = 10, letterSpacing = 0, align = 'left', baseline = 'baseline' } = options;

  if (content.length === 0) {
    throw new Error('fontText2d: content must not be empty');
  }
  if (!(size > 0)) {
    throw new Error('fontText2d: size must be a positive number');
  }

  // Scale factor: font units → model units
  // Font ascender height maps to cap height (size)
  const unitsPerEm = font.unitsPerEm;
  // Use the cap height from the OS/2 table if available, else fall back to ascender
  const capHeight = (font.tables as any).os2?.sCapHeight || font.ascender;
  const scale = size / capHeight;

  // Flattening tolerance in font units
  const toleranceModelUnits = options.flattenTolerance ?? size * 0.005;
  const tolerance = toleranceModelUnits / scale;

  const glyphs = font.stringToGlyphs(content);
  const glyphSketches: Sketch[] = [];
  let cursor = 0; // in font units

  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];

    // Get the glyph path at origin in font units
    const path = glyph.getPath(cursor, 0, unitsPerEm);
    const loops = pathToLoops(path.commands, tolerance);

    if (loops.length > 0) {
      const sketch = loopsToSketch(loops);
      if (sketch && !sketch.isEmpty()) {
        glyphSketches.push(sketch);
      }
    }

    // Advance cursor
    const advance = glyph.advanceWidth || 0;
    cursor += advance;

    // Apply kerning with next glyph
    if (i < glyphs.length - 1) {
      const kerning = font.getKerningValue(glyph, glyphs[i + 1]);
      cursor += kerning;
    }

    // Apply letter spacing (in font units)
    cursor += letterSpacing / scale;
  }

  if (glyphSketches.length === 0) {
    throw new Error(`fontText2d: no renderable characters found in "${content}"`);
  }

  // Merge all glyph sketches
  let sketch = glyphSketches.length === 1 ? glyphSketches[0] : union2d(...glyphSketches);

  // Scale from font units to model units
  sketch = sketch.scale(scale);

  // Total width after scaling
  const totalWidth = cursor * scale;

  // Horizontal alignment
  let dx = 0;
  if (align === 'center') dx = -totalWidth / 2;
  else if (align === 'right') dx = -totalWidth;

  // Vertical alignment
  let dy = 0;
  if (baseline === 'center') dy = -size / 2;
  else if (baseline === 'top') dy = -size;

  if (dx !== 0 || dy !== 0) {
    sketch = sketch.translate(dx, dy);
  }

  return sketch;
}

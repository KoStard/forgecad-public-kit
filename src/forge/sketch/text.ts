/**
 * text2d — first-class text geometry for ForgeCAD.
 *
 * Returns a Sketch of filled 2D letterforms that can be extruded, revolved,
 * cut into a face, or used anywhere a normal Sketch is accepted.
 *
 * Font: "Forge Mono" — a custom geometric monoline sans-serif designed for
 * technical CAD work.  Clean, squared-off, futuristic.  Inspired by Eurostile
 * and Chakra Petch.  Uniform stroke weight; flat open ends; no serifs.
 *
 * @example
 *   // Raised label, 8 mm tall
 *   text2d('FORGE', { size: 8 }).extrude(1);
 *
 *   // Engraved text cut into the top face of a box
 *   const label = text2d('REV A', { size: 5, align: 'center' });
 *   box(60, 30, 10).cut(label.onFace(/* top face * /), { depth: 0.5 });
 */

import { Sketch } from './core';
import { circle2d, polygon, slot } from './primitives';
import { union2d } from './booleans';

// ---------------------------------------------------------------------------
// Internal design parameters (1 unit = 1 model unit when size=1)
// All glyphs are defined on a 0..1 × 0..1 grid; text2d scales to `size`.
// ---------------------------------------------------------------------------

/** Stroke width as a fraction of cap height. */
const SW_RATIO = 0.12;

// ---------------------------------------------------------------------------
// Low-level geometry helpers
// ---------------------------------------------------------------------------

/** Horizontal capsule bar centred at (midX, y), spanning x0..x1. */
function hBar(y: number, x0: number, x1: number, sw: number): Sketch {
  return slot(Math.abs(x1 - x0), sw).translate((x0 + x1) / 2, y);
}

/** Vertical capsule bar centred at x, spanning y0..y1. */
function vBar(cx: number, y0: number, y1: number, sw: number): Sketch {
  return slot(Math.abs(y1 - y0), sw).rotate(90).translate(cx, (y0 + y1) / 2);
}

/** Diagonal capsule bar from (x1,y1) to (x2,y2). */
function dBar(x1: number, y1: number, x2: number, y2: number, sw: number): Sketch {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return slot(len, sw).rotate(angle).translate((x1 + x2) / 2, (y1 + y2) / 2);
}

/**
 * Flat-ended annular arc segment.
 * cx,cy = centre; R = mid-radius; a1..a2 in degrees (standard math angles,
 * CCW from +x); sw = stroke width.
 */
function arcBar(cx: number, cy: number, R: number, a1Deg: number, a2Deg: number, sw: number): Sketch {
  const outerR = R + sw / 2;
  const innerR = Math.max(sw * 0.1, R - sw / 2);
  const range = a2Deg - a1Deg;
  const segs = Math.max(8, Math.ceil(Math.abs(range) / 4));
  const pts: [number, number][] = [];

  for (let i = 0; i <= segs; i++) {
    const a = (a1Deg + range * (i / segs)) * (Math.PI / 180);
    pts.push([cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)]);
  }
  for (let i = segs; i >= 0; i--) {
    const a = (a1Deg + range * (i / segs)) * (Math.PI / 180);
    pts.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
  }
  return polygon(pts);
}

/** Full circle ring (donut), used for O, 0, etc. */
function ringFull(cx: number, cy: number, R: number, sw: number): Sketch {
  const outerR = R + sw / 2;
  const innerR = Math.max(sw * 0.1, R - sw / 2);
  const segs = Math.max(32, Math.ceil(2 * Math.PI * outerR / (sw * 0.5)));
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    outer.push([cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)]);
    inner.push([cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)]);
  }
  // Manifold expects outer CCW and inner CW (hole).  outer is CCW by the loop
  // direction; inner must be CW — reverse it.
  return new Sketch(
    (polygon(outer)).cross.subtract((polygon(inner)).cross),
  );
}

/** Small filled dot (for i, j, !, ?, :, ;, period). */
function dot(cx: number, cy: number, sw: number): Sketch {
  return circle2d(sw * 0.65).translate(cx, cy);
}

// ---------------------------------------------------------------------------
// Glyph registry
// A glyph is a function (sw: number) => Sketch drawn in a [0..AW] × [0..1]
// box, plus the advance width AW (also in normalised units).
// ---------------------------------------------------------------------------

type GlyphFn = (sw: number) => Sketch;
type GlyphEntry = { draw: GlyphFn; advance: number };

const u = union2d; // shorthand

function g(advance: number, draw: GlyphFn): GlyphEntry {
  return { advance, draw };
}

// ---------------------------------------------------------------------------
// Individual glyph definitions — geometry lives in the [0..AW]×[0..1] box.
// SW is always 0.12 (SW_RATIO), passed in as sw.
// The mid of left vertical is at x = sw/2; mid of right vert at x = AW-sw/2.
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, GlyphEntry> = {

  // ---- uppercase A-Z -------------------------------------------------------

  A: g(0.62, (sw) => {
    const m = sw / 2; // margin = stroke radius
    const top = 0.5 * (m + (0.62 - m)); // apex x
    const apexX = 0.62 / 2;
    const barY = 0.42;
    const barX0 = barY * apexX / 1.0 + m * 0.3;
    const barX1 = 0.62 - barX0;
    return u(
      dBar(m, 0, apexX, 1, sw),
      dBar(0.62 - m, 0, apexX, 1, sw),
      hBar(barY, barX0, barX1, sw),
    );
  }),

  B: g(0.58, (sw) => {
    const lx = sw / 2;
    const Rt = 0.22; // top bump mid-radius
    const Rb = 0.24; // bottom bump mid-radius
    const midY = 0.50;
    return u(
      vBar(lx, 0, 1, sw),
      arcBar(lx, 1 - Rt - sw / 2, Rt, -90, 90, sw),
      arcBar(lx, Rb + sw / 2, Rb, -90, 90, sw),
      hBar(midY, lx, lx + Rt + sw / 2, sw),
    );
  }),

  C: g(0.58, (sw) => {
    const cx = 0.29;
    const cy = 0.5;
    const R = 0.27;
    const gap = 32; // degrees opening on right
    return arcBar(cx, cy, R, gap, 360 - gap, sw);
  }),

  D: g(0.60, (sw) => {
    const lx = sw / 2;
    const R = 0.27;
    const cy = 0.5;
    return u(
      vBar(lx, 0, 1, sw),
      arcBar(lx, cy, R, -90, 90, sw),
    );
  }),

  E: g(0.54, (sw) => {
    const lx = sw / 2;
    const rShort = 0.54 - sw;  // short arm
    const rLong = 0.54 - sw / 2;
    return u(
      vBar(lx, 0, 1, sw),
      hBar(1, lx, rLong, sw),
      hBar(0.5, lx, rShort, sw),
      hBar(0, lx, rLong, sw),
    );
  }),

  F: g(0.52, (sw) => {
    const lx = sw / 2;
    const rLong = 0.52 - sw / 2;
    const rShort = 0.48 - sw;
    return u(
      vBar(lx, 0, 1, sw),
      hBar(1, lx, rLong, sw),
      hBar(0.53, lx, rShort, sw),
    );
  }),

  G: g(0.62, (sw) => {
    const cx = 0.31;
    const cy = 0.5;
    const R = 0.27;
    const gap = 28;
    const stubY = cy;
    const stubX0 = cx + R * Math.cos(gap * Math.PI / 180) - sw / 2;
    const stubX1 = cx + R + sw / 2;
    return u(
      arcBar(cx, cy, R, gap, 360 - gap, sw),
      hBar(stubY, stubX0, stubX1, sw),
    );
  }),

  H: g(0.62, (sw) => {
    const lx = sw / 2;
    const rx = 0.62 - sw / 2;
    return u(
      vBar(lx, 0, 1, sw),
      vBar(rx, 0, 1, sw),
      hBar(0.5, lx, rx, sw),
    );
  }),

  I: g(0.20, (sw) => {
    return vBar(0.10, 0, 1, sw);
  }),

  J: g(0.46, (sw) => {
    const rx = 0.46 - sw / 2;
    const R = 0.16;
    const cx = rx - R;
    return u(
      vBar(rx, R, 1, sw),
      arcBar(cx, R, R, 180, 360, sw),
    );
  }),

  K: g(0.60, (sw) => {
    const lx = sw / 2;
    const mx = lx + 0.02; // where the diagonals meet on the stem
    return u(
      vBar(lx, 0, 1, sw),
      dBar(mx + sw * 0.3, 0.5, 0.60 - sw / 2, 1, sw),
      dBar(mx + sw * 0.3, 0.5, 0.60 - sw / 2, 0, sw),
    );
  }),

  L: g(0.52, (sw) => {
    const lx = sw / 2;
    return u(
      vBar(lx, 0, 1, sw),
      hBar(0, lx, 0.52 - sw / 2, sw),
    );
  }),

  M: g(0.72, (sw) => {
    const lx = sw / 2;
    const rx = 0.72 - sw / 2;
    const mx = 0.72 / 2;
    return u(
      vBar(lx, 0, 1, sw),
      vBar(rx, 0, 1, sw),
      dBar(lx, 1, mx, 0.45, sw),
      dBar(rx, 1, mx, 0.45, sw),
    );
  }),

  N: g(0.62, (sw) => {
    const lx = sw / 2;
    const rx = 0.62 - sw / 2;
    return u(
      vBar(lx, 0, 1, sw),
      vBar(rx, 0, 1, sw),
      dBar(lx, 1, rx, 0, sw),
    );
  }),

  O: g(0.64, (sw) => {
    const cx = 0.32;
    const cy = 0.5;
    const R = 0.27;
    return ringFull(cx, cy, R, sw);
  }),

  P: g(0.56, (sw) => {
    const lx = sw / 2;
    const R = 0.21;
    const cy = 1 - R - sw / 2;
    return u(
      vBar(lx, 0, 1, sw),
      arcBar(lx, cy, R, -90, 90, sw),
      hBar(cy - R, lx, lx + R + sw / 2, sw),
    );
  }),

  Q: g(0.64, (sw) => {
    const cx = 0.32;
    const cy = 0.5;
    const R = 0.27;
    const tickX = cx + R * Math.cos(-40 * Math.PI / 180);
    const tickY = cy + R * Math.sin(-40 * Math.PI / 180);
    return u(
      ringFull(cx, cy, R, sw),
      dBar(tickX, tickY, cx + R + sw, cy - R - sw * 0.5, sw),
    );
  }),

  R: g(0.60, (sw) => {
    const lx = sw / 2;
    const R = 0.21;
    const cy = 1 - R - sw / 2;
    const midY = cy - R;
    return u(
      vBar(lx, 0, 1, sw),
      arcBar(lx, cy, R, -90, 90, sw),
      hBar(midY, lx, lx + R + sw / 2, sw),
      dBar(lx + sw * 0.3, midY, 0.60 - sw / 2, 0, sw),
    );
  }),

  S: g(0.56, (sw) => {
    const cx = 0.28;
    const Rt = 0.20;
    const Rb = 0.22;
    const topCy = 0.78;
    const botCy = 0.22;
    const gapT = 35;
    const gapB = 35;
    return u(
      arcBar(cx, topCy, Rt, gapT, 360 - gapT + 180, sw),   // upper arc, opens bottom-right
      arcBar(cx, botCy, Rb, gapB + 180, 360 - gapB + 360, sw), // lower arc, opens top-left
    );
  }),

  T: g(0.60, (sw) => {
    const mx = 0.60 / 2;
    return u(
      hBar(1, sw / 2, 0.60 - sw / 2, sw),
      vBar(mx, 0, 1, sw),
    );
  }),

  U: g(0.62, (sw) => {
    const lx = sw / 2;
    const rx = 0.62 - sw / 2;
    const cx = 0.62 / 2;
    const R = cx - lx;
    return u(
      vBar(lx, R, 1, sw),
      vBar(rx, R, 1, sw),
      arcBar(cx, R, R, 180, 360, sw),
    );
  }),

  V: g(0.62, (sw) => {
    const mx = 0.62 / 2;
    return u(
      dBar(sw / 2, 1, mx, 0, sw),
      dBar(0.62 - sw / 2, 1, mx, 0, sw),
    );
  }),

  W: g(0.82, (sw) => {
    const lx = sw / 2;
    const rx = 0.82 - sw / 2;
    const lm = 0.28;
    const rm = 0.54;
    const midY = 0.28;
    return u(
      dBar(lx, 1, lm, 0, sw),
      dBar(lm, 0, 0.82 / 2, midY, sw),
      dBar(0.82 / 2, midY, rm, 0, sw),
      dBar(rm, 0, rx, 1, sw),
    );
  }),

  X: g(0.60, (sw) => {
    return u(
      dBar(sw / 2, 0, 0.60 - sw / 2, 1, sw),
      dBar(sw / 2, 1, 0.60 - sw / 2, 0, sw),
    );
  }),

  Y: g(0.60, (sw) => {
    const mx = 0.60 / 2;
    const midY = 0.46;
    return u(
      dBar(sw / 2, 1, mx, midY, sw),
      dBar(0.60 - sw / 2, 1, mx, midY, sw),
      vBar(mx, 0, midY, sw),
    );
  }),

  Z: g(0.58, (sw) => {
    return u(
      hBar(1, sw / 2, 0.58 - sw / 2, sw),
      hBar(0, sw / 2, 0.58 - sw / 2, sw),
      dBar(0.58 - sw / 2, 1, sw / 2, 0, sw),
    );
  }),

  // ---- digits 0–9 ---------------------------------------------------------

  '0': g(0.62, (sw) => {
    const cx = 0.31;
    const cy = 0.5;
    const R = 0.26;
    return u(
      ringFull(cx, cy, R, sw),
      dBar(cx - R * 0.35, cy + R * 0.35, cx + R * 0.35, cy - R * 0.35, sw * 0.8),
    );
  }),

  '1': g(0.40, (sw) => {
    const mx = 0.40 / 2;
    return u(
      vBar(mx, 0, 1, sw),
      dBar(sw / 2, 0.72, mx, 1, sw),
      hBar(0, sw / 2, 0.40 - sw / 2, sw),
    );
  }),

  '2': g(0.58, (sw) => {
    const cx = 0.29;
    const cy = 0.74;
    const R = 0.21;
    const gapDeg = 25;
    return u(
      arcBar(cx, cy, R, gapDeg, 360 - gapDeg + 180, sw),
      dBar(sw / 2 + sw * 0.2, 0, 0.58 - sw / 2, 0.48, sw),
      hBar(0, sw / 2, 0.58 - sw / 2, sw),
    );
  }),

  '3': g(0.56, (sw) => {
    const cx = 0.26;
    const Rt = 0.20;
    const Rb = 0.22;
    const topCy = 0.78;
    const botCy = 0.24;
    const gapT = 40;
    const gapB = 35;
    return u(
      arcBar(cx, topCy, Rt, gapT - 180, 180 - gapT, sw),
      arcBar(cx, botCy, Rb, gapB - 180, 180 - gapB, sw),
      hBar(0.5, cx, cx + Rt + sw * 0.5, sw),
    );
  }),

  '4': g(0.60, (sw) => {
    const rx = 0.60 - sw / 2;
    const kx = rx * 0.62;
    const ky = 0.36;
    return u(
      vBar(rx, 0, 1, sw),
      dBar(sw / 2, 1, kx, ky, sw),
      hBar(ky, sw / 2, rx, sw),
    );
  }),

  '5': g(0.56, (sw) => {
    const lx = sw / 2;
    const cx = 0.26;
    const R = 0.22;
    const cy = 0.26;
    return u(
      hBar(1, lx, 0.56 - sw / 2, sw),
      vBar(lx, 0.48, 1, sw),
      hBar(0.48, lx, cx + R + sw / 2, sw),
      arcBar(cx, cy, R, -20, 200, sw),
    );
  }),

  '6': g(0.60, (sw) => {
    const cx = 0.30;
    const botCy = 0.28;
    const Rb = 0.22;
    const R = 0.27;
    const topGap = 30;
    return u(
      arcBar(cx, 0.5, R, 120, 360 - topGap + 180, sw),
      arcBar(cx, botCy, Rb, -180, 180, sw),
    );
  }),

  '7': g(0.56, (sw) => {
    const lx = sw / 2;
    const rx = 0.56 - sw / 2;
    return u(
      hBar(1, lx, rx, sw),
      dBar(rx, 1, lx + sw, 0, sw),
      hBar(0.56, lx + sw * 0.5, rx * 0.75, sw),
    );
  }),

  '8': g(0.58, (sw) => {
    const cx = 0.29;
    const Rt = 0.20;
    const Rb = 0.22;
    const topCy = 0.72;
    const botCy = 0.26;
    return u(
      arcBar(cx, topCy, Rt, 0, 360, sw),
      arcBar(cx, botCy, Rb, 0, 360, sw),
    );
  }),

  '9': g(0.60, (sw) => {
    const cx = 0.30;
    const topCy = 0.72;
    const Rt = 0.22;
    const R = 0.27;
    const botGap = 30;
    return u(
      arcBar(cx, 0.5, R, topCy - 0.5 > 0 ? -30 : -60, 180 + botGap, sw),
      arcBar(cx, topCy, Rt, -180, 180, sw),
    );
  }),

  // ---- punctuation & symbols ----------------------------------------------

  ' ': g(0.30, (_sw) => circle2d(0.001).translate(0, 0)), // empty space glyph

  '.': g(0.20, (sw) => dot(0.10, sw * 0.65, sw)),

  ',': g(0.22, (sw) => u(
    dot(0.11, sw * 0.65, sw),
    dBar(0.11, sw * 0.65, 0.05, -sw * 0.5, sw * 0.7),
  )),

  ':': g(0.22, (sw) => u(
    dot(0.11, sw * 0.65, sw),
    dot(0.11, 0.55, sw),
  )),

  ';': g(0.22, (sw) => u(
    dot(0.11, sw * 0.65, sw),
    dBar(0.11, sw * 0.65, 0.05, -sw * 0.5, sw * 0.7),
    dot(0.11, 0.55, sw),
  )),

  '!': g(0.20, (sw) => u(
    vBar(0.10, sw * 2, 1, sw),
    dot(0.10, sw * 0.65, sw),
  )),

  '?': g(0.46, (sw) => {
    const cx = 0.23;
    const cy = 0.72;
    const R = 0.18;
    return u(
      arcBar(cx, cy, R, 20, 220, sw),
      vBar(cx, 0.28, cy - R + sw * 0.3, sw),
      dot(cx, sw * 0.65, sw),
    );
  }),

  '-': g(0.44, (sw) => hBar(0.5, sw / 2, 0.44 - sw / 2, sw)),

  '_': g(0.54, (sw) => hBar(0, sw / 2, 0.54 - sw / 2, sw)),

  '/': g(0.46, (sw) => dBar(sw / 2, 0, 0.46 - sw / 2, 1, sw)),

  '\\': g(0.46, (sw) => dBar(sw / 2, 1, 0.46 - sw / 2, 0, sw)),

  '+': g(0.54, (sw) => {
    const m = sw / 2;
    const mx = 0.54 / 2;
    return u(
      hBar(0.5, m, 0.54 - m, sw),
      vBar(mx, 0.18, 0.82, sw),
    );
  }),

  '*': g(0.50, (sw) => {
    const mx = 0.25;
    const my = 0.5;
    const arm = 0.18;
    return u(
      hBar(my, mx - arm, mx + arm, sw),
      dBar(mx - arm * 0.7, my - arm * 0.7, mx + arm * 0.7, my + arm * 0.7, sw),
      dBar(mx - arm * 0.7, my + arm * 0.7, mx + arm * 0.7, my - arm * 0.7, sw),
    );
  }),

  '#': g(0.60, (sw) => {
    const lv = 0.18;
    const rv = 0.42;
    return u(
      vBar(lv, 0.08, 0.92, sw),
      vBar(rv, 0.08, 0.92, sw),
      hBar(0.65, sw / 2, 0.60 - sw / 2, sw),
      hBar(0.35, sw / 2, 0.60 - sw / 2, sw),
    );
  }),

  '@': g(0.72, (sw) => {
    const cx = 0.34;
    const cy = 0.46;
    const R = 0.28;
    const innerR = 0.15;
    const gap = 30;
    return u(
      arcBar(cx, cy, R, gap, 360 - gap + 180 + 20, sw),
      ringFull(cx, cy, innerR, sw),
      hBar(cy, cx + innerR + sw / 2, cx + R, sw),
    );
  }),

  '(': g(0.30, (sw) => {
    const cx = 0.28;
    const cy = 0.5;
    const R = 0.36;
    return arcBar(cx, cy, R, 110, 250, sw);
  }),

  ')': g(0.30, (sw) => {
    const cx = 0.02;
    const cy = 0.5;
    const R = 0.36;
    return arcBar(cx, cy, R, -70, 70, sw);
  }),

  '[': g(0.30, (sw) => {
    const lx = sw / 2;
    const rLong = 0.30 - sw / 2;
    return u(
      vBar(lx, 0, 1, sw),
      hBar(1, lx, rLong, sw),
      hBar(0, lx, rLong, sw),
    );
  }),

  ']': g(0.30, (sw) => {
    const rx = 0.30 - sw / 2;
    const lLong = sw / 2;
    return u(
      vBar(rx, 0, 1, sw),
      hBar(1, lLong, rx, sw),
      hBar(0, lLong, rx, sw),
    );
  }),

  '<': g(0.46, (sw) => u(
    dBar(0.46 - sw / 2, 0.8, sw / 2, 0.5, sw),
    dBar(sw / 2, 0.5, 0.46 - sw / 2, 0.2, sw),
  )),

  '>': g(0.46, (sw) => u(
    dBar(sw / 2, 0.8, 0.46 - sw / 2, 0.5, sw),
    dBar(0.46 - sw / 2, 0.5, sw / 2, 0.2, sw),
  )),

  '=': g(0.54, (sw) => u(
    hBar(0.6, sw / 2, 0.54 - sw / 2, sw),
    hBar(0.4, sw / 2, 0.54 - sw / 2, sw),
  )),

  '%': g(0.66, (sw) => {
    const R = 0.09;
    return u(
      dot(0.12, 0.82, R + sw / 2),
      dBar(sw / 2, 0, 0.66 - sw / 2, 1, sw),
      dot(0.54, 0.18, R + sw / 2),
    );
  }),

  "'": g(0.20, (sw) => vBar(0.10, 0.7, 1, sw)),

  '"': g(0.36, (sw) => u(
    vBar(0.10, 0.7, 1, sw),
    vBar(0.26, 0.7, 1, sw),
  )),

  '`': g(0.24, (sw) => dBar(sw / 2, 0.9, 0.24 - sw / 2, 1, sw)),

  '^': g(0.52, (sw) => u(
    dBar(sw / 2, 0.7, 0.52 / 2, 1, sw),
    dBar(0.52 / 2, 1, 0.52 - sw / 2, 0.7, sw),
  )),

  '~': g(0.56, (sw) => {
    const cx = 0.28;
    const R = 0.10;
    return u(
      arcBar(cx - R * 0.8, 0.55, R, 30, 210, sw),
      arcBar(cx + R * 0.8, 0.45, R, 210, 30 + 360, sw),
    );
  }),

  '|': g(0.20, (sw) => vBar(0.10, 0, 1, sw)),

  '&': g(0.66, (sw) => {
    const cx = 0.27;
    const Rt = 0.18;
    const topCy = 0.76;
    return u(
      arcBar(cx, topCy, Rt, 45, 360, sw),
      dBar(cx - Rt * 0.7, topCy - Rt * 0.7, 0.66 - sw / 2, 0, sw),
      dBar(sw / 2, 0.34, cx + Rt, topCy + Rt * 0.4, sw),
    );
  }),
};

// Lowercase: map to uppercase (no-op for all-caps font)
for (const ch of 'abcdefghijklmnopqrstuvwxyz') {
  const upper = ch.toUpperCase();
  if (GLYPHS[upper]) {
    GLYPHS[ch] = GLYPHS[upper];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TextOptions {
  /**
   * Cap height of the text in model units.
   * All other dimensions (stroke weight, spacing) scale proportionally.
   * @default 10
   */
  size?: number;

  /**
   * Extra space between characters in model units.
   * Negative values tighten the tracking.
   * @default 0
   */
  letterSpacing?: number;

  /**
   * Horizontal alignment relative to x = 0.
   * - `'left'`   — left edge at x = 0 (default)
   * - `'center'` — centred on x = 0
   * - `'right'`  — right edge at x = 0
   * @default 'left'
   */
  align?: 'left' | 'center' | 'right';

  /**
   * Vertical alignment relative to y = 0.
   * - `'baseline'` — y = 0 is the text baseline (bottom of capital letters)
   * - `'center'`   — y = 0 is the vertical midpoint of the cap height
   * - `'top'`      — y = 0 is the top of capital letters
   * @default 'baseline'
   */
  baseline?: 'baseline' | 'center' | 'top';
}

/**
 * Build a 2-D filled Sketch from a text string.
 *
 * The Sketch origin is at the left end of the text baseline by default (see
 * `align` and `baseline` options to adjust placement).  All characters are
 * drawn using the built-in "Forge Mono" geometric font — a clean, angular,
 * monoline typeface designed to extrude and engrave crisply.
 *
 * @example
 * // Extruded nameplate
 * text2d('FORGE CAD', { size: 8 }).extrude(1.2)
 *
 * @example
 * // Centered label on the XY plane
 * text2d('V 2.0', { size: 6, align: 'center', baseline: 'center' })
 */
export function text2d(content: string, options: TextOptions = {}): Sketch {
  const {
    size = 10,
    letterSpacing = 0,
    align = 'left',
    baseline = 'baseline',
  } = options;

  if (typeof content !== 'string') {
    throw new TypeError('text2d: content must be a string');
  }
  if (content.length === 0) {
    throw new Error('text2d: content must not be empty');
  }
  if (!(size > 0)) {
    throw new Error('text2d: size must be a positive number');
  }

  const sw = SW_RATIO; // normalised stroke width (glyph space)
  const lsNorm = letterSpacing / size; // letter spacing in glyph space

  // Build each glyph sketch and accumulate total advance
  const parts: Sketch[] = [];
  let cursor = 0;

  for (const ch of content) {
    const entry = GLYPHS[ch];
    if (!entry) {
      // Unknown character: treat as a space-width gap
      cursor += 0.35 + lsNorm;
      continue;
    }

    if (ch !== ' ') {
      const glyphSketch = entry.draw(sw).translate(cursor, 0);
      if (!glyphSketch.isEmpty()) {
        parts.push(glyphSketch);
      }
    }

    cursor += entry.advance + lsNorm;
  }

  if (parts.length === 0) {
    throw new Error(`text2d: no renderable characters found in "${content}"`);
  }

  // Merge all glyphs
  const totalWidth = cursor - lsNorm; // remove trailing letter spacing
  let sketch = parts.length === 1 ? parts[0] : union2d(...parts);

  // Horizontal alignment offset (all in glyph-space)
  let dx = 0;
  if (align === 'center') dx = -totalWidth / 2;
  else if (align === 'right') dx = -totalWidth;

  // Vertical alignment offset
  let dy = 0;
  if (baseline === 'center') dy = -0.5;
  else if (baseline === 'top') dy = -1;

  if (dx !== 0 || dy !== 0) {
    sketch = sketch.translate(dx, dy);
  }

  // Scale from glyph space (cap height = 1) to model units
  sketch = sketch.scale(size);

  return sketch;
}

/** Returns the rendered width of a string in model units (same options as text2d). */
export function textWidth(content: string, options: Pick<TextOptions, 'size' | 'letterSpacing'> = {}): number {
  const { size = 10, letterSpacing = 0 } = options;
  const lsNorm = letterSpacing / size;
  let cursor = 0;
  for (const ch of content) {
    const entry = GLYPHS[ch];
    cursor += (entry?.advance ?? 0.35) + lsNorm;
  }
  return (cursor - lsNorm) * size;
}

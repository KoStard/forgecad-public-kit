#!/usr/bin/env node
/**
 * text2d API contract tests.
 *
 * Verifies:
 *  - All A-Z, 0-9 and common punctuation glyphs produce non-empty sketches
 *  - Size option scales geometry proportionally
 *  - letterSpacing widens the overall bounding box
 *  - align: 'center' and 'right' shift geometry correctly
 *  - baseline: 'top' and 'center' shift geometry correctly
 *  - textWidth() matches the rendered sketch width
 *  - text2d sketches extrude to valid solids
 *  - Error cases throw appropriate messages
 */
import assert from 'node:assert/strict';
import { init, text2d, textWidth, Sketch } from '../src/forge/headless';
import type { TrackedShape } from '../src/forge/headless';

const EPS = 1e-3;

function approx(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function expectClose(actual: number, expected: number, label: string, eps = EPS): void {
  assert(approx(actual, expected, eps), `${label}: expected ${expected}, got ${actual}`);
}

function bounds(sk: Sketch): { minX: number; maxX: number; minY: number; maxY: number; w: number; h: number } {
  const b = sk.bounds() as { min: [number, number]; max: [number, number] };
  return {
    minX: b.min[0],
    maxX: b.max[0],
    minY: b.min[1],
    maxY: b.max[1],
    w: b.max[0] - b.min[0],
    h: b.max[1] - b.min[1],
  };
}

// ---------------------------------------------------------------------------
// Individual glyph smoke test
// ---------------------------------------------------------------------------
function checkAllGlyphs(): void {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?:.-+*#@/()[]<>=~_|%';
  for (const ch of chars) {
    const sk = text2d(ch, { size: 10 });
    assert(!sk.isEmpty(), `Glyph "${ch}" produced empty sketch`);
    const { w, h } = bounds(sk);
    assert(w > 0, `Glyph "${ch}" has zero width`);
    assert(h > 0, `Glyph "${ch}" has zero height`);
    // For alphanumerics: cap height should be close to size=10 (round caps extend SW/2 beyond each end)
    const sw = 10 * 0.12;
    const isAlphaNum = /[A-Z0-9]/i.test(ch);
    assert(h <= 10 + sw + 0.5, `Glyph "${ch}" height ${h.toFixed(2)} exceeds max ${(10 + sw + 0.5).toFixed(1)}`);
    if (isAlphaNum) {
      assert(h > 5, `Glyph "${ch}" height ${h.toFixed(2)} too small for alphanumeric`);
    }
  }
}

// ---------------------------------------------------------------------------
// Size scaling
// ---------------------------------------------------------------------------
function checkSizeScaling(): void {
  const small = text2d('A', { size: 5 });
  const large = text2d('A', { size: 20 });
  const sb = bounds(small);
  const lb = bounds(large);
  // Width and height should scale by 20/5 = 4
  expectClose(lb.w / sb.w, 4, 'Width scales 4×', 0.05);
  expectClose(lb.h / sb.h, 4, 'Height scales 4×', 0.05);
}

// ---------------------------------------------------------------------------
// letterSpacing
// ---------------------------------------------------------------------------
function checkLetterSpacing(): void {
  const base = text2d('HI', { size: 10, letterSpacing: 0 });
  const wide = text2d('HI', { size: 10, letterSpacing: 5 });
  const bBase = bounds(base);
  const bWide = bounds(wide);
  // One extra letter-spacing gap of 5 (between 2 chars = 1 gap)
  expectClose(bWide.w - bBase.w, 5, 'letterSpacing widens by 5', 0.2);
}

// ---------------------------------------------------------------------------
// textWidth()
// ---------------------------------------------------------------------------
function checkTextWidth(): void {
  const content = 'FORGE';
  const size = 12;
  const sk = text2d(content, { size });
  const reported = textWidth(content, { size });
  const { w } = bounds(sk);
  // reported width should match sketch bounding box within stroke half-width
  const sw = size * 0.12 / 2;
  assert(
    Math.abs(reported - w) < sw + EPS,
    `textWidth ${reported.toFixed(3)} should match sketch width ${w.toFixed(3)} within ${(sw + EPS).toFixed(3)}`,
  );
}

// ---------------------------------------------------------------------------
// Horizontal alignment
// ---------------------------------------------------------------------------
function checkHorizontalAlignment(): void {
  const left   = text2d('CAD', { size: 10, align: 'left' });
  const center = text2d('CAD', { size: 10, align: 'center' });
  const right  = text2d('CAD', { size: 10, align: 'right' });

  const bl = bounds(left);
  const bc = bounds(center);
  const br = bounds(right);

  // Left: minX near 0 (round forms may slightly overhang by up to one stroke width)
  const swUnits = 10 * 0.12;
  assert(bl.minX >= -(swUnits + EPS), `align:left minX should be near 0, got ${bl.minX}`);

  // Center: advance-based centering — the center-aligned sketch should sit between left and right.
  // We verify that center's minX is left of left's minX and right of right's minX.
  assert(bc.minX < bl.minX, `align:center minX (${bc.minX.toFixed(2)}) should be left of left (${bl.minX.toFixed(2)})`);
  assert(bc.minX > br.minX, `align:center minX (${bc.minX.toFixed(2)}) should be right of right (${br.minX.toFixed(2)})`);

  // Right: maxX should be near 0 (round forms may slightly overhang)
  assert(br.maxX <= swUnits + EPS, `align:right maxX should be near 0, got ${br.maxX}`);

  // All three should have the same width
  expectClose(bl.w, bc.w, 'center vs left width', 0.05);
  expectClose(bl.w, br.w, 'right vs left width', 0.05);
}

// ---------------------------------------------------------------------------
// Vertical baseline
// ---------------------------------------------------------------------------
function checkBaseline(): void {
  const base   = text2d('M', { size: 10, baseline: 'baseline' });
  const center = text2d('M', { size: 10, baseline: 'center' });
  const top    = text2d('M', { size: 10, baseline: 'top' });

  const bb = bounds(base);
  const bc = bounds(center);
  const bt = bounds(top);

  // baseline: minY ~= 0 (within stroke radius)
  assert(bb.minY >= -0.7 && bb.minY < 0.7, `baseline:baseline minY=${bb.minY.toFixed(3)} expected ~0`);

  // center: midpoint ~= 0
  const mid = (bc.minY + bc.maxY) / 2;
  assert(Math.abs(mid) < 0.7, `baseline:center midpoint=${mid.toFixed(3)} expected ~0`);

  // top: maxY ~= 0
  assert(bt.maxY <= 0.7 && bt.maxY > -0.7, `baseline:top maxY=${bt.maxY.toFixed(3)} expected ~0`);
}

// ---------------------------------------------------------------------------
// Extrusion produces valid solid
// ---------------------------------------------------------------------------
function checkExtrusion(): void {
  const words = ['FORGE', 'CAD', '2025', 'A-001'];
  for (const w of words) {
    const result = text2d(w, { size: 8 }).extrude(2) as unknown as TrackedShape;
    const vol = typeof result.volume === 'number' ? result.volume : (result as any).volume();
    assert(vol > 0, `Extruded "${w}" should have positive volume, got ${vol}`);
  }
}

// ---------------------------------------------------------------------------
// Multi-line: newline falls back to unknown-char gap (no crash)
// ---------------------------------------------------------------------------
function checkWhitespaceHandling(): void {
  // Space character
  const withSpace = text2d('A B', { size: 10 });
  const without   = text2d('AB',  { size: 10 });
  // Space should make it wider
  assert(bounds(withSpace).w > bounds(without).w, 'Space character should widen text');
}

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------
function checkErrors(): void {
  assert.throws(
    () => text2d('', { size: 10 }),
    /must not be empty/,
    'Empty string should throw',
  );
  assert.throws(
    () => text2d('A', { size: 0 }),
    /must be a positive number/,
    'Zero size should throw',
  );
  assert.throws(
    () => text2d('A', { size: -1 }),
    /must be a positive number/,
    'Negative size should throw',
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
export async function runCheckTextCli(): Promise<void> {
  await init();
  checkAllGlyphs();
  checkSizeScaling();
  checkLetterSpacing();
  checkTextWidth();
  checkHorizontalAlignment();
  checkBaseline();
  checkExtrusion();
  checkWhitespaceHandling();
  checkErrors();
  console.log('✓ text2d contract tests passed');
}

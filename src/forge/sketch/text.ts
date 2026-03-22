/**
 * text2d — first-class text geometry for ForgeCAD.
 *
 * Returns a Sketch of filled 2D letterforms that can be extruded, revolved,
 * cut into a face, or used anywhere a normal Sketch is accepted.
 *
 * Uses real font rendering via opentype.js. The bundled Inter font is used
 * by default; pass a file path or Font object for custom fonts.
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
import { loadFont, fontText2d } from './fontText';
import type opentype from 'opentype.js';

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

  /**
   * Font to use for text rendering.
   *
   * - `'sans-serif'` or `'inter'` — bundled Inter font (works everywhere, including browser)
   * - **file path** — path to a TTF, OTF, or WOFF font file (CLI/Node only)
   * - **Font object** — a previously loaded opentype.js Font (from `loadFont()`)
   * - **omitted** — uses the bundled Inter font (same as `'sans-serif'`)
   *
   * @example
   *   text2d('Hello World', { size: 10 })                          // default Inter
   *   text2d('Custom Font', { size: 10, font: '/path/to/font.ttf' })
   */
  font?: string | opentype.Font;

  /**
   * Bezier flattening tolerance in model units.
   * Smaller = more polygon segments = smoother curves.
   * @default auto (0.5% of size)
   */
  flattenTolerance?: number;
}

/**
 * Build a 2-D filled Sketch from a text string.
 *
 * The Sketch origin is at the left end of the text baseline by default (see
 * `align` and `baseline` options to adjust placement). Text is rendered using
 * the bundled Inter font by default, or any TTF/OTF/WOFF font you provide.
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

  // Resolve font: use provided font, or default to bundled Inter
  const fontSource = options.font ?? 'sans-serif';
  const font = typeof fontSource === 'string'
    ? loadFont(fontSource)
    : fontSource;

  return fontText2d(font, content, {
    size,
    letterSpacing,
    align,
    baseline,
    flattenTolerance: options.flattenTolerance,
  });
}

/** Returns the rendered width of a string in model units (same options as text2d). */
export function textWidth(content: string, options: Pick<TextOptions, 'size' | 'letterSpacing' | 'font'> = {}): number {
  const { size = 10, letterSpacing = 0 } = options;

  const fontSource = options.font ?? 'sans-serif';
  const font = typeof fontSource === 'string'
    ? loadFont(fontSource)
    : fontSource;

  const unitsPerEm = font.unitsPerEm;
  const capHeight = (font.tables as any).os2?.sCapHeight || font.ascender;
  const scale = size / capHeight;

  const glyphs = font.stringToGlyphs(content);
  let cursor = 0;
  for (let i = 0; i < glyphs.length; i++) {
    cursor += glyphs[i].advanceWidth || 0;
    if (i < glyphs.length - 1) {
      cursor += font.getKerningValue(glyphs[i], glyphs[i + 1]);
    }
    cursor += letterSpacing / scale;
  }
  return (cursor - letterSpacing / scale) * scale;
}

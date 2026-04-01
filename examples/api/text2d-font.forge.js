/**
 * text2d with real fonts — professional typography in ForgeCAD.
 *
 * Use `font: 'sans-serif'` for the bundled Inter font (works everywhere,
 * including the browser). Or pass a TTF/OTF file path for custom fonts.
 */

// 1. Bundled font — works everywhere (browser + CLI), no file path needed
const title = text2d('Hello World', { size: 10, font: 'sans-serif' }).extrude(1.2);

// 2. Mixed case with proper kerning and lowercase
const subtitle = text2d('ForgeCAD v2.0 — Pro Typography', {
  size: 6, font: 'inter', align: 'center',
}).extrude(0.8).color('#2196F3');

// 3. Pre-load for reuse across multiple text calls
const font = loadFont('sans-serif');
const line1 = text2d('The quick brown fox', { size: 5, font }).extrude(0.5);
const line2 = text2d('jumps over the lazy dog', { size: 5, font }).extrude(0.5);

// 4. Compare: built-in geometric font (no font option)
const builtin = text2d('BUILT-IN FORGE MONO', { size: 6 }).extrude(0.8).color('#FF5722');

return [
  title   .translate(0,  0, 0),
  subtitle.translate(0, 14, 0),
  line1   .translate(0, 26, 0),
  line2   .translate(0, 34, 0),
  builtin .translate(0, 46, 0),
];

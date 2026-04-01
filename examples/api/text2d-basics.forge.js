/**
 * text2d — first-class text geometry examples.
 *
 * Demonstrates extruded labels, engraved text, centred text, and combining
 * text with other geometry.
 */

// 1. Simple extruded nameplate ─────────────────────────────────────────────
const nameplate = text2d('FORGE CAD', { size: 8 }).extrude(1.5);

// 2. Centred label (useful for annotations, badges, etc.) ──────────────────
const badge = text2d('V 2.0', {
  size: 5,
  align: 'center',
  baseline: 'center',
}).extrude(0.8).color('#00d4ff');

// 3. Individual characters — useful for part labelling ─────────────────────
const partLabel = text2d('A-001', { size: 6, letterSpacing: 0.5 }).extrude(1);

// 4. All uppercase + digits ────────────────────────────────────────────────
const alphabet = text2d('ABCDEFGHIJ', { size: 5 }).extrude(0.6);
const digits   = text2d('0123456789', { size: 5 }).extrude(0.6);

// 5. Special characters / punctuation ─────────────────────────────────────
const punct = text2d('! ? : . - + * #', { size: 4 }).extrude(0.4);

// Display each demo offset vertically
return [
  nameplate.translate(0,  0, 0),
  badge    .translate(0, 15, 0),
  partLabel.translate(0, 25, 0),
  alphabet .translate(0, 35, 0),
  digits   .translate(0, 45, 0),
  punct    .translate(0, 55, 0),
];

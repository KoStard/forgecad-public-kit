/**
 * Integration test: face query API on complex multi-feature models.
 */

const spacing = 150;

// ── Scenario 1: Canonical string names still work ──
const s1 = box(100, 100, 20).pocket('top', 8, { inset: 5 });

// ── Scenario 2: Query object with normal ──
// Same as 'top' but using explicit query
const s2 = box(100, 100, 20).pocket({ normal: [0, 0, 1], pick: 'max-z' }, 8, { inset: 5 });

// ── Scenario 3: Box with pocket → query the pocket floor ──
// After pocketing, there are TWO upward faces: the remaining top and the pocket floor.
// Use pick: 'smallest' to get the pocket floor (smaller area), then boss from it.
const base3 = box(100, 100, 20).pocket('top', 8, { inset: 10 });
const s3 = base3.boss({ normal: [0, 0, 1], pick: 'smallest' }, 5, { scale: 0.5 });

// ── Scenario 4: pick: 'largest' gets the main top, not pocket floor ──
const base4 = box(100, 100, 20).pocket('top', 8, { inset: 10 });
const s4 = base4.pocket({ normal: [0, 0, 1], pick: 'largest' }, 3, { inset: 5 });

// ── Scenario 5: L-shaped body (union of two boxes) → nearest disambiguates ──
// Two boxes at different heights → two top faces
const tall = box(50, 100, 40);
const short = box(50, 100, 20).translate(50, 0, 0);
const lShape = union(tall, short);
// Pocket the SHORT side's top face using nearest
const s5 = lShape.pocket({ normal: [0, 0, 1], nearest: [75, 50] }, 5, { inset: 5 });

// ── Scenario 7: Side face query ──
// Pocket the right face using a normal query
const s7 = box(60, 80, 30).pocket({ normal: [1, 0, 0], pick: 'max-x' }, 5, { inset: 3 });

export default [
  s1.translate(0,           0, 0),
  s2.translate(spacing,     0, 0),
  s3.translate(spacing * 2, 0, 0),
  s4.translate(spacing * 3, 0, 0),
  s5.translate(0,           spacing, 0),
  s7.translate(spacing,     spacing, 0),
];

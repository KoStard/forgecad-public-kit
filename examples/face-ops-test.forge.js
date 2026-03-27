/**
 * Test model: faceProfile, pocket, boss.
 */

const spacing = 130;

// Test 1: pocket with inset
const r1 = box(100, 100, 20).pocket('top', 8, { inset: 5 });

// Test 2: pocket with scale
const r2 = box(100, 100, 20).pocket('top', 8, { scale: 0.6 });

// Test 3: boss with inset
const r3 = box(100, 100, 20).boss('top', 10, { inset: 10 });

// Test 4: boss with scale
const r4 = box(100, 100, 20).boss('top', 8, { scale: 0.5 });

// Test 5: pocket on bottom face
const r5 = box(80, 80, 15).pocket('bottom', 5, { inset: 5 });

// Test 6: faceProfile manual workflow
const base6 = box(100, 100, 20).toShape();
const profile6 = faceProfile(base6, 'top');
const scaledProfile = profile6.scale(0.8);

// Test 7: pocket on side face
const r7 = box(60, 80, 30).pocket('front', 5, { inset: 3 });

export default [
  r1.translate(0,         0, 0),
  r2.translate(spacing,   0, 0),
  r3.translate(spacing*2, 0, 0),
  r4.translate(spacing*3, 0, 0),
  r5.translate(0,         spacing, 0),
  r7.translate(spacing,   spacing, 0),
];

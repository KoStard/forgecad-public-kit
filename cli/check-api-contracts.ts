#!/usr/bin/env node
/**
 * Script API contract invariants.
 *
 * Ensures multi-operand boolean APIs stay ergonomic, consistent, and loud on misuse.
 */
import assert from 'node:assert/strict';
import {
  init,
  box,
  cylinder,
  union,
  difference,
  intersection,
  rect,
  rectangle,
  roundedRect,
  circle2d,
  sheetMetal,
  union2d,
  difference2d,
  filletEdge,
  chamferEdge,
  intersection2d,
  hull2d,
  runScript,
  constrainedSketch,
  sketchRegions,
  sketchRegion,
} from '../src/forge/headless';

const EPS = 1e-6;

function approx(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

function expectClose(actual: number, expected: number, label: string): void {
  assert(approx(actual, expected), `${label} expected ${expected}, got ${actual}`);
}

function checkShapeBooleanForms(): void {
  const base = box(40, 40, 10);
  const hole1 = cylinder(12, 4).translate(10, 10, -1);
  const hole2 = cylinder(12, 4).translate(30, 10, -1);
  const boss1 = cylinder(10, 4).translate(10, 30, 0);
  const boss2 = cylinder(10, 4).translate(30, 30, 0);
  const slabX = box(32, 40, 12, true).translate(20, 20, 5);
  const slabY = box(40, 18, 12, true).translate(20, 20, 5);

  const diffVariadic = base.subtract(hole1, hole2);
  const diffArray = base.subtract([hole1, hole2]);
  const diffFnVariadic = difference(base, hole1, hole2);
  const diffFnArray = difference([base, hole1, hole2]);
  expectClose(diffVariadic.volume(), diffFnVariadic.volume(), 'Shape.subtract variadic');
  expectClose(diffArray.volume(), diffFnVariadic.volume(), 'Shape.subtract array');
  expectClose(diffFnArray.volume(), diffFnVariadic.volume(), 'difference array');

  const addVariadic = base.add(boss1, boss2);
  const addArray = base.add([boss1, boss2]);
  const addFn = union(base, boss1, boss2);
  const addFnArray = union([base, boss1, boss2]);
  expectClose(addVariadic.volume(), addFn.volume(), 'Shape.add variadic');
  expectClose(addArray.volume(), addFn.volume(), 'Shape.add array');
  expectClose(addFnArray.volume(), addFn.volume(), 'union array');

  const intersectVariadic = base.intersect(slabX, slabY);
  const intersectArray = base.intersect([slabX, slabY]);
  const intersectFn = intersection(base, slabX, slabY);
  const intersectFnArray = intersection([base, slabX, slabY]);
  expectClose(intersectVariadic.volume(), intersectFn.volume(), 'Shape.intersect variadic');
  expectClose(intersectArray.volume(), intersectFn.volume(), 'Shape.intersect array');
  expectClose(intersectFnArray.volume(), intersectFn.volume(), 'intersection array');
}

function checkTrackedShapeInterop(): void {
  const base = rect(40, 40).extrude(10);
  const hole1 = circle2d(4).translate(10, 10).extrude(12).translate(0, 0, -1);
  const hole2 = circle2d(4).translate(30, 10).extrude(12).translate(0, 0, -1);
  const boss1 = circle2d(4).translate(10, 30).extrude(10);
  const boss2 = circle2d(4).translate(30, 30).extrude(10);

  const diffTracked = base.subtract(hole1, hole2);
  const diffFn = difference(base, hole1, hole2);
  expectClose(diffTracked.volume(), diffFn.volume(), 'TrackedShape.subtract');

  const addTracked = base.add([boss1, boss2]);
  const addFn = union([base, boss1, boss2]);
  expectClose(addTracked.volume(), addFn.volume(), 'TrackedShape.add');

  const mask = rect(40, 18).extrude(12).translate(0, 11, -1);
  const intersectTracked = base.intersect(mask);
  const intersectFn = intersection(base, mask);
  expectClose(intersectTracked.volume(), intersectFn.volume(), 'TrackedShape.intersect');
}

function checkSketchBooleanForms(): void {
  const plate = rect(40, 20);
  const hole1 = circle2d(4).translate(10, 10);
  const hole2 = circle2d(4).translate(30, 10);
  const tab1 = circle2d(4).translate(10, 20);
  const tab2 = circle2d(4).translate(30, 20);
  const mask1 = rect(30, 20).translate(5, 0);
  const mask2 = rect(40, 10).translate(0, 5);

  const diffVariadic = plate.subtract(hole1, hole2);
  const diffArray = plate.subtract([hole1, hole2]);
  const diffFn = difference2d(plate, hole1, hole2);
  const diffFnArray = difference2d([plate, hole1, hole2]);
  expectClose(diffVariadic.area(), diffFn.area(), 'Sketch.subtract variadic');
  expectClose(diffArray.area(), diffFn.area(), 'Sketch.subtract array');
  expectClose(diffFnArray.area(), diffFn.area(), 'difference2d array');

  const addVariadic = plate.add(tab1, tab2);
  const addArray = plate.add([tab1, tab2]);
  const addFn = union2d(plate, tab1, tab2);
  const addFnArray = union2d([plate, tab1, tab2]);
  expectClose(addVariadic.area(), addFn.area(), 'Sketch.add variadic');
  expectClose(addArray.area(), addFn.area(), 'Sketch.add array');
  expectClose(addFnArray.area(), addFn.area(), 'union2d array');

  const intersectVariadic = plate.intersect(mask1, mask2);
  const intersectArray = plate.intersect([mask1, mask2]);
  const intersectFn = intersection2d(plate, mask1, mask2);
  const intersectFnArray = intersection2d([plate, mask1, mask2]);
  expectClose(intersectVariadic.area(), intersectFn.area(), 'Sketch.intersect variadic');
  expectClose(intersectArray.area(), intersectFn.area(), 'Sketch.intersect array');
  expectClose(intersectFnArray.area(), intersectFn.area(), 'intersection2d array');

  const hullVariadic = hull2d(tab1, tab2);
  const hullArray = hull2d([tab1, tab2]);
  expectClose(hullVariadic.area(), hullArray.area(), 'hull2d array');
}

function checkBooleanErrors(): void {
  const base = box(20, 20, 10);
  const plate = rect(20, 20);

  assert.throws(
    () => base.subtract(),
    /Shape\.subtract\(\) requires at least 1 shape/,
  );
  assert.throws(
    () => difference(base),
    /difference\(\) requires at least 2 shapes/,
  );
  assert.throws(
    () => base.add(undefined as unknown as ReturnType<typeof box>),
    /Shape\.add\(\) argument 1: expected a Shape or TrackedShape-compatible value, got undefined/,
  );
  assert.throws(
    () => plate.subtract(),
    /Sketch\.subtract\(\) requires at least 1 sketch/,
  );
  assert.throws(
    () => difference2d(plate),
    /difference2d\(\) requires at least 2 sketch/,
  );
  assert.throws(
    () => union2d([plate, undefined as unknown as ReturnType<typeof rect>]),
    /union2d\(\) argument 2: expected a Sketch, got undefined/,
  );
}

function checkEdgeFinishSubsetErrors(): void {
  const base = rectangle(-24, -16, 48, 32).extrude(18);
  const once = filletEdge(base.toShape(), base.edge('vert-br'), 4, [-1, -1]);
  const boss = roundedRect(10, 6, 1.5, true)
    .onFace(base, 'top', { u: -10, v: 4, protrude: 0.25, selfAnchor: 'center' })
    .extrude(5);
  const widened = once.add(boss);
  assert.doesNotThrow(
    () => filletEdge(once, base.edge('vert-bl'), 4, [1, -1]),
    'A preserved sibling tracked edge should stay finishable after one supported edge rewrite.',
  );
  assert.doesNotThrow(
    () => filletEdge(widened, base.edge('vert-bl'), 4, [1, -1]),
    'A preserved propagated edge should stay finishable after a supported boolean union.',
  );

  const chamferedOnce = chamferEdge(base.toShape(), base.edge('vert-tl'), 4, [1, 1]);
  const chamferWidened = chamferedOnce.add(boss.translate(12, -4, 0));
  assert.doesNotThrow(
    () => chamferEdge(chamferWidened, base.edge('vert-br'), 3, [-1, -1]),
    'Chamfer should accept the same propagated-edge subset after a supported union.',
  );

  assert.throws(
    () => filletEdge(base.toShape(), base.edge('vert-br'), 4, [1, -1]),
    /filletEdge\(\) currently supports vert-br only with quadrant \[-1, -1\]/,
  );
  assert.throws(
    () => filletEdge(base.toShape().add(boss), base.edge('vert-bl'), 4, [1, -1]),
    /already recorded as supported|supported subset/,
  );
  assert.throws(
    () => filletEdge(once, base.edge('vert-br'), 4, [-1, -1]),
    /merged rewritten descendants|merged into rewritten descendants|untouched sibling vertical edges|descendant chain/,
  );
  assert.throws(
    () => filletEdge(
      widened.subtract(box(8, 8, 20, true).translate(-24, -16, 9)),
      base.edge('vert-bl'),
      4,
      [1, -1],
    ),
    /split or erase|clipped descendant subset|stable edge target/,
  );
}

function expectFaceDescendant(
  face: ReturnType<ReturnType<typeof box>['face']>,
  label: string,
  semantic: 'face' | 'region' | 'set',
  minMembers = 1,
): void {
  assert(face.descendant, `${label} should expose descendant metadata`);
  assert.equal(face.descendant!.semantic, semantic, `${label} should expose descendant semantic ${semantic}`);
  assert(
    face.descendant!.memberCount >= minMembers,
    `${label} should expose at least ${minMembers} descendant member(s), got ${face.descendant!.memberCount}`,
  );
}

function checkSheetMetalApiContracts(): void {
  const part = sheetMetal({
    panel: { width: 180, height: 110 },
    thickness: 1.5,
    bendRadius: 2,
    bendAllowance: { kFactor: 0.42 },
    cornerRelief: { size: 4 },
  })
    .flange('top', { length: 18 })
    .flange('right', { length: 18 })
    .flange('bottom', { length: 18 })
    .flange('left', { length: 18 })
    .cutout('panel', rect(72, 36, true), { selfAnchor: 'center' })
    .cutout('flange-right', roundedRect(26, 10, 5, true), { selfAnchor: 'center' })
    .cutout('panel', circle2d(2.2), { u: -68, v: -37, selfAnchor: 'center' })
    .cutout('panel', circle2d(2.2), { u: 68, v: -37, selfAnchor: 'center' })
    .cutout('panel', circle2d(2.2), { u: -68, v: 37, selfAnchor: 'center' })
    .cutout('panel', circle2d(2.2), { u: 68, v: 37, selfAnchor: 'center' });

  assert.deepEqual(part.regionNames(), [
    'panel',
    'bend-top',
    'flange-top',
    'bend-right',
    'flange-right',
    'bend-bottom',
    'flange-bottom',
    'bend-left',
    'flange-left',
  ]);

  const folded = part.folded();
  const flat = part.flatPattern();

  assert(folded.faceNames().includes('panel'), 'Folded sheet-metal output should expose the panel face name');
  assert(folded.faceNames().includes('flange-right'), 'Folded sheet-metal output should expose flange-right');
  assert(folded.faceNames().includes('bend-right'), 'Folded sheet-metal output should expose bend-right');
  assert(flat.faceNames().includes('panel'), 'Flat sheet-metal output should expose the panel face name');
  assert(flat.faceNames().includes('flange-right'), 'Flat sheet-metal output should expose flange-right');
  assert(flat.faceNames().includes('bend-right'), 'Flat sheet-metal output should expose bend-right');

  expectFaceDescendant(folded.face('panel'), 'Folded panel', 'region');
  expectFaceDescendant(folded.face('flange-right'), 'Folded flange-right', 'region');
  expectFaceDescendant(folded.face('bend-right'), 'Folded bend-right', 'set', 2);
  expectFaceDescendant(flat.face('panel'), 'Flat panel', 'region');
  expectFaceDescendant(flat.face('flange-right'), 'Flat flange-right', 'region');
  expectFaceDescendant(flat.face('bend-right'), 'Flat bend-right', 'face');
}

function checkSandboxBindings(): void {
  const okScript = `
const base = box(40, 40, 10);
const hole1 = cylinder(12, 4).translate(10, 10, -1);
const hole2 = cylinder(12, 4).translate(30, 10, -1);
return difference([base, hole1, hole2]);
`;
  const ok = runScript(okScript, 'ok.forge.js', { 'ok.forge.js': okScript });
  assert.equal(ok.error, null, `Expected sandbox boolean script to pass, got ${ok.error}`);
  assert(ok.shape != null, 'Sandbox boolean script should return a shape');

  const expected = difference(
    box(40, 40, 10),
    cylinder(12, 4).translate(10, 10, -1),
    cylinder(12, 4).translate(30, 10, -1),
  );
  expectClose(ok.shape!.volume(), expected.volume(), 'runScript difference array');

  const badScript = 'return box(10, 10, 10).subtract();';
  const bad = runScript(badScript, 'bad.forge.js', { 'bad.forge.js': badScript });
  assert.match(
    bad.error ?? '',
    /Shape\.subtract\(\) requires at least 1 shape/,
  );
}

// ─── Step 1: sketch.regions() / sketch.region() ─────────────────────────────

function checkSketchRegions(): void {
  // Single continuous sketch → one region
  const solid = rect(60, 40);
  const solidRegions = solid.regions();
  assert.equal(solidRegions.length, 1, 'solid rect should have 1 region');
  expectClose(solidRegions[0].area(), solid.area(), 'region area matches sketch area');

  // Two disconnected rectangles → two regions
  const twoRects = union2d(rect(40, 40), rect(40, 40).translate(60, 0));
  const twoRegions = twoRects.regions();
  assert.equal(twoRegions.length, 2, 'two disconnected rects should yield 2 regions');
  expectClose(twoRegions[0].area(), twoRegions[1].area(), 'both rect regions same area');

  // Frame (donut-like) → one region (ring shape)
  const frame = rect(100, 60).subtract(rect(80, 40, true));
  const frameRegions = frame.regions();
  assert.equal(frameRegions.length, 1, 'frame should have 1 ring-shaped region');
  expectClose(frameRegions[0].area(), frame.area(), 'frame region area matches frame area');

  // Donut (circle minus circle) → one region
  const donut = circle2d(50).subtract(circle2d(30));
  const donutRegions = donut.regions();
  assert.equal(donutRegions.length, 1, 'donut should have 1 region');
  assert(donutRegions[0].area() > 0, 'donut region should have positive area');
  assert(donutRegions[0].area() < circle2d(50).area(), 'donut region smaller than full circle');

  // sketch.region(seed) — pick one of two disconnected boxes
  const pair = union2d(rect(40, 40), rect(40, 40).translate(60, 0));
  const leftBox = pair.region([20, 20]);
  const rightBox = pair.region([80, 20]);
  assert(leftBox.area() > 0, 'left seed should resolve a region');
  assert(rightBox.area() > 0, 'right seed should resolve a region');
  expectClose(leftBox.area(), rightBox.area(), 'both boxes should be equal area');

  // Extrude a picked region (smoke test — should not throw)
  const extruded = leftBox.extrude(10);
  assert(extruded != null, 'extrude on region should produce a shape');

  // region() with seed in hole → throws
  assert.throws(
    () => donut.region([0, 0]),
    /seed point .* is not inside any/,
    'seed inside the hole should throw',
  );

  // region() on empty sketch → throws
  assert.throws(
    () => rect(0, 0).region([0, 0]),
    /no filled area/,
    'region on empty sketch should throw',
  );

  // regions() regions are sorted largest-first
  const big = rect(100, 100);
  const small = rect(20, 20).translate(200, 0);
  const mixed = union2d(big, small);
  const sorted = mixed.regions();
  assert.equal(sorted.length, 2, 'should have 2 regions');
  assert(sorted[0].area() >= sorted[1].area(), 'regions should be sorted largest-first');
}

// ─── Step 2: ConstraintSketch.detectArrangement() ───────────────────────────

function checkArrangementDetection(): void {
  // Simple case: a rectangle drawn as 4 lines (no explicit loop)
  const b1 = constrainedSketch();
  const p00 = b1.point(0, 0); const p10 = b1.point(100, 0);
  const p11 = b1.point(100, 60); const p01 = b1.point(0, 60);
  b1.line(p00, p10); b1.line(p10, p11); b1.line(p11, p01); b1.line(p01, p00);
  const sk1 = b1.solve();
  const regions1 = sk1.detectArrangement();
  assert.equal(regions1.length, 1, 'simple closed rectangle should yield 1 region');
  expectClose(regions1[0].area(), 100 * 60, 'rectangle region area');

  // Divided rectangle: 2 cells separated by a vertical line through the middle
  const b2 = constrainedSketch();
  const q00 = b2.point(0, 0);  const q10 = b2.point(100, 0);
  const q11 = b2.point(100, 60); const q01 = b2.point(0, 60);
  const qm0 = b2.point(50, 0);  const qm1 = b2.point(50, 60);
  b2.line(q00, qm0); b2.line(qm0, q10); // bottom in 2 segments
  b2.line(q10, q11); b2.line(q11, q01); b2.line(q01, q00);
  b2.line(qm0, qm1); // divider
  const sk2 = b2.solve();
  const regions2 = sk2.detectArrangement();
  assert.equal(regions2.length, 2, 'divided rectangle should yield 2 cells');
  expectClose(regions2[0].area() + regions2[1].area(), 100 * 60, 'total area preserved');

  // detectArrangementRegion(seed) — pick left cell
  const leftCell = sk2.detectArrangementRegion([25, 30]);
  assert(leftCell.area() > 0, 'left seed should pick a region');
  expectClose(leftCell.area(), 50 * 60, 'left cell should be 50x60');

  // detectArrangementRegion — pick right cell
  const rightCell = sk2.detectArrangementRegion([75, 30]);
  expectClose(rightCell.area(), 50 * 60, 'right cell should be 50x60');

  // X-crossing: two lines crossing at 45° — should create 4 triangular faces
  // (or more complex depending on arrangement, but at least > 1 face)
  const b3 = constrainedSketch();
  // Enclosed diamond: 4 segments forming a diamond
  const dTop = b3.point(50, 80);  const dBot = b3.point(50, 0);
  const dLeft = b3.point(0, 40);  const dRight = b3.point(100, 40);
  b3.line(dTop, dRight); b3.line(dRight, dBot);
  b3.line(dBot, dLeft);  b3.line(dLeft, dTop);
  const sk3 = b3.solve();
  const regions3 = sk3.detectArrangement();
  assert.equal(regions3.length, 1, 'diamond should yield 1 region');
  assert(regions3[0].area() > 0, 'diamond region has area');

  // Construction lines are excluded from arrangement detection
  const b4 = constrainedSketch();
  const r0 = b4.point(0, 0); const r1 = b4.point(50, 0);
  const r2 = b4.point(50, 50); const r3 = b4.point(0, 50);
  b4.line(r0, r1); b4.line(r1, r2); b4.line(r2, r3); b4.line(r3, r0);
  // Add a construction diagonal — should NOT create extra arrangement regions
  b4.line(r0, r2, true /* construction */);
  const sk4 = b4.solve();
  const regions4 = sk4.detectArrangement();
  assert.equal(regions4.length, 1, 'construction lines should not create extra regions');

  // detectArrangementRegion throws when seed is outside all regions
  assert.throws(
    () => sk1.detectArrangementRegion([200, 200]),
    /seed point .* is not inside any/,
    'out-of-bounds seed should throw',
  );

  // Smoke test: extrude a detected arrangement region
  const extruded = regions1[0].extrude(5);
  assert(extruded != null, 'extruding an arrangement region should work');
}

// ─── Step 3: Cross-sketch reference geometry ─────────────────────────────────

function checkCrossSketchReferences(): void {
  // referencePoint: adds a fixed anchor, verify it is fixed and in definition
  const b = constrainedSketch();
  const refPt = b.referencePoint(30, 70);
  // New point with a free point coincident to it — after solving, free point
  // should snap to (30, 70)
  const freePt = b.point(0, 0);
  b.coincident(freePt, refPt);
  const freeP2 = b.point(0, 100);
  b.line(freePt, freeP2);
  b.addLoop([freePt, freeP2, b.point(50, 100)]);
  const sk = b.solve();
  const solved = sk.definition.points.find((p) => p.id === freePt);
  assert(solved, 'free point should still exist after solve');
  expectClose(solved!.x, 30, 'free point snapped to reference X');
  expectClose(solved!.y, 70, 'free point snapped to reference Y');

  // referenceLine: adds a fixed construction line
  const b2 = constrainedSketch();
  const refLine = b2.referenceLine(0, 0, 100, 0); // horizontal baseline
  // Draw a line parallel to the reference baseline
  const pl1 = b2.point(10, 30); const pl2 = b2.point(90, 30);
  const mainLine = b2.line(pl1, pl2);
  b2.parallel(mainLine, refLine);
  b2.fix(pl1, 10, 30);
  b2.addLoop([pl1, pl2, b2.point(90, 60), b2.point(10, 60)]);
  const sk2 = b2.solve();
  assert.equal(sk2.constraintMeta.status, 'under', 'sketch should be under-constrained (some free points remain)');
  // The important thing: no constraint was rejected (parallel succeeded)
  assert.equal(sk2.constraintMeta.rejected.length, 0, 'no constraints should be rejected');

  // referenceFrom: import a solved sketch's entities into a new builder
  const builderA = constrainedSketch();
  const a1 = builderA.point(0, 0); const a2 = builderA.point(100, 0);
  const aLine = builderA.line(a1, a2);
  builderA.fix(a1, 0, 0); builderA.horizontal(aLine); builderA.length(aLine, 100);
  const sketchA = builderA.solve();

  const builderB = constrainedSketch();
  const refImported = builderB.referenceFrom(sketchA, aLine);
  assert(refImported !== null, 'referenceFrom should return a LineId');
  // Add a point above the reference line, constrain to be on the vertical axis
  const bp1 = builderB.point(0, 50);
  const bp2 = builderB.point(100, 50);
  const bLine = builderB.line(bp1, bp2);
  builderB.parallel(bLine, refImported as string);
  builderB.fix(bp1, 0, 50); builderB.length(bLine, 100);
  builderB.addLoop([bp1, bp2, builderB.point(100, 80), builderB.point(0, 80)]);
  const sketchB = builderB.solve();
  assert.equal(sketchB.constraintMeta.rejected.length, 0, 'cross-sketch parallel should resolve');

  // referenceAllFrom: bulk import all entities
  const builderC = constrainedSketch();
  const refs = builderC.referenceAllFrom(sketchA);
  assert(refs.points.size > 0, 'referenceAllFrom should import points');
  assert(refs.lines.size > 0, 'referenceAllFrom should import lines');
  // Every imported point should map to a valid reference
  for (const [origId, newId] of refs.points) {
    assert(origId.startsWith('pt-') || origId.startsWith('ref-'), 'original ID should be a point');
    assert(newId.startsWith('ref-pt-'), 'new ID should be a reference point');
  }

  // referenceFrom returns null for unknown entity ID
  const nullResult = builderC.referenceFrom(sketchA, 'nonexistent-id');
  assert.equal(nullResult, null, 'referenceFrom with unknown ID should return null');
}

export async function runCheckApiContractsCli(): Promise<void> {
  await init();
  checkShapeBooleanForms();
  checkTrackedShapeInterop();
  checkSketchBooleanForms();
  checkBooleanErrors();
  checkEdgeFinishSubsetErrors();
  checkSheetMetalApiContracts();
  checkSandboxBindings();
  checkSketchRegions();
  checkArrangementDetection();
  checkCrossSketchReferences();
  console.log('✓ Script API contract invariants passed');
}

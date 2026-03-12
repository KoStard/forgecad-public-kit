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
  union2d,
  difference2d,
  filletEdge,
  chamferEdge,
  intersection2d,
  hull2d,
  runScript,
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
    /merged rewritten descendants|merged into rewritten descendants|untouched sibling vertical edges/,
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

export async function runCheckApiContractsCli(): Promise<void> {
  await init();
  checkShapeBooleanForms();
  checkTrackedShapeInterop();
  checkSketchBooleanForms();
  checkBooleanErrors();
  checkEdgeFinishSubsetErrors();
  checkSandboxBindings();
  console.log('✓ Script API contract invariants passed');
}

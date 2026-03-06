#!/usr/bin/env node
/**
 * Exact BREP export invariants.
 *
 * Focuses on plan recording and manifest eligibility for the exact STEP/BREP subset.
 */
import assert from 'node:assert/strict';
import { init, runScript } from '../src/forge/headless';
import { buildBrepExportManifest } from '../src/forge/brepExport';
import type { BrepProfilePlan, BrepShapePlan, BrepShapeTransformStep } from '../src/forge/brepPlan';

function runExactManifest(code: string) {
  const files: Record<string, string> = { 'main.forge.js': code };
  const result = runScript(code, 'main.forge.js', files);
  assert.equal(result.error, null, `runScript failed: ${result.error ?? 'unknown error'}`);
  const manifest = buildBrepExportManifest(result.objects);
  assert.equal(
    manifest.unsupported.length,
    0,
    `Expected exact export support, got: ${manifest.unsupported.map((item) => `${item.name}: ${item.reason}`).join('; ')}`,
  );
  assert.equal(manifest.objects.length, 1, `Expected exactly one export object, got ${manifest.objects.length}`);
  return manifest.objects[0].plan;
}

function collectProfiles(plan: BrepShapePlan): BrepProfilePlan[] {
  switch (plan.kind) {
    case 'box':
    case 'cylinder':
    case 'sphere':
      return [];
    case 'extrude':
    case 'revolve':
      return [plan.profile];
    case 'boolean':
      return plan.shapes.flatMap(collectProfiles);
    case 'transform':
      return collectProfiles(plan.base);
  }
}

function collectShapeTransforms(plan: BrepShapePlan): BrepShapeTransformStep[] {
  switch (plan.kind) {
    case 'box':
    case 'cylinder':
    case 'sphere':
      return [];
    case 'extrude':
    case 'revolve':
      return [];
    case 'boolean':
      return plan.shapes.flatMap(collectShapeTransforms);
    case 'transform':
      return [...plan.steps, ...collectShapeTransforms(plan.base)];
  }
}

function checkRoundedRectProfileTransforms(): void {
  const plan = runExactManifest(`
const part = roundedRect(40, 24, 6, true)
  .translate(5, -2)
  .rotate(30)
  .extrude(12);

return [{ name: 'Rounded Plate', shape: part }];
`);

  assert.equal(plan.kind, 'extrude', `Expected extrude plan, got ${plan.kind}`);
  assert.equal(plan.profile.kind, 'roundedRect', `Expected roundedRect profile, got ${plan.profile.kind}`);
  assert.equal(plan.profile.width, 40);
  assert.equal(plan.profile.height, 24);
  assert.equal(plan.profile.radius, 6);
  assert.equal(plan.profile.center, true);
  assert.deepEqual(plan.profile.transforms, [
    { kind: 'translate', x: 5, y: -2 },
    { kind: 'rotate', degrees: 30 },
  ]);
}

function checkRoundedRectBooleanChain(): void {
  const plan = runExactManifest(`
const outer = roundedRect(100, 70, 8, true).extrude(32);
const cavity = roundedRect(95.2, 65.2, 5.6, true).extrude(29.2).translate(0, 0, 2.8);
const standoff = cylinder(8, 4.5).translate(28, 18, 2.8);
const pilot = cylinder(10, 1.2).translate(28, 18, 2.8);
const guide = box(22, 3, 14, true).translate(0, -33.5, 18);

const base = union(
  outer.subtract(cavity),
  standoff,
).subtract(pilot).subtract(guide);

return [{ name: 'Enclosure Base', shape: base }];
`);

  const profiles = collectProfiles(plan);
  assert(
    profiles.some((profile) => profile.kind === 'roundedRect'),
    'Expected at least one roundedRect profile inside the boolean export plan',
  );
}

function checkProfileBooleanAndTaperedExtrude(): void {
  const plan = runExactManifest(`
const ring = difference2d(
  roundedRect(90, 60, 8, true),
  roundedRect(84, 54, 5, true),
);
const leadIn = ring
  .scale([0.96, 0.93])
  .extrude(4, { scaleTop: [1 / 0.96, 1 / 0.93] })
  .translate(0, 0, -4);

return [{ name: 'Lead-In Ring', shape: leadIn }];
`);

  assert.equal(plan.kind, 'transform', `Expected transformed tapered extrude plan, got ${plan.kind}`);
  assert.equal(plan.base.kind, 'extrude', `Expected tapered extrude base plan, got ${plan.base.kind}`);
  assert.deepEqual(plan.base.scaleTop, [1 / 0.96, 1 / 0.93]);
  assert.equal(plan.base.profile.kind, 'boolean', `Expected boolean sketch profile, got ${plan.base.profile.kind}`);
  assert.deepEqual(
    plan.base.profile.transforms,
    [{ kind: 'scale', x: 0.96, y: 0.93 }],
    'Expected profile-level scale transform to be preserved',
  );
}

function checkPolygonProfileTransforms(): void {
  const plan = runExactManifest(`
const plate = polygon([
  [0, 0],
  [40, 0],
  [50, 15],
  [25, 40],
  [0, 20],
])
  .translate(3, -4)
  .rotate(15)
  .extrude(10);

return [{ name: 'Polygon Plate', shape: plate }];
`);

  assert.equal(plan.kind, 'extrude', `Expected extrude plan, got ${plan.kind}`);
  assert.equal(plan.profile.kind, 'polygon', `Expected polygon profile, got ${plan.profile.kind}`);
  assert.deepEqual(plan.profile.points, [
    [0, 0],
    [40, 0],
    [50, 15],
    [25, 40],
    [0, 20],
  ]);
  assert.deepEqual(plan.profile.transforms, [
    { kind: 'translate', x: 3, y: -4 },
    { kind: 'rotate', degrees: 15 },
  ]);
}

function checkPolygonBooleanHoleChain(): void {
  const plan = runExactManifest(`
const outer = polygon([
  [0, 0],
  [80, 0],
  [80, 50],
  [0, 50],
]);
const hole = polygon([
  [20, 12],
  [60, 12],
  [60, 38],
  [20, 38],
]).translate(2, -1);
const panel = difference2d(outer, hole).extrude(6);

return [{ name: 'Polygon Panel', shape: panel }];
`);

  assert.equal(plan.kind, 'extrude', `Expected extrude plan, got ${plan.kind}`);
  assert.equal(plan.profile.kind, 'boolean', `Expected boolean profile, got ${plan.profile.kind}`);
  assert.equal(plan.profile.op, 'difference');
  assert.equal(plan.profile.profiles.length, 2);
  assert.equal(plan.profile.profiles[0].kind, 'polygon');
  assert.equal(plan.profile.profiles[1].kind, 'polygon');
  assert.deepEqual(plan.profile.profiles[1].transforms, [
    { kind: 'translate', x: 2, y: -1 },
  ]);
}

function checkRotateAroundTransformPlan(): void {
  const plan = runExactManifest(`
const door = box(80, 4, 120, false).rotateAround([0, 0, 1], 35, [0, 0, 0]);
return [{ name: 'Door', shape: door }];
`);

  const rotateAround = collectShapeTransforms(plan).find((step) => step.kind === 'rotateAround');
  assert(rotateAround, 'Expected rotateAround transform step to be preserved');
  assert.equal(rotateAround.axisX, 0);
  assert.equal(rotateAround.axisY, 0);
  assert.equal(rotateAround.axisZ, 1);
  assert.equal(rotateAround.degrees, 35);
}

function checkPointAlongOnPrimitiveBoolean(): void {
  const plan = runExactManifest(`
const pipe = cylinder(60, 5).pointAlong([0, 1, 0]);
const body = box(30, 30, 30, true).subtract(pipe);
return [{ name: 'Pipe Cut', shape: body }];
`);

  const rotateAround = collectShapeTransforms(plan).find((step) => step.kind === 'rotateAround');
  assert(rotateAround, 'Expected pointAlong() to preserve an exact rotateAround transform step');
  assert.equal(rotateAround.axisX, -1);
  assert.equal(rotateAround.axisY, 0);
  assert.equal(rotateAround.axisZ, 0);
  assert.equal(rotateAround.degrees, 90);
}

async function main() {
  await init();
  checkRoundedRectProfileTransforms();
  checkRoundedRectBooleanChain();
  checkProfileBooleanAndTaperedExtrude();
  checkPolygonProfileTransforms();
  checkPolygonBooleanHoleChain();
  checkRotateAroundTransformPlan();
  checkPointAlongOnPrimitiveBoolean();
  console.log('✓ BREP export invariants passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

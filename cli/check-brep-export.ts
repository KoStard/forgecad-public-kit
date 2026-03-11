#!/usr/bin/env node
/**
 * Exact BREP export invariants.
 *
 * Focuses on plan recording and manifest eligibility for the exact STEP/BREP subset.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { init, runScript } from '../src/forge/headless';
import { buildBrepExportManifest } from '../src/forge/brepExport';
import type { CadQueryProfilePlan, CadQueryShapePlan, CadQueryShapeTransformStep } from '../src/forge/cadqueryPlan';
import { collectProjectFiles } from './collect-files';
import { resolvePackagePath } from './package-runtime';

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
  assert.equal(manifest.objects[0].kind, 'exact', 'Expected exact export object');
  assert.equal(manifest.objects[0].target, 'cadquery-occt', 'Expected exact export object to use the CadQuery/OCCT lowerer');
  return manifest.objects[0].plan;
}

function collectProfiles(plan: CadQueryShapePlan): CadQueryProfilePlan[] {
  switch (plan.kind) {
    case 'box':
    case 'cylinder':
    case 'sphere':
      return [];
    case 'extrude':
    case 'revolve':
    case 'sweep':
      return [plan.profile];
    case 'loft':
      return [...plan.profiles];
    case 'boolean':
      return plan.shapes.flatMap(collectProfiles);
    case 'transform':
    case 'trimByPlane':
      return collectProfiles(plan.base);
  }
}

function collectShapeTransforms(plan: CadQueryShapePlan): CadQueryShapeTransformStep[] {
  switch (plan.kind) {
    case 'box':
    case 'cylinder':
    case 'sphere':
      return [];
    case 'extrude':
    case 'revolve':
    case 'loft':
    case 'sweep':
      return [];
    case 'boolean':
      return plan.shapes.flatMap(collectShapeTransforms);
    case 'transform':
      return [...plan.steps, ...collectShapeTransforms(plan.base)];
    case 'trimByPlane':
      return collectShapeTransforms(plan.base);
  }
}

function exportExactManifest(code: string): void {
  const files: Record<string, string> = { 'main.forge.js': code };
  const result = runScript(code, 'main.forge.js', files);
  assert.equal(result.error, null, `runScript failed: ${result.error ?? 'unknown error'}`);

  const manifest = buildBrepExportManifest(result.objects);
  assert.equal(
    manifest.unsupported.length,
    0,
    `Expected exact export support, got: ${manifest.unsupported.map((item) => `${item.name}: ${item.reason}`).join('; ')}`,
  );

  const tempDir = mkdtempSync(join(tmpdir(), 'forgecad-brep-'));
  try {
    const manifestPath = join(tempDir, 'manifest.json');
    const outputPath = join(tempDir, 'out.step');
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

    const exporterScript = resolvePackagePath(import.meta.url, 'cli', 'forge-brep-export.py');
    const child = spawnSync(
      'uv',
      ['run', '--script', exporterScript, '--input', manifestPath, '--output', outputPath, '--format', 'step'],
      { encoding: 'utf-8' },
    );
    assert.equal(
      child.status,
      0,
      `Expected exact exporter to succeed, got status ${child.status}: ${child.stderr || child.stdout || 'no output'}`,
    );
    assert(statSync(outputPath).size > 0, 'Expected exact exporter to emit a non-empty STEP file');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
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

function checkRoundOffsetProfilePlan(): void {
  const plan = runExactManifest(`
const shell = ngon(6, 20)
  .offset(-3)
  .extrude(8);

return [{ name: 'Shell', shape: shell }];
`);

  assert.equal(plan.kind, 'extrude', `Expected extrude plan, got ${plan.kind}`);
  assert.equal(plan.profile.kind, 'offset', `Expected offset profile, got ${plan.profile.kind}`);
  assert.equal(plan.profile.base.kind, 'polygon', `Expected polygon offset base, got ${plan.profile.base.kind}`);
  assert.equal(plan.profile.delta, -3);
  assert.equal(plan.profile.join, 'Round');
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

function checkMirrorTransformPlan(): void {
  const plan = runExactManifest(`
const bracket = box(24, 10, 4, true).mirror([1, 0, 0]);
return [{ name: 'Bracket', shape: bracket }];
`);

  const mirror = collectShapeTransforms(plan).find((step) => step.kind === 'mirror');
  assert(mirror, 'Expected mirror() to preserve an exact mirror transform step');
  assert.equal(mirror.normalX, 1);
  assert.equal(mirror.normalY, 0);
  assert.equal(mirror.normalZ, 0);
}

function checkScaleTransformPlan(): void {
  const plan = runExactManifest(`
const ellipsoid = sphere(6).scale([1.2, 0.8, 0.5]).translate(4, -2, 1);
const body = box(30, 24, 18, true).subtract(ellipsoid);
return [{ name: 'Scaled Cut', shape: body }];
`);

  const scale = collectShapeTransforms(plan).find((step) => step.kind === 'scale');
  assert(scale, 'Expected scale() to preserve an exact solid scale transform step');
  assert.equal(scale.x, 1.2);
  assert.equal(scale.y, 0.8);
  assert.equal(scale.z, 0.5);
}

function checkMirroredSketchProfilePlan(): void {
  const plan = runExactManifest(`
const collar = polygon([
  [0, 0],
  [8, 0],
  [5.8, -4.5],
]).mirror([1, 0]).extrude(1.2);
return [{ name: 'Collar', shape: collar }];
`);

  assert.equal(plan.kind, 'extrude', `Expected extrude plan, got ${plan.kind}`);
  assert.equal(plan.profile.kind, 'polygon', `Expected polygon profile, got ${plan.profile.kind}`);
  assert.deepEqual(plan.profile.transforms, [
    { kind: 'mirror', normalX: 1, normalY: 0 },
  ]);
}

function checkRigidMatrixTransformPlan(): void {
  const plan = runExactManifest(`
const moved = box(20, 12, 8, true).transform(
  Transform.identity()
    .translate(15, -4, 2)
    .rotateAxis([0, 0, 1], 90)
);
return [{ name: 'Moved', shape: moved }];
`);

  const steps = collectShapeTransforms(plan);
  const rotateAround = steps.find((step) => step.kind === 'rotateAround');
  assert(rotateAround, 'Expected rigid transform(matrix) to preserve an exact rotation step');
  assert.equal(Math.round(rotateAround.axisX), 0);
  assert.equal(Math.round(rotateAround.axisY), 0);
  assert.equal(Math.round(rotateAround.axisZ), 1);
  assert.equal(Math.round(rotateAround.degrees), 90);

  const translate = steps.find((step) => step.kind === 'translate');
  assert(translate, 'Expected rigid transform(matrix) to preserve an exact translation step');
  assert.equal(Math.round(translate.x), 4);
  assert.equal(Math.round(translate.y), 15);
  assert.equal(Math.round(translate.z), 2);
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

function checkLoftPlan(): void {
  const plan = runExactManifest(`
const body = loft(
  [
    roundedRect(26, 16, 3, true).translate(-1, 0),
    circle2d(8),
    roundedRect(18, 10, 2, true).translate(2, -1),
  ],
  [0, 14, 28],
);
return [{ name: 'Loft', shape: body }];
`);

  assert.equal(plan.kind, 'loft', `Expected loft plan, got ${plan.kind}`);
  assert.deepEqual(plan.heights, [0, 14, 28]);
  assert.equal(plan.profiles.length, 3);
  assert.equal(plan.profiles[0].kind, 'roundedRect');
  assert.equal(plan.profiles[1].kind, 'circle');
  assert.equal(plan.profiles[2].kind, 'roundedRect');
  assert.deepEqual(plan.profiles[0].transforms, [{ kind: 'translate', x: -1, y: 0 }]);
  assert.deepEqual(plan.profiles[2].transforms, [{ kind: 'translate', x: 2, y: -1 }]);
}

function checkSweepPlan(): void {
  const plan = runExactManifest(`
const profile = roundedRect(8, 4, 1.2, true).rotate(18).translate(1.5, 0);
const route = [
  [0, 0, 0],
  [18, 0, 0],
  [28, 8, 4],
  [40, 12, 10],
];
const body = sweep(profile, route, { up: [0, 0, 1], edgeLength: 0.5 });
return [{ name: 'Sweep', shape: body }];
`);

  assert.equal(plan.kind, 'sweep', `Expected sweep plan, got ${plan.kind}`);
  assert.equal(plan.profile.kind, 'roundedRect');
  assert.deepEqual(plan.profile.transforms, [
    { kind: 'rotate', degrees: 18 },
    { kind: 'translate', x: 1.5, y: 0 },
  ]);
  assert.equal(plan.path.kind, 'polyline');
  assert.deepEqual(plan.path.points, [
    [0, 0, 0],
    [18, 0, 0],
    [28, 8, 4],
    [40, 12, 10],
  ]);
  assert.deepEqual(plan.up, [0, 0, 1]);
}

function checkSketchOnFacePlacementPlan(): void {
  const plan = runExactManifest(`
const body = roundedRect(20, 12, 2, true).extrude(6, { center: true });
const feature = rect(6, 4)
  .onFace(body, 'top', { u: 2, v: 1, protrude: 0.5, selfAnchor: 'center' })
  .extrude(3);
return [{ name: 'Feature', shape: feature }];
`);

  const placement = collectShapeTransforms(plan).find((step) => step.kind === 'workplanePlacement');
  assert(placement, 'Expected onFace() downstream features to preserve a semantic workplane placement transform');
  assert.equal(placement.placement.workplane.source.kind, 'tracked-face');
  assert.equal(placement.placement.workplane.source.faceName, 'top');
  assert.equal(placement.placement.u, 2);
  assert.equal(placement.placement.v, 1);
  assert.equal(placement.placement.protrude, 0.5);
  assert.equal(placement.placement.selfAnchor, 'center');
  assert.equal(placement.matrix.length, 16, 'Expected workplane placement transform to carry a full matrix');
}

function checkSketchOnFacePlacementExportEndToEnd(): void {
  exportExactManifest(`
const body = roundedRect(20, 12, 2, true).extrude(6, { center: true });
const boss = rect(6, 4)
  .onFace(body, 'top', { u: 2, v: 1, protrude: 0.5, selfAnchor: 'center' })
  .extrude(3);
return [{ name: 'Boss', shape: boss }];
`);
}

function checkMixedSketchAndSolidScenePolicy(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const plate = rect(40, 24).extrude(8);
const slot2d = slot(18, 6).translate(0, -20);
return [
  { name: 'Plate', shape: plate },
  { name: 'Slot', sketch: slot2d },
];
`,
  };
  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  assert.equal(result.error, null, `runScript failed: ${result.error ?? 'unknown error'}`);

  const manifest = buildBrepExportManifest(result.objects);
  assert.equal(manifest.unsupported.length, 0, 'Mixed sketch + solid scene should not be rejected');
  assert.equal(manifest.objects.length, 1, 'Expected the solid object to remain exportable');
  assert.equal(manifest.objects[0].name, 'Plate');
  assert.equal(manifest.skipped.length, 1, 'Expected sketches to be skipped, not rejected');
  assert.equal(manifest.skipped[0].name, 'Slot');
}

function checkSplitBranchesStayExactExportable(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const stock = box(48, 24, 20, true).toShape();
const cutter = cylinder(28, 8, undefined, undefined, true)
  .translate(10, 0, 0)
  .rotate(0, 90, 0);
const [inside, outside] = stock.split(cutter);
return [
  { name: 'Inside', shape: inside },
  { name: 'Outside', shape: outside },
];
`,
  };
  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  assert.equal(result.error, null, `runScript failed: ${result.error ?? 'unknown error'}`);

  const manifest = buildBrepExportManifest(result.objects);
  assert.equal(manifest.unsupported.length, 0, 'Split branches should stay exact-exportable');
  assert.equal(manifest.objects.length, 2, `Expected both split branches to export, got ${manifest.objects.length}`);
  assert(manifest.objects.every((item) => item.kind === 'exact'), 'Expected split branches to stay on the exact export route');
  assert(manifest.objects.every((item) => item.kind !== 'exact' || item.target === 'cadquery-occt'), 'Expected split branches to use the CadQuery/OCCT lowerer');
}

function checkPlaneTrimAndSplitStayExactExportable(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const body = box(40, 30, 20, true).toShape();
const trimmed = body.trimByPlane([0, 0, 1], 0);
const [upper, lower] = body.splitByPlane([0, 0, 1], 0);
return [
  { name: 'Trimmed', shape: trimmed },
  { name: 'Upper', shape: upper },
  { name: 'Lower', shape: lower },
];
`,
  };
  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  assert.equal(result.error, null, `runScript failed: ${result.error ?? 'unknown error'}`);

  const manifest = buildBrepExportManifest(result.objects);
  assert.equal(manifest.unsupported.length, 0, 'Plane trims and plane splits should stay exact-exportable');
  assert.equal(manifest.objects.length, 3, `Expected trim plus split branches to export, got ${manifest.objects.length}`);
  assert(manifest.objects.every((item) => item.kind === 'exact'), 'Expected plane trim and split branches to stay on the exact export route');
  assert(manifest.objects.every((item) => item.kind !== 'exact' || item.target === 'cadquery-occt'), 'Expected plane trim and split branches to use the CadQuery/OCCT lowerer');
}

function checkLoftAndSweepExportEndToEnd(): void {
  exportExactManifest(`
const lofted = loft(
  [
    roundedRect(22, 14, 2.5, true),
    circle2d(7),
    roundedRect(16, 10, 1.6, true).translate(2, -1),
  ],
  [0, 12, 24],
);
const swept = sweep(
  roundedRect(7, 3.5, 1, true).rotate(12),
  [
    [0, 0, 0],
    [14, 0, 0],
    [24, 6, 3],
    [34, 10, 8],
  ],
  { up: [0, 0, 1] },
);
return [
  { name: 'Lofted', shape: lofted },
  { name: 'Swept', shape: swept.translate(0, 24, 0) },
];
`);
}

function checkChessSetFacetedFallbackManifest(): void {
  const scriptPath = resolve('examples/chess-set.forge.js');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);
  const result = runScript(allFiles[fileName], fileName, allFiles);
  assert.equal(result.error, null, `runScript failed: ${result.error ?? 'unknown error'}`);

  const exactManifest = buildBrepExportManifest(result.objects);
  assert.equal(
    exactManifest.unsupported.length,
    4,
    `Expected 4 exact-export blockers in chess set, got: ${exactManifest.unsupported.map((item) => item.name).join(', ')}`,
  );

  const manifest = buildBrepExportManifest(result.objects, { allowFaceted: true });
  assert.equal(manifest.unsupported.length, 0, 'Faceted fallback should eliminate chess-set blockers');
  assert.equal(manifest.objects.length, 37, `Expected all 37 chess-set solids to export, got ${manifest.objects.length}`);
  assert.equal(manifest.fallbacks.length, 4, `Expected 4 faceted fallbacks, got ${manifest.fallbacks.length}`);
  assert.deepEqual(
    manifest.fallbacks.map((item) => item.name).sort(),
    ['Black Knight 2', 'Black Knight 7', 'White Knight 2', 'White Knight 7'],
  );
}

function checkSegmentedRuntimeHintsStayOutOfExactSubset(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const segmentedDisk = circle2d(12, 18).extrude(4);
const segmentedPost = cylinder(20, 5, undefined, 12);
const segmentedLathe = polygon([
  [6, 0],
  [10, 4],
  [8, 12],
  [0, 12],
]).revolve(240, 24);

return [
  { name: 'Segmented Disk', shape: segmentedDisk },
  { name: 'Segmented Post', shape: segmentedPost },
  { name: 'Segmented Lathe', shape: segmentedLathe },
];
`,
  };
  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  assert.equal(result.error, null, `runScript failed: ${result.error ?? 'unknown error'}`);

  const exactManifest = buildBrepExportManifest(result.objects);
  assert.equal(exactManifest.objects.length, 0, 'Segmented runtime hints should not remain in exact export subset');
  assert.equal(exactManifest.unsupported.length, 3, 'Expected segmented runtime-hint shapes to be rejected by exact export');

  const facetedManifest = buildBrepExportManifest(result.objects, { allowFaceted: true });
  assert.equal(facetedManifest.unsupported.length, 0, 'Faceted fallback should cover segmented runtime-hint shapes');
  assert.equal(facetedManifest.objects.length, 3, 'Expected all segmented shapes to export as faceted objects');
  assert.equal(facetedManifest.fallbacks.length, 3, 'Expected faceted fallbacks for all segmented runtime-hint shapes');
}

function checkHullRuntimeIntentStaysOutOfExactSubset(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const rib = hull3d(
  cylinder(20, 3).translate(-10, 0, 0),
  cylinder(20, 3).translate(10, 0, 0),
  [0, 0, 26],
);
const convexPost = box(12, 8, 20, true)
  .toShape()
  .rotateAround([0, 0, 1], 25, [0, 0, 0])
  .hull();

return [
  { name: 'Rib', shape: rib },
  { name: 'Convex Post', shape: convexPost },
];
`,
  };
  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  assert.equal(result.error, null, `runScript failed: ${result.error ?? 'unknown error'}`);

  const exactManifest = buildBrepExportManifest(result.objects);
  assert.equal(exactManifest.objects.length, 0, 'Hull solids should stay out of the exact export subset');
  assert.equal(exactManifest.unsupported.length, 2, 'Expected hull solids to be rejected by exact export');
  assert(
    exactManifest.unsupported.every((item) => item.reason.includes('shape-hull')),
    `Expected hull-specific exact-export blockers, got: ${exactManifest.unsupported.map((item) => item.reason).join('; ')}`,
  );

  const facetedManifest = buildBrepExportManifest(result.objects, { allowFaceted: true });
  assert.equal(facetedManifest.unsupported.length, 0, 'Faceted fallback should cover hull solids');
  assert.equal(facetedManifest.objects.length, 2, 'Expected hull solids to export as faceted objects');
  assert.equal(facetedManifest.fallbacks.length, 2, 'Expected faceted fallbacks for all hull solids');
  assert(facetedManifest.objects.every((item) => item.kind === 'faceted'), 'Expected hull solids to export as faceted geometry');
}

export async function runCheckBrepExportCli(): Promise<void> {
  await init();
  checkRoundedRectProfileTransforms();
  checkRoundedRectBooleanChain();
  checkProfileBooleanAndTaperedExtrude();
  checkPolygonProfileTransforms();
  checkPolygonBooleanHoleChain();
  checkRoundOffsetProfilePlan();
  checkRotateAroundTransformPlan();
  checkMirrorTransformPlan();
  checkScaleTransformPlan();
  checkMirroredSketchProfilePlan();
  checkRigidMatrixTransformPlan();
  checkPointAlongOnPrimitiveBoolean();
  checkLoftPlan();
  checkSweepPlan();
  checkSketchOnFacePlacementPlan();
  checkSketchOnFacePlacementExportEndToEnd();
  checkMixedSketchAndSolidScenePolicy();
  checkSplitBranchesStayExactExportable();
  checkPlaneTrimAndSplitStayExactExportable();
  checkLoftAndSweepExportEndToEnd();
  checkChessSetFacetedFallbackManifest();
  checkSegmentedRuntimeHintsStayOutOfExactSubset();
  checkHullRuntimeIntentStaysOutOfExactSubset();
  console.log('✓ BREP export invariants passed');
}

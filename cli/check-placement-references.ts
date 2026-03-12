#!/usr/bin/env node
/**
 * Placement reference invariants.
 *
 * Ensures named points/edges/surfaces/objects survive transforms and importPart().
 */
import { getShapePrimaryQueryOwner, getShapeQueryOwners, getShapeWorkplanePlacement, initKernel, box } from '../src/forge/kernel';
import { runScript } from '../src/forge/headless';
import { circle2d, linearPattern, rect, roundedRect, rectangle, transformTopology } from '../src/forge/sketch';
import { getSketchPlacement3D, getSketchPlacementModel, getSketchWorkplane } from '../src/forge/sketch/core';
import { Transform } from '../src/forge/transform';

function fail(message: string): never {
  throw new Error(message);
}

function expect(condition: boolean, message: string): void {
  if (!condition) fail(message);
}

function close(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

function expectVec(actual: [number, number, number], expected: [number, number, number], label: string): void {
  const ok = close(actual[0], expected[0]) && close(actual[1], expected[1]) && close(actual[2], expected[2]);
  expect(ok, `${label} expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
}

function expectMatrix(actual: number[], expected: number[], label: string): void {
  expect(actual.length === expected.length, `${label} expected matrix length ${expected.length}, got ${actual.length}`);
  for (let index = 0; index < actual.length; index += 1) {
    expect(close(actual[index], expected[index]), `${label}[${index}] expected ${expected[index]}, got ${actual[index]}`);
  }
}

function midpoint(start: [number, number, number], end: [number, number, number]): [number, number, number] {
  return [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
}

function checkTransformAndPlacementHelpers(): void {
  const source = box(20, 10, 6, true).withReferences({
    points: {
      mount: [2, 3, 1],
    },
    edges: {
      axis: {
        start: [0, 0, -3],
        end: [0, 0, 3],
      },
    },
    surfaces: {
      dockingFace: {
        center: [0, 5, 0],
        normal: [0, 1, 0],
      },
    },
    objects: {
      pocket: {
        min: [-4, -2, -1],
        max: [-1, 1, 2],
      },
    },
  });

  const moved = source.translate(10, -2, 5);
  expectVec(moved.referencePoint('mount'), [12, 1, 6], 'translate.point');
  expectVec(moved.referencePoint('edges.axis.start'), [10, -2, 2], 'translate.edgeStart');
  expectVec(moved.referencePoint('surfaces.dockingFace'), [10, 3, 5], 'translate.surfaceCenter');
  expectVec(moved.referencePoint('objects.pocket.top'), [7.5, -2.5, 7], 'translate.objectTop');

  const placed = source.placeReference('mount', [50, 20, 10]);
  expectVec(placed.referencePoint('mount'), [50, 20, 10], 'placeReference');

  const target = box(8, 8, 8, true).withReferences({
    points: {
      dock: [40, -10, 6],
    },
  });
  const attached = source.attachTo(target, 'dock', 'mount');
  expectVec(attached.referencePoint('mount'), [40, -10, 6], 'attachTo.namedPoint');
}

function checkImportRuntimePropagation(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const imported = importPart("child.forge.js").placeReference("socket", [20, 0, 0]);
return imported;
`,
    'child.forge.js': `
const body = box(20, 10, 6, true).withReferences({
  points: {
    socket: [0, -5, 0],
  },
  objects: {
    body: box(20, 10, 6, true),
  },
});
return body;
`,
  };

  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  expect(!result.error, `runScript failed: ${result.error}`);
  expect(result.shape != null, 'main result should be a shape');

  const imported = result.shape!;
  expectVec(imported.referencePoint('socket'), [20, 0, 0], 'import.point');
  expectVec(imported.referencePoint('surfaces.top'), [20, 5, 3], 'import.trackedSurface');
  expectVec(imported.referencePoint('edges.top-bottom'), [20, 0, 3], 'import.trackedEdge');
  expectVec(imported.referencePoint('objects.body.right'), [30, 5, 0], 'import.objectAnchor');
}

function checkShapeTrackedShapePlacementInterop(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const target = roundedRect(20, 10, 2, true).extrude(6, { center: true });
const source = difference(
  box(4, 4, 4, true),
  cylinder(4, 1, undefined, undefined, true),
);
return source.attachTo(target, 'left-front', 'front-left');
`,
  };

  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  expect(!result.error, `shape->tracked attachTo failed: ${result.error}`);
  expect(result.shape != null, 'interop result should be a shape');

  const bb = result.shape!.boundingBox();
  expectVec(bb.min as [number, number, number], [-10, -5, -2], 'interop.attachTo.min');
  expectVec(bb.max as [number, number, number], [-6, -1, 2], 'interop.attachTo.max');
}

function checkCanonicalFaceWorkplaneRecording(): void {
  const target = box(20, 10, 6, true);
  const sketch = rect(8, 4).onFace(target, 'front', {
    u: 3,
    v: -2,
    protrude: 1,
    selfAnchor: 'top-left',
  });

  const placement = getSketchPlacementModel(sketch);
  const workplane = getSketchWorkplane(sketch);
  expect(placement != null, 'canonical workplane placement should be recorded');
  expect(workplane != null, 'canonical workplane should be available');
  expect(placement!.workplane.source.kind === 'canonical-face', 'expected canonical face workplane source');
  expect(placement!.workplane.source.face === 'front', 'expected canonical front face source');
  expectVec(placement!.workplane.origin, target.referencePoint('front'), 'workplane.canonical.origin');
  expectVec(placement!.workplane.normal, [0, -1, 0], 'workplane.canonical.normal');
  expect(placement!.u === 3 && placement!.v === -2 && placement!.protrude === 1, 'canonical offsets should be preserved');
  expect(placement!.selfAnchor === 'top-left', 'canonical selfAnchor should be preserved');
  expect(JSON.stringify(workplane) === JSON.stringify(placement!.workplane), 'getSketchWorkplane should mirror placement model workplane');
}

function checkTrackedFaceWorkplaneRecording(): void {
  const target = roundedRect(20, 12, 2, true).extrude(6, { center: true });
  const faceQuery = target.face('top').query;
  expect(faceQuery != null, 'tracked faces should expose a shared face-query reference');
  expect(faceQuery!.kind === 'tracked-face', 'tracked faces should expose tracked-face queries');
  expect(faceQuery!.faceName === 'top', 'tracked face queries should preserve the face name');
  const sketch = rect(6, 4).onFace(target, 'top', {
    u: 2,
    v: 1,
    protrude: 0.5,
    selfAnchor: 'center',
  });

  const placement = getSketchPlacementModel(sketch);
  expect(placement != null, 'tracked-face workplane placement should be recorded');
  expect(placement!.workplane.source.kind === 'tracked-face', 'expected tracked-face workplane source');
  expect(placement!.workplane.source.faceName === 'top', 'expected tracked top face source');
  expect(placement!.workplane.source.owner?.id === faceQuery!.owner?.id, 'tracked-face workplane should reuse the face query owner');
  expectVec(placement!.workplane.origin, target.face('top').center, 'workplane.tracked.origin');
  expectVec(placement!.workplane.normal, target.face('top').normal, 'workplane.tracked.normal');

  const transformed = sketch.translate(4, -1).rotate(30);
  expect(
    JSON.stringify(getSketchPlacementModel(transformed)) === JSON.stringify(placement),
    '2D sketch transforms should preserve semantic workplane placement',
  );
}

function checkDirectFaceRefWorkplaneRecording(): void {
  const target = roundedRect(18, 10, 1.5, true).extrude(5, { center: true });
  const sketch = rect(4, 3).onFace(target.face('top'), {
    u: -1,
    v: 2,
    protrude: 0.25,
  });

  const placement = getSketchPlacementModel(sketch);
  expect(placement != null, 'direct face-ref workplane placement should be recorded');
  expect(placement!.workplane.source.kind === 'face-ref', 'expected direct face-ref workplane source');
  expect(placement!.workplane.source.faceName === 'top', 'expected face-ref source name to be preserved');
  expect(
    placement!.workplane.source.owner?.id === getShapePrimaryQueryOwner(target.toShape())?.id,
    'direct face-ref workplane source should preserve the parent body owner',
  );
}

function checkTrackedEdgeQueryPropagation(): void {
  const target = rectangle(-10, -6, 20, 12).extrude(6);
  const targetOwner = getShapePrimaryQueryOwner(target.toShape());
  expect(targetOwner != null, 'tracked-edge targets should expose a primary query owner');

  const topEdge = target.edge('top-bottom');
  expect(topEdge.query != null, 'tracked edges should expose a shared edge-query reference');
  expect(topEdge.query!.kind === 'tracked-edge', 'tracked edges should expose tracked-edge queries');
  expect(topEdge.query!.edgeName === 'top-bottom', 'tracked edge queries should preserve the edge name');
  expect(topEdge.query!.selector === 'edge', 'tracked edge queries should default to the whole edge selector');
  expect(topEdge.query!.owner?.id === targetOwner!.id, 'tracked edge queries should reuse the parent body owner');
  expectVec(target.referencePoint('edges.top-bottom'), midpoint(topEdge.start, topEdge.end), 'edgeSelector.midpoint');
  expectVec(target.referencePoint('edges.top-bottom.start'), topEdge.start, 'edgeSelector.start');
  expectVec(target.referencePoint('edges.top-bottom.end'), topEdge.end, 'edgeSelector.end');

  const shifted = target.translate(4, -3, 2);
  const shiftedStoredQuery = shifted.topology.edges.get('top-bottom')?.query;
  expect(shiftedStoredQuery != null, 'tracked-topology translations should preserve stored edge-query metadata');
  expect(shiftedStoredQuery!.kind === 'tracked-edge', 'stored edge-query metadata should remain tracked-edge');
  expect(shiftedStoredQuery!.edgeName === 'top-bottom', 'stored edge-query metadata should preserve the edge name');
  expect(shiftedStoredQuery!.selector === 'edge', 'stored edge-query metadata should preserve the selector');
  const shiftedEdge = shifted.edge('top-bottom');
  expect(shiftedEdge.query?.owner?.id === targetOwner!.id, 'translated tracked edges should preserve owner lineage');
  expectVec(shifted.referencePoint('edges.top-bottom.start'), shiftedEdge.start, 'translatedEdge.start');
  expectVec(shifted.referencePoint('edges.top-bottom.end'), shiftedEdge.end, 'translatedEdge.end');

  const placedSketch = rect(6, 4)
    .onFace(box(16, 10, 8, true), 'front', {
      u: 2,
      v: -1,
      protrude: 0.5,
      selfAnchor: 'center',
    });
  const placement = getSketchPlacement3D(placedSketch);
  expect(placement != null, 'tracked-edge workplane transform check should have a placement matrix');
  const transformedTopology = transformTopology(target.topology, placement!);
  const transformedStoredQuery = transformedTopology.edges.get('top-bottom')?.query;
  expect(transformedStoredQuery != null, 'workplane-placed tracked topology should preserve edge-query metadata');
  expect(transformedStoredQuery!.kind === 'tracked-edge', 'workplane-placed edge queries should remain tracked-edge');
  expect(transformedStoredQuery!.edgeName === 'top-bottom', 'workplane-placed edge queries should preserve the edge name');
  expect(transformedStoredQuery!.selector === 'edge', 'workplane-placed edge queries should preserve the selector');
  expectVec(
    transformedTopology.edges.get('top-bottom')!.start,
    Transform.from(placement!).point(topEdge.start),
    'workplaneEdge.start',
  );
}

function checkShapeWorkplanePlacementPropagation(): void {
  const target = roundedRect(20, 12, 2, true).extrude(6, { center: true });
  const targetOwner = getShapePrimaryQueryOwner(target.toShape());
  expect(targetOwner != null, 'compile-covered target should expose a primary query owner');

  const extrudeSketch = rect(6, 4).onFace(target, 'top', {
    u: 2,
    v: 1,
    protrude: 0.5,
    selfAnchor: 'center',
  });
  const extruded = extrudeSketch.extrude(3).toShape();
  const extrudePlacement = getShapeWorkplanePlacement(extruded);
  expect(extrudePlacement != null, 'extrude() should preserve semantic workplane placement on the shape compile plan');
  expect(extrudePlacement!.placement.workplane.source.kind === 'tracked-face', 'extrude() should preserve tracked-face placement source');
  expect(extrudePlacement!.placement.workplane.source.faceName === 'top', 'extrude() should preserve tracked face name');
  expect(extrudePlacement!.placement.workplane.source.owner?.id === targetOwner!.id, 'extrude() should preserve parent-body query ownership');
  expectVec(extrudePlacement!.placement.workplane.origin, target.face('top').center, 'extrude.workplane.origin');
  expectMatrix(extrudePlacement!.matrix, getSketchPlacement3D(extrudeSketch)!, 'extrude.workplane.matrix');

  const shiftedExtrude = extrudeSketch.extrude(3).translate(10, -2, 5).toShape();
  const shiftedExtrudePlacement = getShapeWorkplanePlacement(shiftedExtrude);
  expect(shiftedExtrudePlacement != null, 'workplane placement should survive later shape translations');
  expectMatrix(
    shiftedExtrudePlacement!.matrix,
    Transform.from(getSketchPlacement3D(extrudeSketch)!).translate(10, -2, 5).toArray(),
    'extrude.workplane.matrix.translate',
  );
  expectVec(
    shiftedExtrudePlacement!.placement.workplane.origin,
    Transform.translation(10, -2, 5).point(target.face('top').center),
    'extrude.workplane.origin.translate',
  );

  const revolveSketch = rect(4, 2).onFace(box(16, 10, 8, true), 'front', {
    u: -3,
    v: 2,
    protrude: 0.25,
    selfAnchor: 'bottom-left',
  });
  const revolved = revolveSketch.revolve(180);
  const revolvePlacement = getShapeWorkplanePlacement(revolved);
  expect(revolvePlacement != null, 'revolve() should preserve semantic workplane placement on the shape compile plan');
  expect(revolvePlacement!.placement.workplane.source.kind === 'canonical-face', 'revolve() should preserve canonical-face placement source');
  expect(revolvePlacement!.placement.workplane.source.face === 'front', 'revolve() should preserve canonical face name');
  expectMatrix(revolvePlacement!.matrix, getSketchPlacement3D(revolveSketch)!, 'revolve.workplane.matrix');

  const rotatedRevolve = revolved.rotate(0, 0, 90);
  const rotatedRevolvePlacement = getShapeWorkplanePlacement(rotatedRevolve);
  expect(rotatedRevolvePlacement != null, 'workplane placement should survive later shape rotations');
  expectMatrix(
    rotatedRevolvePlacement!.matrix,
    Transform.from(getSketchPlacement3D(revolveSketch)!).rotateAxis([0, 0, 1], 90).toArray(),
    'revolve.workplane.matrix.rotate',
  );
  expectVec(
    rotatedRevolvePlacement!.placement.workplane.normal,
    Transform.rotationAxis([0, 0, 1], 90).vector([0, -1, 0]),
    'revolve.workplane.normal.rotate',
  );
}

function checkShapeQueryOwnerPropagation(): void {
  const base = roundedRect(40, 24, 3, true).extrude(12);
  const baseOwner = getShapePrimaryQueryOwner(base.toShape());
  expect(baseOwner != null, 'base extrude should expose a primary query owner');
  expect(baseOwner!.operation === 'extrude', `expected base owner operation "extrude", got ${baseOwner!.operation}`);

  const cup = base.shell(2, { openFaces: ['top'] });
  const cupOwner = getShapePrimaryQueryOwner(cup);
  expect(cupOwner != null, 'shell result should expose a primary query owner');
  expect(cupOwner!.operation === 'shell', `expected shell owner operation "shell", got ${cupOwner!.operation}`);

  const vent = roundedRect(10, 6, 1.5, true)
    .onFace(base, 'front', { u: 0, v: 2, protrude: 0.25, selfAnchor: 'center' })
    .extrude(4);
  const ventPlacement = getShapeWorkplanePlacement(vent.toShape());
  expect(ventPlacement != null, 'downstream cut feature should preserve workplane placement');
  expect(ventPlacement!.placement.workplane.source.owner?.id === baseOwner!.id, 'downstream cut should preserve the base owner query');

  const foot = roundedRect(8, 8, 1.5, true)
    .onFace(base, 'bottom', { u: 10, v: 6, protrude: 0, selfAnchor: 'center' })
    .extrude(4);
  const footOwner = getShapePrimaryQueryOwner(foot.toShape());
  expect(footOwner != null, 'downstream support feature should expose a primary query owner');

  const body = cup.add(foot).subtract(vent);
  const bodyOwner = getShapePrimaryQueryOwner(body);
  expect(bodyOwner != null, 'boolean result should expose a primary query owner');
  expect(bodyOwner!.operation === 'boolean:difference', `expected boolean owner operation, got ${bodyOwner!.operation}`);

  const ownerIds = new Set(getShapeQueryOwners(body).map((owner) => owner.id));
  expect(ownerIds.has(baseOwner!.id), 'boolean result should retain the base owner lineage');
  expect(ownerIds.has(cupOwner!.id), 'boolean result should retain the shell owner lineage');
  expect(ownerIds.has(footOwner!.id), 'boolean result should retain the added feature owner lineage');
  expect(ownerIds.has(bodyOwner!.id), 'boolean result should include its own owner');
}

function checkRepeatedFeatureOwnershipPropagation(): void {
  const base = roundedRect(72, 44, 4, true).extrude(12);

  const boss = roundedRect(16, 12, 2, true)
    .onFace(base, 'top', { u: -18, v: 10, protrude: 0.5, selfAnchor: 'center' })
    .extrude(8);
  const bossOwner = getShapePrimaryQueryOwner(boss.toShape());
  expect(bossOwner != null, 'seed downstream feature should expose a primary query owner');

  const mirroredBoss = boss.toShape().mirror([1, 0, 0]);
  const mirroredOwner = getShapePrimaryQueryOwner(mirroredBoss);
  expect(mirroredOwner != null, 'mirrored downstream feature should expose a primary query owner');
  expect(mirroredOwner!.operation === 'mirror', `expected mirrored feature owner operation "mirror", got ${mirroredOwner!.operation}`);
  expect(mirroredOwner!.id !== bossOwner!.id, 'mirrored downstream feature should get its own repeated-result owner');

  const mirroredHole = circle2d(2.4)
    .onFace(mirroredBoss, 'top', { u: 0, v: 0, protrude: 0.25, selfAnchor: 'center' })
    .extrude(10);
  const mirroredHolePlacement = getShapeWorkplanePlacement(mirroredHole.toShape());
  expect(mirroredHolePlacement != null, 'downstream feature on mirrored result should preserve workplane placement');
  expect(
    mirroredHolePlacement!.placement.workplane.source.owner?.id === mirroredOwner!.id,
    'downstream feature on mirrored result should target the mirrored owner lineage',
  );

  const slotSeed = roundedRect(12, 4, 1.5, true)
    .onFace(base, 'top', { u: -22, v: -12, protrude: 0.5, selfAnchor: 'center' })
    .extrude(6);
  const slotOwner = getShapePrimaryQueryOwner(slotSeed.toShape());
  expect(slotOwner != null, 'pattern seed feature should expose a primary query owner');

  const slots = linearPattern(slotSeed, 3, 22, 0, 0);
  const slotOwners = getShapeQueryOwners(slots);
  const patternedOwners = slotOwners.filter((owner) => owner.operation.startsWith('pattern:linear:'));
  expect(patternedOwners.length === 3, `expected 3 linear-pattern owners, got ${patternedOwners.length}`);
  expect(new Set(patternedOwners.map((owner) => owner.id)).size === 3, 'linear-pattern instances should keep distinct owner ids');
  expect(
    patternedOwners.some((owner) => owner.operation === 'pattern:linear:0'),
    'linear-pattern ownership should keep the seed instance visible as pattern:linear:0',
  );
  expect(slotOwners.some((owner) => owner.id === slotOwner!.id), 'patterned result should retain the seed feature lineage');
}

export async function runCheckPlacementReferencesCli(): Promise<void> {
  await initKernel();
  checkTransformAndPlacementHelpers();
  checkImportRuntimePropagation();
  checkShapeTrackedShapePlacementInterop();
  checkCanonicalFaceWorkplaneRecording();
  checkTrackedFaceWorkplaneRecording();
  checkDirectFaceRefWorkplaneRecording();
  checkTrackedEdgeQueryPropagation();
  checkShapeWorkplanePlacementPropagation();
  checkShapeQueryOwnerPropagation();
  checkRepeatedFeatureOwnershipPropagation();
  console.log('✓ Placement reference invariants passed');
}

#!/usr/bin/env node
/**
 * Placement reference invariants.
 *
 * Ensures named points/edges/surfaces/objects survive transforms and importPart().
 */
import '../src/forge/holeCut';
import { resolveSupportedEdgeFeatureSelection } from '../src/forge/edgeFeatureResolution';
import {
  box,
  getShapeCompilePlan,
  getShapePrimaryQueryOwner,
  getShapeQueryOwners,
  getShapeTopologyRewritePropagation,
  getShapeTopologyRewritePropagations,
  getShapeWorkplanePlacement,
  initKernel,
  sphere,
  union,
} from '../src/forge/kernel';
import { runScript } from '../src/forge/headless';
import { describeFaceQueryRef } from '../src/forge/queryModel';
import { circle2d, filletEdge, linearPattern, rect, roundedRect, rectangle, transformTopology } from '../src/forge/sketch';
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

function expectThrows(fn: () => void, pattern: RegExp, label: string): void {
  try {
    fn();
    fail(`${label} expected an error matching ${pattern}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    expect(pattern.test(message), `${label} expected error ${pattern}, got "${message}"`);
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

function checkBooleanFacePlacementResolution(): void {
  const plate = roundedRect(40, 24, 3, true).extrude(10).toShape();
  const cover = union(
    plate,
    sphere(4).translate(0, 0, 11),
  );

  const topFace = cover.face('top');
  expect(topFace.query?.kind === 'propagated-face', 'supported boolean-preserved top faces should resolve to propagated-face queries');
  if (topFace.query?.kind === 'propagated-face') {
    expect(topFace.query.source.kind === 'canonical-face', 'boolean-preserved top faces should point back to canonical-face lineage');
    expect(topFace.query.source.face === 'top', `expected propagated top face source "top", got "${topFace.query.source.face}"`);
  }

  const sketch = rect(6, 4).onFace(cover, 'top', {
    u: 3,
    v: -2,
    protrude: 0.25,
    selfAnchor: 'center',
  });
  const placement = getSketchPlacementModel(sketch);
  expect(placement != null, 'compile-covered boolean results should resolve named preserved faces for Sketch.onFace()');
  expect(placement!.workplane.source.kind === 'propagated-face', 'Sketch.onFace(booleanResult, "top") should preserve propagated face provenance');
  expectVec(placement!.workplane.origin, topFace.center, 'boolean.onFace.origin');
  expectVec(placement!.workplane.normal, topFace.normal, 'boolean.onFace.normal');
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

function checkHoleCutFeaturePlacement(): void {
  const base = roundedRect(48, 30, 4, true).extrude(18);
  const baseOwner = getShapePrimaryQueryOwner(base.toShape());
  expect(baseOwner != null, 'hole/cut base should expose a primary query owner');

  const drilled = base.hole('top', { diameter: 6, u: 8, v: -4, depth: 9 });
  const drilledOwner = getShapePrimaryQueryOwner(drilled);
  expect(drilledOwner != null, 'blind-hole result should expose a primary owner');
  const holePlacement = getShapeWorkplanePlacement(drilled);
  expect(holePlacement != null, 'Shape.hole() should preserve its semantic workplane placement on the result');
  expect(holePlacement!.placement.workplane.source.kind === 'tracked-face', 'Shape.hole() should prefer tracked planar faces when available');
  expect(holePlacement!.placement.workplane.source.faceName === 'top', 'Shape.hole() should preserve the selected tracked face name');
  expect(holePlacement!.placement.workplane.source.owner?.id === baseOwner!.id, 'Shape.hole() should keep the parent body owner on the face query');
  expect(holePlacement!.placement.u === 8, 'Shape.hole() should preserve the feature u offset');
  expect(holePlacement!.placement.v === -4, 'Shape.hole() should preserve the feature v offset');
  expect(drilled.faceNames().includes('floor'), 'blind-hole results should expose a defended floor face name');
  expect(drilled.faceNames().includes('wall'), 'hole results should expose a defended wall face name');
  const holeFloor = drilled.face('floor');
  expect(holeFloor.query?.kind === 'created-face', 'hole floor should expose a created-face query');
  if (holeFloor.query?.kind === 'created-face') {
    expect(holeFloor.query.slot === 'floor', `expected blind-hole floor slot "floor", got ${holeFloor.query.slot}`);
    expect(holeFloor.query.owner?.id === drilledOwner!.id, 'blind-hole floor queries should target the hole owner');
  }
  expectThrows(
    () => drilled.face('top'),
    /selected host face is rewritten by the hole result/,
    'hole.hostFace',
  );

  const floorBadge = rect(4, 3)
    .onFace(drilled, 'floor', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
    .extrude(1)
    .toShape();
  const floorPlacement = getShapeWorkplanePlacement(floorBadge);
  expect(floorPlacement != null, 'downstream features should preserve workplane placement from blind-hole floor faces');
  expect(floorPlacement!.placement.workplane.source.kind === 'created-face', 'blind-hole floor placement should preserve a created-face query source');
  if (floorPlacement!.placement.workplane.source.kind === 'created-face') {
    expect(floorPlacement!.placement.workplane.source.slot === 'floor', `expected blind-hole floor placement slot "floor", got ${floorPlacement!.placement.workplane.source.slot}`);
    expect(
      floorPlacement!.placement.workplane.source.owner?.id === drilledOwner!.id,
      'blind-hole floor placement should target the hole owner lineage',
    );
  }

  const pocket = roundedRect(12, 8, 2, true)
    .onFace(base, 'front', { u: 0, v: 3, selfAnchor: 'center' });
  const cut = drilled.cutout(pocket, { depth: 5 });
  const cutOwner = getShapePrimaryQueryOwner(cut);
  expect(cutOwner != null, 'cut results should expose a primary owner');
  const cutPlacement = getShapeWorkplanePlacement(cut);
  expect(cutPlacement != null, 'Shape.cutout() should preserve its semantic workplane placement on the result');
  expect(cutPlacement!.placement.workplane.source.kind === 'canonical-face', 'Shape.cutout() should preserve canonical face queries when the source sketch used them');
  expect(cutPlacement!.placement.workplane.source.face === 'front', 'Shape.cutout() should preserve the selected canonical face');
  expect(cutPlacement!.placement.workplane.source.owner?.id === baseOwner!.id, 'Shape.cutout() should retain the originating body owner lineage');
  expect(cutPlacement!.placement.selfAnchor === 'center', 'Shape.cutout() should preserve the source sketch anchor');
  expect(cut.faceNames().includes('floor'), 'blind cutouts should expose a defended floor face name');
  expect(cut.faceNames().includes('wall-right'), 'rounded-rect cutouts should expose named wall faces');
  const cutWall = cut.face('wall-right');
  expect(cutWall.query?.kind === 'created-face', 'cut wall should expose a created-face query');
  if (cutWall.query?.kind === 'created-face') {
    expect(cutWall.query.slot === 'wall-right', `expected cut wall slot "wall-right", got ${cutWall.query.slot}`);
    expect(cutWall.query.owner?.id === cutOwner!.id, 'cut wall queries should target the cut owner');
  }

  const cutBadge = rect(3, 2)
    .onFace(cut, 'wall-right', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
    .extrude(0.8)
    .toShape();
  const cutWallPlacement = getShapeWorkplanePlacement(cutBadge);
  expect(cutWallPlacement != null, 'downstream features should preserve workplane placement from cut-created wall faces');
  expect(cutWallPlacement!.placement.workplane.source.kind === 'created-face', 'cut-created wall placement should preserve a created-face query source');
  if (cutWallPlacement!.placement.workplane.source.kind === 'created-face') {
    expect(
      cutWallPlacement!.placement.workplane.source.slot === 'wall-right',
      `expected cut wall placement slot "wall-right", got ${cutWallPlacement!.placement.workplane.source.slot}`,
    );
    expect(
      cutWallPlacement!.placement.workplane.source.owner?.id === cutOwner!.id,
      'cut-created wall placement should target the cut owner lineage',
    );
  }
}

function checkEdgeFinishOwnerPropagation(): void {
  const base = rectangle(-32, -20, 64, 40).extrude(20);
  const baseOwner = getShapePrimaryQueryOwner(base.toShape());
  expect(baseOwner != null, 'edge-finish base should expose a primary query owner');

  const filleted = filletEdge(base.toShape(), base.edge('vert-br'), 5, [-1, -1]);
  const filletOwner = getShapePrimaryQueryOwner(filleted);
  expect(filletOwner != null, 'fillet result should expose a primary query owner');
  expect(filletOwner!.operation === 'fillet', `expected fillet owner operation "fillet", got ${filletOwner!.operation}`);

  const ownerIds = new Set(getShapeQueryOwners(filleted).map((owner) => owner.id));
  expect(ownerIds.has(baseOwner!.id), 'fillet result should retain the source body owner lineage');
  expect(ownerIds.has(filletOwner!.id), 'fillet result should include its own feature owner lineage');

  const doubled = filletEdge(filleted, base.edge('vert-bl'), 3, [1, -1]);
  const doubledOwner = getShapePrimaryQueryOwner(doubled);
  expect(doubledOwner != null, 'second fillet on a preserved sibling edge should expose a primary query owner');
  expect(doubledOwner!.operation === 'fillet', `expected second fillet owner operation "fillet", got ${doubledOwner!.operation}`);

  const doubledOwnerIds = new Set(getShapeQueryOwners(doubled).map((owner) => owner.id));
  expect(doubledOwnerIds.has(baseOwner!.id), 'second fillet should still retain the original body owner lineage');
  expect(doubledOwnerIds.has(filletOwner!.id), 'second fillet should retain the earlier edge-finish owner lineage');
  expect(doubledOwnerIds.has(doubledOwner!.id), 'second fillet should include its own feature owner lineage');

  const drilled = doubled.hole(base.face('top'), { diameter: 5, u: -10, v: 6, depth: 8 });
  const holePlacement = getShapeWorkplanePlacement(drilled);
  expect(holePlacement != null, 'downstream hole after edge finishing should preserve semantic workplane placement');
  expect(
    holePlacement!.placement.workplane.source.owner?.id === baseOwner!.id,
    'downstream hole after edge finishing should keep targeting the original base owner lineage',
  );
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

function checkRepeatedBooleanTargetFaceQuerySupport(): void {
  const base = roundedRect(64, 42, 4, true).extrude(12);
  const boss = roundedRect(14, 10, 2, true)
    .onFace(base, 'top', { u: 16, v: 10, protrude: 0.5, selfAnchor: 'center' })
    .extrude(6);
  const mirroredBoss = boss.toShape().mirror([1, 0, 0]);
  const mirroredOwner = getShapePrimaryQueryOwner(mirroredBoss);
  expect(mirroredOwner != null, 'mirrored descendant should expose a repeated-result owner');

  const body = union(base.toShape(), mirroredBoss);
  const drilled = body.hole(mirroredBoss.face('top'), {
    diameter: 3,
    u: 0,
    v: 0,
    depth: 4,
  });
  const placement = getShapeWorkplanePlacement(drilled);
  expect(placement != null, 'boolean targets should accept defended face queries from repeated descendants');
  expect(placement!.placement.workplane.source.kind === 'face-ref', 'direct repeated-descendant face targets should preserve a face-ref workplane source');
  expect(
    placement!.placement.workplane.source.owner?.id === mirroredOwner!.id,
    'boolean-target downstream features should keep the repeated descendant owner lineage on direct face refs',
  );
}

function checkBooleanAndRepeatedQueryPropagation(): void {
  const seed = roundedRect(16, 12, 2, true).extrude(10).toShape();
  const seedOwner = getShapePrimaryQueryOwner(seed);
  expect(seedOwner != null, 'duplicate-union seed should expose a primary owner');

  const duplicated = union(
    seed,
    seed.clone().translate(28, 0, 0),
  );
  const duplicatePropagation = getShapeTopologyRewritePropagation(duplicated);
  expect(duplicatePropagation != null, 'boolean union should expose propagation metadata for duplicated-owner operands');
  const duplicateTop = duplicatePropagation!.preservedFaces.find((entry) =>
    entry.query.source.kind === 'canonical-face'
      && entry.query.source.face === 'top'
      && entry.query.source.owner?.id === seedOwner!.id,
  );
  expect(duplicateTop != null, 'duplicated-owner union should keep an explicit top-face propagation entry');
  expect(duplicateTop!.status === 'ambiguous', 'duplicated-owner union top-face propagation should be ambiguous');
  expect(duplicateTop!.query.outcome === 'merged', 'duplicated-owner union top-face propagation should record a merged outcome');
  expect(
    duplicatePropagation!.diagnostics.some((diagnostic) => diagnostic.code === 'boolean-union-face-merged-ambiguous'),
    'duplicated-owner union should emit an explicit merged-face ambiguity diagnostic',
  );

  const plate = roundedRect(84, 48, 4, true).extrude(12);
  const bossSeed = roundedRect(12, 10, 1.5, true)
    .onFace(plate, 'top', { u: -24, v: 0, protrude: 0.5, selfAnchor: 'center' })
    .extrude(8);
  const bosses = linearPattern(bossSeed, 3, 24, 0, 0);
  const bossPropagation = getShapeTopologyRewritePropagation(bosses);
  expect(bossPropagation != null, 'pattern unions should expose boolean propagation metadata');
  expect(bossPropagation!.operation === 'boolean:union', `expected pattern union propagation operation, got ${bossPropagation!.operation}`);
  const bossTopFaces = bossPropagation!.preservedFaces.filter((entry) =>
    entry.status === 'supported'
      && entry.query.outcome === 'preserved'
      && entry.query.source.kind === 'canonical-face'
      && entry.query.source.face === 'top'
      && entry.query.source.owner?.operation.startsWith('pattern:linear:'),
  );
  expect(bossTopFaces.length === 3, `expected 3 supported patterned top-face entries, got ${bossTopFaces.length}`);
  expect(
    new Set(bossTopFaces.map((entry) => entry.query.source.owner!.operation)).size === 3,
    'patterned top-face propagation should preserve distinct repeated-result owner operations',
  );

  const bossPlate = union(plate, bosses);
  const trimmedBossPlate = bossPlate.subtract(
    box(18, 10, 24, true).translate(0, 0, 8),
  );
  const trimmedPropagation = getShapeTopologyRewritePropagation(trimmedBossPlate);
  expect(trimmedPropagation != null, 'later boolean differences should keep repeated-result propagation metadata visible');
  const trimmedPatternFaces = trimmedPropagation!.preservedFaces.filter((entry) =>
    entry.status === 'ambiguous'
      && entry.query.outcome === 'split'
      && describeFaceQueryRef(entry.query.source).includes('pattern:linear:'),
  );
  expect(
    trimmedPatternFaces.length >= 3,
    `expected later boolean differences to keep patterned descendant face lineage visible, got ${trimmedPatternFaces.length} matching entries`,
  );
  expect(
    trimmedPropagation!.diagnostics.some((diagnostic) => diagnostic.code === 'boolean-difference-face-split-ambiguous'),
    'later boolean differences should emit explicit split-face ambiguity diagnostics for preserved descendants',
  );
}

function checkBooleanTargetAmbiguityDiagnostics(): void {
  const base = roundedRect(52, 34, 4, true).extrude(14);
  const topFace = base.face('top');
  const carved = base.toShape().subtract(
    box(20, 12, 24, true).translate(0, 0, 6),
  );

  expectThrows(
    () => carved.hole(topFace, { diameter: 4, depth: 4 }),
    /ambiguous|defended named-face subset|defended face subset/i,
    'boolean-difference.face-query',
  );
}

function checkTopologyRewritePropagationInspection(): void {
  const base = roundedRect(36, 22, 3, true).extrude(14);

  const shelled = base.shell(2, { openFaces: ['top'] });
  const shelledOwner = getShapePrimaryQueryOwner(shelled);
  expect(shelledOwner != null, 'shell results should expose a primary owner');
  const shellPropagation = getShapeTopologyRewritePropagation(shelled);
  expect(shellPropagation != null, 'shell results should expose a topology-rewrite propagation contract');
  expect(shellPropagation!.operation === 'shell', `expected shell propagation operation, got ${shellPropagation!.operation}`);
  expect(shellPropagation!.preservedFaces.length === 6, `expected 6 preserved shell faces, got ${shellPropagation!.preservedFaces.length}`);
  expect(shellPropagation!.createdFaces.length === 5, `expected 5 created shell faces for an open-top rounded shell, got ${shellPropagation!.createdFaces.length}`);
  expect(
    shellPropagation!.createdFaces.some((entry) => entry.query.slot === 'inner-side-right'),
    'shell propagation should expose the defended inner wall created-face slots',
  );
  expect(
    shellPropagation!.createdFaces.every((entry) => entry.query.owner?.id === shelledOwner!.id),
    'shell created-face queries should target the shell owner',
  );
  expect(
    shellPropagation!.diagnostics.some((diagnostic) => diagnostic.code === 'shell-edge-propagation-ambiguous'),
    'shell propagation should still expose explicit unsupported edge semantics instead of silently dropping them',
  );

  expect(shelled.faceNames().includes('inner-side-right'), 'shell results should expose defended inner wall face names');
  const innerWall = shelled.face('inner-side-right');
  expect(innerWall.query?.kind === 'created-face', 'shell inner walls should expose created-face queries');
  if (innerWall.query?.kind === 'created-face') {
    expect(innerWall.query.slot === 'inner-side-right', `expected shell inner wall slot "inner-side-right", got ${innerWall.query.slot}`);
    expect(innerWall.query.owner?.id === shelledOwner!.id, 'shell inner wall queries should target the shell owner');
  }

  const shellFeature = rect(4, 3)
    .onFace(shelled, 'inner-side-right', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
    .extrude(1)
    .toShape();
  const shellFeaturePlacement = getShapeWorkplanePlacement(shellFeature);
  expect(shellFeaturePlacement != null, 'downstream features should preserve workplane placement from shell-created wall faces');
  expect(shellFeaturePlacement!.placement.workplane.source.kind === 'created-face', 'shell-created wall placement should preserve a created-face query source');
  if (shellFeaturePlacement!.placement.workplane.source.kind === 'created-face') {
    expect(
      shellFeaturePlacement!.placement.workplane.source.slot === 'inner-side-right',
      `expected shell-created wall placement slot "inner-side-right", got ${shellFeaturePlacement!.placement.workplane.source.slot}`,
    );
  }

  const drilled = base.hole('top', { diameter: 6, u: 4, v: -3, depth: 8 });
  const drilledOwner = getShapePrimaryQueryOwner(drilled);
  expect(drilledOwner != null, 'hole results should expose a primary owner');
  const holePropagation = getShapeTopologyRewritePropagation(drilled);
  expect(holePropagation != null, 'hole results should expose a topology-rewrite propagation contract');
  expect(holePropagation!.operation === 'hole', `expected hole propagation operation, got ${holePropagation!.operation}`);
  expect(holePropagation!.preservedFaces.length === 6, `expected 6 preserved-face entries for hole propagation, got ${holePropagation!.preservedFaces.length}`);
  const splitFace = holePropagation!.preservedFaces.find((entry) =>
    entry.query.kind === 'propagated-face'
      && entry.query.source.kind === 'tracked-face'
      && entry.query.source.faceName === 'top',
  );
  expect(splitFace != null, 'hole propagation should expose an explicit ambiguous entry for the rewritten host face');
  expect(splitFace!.status === 'ambiguous', 'hole source-face propagation should still mark the host face ambiguous');
  expect(splitFace!.query.kind === 'propagated-face', 'hole propagation should expose a propagated-face query');
  expect(splitFace!.query.outcome === 'split', 'hole source-face propagation should record a split outcome');
  expect(splitFace!.query.owner?.id === drilledOwner!.id, 'hole propagated-face queries should target the hole result owner');
  expect(splitFace!.query.source.kind === 'tracked-face', 'hole propagated-face queries should preserve the tracked source face');
  if (splitFace!.query.source.kind === 'tracked-face') {
    expect(splitFace!.query.source.faceName === 'top', `expected top source face, got ${splitFace!.query.source.faceName}`);
  }
  expect(holePropagation!.createdFaces.length === 2, `expected 2 created faces for a blind hole, got ${holePropagation!.createdFaces.length}`);
  expect(
    holePropagation!.createdFaces.some((entry) => entry.query.slot === 'floor'),
    'hole propagation should expose the blind-hole floor created-face slot',
  );
  expect(
    holePropagation!.diagnostics.some((diagnostic) => diagnostic.code === 'hole-source-face-split-ambiguous'),
    'hole propagation should expose an explicit split-face ambiguity diagnostic',
  );

  const trimmed = drilled.trimByPlane([0, 0, 1], 0);
  const trimmedOwner = getShapePrimaryQueryOwner(trimmed);
  expect(trimmedOwner != null, 'trimByPlane results should expose a primary owner');
  const trimPropagation = getShapeTopologyRewritePropagation(trimmed);
  expect(trimPropagation != null, 'trimByPlane results should expose a topology-rewrite propagation contract');
  expect(trimPropagation!.operation === 'trimByPlane', `expected trimByPlane propagation operation, got ${trimPropagation!.operation}`);
  expect(trimPropagation!.createdFaces.length === 1, `expected one created face query for trimByPlane, got ${trimPropagation!.createdFaces.length}`);
  const planeCap = trimPropagation!.createdFaces[0].query;
  expect(planeCap.kind === 'created-face', 'trimByPlane should expose a created-face query for the plane cap');
  expect(planeCap.operation === 'trimByPlane', `expected trimByPlane created-face operation, got ${planeCap.operation}`);
  expect(planeCap.slot === 'plane-cap', `expected trimByPlane created-face slot "plane-cap", got ${planeCap.slot}`);
  expect(planeCap.owner?.id === trimmedOwner!.id, 'trimByPlane created-face queries should target the trim result owner');

  const shiftedTrim = trimmed.translate(8, -3, 2);
  expect(
    JSON.stringify(getShapeTopologyRewritePropagation(shiftedTrim)) === JSON.stringify(trimPropagation),
    'later rigid transforms should preserve the inspected topology-rewrite propagation contract',
  );

  const joined = union(trimmed, box(8, 8, 6, true).translate(0, 0, 8));
  const propagationOps = getShapeTopologyRewritePropagations(joined).map((entry) => entry.operation);
  expect(
    propagationOps.join('|') === 'boolean:union|trimByPlane|hole',
    `expected deterministic propagation ordering "boolean:union|trimByPlane|hole", got "${propagationOps.join('|')}"`,
  );

  const prism = rectangle(-16, -10, 32, 20).extrude(12);
  const filleted = filletEdge(prism.toShape(), prism.edge('vert-br'), 4, [-1, -1]);
  const filletPropagation = getShapeTopologyRewritePropagation(filleted);
  expect(filletPropagation != null, 'fillet results should expose a topology-rewrite propagation contract');
  expect(filletPropagation!.operation === 'fillet', `expected fillet propagation operation, got ${filletPropagation!.operation}`);
  expect(filletPropagation!.preservedEdges.length === 4, `expected four preserved-edge records for fillet propagation, got ${filletPropagation!.preservedEdges.length}`);
  const supportedEdges = filletPropagation!.preservedEdges.filter((entry) => entry.status === 'supported');
  expect(supportedEdges.length === 3, `expected three supported preserved sibling edges, got ${supportedEdges.length}`);
  const mergedEdge = filletPropagation!.preservedEdges.find((entry) => entry.status === 'ambiguous');
  expect(mergedEdge != null, 'fillet propagation should keep the selected merged edge as an explicit ambiguous entry');
  expect(mergedEdge!.status === 'ambiguous', 'fillet selected-edge propagation should be marked ambiguous today');
  expect(mergedEdge!.query.kind === 'propagated-edge', 'fillet propagation should expose a propagated-edge query');
  expect(mergedEdge!.query.outcome === 'merged', 'fillet selected-edge propagation should record a merged outcome');
  expect(mergedEdge!.query.source.kind === 'tracked-edge', 'fillet propagation should preserve the tracked source edge query');
  expect(
    filletPropagation!.diagnostics.some((diagnostic) => diagnostic.code === 'fillet-selected-edge-merged-ambiguous'),
    'fillet propagation should expose an explicit merged-edge ambiguity diagnostic',
  );

  const supportedSibling = supportedEdges.find((entry) =>
    entry.query.kind === 'propagated-edge'
    && entry.query.source.kind === 'tracked-edge'
    && entry.query.source.edgeName === 'vert-bl',
  );
  expect(supportedSibling != null, 'fillet propagation should expose a supported propagated-edge query for an untouched sibling edge');
  const resolvedSibling = resolveSupportedEdgeFeatureSelection(getShapeCompilePlan(filleted), supportedSibling!.query);
  expect(resolvedSibling.ok, `supported propagated-edge queries should resolve after fillet rewrites: ${resolvedSibling.ok ? '' : resolvedSibling.issue.reason}`);
  if (resolvedSibling.ok) {
    expect(resolvedSibling.selection.edgeName === 'vert-bl', `expected supported sibling propagated-edge to resolve vert-bl, got ${resolvedSibling.selection.edgeName}`);
  }

  const resolvedMerged = resolveSupportedEdgeFeatureSelection(getShapeCompilePlan(filleted), mergedEdge!.query);
  expect(!resolvedMerged.ok, 'merged propagated-edge queries should stay explicitly unsupported');
  if (!resolvedMerged.ok) {
    expect(
      /blended descendant set|merged rewritten descendants|untouched sibling vertical edges/.test(resolvedMerged.issue.reason),
      `expected merged-edge diagnostic to stay explicit, got "${resolvedMerged.issue.reason}"`,
    );
  }
}

export async function runCheckPlacementReferencesCli(): Promise<void> {
  await initKernel();
  checkTransformAndPlacementHelpers();
  checkImportRuntimePropagation();
  checkShapeTrackedShapePlacementInterop();
  checkCanonicalFaceWorkplaneRecording();
  checkTrackedFaceWorkplaneRecording();
  checkDirectFaceRefWorkplaneRecording();
  checkBooleanFacePlacementResolution();
  checkTrackedEdgeQueryPropagation();
  checkShapeWorkplanePlacementPropagation();
  checkShapeQueryOwnerPropagation();
  checkHoleCutFeaturePlacement();
  checkEdgeFinishOwnerPropagation();
  checkRepeatedFeatureOwnershipPropagation();
  checkRepeatedBooleanTargetFaceQuerySupport();
  checkBooleanAndRepeatedQueryPropagation();
  checkBooleanTargetAmbiguityDiagnostics();
  checkTopologyRewritePropagationInspection();
  console.log('✓ Placement reference invariants passed');
}

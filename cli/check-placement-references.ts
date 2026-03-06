#!/usr/bin/env node
/**
 * Placement reference invariants.
 *
 * Ensures named points/edges/surfaces/objects survive transforms and importPart().
 */
import { initKernel, box } from '../src/forge/kernel';
import { runScript } from '../src/forge/headless';

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

async function main() {
  await initKernel();
  checkTransformAndPlacementHelpers();
  checkImportRuntimePropagation();
  console.log('✓ Placement reference invariants passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

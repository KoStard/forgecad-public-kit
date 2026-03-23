#!/usr/bin/env node
/**
 * Dimension propagation invariants.
 *
 * Ensures shape-bound dimensions survive through all key Shape APIs
 * and import/runtime paths.
 */
import {
  initKernel,
  Shape,
  box,
  union,
  difference,
  intersection,
  getShapeDimensions,
  setShapeDimensions,
} from '../src/forge/kernel';
import { Transform } from '../src/forge/transform';
import { runScript } from '../src/forge/headless';
import { mapDimensionsToOwnerIds } from '../src/forge/reportDimensionOwnership';

type Dim = {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  offset: number;
  label?: string;
  color?: string;
  components?: string[];
};

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

function seedShape(name: string): Shape {
  const shape = box(20, 10, 6, true);
  const dims: Dim[] = [{
    id: `${name}-seed`,
    from: [1, 2, 3],
    to: [7, 2, 3],
    offset: 11,
    label: `${name}-dim`,
  }];
  return setShapeDimensions(shape, dims);
}

function oneDim(shape: Shape, context: string): Dim {
  const dims = getShapeDimensions(shape);
  expect(dims.length === 1, `${context}: expected 1 dim, got ${dims.length}`);
  return dims[0] as Dim;
}

function checkTransformPropagation(): void {
  const source = seedShape('transform');

  const moved = source.translate(10, -2, 5);
  let d = oneDim(moved, 'translate');
  expectVec(d.from, [11, 0, 8], 'translate.from');
  expectVec(d.to, [17, 0, 8], 'translate.to');

  const transformed = source.transform(Transform.translation(3, 4, 5).toArray());
  d = oneDim(transformed, 'transform');
  expectVec(d.from, [4, 6, 8], 'transform.from');
  expectVec(d.to, [10, 6, 8], 'transform.to');

  const scaled = source.scale([2, 3, 4]);
  d = oneDim(scaled, 'scale');
  expectVec(d.from, [2, 6, 12], 'scale.from');
  expectVec(d.to, [14, 6, 12], 'scale.to');

  const mirrored = source.mirror([1, 0, 0]);
  d = oneDim(mirrored, 'mirror');
  expectVec(d.from, [-1, 2, 3], 'mirror.from');
  expectVec(d.to, [-7, 2, 3], 'mirror.to');

  const rotated = source.rotate(0, 0, 90);
  d = oneDim(rotated, 'rotate');
  expect(close(d.from[0], -2) && close(d.from[1], 1), `rotate.from unexpected: [${d.from.join(', ')}]`);
  expect(close(d.to[0], -2) && close(d.to[1], 7), `rotate.to unexpected: [${d.to.join(', ')}]`);

  const around = source.rotateAround([0, 0, 1], 90, [0, 0, 0]);
  d = oneDim(around, 'rotateAround');
  expect(close(d.from[0], -2) && close(d.from[1], 1), `rotateAround.from unexpected: [${d.from.join(', ')}]`);
  expect(close(d.to[0], -2) && close(d.to[1], 7), `rotateAround.to unexpected: [${d.to.join(', ')}]`);
}

function checkCopyLikeOps(): void {
  const source = seedShape('copy');
  expect(getShapeDimensions(source.color('#224466')).length === 1, 'color should preserve dimensions');
  expect(getShapeDimensions(source.setColor('#112233')).length === 1, 'setColor should preserve dimensions');
  expect(getShapeDimensions(source.clone()).length === 1, 'clone should preserve dimensions');
  expect(getShapeDimensions(source.trimByPlane([0, 0, 1], 0)).length === 1, 'trimByPlane should preserve dimensions');
}

function checkBooleanPropagation(): void {
  const a = seedShape('bool-a');
  const b = seedShape('bool-b').translate(4, 0, 0);

  expect(getShapeDimensions(a.add(b)).length === 2, 'Shape.add should merge dimensions');
  expect(getShapeDimensions(a.subtract(b)).length === 1, 'Shape.subtract should keep base dimensions');
  expect(getShapeDimensions(a.intersect(b)).length === 2, 'Shape.intersect should merge dimensions');

  expect(getShapeDimensions(union(a, b)).length === 2, 'union() should merge dimensions');
  expect(getShapeDimensions(difference(a, b)).length === 1, 'difference() should keep base dimensions');
  expect(getShapeDimensions(intersection(a, b)).length === 2, 'intersection() should merge dimensions');
  const split = a.splitByPlane([1, 0, 0], 0);
  expect(getShapeDimensions(split[0]).length === 1, 'splitByPlane[0] should keep base dimensions');
  expect(getShapeDimensions(split[1]).length === 1, 'splitByPlane[1] should keep base dimensions');
}

function checkImportRuntimePropagation(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const p = importPart("child.forge.js").color("#222").translate(10, 0, 0);
return p;
`,
    'child.forge.js': `
const part = box(20, 10, 5, true).color("#555");
dim([1, 2, 3], [7, 2, 3], { label: "Imported" });
return part;
`,
  };

  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  expect(!result.error, `runScript failed: ${result.error}`);
  expect(result.dimensions.length === 1, `import runtime should keep 1 dim, got ${result.dimensions.length}`);
  const d = result.dimensions[0] as Dim;
  expectVec(d.from, [11, 2, 3], 'import runtime translated from');
  expectVec(d.to, [17, 2, 3], 'import runtime translated to');
}

function checkGroupedExplicitOwnership(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const panel = group({ name: "Panel", shape: box(40, 20, 5) });
dim([0, 0, 0], [40, 0, 0], { component: "Panel" });
const asm = assembly("Case").addPart("Base Assembly", panel);
return asm.solve().toScene();
`,
  };

  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  expect(!result.error, `grouped ownership runScript failed: ${result.error}`);
  expect(result.dimensions.length === 1, `grouped ownership should keep 1 dim, got ${result.dimensions.length}`);

  const objects = result.objects
    .filter((obj): obj is typeof obj & { shape: Shape } => !!obj.shape)
    .map((obj) => ({
      id: obj.id,
      name: obj.name,
      bbox: obj.shape.boundingBox() as { min: [number, number, number]; max: [number, number, number] },
    }));

  const owners = mapDimensionsToOwnerIds(result.dimensions, objects).get(result.dimensions[0].id) || [];
  expect(owners.length === 1, `grouped explicit component should resolve to exactly 1 owner, got ${owners.length}`);

  const ownerName = result.objects.find((obj) => obj.id === owners[0])?.name;
  expect(ownerName === 'Base Assembly.Panel', `expected grouped owner "Base Assembly.Panel", got "${ownerName}"`);
}

function checkAmbiguousGroupedExplicitOwnership(): void {
  const files: Record<string, string> = {
    'main.forge.js': `
const panel = () => group({ name: "Panel", shape: box(40, 20, 5) });
dim([0, 0, 0], [40, 0, 0], { component: "Panel" });
const asm = assembly("Case")
  .addPart("Base Assembly", panel())
  .addPart("Lid Assembly", panel().translate(0, 40, 0));
return asm.solve().toScene();
`,
  };

  const result = runScript(files['main.forge.js'], 'main.forge.js', files);
  expect(!result.error, `ambiguous grouped ownership runScript failed: ${result.error}`);
  expect(result.dimensions.length === 1, `ambiguous grouped ownership should keep 1 dim, got ${result.dimensions.length}`);

  const objects = result.objects
    .filter((obj): obj is typeof obj & { shape: Shape } => !!obj.shape)
    .map((obj) => ({
      id: obj.id,
      name: obj.name,
      bbox: obj.shape.boundingBox() as { min: [number, number, number]; max: [number, number, number] },
    }));

  const owners = mapDimensionsToOwnerIds(result.dimensions, objects).get(result.dimensions[0].id) || [];
  expect(owners.length === 0, `ambiguous grouped explicit component should stay unowned, got ${owners.length}`);
}

export async function runCheckDimensionsCli(): Promise<void> {
  await initKernel();
  checkTransformPropagation();
  checkCopyLikeOps();
  checkBooleanPropagation();
  checkImportRuntimePropagation();
  checkGroupedExplicitOwnership();
  checkAmbiguousGroupedExplicitOwnership();
  console.log('✓ Dimension propagation invariants passed');
}

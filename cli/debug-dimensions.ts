#!/usr/bin/env node
/**
 * Debug helper: inspect dimension annotations for a script.
 *
 * Usage:
 *   npx tsx cli/debug-dimensions.ts <script.forge.js> [--all] [--dim-angle-tol 12]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { init, runScript } from '../src/forge/headless';
import { mapDimensionsToOwnerIds } from '../src/forge/reportDimensionOwnership';
import type { SceneObject } from '../src/forge/runner';
import type { DimensionDef } from '../src/forge/sketch/dimensions';
import { collectProjectFiles } from './collect-files';

type Vec3 = [number, number, number];
type ReportViewId = 'front' | 'right' | 'top' | 'iso';
type ShapeObject = SceneObject & { shape: NonNullable<SceneObject['shape']> };
type ShapeObjectWithBounds = ShapeObject & { bb: { min: number[]; max: number[] } };
type ViewFrame = { id: ReportViewId; right: Vec3; up: Vec3; forward: Vec3 };
type DimensionOwnership = {
  combinedCount: number;
  byDimensionId: Map<string, string[]>;
};

const VIEW_IDS: ReportViewId[] = ['front', 'right', 'top', 'iso'];

function inBounds(p: Vec3, min: number[], max: number[], pad = 1e-4): boolean {
  return (
    p[0] >= min[0] - pad &&
    p[0] <= max[0] + pad &&
    p[1] >= min[1] - pad &&
    p[1] <= max[1] + pad &&
    p[2] >= min[2] - pad &&
    p[2] <= max[2] + pad
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function mul(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function makeViewFrame(view: ReportViewId): ViewFrame {
  const cfg: Record<ReportViewId, { camDir: Vec3; up: Vec3 }> = {
    front: { camDir: [0, -1, 0], up: [0, 0, 1] },
    right: { camDir: [1, 0, 0], up: [0, 0, 1] },
    top: { camDir: [0, 0, 1], up: [0, 1, 0] },
    iso: { camDir: [1, -1, 1], up: [0, 0, 1] },
  };
  const c = cfg[view];
  const forward = norm(mul(c.camDir, -1));
  const right = norm(cross(forward, c.up));
  const up = norm(cross(right, forward));
  return { id: view, right, up, forward };
}

function isDimensionVisibleInView(dim: DimensionDef, frame: ViewFrame, toleranceDeg: number): boolean {
  const dir = sub(dim.to, dim.from);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len < 1e-9) return false;
  const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  const alignRight = clamp(Math.abs(dot(d, frame.right)), 0, 1);
  const alignUp = clamp(Math.abs(dot(d, frame.up)), 0, 1);
  const angleRight = (Math.acos(alignRight) * 180) / Math.PI;
  const angleUp = (Math.acos(alignUp) * 180) / Math.PI;
  const minAngle = Math.min(angleRight, angleUp);
  return minAngle <= toleranceDeg;
}

function mapDimensionsToOwners(dimensions: DimensionDef[], objects: ShapeObjectWithBounds[]): DimensionOwnership {
  const byDimensionId = mapDimensionsToOwnerIds(
    dimensions,
    objects.map((obj) => ({ id: obj.id, name: obj.name, bbox: obj.bb as { min: Vec3; max: Vec3 } })),
  );
  let combinedCount = 0;

  dimensions.forEach((dim) => {
    if ((byDimensionId.get(dim.id) || []).length !== 1) combinedCount += 1;
  });

  return { combinedCount, byDimensionId };
}

function usage(): never {
  console.error('Usage: forgecad debug dimensions <script.forge.js> [--all] [--dim-angle-tol 12]');
  process.exit(1);
}

export async function runDebugDimensionsCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = argv[0];
  if (!scriptPath) usage();

  const showAll = argv.includes('--all');
  const tolFlagIndex = argv.indexOf('--dim-angle-tol');
  const tolValue = tolFlagIndex >= 0 ? Number(argv[tolFlagIndex + 1]) : NaN;
  const dimAngleTolDeg = Number.isFinite(tolValue) ? Math.max(0, tolValue) : 12;

  const abs = resolve(scriptPath);
  const code = readFileSync(abs, 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(abs);

  await init();
  const result = runScript(code, fileName, allFiles);
  if (result.error) {
    console.error('ERROR:', result.error);
    process.exit(1);
  }

  const objects = result.objects.filter((o): o is ShapeObject => !!o.shape);
  const objectBounds: ShapeObjectWithBounds[] = objects.map((obj) => ({
    ...obj,
    bb: obj.shape.boundingBox() as { min: number[]; max: number[] },
  }));
  const dims = result.dimensions;
  const viewFrames = new Map<ReportViewId, ViewFrame>(VIEW_IDS.map((id) => [id, makeViewFrame(id)]));
  const ownership = mapDimensionsToOwners(dims, objectBounds);
  const idToName = new Map(objects.map((obj) => [obj.id, obj.name]));

  console.log(`Objects: ${objects.length}`);
  console.log(`Dimensions: ${dims.length}`);
  console.log(`View routing tolerance: ${dimAngleTolDeg.toFixed(1)}deg`);
  console.log(`Combined-page dimensions: ${ownership.combinedCount}`);

  if (objectBounds.length > 0) {
    console.log('\nPer-object approximate ownership (both endpoints inside bbox):');
    for (const obj of objectBounds) {
      const count = dims.filter((d) => inBounds(d.from, obj.bb.min, obj.bb.max) && inBounds(d.to, obj.bb.min, obj.bb.max)).length;
      console.log(`  ${obj.name}: ${count}`);
    }
  }

  if (dims.length > 0) {
    const viewCounts = new Map<ReportViewId, number>(VIEW_IDS.map((id) => [id, 0]));
    dims.forEach((dim) => {
      VIEW_IDS.forEach((viewId) => {
        const frame = viewFrames.get(viewId);
        if (frame && isDimensionVisibleInView(dim, frame, dimAngleTolDeg)) {
          viewCounts.set(viewId, (viewCounts.get(viewId) || 0) + 1);
        }
      });
    });
    console.log('\nPer-view visibility:');
    VIEW_IDS.forEach((viewId) => {
      console.log(`  ${viewId}: ${viewCounts.get(viewId) || 0}`);
    });
  }

  const list = showAll ? dims : dims.slice(0, 20);
  if (list.length > 0) {
    console.log(`\nDimension list${showAll ? '' : ' (first 20)'}:`);
    for (const d of list) {
      const label = d.label || d.id;
      const visibleViews = VIEW_IDS.filter((viewId) => {
        const frame = viewFrames.get(viewId);
        return !!frame && isDimensionVisibleInView(d, frame, dimAngleTolDeg);
      });
      const ownerIds = ownership.byDimensionId.get(d.id) || [];
      const ownershipLabel = ownerIds.length === 1 ? `component:${idToName.get(ownerIds[0]) || ownerIds[0]}` : 'combined';
      const explicit = d.components && d.components.length > 0 ? ` explicit=[${d.components.join(', ')}]` : '';
      console.log(
        `  ${label}: [${d.from.join(', ')}] -> [${d.to.join(', ')}], offset=${d.offset}, views=[${visibleViews.join(', ')}], report=${ownershipLabel}${explicit}`,
      );
    }
  }
}

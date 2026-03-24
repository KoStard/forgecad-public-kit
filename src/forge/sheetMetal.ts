import './holeCut';

import { createOwnedShapeCompilePlan } from './compilePlan';
import { buildShapeFromCompilePlan, type GeometryInfo, type Shape } from './kernel';
import {
  cloneSheetMetalModel,
  deriveSheetMetalModel,
  isSheetMetalPlanarRegionName,
  type SheetMetalEdge,
  type SheetMetalModel,
  type SheetMetalOutput,
  type SheetMetalPlanarRegionName,
  type SheetMetalRegionName,
  sheetMetalPlanarRegionNames,
  validateSheetMetalModel,
} from './sheetMetalModel';
import { type Anchor, getSketchCompileProfilePlan, getSketchPlacementModel, type Sketch } from './sketch/core';

export type {
  SheetMetalEdge,
  SheetMetalModel,
  SheetMetalOutput,
  SheetMetalPlanarRegionName,
  SheetMetalRegionName,
} from './sheetMetalModel';

export interface SheetMetalOptions {
  panel: {
    width: number;
    height: number;
  };
  thickness: number;
  bendRadius: number;
  bendAllowance: {
    kFactor: number;
  };
  cornerRelief?: {
    kind?: 'rect';
    size: number;
  };
}

export interface SheetMetalFlangeOptions {
  length: number;
  angleDeg?: number;
}

export interface SheetMetalCutoutOptions {
  u?: number;
  v?: number;
  selfAnchor?: Anchor;
}

interface SheetMetalCutoutOp {
  region: SheetMetalPlanarRegionName;
  sketch: Sketch;
  u: number;
  v: number;
  selfAnchor: Anchor;
}

const SHEET_METAL_GEOMETRY_INFO: Partial<GeometryInfo> = {
  fidelity: 'kernel-native',
  topology: 'synthetic',
  sources: ['sheet-metal'],
};

function normalizeCornerRelief(options: SheetMetalOptions): SheetMetalModel['cornerRelief'] {
  const defaultSize = options.bendRadius + options.thickness;
  return {
    kind: options.cornerRelief?.kind ?? 'rect',
    size: options.cornerRelief?.size ?? defaultSize,
  };
}

function normalizeSheetMetalModel(options: SheetMetalOptions): SheetMetalModel {
  return {
    panel: {
      width: options.panel.width,
      height: options.panel.height,
    },
    thickness: options.thickness,
    bendRadius: options.bendRadius,
    bendAllowance: {
      kind: 'k-factor',
      kFactor: options.bendAllowance.kFactor,
    },
    cornerRelief: normalizeCornerRelief(options),
    flanges: [],
  };
}

function regionLabel(region: SheetMetalPlanarRegionName): string {
  return region === 'panel' ? 'panel' : `"${region}"`;
}

function _regionEdge(region: SheetMetalPlanarRegionName): SheetMetalEdge | null {
  if (region === 'panel') return null;
  return region.slice('flange-'.length) as SheetMetalEdge;
}

function cloneCutout(op: SheetMetalCutoutOp): SheetMetalCutoutOp {
  return {
    region: op.region,
    sketch: op.sketch.clone(),
    u: op.u,
    v: op.v,
    selfAnchor: op.selfAnchor,
  };
}

function ensureUnplacedSketch(sketch: Sketch): void {
  if (getSketchPlacementModel(sketch) != null) {
    throw new Error('SheetMetalPart.cutout() expects an unplaced 2D sketch. Pass the profile before calling onFace(...).');
  }
  if (!getSketchCompileProfilePlan(sketch)) {
    throw new Error('SheetMetalPart.cutout() requires a compile-covered sketch profile.');
  }
}

function buildBaseSheetMetalShape(model: SheetMetalModel, output: SheetMetalOutput): Shape {
  const plan = createOwnedShapeCompilePlan(
    {
      kind: 'sheetMetal',
      model: cloneSheetMetalModel(model)!,
      output,
    },
    `sheet-metal:${output}`,
  );

  if (!plan) {
    throw new Error('sheetMetal() could not build the compiler-owned base plan.');
  }

  return buildShapeFromCompilePlan(plan, undefined, SHEET_METAL_GEOMETRY_INFO);
}

function assertSupportedRegion(model: SheetMetalModel, region: SheetMetalPlanarRegionName): void {
  const supported = new Set(sheetMetalPlanarRegionNames(model));
  if (supported.has(region)) return;
  if (region === 'panel') return;
  throw new Error(
    `SheetMetalPart.cutout() cannot target ${regionLabel(region)} because that flange has not been added. Supported planar regions: ${Array.from(supported).join(', ')}`,
  );
}

export class SheetMetalPart {
  private readonly model: SheetMetalModel;
  private readonly cutouts: SheetMetalCutoutOp[];

  constructor(model: SheetMetalModel, cutouts: readonly SheetMetalCutoutOp[] = []) {
    this.model = cloneSheetMetalModel(model)!;
    this.cutouts = cutouts.map(cloneCutout);
  }

  flange(edge: SheetMetalEdge, options: SheetMetalFlangeOptions): SheetMetalPart {
    const next = cloneSheetMetalModel(this.model)!;
    const existing = next.flanges.find((flange) => flange.edge === edge);
    if (existing) {
      throw new Error(`${edge} flange is already defined on this SheetMetalPart.`);
    }

    next.flanges.push({
      edge,
      length: options.length,
      angleDeg: options.angleDeg ?? 90,
    });

    const issue = validateSheetMetalModel(next);
    if (issue) throw new Error(issue);
    deriveSheetMetalModel(next);
    return new SheetMetalPart(next, this.cutouts);
  }

  cutout(region: SheetMetalPlanarRegionName, sketch: Sketch, options: SheetMetalCutoutOptions = {}): SheetMetalPart {
    if (!isSheetMetalPlanarRegionName(region)) {
      throw new Error(`SheetMetalPart.cutout() does not support region "${String(region)}".`);
    }
    assertSupportedRegion(this.model, region);
    ensureUnplacedSketch(sketch);

    return new SheetMetalPart(this.model, [
      ...this.cutouts,
      {
        region,
        sketch: sketch.clone(),
        u: options.u ?? 0,
        v: options.v ?? 0,
        selfAnchor: options.selfAnchor ?? 'center',
      },
    ]);
  }

  regionNames(): SheetMetalRegionName[] {
    return [
      'panel',
      ...Array.from(
        new Set(
          this.model.flanges.flatMap((flange) => [
            `bend-${flange.edge}` as SheetMetalRegionName,
            `flange-${flange.edge}` as SheetMetalRegionName,
          ]),
        ),
      ),
    ];
  }

  folded(): Shape {
    return this.buildOutput('folded');
  }

  flatPattern(): Shape {
    return this.buildOutput('flat');
  }

  private buildOutput(output: SheetMetalOutput): Shape {
    const issue = validateSheetMetalModel(this.model);
    if (issue) throw new Error(issue);
    deriveSheetMetalModel(this.model);

    let shape = buildBaseSheetMetalShape(this.model, output);
    for (const cutout of this.cutouts) {
      const placed = cutout.sketch.onFace(shape, cutout.region, {
        u: cutout.u,
        v: cutout.v,
        selfAnchor: cutout.selfAnchor,
      });
      shape = shape.cutout(placed);
    }
    return shape;
  }
}

export function sheetMetal(options: SheetMetalOptions): SheetMetalPart {
  const model = normalizeSheetMetalModel(options);
  const issue = validateSheetMetalModel(model);
  if (issue) throw new Error(issue);
  deriveSheetMetalModel(model);
  return new SheetMetalPart(model);
}

export function isSheetMetalPart(value: unknown): value is SheetMetalPart {
  return value instanceof SheetMetalPart;
}

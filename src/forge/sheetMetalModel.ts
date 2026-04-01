import {
  appendProfileCompileTransform,
  appendShapeCompileTransform,
  buildBooleanProfileCompilePlan,
  buildBooleanShapeCompilePlan,
  cloneShapeCompilePlan,
  type ProfileCompilePlan,
  type ShapeCompilePlan,
} from './compilePlan';
import type { SketchPlacementModel } from './sketch/workplaneModel';
import type { Mat4, Vec3 } from './transform';

export const SHEET_METAL_EDGES = ['top', 'right', 'bottom', 'left'] as const;

export type SheetMetalEdge = (typeof SHEET_METAL_EDGES)[number];
export type SheetMetalPlanarRegionName = 'panel' | `flange-${SheetMetalEdge}`;
export type SheetMetalRegionName = SheetMetalPlanarRegionName | `bend-${SheetMetalEdge}`;
export type SheetMetalOutput = 'folded' | 'flat';

export interface SheetMetalBendAllowance {
  kind: 'k-factor';
  kFactor: number;
}

export interface SheetMetalPanelSpec {
  width: number;
  height: number;
}

export interface SheetMetalFlangeSpec {
  edge: SheetMetalEdge;
  length: number;
  angleDeg: number;
}

export interface SheetMetalCornerReliefSpec {
  kind: 'rect';
  size: number;
}

export interface SheetMetalModel {
  panel: SheetMetalPanelSpec;
  thickness: number;
  bendRadius: number;
  bendAllowance: SheetMetalBendAllowance;
  cornerRelief: SheetMetalCornerReliefSpec;
  flanges: SheetMetalFlangeSpec[];
}

export interface SheetMetalFaceDescriptor {
  name: SheetMetalRegionName;
  center: [number, number, number];
  normal: [number, number, number];
  planar: boolean;
  uAxis?: [number, number, number];
  vAxis?: [number, number, number];
  semantic: 'face' | 'region' | 'set';
  memberNames: string[];
  coplanar: boolean;
}

export interface SheetMetalDerivedEdge {
  edge: SheetMetalEdge;
  length: number;
  angleDeg: number;
  bendAllowance: number;
  trimStart: number;
  trimEnd: number;
  span: number;
  centerAlongEdge: number;
}

export interface SheetMetalDerivedModel {
  panelWidth: number;
  panelHeight: number;
  thickness: number;
  bendRadius: number;
  kFactor: number;
  bendAllowance: number;
  reliefSize: number;
  flanges: Map<SheetMetalEdge, SheetMetalDerivedEdge>;
}

const EPS = 1e-9;

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function cloneVec3(vec: [number, number, number]): [number, number, number] {
  return [vec[0], vec[1], vec[2]];
}

function cloneFaceAxis(vec: [number, number, number] | undefined): [number, number, number] | undefined {
  return vec ? cloneVec3(vec) : undefined;
}

export function cloneSheetMetalModel(model: SheetMetalModel | null): SheetMetalModel | null {
  if (!model) return null;
  return {
    panel: {
      width: model.panel.width,
      height: model.panel.height,
    },
    thickness: model.thickness,
    bendRadius: model.bendRadius,
    bendAllowance: {
      kind: model.bendAllowance.kind,
      kFactor: model.bendAllowance.kFactor,
    },
    cornerRelief: {
      kind: model.cornerRelief.kind,
      size: model.cornerRelief.size,
    },
    flanges: model.flanges.map((flange) => ({
      edge: flange.edge,
      length: flange.length,
      angleDeg: flange.angleDeg,
    })),
  };
}

function edgeDisplayName(edge: SheetMetalEdge): string {
  return `sheetMetal().flange("${edge}", ...)`;
}

function baseQueryFaceName(region: SheetMetalRegionName): string {
  return region;
}

function normalizeAngle(angleDeg: number): number {
  return Math.abs(angleDeg) <= EPS ? 0 : angleDeg;
}

export function validateSheetMetalModel(model: SheetMetalModel): string | null {
  if (!isFinitePositive(model.panel.width) || !isFinitePositive(model.panel.height)) {
    return 'sheetMetal() requires a positive finite panel width and height.';
  }
  if (!isFinitePositive(model.thickness)) {
    return 'sheetMetal() requires a positive finite sheet thickness.';
  }
  if (!isFiniteNonNegative(model.bendRadius)) {
    return 'sheetMetal() requires a finite non-negative bendRadius.';
  }
  if (model.bendRadius <= EPS) {
    return 'sheetMetal() v1 requires a positive bendRadius so the bend region stays explicit instead of collapsing into a sharp fold.';
  }
  if (model.bendAllowance.kind !== 'k-factor') {
    return `sheetMetal() does not support bend allowance model "${model.bendAllowance.kind}" yet.`;
  }
  if (!Number.isFinite(model.bendAllowance.kFactor) || model.bendAllowance.kFactor <= 0 || model.bendAllowance.kFactor >= 1) {
    return 'sheetMetal() k-factor must be a finite value between 0 and 1.';
  }
  if (model.cornerRelief.kind !== 'rect') {
    return `sheetMetal() does not support corner relief "${model.cornerRelief.kind}" yet.`;
  }
  if (!isFiniteNonNegative(model.cornerRelief.size)) {
    return 'sheetMetal() corner relief size must be a finite non-negative value.';
  }

  const seenEdges = new Set<SheetMetalEdge>();
  for (const flange of model.flanges) {
    if (!SHEET_METAL_EDGES.includes(flange.edge)) {
      return `sheetMetal() does not recognize flange edge "${String(flange.edge)}".`;
    }
    if (seenEdges.has(flange.edge)) {
      return `${edgeDisplayName(flange.edge)} can only be declared once.`;
    }
    seenEdges.add(flange.edge);
    if (!isFinitePositive(flange.length)) {
      return `${edgeDisplayName(flange.edge)} requires a positive finite length.`;
    }
    if (!Number.isFinite(flange.angleDeg) || Math.abs(normalizeAngle(flange.angleDeg) - 90) > 1e-6) {
      return `${edgeDisplayName(flange.edge)} v1 only supports 90 degree flanges.`;
    }
  }

  return null;
}

function buildFlangeMap(model: SheetMetalModel): Map<SheetMetalEdge, SheetMetalFlangeSpec> {
  return new Map(model.flanges.map((flange) => [flange.edge, flange]));
}

function adjacentEdges(edge: SheetMetalEdge): { start: SheetMetalEdge; end: SheetMetalEdge } {
  switch (edge) {
    case 'top':
      return { start: 'left', end: 'right' };
    case 'right':
      return { start: 'bottom', end: 'top' };
    case 'bottom':
      return { start: 'left', end: 'right' };
    case 'left':
      return { start: 'bottom', end: 'top' };
  }
}

export function deriveSheetMetalModel(model: SheetMetalModel): SheetMetalDerivedModel {
  const issue = validateSheetMetalModel(model);
  if (issue) throw new Error(issue);

  const flanges = buildFlangeMap(model);
  const bendAllowance = (Math.PI / 2) * (model.bendRadius + model.bendAllowance.kFactor * model.thickness);
  const derivedFlanges = new Map<SheetMetalEdge, SheetMetalDerivedEdge>();

  for (const edge of SHEET_METAL_EDGES) {
    const flange = flanges.get(edge);
    if (!flange) continue;
    const adjacent = adjacentEdges(edge);
    const trimStart = flanges.has(adjacent.start) ? model.cornerRelief.size : 0;
    const trimEnd = flanges.has(adjacent.end) ? model.cornerRelief.size : 0;
    const fullLength = edge === 'top' || edge === 'bottom' ? model.panel.width : model.panel.height;
    const span = fullLength - trimStart - trimEnd;
    if (!(span > EPS)) {
      throw new Error(
        `${edgeDisplayName(edge)} loses all usable span after applying the defended rectangular corner relief size ${model.cornerRelief.size}.`,
      );
    }
    derivedFlanges.set(edge, {
      edge,
      length: flange.length,
      angleDeg: flange.angleDeg,
      bendAllowance,
      trimStart,
      trimEnd,
      span,
      centerAlongEdge: (trimStart - trimEnd) / 2,
    });
  }

  return {
    panelWidth: model.panel.width,
    panelHeight: model.panel.height,
    thickness: model.thickness,
    bendRadius: model.bendRadius,
    kFactor: model.bendAllowance.kFactor,
    bendAllowance,
    reliefSize: model.cornerRelief.size,
    flanges: derivedFlanges,
  };
}

export function sheetMetalRegionNames(model: SheetMetalModel): SheetMetalRegionName[] {
  const names: SheetMetalRegionName[] = ['panel'];
  const derived = deriveSheetMetalModel(model);
  for (const edge of SHEET_METAL_EDGES) {
    if (!derived.flanges.has(edge)) continue;
    names.push(`bend-${edge}`, `flange-${edge}`);
  }
  return names;
}

export function sheetMetalPlanarRegionNames(model: SheetMetalModel): SheetMetalPlanarRegionName[] {
  return sheetMetalRegionNames(model).filter((name): name is SheetMetalPlanarRegionName => name === 'panel' || name.startsWith('flange-'));
}

export function isSheetMetalPlanarRegionName(name: string): name is SheetMetalPlanarRegionName {
  return name === 'panel' || name === 'flange-top' || name === 'flange-right' || name === 'flange-bottom' || name === 'flange-left';
}

function transformPlacement(origin: Vec3, u: Vec3, v: Vec3, normal: Vec3): SketchPlacementModel {
  return {
    workplane: {
      origin: [origin[0], origin[1], origin[2]],
      u: [u[0], u[1], u[2]],
      v: [v[0], v[1], v[2]],
      normal: [normal[0], normal[1], normal[2]],
      source: { kind: 'face-ref', faceName: 'sheet-metal-placement' },
    },
    u: 0,
    v: 0,
    protrude: 0,
    selfAnchor: 'center',
  };
}

function translatePlan(plan: ShapeCompilePlan, x: number, y: number, z: number): ShapeCompilePlan {
  if (Math.abs(x) <= EPS && Math.abs(y) <= EPS && Math.abs(z) <= EPS) return cloneShapeCompilePlan(plan)!;
  return appendShapeCompileTransform(cloneShapeCompilePlan(plan)!, {
    kind: 'translate',
    x,
    y,
    z,
  })!;
}

function workplanePlacedPlan(plan: ShapeCompilePlan, origin: Vec3, u: Vec3, v: Vec3, normal: Vec3): ShapeCompilePlan {
  const placement = transformPlacement(origin, u, v, normal);
  const matrix: Mat4 = [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, normal[0], normal[1], normal[2], 0, origin[0], origin[1], origin[2], 1];
  return appendShapeCompileTransform(cloneShapeCompilePlan(plan)!, {
    kind: 'workplanePlacement',
    matrix,
    placement,
  })!;
}

function centeredBox(x: number, y: number, z: number, tx = 0, ty = 0, tz = 0): ShapeCompilePlan {
  return translatePlan({ kind: 'box', x, y, z, center: true }, tx, ty, tz);
}

function bendSectorProfile(radius: number, thickness: number): ProfileCompilePlan | null {
  const outerRadius = radius + thickness;
  const outer = appendProfileCompileTransform(
    { kind: 'circle', radius: outerRadius, transforms: [] },
    { kind: 'translate', x: 0, y: radius },
  );
  const inner = appendProfileCompileTransform({ kind: 'circle', radius, transforms: [] }, { kind: 'translate', x: 0, y: radius });
  const annulus = buildBooleanProfileCompilePlan('difference', [outer, inner]);
  const clip = appendProfileCompileTransform(
    { kind: 'rect', width: outerRadius, height: outerRadius, center: false, transforms: [] },
    { kind: 'translate', x: 0, y: -thickness },
  );
  return buildBooleanProfileCompilePlan('intersection', [annulus, clip]);
}

function foldedPanelPlan(derived: SheetMetalDerivedModel): ShapeCompilePlan {
  return { kind: 'box', x: derived.panelWidth, y: derived.panelHeight, z: derived.thickness, center: true };
}

function foldedFlangePlan(derived: SheetMetalDerivedModel, flange: SheetMetalDerivedEdge): ShapeCompilePlan {
  const t = derived.thickness;
  const r = derived.bendRadius;
  const length = flange.length;

  switch (flange.edge) {
    case 'top':
      return centeredBox(flange.span, t, length, flange.centerAlongEdge, derived.panelHeight / 2 + r + t / 2, -t / 2 - r - length / 2);
    case 'bottom':
      return centeredBox(flange.span, t, length, flange.centerAlongEdge, -derived.panelHeight / 2 - r - t / 2, -t / 2 - r - length / 2);
    case 'right':
      return centeredBox(t, flange.span, length, derived.panelWidth / 2 + r + t / 2, flange.centerAlongEdge, -t / 2 - r - length / 2);
    case 'left':
      return centeredBox(t, flange.span, length, -derived.panelWidth / 2 - r - t / 2, flange.centerAlongEdge, -t / 2 - r - length / 2);
  }
}

function foldedBendPlan(derived: SheetMetalDerivedModel, flange: SheetMetalDerivedEdge): ShapeCompilePlan | null {
  const sector = bendSectorProfile(derived.bendRadius, derived.thickness);
  if (!sector) return null;
  const local = {
    kind: 'extrude' as const,
    profile: sector,
    height: flange.span,
    center: false,
  };

  switch (flange.edge) {
    case 'top':
      return workplanePlacedPlan(
        local,
        [-derived.panelWidth / 2 + flange.trimStart, derived.panelHeight / 2, -derived.thickness / 2],
        [0, 1, 0],
        [0, 0, -1],
        [1, 0, 0],
      );
    case 'bottom':
      return workplanePlacedPlan(
        local,
        [-derived.panelWidth / 2 + flange.trimStart, -derived.panelHeight / 2, -derived.thickness / 2],
        [0, -1, 0],
        [0, 0, -1],
        [1, 0, 0],
      );
    case 'right':
      return workplanePlacedPlan(
        local,
        [derived.panelWidth / 2, -derived.panelHeight / 2 + flange.trimStart, -derived.thickness / 2],
        [1, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
      );
    case 'left':
      return workplanePlacedPlan(
        local,
        [-derived.panelWidth / 2, -derived.panelHeight / 2 + flange.trimStart, -derived.thickness / 2],
        [-1, 0, 0],
        [0, 0, -1],
        [0, 1, 0],
      );
  }
}

function flatBendPlan(derived: SheetMetalDerivedModel, flange: SheetMetalDerivedEdge): ShapeCompilePlan {
  const t = derived.thickness;
  const ba = flange.bendAllowance;
  switch (flange.edge) {
    case 'top':
      return centeredBox(flange.span, ba, t, flange.centerAlongEdge, derived.panelHeight / 2 + ba / 2, 0);
    case 'bottom':
      return centeredBox(flange.span, ba, t, flange.centerAlongEdge, -derived.panelHeight / 2 - ba / 2, 0);
    case 'right':
      return centeredBox(ba, flange.span, t, derived.panelWidth / 2 + ba / 2, flange.centerAlongEdge, 0);
    case 'left':
      return centeredBox(ba, flange.span, t, -derived.panelWidth / 2 - ba / 2, flange.centerAlongEdge, 0);
  }
}

function flatFlangePlan(derived: SheetMetalDerivedModel, flange: SheetMetalDerivedEdge): ShapeCompilePlan {
  const t = derived.thickness;
  const ba = flange.bendAllowance;
  const length = flange.length;
  switch (flange.edge) {
    case 'top':
      return centeredBox(flange.span, length, t, flange.centerAlongEdge, derived.panelHeight / 2 + ba + length / 2, 0);
    case 'bottom':
      return centeredBox(flange.span, length, t, flange.centerAlongEdge, -derived.panelHeight / 2 - ba - length / 2, 0);
    case 'right':
      return centeredBox(length, flange.span, t, derived.panelWidth / 2 + ba + length / 2, flange.centerAlongEdge, 0);
    case 'left':
      return centeredBox(length, flange.span, t, -derived.panelWidth / 2 - ba - length / 2, flange.centerAlongEdge, 0);
  }
}

export function lowerSheetMetalBasePlan(model: SheetMetalModel, output: SheetMetalOutput): ShapeCompilePlan {
  const derived = deriveSheetMetalModel(model);
  const pieces: ShapeCompilePlan[] = [foldedPanelPlan(derived)];

  for (const edge of SHEET_METAL_EDGES) {
    const flange = derived.flanges.get(edge);
    if (!flange) continue;
    if (output === 'folded') {
      const bend = foldedBendPlan(derived, flange);
      if (bend) pieces.push(bend);
      pieces.push(foldedFlangePlan(derived, flange));
      continue;
    }
    pieces.push(flatBendPlan(derived, flange));
    pieces.push(flatFlangePlan(derived, flange));
  }

  return pieces.length === 1 ? pieces[0] : buildBooleanShapeCompilePlan('union', pieces)!;
}

function descriptor(
  name: SheetMetalRegionName,
  center: [number, number, number],
  normal: [number, number, number],
  planar: boolean,
  uAxis?: [number, number, number],
  vAxis?: [number, number, number],
  semantic: 'face' | 'region' | 'set' = 'face',
  memberNames: string[] = [name],
  coplanar = planar,
): SheetMetalFaceDescriptor {
  return {
    name,
    center: cloneVec3(center),
    normal: cloneVec3(normal),
    planar,
    uAxis: cloneFaceAxis(uAxis),
    vAxis: cloneFaceAxis(vAxis),
    semantic,
    memberNames: [...memberNames],
    coplanar,
  };
}

function foldedBendDescriptor(derived: SheetMetalDerivedModel, flange: SheetMetalDerivedEdge): SheetMetalFaceDescriptor {
  const t = derived.thickness;
  const r = derived.bendRadius;
  const midRadius = r + t / 2;
  const radial = midRadius / Math.sqrt(2);

  switch (flange.edge) {
    case 'top':
      return descriptor(
        'bend-top',
        [flange.centerAlongEdge, derived.panelHeight / 2 + radial, -derived.thickness / 2 - r + radial],
        [0, 1 / Math.sqrt(2), 1 / Math.sqrt(2)],
        false,
        undefined,
        undefined,
        'set',
        ['bend-top-inner', 'bend-top-outer'],
        false,
      );
    case 'bottom':
      return descriptor(
        'bend-bottom',
        [flange.centerAlongEdge, -derived.panelHeight / 2 - radial, -derived.thickness / 2 - r + radial],
        [0, -1 / Math.sqrt(2), 1 / Math.sqrt(2)],
        false,
        undefined,
        undefined,
        'set',
        ['bend-bottom-inner', 'bend-bottom-outer'],
        false,
      );
    case 'right':
      return descriptor(
        'bend-right',
        [derived.panelWidth / 2 + radial, flange.centerAlongEdge, -derived.thickness / 2 - r + radial],
        [1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)],
        false,
        undefined,
        undefined,
        'set',
        ['bend-right-inner', 'bend-right-outer'],
        false,
      );
    case 'left':
      return descriptor(
        'bend-left',
        [-derived.panelWidth / 2 - radial, flange.centerAlongEdge, -derived.thickness / 2 - r + radial],
        [-1 / Math.sqrt(2), 0, 1 / Math.sqrt(2)],
        false,
        undefined,
        undefined,
        'set',
        ['bend-left-inner', 'bend-left-outer'],
        false,
      );
  }
}

export function describeSheetMetalFaces(model: SheetMetalModel, output: SheetMetalOutput): SheetMetalFaceDescriptor[] {
  const derived = deriveSheetMetalModel(model);
  const faces: SheetMetalFaceDescriptor[] = [descriptor('panel', [0, 0, derived.thickness / 2], [0, 0, 1], true, [1, 0, 0], [0, 1, 0])];

  for (const edge of SHEET_METAL_EDGES) {
    const flange = derived.flanges.get(edge);
    if (!flange) continue;
    if (output === 'folded') {
      faces.push(foldedBendDescriptor(derived, flange));
      switch (edge) {
        case 'top':
          faces.push(
            descriptor(
              'flange-top',
              [
                flange.centerAlongEdge,
                derived.panelHeight / 2 + derived.bendRadius + derived.thickness,
                -derived.thickness / 2 - derived.bendRadius - flange.length / 2,
              ],
              [0, 1, 0],
              true,
              [1, 0, 0],
              [0, 0, -1],
            ),
          );
          break;
        case 'bottom':
          faces.push(
            descriptor(
              'flange-bottom',
              [
                flange.centerAlongEdge,
                -derived.panelHeight / 2 - derived.bendRadius - derived.thickness,
                -derived.thickness / 2 - derived.bendRadius - flange.length / 2,
              ],
              [0, -1, 0],
              true,
              [1, 0, 0],
              [0, 0, 1],
            ),
          );
          break;
        case 'right':
          faces.push(
            descriptor(
              'flange-right',
              [
                derived.panelWidth / 2 + derived.bendRadius + derived.thickness,
                flange.centerAlongEdge,
                -derived.thickness / 2 - derived.bendRadius - flange.length / 2,
              ],
              [1, 0, 0],
              true,
              [0, 1, 0],
              [0, 0, 1],
            ),
          );
          break;
        case 'left':
          faces.push(
            descriptor(
              'flange-left',
              [
                -derived.panelWidth / 2 - derived.bendRadius - derived.thickness,
                flange.centerAlongEdge,
                -derived.thickness / 2 - derived.bendRadius - flange.length / 2,
              ],
              [-1, 0, 0],
              true,
              [0, -1, 0],
              [0, 0, 1],
            ),
          );
          break;
      }
      continue;
    }

    switch (edge) {
      case 'top':
        faces.push(
          descriptor(
            'bend-top',
            [flange.centerAlongEdge, derived.panelHeight / 2 + flange.bendAllowance / 2, derived.thickness / 2],
            [0, 0, 1],
            true,
            [1, 0, 0],
            [0, 1, 0],
          ),
        );
        faces.push(
          descriptor(
            'flange-top',
            [flange.centerAlongEdge, derived.panelHeight / 2 + flange.bendAllowance + flange.length / 2, derived.thickness / 2],
            [0, 0, 1],
            true,
            [1, 0, 0],
            [0, 1, 0],
          ),
        );
        break;
      case 'bottom':
        faces.push(
          descriptor(
            'bend-bottom',
            [flange.centerAlongEdge, -derived.panelHeight / 2 - flange.bendAllowance / 2, derived.thickness / 2],
            [0, 0, 1],
            true,
            [1, 0, 0],
            [0, 1, 0],
          ),
        );
        faces.push(
          descriptor(
            'flange-bottom',
            [flange.centerAlongEdge, -derived.panelHeight / 2 - flange.bendAllowance - flange.length / 2, derived.thickness / 2],
            [0, 0, 1],
            true,
            [1, 0, 0],
            [0, 1, 0],
          ),
        );
        break;
      case 'right':
        faces.push(
          descriptor(
            'bend-right',
            [derived.panelWidth / 2 + flange.bendAllowance / 2, flange.centerAlongEdge, derived.thickness / 2],
            [0, 0, 1],
            true,
            [0, 1, 0],
            [-1, 0, 0],
          ),
        );
        faces.push(
          descriptor(
            'flange-right',
            [derived.panelWidth / 2 + flange.bendAllowance + flange.length / 2, flange.centerAlongEdge, derived.thickness / 2],
            [0, 0, 1],
            true,
            [0, 1, 0],
            [-1, 0, 0],
          ),
        );
        break;
      case 'left':
        faces.push(
          descriptor(
            'bend-left',
            [-derived.panelWidth / 2 - flange.bendAllowance / 2, flange.centerAlongEdge, derived.thickness / 2],
            [0, 0, 1],
            true,
            [0, -1, 0],
            [1, 0, 0],
          ),
        );
        faces.push(
          descriptor(
            'flange-left',
            [-derived.panelWidth / 2 - flange.bendAllowance - flange.length / 2, flange.centerAlongEdge, derived.thickness / 2],
            [0, 0, 1],
            true,
            [0, -1, 0],
            [1, 0, 0],
          ),
        );
        break;
    }
  }

  return faces;
}

export function sheetMetalRegionQueryName(region: SheetMetalRegionName): string {
  return baseQueryFaceName(region);
}

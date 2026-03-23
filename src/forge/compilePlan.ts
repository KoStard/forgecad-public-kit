import { Transform, type Mat4, type Vec3 } from './transform';
import type { PlaneFrame } from './planeFrame';
import type { EdgeFeatureTarget } from './shapeBackend';
import {
  cloneEdgeQueryRef,
  cloneFaceQueryRef,
  cloneShapeQueryOwner,
  cloneTopologyRewritePropagation,
  type EdgeQueryRef,
  type FaceQueryRef,
  type ShapeQueryOwner,
  type TopologyRewritePropagation,
} from './queryModel';
import {
  cloneShapeWorkplanePlacement,
  cloneSketchPlacementModel,
  type ShapeWorkplanePlacement,
} from './sketch/workplaneModel';
import {
  cloneEdgeFeatureResolvedSelector,
  cloneEdgeFinishQuadrant,
  type EdgeFeatureResolvedSelector,
} from './edgeFeatureModel';
import type {
  SheetMetalModel,
  SheetMetalOutput,
} from './sheetMetalModel';
import { cloneSheetMetalModel } from './sheetMetalModel';
import type { ProfileBackend } from './profileBackend';

/** Compile-time exhaustiveness check — call in default case of plan.kind switches. */
export function assertExhaustive(value: never, message?: string): never {
  throw new Error(message ?? `Unhandled compile plan kind: ${(value as any).kind}`);
}

export type ProfileCompileTransformStep =
  | { kind: 'translate'; x: number; y: number }
  | { kind: 'rotate'; degrees: number }
  | { kind: 'scale'; x: number; y: number }
  | { kind: 'mirror'; normalX: number; normalY: number };

export type ProfileCompilePlan =
  | {
      kind: 'rect';
      width: number;
      height: number;
      center: boolean;
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'roundedRect';
      width: number;
      height: number;
      radius: number;
      center: boolean;
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'circle';
      radius: number;
      segments?: number;
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'polygon';
      points: [number, number][];
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'boolean';
      op: 'union' | 'difference' | 'intersection';
      profiles: ProfileCompilePlan[];
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'offset';
      base: ProfileCompilePlan;
      delta: number;
      join: 'Square' | 'Round' | 'Miter';
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'project';
      sourceShape: ShapeCompilePlan;
      plane: PlaneFrame;
      sourcePlacement?: ShapeWorkplanePlacement['placement'];
      /** Compiler-owned query for the target face when projection is onto a defended descendant region. */
      targetFaceQuery?: FaceQueryRef;
      replayProfile?: ProfileCompilePlan;
      replayReason?: string;
      transforms: ProfileCompileTransformStep[];
    }
;

export type ShapeCompileTransformStep =
  | { kind: 'translate'; x: number; y: number; z: number }
  | { kind: 'rotate'; xDeg: number; yDeg: number; zDeg: number }
  | { kind: 'scale'; x: number; y: number; z: number }
  | {
      kind: 'rotateAround';
      axisX: number;
      axisY: number;
      axisZ: number;
      degrees: number;
      pivotX: number;
      pivotY: number;
      pivotZ: number;
    }
  | {
      kind: 'mirror';
      normalX: number;
      normalY: number;
      normalZ: number;
    }
  | {
      kind: 'workplanePlacement';
      matrix: Mat4;
      placement?: ShapeWorkplanePlacement['placement'];
    };

export type SweepPathCompilePlan = {
  kind: 'polyline';
  points: [number, number, number][];
};

export interface HoleCounterboreCompilePlan {
  radius: number;
  depth: number;
}

export interface HoleCountersinkCompilePlan {
  radius: number;
  angleDeg: number;
  depth: number;
}

export interface HoleThreadCompilePlan {
  designation?: string;
  pitch?: number;
  class?: string;
  handedness?: 'right' | 'left';
  depth?: number;
  modeled?: boolean;
}

export interface HoleCompilePlan {
  radius: number;
  counterbore?: HoleCounterboreCompilePlan;
  countersink?: HoleCountersinkCompilePlan;
  thread?: HoleThreadCompilePlan;
}

export interface FeatureCutExtentSideCompilePlan {
  kind: 'through' | 'blind' | 'upToFace';
  depth: number;
  face?: FaceQueryRef;
}

export type FeatureCutExtent =
  | FeatureCutExtentSideCompilePlan
  | {
      kind: 'two-sided';
      forward: FeatureCutExtentSideCompilePlan;
      reverse: Exclude<FeatureCutExtentSideCompilePlan, { kind: 'through' }>;
    };

export interface CutTaperCompilePlan {
  scale: [number, number];
}

export type ShapeCompilePlan =
  | {
      kind: 'box';
      x: number;
      y: number;
      z: number;
      center: boolean;
    }
  | {
      kind: 'cylinder';
      height: number;
      radius: number;
      radiusTop?: number;
      segments?: number;
      center: boolean;
    }
  | {
      kind: 'sphere';
      radius: number;
      segments?: number;
    }
  | {
      kind: 'torus';
      majorRadius: number;
      minorRadius: number;
      segments?: number;
    }
  | {
      kind: 'extrude';
      profile: ProfileCompilePlan;
      height: number;
      center: boolean;
      scaleTop?: [number, number];
      twist?: number;
      twistSegments?: number;
    }
  | {
      kind: 'sheetMetal';
      model: SheetMetalModel;
      output: SheetMetalOutput;
    }
  | {
      kind: 'shell';
      base: ShapeCompilePlan;
      thickness: number;
      openFaces: string[];
      queryPropagation?: TopologyRewritePropagation;
    }
  | {
      kind: 'hole';
      base: ShapeCompilePlan;
      placement: ShapeWorkplanePlacement;
      hole: HoleCompilePlan;
      extent: FeatureCutExtent;
      queryPropagation?: TopologyRewritePropagation;
    }
  | {
      kind: 'cut';
      base: ShapeCompilePlan;
      placement: ShapeWorkplanePlacement;
      profile: ProfileCompilePlan;
      extent: FeatureCutExtent;
      taper?: CutTaperCompilePlan;
      queryPropagation?: TopologyRewritePropagation;
    }
  | {
      kind: 'revolve';
      profile: ProfileCompilePlan;
      degrees: number;
      segments?: number;
    }
  | {
      kind: 'loft';
      profiles: ProfileCompilePlan[];
      heights: number[];
      edgeLength: number;
      boundsPadding: number;
    }
  | {
      kind: 'sweep';
      profile: ProfileCompilePlan;
      path: SweepPathCompilePlan;
      edgeLength: number;
      boundsPadding: number;
      up: [number, number, number];
    }
  | {
      kind: 'boolean';
      op: 'union' | 'difference' | 'intersection';
      shapes: ShapeCompilePlan[];
      queryPropagation?: TopologyRewritePropagation;
    }
  | {
      kind: 'transform';
      base: ShapeCompilePlan;
      steps: ShapeCompileTransformStep[];
    }
  | {
      kind: 'queryOwner';
      owner: ShapeQueryOwner;
      base: ShapeCompilePlan;
    }
  | {
      kind: 'trimByPlane';
      base: ShapeCompilePlan;
      normalX: number;
      normalY: number;
      normalZ: number;
      originOffset: number;
      queryPropagation?: TopologyRewritePropagation;
    }
  | {
      kind: 'fillet';
      base: ShapeCompilePlan;
      edge: EdgeQueryRef;
      radius: number;
      quadrant: [number, number];
      segments: number;
      resolvedEdge?: EdgeFeatureResolvedSelector;
      queryPropagation?: TopologyRewritePropagation;
    }
  | {
      kind: 'chamfer';
      base: ShapeCompilePlan;
      edge: EdgeQueryRef;
      size: number;
      quadrant: [number, number];
      resolvedEdge?: EdgeFeatureResolvedSelector;
      queryPropagation?: TopologyRewritePropagation;
    }
  | {
      /** Multi-edge fillet via geometric edge query. Backend-agnostic — resolved at lowering time. */
      kind: 'filletEdges';
      base: ShapeCompilePlan;
      radius: number;
      segments: number;
      /** Pre-resolved edge targets from mesh extraction. Matched by midpoint at lowering time. */
      edgeTargets: EdgeFeatureTarget[];
    }
  | {
      /** Multi-edge chamfer via geometric edge query. Backend-agnostic — resolved at lowering time. */
      kind: 'chamferEdges';
      base: ShapeCompilePlan;
      size: number;
      /** Pre-resolved edge targets from mesh extraction. Matched by midpoint at lowering time. */
      edgeTargets: EdgeFeatureTarget[];
    }
  | {
      /**
       * Imported external mesh file (STL, OBJ, 3MF).
       *
       * The compile plan captures *intent* — "load this file" — not resolved data.
       * `fileData` holds the raw bytes read at IR construction time so that lowering
       * does not require file-system access.  Each backend parses independently:
       * Manifold triangulates into a mesh solid.  OCCT does not support
       * mesh import — it throws a clear error directing the user to switch backends.
       */
      kind: 'importedMesh';
      /** Resolved path — used for error messages and caching, not re-read at lowering. */
      filePath: string;
      /** Detected or explicit format. */
      format: 'stl' | 'obj' | '3mf';
      /** Raw file bytes, read once at IR construction time. */
      fileData: ArrayBuffer;
    };

function cloneProfileTransform(step: ProfileCompileTransformStep): ProfileCompileTransformStep {
  switch (step.kind) {
    case 'translate':
      return { kind: 'translate', x: step.x, y: step.y };
    case 'rotate':
      return { kind: 'rotate', degrees: step.degrees };
    case 'scale':
      return { kind: 'scale', x: step.x, y: step.y };
    case 'mirror':
      return { kind: 'mirror', normalX: step.normalX, normalY: step.normalY };
  }
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function cloneShapeTransformMatrix(matrix: Mat4): Mat4 {
  return matrix.map((value) => canonicalNumber(value)) as Mat4;
}

function canonicalVec3(vec: Vec3): Vec3 {
  return [
    canonicalNumber(vec[0]),
    canonicalNumber(vec[1]),
    canonicalNumber(vec[2]),
  ];
}

function cloneShapeWorkplanePlacementValue(
  placement: ShapeWorkplanePlacement,
): ShapeWorkplanePlacement {
  return cloneShapeWorkplanePlacement({
    matrix: cloneShapeTransformMatrix(placement.matrix),
    placement: cloneSketchPlacementModel(placement.placement)!,
  })!;
}

function cloneShapeQueryOwnerValue(owner: ShapeQueryOwner): ShapeQueryOwner {
  return cloneShapeQueryOwner(owner)!;
}

function cloneHoleCounterboreCompilePlan(plan: HoleCounterboreCompilePlan): HoleCounterboreCompilePlan {
  return {
    radius: canonicalNumber(plan.radius),
    depth: canonicalNumber(plan.depth),
  };
}

function cloneHoleCountersinkCompilePlan(plan: HoleCountersinkCompilePlan): HoleCountersinkCompilePlan {
  return {
    radius: canonicalNumber(plan.radius),
    angleDeg: canonicalNumber(plan.angleDeg),
    depth: canonicalNumber(plan.depth),
  };
}

function cloneHoleThreadCompilePlan(plan: HoleThreadCompilePlan): HoleThreadCompilePlan {
  return {
    designation: plan.designation,
    pitch: plan.pitch == null ? undefined : canonicalNumber(plan.pitch),
    class: plan.class,
    handedness: plan.handedness,
    depth: plan.depth == null ? undefined : canonicalNumber(plan.depth),
    modeled: plan.modeled,
  };
}

function cloneHoleCompilePlanValue(plan: HoleCompilePlan): HoleCompilePlan {
  return {
    radius: canonicalNumber(plan.radius),
    counterbore: plan.counterbore ? cloneHoleCounterboreCompilePlan(plan.counterbore) : undefined,
    countersink: plan.countersink ? cloneHoleCountersinkCompilePlan(plan.countersink) : undefined,
    thread: plan.thread ? cloneHoleThreadCompilePlan(plan.thread) : undefined,
  };
}

function cloneFeatureCutExtentSide(extent: FeatureCutExtentSideCompilePlan): FeatureCutExtentSideCompilePlan {
  switch (extent.kind) {
    case 'through':
    case 'blind':
      return {
        kind: extent.kind,
        depth: canonicalNumber(extent.depth),
      };
    case 'upToFace':
      return {
        kind: 'upToFace',
        depth: canonicalNumber(extent.depth),
        face: cloneFaceQueryRef(extent.face)!,
      };
  }
}

function cloneFeatureCutExtent(extent: FeatureCutExtent): FeatureCutExtent {
  if (extent.kind === 'two-sided') {
    return {
      kind: 'two-sided',
      forward: cloneFeatureCutExtentSide(extent.forward),
      reverse: cloneFeatureCutExtentSide(extent.reverse) as Exclude<FeatureCutExtentSideCompilePlan, { kind: 'through' }>,
    };
  }
  return cloneFeatureCutExtentSide(extent);
}

function cloneCutTaperCompilePlan(plan: CutTaperCompilePlan): CutTaperCompilePlan {
  return {
    scale: [canonicalNumber(plan.scale[0]), canonicalNumber(plan.scale[1])],
  };
}

export function featureCutExtentForwardSide(extent: FeatureCutExtent): FeatureCutExtentSideCompilePlan {
  return extent.kind === 'two-sided' ? extent.forward : extent;
}

export function featureCutExtentReverseSide(
  extent: FeatureCutExtent,
): Exclude<FeatureCutExtentSideCompilePlan, { kind: 'through' }> | undefined {
  return extent.kind === 'two-sided' ? extent.reverse : undefined;
}

export function featureCutExtentDepth(extent: FeatureCutExtent): number {
  const forward = featureCutExtentForwardSide(extent).depth;
  const reverse = featureCutExtentReverseSide(extent)?.depth ?? 0;
  return forward + reverse;
}

let _shapeQueryOwnerCounter = 0;

function normalizeQueryOwnerOperation(operation: string): string {
  return operation.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'shape';
}

export function createShapeQueryOwner(operation: string): ShapeQueryOwner {
  _shapeQueryOwnerCounter += 1;
  return {
    id: `shape-query-${normalizeQueryOwnerOperation(operation)}-${_shapeQueryOwnerCounter}`,
    operation,
  };
}

export function resetShapeQueryOwnerIds(): void {
  _shapeQueryOwnerCounter = 0;
}

function mirrorTransformMatrix(normal: [number, number, number]): Mat4 {
  const [nx0, ny0, nz0] = normal;
  const len = Math.hypot(nx0, ny0, nz0);
  if (len < 1e-12) return Transform.identity().toArray();
  const nx = nx0 / len;
  const ny = ny0 / len;
  const nz = nz0 / len;

  const m00 = 1 - 2 * nx * nx;
  const m01 = -2 * nx * ny;
  const m02 = -2 * nx * nz;
  const m10 = -2 * ny * nx;
  const m11 = 1 - 2 * ny * ny;
  const m12 = -2 * ny * nz;
  const m20 = -2 * nz * nx;
  const m21 = -2 * nz * ny;
  const m22 = 1 - 2 * nz * nz;

  return [
    m00, m10, m20, 0,
    m01, m11, m21, 0,
    m02, m12, m22, 0,
    0, 0, 0, 1,
  ];
}

function shapeTransformStepMatrix(step: Exclude<ShapeCompileTransformStep, { kind: 'workplanePlacement' }>): Mat4 {
  switch (step.kind) {
    case 'translate':
      return Transform.translation(step.x, step.y, step.z).toArray();
    case 'rotate':
      return Transform.identity()
        .rotateAxis([1, 0, 0], step.xDeg)
        .rotateAxis([0, 1, 0], step.yDeg)
        .rotateAxis([0, 0, 1], step.zDeg)
        .toArray();
    case 'scale':
      return Transform.scale([step.x, step.y, step.z]).toArray();
    case 'rotateAround':
      return Transform.rotationAxis(
        [step.axisX, step.axisY, step.axisZ],
        step.degrees,
        [step.pivotX, step.pivotY, step.pivotZ],
      ).toArray();
    case 'mirror':
      return mirrorTransformMatrix([step.normalX, step.normalY, step.normalZ]);
  }
}

function applyShapeTransformToWorkplanePlacement(
  placement: ShapeWorkplanePlacement,
  step: Exclude<ShapeCompileTransformStep, { kind: 'workplanePlacement' }>,
): ShapeWorkplanePlacement {
  const stepMatrix = shapeTransformStepMatrix(step);
  const transform = Transform.from(stepMatrix);
  const current = cloneShapeWorkplanePlacementValue(placement);

  return {
    matrix: cloneShapeTransformMatrix(Transform.from(current.matrix).mul(stepMatrix).toArray()),
    placement: {
      ...current.placement,
      workplane: {
        ...current.placement.workplane,
        origin: canonicalVec3(transform.point(current.placement.workplane.origin)),
        u: canonicalVec3(transform.vector(current.placement.workplane.u)),
        v: canonicalVec3(transform.vector(current.placement.workplane.v)),
        normal: canonicalVec3(transform.vector(current.placement.workplane.normal)),
      },
    },
  };
}

function cloneShapeTransform(step: ShapeCompileTransformStep): ShapeCompileTransformStep {
  switch (step.kind) {
    case 'translate':
      return { kind: 'translate', x: step.x, y: step.y, z: step.z };
    case 'rotate':
      return {
        kind: 'rotate',
        xDeg: step.xDeg,
        yDeg: step.yDeg,
        zDeg: step.zDeg,
      };
    case 'scale':
      return {
        kind: 'scale',
        x: step.x,
        y: step.y,
        z: step.z,
      };
    case 'rotateAround':
      return {
        kind: 'rotateAround',
        axisX: step.axisX,
        axisY: step.axisY,
        axisZ: step.axisZ,
        degrees: step.degrees,
        pivotX: step.pivotX,
        pivotY: step.pivotY,
        pivotZ: step.pivotZ,
      };
    case 'mirror':
      return {
        kind: 'mirror',
        normalX: step.normalX,
        normalY: step.normalY,
        normalZ: step.normalZ,
      };
    case 'workplanePlacement':
      return {
        kind: 'workplanePlacement',
        matrix: cloneShapeTransformMatrix(step.matrix),
        placement: step.placement ? cloneSketchPlacementModel(step.placement)! : undefined,
      };
  }
}

function cloneSweepPathCompilePlan(path: SweepPathCompilePlan): SweepPathCompilePlan {
  return {
    kind: path.kind,
    points: path.points.map(([x, y, z]) => [x, y, z]),
  };
}

export function cloneProfileCompilePlan(plan: ProfileCompilePlan | null): ProfileCompilePlan | null {
  if (!plan) return null;
  switch (plan.kind) {
    case 'rect':
      return {
        kind: 'rect',
        width: plan.width,
        height: plan.height,
        center: plan.center,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'roundedRect':
      return {
        kind: 'roundedRect',
        width: plan.width,
        height: plan.height,
        radius: plan.radius,
        center: plan.center,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'circle':
      return {
        kind: 'circle',
        radius: plan.radius,
        segments: plan.segments,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'polygon':
      return {
        kind: 'polygon',
        points: plan.points.map(([x, y]) => [x, y]),
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'boolean':
      return {
        kind: 'boolean',
        op: plan.op,
        profiles: plan.profiles.map((profile) => cloneProfileCompilePlan(profile)!),
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'offset':
      return {
        kind: 'offset',
        base: cloneProfileCompilePlan(plan.base)!,
        delta: plan.delta,
        join: plan.join,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'project':
      return {
        kind: 'project',
        sourceShape: cloneShapeCompilePlan(plan.sourceShape)!,
        plane: {
          origin: [plan.plane.origin[0], plan.plane.origin[1], plan.plane.origin[2]],
          u: [plan.plane.u[0], plan.plane.u[1], plan.plane.u[2]],
          v: [plan.plane.v[0], plan.plane.v[1], plan.plane.v[2]],
          normal: [plan.plane.normal[0], plan.plane.normal[1], plan.plane.normal[2]],
        },
        sourcePlacement: plan.sourcePlacement ? cloneSketchPlacementModel(plan.sourcePlacement)! : undefined,
        targetFaceQuery: plan.targetFaceQuery ? cloneFaceQueryRef(plan.targetFaceQuery)! : undefined,
        replayProfile: plan.replayProfile ? cloneProfileCompilePlan(plan.replayProfile)! : undefined,
        replayReason: plan.replayReason,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    default:
      assertExhaustive(plan);
  }
}

export function cloneShapeCompilePlan(plan: ShapeCompilePlan): ShapeCompilePlan;
export function cloneShapeCompilePlan(plan: ShapeCompilePlan | null): ShapeCompilePlan | null;
export function cloneShapeCompilePlan(plan: ShapeCompilePlan | null): ShapeCompilePlan | null {
  if (!plan) return null;
  let result: ShapeCompilePlan;
  switch (plan.kind) {
    case 'box':
      result = { kind: 'box', x: plan.x, y: plan.y, z: plan.z, center: plan.center };
      break;
    case 'cylinder':
      result = {
        kind: 'cylinder',
        height: plan.height,
        radius: plan.radius,
        radiusTop: plan.radiusTop,
        segments: plan.segments,
        center: plan.center,
      };
      break;
    case 'sphere':
      result = { kind: 'sphere', radius: plan.radius, segments: plan.segments };
      break;
    case 'torus':
      result = { kind: 'torus', majorRadius: plan.majorRadius, minorRadius: plan.minorRadius, segments: plan.segments };
      break;
    case 'extrude':
      result = {
        kind: 'extrude',
        profile: cloneProfileCompilePlan(plan.profile)!,
        height: plan.height,
        center: plan.center,
        scaleTop: plan.scaleTop ? [plan.scaleTop[0], plan.scaleTop[1]] : undefined,
        twist: plan.twist,
        twistSegments: plan.twistSegments,
      };
      break;
    case 'sheetMetal':
      result = {
        kind: 'sheetMetal',
        model: cloneSheetMetalModel(plan.model)!,
        output: plan.output,
      };
      break;
    case 'shell':
      result = {
        kind: 'shell',
        base: cloneShapeCompilePlan(plan.base)!,
        thickness: plan.thickness,
        openFaces: [...plan.openFaces],
        queryPropagation: cloneTopologyRewritePropagation(plan.queryPropagation),
      };
      break;
    case 'hole':
      result = {
        kind: 'hole',
        base: cloneShapeCompilePlan(plan.base)!,
        placement: cloneShapeWorkplanePlacementValue(plan.placement),
        hole: cloneHoleCompilePlanValue(plan.hole),
        extent: cloneFeatureCutExtent(plan.extent),
        queryPropagation: cloneTopologyRewritePropagation(plan.queryPropagation),
      };
      break;
    case 'cut':
      result = {
        kind: 'cut',
        base: cloneShapeCompilePlan(plan.base)!,
        placement: cloneShapeWorkplanePlacementValue(plan.placement),
        profile: cloneProfileCompilePlan(plan.profile)!,
        extent: cloneFeatureCutExtent(plan.extent),
        taper: plan.taper ? cloneCutTaperCompilePlan(plan.taper) : undefined,
        queryPropagation: cloneTopologyRewritePropagation(plan.queryPropagation),
      };
      break;
    case 'revolve':
      result = {
        kind: 'revolve',
        profile: cloneProfileCompilePlan(plan.profile)!,
        degrees: plan.degrees,
        segments: plan.segments,
      };
      break;
    case 'loft':
      result = {
        kind: 'loft',
        profiles: plan.profiles.map((profile) => cloneProfileCompilePlan(profile)!),
        heights: plan.heights.map((height) => height),
        edgeLength: plan.edgeLength,
        boundsPadding: plan.boundsPadding,
      };
      break;
    case 'sweep':
      result = {
        kind: 'sweep',
        profile: cloneProfileCompilePlan(plan.profile)!,
        path: cloneSweepPathCompilePlan(plan.path),
        edgeLength: plan.edgeLength,
        boundsPadding: plan.boundsPadding,
        up: [plan.up[0], plan.up[1], plan.up[2]],
      };
      break;
    case 'boolean':
      result = {
        kind: 'boolean',
        op: plan.op,
        shapes: plan.shapes.map((shape) => cloneShapeCompilePlan(shape)!),
        queryPropagation: cloneTopologyRewritePropagation(plan.queryPropagation),
      };
      break;
    case 'transform':
      result = {
        kind: 'transform',
        base: cloneShapeCompilePlan(plan.base)!,
        steps: plan.steps.map(cloneShapeTransform),
      };
      break;
    case 'queryOwner':
      result = {
        kind: 'queryOwner',
        owner: cloneShapeQueryOwnerValue(plan.owner),
        base: cloneShapeCompilePlan(plan.base)!,
      };
      break;
    case 'trimByPlane':
      result = {
        kind: 'trimByPlane',
        base: cloneShapeCompilePlan(plan.base)!,
        normalX: plan.normalX,
        normalY: plan.normalY,
        normalZ: plan.normalZ,
        originOffset: plan.originOffset,
        queryPropagation: cloneTopologyRewritePropagation(plan.queryPropagation),
      };
      break;
    case 'fillet':
      result = {
        kind: 'fillet',
        base: cloneShapeCompilePlan(plan.base)!,
        edge: cloneEdgeQueryRef(plan.edge)!,
        radius: plan.radius,
        quadrant: cloneEdgeFinishQuadrant(plan.quadrant)!,
        segments: plan.segments,
        resolvedEdge: cloneEdgeFeatureResolvedSelector(plan.resolvedEdge),
        queryPropagation: cloneTopologyRewritePropagation(plan.queryPropagation),
      };
      break;
    case 'chamfer':
      result = {
        kind: 'chamfer',
        base: cloneShapeCompilePlan(plan.base)!,
        edge: cloneEdgeQueryRef(plan.edge)!,
        size: plan.size,
        quadrant: cloneEdgeFinishQuadrant(plan.quadrant)!,
        resolvedEdge: cloneEdgeFeatureResolvedSelector(plan.resolvedEdge),
        queryPropagation: cloneTopologyRewritePropagation(plan.queryPropagation),
      };
      break;
    case 'filletEdges':
      result = {
        kind: 'filletEdges',
        base: cloneShapeCompilePlan(plan.base)!,
        radius: plan.radius,
        segments: plan.segments,
        edgeTargets: plan.edgeTargets.map(t => ({
          midpoint: [t.midpoint[0], t.midpoint[1], t.midpoint[2]] as [number, number, number],
          start: [t.start[0], t.start[1], t.start[2]] as [number, number, number],
          end: [t.end[0], t.end[1], t.end[2]] as [number, number, number],
          convex: t.convex,
        })),
      };
      break;
    case 'chamferEdges':
      result = {
        kind: 'chamferEdges',
        base: cloneShapeCompilePlan(plan.base)!,
        size: plan.size,
        edgeTargets: plan.edgeTargets.map(t => ({
          midpoint: [t.midpoint[0], t.midpoint[1], t.midpoint[2]] as [number, number, number],
          start: [t.start[0], t.start[1], t.start[2]] as [number, number, number],
          end: [t.end[0], t.end[1], t.end[2]] as [number, number, number],
          convex: t.convex,
        })),
      };
      break;
    case 'importedMesh':
      // Imported mesh — fileData is immutable raw bytes, share the reference.
      result = { kind: 'importedMesh', filePath: plan.filePath, format: plan.format, fileData: plan.fileData };
      break;
    default:
      assertExhaustive(plan);
  }
  // Preserve OCCT shape cache across clones (set by compilePlanOCCT.ts)
  if ((plan as any)._occtCache) (result as any)._occtCache = (plan as any)._occtCache;
  return result;
}

export function appendProfileCompileTransform(
  plan: ProfileCompilePlan,
  step: ProfileCompileTransformStep,
): ProfileCompilePlan {
  const out = cloneProfileCompilePlan(plan)!;
  out.transforms.push(cloneProfileTransform(step));
  return out;
}

export function appendShapeCompileTransform(
  plan: ShapeCompilePlan,
  step: ShapeCompileTransformStep,
): ShapeCompilePlan;
export function appendShapeCompileTransform(
  plan: ShapeCompilePlan | null,
  step: ShapeCompileTransformStep,
): ShapeCompilePlan | null;
export function appendShapeCompileTransform(
  plan: ShapeCompilePlan | null,
  step: ShapeCompileTransformStep,
): ShapeCompilePlan | null {
  if (!plan) return null;
  if (plan.kind === 'transform') {
    return {
      kind: 'transform',
      base: cloneShapeCompilePlan(plan.base),
      steps: [...plan.steps.map(cloneShapeTransform), cloneShapeTransform(step)],
    };
  }
  return {
    kind: 'transform',
    base: cloneShapeCompilePlan(plan),
    steps: [cloneShapeTransform(step)],
  };
}

export function appendShapeCompileTransforms(
  plan: ShapeCompilePlan,
  steps: ShapeCompileTransformStep[],
): ShapeCompilePlan;
export function appendShapeCompileTransforms(
  plan: ShapeCompilePlan | null,
  steps: ShapeCompileTransformStep[],
): ShapeCompilePlan | null;
export function appendShapeCompileTransforms(
  plan: ShapeCompilePlan | null,
  steps: ShapeCompileTransformStep[],
): ShapeCompilePlan | null {
  let out = cloneShapeCompilePlan(plan);
  for (const step of steps) {
    out = appendShapeCompileTransform(out, step);
  }
  return out;
}

export function wrapShapeCompilePlanWithQueryOwner(
  plan: ShapeCompilePlan,
  owner: ShapeQueryOwner,
): ShapeCompilePlan;
export function wrapShapeCompilePlanWithQueryOwner(
  plan: ShapeCompilePlan | null,
  owner: ShapeQueryOwner,
): ShapeCompilePlan | null;
export function wrapShapeCompilePlanWithQueryOwner(
  plan: ShapeCompilePlan | null,
  owner: ShapeQueryOwner,
): ShapeCompilePlan | null {
  if (!plan) return null;
  return {
    kind: 'queryOwner',
    owner: cloneShapeQueryOwnerValue(owner),
    base: cloneShapeCompilePlan(plan),
  };
}

export function createOwnedShapeCompilePlan(
  plan: ShapeCompilePlan,
  operation: string,
): ShapeCompilePlan;
export function createOwnedShapeCompilePlan(
  plan: ShapeCompilePlan | null,
  operation: string,
): ShapeCompilePlan | null;
export function createOwnedShapeCompilePlan(
  plan: ShapeCompilePlan | null,
  operation: string,
): ShapeCompilePlan | null {
  if (!plan) return null;
  return wrapShapeCompilePlanWithQueryOwner(plan, createShapeQueryOwner(operation));
}

export function buildBooleanShapeCompilePlan(
  op: 'union' | 'difference' | 'intersection',
  shapes: ShapeCompilePlan[],
): ShapeCompilePlan {
  return {
    kind: 'boolean',
    op,
    shapes: shapes.map((shape) => cloneShapeCompilePlan(shape)),
  };
}

export function findShapePrimaryQueryOwner(plan: ShapeCompilePlan): ShapeQueryOwner | null {
  switch (plan.kind) {
    case 'queryOwner':
      return cloneShapeQueryOwnerValue(plan.owner);
    case 'transform':
    case 'shell':
    case 'hole':
    case 'cut':
    case 'fillet':
    case 'chamfer':
    case 'filletEdges':
    case 'chamferEdges':
    case 'trimByPlane':
      return findShapePrimaryQueryOwner(plan.base);
    case 'box':
    case 'cylinder':
    case 'sphere':
    case 'torus':
    case 'extrude':
    case 'sheetMetal':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'boolean':
    case 'importedMesh':
      return null;
    default:
      assertExhaustive(plan);
  }
}

export function collectShapeQueryOwners(plan: ShapeCompilePlan): ShapeQueryOwner[] {
  const out: ShapeQueryOwner[] = [];
  const seen = new Set<string>();

  function visit(current: ShapeCompilePlan): void {
    switch (current.kind) {
      case 'queryOwner':
        if (!seen.has(current.owner.id)) {
          seen.add(current.owner.id);
          out.push(cloneShapeQueryOwnerValue(current.owner));
        }
        visit(current.base);
        return;
      case 'transform':
      case 'shell':
      case 'hole':
      case 'cut':
      case 'fillet':
      case 'chamfer':
      case 'filletEdges':
      case 'chamferEdges':
      case 'trimByPlane':
        visit(current.base);
        return;
      case 'boolean':
        for (const shape of current.shapes) visit(shape);
        return;
      case 'box':
      case 'cylinder':
      case 'sphere':
      case 'torus':
      case 'extrude':
      case 'sheetMetal':
      case 'revolve':
      case 'loft':
      case 'sweep':
      case 'importedMesh':
        return;
      default:
        assertExhaustive(current);
    }
  }

  visit(plan);
  return out;
}

export function findShapeWorkplanePlacement(
  plan: ShapeCompilePlan,
): ShapeWorkplanePlacement | null {
  switch (plan.kind) {
    case 'queryOwner':
      return findShapeWorkplanePlacement(plan.base);
    case 'transform': {
      let current = findShapeWorkplanePlacement(plan.base);
      for (const step of plan.steps) {
        if (step.kind === 'workplanePlacement') {
          current = step.placement
            ? cloneShapeWorkplanePlacementValue({
                matrix: step.matrix,
                placement: step.placement,
              })
            : null;
          continue;
        }
        if (!current) continue;
        current = applyShapeTransformToWorkplanePlacement(current, step);
      }
      return current;
    }
    case 'shell':
    case 'fillet':
    case 'chamfer':
    case 'filletEdges':
    case 'chamferEdges':
      return findShapeWorkplanePlacement(plan.base);
    case 'hole':
    case 'cut':
      return cloneShapeWorkplanePlacementValue(plan.placement);
    case 'trimByPlane':
      return findShapeWorkplanePlacement(plan.base);
    case 'box':
    case 'cylinder':
    case 'sphere':
    case 'torus':
    case 'extrude':
    case 'sheetMetal':
    case 'loft':
    case 'sweep':
    case 'boolean':
    case 'revolve':
    case 'importedMesh':
      return null;
    default:
      assertExhaustive(plan);
  }
}

export function buildBooleanProfileCompilePlan(
  op: 'union' | 'difference' | 'intersection',
  profiles: ProfileCompilePlan[],
): ProfileCompilePlan {
  return {
    kind: 'boolean',
    op,
    profiles: profiles.map((profile) => cloneProfileCompilePlan(profile)!),
    transforms: [],
  };
}

export function buildOffsetProfileCompilePlan(
  base: ProfileCompilePlan,
  delta: number,
  join: 'Square' | 'Round' | 'Miter',
): ProfileCompilePlan {
  return {
    kind: 'offset',
    base: cloneProfileCompilePlan(base)!,
    delta,
    join,
    transforms: [],
  };
}

/**
 * Snapshot a ProfileBackend (cross-section) as a concrete polygon compile plan.
 * This replaces the former 'opaque' plan kind: every cross-section IS polygon
 * loops, so there's never a reason to lose the parametric description.
 */
export function profilePlanFromCrossSection(cross: ProfileBackend): ProfileCompilePlan {
  const loops = cross.toPolygons();
  if (loops.length === 0) {
    return { kind: 'polygon', points: [], transforms: [] };
  }
  const plans: ProfileCompilePlan[] = loops.map((loop) => ({
    kind: 'polygon' as const,
    points: loop.map((pt) => [pt[0], pt[1]] as [number, number]),
    transforms: [],
  }));
  if (plans.length === 1) return plans[0];
  return { kind: 'boolean', op: 'union', profiles: plans, transforms: [] };
}

export function buildTrimByPlaneShapeCompilePlan(
  base: ShapeCompilePlan,
  normal: [number, number, number],
  originOffset: number,
): ShapeCompilePlan {
  return {
    kind: 'trimByPlane',
    base: cloneShapeCompilePlan(base),
    normalX: canonicalNumber(normal[0]),
    normalY: canonicalNumber(normal[1]),
    normalZ: canonicalNumber(normal[2]),
    originOffset: canonicalNumber(originOffset),
  };
}

export function buildFilletShapeCompilePlan(
  base: ShapeCompilePlan | null,
  edge: EdgeQueryRef | undefined,
  radius: number,
  quadrant: [number, number],
  segments: number,
): ShapeCompilePlan | null {
  if (!base || !edge) return null;
  if (!Number.isFinite(radius) || !(radius > 0)) return null;
  if (!Number.isFinite(segments) || segments < 2) return null;
  return {
    kind: 'fillet',
    base: cloneShapeCompilePlan(base)!,
    edge: cloneEdgeQueryRef(edge)!,
    radius: canonicalNumber(radius),
    quadrant: cloneEdgeFinishQuadrant(quadrant)!,
    segments: Math.max(2, Math.round(segments)),
  };
}

export function buildChamferShapeCompilePlan(
  base: ShapeCompilePlan | null,
  edge: EdgeQueryRef | undefined,
  size: number,
  quadrant: [number, number],
): ShapeCompilePlan | null {
  if (!base || !edge) return null;
  if (!Number.isFinite(size) || !(size > 0)) return null;
  return {
    kind: 'chamfer',
    base: cloneShapeCompilePlan(base)!,
    edge: cloneEdgeQueryRef(edge)!,
    size: canonicalNumber(size),
    quadrant: cloneEdgeFinishQuadrant(quadrant)!,
  };
}

export function buildLoftShapeCompilePlan(
  profiles: ProfileCompilePlan[],
  heights: number[],
  options: { edgeLength: number; boundsPadding: number },
): ShapeCompilePlan {
  return {
    kind: 'loft',
    profiles: profiles.map((profile) => cloneProfileCompilePlan(profile)!),
    heights: heights.map((height) => canonicalNumber(height)),
    edgeLength: canonicalNumber(options.edgeLength),
    boundsPadding: canonicalNumber(options.boundsPadding),
  };
}

export function buildSweepShapeCompilePlan(
  profile: ProfileCompilePlan,
  path: SweepPathCompilePlan,
  options: {
    edgeLength: number;
    boundsPadding: number;
    up: [number, number, number];
  },
): ShapeCompilePlan {
  return {
    kind: 'sweep',
    profile: cloneProfileCompilePlan(profile)!,
    path: cloneSweepPathCompilePlan(path),
    edgeLength: canonicalNumber(options.edgeLength),
    boundsPadding: canonicalNumber(options.boundsPadding),
    up: [
      canonicalNumber(options.up[0]),
      canonicalNumber(options.up[1]),
      canonicalNumber(options.up[2]),
    ],
  };
}

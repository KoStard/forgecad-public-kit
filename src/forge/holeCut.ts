import {
  type FeatureCutExtent,
  type HoleCompilePlan,
  createShapeQueryOwner,
  type ShapeCompilePlan,
  wrapShapeCompilePlanWithQueryOwner,
} from './compilePlan';
import {
  buildCutShapeCompilePlan,
  buildHoleShapeCompilePlan,
} from './holeCutCompilePlan';
import {
  Shape,
  buildShapeFromCompilePlan,
  getShapeCompilePlan,
  getShapeDimensions,
  getShapeGeometryInfo,
  getShapePlacementReferences,
  getShapeQueryOwners,
  setShapeDimensions,
  setShapeGeometryInfo,
  setShapePlacementReferences,
} from './kernel';
import { shapeQueryOwnersEqual, type FaceQueryRef, type ShapeQueryOwner } from './queryModel';
import {
  attachTopologyRewritePropagation,
  buildCutTopologyRewritePropagation,
  buildHoleTopologyRewritePropagation,
} from './queryPropagation';
import { validateShapeFaceQuery } from './shapeFaces';
import { Sketch, getSketchCompileProfilePlan, getSketchPlacement3D, getSketchPlacementModel } from './sketch/core';
import { TrackedShape, type FaceRef } from './sketch/topology';
import { resolveSketchWorkplane, type SketchFaceTarget } from './sketch/workplane';
import {
  cloneSketchPlacementModel,
  cloneSketchWorkplane,
  type ShapeWorkplanePlacement,
} from './sketch/workplaneModel';

export interface ShapeHoleOptions {
  diameter: number;
  depth?: number;
  upToFace?: SketchFaceTarget | FaceRef;
  u?: number;
  v?: number;
  counterbore?: {
    diameter: number;
    depth: number;
  };
  countersink?: {
    diameter: number;
    angleDeg?: number;
  };
}

export interface ShapeCutoutOptions {
  depth?: number;
  upToFace?: SketchFaceTarget | FaceRef;
}

function isFaceRef(value: unknown): value is FaceRef {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FaceRef>;
  return typeof candidate.name === 'string'
    && Array.isArray(candidate.normal)
    && Array.isArray(candidate.center);
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function dot3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizeVec3(vec: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vec[0], vec[1], vec[2]);
  if (length < 1e-12) {
    throw new Error('Hole/cut feature direction could not be normalized.');
  }
  return [vec[0] / length, vec[1] / length, vec[2] / length];
}

function featurePlacementMatrix(placement: ShapeWorkplanePlacement['placement']): ShapeWorkplanePlacement['matrix'] {
  const { workplane, u, v, protrude } = placement;
  const origin: [number, number, number] = [
    workplane.origin[0] + workplane.u[0] * u + workplane.v[0] * v + workplane.normal[0] * protrude,
    workplane.origin[1] + workplane.u[1] * u + workplane.v[1] * v + workplane.normal[1] * protrude,
    workplane.origin[2] + workplane.u[2] * u + workplane.v[2] * v + workplane.normal[2] * protrude,
  ];

  return [
    workplane.u[0], workplane.u[1], workplane.u[2], 0,
    workplane.v[0], workplane.v[1], workplane.v[2], 0,
    workplane.normal[0], workplane.normal[1], workplane.normal[2], 0,
    origin[0], origin[1], origin[2], 1,
  ] as ShapeWorkplanePlacement['matrix'];
}

function targetRetainsQueryOwner(target: Shape, owner: ShapeQueryOwner | undefined): boolean {
  if (!owner) return true;
  return getShapeQueryOwners(target).some((current) => shapeQueryOwnersEqual(current, owner));
}

function requireCompatibleFeatureOwner(
  target: Shape,
  owner: ShapeQueryOwner | undefined,
  label: string,
): void {
  if (targetRetainsQueryOwner(target, owner)) return;
  throw new Error(
    `${label} requires a face/workplane owned by the target shape or one of its preserved query ancestors.`,
  );
}

function requireCompatibleFeatureFaceQuery(
  target: Shape,
  label: string,
  query: FaceRef['query'],
): void {
  const issue = validateShapeFaceQuery(getShapeCompilePlan(target), query);
  if (!issue) return;
  throw new Error(`${label} ${issue}`);
}

function bboxCorners(shape: Shape): Array<[number, number, number]> {
  const bbox = shape.boundingBox();
  const [minX, minY, minZ] = bbox.min as [number, number, number];
  const [maxX, maxY, maxZ] = bbox.max as [number, number, number];
  return [
    [minX, minY, minZ],
    [minX, minY, maxZ],
    [minX, maxY, minZ],
    [minX, maxY, maxZ],
    [maxX, minY, minZ],
    [maxX, minY, maxZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
  ];
}

function computeThroughDepth(shape: Shape, origin: [number, number, number], normal: [number, number, number]): number {
  const inward = normalizeVec3([-normal[0], -normal[1], -normal[2]]);
  let maxDepth = 0;
  for (const corner of bboxCorners(shape)) {
    const offset: [number, number, number] = [
      corner[0] - origin[0],
      corner[1] - origin[1],
      corner[2] - origin[2],
    ];
    maxDepth = Math.max(maxDepth, dot3(offset, inward));
  }

  if (maxDepth > 1e-6) return maxDepth;

  const bbox = shape.boundingBox();
  const dx = bbox.max[0] - bbox.min[0];
  const dy = bbox.max[1] - bbox.min[1];
  const dz = bbox.max[2] - bbox.min[2];
  return Math.max(Math.hypot(dx, dy, dz), 1);
}

function resolveFeatureFaceRef(
  targetForResolution: Shape | TrackedShape,
  faceOrRef: SketchFaceTarget | FaceRef,
): FaceRef {
  if (isFaceRef(faceOrRef)) return faceOrRef;
  return targetForResolution.face(faceOrRef);
}

function resolveFeatureFaceTarget(
  targetForResolution: Shape | TrackedShape,
  targetForOwnership: Shape,
  faceOrRef: SketchFaceTarget | FaceRef,
  label: string,
  opts: { requireDefendedQuery: boolean } = { requireDefendedQuery: true },
): { face: FaceRef; query: FaceQueryRef } {
  const workplane = isFaceRef(faceOrRef)
    ? resolveSketchWorkplane(faceOrRef)
    : resolveSketchWorkplane(targetForResolution, faceOrRef);

  requireCompatibleFeatureOwner(targetForOwnership, workplane.source.owner, label);
  if (opts.requireDefendedQuery) {
    requireCompatibleFeatureFaceQuery(targetForOwnership, label, workplane.source);
  }

  return {
    face: resolveFeatureFaceRef(targetForResolution, faceOrRef),
    query: workplane.source,
  };
}

function computeUpToFaceDepth(
  origin: [number, number, number],
  normal: [number, number, number],
  face: FaceRef,
  label: string,
): number {
  if (face.planar === false || !face.uAxis || !face.vAxis) {
    throw new Error(`${label} upToFace currently requires a planar termination face.`);
  }

  const hostNormal = normalizeVec3(normal);
  const targetNormal = normalizeVec3(face.normal);
  if (Math.abs(Math.abs(dot3(hostNormal, targetNormal)) - 1) > 1e-6) {
    throw new Error(`${label} upToFace currently requires a termination face parallel to the feature direction.`);
  }

  const inward: [number, number, number] = [-hostNormal[0], -hostNormal[1], -hostNormal[2]];
  const offset: [number, number, number] = [
    face.center[0] - origin[0],
    face.center[1] - origin[1],
    face.center[2] - origin[2],
  ];
  const depth = dot3(offset, inward);
  if (!(depth > 1e-6)) {
    throw new Error(`${label} upToFace requires the termination face to lie in the feature direction.`);
  }
  return depth;
}

function resolveFeatureExtent(
  targetForResolution: Shape | TrackedShape,
  target: Shape,
  origin: [number, number, number],
  normal: [number, number, number],
  depth: number | undefined,
  upToFace: SketchFaceTarget | FaceRef | undefined,
  label: string,
): FeatureCutExtent {
  if (depth != null && upToFace != null) {
    throw new Error(`${label} accepts either depth or upToFace, not both.`);
  }
  if (upToFace != null) {
    const targetFace = resolveFeatureFaceTarget(targetForResolution, target, upToFace, label, {
      requireDefendedQuery: false,
    });
    return {
      kind: 'upToFace',
      depth: computeUpToFaceDepth(origin, normal, targetFace.face, label),
      face: targetFace.query,
    };
  }
  if (depth == null) {
    return {
      kind: 'through',
      depth: computeThroughDepth(target, origin, normal),
    };
  }
  if (!isFinitePositive(depth)) {
    throw new Error(`${label} requires a positive finite blind depth.`);
  }
  return { kind: 'blind', depth };
}

function resolveHoleCompilePlan(opts: ShapeHoleOptions): HoleCompilePlan {
  const hole: HoleCompilePlan = {
    radius: opts.diameter / 2,
  };

  if (opts.counterbore && opts.countersink) {
    throw new Error('Shape.hole() currently supports either counterbore or countersink, not both at once.');
  }

  if (opts.counterbore) {
    if (!isFinitePositive(opts.counterbore.diameter) || opts.counterbore.diameter <= opts.diameter) {
      throw new Error('Shape.hole() counterbore diameter must be greater than the hole diameter.');
    }
    if (!isFinitePositive(opts.counterbore.depth)) {
      throw new Error('Shape.hole() counterbore depth must be a positive finite value.');
    }
    hole.counterbore = {
      radius: opts.counterbore.diameter / 2,
      depth: opts.counterbore.depth,
    };
  }

  if (opts.countersink) {
    if (!isFinitePositive(opts.countersink.diameter) || opts.countersink.diameter <= opts.diameter) {
      throw new Error('Shape.hole() countersink diameter must be greater than the hole diameter.');
    }
    const angleDeg = opts.countersink.angleDeg ?? 90;
    if (!Number.isFinite(angleDeg) || angleDeg <= 0 || angleDeg >= 180) {
      throw new Error('Shape.hole() countersink angleDeg must be between 0 and 180 degrees.');
    }
    const halfAngleRad = (angleDeg * Math.PI) / 360;
    const tangent = Math.tan(halfAngleRad);
    if (!(tangent > 1e-9)) {
      throw new Error('Shape.hole() countersink angleDeg is too small to form a defended taper.');
    }
    hole.countersink = {
      radius: opts.countersink.diameter / 2,
      angleDeg,
      depth: ((opts.countersink.diameter - opts.diameter) / 2) / tangent,
    };
  }

  return hole;
}

function validateHoleExtentCompatibility(hole: HoleCompilePlan, extent: FeatureCutExtent): void {
  const headDepth = hole.counterbore?.depth ?? hole.countersink?.depth ?? 0;
  if (headDepth <= 0) return;
  if (headDepth >= extent.depth - 1e-6) {
    if (hole.counterbore) {
      throw new Error('Shape.hole() counterbore depth must leave some straight hole depth below the bore.');
    }
    throw new Error('Shape.hole() countersink diameter/angle must leave some straight hole depth below the sink.');
  }
}

function createOwnedTopologyRewritePlan(
  plan: ShapeCompilePlan | null,
  operation: 'hole' | 'cut',
  buildPropagation: (owner: ShapeQueryOwner) => ReturnType<typeof buildHoleTopologyRewritePropagation>,
): ShapeCompilePlan | null {
  if (!plan) return null;
  const owner = createShapeQueryOwner(operation);
  return wrapShapeCompilePlanWithQueryOwner(
    attachTopologyRewritePropagation(plan, buildPropagation(owner)),
    owner,
  );
}

function buildFeatureResult(target: Shape, plan: ShapeCompilePlan | null): Shape {
  if (!plan) {
    throw new Error('Hole/cut feature could not record compiler intent for this target.');
  }

  const targetInfo = getShapeGeometryInfo(target);
  const result = buildShapeFromCompilePlan(plan, target.colorHex, {
    backend: targetInfo.backend,
    representation: targetInfo.representation,
    fidelity: targetInfo.fidelity,
    topology: 'none',
    sources: ['boolean', ...targetInfo.sources],
  });
  setShapeDimensions(result, getShapeDimensions(target));
  setShapePlacementReferences(result, getShapePlacementReferences(target), { merge: false });
  setShapeGeometryInfo(result, {
    backend: targetInfo.backend,
    representation: targetInfo.representation,
    fidelity: targetInfo.fidelity,
    topology: 'none',
    sources: ['boolean', ...targetInfo.sources],
  });
  return result;
}

function resolveHolePlacement(
  targetForResolution: Shape | TrackedShape,
  targetForOwnership: Shape,
  faceOrRef: SketchFaceTarget | FaceRef,
  opts: ShapeHoleOptions,
): { placement: ShapeWorkplanePlacement; extent: FeatureCutExtent } {
  const workplane = isFaceRef(faceOrRef)
    ? resolveSketchWorkplane(faceOrRef)
    : resolveSketchWorkplane(targetForResolution, faceOrRef);

  requireCompatibleFeatureOwner(targetForOwnership, workplane.source.owner, 'Shape.hole()');
  requireCompatibleFeatureFaceQuery(targetForOwnership, 'Shape.hole()', workplane.source);

  const placement = {
    placement: {
      workplane: cloneSketchWorkplane(workplane),
      u: opts.u ?? 0,
      v: opts.v ?? 0,
      protrude: 0,
      selfAnchor: 'center' as const,
    },
    matrix: featurePlacementMatrix({
      workplane: cloneSketchWorkplane(workplane),
      u: opts.u ?? 0,
      v: opts.v ?? 0,
      protrude: 0,
      selfAnchor: 'center' as const,
    }),
  } satisfies ShapeWorkplanePlacement;

  return {
    placement,
    extent: resolveFeatureExtent(
      targetForResolution,
      targetForOwnership,
      workplane.origin,
      workplane.normal,
      opts.depth,
      opts.upToFace,
      'Shape.hole()',
    ),
  };
}

function shapeHole(target: Shape, targetForResolution: Shape | TrackedShape, faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape {
  if (!isFinitePositive(opts.diameter)) {
    throw new Error('Shape.hole() requires a positive finite diameter.');
  }

  const basePlan = getShapeCompilePlan(target);
  if (!basePlan) {
    throw new Error('Shape.hole() currently requires a compile-covered target shape.');
  }

  const { placement, extent } = resolveHolePlacement(targetForResolution, target, faceOrRef, opts);
  const hole = resolveHoleCompilePlan(opts);
  validateHoleExtentCompatibility(hole, extent);
  const plan = createOwnedTopologyRewritePlan(
    buildHoleShapeCompilePlan(basePlan, placement, hole, extent),
    'hole',
    (owner) => buildHoleTopologyRewritePropagation(owner, basePlan, placement.placement, hole, extent),
  );
  return buildFeatureResult(target, plan);
}

function shapeCutout(target: Shape, sketch: Sketch, opts: ShapeCutoutOptions = {}): Shape {
  const basePlan = getShapeCompilePlan(target);
  if (!basePlan) {
    throw new Error('Shape.cutout() currently requires a compile-covered target shape.');
  }

  const profile = getSketchCompileProfilePlan(sketch);
  if (!profile) {
    throw new Error('Shape.cutout() requires a compile-covered sketch profile.');
  }

  const placementModel = getSketchPlacementModel(sketch);
  const placementMatrix = getSketchPlacement3D(sketch);
  if (!placementModel || !placementMatrix) {
    throw new Error('Shape.cutout() requires a sketch placed with Sketch.onFace(...).');
  }

  requireCompatibleFeatureOwner(target, placementModel.workplane.source.owner, 'Shape.cutout()');
  requireCompatibleFeatureFaceQuery(target, 'Shape.cutout()', placementModel.workplane.source);

  const extent = resolveFeatureExtent(
    target,
    target,
    placementModel.workplane.origin,
    placementModel.workplane.normal,
    opts.depth,
    opts.upToFace,
    'Shape.cutout()',
  );

  const plan = createOwnedTopologyRewritePlan(
    buildCutShapeCompilePlan(
      basePlan,
      {
        matrix: placementMatrix,
        placement: cloneSketchPlacementModel(placementModel)!,
      },
      profile,
      extent,
    ),
    'cut',
    (owner) => buildCutTopologyRewritePropagation(
      owner,
      basePlan,
      placementModel,
      profile,
      extent,
    ),
  );
  return buildFeatureResult(target, plan);
}

declare module './kernel' {
  interface Shape {
    hole(faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape;
    cutout(sketch: Sketch, opts?: ShapeCutoutOptions): Shape;
  }
}

declare module './sketch/topology' {
  interface TrackedShape {
    hole(faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape;
    cutout(sketch: Sketch, opts?: ShapeCutoutOptions): Shape;
  }
}

Shape.prototype.hole = function hole(faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape {
  return shapeHole(this, this, faceOrRef, opts);
};

Shape.prototype.cutout = function cutout(sketch: Sketch, opts: ShapeCutoutOptions = {}): Shape {
  return shapeCutout(this, sketch, opts);
};

TrackedShape.prototype.hole = function hole(faceOrRef: SketchFaceTarget | FaceRef, opts: ShapeHoleOptions): Shape {
  return shapeHole(this.toShape(), this, faceOrRef, opts);
};

TrackedShape.prototype.cutout = function cutout(sketch: Sketch, opts: ShapeCutoutOptions = {}): Shape {
  return shapeCutout(this.toShape(), sketch, opts);
};

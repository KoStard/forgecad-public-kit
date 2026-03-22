import {
  type CutTaperCompilePlan,
  findShapePrimaryQueryOwner,
  type FeatureCutExtent,
  type HoleCompilePlan,
  type ProfileCompilePlan,
  type ProfileCompileTransformStep,
  type ShapeCompilePlan,
  type ShapeCompileTransformStep,
  featureCutExtentForwardSide,
  featureCutExtentReverseSide,
} from './compilePlan';
import {
  cloneFaceQueryRef,
  cloneShapeQueryOwner,
  faceQueryRefsEqual,
  shapeQueryOwnersEqual,
  type FaceQueryRef,
  type ShapeQueryOwner,
  type TopologyRewriteFaceDescendantContract,
} from './queryModel';
import type { FaceDescendantMetadata, FaceDescendantSemantic } from './descendantResolution';
import { describeSheetMetalFaces } from './sheetMetalModel';
import { Transform, normalizeAxis, type Mat4, type Vec3 } from './transform';
import type { SketchPlacementModel } from './sketch/workplaneModel';
import type { FaceRef } from './sketch/topology';

type Vec2 = [number, number];

interface BlockedFaceQuery {
  query: FaceQueryRef;
  reason: string;
}

interface FaceMatch {
  name: string;
  face: FaceRef;
}

interface NamedFaceCandidate {
  name: string;
  face: FaceRef;
  query: FaceQueryRef;
  semantic: FaceDescendantSemantic;
  aliases: FaceQueryRef[];
}

interface FaceTable {
  faces: Map<string, FaceRef>;
  blockedNames: Map<string, string>;
  supportedQueries: FaceQueryRef[];
  blockedQueries: BlockedFaceQuery[];
}

export interface NamedShapeFaceQuery {
  name: string;
  query: FaceQueryRef;
}

export type FeatureBlockedFaceReason = 'host' | 'through-exit' | 'up-to-face-target';

export interface BlockedShapeFaceEntry {
  name: string;
  reason: FeatureBlockedFaceReason;
}

function emptyFaceTable(): FaceTable {
  return {
    faces: new Map(),
    blockedNames: new Map(),
    supportedQueries: [],
    blockedQueries: [],
  };
}

function cloneVec3(vec: [number, number, number]): [number, number, number] {
  return [vec[0], vec[1], vec[2]];
}

function cloneFaceRefValue(face: FaceRef): FaceRef {
  return {
    ...face,
    normal: cloneVec3(face.normal),
    center: cloneVec3(face.center),
    query: cloneFaceQueryRef(face.query),
    uAxis: face.uAxis ? cloneVec3(face.uAxis) : undefined,
    vAxis: face.vAxis ? cloneVec3(face.vAxis) : undefined,
    descendant: face.descendant ? cloneFaceDescendantMetadata(face.descendant) : undefined,
  };
}

function cloneFaceDescendantMetadata(metadata: FaceDescendantMetadata): FaceDescendantMetadata {
  return {
    kind: metadata.kind,
    semantic: metadata.semantic,
    memberCount: metadata.memberCount,
    memberNames: [...metadata.memberNames],
    coplanar: metadata.coplanar,
  };
}

function createFaceDescendantMetadata(
  semantic: FaceDescendantSemantic,
  memberNames: string[],
  coplanar: boolean,
): FaceDescendantMetadata {
  return {
    kind: semantic === 'face' && memberNames.length === 1 ? 'single' : 'face-set',
    semantic,
    memberCount: memberNames.length,
    memberNames: [...memberNames],
    coplanar,
  };
}

function facesAreCoplanar(faces: FaceRef[]): boolean {
  if (faces.length <= 1) return true;
  const first = faces[0];
  if (first.planar === false || !first.uAxis || !first.vAxis) return false;
  const firstNormal = normalizeAxis(first.normal);
  const planeOffset = (
    firstNormal[0] * first.center[0]
    + firstNormal[1] * first.center[1]
    + firstNormal[2] * first.center[2]
  );
  for (const face of faces.slice(1)) {
    if (face.planar === false || !face.uAxis || !face.vAxis) return false;
    const normal = normalizeAxis(face.normal);
    const alignment = Math.abs(
      firstNormal[0] * normal[0]
      + firstNormal[1] * normal[1]
      + firstNormal[2] * normal[2],
    );
    if (Math.abs(alignment - 1) > 1e-6) return false;
    const offset = firstNormal[0] * face.center[0] + firstNormal[1] * face.center[1] + firstNormal[2] * face.center[2];
    if (Math.abs(offset - planeOffset) > 1e-6) return false;
  }
  return true;
}

function attachFaceDescendantMetadata(
  face: FaceRef,
  semantic: FaceDescendantSemantic,
  memberNames: string[],
  coplanar: boolean,
): FaceRef {
  return {
    ...face,
    descendant: createFaceDescendantMetadata(semantic, memberNames, coplanar),
  };
}

function representativeFaceForMembers(
  name: string,
  faces: FaceRef[],
  query: FaceQueryRef | undefined,
  semantic: FaceDescendantSemantic,
): FaceRef {
  const cloned = faces.map((face) => cloneFaceRefValue(face));
  const first = cloned[0];
  const coplanar = facesAreCoplanar(cloned);
  const center = cloned.reduce<[number, number, number]>(
    (acc, face) => [
      acc[0] + face.center[0],
      acc[1] + face.center[1],
      acc[2] + face.center[2],
    ],
    [0, 0, 0],
  );
  const count = Math.max(cloned.length, 1);
  const representative: FaceRef = {
    ...first,
    name,
    center: [center[0] / count, center[1] / count, center[2] / count],
    query: cloneFaceQueryRef(query),
    planar: coplanar ? first.planar : false,
    uAxis: coplanar ? first.uAxis : undefined,
    vAxis: coplanar ? first.vAxis : undefined,
  };
  return attachFaceDescendantMetadata(
    representative,
    semantic,
    cloned.map((face) => face.name),
    coplanar,
  );
}

function cloneFaceTable(table: FaceTable): FaceTable {
  return {
    faces: new Map(Array.from(table.faces.entries(), ([name, face]) => [name, cloneFaceRefValue(face)])),
    blockedNames: new Map(table.blockedNames),
    supportedQueries: table.supportedQueries.map((query) => cloneFaceQueryRef(query)!),
    blockedQueries: table.blockedQueries.map((entry) => ({
      query: cloneFaceQueryRef(entry.query)!,
      reason: entry.reason,
    })),
  };
}

function queryListHas(list: FaceQueryRef[], query: FaceQueryRef | undefined): boolean {
  if (!query) return false;
  return list.some((candidate) => faceQueryRefsEqual(candidate, query));
}

function blockedQueryHas(list: BlockedFaceQuery[], query: FaceQueryRef | undefined): boolean {
  if (!query) return false;
  return list.some((candidate) => faceQueryRefsEqual(candidate.query, query));
}

function registerSupportedQuery(table: FaceTable, query: FaceQueryRef | undefined): void {
  if (!query || queryListHas(table.supportedQueries, query)) return;
  table.supportedQueries.push(cloneFaceQueryRef(query)!);
}

function registerBlockedQuery(table: FaceTable, query: FaceQueryRef | undefined, reason: string): void {
  if (!query || blockedQueryHas(table.blockedQueries, query)) return;
  table.blockedQueries.push({
    query: cloneFaceQueryRef(query)!,
    reason,
  });
}

function removeSupportedQuery(table: FaceTable, query: FaceQueryRef | undefined): void {
  if (!query) return;
  table.supportedQueries = table.supportedQueries.filter((candidate) => !faceQueryRefsEqual(candidate, query));
}

function registerFace(table: FaceTable, face: FaceRef): void {
  const next = cloneFaceRefValue(face);
  if (!next.descendant) {
    next.descendant = createFaceDescendantMetadata('face', [next.name], next.planar !== false);
  }
  table.faces.set(next.name, next);
  registerSupportedQuery(table, face.query);
}

function setFaceQuery(table: FaceTable, name: string, query: FaceQueryRef, alias?: FaceQueryRef): void {
  const face = table.faces.get(name);
  if (!face) return;
  face.query = cloneFaceQueryRef(query);
  table.faces.set(name, face);
  registerSupportedQuery(table, query);
  registerSupportedQuery(table, alias);
}

function setFaceDescendant(
  table: FaceTable,
  name: string,
  query: FaceQueryRef,
  semantic: FaceDescendantSemantic,
  alias?: FaceQueryRef,
): void {
  const face = table.faces.get(name);
  if (!face) return;
  face.query = cloneFaceQueryRef(query);
  face.descendant = createFaceDescendantMetadata(semantic, [name], face.planar !== false);
  table.faces.set(name, face);
  registerSupportedQuery(table, query);
  registerSupportedQuery(table, alias);
}

function blockNamedFace(table: FaceTable, name: string, reason: string): void {
  const face = table.faces.get(name);
  if (face) {
    removeSupportedQuery(table, face.query);
    registerBlockedQuery(table, face.query, reason);
    table.faces.delete(name);
  }
  table.blockedNames.set(name, reason);
}

function maskNamedFace(table: FaceTable, name: string, reason: string): void {
  if (table.faces.has(name)) {
    table.faces.delete(name);
  }
  table.blockedNames.set(name, reason);
}

function blockNamedFaceByQuery(table: FaceTable, query: FaceQueryRef | undefined, reason: string): void {
  if (!query) return;
  removeSupportedQuery(table, query);
  registerBlockedQuery(table, query, reason);
  for (const [name, face] of table.faces.entries()) {
    if (faceQueryRefsEqual(face.query, query)) {
      removeSupportedQuery(table, face.query);
      table.faces.delete(name);
      table.blockedNames.set(name, reason);
    }
  }
}

function applyMatrixToFace(face: FaceRef, matrix: Mat4): FaceRef {
  const tx = Transform.from(matrix);
  return {
    ...face,
    center: tx.point(face.center),
    normal: normalizeAxis(tx.vector(face.normal)),
    query: cloneFaceQueryRef(face.query),
    uAxis: face.uAxis ? normalizeAxis(tx.vector(face.uAxis)) : undefined,
    vAxis: face.vAxis ? normalizeAxis(tx.vector(face.vAxis)) : undefined,
  };
}

function applyMatrixToFaceTable(table: FaceTable, matrix: Mat4): FaceTable {
  const out = cloneFaceTable(table);
  out.faces = new Map(Array.from(out.faces.entries(), ([name, face]) => [name, applyMatrixToFace(face, matrix)]));
  return out;
}

function canonicalShapeStepMatrix(step: ShapeCompileTransformStep): Mat4 {
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
      return mirrorMatrix([step.normalX, step.normalY, step.normalZ]);
    case 'workplanePlacement':
      return [...step.matrix] as Mat4;
  }
}

function mirrorMatrix(normal: [number, number, number]): Mat4 {
  const len = Math.hypot(normal[0], normal[1], normal[2]);
  if (len < 1e-12) return Transform.identity().toArray();
  const nx = normal[0] / len;
  const ny = normal[1] / len;
  const nz = normal[2] / len;
  return [
    1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * nz, 0,
    -2 * ny * nx, 1 - 2 * ny * ny, -2 * ny * nz, 0,
    -2 * nz * nx, -2 * nz * ny, 1 - 2 * nz * nz, 0,
    0, 0, 0, 1,
  ];
}

function profileTransformMatrix(transforms: ProfileCompileTransformStep[]): Mat4 {
  let tx = Transform.identity();
  for (const step of transforms) {
    switch (step.kind) {
      case 'translate':
        tx = tx.translate(step.x, step.y, 0);
        break;
      case 'rotate':
        tx = tx.rotateAxis([0, 0, 1], step.degrees);
        break;
      case 'scale':
        tx = tx.scale([step.x, step.y, 1]);
        break;
      case 'mirror':
        tx = tx.mul(mirrorMatrix([step.normalX, step.normalY, 0]));
        break;
    }
  }
  return tx.toArray();
}

function profilePoint(matrix: Mat4, x: number, y: number): Vec2 {
  const point = Transform.from(matrix).point([x, y, 0]);
  return [point[0], point[1]];
}

function midpoint2d(a: Vec2, b: Vec2): Vec2 {
  return [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
}

function averageVec3(points: Vec3[]): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  const sum = points.reduce<Vec3>(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]],
    [0, 0, 0],
  );
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

function scalePoint2d(point: Vec2, scale: [number, number]): Vec2 {
  return [point[0] * scale[0], point[1] * scale[1]];
}

function pointOnWorkplane(
  origin: Vec3,
  workplaneU: Vec3,
  workplaneV: Vec3,
  u: number,
  v: number,
  depthDir?: Vec3,
  depth = 0,
): Vec3 {
  return [
    origin[0] + workplaneU[0] * u + workplaneV[0] * v + (depthDir?.[0] ?? 0) * depth,
    origin[1] + workplaneU[1] * u + workplaneV[1] * v + (depthDir?.[1] ?? 0) * depth,
    origin[2] + workplaneU[2] * u + workplaneV[2] * v + (depthDir?.[2] ?? 0) * depth,
  ];
}

function normalize2d(vec: Vec2): Vec2 {
  const len = Math.hypot(vec[0], vec[1]);
  if (len < 1e-12) return [1, 0];
  return [vec[0] / len, vec[1] / len];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function orthonormalBasisFromNormal(normal: Vec3): { u: Vec3; v: Vec3 } {
  const n = normalizeAxis(normal);
  const seed: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = normalizeAxis(cross3(seed, n));
  const v = normalizeAxis(cross3(n, u));
  return { u, v };
}

function faceFrom2DEdge(
  name: string,
  start: Vec2,
  end: Vec2,
  zMid: number,
  ownerQuery: FaceQueryRef | undefined,
): FaceRef {
  const tangent = normalize2d([end[0] - start[0], end[1] - start[1]]);
  const normal2d: Vec2 = [tangent[1], -tangent[0]];
  const center2d = midpoint2d(start, end);
  return {
    name,
    normal: [normal2d[0], normal2d[1], 0],
    center: [center2d[0], center2d[1], zMid],
    planar: true,
    uAxis: [tangent[0], tangent[1], 0],
    vAxis: [0, 0, 1],
    query: cloneFaceQueryRef(ownerQuery),
  };
}

function createTrackedFaceQuery(name: string, owner: ShapeQueryOwner | null): FaceQueryRef | undefined {
  if (!owner) return undefined;
  return {
    kind: 'tracked-face',
    faceName: name,
    owner,
  };
}

function buildBoxFaceTable(plan: Extract<ShapeCompilePlan, { kind: 'box' }>, owner: ShapeQueryOwner | null): FaceTable {
  const table = emptyFaceTable();
  const minX = plan.center ? -plan.x / 2 : 0;
  const minY = plan.center ? -plan.y / 2 : 0;
  const maxX = minX + plan.x;
  const maxY = minY + plan.y;
  const zBot = plan.center ? -plan.z / 2 : 0;
  const zTop = zBot + plan.z;
  const bl: Vec2 = [minX, minY];
  const br: Vec2 = [maxX, minY];
  const tr: Vec2 = [maxX, maxY];
  const tl: Vec2 = [minX, maxY];
  const topQuery = createTrackedFaceQuery('top', owner);
  const bottomQuery = createTrackedFaceQuery('bottom', owner);

  registerFace(table, {
    name: 'top',
    normal: [0, 0, 1],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, zTop],
    planar: true,
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    query: topQuery,
  });
  registerFace(table, {
    name: 'bottom',
    normal: [0, 0, -1],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, zBot],
    planar: true,
    uAxis: [1, 0, 0],
    vAxis: [0, -1, 0],
    query: bottomQuery,
  });

  registerFace(table, {
    ...faceFrom2DEdge('side-bottom', bl, br, (zTop + zBot) / 2, createTrackedFaceQuery('side-bottom', owner)),
  });
  registerFace(table, {
    ...faceFrom2DEdge('side-right', br, tr, (zTop + zBot) / 2, createTrackedFaceQuery('side-right', owner)),
  });
  registerFace(table, {
    ...faceFrom2DEdge('side-top', tr, tl, (zTop + zBot) / 2, createTrackedFaceQuery('side-top', owner)),
  });
  registerFace(table, {
    ...faceFrom2DEdge('side-left', tl, bl, (zTop + zBot) / 2, createTrackedFaceQuery('side-left', owner)),
  });
  return table;
}

function buildCylinderFaceTable(
  plan: Extract<ShapeCompilePlan, { kind: 'cylinder' }>,
  owner: ShapeQueryOwner | null,
): FaceTable {
  const table = emptyFaceTable();
  const zBot = plan.center ? -plan.height / 2 : 0;
  const zTop = zBot + plan.height;
  const radiusTop = plan.radiusTop ?? plan.radius;
  const sideRadius = (Math.abs(plan.radius) + Math.abs(radiusTop)) / 2;

  registerFace(table, {
    name: 'top',
    normal: [0, 0, 1],
    center: [0, 0, zTop],
    planar: true,
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
    query: createTrackedFaceQuery('top', owner),
  });
  registerFace(table, {
    name: 'bottom',
    normal: [0, 0, -1],
    center: [0, 0, zBot],
    planar: true,
    uAxis: [1, 0, 0],
    vAxis: [0, -1, 0],
    query: createTrackedFaceQuery('bottom', owner),
  });
  registerFace(table, {
    name: 'side',
    normal: [1, 0, 0],
    center: [sideRadius, 0, (zTop + zBot) / 2],
    planar: false,
    query: createTrackedFaceQuery('side', owner),
  });
  return table;
}

function buildRectExtrudeFaceTable(
  profile: Extract<ProfileCompilePlan, { kind: 'rect' | 'roundedRect' }>,
  height: number,
  center: boolean,
  owner: ShapeQueryOwner | null,
): FaceTable {
  const matrix = profileTransformMatrix(profile.transforms);
  const minX = profile.center ? -profile.width / 2 : 0;
  const minY = profile.center ? -profile.height / 2 : 0;
  const maxX = minX + profile.width;
  const maxY = minY + profile.height;
  const bl = profilePoint(matrix, minX, minY);
  const br = profilePoint(matrix, maxX, minY);
  const tr = profilePoint(matrix, maxX, maxY);
  const tl = profilePoint(matrix, minX, maxY);
  const center2d = midpoint2d(bl, tr);
  const zBot = center ? -height / 2 : 0;
  const zTop = zBot + height;
  const topU = normalizeAxis([br[0] - bl[0], br[1] - bl[1], 0]);
  const topV = normalizeAxis([tl[0] - bl[0], tl[1] - bl[1], 0]);
  const table = emptyFaceTable();

  registerFace(table, {
    name: 'top',
    normal: [0, 0, 1],
    center: [center2d[0], center2d[1], zTop],
    planar: true,
    uAxis: topU,
    vAxis: topV,
    query: createTrackedFaceQuery('top', owner),
  });
  registerFace(table, {
    name: 'bottom',
    normal: [0, 0, -1],
    center: [center2d[0], center2d[1], zBot],
    planar: true,
    uAxis: topU,
    vAxis: [-topV[0], -topV[1], -topV[2]],
    query: createTrackedFaceQuery('bottom', owner),
  });
  registerFace(table, faceFrom2DEdge('side-bottom', bl, br, (zTop + zBot) / 2, createTrackedFaceQuery('side-bottom', owner)));
  registerFace(table, faceFrom2DEdge('side-right', br, tr, (zTop + zBot) / 2, createTrackedFaceQuery('side-right', owner)));
  registerFace(table, faceFrom2DEdge('side-top', tr, tl, (zTop + zBot) / 2, createTrackedFaceQuery('side-top', owner)));
  registerFace(table, faceFrom2DEdge('side-left', tl, bl, (zTop + zBot) / 2, createTrackedFaceQuery('side-left', owner)));
  return table;
}

function buildCircleExtrudeFaceTable(
  profile: Extract<ProfileCompilePlan, { kind: 'circle' }>,
  height: number,
  center: boolean,
  owner: ShapeQueryOwner | null,
): FaceTable {
  const table = emptyFaceTable();
  const matrix = profileTransformMatrix(profile.transforms);
  const origin = Transform.from(matrix).point([0, 0, 0]);
  const sidePoint = Transform.from(matrix).point([profile.radius, 0, 0]);
  const sideNormal = normalizeAxis([sidePoint[0] - origin[0], sidePoint[1] - origin[1], 0]);
  const xAxis = normalizeAxis(Transform.from(matrix).vector([1, 0, 0]));
  const yAxis = normalizeAxis(Transform.from(matrix).vector([0, 1, 0]));
  const zBot = center ? -height / 2 : 0;
  const zTop = zBot + height;

  registerFace(table, {
    name: 'top',
    normal: [0, 0, 1],
    center: [origin[0], origin[1], zTop],
    planar: true,
    uAxis: xAxis,
    vAxis: yAxis,
    query: createTrackedFaceQuery('top', owner),
  });
  registerFace(table, {
    name: 'bottom',
    normal: [0, 0, -1],
    center: [origin[0], origin[1], zBot],
    planar: true,
    uAxis: xAxis,
    vAxis: [-yAxis[0], -yAxis[1], -yAxis[2]],
    query: createTrackedFaceQuery('bottom', owner),
  });
  registerFace(table, {
    name: 'side',
    normal: sideNormal,
    center: [sidePoint[0], sidePoint[1], (zTop + zBot) / 2],
    planar: false,
    query: createTrackedFaceQuery('side', owner),
  });
  return table;
}

function buildExtrudeFaceTable(
  plan: Extract<ShapeCompilePlan, { kind: 'extrude' }>,
  owner: ShapeQueryOwner | null,
): FaceTable {
  switch (plan.profile.kind) {
    case 'rect':
    case 'roundedRect':
      return buildRectExtrudeFaceTable(plan.profile, plan.height, plan.center, owner);
    case 'circle':
      return buildCircleExtrudeFaceTable(plan.profile, plan.height, plan.center, owner);
    default:
      return emptyFaceTable();
  }
}

type AnyTopologyRewritePropagation = Extract<
  ShapeCompilePlan,
  { kind: 'shell' | 'hole' | 'cut' | 'boolean' | 'trimByPlane' | 'fillet' | 'chamfer' | 'hull' }
>['queryPropagation'];

function findCreatedFaceQuery(
  propagation: AnyTopologyRewritePropagation,
  slot: string,
): FaceQueryRef | undefined {
  return propagation?.createdFaces.find((entry) => entry.query.slot === slot)?.query;
}

function findFaceDescendantContract(
  propagation: AnyTopologyRewritePropagation,
  query: FaceQueryRef | undefined,
): TopologyRewriteFaceDescendantContract | undefined {
  if (!query) return undefined;
  return propagation?.descendants.find((entry): entry is TopologyRewriteFaceDescendantContract =>
    entry.queryKind === 'face' && faceQueryRefsEqual(entry.query, query),
  );
}

function findPreservedFaceQuery(
  propagation: AnyTopologyRewritePropagation,
  source: FaceQueryRef | undefined,
): FaceQueryRef | undefined {
  if (!source) return undefined;
  return propagation?.preservedFaces.find((entry) => faceQueryRefsEqual(entry.query.source, source))?.query;
}

function shellInnerFaceName(baseName: string): string {
  return `inner-${baseName}`;
}

function shellCreatedFaceNames(basePlan: ShapeCompilePlan, openFaces: string[]): string[] {
  const baseTable = resolveShapeFaceTable(basePlan);
  const created: string[] = [];
  for (const name of baseTable.faces.keys()) {
    if (!openFaces.includes(name)) {
      created.push(shellInnerFaceName(name));
    }
  }
  return created;
}

function holeCreatedFaceNames(hole: HoleCompilePlan, extent: FeatureCutExtent): string[] {
  const names = ['wall'];
  if (hole.counterbore) {
    names.push('counterbore-wall', 'counterbore-floor');
  }
  if (hole.countersink) {
    names.push('countersink-wall');
  }
  if (featureCutExtentForwardSide(extent).kind === 'blind') names.push('floor');
  if (featureCutExtentReverseSide(extent)?.kind === 'blind') names.push('cap');
  return names;
}

function cutCreatedFaceNames(
  profile: ProfileCompilePlan,
  extent: FeatureCutExtent,
  _taper?: CutTaperCompilePlan,
): string[] {
  const names = (() => {
    switch (profile.kind) {
      case 'circle':
        return ['wall'];
      case 'rect':
      case 'roundedRect':
        return ['wall-bottom', 'wall-right', 'wall-top', 'wall-left'];
      default:
        return [];
    }
  })();
  if (featureCutExtentForwardSide(extent).kind === 'blind') names.push('floor');
  if (featureCutExtentReverseSide(extent)?.kind === 'blind') names.push('cap');
  return names;
}

function holeCreatedEdgeNames(hole: HoleCompilePlan, extent: FeatureCutExtent): string[] {
  const names = ['entry-rim', 'forward-end-rim'];
  if (featureCutExtentReverseSide(extent)) {
    names.push('reverse-end-rim');
  }
  if (hole.counterbore || hole.countersink) {
    names.push('head-transition-rim');
  }
  return names;
}

function cutCreatedEdgeNames(
  profile: ProfileCompilePlan,
  extent: FeatureCutExtent,
  taper?: CutTaperCompilePlan,
): string[] {
  if (cutCreatedFaceNames(profile, extent, taper).length === 0) return [];
  const names = ['entry-rim', 'forward-end-rim'];
  if (featureCutExtentReverseSide(extent)) {
    names.push('reverse-end-rim');
  }
  return names;
}

function selectedFaceNamesFromQuery(baseTable: FaceTable, query: FaceQueryRef | undefined): string[] {
  if (!query) return [];
  const available = new Set(baseTable.faces.keys());
  const direct = (() => {
    switch (query.kind) {
      case 'tracked-face':
        return [query.faceName];
      case 'face-ref':
        return query.faceName ? [query.faceName] : [];
      case 'canonical-face':
        switch (query.face) {
          case 'front':
            return available.has('side-bottom') ? ['side-bottom'] : (available.has('side') ? ['side'] : []);
          case 'back':
            return available.has('side-top') ? ['side-top'] : (available.has('side') ? ['side'] : []);
          case 'left':
            return available.has('side-left') ? ['side-left'] : (available.has('side') ? ['side'] : []);
          case 'right':
            return available.has('side-right') ? ['side-right'] : (available.has('side') ? ['side'] : []);
          case 'top':
            return available.has('top') ? ['top'] : [];
          case 'bottom':
            return available.has('bottom') ? ['bottom'] : [];
        }
      case 'created-face':
        return [query.slot];
      case 'propagated-face':
        return selectedFaceNamesFromQuery(baseTable, query.source);
    }
  })();
  return direct.filter((name, index) => available.has(name) && direct.indexOf(name) === index);
}

function oppositeFaceNames(name: string, available: Set<string>): string[] {
  switch (name) {
    case 'top':
      return available.has('bottom') ? ['bottom'] : [];
    case 'bottom':
      return available.has('top') ? ['top'] : [];
    case 'side-bottom':
      return available.has('side-top') ? ['side-top'] : [];
    case 'side-top':
      return available.has('side-bottom') ? ['side-bottom'] : [];
    case 'side-left':
      return available.has('side-right') ? ['side-right'] : [];
    case 'side-right':
      return available.has('side-left') ? ['side-left'] : [];
    case 'side':
      return available.has('side') ? ['side'] : [];
    default:
      return [];
  }
}

function featureBlockedFaceReason(operation: 'hole' | 'cut', reason: FeatureBlockedFaceReason): string {
  switch (reason) {
    case 'host':
      return `This selected host face is rewritten by the ${operation} result and is not a defended named face target.`;
    case 'through-exit':
      return `This opposite face is pierced by the through-${operation} and is not a defended named face target.`;
    case 'up-to-face-target':
      return `This selected up-to-face termination face is rewritten by the ${operation} result and is not a defended named face target.`;
  }
}

function blockedFaceReasonPriority(reason: FeatureBlockedFaceReason): number {
  switch (reason) {
    case 'host':
      return 3;
    case 'up-to-face-target':
      return 2;
    case 'through-exit':
      return 1;
  }
}

function holeHeadDepth(hole: HoleCompilePlan): number {
  return hole.counterbore?.depth ?? hole.countersink?.depth ?? 0;
}

function holeWallMidDepth(hole: HoleCompilePlan, extent: FeatureCutExtent): number {
  const reverseDepth = featureCutExtentReverseSide(extent)?.depth ?? 0;
  if (reverseDepth > 0) {
    return (featureCutExtentForwardSide(extent).depth - reverseDepth) / 2;
  }
  const entryDepth = holeHeadDepth(hole);
  return entryDepth + Math.max(featureCutExtentForwardSide(extent).depth - entryDepth, 0) / 2;
}

function cutWallMidDepth(extent: FeatureCutExtent): number {
  const reverseDepth = featureCutExtentReverseSide(extent)?.depth ?? 0;
  return (featureCutExtentForwardSide(extent).depth - reverseDepth) / 2;
}

export function blockedShapeFacesForFeature(
  basePlan: ShapeCompilePlan | null,
  source: FaceQueryRef | undefined,
  extent: FeatureCutExtent,
): BlockedShapeFaceEntry[] {
  if (!basePlan) return [];
  const table = resolveShapeFaceTable(basePlan);
  const available = new Set(table.faces.keys());
  const blocked = new Map<string, FeatureBlockedFaceReason>();
  const register = (name: string, reason: FeatureBlockedFaceReason) => {
    const existing = blocked.get(name);
    if (!existing || blockedFaceReasonPriority(reason) > blockedFaceReasonPriority(existing)) {
      blocked.set(name, reason);
    }
  };

  const selectedNames = selectedFaceNamesFromQuery(table, source);
  const forward = featureCutExtentForwardSide(extent);
  for (const name of selectedNames) {
    register(name, 'host');
    if (forward.kind === 'through') {
      for (const opposite of oppositeFaceNames(name, available)) {
        register(opposite, 'through-exit');
      }
    }
  }

  if (forward.kind === 'upToFace') {
    for (const name of selectedFaceNamesFromQuery(table, forward.face)) {
      register(name, 'up-to-face-target');
    }
  }

  const reverse = featureCutExtentReverseSide(extent);
  if (reverse?.kind === 'upToFace') {
    for (const name of selectedFaceNamesFromQuery(table, reverse.face)) {
      register(name, 'up-to-face-target');
    }
  }

  return Array.from(blocked.entries())
    .map(([name, reason]) => ({ name, reason }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function faceOwnerMatches(face: FaceRef, owner: ShapeQueryOwner | undefined): boolean {
  if (!owner) return true;
  return shapeQueryOwnersEqual(face.query?.owner, owner);
}

function faceMatchesQuery(table: FaceTable, name: string, face: FaceRef, query: FaceQueryRef): boolean {
  switch (query.kind) {
    case 'tracked-face':
      return name === query.faceName && faceOwnerMatches(face, query.owner);
    case 'face-ref':
      return (query.faceName == null || name === query.faceName) && faceOwnerMatches(face, query.owner);
    case 'canonical-face':
      return selectedFaceNamesFromQuery(table, query).includes(name) && faceOwnerMatches(face, query.owner);
    case 'created-face':
      return name === query.slot && faceOwnerMatches(face, query.owner);
    case 'propagated-face':
      return faceQueryRefsEqual(face.query, query) || faceMatchesQuery(table, name, face, query.source);
  }
}

function faceMatchesForQuery(table: FaceTable, query: FaceQueryRef | undefined): FaceMatch[] {
  if (!query) return [];
  const seen = new Set<string>();
  const matches: FaceMatch[] = [];
  for (const [name, face] of table.faces.entries()) {
    if (seen.has(name)) continue;
    if (!faceMatchesQuery(table, name, face, query)) continue;
    seen.add(name);
    matches.push({
      name,
      face: cloneFaceRefValue(face),
    });
  }
  return matches;
}

function findBooleanPropagationMatches(
  operandTables: FaceTable[],
  query: FaceQueryRef | undefined,
): FaceMatch[] {
  return operandTables.flatMap((table) => faceMatchesForQuery(table, query));
}

function sharedMatchName(matches: FaceMatch[]): string | null {
  if (matches.length === 0) return null;
  const names = [...new Set(matches.map((match) => match.name))];
  return names.length === 1 ? names[0] : null;
}

function booleanNamedFaceConflictReason(name: string): string {
  return `Multiple defended propagated descendants now answer to "${name}", so Forge requires an explicit FaceRef/query target instead of guessing one named face.`;
}

function booleanBlockedFaceReason(note: string | undefined, fallback: string): string {
  return note ?? fallback;
}

function pushNamedFaceCandidate(
  out: Map<string, NamedFaceCandidate[]>,
  candidate: NamedFaceCandidate,
): void {
  const existing = out.get(candidate.name);
  if (existing) {
    existing.push(candidate);
    return;
  }
  out.set(candidate.name, [candidate]);
}

function registerNamedFaceCandidates(
  table: FaceTable,
  candidates: Map<string, NamedFaceCandidate[]>,
  owner: ShapeQueryOwner | undefined,
): void {
  for (const [name, entries] of candidates.entries()) {
    const representativeQuery = entries.length === 1
      ? entries[0].query
      : {
        kind: 'face-ref',
        faceName: name,
        owner: cloneShapeQueryOwner(owner),
      } satisfies FaceQueryRef;
    const semantic = entries.some((entry) => entry.semantic === 'region')
      ? 'region'
      : entries.length > 1
        ? 'set'
        : entries[0].semantic;
    const representative = representativeFaceForMembers(
      name,
      entries.map((entry) => entry.face),
      representativeQuery,
      semantic,
    );
    registerFace(table, representative);
    for (const entry of entries) {
      registerSupportedQuery(table, entry.query);
      for (const alias of entry.aliases) {
        registerSupportedQuery(table, alias);
      }
    }
    if (entries.length > 1) {
      registerSupportedQuery(table, representativeQuery);
    }
  }
}

function resolveShapeFaceTableInternal(plan: ShapeCompilePlan | null, owner: ShapeQueryOwner | null): FaceTable {
  if (!plan) return emptyFaceTable();

  switch (plan.kind) {
    case 'queryOwner':
      return resolveShapeFaceTableInternal(plan.base, owner ?? plan.owner);
    case 'transform': {
      let table = resolveShapeFaceTableInternal(plan.base, owner);
      for (const step of plan.steps) {
        table = applyMatrixToFaceTable(table, canonicalShapeStepMatrix(step));
      }
      return table;
    }
    case 'box':
      return buildBoxFaceTable(plan, owner);
    case 'cylinder':
      return buildCylinderFaceTable(plan, owner);
    case 'extrude':
      return buildExtrudeFaceTable(plan, owner);
    case 'sheetMetal': {
      const table = emptyFaceTable();
      for (const descriptor of describeSheetMetalFaces(plan.model, plan.output)) {
        registerFace(table, {
          name: descriptor.name,
          normal: cloneVec3(descriptor.normal),
          center: cloneVec3(descriptor.center),
          planar: descriptor.planar,
          uAxis: descriptor.uAxis ? cloneVec3(descriptor.uAxis) : undefined,
          vAxis: descriptor.vAxis ? cloneVec3(descriptor.vAxis) : undefined,
          query: createTrackedFaceQuery(descriptor.name, owner),
          descendant: createFaceDescendantMetadata(
            descriptor.semantic,
            descriptor.memberNames,
            descriptor.coplanar,
          ),
        });
      }
      return table;
    }
    case 'shell': {
      // Rewrite results must inherit the base shape's existing defended query
      // table before layering new propagation on top. Rebasing the base table
      // under the current rewrite owner collapses preserved lineage between
      // stacked rewrites.
      const baseTable = cloneFaceTable(resolveShapeFaceTable(plan.base));
      for (const [name, face] of baseTable.faces.entries()) {
        const propagated = findPreservedFaceQuery(plan.queryPropagation, face.query);
        if (propagated) setFaceQuery(baseTable, name, propagated, face.query);
      }
      for (const createdName of shellCreatedFaceNames(plan.base, plan.openFaces)) {
        const baseName = createdName.slice('inner-'.length);
        const baseFace = baseTable.faces.get(baseName);
        const createdQuery = findCreatedFaceQuery(plan.queryPropagation, createdName);
        if (!baseFace || !createdQuery) continue;
        registerFace(baseTable, {
          ...cloneFaceRefValue(baseFace),
          name: createdName,
          center: [
            baseFace.center[0] - baseFace.normal[0] * plan.thickness,
            baseFace.center[1] - baseFace.normal[1] * plan.thickness,
            baseFace.center[2] - baseFace.normal[2] * plan.thickness,
          ],
          normal: [-baseFace.normal[0], -baseFace.normal[1], -baseFace.normal[2]],
          uAxis: baseFace.uAxis ? cloneVec3(baseFace.uAxis) : undefined,
          vAxis: baseFace.vAxis ? [-baseFace.vAxis[0], -baseFace.vAxis[1], -baseFace.vAxis[2]] : undefined,
          query: createdQuery,
        });
      }
      return baseTable;
    }
    case 'hole': {
      const table = cloneFaceTable(resolveShapeFaceTable(plan.base));
      for (const [name, face] of table.faces.entries()) {
        const propagated = findPreservedFaceQuery(plan.queryPropagation, face.query);
        const contract = findFaceDescendantContract(plan.queryPropagation, propagated);
        if (propagated && contract?.kind === 'face-region') {
          setFaceDescendant(table, name, propagated, 'region', face.query);
          continue;
        }
        if (propagated) setFaceQuery(table, name, propagated, face.query);
      }
      for (const blocked of blockedShapeFacesForFeature(plan.base, plan.placement.placement.workplane.source, plan.extent)) {
        const face = table.faces.get(blocked.name);
        if (face?.descendant?.semantic === 'region') continue;
        const regionQuery = face ? findPreservedFaceQuery(plan.queryPropagation, face.query) : undefined;
        if (face && regionQuery) {
          setFaceDescendant(table, blocked.name, regionQuery, 'region', face.query);
          continue;
        }
        blockNamedFace(table, blocked.name, featureBlockedFaceReason('hole', blocked.reason));
      }

      const workplane = plan.placement.placement.workplane;
      const origin = workplane.origin;
      const inward: Vec3 = [-workplane.normal[0], -workplane.normal[1], -workplane.normal[2]];
      const forward = featureCutExtentForwardSide(plan.extent);
      const reverse = featureCutExtentReverseSide(plan.extent);
      const wallQuery = findCreatedFaceQuery(plan.queryPropagation, 'wall');
      if (wallQuery) {
        const wallMidDepth = holeWallMidDepth(plan.hole, plan.extent);
        registerFace(table, {
          name: 'wall',
          normal: [-workplane.u[0], -workplane.u[1], -workplane.u[2]],
          center: [
            origin[0] + workplane.u[0] * plan.hole.radius + inward[0] * wallMidDepth,
            origin[1] + workplane.u[1] * plan.hole.radius + inward[1] * wallMidDepth,
            origin[2] + workplane.u[2] * plan.hole.radius + inward[2] * wallMidDepth,
          ],
          planar: false,
          query: wallQuery,
        });
      }
      const counterboreWallQuery = findCreatedFaceQuery(plan.queryPropagation, 'counterbore-wall');
      if (counterboreWallQuery && plan.hole.counterbore) {
        registerFace(table, {
          name: 'counterbore-wall',
          normal: [-workplane.u[0], -workplane.u[1], -workplane.u[2]],
          center: [
            origin[0] + workplane.u[0] * plan.hole.counterbore.radius + inward[0] * (plan.hole.counterbore.depth / 2),
            origin[1] + workplane.u[1] * plan.hole.counterbore.radius + inward[1] * (plan.hole.counterbore.depth / 2),
            origin[2] + workplane.u[2] * plan.hole.counterbore.radius + inward[2] * (plan.hole.counterbore.depth / 2),
          ],
          planar: false,
          query: counterboreWallQuery,
        });
      }
      const counterboreFloorQuery = findCreatedFaceQuery(plan.queryPropagation, 'counterbore-floor');
      if (counterboreFloorQuery && plan.hole.counterbore) {
        registerFace(table, {
          name: 'counterbore-floor',
          normal: cloneVec3(workplane.normal),
          center: [
            origin[0] + inward[0] * plan.hole.counterbore.depth,
            origin[1] + inward[1] * plan.hole.counterbore.depth,
            origin[2] + inward[2] * plan.hole.counterbore.depth,
          ],
          planar: true,
          uAxis: cloneVec3(workplane.u),
          vAxis: cloneVec3(workplane.v),
          query: counterboreFloorQuery,
        });
      }
      const countersinkWallQuery = findCreatedFaceQuery(plan.queryPropagation, 'countersink-wall');
      if (countersinkWallQuery && plan.hole.countersink) {
        const sinkMidDepth = plan.hole.countersink.depth / 2;
        const sinkMidRadius = (plan.hole.radius + plan.hole.countersink.radius) / 2;
        registerFace(table, {
          name: 'countersink-wall',
          normal: [-workplane.u[0], -workplane.u[1], -workplane.u[2]],
          center: [
            origin[0] + workplane.u[0] * sinkMidRadius + inward[0] * sinkMidDepth,
            origin[1] + workplane.u[1] * sinkMidRadius + inward[1] * sinkMidDepth,
            origin[2] + workplane.u[2] * sinkMidRadius + inward[2] * sinkMidDepth,
          ],
          planar: false,
          query: countersinkWallQuery,
        });
      }
      const floorQuery = findCreatedFaceQuery(plan.queryPropagation, 'floor');
      if (floorQuery) {
        registerFace(table, {
          name: 'floor',
          normal: cloneVec3(workplane.normal),
          center: [
            origin[0] + inward[0] * forward.depth,
            origin[1] + inward[1] * forward.depth,
            origin[2] + inward[2] * forward.depth,
          ],
          planar: true,
          uAxis: cloneVec3(workplane.u),
          vAxis: cloneVec3(workplane.v),
          query: floorQuery,
        });
      }
      const capQuery = findCreatedFaceQuery(plan.queryPropagation, 'cap');
      if (capQuery && reverse?.kind === 'blind') {
        registerFace(table, {
          name: 'cap',
          normal: [-workplane.normal[0], -workplane.normal[1], -workplane.normal[2]],
          center: [
            origin[0] - inward[0] * reverse.depth,
            origin[1] - inward[1] * reverse.depth,
            origin[2] - inward[2] * reverse.depth,
          ],
          planar: true,
          uAxis: cloneVec3(workplane.u),
          vAxis: [-workplane.v[0], -workplane.v[1], -workplane.v[2]],
          query: capQuery,
        });
      }
      return table;
    }
    case 'cut': {
      const table = cloneFaceTable(resolveShapeFaceTable(plan.base));
      for (const [name, face] of table.faces.entries()) {
        const propagated = findPreservedFaceQuery(plan.queryPropagation, face.query);
        const contract = findFaceDescendantContract(plan.queryPropagation, propagated);
        if (propagated && contract?.kind === 'face-region') {
          setFaceDescendant(table, name, propagated, 'region', face.query);
          continue;
        }
        if (propagated) setFaceQuery(table, name, propagated, face.query);
      }
      for (const blocked of blockedShapeFacesForFeature(plan.base, plan.placement.placement.workplane.source, plan.extent)) {
        const face = table.faces.get(blocked.name);
        if (face?.descendant?.semantic === 'region') continue;
        const regionQuery = face ? findPreservedFaceQuery(plan.queryPropagation, face.query) : undefined;
        if (face && regionQuery) {
          setFaceDescendant(table, blocked.name, regionQuery, 'region', face.query);
          continue;
        }
        blockNamedFace(table, blocked.name, featureBlockedFaceReason('cut', blocked.reason));
      }

      const placement = plan.placement.placement;
      const origin = placement.workplane.origin;
      const depthDir: Vec3 = [
        -placement.workplane.normal[0],
        -placement.workplane.normal[1],
        -placement.workplane.normal[2],
      ];
      const forward = featureCutExtentForwardSide(plan.extent);
      const reverse = featureCutExtentReverseSide(plan.extent);
      const reverseDepth = reverse?.depth ?? 0;
      const depthMid = cutWallMidDepth(plan.extent);
      if (plan.profile.kind === 'circle') {
        const wallQuery = findCreatedFaceQuery(plan.queryPropagation, 'wall');
        if (wallQuery) {
          const hostRadius = plan.profile.radius;
          const endRadius = plan.taper ? hostRadius * plan.taper.scale[0] : hostRadius;
          const wallRadius = (hostRadius + endRadius) / 2;
          registerFace(table, {
            name: 'wall',
            normal: [-placement.workplane.u[0], -placement.workplane.u[1], -placement.workplane.u[2]],
            center: [
              origin[0] + placement.workplane.u[0] * wallRadius + depthDir[0] * depthMid,
              origin[1] + placement.workplane.u[1] * wallRadius + depthDir[1] * depthMid,
              origin[2] + placement.workplane.u[2] * wallRadius + depthDir[2] * depthMid,
            ],
            planar: false,
            query: wallQuery,
          });
        }
      }
      if (plan.profile.kind === 'rect' || plan.profile.kind === 'roundedRect') {
        const matrix = profileTransformMatrix(plan.profile.transforms);
        const minX = plan.profile.center ? -plan.profile.width / 2 : 0;
        const minY = plan.profile.center ? -plan.profile.height / 2 : 0;
        const maxX = minX + plan.profile.width;
        const maxY = minY + plan.profile.height;
        const hostBl = profilePoint(matrix, minX, minY);
        const hostBr = profilePoint(matrix, maxX, minY);
        const hostTr = profilePoint(matrix, maxX, maxY);
        const hostTl = profilePoint(matrix, minX, maxY);
        const forwardScale = plan.taper?.scale ?? [1, 1];
        const endBl = scalePoint2d(hostBl, forwardScale);
        const endBr = scalePoint2d(hostBr, forwardScale);
        const endTr = scalePoint2d(hostTr, forwardScale);
        const endTl = scalePoint2d(hostTl, forwardScale);
        const wallFaces: Array<{
          name: string;
          reverseStart: Vec2;
          reverseEnd: Vec2;
          forwardStart: Vec2;
          forwardEnd: Vec2;
        }> = [
          {
            name: 'wall-bottom',
            reverseStart: hostBl,
            reverseEnd: hostBr,
            forwardStart: endBl,
            forwardEnd: endBr,
          },
          {
            name: 'wall-right',
            reverseStart: hostBr,
            reverseEnd: hostTr,
            forwardStart: endBr,
            forwardEnd: endTr,
          },
          {
            name: 'wall-top',
            reverseStart: hostTr,
            reverseEnd: hostTl,
            forwardStart: endTr,
            forwardEnd: endTl,
          },
          {
            name: 'wall-left',
            reverseStart: hostTl,
            reverseEnd: hostBl,
            forwardStart: endTl,
            forwardEnd: endBl,
          },
        ];
        for (const wall of wallFaces) {
          const wallQuery = findCreatedFaceQuery(plan.queryPropagation, wall.name);
          if (!wallQuery) continue;
          const reverseStart3 = pointOnWorkplane(
            origin,
            placement.workplane.u,
            placement.workplane.v,
            wall.reverseStart[0],
            wall.reverseStart[1],
            depthDir,
            -reverseDepth,
          );
          const reverseEnd3 = pointOnWorkplane(
            origin,
            placement.workplane.u,
            placement.workplane.v,
            wall.reverseEnd[0],
            wall.reverseEnd[1],
            depthDir,
            -reverseDepth,
          );
          const forwardStart3 = pointOnWorkplane(
            origin,
            placement.workplane.u,
            placement.workplane.v,
            wall.forwardStart[0],
            wall.forwardStart[1],
            depthDir,
            forward.depth,
          );
          const forwardEnd3 = pointOnWorkplane(
            origin,
            placement.workplane.u,
            placement.workplane.v,
            wall.forwardEnd[0],
            wall.forwardEnd[1],
            depthDir,
            forward.depth,
          );
          const edgeVec = normalizeAxis([
            reverseEnd3[0] - reverseStart3[0],
            reverseEnd3[1] - reverseStart3[1],
            reverseEnd3[2] - reverseStart3[2],
          ]);
          const depthVec = normalizeAxis([
            forwardStart3[0] - reverseStart3[0],
            forwardStart3[1] - reverseStart3[1],
            forwardStart3[2] - reverseStart3[2],
          ]);
          const normal = normalizeAxis(cross3(edgeVec, depthVec));
          registerFace(table, {
            name: wall.name,
            normal,
            center: averageVec3([reverseStart3, reverseEnd3, forwardStart3, forwardEnd3]),
            planar: true,
            uAxis: edgeVec,
            vAxis: depthVec,
            query: wallQuery,
          });
        }
      }
      const floorQuery = findCreatedFaceQuery(plan.queryPropagation, 'floor');
      if (floorQuery) {
        const floorCenter = (() => {
          if (plan.profile.kind === 'rect' || plan.profile.kind === 'roundedRect') {
            const matrix = profileTransformMatrix(plan.profile.transforms);
            const minX = plan.profile.center ? -plan.profile.width / 2 : 0;
            const minY = plan.profile.center ? -plan.profile.height / 2 : 0;
            const maxX = minX + plan.profile.width;
            const maxY = minY + plan.profile.height;
            const center2d = midpoint2d(profilePoint(matrix, minX, minY), profilePoint(matrix, maxX, maxY));
            const scaledCenter = plan.taper ? scalePoint2d(center2d, plan.taper.scale) : center2d;
            return pointOnWorkplane(origin, placement.workplane.u, placement.workplane.v, scaledCenter[0], scaledCenter[1], depthDir, forward.depth);
          }
          return [
            origin[0] + depthDir[0] * forward.depth,
            origin[1] + depthDir[1] * forward.depth,
            origin[2] + depthDir[2] * forward.depth,
          ] as Vec3;
        })();
        registerFace(table, {
          name: 'floor',
          normal: cloneVec3(placement.workplane.normal),
          center: floorCenter,
          planar: true,
          uAxis: cloneVec3(placement.workplane.u),
          vAxis: cloneVec3(placement.workplane.v),
          query: floorQuery,
        });
      }
      const capQuery = findCreatedFaceQuery(plan.queryPropagation, 'cap');
      if (capQuery && reverse?.kind === 'blind') {
        registerFace(table, {
          name: 'cap',
          normal: [-placement.workplane.normal[0], -placement.workplane.normal[1], -placement.workplane.normal[2]],
          center: [
            origin[0] - depthDir[0] * reverse.depth,
            origin[1] - depthDir[1] * reverse.depth,
            origin[2] - depthDir[2] * reverse.depth,
          ],
          planar: true,
          uAxis: cloneVec3(placement.workplane.u),
          vAxis: [-placement.workplane.v[0], -placement.workplane.v[1], -placement.workplane.v[2]],
          query: capQuery,
        });
      }
      return table;
    }
    case 'sphere':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'hull':
    case 'fillet':
    case 'chamfer':
      return emptyFaceTable();
    case 'trimByPlane': {
      const table = emptyFaceTable();
      const planeCapQuery = findCreatedFaceQuery(plan.queryPropagation, 'plane-cap');
      if (!planeCapQuery) return table;
      const baseTable = resolveShapeFaceTable(plan.base);
      const centers = Array.from(baseTable.faces.values()).map((face) => face.center);
      const averageCenter = centers.length > 0
        ? centers.reduce<Vec3>(
          (acc, center) => [acc[0] + center[0], acc[1] + center[1], acc[2] + center[2]],
          [0, 0, 0],
        ).map((value) => value / centers.length) as Vec3
        : [0, 0, plan.originOffset] as Vec3;
      const normal = normalizeAxis([plan.normalX, plan.normalY, plan.normalZ]);
      const planeDistance = averageCenter[0] * normal[0] + averageCenter[1] * normal[1] + averageCenter[2] * normal[2] - plan.originOffset;
      const center: Vec3 = [
        averageCenter[0] - normal[0] * planeDistance,
        averageCenter[1] - normal[1] * planeDistance,
        averageCenter[2] - normal[2] * planeDistance,
      ];
      const basis = orthonormalBasisFromNormal(normal);
      registerFace(table, {
        name: 'plane-cap',
        normal,
        center,
        planar: true,
        uAxis: basis.u,
        vAxis: basis.v,
        query: planeCapQuery,
      });
      return table;
    }
    case 'boolean': {
      const table = emptyFaceTable();
      const operandTables = plan.shapes.map((shape) => resolveShapeFaceTable(shape));
      const propagation = plan.queryPropagation;
      if (!propagation) return table;
      const candidates = new Map<string, NamedFaceCandidate[]>();

      for (const entry of propagation.preservedFaces) {
        const query = cloneFaceQueryRef(entry.query)!;
        const matches = findBooleanPropagationMatches(operandTables, entry.query.source);
        const contract = findFaceDescendantContract(propagation, query);
        if (entry.status === 'ambiguous' && !contract) {
          const name = sharedMatchName(matches);
          const reason = booleanBlockedFaceReason(
            entry.note,
            'This propagated boolean face lineage is ambiguous and is not part of the defended named-face subset.',
          );
          for (const match of matches) {
            registerBlockedQuery(table, match.face.query, reason);
          }
          if (name) {
            maskNamedFace(table, name, reason);
          }
          registerBlockedQuery(table, entry.query, reason);
          registerBlockedQuery(table, entry.query.kind === 'propagated-face' ? entry.query.source : undefined, reason);
          continue;
        }

        const semantic = contract?.kind === 'face-region'
          ? 'region'
          : contract?.kind === 'face-set'
            ? 'set'
            : 'face';
        for (const match of matches) {
          pushNamedFaceCandidate(candidates, {
            name: match.name,
            face: cloneFaceRefValue(match.face),
            query,
            semantic,
            aliases: [
              query,
              ...(entry.query.kind === 'propagated-face' ? [entry.query.source] : []),
              ...(match.face.query ? [match.face.query] : []),
            ].filter((candidate): candidate is FaceQueryRef => candidate != null),
          });
        }
      }

      registerNamedFaceCandidates(table, candidates, propagation.owner);
      return table;
    }
    case 'opaque':
    case 'importedMesh':
      return emptyFaceTable();
  }
}

function resolveShapeFaceTable(plan: ShapeCompilePlan | null): FaceTable {
  return resolveShapeFaceTableInternal(plan, findShapePrimaryQueryOwner(plan));
}

export function listShapeFaceNames(plan: ShapeCompilePlan | null): string[] {
  return Array.from(resolveShapeFaceTable(plan).faces.keys()).sort();
}

export function listShapeFaceQueries(plan: ShapeCompilePlan | null): NamedShapeFaceQuery[] {
  const table = resolveShapeFaceTable(plan);
  return Array.from(table.faces.entries())
    .filter(([, face]) => face.query != null)
    .map(([name, face]) => ({ name, query: cloneFaceQueryRef(face.query)! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveShapeFace(plan: ShapeCompilePlan | null, name: string): FaceRef | null {
  const table = resolveShapeFaceTable(plan);
  const face = table.faces.get(name);
  if (face) return cloneFaceRefValue(face);
  return null;
}

export function explainMissingShapeFace(plan: ShapeCompilePlan | null, name: string): string {
  const table = resolveShapeFaceTable(plan);
  const blocked = table.blockedNames.get(name);
  if (blocked) return blocked;
  const available = Array.from(table.faces.keys()).sort();
  return `Face "${name}" is not available. Supported faces: ${available.join(', ') || 'none'}`;
}

export function validateShapeFaceQuery(plan: ShapeCompilePlan | null, query: FaceQueryRef | undefined): string | null {
  if (!query) return null;
  const table = resolveShapeFaceTable(plan);
  if (queryListHas(table.supportedQueries, query)) return null;
  const resolvedNames = selectedFaceNamesFromQuery(table, query);
  if (resolvedNames.some((name) => table.faces.has(name))) return null;
  for (const name of resolvedNames) {
    const blockedNameReason = table.blockedNames.get(name);
    if (blockedNameReason) return blockedNameReason;
  }
  const blocked = table.blockedQueries.find((entry) => faceQueryRefsEqual(entry.query, query));
  if (blocked) return blocked.reason;
  if (query.kind === 'created-face' || query.kind === 'propagated-face') {
    return 'This face query is not part of the target shape\'s defended face subset.';
  }
  if (resolvedNames.length === 0 && table.faces.size === 0 && table.blockedQueries.length === 0) {
    return null;
  }
  if (query.kind === 'tracked-face' || query.kind === 'canonical-face' || query.kind === 'face-ref') {
    return null;
  }
  return 'This face query is not part of the target shape\'s defended face subset.';
}

export function supportedShellCreatedFaceNames(
  basePlan: ShapeCompilePlan | null,
  openFaces: string[],
): string[] {
  if (!basePlan) return [];
  return shellCreatedFaceNames(basePlan, openFaces).sort();
}

export function supportedHoleCreatedFaceNames(
  hole: HoleCompilePlan,
  extent: FeatureCutExtent,
): string[] {
  return holeCreatedFaceNames(hole, extent);
}

export function supportedCutCreatedFaceNames(
  profile: ProfileCompilePlan,
  extent: FeatureCutExtent,
  taper?: CutTaperCompilePlan,
): string[] {
  return cutCreatedFaceNames(profile, extent, taper);
}

export function supportedHoleCreatedEdgeNames(
  hole: HoleCompilePlan,
  extent: FeatureCutExtent,
): string[] {
  return holeCreatedEdgeNames(hole, extent);
}

export function supportedCutCreatedEdgeNames(
  profile: ProfileCompilePlan,
  extent: FeatureCutExtent,
  taper?: CutTaperCompilePlan,
): string[] {
  return cutCreatedEdgeNames(profile, extent, taper);
}

export function preservedShapeFaceQueries(
  basePlan: ShapeCompilePlan | null,
): NamedShapeFaceQuery[] {
  return listShapeFaceQueries(basePlan);
}

export function blockedShapeFaceNamesForFeature(
  basePlan: ShapeCompilePlan | null,
  source: FaceQueryRef | undefined,
  extent: FeatureCutExtent,
): string[] {
  return blockedShapeFacesForFeature(basePlan, source, extent).map((entry) => entry.name);
}

export function selectedShapeFaceNamesForQuery(
  basePlan: ShapeCompilePlan | null,
  source: FaceQueryRef | undefined,
): string[] {
  if (!basePlan) return [];
  return selectedFaceNamesFromQuery(resolveShapeFaceTable(basePlan), source).sort();
}

export function shellCreatedFaceSource(
  basePlan: ShapeCompilePlan | null,
  createdFaceName: string,
): FaceQueryRef | undefined {
  if (!basePlan || !createdFaceName.startsWith('inner-')) return undefined;
  const baseFaceName = createdFaceName.slice('inner-'.length);
  return resolveShapeFace(basePlan, baseFaceName)?.query;
}

export function workplaneFaceName(source: SketchPlacementModel['workplane']['source']): string | null {
  switch (source.kind) {
    case 'tracked-face':
      return source.faceName;
    case 'face-ref':
      return source.faceName ?? null;
    case 'canonical-face':
      return source.face;
    case 'created-face':
      return source.slot;
    case 'propagated-face':
      return workplaneFaceName(source.source);
  }
}

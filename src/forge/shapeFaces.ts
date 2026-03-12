import {
  findShapePrimaryQueryOwner,
  type FeatureCutExtent,
  type ProfileCompilePlan,
  type ProfileCompileTransformStep,
  type ShapeCompilePlan,
  type ShapeCompileTransformStep,
} from './compilePlan';
import {
  cloneFaceQueryRef,
  faceQueryRefsEqual,
  type FaceQueryRef,
  type ShapeQueryOwner,
} from './queryModel';
import { Transform, normalizeAxis, type Mat4, type Vec3 } from './transform';
import type { SketchPlacementModel } from './sketch/workplaneModel';
import type { FaceRef } from './sketch/topology';

type Vec2 = [number, number];

interface BlockedFaceQuery {
  query: FaceQueryRef;
  reason: string;
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
  };
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
  table.faces.set(face.name, cloneFaceRefValue(face));
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

function blockNamedFace(table: FaceTable, name: string, reason: string): void {
  const face = table.faces.get(name);
  if (face) {
    removeSupportedQuery(table, face.query);
    registerBlockedQuery(table, face.query, reason);
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

function normalize2d(vec: Vec2): Vec2 {
  const len = Math.hypot(vec[0], vec[1]);
  if (len < 1e-12) return [1, 0];
  return [vec[0] / len, vec[1] / len];
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

function findCreatedFaceQuery(
  propagation: Extract<ShapeCompilePlan, { kind: 'shell' | 'hole' | 'cut' }>['queryPropagation'],
  slot: string,
): FaceQueryRef | undefined {
  return propagation?.createdFaces.find((entry) => entry.query.slot === slot)?.query;
}

function findPreservedFaceQuery(
  propagation: Extract<ShapeCompilePlan, { kind: 'shell' | 'hole' | 'cut' }>['queryPropagation'],
  source: FaceQueryRef | undefined,
): FaceQueryRef | undefined {
  if (!source) return undefined;
  return propagation?.preservedFaces.find((entry) => faceQueryRefsEqual(entry.query.source, source))?.query;
}

function shellInnerFaceName(baseName: string): string {
  return `inner-${baseName}`;
}

function shellCreatedFaceNames(basePlan: ShapeCompilePlan, openFaces: Array<'top' | 'bottom'>): string[] {
  const baseTable = resolveShapeFaceTable(basePlan);
  const created: string[] = [];
  for (const name of baseTable.faces.keys()) {
    if ((name === 'top' && openFaces.includes('top')) || (name === 'bottom' && openFaces.includes('bottom'))) {
      continue;
    }
    created.push(shellInnerFaceName(name));
  }
  return created;
}

function holeCreatedFaceNames(extent: FeatureCutExtent): string[] {
  return extent.kind === 'blind' ? ['wall', 'floor'] : ['wall'];
}

function cutCreatedFaceNames(profile: ProfileCompilePlan, extent: FeatureCutExtent): string[] {
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
  if (extent.kind === 'blind') names.push('floor');
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

function resolveShapeFaceTableInternal(plan: ShapeCompilePlan | null, owner: ShapeQueryOwner | null): FaceTable {
  if (!plan) return emptyFaceTable();

  switch (plan.kind) {
    case 'queryOwner':
      return resolveShapeFaceTableInternal(plan.base, plan.owner);
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
    case 'shell': {
      const baseTable = cloneFaceTable(resolveShapeFaceTableInternal(plan.base, owner));
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
      const table = cloneFaceTable(resolveShapeFaceTableInternal(plan.base, owner));
      const selectedNames = selectedFaceNamesFromQuery(table, plan.placement.placement.workplane.source);
      const available = new Set(table.faces.keys());
      for (const name of selectedNames) {
        blockNamedFace(table, name, 'This selected host face is rewritten by the hole result and is not a defended named face target.');
        if (plan.extent.kind === 'through') {
          for (const opposite of oppositeFaceNames(name, available)) {
            blockNamedFace(table, opposite, 'This opposite face is pierced by the through-hole and is not a defended named face target.');
          }
        }
      }
      for (const [name, face] of table.faces.entries()) {
        const propagated = findPreservedFaceQuery(plan.queryPropagation, face.query);
        if (propagated) setFaceQuery(table, name, propagated, face.query);
      }

      const workplane = plan.placement.placement.workplane;
      const origin = workplane.origin;
      const inward: Vec3 = [-workplane.normal[0], -workplane.normal[1], -workplane.normal[2]];
      const wallQuery = findCreatedFaceQuery(plan.queryPropagation, 'wall');
      if (wallQuery) {
        registerFace(table, {
          name: 'wall',
          normal: [-workplane.u[0], -workplane.u[1], -workplane.u[2]],
          center: [
            origin[0] + workplane.u[0] * plan.radius + inward[0] * (plan.extent.depth / 2),
            origin[1] + workplane.u[1] * plan.radius + inward[1] * (plan.extent.depth / 2),
            origin[2] + workplane.u[2] * plan.radius + inward[2] * (plan.extent.depth / 2),
          ],
          planar: false,
          query: wallQuery,
        });
      }
      const floorQuery = findCreatedFaceQuery(plan.queryPropagation, 'floor');
      if (floorQuery) {
        registerFace(table, {
          name: 'floor',
          normal: cloneVec3(workplane.normal),
          center: [
            origin[0] + inward[0] * plan.extent.depth,
            origin[1] + inward[1] * plan.extent.depth,
            origin[2] + inward[2] * plan.extent.depth,
          ],
          planar: true,
          uAxis: cloneVec3(workplane.u),
          vAxis: cloneVec3(workplane.v),
          query: floorQuery,
        });
      }
      return table;
    }
    case 'cut': {
      const table = cloneFaceTable(resolveShapeFaceTableInternal(plan.base, owner));
      const selectedNames = selectedFaceNamesFromQuery(table, plan.placement.placement.workplane.source);
      const available = new Set(table.faces.keys());
      for (const name of selectedNames) {
        blockNamedFace(table, name, 'This selected host face is rewritten by the cut result and is not a defended named face target.');
        if (plan.extent.kind === 'through') {
          for (const opposite of oppositeFaceNames(name, available)) {
            blockNamedFace(table, opposite, 'This opposite face is pierced by the through-cut and is not a defended named face target.');
          }
        }
      }
      for (const [name, face] of table.faces.entries()) {
        const propagated = findPreservedFaceQuery(plan.queryPropagation, face.query);
        if (propagated) setFaceQuery(table, name, propagated, face.query);
      }

      const placement = plan.placement.placement;
      const origin = placement.workplane.origin;
      const depthDir: Vec3 = [
        -placement.workplane.normal[0],
        -placement.workplane.normal[1],
        -placement.workplane.normal[2],
      ];
      const depthMid = plan.extent.depth / 2;
      if (plan.profile.kind === 'circle') {
        const wallQuery = findCreatedFaceQuery(plan.queryPropagation, 'wall');
        if (wallQuery) {
          registerFace(table, {
            name: 'wall',
            normal: [-placement.workplane.u[0], -placement.workplane.u[1], -placement.workplane.u[2]],
            center: [
              origin[0] + placement.workplane.u[0] * plan.profile.radius + depthDir[0] * depthMid,
              origin[1] + placement.workplane.u[1] * plan.profile.radius + depthDir[1] * depthMid,
              origin[2] + placement.workplane.u[2] * plan.profile.radius + depthDir[2] * depthMid,
            ],
            planar: false,
            query: wallQuery,
          });
        }
      }
      if (plan.profile.kind === 'rect' || plan.profile.kind === 'roundedRect') {
        const minX = plan.profile.center ? -plan.profile.width / 2 : 0;
        const minY = plan.profile.center ? -plan.profile.height / 2 : 0;
        const maxX = minX + plan.profile.width;
        const maxY = minY + plan.profile.height;
        const wallFaces: Array<{
          name: string;
          u: number;
          v: number;
          normal: Vec3;
          uAxis: Vec3;
          vAxis: Vec3;
        }> = [
          {
            name: 'wall-bottom',
            u: (minX + maxX) / 2,
            v: minY,
            normal: cloneVec3(placement.workplane.v),
            uAxis: cloneVec3(placement.workplane.u),
            vAxis: [-placement.workplane.normal[0], -placement.workplane.normal[1], -placement.workplane.normal[2]],
          },
          {
            name: 'wall-right',
            u: maxX,
            v: (minY + maxY) / 2,
            normal: [-placement.workplane.u[0], -placement.workplane.u[1], -placement.workplane.u[2]],
            uAxis: cloneVec3(placement.workplane.v),
            vAxis: [-placement.workplane.normal[0], -placement.workplane.normal[1], -placement.workplane.normal[2]],
          },
          {
            name: 'wall-top',
            u: (minX + maxX) / 2,
            v: maxY,
            normal: [-placement.workplane.v[0], -placement.workplane.v[1], -placement.workplane.v[2]],
            uAxis: cloneVec3(placement.workplane.u),
            vAxis: cloneVec3(placement.workplane.normal),
          },
          {
            name: 'wall-left',
            u: minX,
            v: (minY + maxY) / 2,
            normal: cloneVec3(placement.workplane.u),
            uAxis: cloneVec3(placement.workplane.v),
            vAxis: cloneVec3(placement.workplane.normal),
          },
        ];
        for (const wall of wallFaces) {
          const wallQuery = findCreatedFaceQuery(plan.queryPropagation, wall.name);
          if (!wallQuery) continue;
          registerFace(table, {
            name: wall.name,
            normal: wall.normal,
            center: [
              origin[0] + placement.workplane.u[0] * wall.u + placement.workplane.v[0] * wall.v + depthDir[0] * depthMid,
              origin[1] + placement.workplane.u[1] * wall.u + placement.workplane.v[1] * wall.v + depthDir[1] * depthMid,
              origin[2] + placement.workplane.u[2] * wall.u + placement.workplane.v[2] * wall.v + depthDir[2] * depthMid,
            ],
            planar: true,
            uAxis: wall.uAxis,
            vAxis: wall.vAxis,
            query: wallQuery,
          });
        }
      }
      const floorQuery = findCreatedFaceQuery(plan.queryPropagation, 'floor');
      if (floorQuery) {
        registerFace(table, {
          name: 'floor',
          normal: cloneVec3(placement.workplane.normal),
          center: [
            origin[0] + depthDir[0] * plan.extent.depth,
            origin[1] + depthDir[1] * plan.extent.depth,
            origin[2] + depthDir[2] * plan.extent.depth,
          ],
          planar: true,
          uAxis: cloneVec3(placement.workplane.u),
          vAxis: cloneVec3(placement.workplane.v),
          query: floorQuery,
        });
      }
      return table;
    }
    case 'sphere':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'boolean':
    case 'hull':
    case 'trimByPlane':
    case 'fillet':
    case 'chamfer':
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
  openFaces: Array<'top' | 'bottom'>,
): string[] {
  if (!basePlan) return [];
  return shellCreatedFaceNames(basePlan, openFaces).sort();
}

export function supportedHoleCreatedFaceNames(extent: FeatureCutExtent): string[] {
  return holeCreatedFaceNames(extent);
}

export function supportedCutCreatedFaceNames(
  profile: ProfileCompilePlan,
  extent: FeatureCutExtent,
): string[] {
  return cutCreatedFaceNames(profile, extent);
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
  if (!basePlan) return [];
  const table = resolveShapeFaceTable(basePlan);
  const blocked = new Set(selectedFaceNamesFromQuery(table, source));
  if (extent.kind === 'through') {
    const available = new Set(table.faces.keys());
    for (const name of [...blocked]) {
      for (const opposite of oppositeFaceNames(name, available)) {
        blocked.add(opposite);
      }
    }
  }
  return [...blocked].sort();
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

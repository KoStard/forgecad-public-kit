/**
 * ForgeCAD Geometry Kernel
 *
 * Wraps the current runtime geometry backend (today: Manifold WASM)
 * behind a clean, chainable Shape API.
 */

import { type Anchor3D, isAnchor3D, normalizeAnchor3D, resolveAnchor3D } from './anchors';
import { describeApiArg, normalizeVariadicArgs } from './apiArgs';
import type { Manifold } from './backends/manifold';
import { getWasm, initManifoldWasm, lowerShapeCompilePlanToShapeBackend, wrapManifoldShapeBackend } from './backends/manifold';
import { initOCCT, lowerShapeCompilePlanToOCCTBackend } from './backends/occt';
import type { ShapeCompilePlan, ShapeCompileTransformStep } from './compilePlan';
import {
  appendShapeCompileTransform,
  appendShapeCompileTransforms,
  buildBooleanShapeCompilePlan,
  buildTrimByPlaneShapeCompilePlan,
  cloneShapeCompilePlan,
  collectShapeQueryOwners,
  createOwnedShapeCompilePlan,
  createShapeQueryOwner,
  findShapePrimaryQueryOwner,
  findShapeWorkplanePlacement,
  wrapShapeCompilePlanWithQueryOwner,
} from './compilePlan';
import { explainNoFaceQueryMatch } from './face-tracking/faceDiagnostics';
import { type FaceTransformationHistory, traceFaceTransformationHistory } from './face-tracking/faceHistory';
import type { FaceQuery, FaceSelector } from './face-tracking/faceQuery';
import { normalizeFaceSelector } from './face-tracking/faceQuery';
import { queryMeshFace, queryMeshFaces } from './face-tracking/meshFaceDetect';
import { wrapRepeatedShapeCompilePlan } from './face-tracking/repetitionOwnership';
import { explainMissingShapeFace, listShapeFaceNames, resolveShapeFace } from './face-tracking/shapeFaces';
import {
  applyPlacementReferenceInput,
  clonePlacementReferences,
  createPlacementReferences,
  hasPlacementReferences,
  mergePlacementReferences,
  type PlacementAnchorLike,
  type PlacementReferenceInput,
  type PlacementReferenceKind,
  type PlacementReferences,
  placementReferenceNames,
  resolvePlacementReferencePoint,
  transformPlacementReferences,
} from './placement';
import type { PortInput, PortMap } from './port';
import { clonePortMap, hasAnyPorts, mergePortMaps, normalizePortMapInput, transformPortMap } from './port';
import {
  attachTopologyRewritePropagation,
  buildBooleanTopologyRewritePropagation,
  buildShellTopologyRewritePropagation,
  buildTrimByPlaneTopologyRewritePropagation,
  collectShapeTopologyRewritePropagations,
  findShapeTopologyRewritePropagation,
} from './query/queryPropagation';
import type { ShapeQueryOwner, TopologyRewritePropagation } from './queryModel';
import { isShapeBackend, type ShapeBackend } from './shapeBackend';
import { buildShellShapeCompilePlan } from './shellCompilePlan';
import type { FaceRef } from './sketch/topology';
import type { ShapeWorkplanePlacement } from './sketch/workplaneModel';
import { type Mat4, type RotateAroundToOptions, solveRotateAroundAngle, Transform, type Vec3 } from './transform';

export type { Anchor3D } from './anchors';
export { isAnchor3D, normalizeAnchor3D, resolveAnchor3D } from './anchors';
export type { FaceTransformationHistory, TransformationStep } from './face-tracking/faceHistory';
export type {
  PlacementReferenceInput,
  PlacementReferenceKind,
  PlacementReferences,
} from './placement';

export async function initKernel() {
  // Initialize Manifold and OCCT WASM modules in parallel.
  // Both are cached as singletons — subsequent calls are instant.
  const [manifoldModule] = await Promise.all([initManifoldWasm(), initOCCT()]);
  return manifoldModule;
}

/**
 * Lightweight kernel init — Manifold only, skips OCCT (~13MB).
 * Used on mobile devices where memory is constrained.
 */
export async function initKernelManifoldOnly() {
  return initManifoldWasm();
}

// TODO: Remove getWasm re-export from kernel once all callers import from backends/manifold/wasm
export { getWasm };

/**
 * Active geometry backend selector.
 * - 'occt'     — OCCT primary
 * - 'manifold' — Manifold only (original behaviour)
 */
export type ActiveBackend = 'occt' | 'manifold';
let _activeBackend: ActiveBackend = 'manifold';

export function setActiveBackend(backend: ActiveBackend): void {
  _activeBackend = backend;
}

export function getActiveBackend(): ActiveBackend {
  return _activeBackend;
}

export type GeometryBackend = 'manifold' | 'occt' | 'hybrid' | 'unknown';
export type GeometryRepresentation = 'mesh-solid' | 'brep-solid' | 'surface' | 'mixed';
export type GeometryFidelity = 'kernel-native' | 'exact' | 'sampled' | 'deformed' | 'mixed' | 'unknown';
export type GeometryTopology = 'none' | 'synthetic' | 'kernel';
export type GeometrySource =
  | 'primitive'
  | 'extrude'
  | 'revolve'
  | 'boolean'
  | 'sheet-metal'
  | 'shell'
  | 'fillet'
  | 'chamfer'
  | 'level-set'
  | 'loft'
  | 'sweep'
  | 'deform'
  | 'draft'
  | 'offset-solid'
  | 'imported'
  | 'unknown';

export interface GeometryInfo {
  backend: GeometryBackend;
  representation: GeometryRepresentation;
  fidelity: GeometryFidelity;
  topology: GeometryTopology;
  sources: GeometrySource[];
}

export interface ShapeDimension {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  offset: number;
  autoOffset?: boolean;
  label?: string;
  color?: string;
  components?: string[];
  currentComponent?: boolean;
}

export interface ShapeLike {
  toShape(): Shape;
}

export type ShapeOperandInput = Shape | ShapeLike | readonly (Shape | ShapeLike)[];

function unwrapShapeLike(value: unknown): Shape {
  if (value instanceof Shape) return value;
  if (value && typeof value === 'object' && typeof (value as { toShape?: unknown }).toShape === 'function') {
    const resolved = (value as ShapeLike).toShape();
    if (resolved instanceof Shape) return resolved;
    throw new Error(`expected toShape() to return a Shape, got ${describeApiArg(resolved)}`);
  }
  throw new Error(`expected a Shape or TrackedShape-compatible value, got ${describeApiArg(value)}`);
}

const _shapeDimensions = new WeakMap<Shape, ShapeDimension[]>();
const _shapeGeometryInfo = new WeakMap<Shape, GeometryInfo>();
const _shapeCompilePlans = new WeakMap<Shape, ShapeCompilePlan>();
const _shapePlacementRefs = new WeakMap<Shape, PlacementReferences>();
const _shapePorts = new WeakMap<Shape, PortMap>();
const _shapeRuntimeBackends = new WeakMap<Shape, ShapeBackend>();
let _shapeDimensionCounter = 0;

const DEFAULT_GEOMETRY_INFO: GeometryInfo = {
  backend: 'manifold',
  representation: 'mesh-solid',
  fidelity: 'unknown',
  topology: 'none',
  sources: ['unknown'],
};

function uniqueGeometrySources(sources: GeometrySource[]): GeometrySource[] {
  const out: GeometrySource[] = [];
  const seen = new Set<GeometrySource>();
  for (const source of sources) {
    if (seen.has(source)) continue;
    seen.add(source);
    out.push(source);
  }
  return out;
}

function cloneGeometryInfo(info: GeometryInfo): GeometryInfo {
  return {
    backend: info.backend,
    representation: info.representation,
    fidelity: info.fidelity,
    topology: info.topology,
    sources: [...info.sources],
  };
}

function createGeometryInfo(seed: Partial<GeometryInfo> = {}): GeometryInfo {
  return {
    backend: seed.backend ?? DEFAULT_GEOMETRY_INFO.backend,
    representation: seed.representation ?? DEFAULT_GEOMETRY_INFO.representation,
    fidelity: seed.fidelity ?? DEFAULT_GEOMETRY_INFO.fidelity,
    topology: seed.topology ?? DEFAULT_GEOMETRY_INFO.topology,
    sources: uniqueGeometrySources(seed.sources ? [...seed.sources] : [...DEFAULT_GEOMETRY_INFO.sources]),
  };
}

function setShapeGeometryInfoInternal(shape: Shape, info: GeometryInfo): Shape {
  _shapeGeometryInfo.set(shape, cloneGeometryInfo(info));
  return shape;
}

type ShapeRuntimePayload = ShapeBackend | Manifold;

function setShapeRuntimeBackendInternal(shape: Shape, payload: ShapeRuntimePayload): Shape {
  const backend = isShapeBackend(payload) ? payload : wrapManifoldShapeBackend(payload);
  _shapeRuntimeBackends.set(shape, backend);
  return shape;
}

function setShapeCompilePlanInternal(shape: Shape, plan: ShapeCompilePlan): Shape {
  _shapeCompilePlans.set(shape, cloneShapeCompilePlan(plan));
  return shape;
}

function setShapePlacementRefsInternal(shape: Shape, refs: PlacementReferences): Shape {
  if (hasPlacementReferences(refs)) {
    _shapePlacementRefs.set(shape, clonePlacementReferences(refs));
  } else {
    _shapePlacementRefs.delete(shape);
  }
  return shape;
}

function setShapePortsInternal(shape: Shape, ports: PortMap): Shape {
  if (hasAnyPorts(ports)) {
    _shapePorts.set(shape, clonePortMap(ports));
  } else {
    _shapePorts.delete(shape);
  }
  return shape;
}

function getShapePortsInternal(shape: Shape): PortMap {
  return clonePortMap(_shapePorts.get(shape) ?? {});
}

function getShapeGeometryInfoInternal(shape: Shape): GeometryInfo {
  return cloneGeometryInfo(_shapeGeometryInfo.get(shape) ?? DEFAULT_GEOMETRY_INFO);
}

function getShapeRuntimeBackendInternal(shape: Shape): ShapeBackend {
  const backend = _shapeRuntimeBackends.get(shape);
  if (!backend) throw new Error('Runtime backend missing on Shape');
  return backend;
}

function getShapeCompilePlanInternal(shape: Shape): ShapeCompilePlan {
  const stored = _shapeCompilePlans.get(shape);
  if (!stored) throw new Error('Shape has no compile plan — every Shape must have an explicit plan set via setShapeCompilePlanInternal()');
  return cloneShapeCompilePlan(stored);
}

function getShapePlacementRefsInternal(shape: Shape): PlacementReferences {
  return clonePlacementReferences(_shapePlacementRefs.get(shape) ?? createPlacementReferences());
}

function mergeGeometryField<T extends string>(values: T[], mixedValue: T): T {
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] : mixedValue;
}

function deriveGeometryInfo(info: GeometryInfo, source: GeometrySource, overrides: Partial<GeometryInfo> = {}): GeometryInfo {
  return createGeometryInfo({
    backend: overrides.backend ?? info.backend,
    representation: overrides.representation ?? info.representation,
    fidelity: overrides.fidelity ?? info.fidelity,
    topology: overrides.topology ?? info.topology,
    sources: uniqueGeometrySources([source, ...info.sources, ...(overrides.sources ?? [])]),
  });
}

function mergeGeometryInfos(infos: GeometryInfo[], source: GeometrySource, overrides: Partial<GeometryInfo> = {}): GeometryInfo {
  return createGeometryInfo({
    backend:
      overrides.backend ??
      mergeGeometryField(
        infos.map((info) => info.backend),
        'hybrid',
      ),
    representation:
      overrides.representation ??
      mergeGeometryField(
        infos.map((info) => info.representation),
        'mixed',
      ),
    fidelity:
      overrides.fidelity ??
      mergeGeometryField(
        infos.map((info) => info.fidelity),
        'mixed',
      ),
    topology:
      overrides.topology ??
      mergeGeometryField(
        infos.map((info) => info.topology),
        'none',
      ),
    sources: uniqueGeometrySources([source, ...infos.flatMap((info) => info.sources), ...(overrides.sources ?? [])]),
  });
}

function nextShapeDimensionId(): string {
  _shapeDimensionCounter += 1;
  return `shape-dim-${_shapeDimensionCounter}`;
}

function cloneDimension(def: ShapeDimension, regenerateId = false): ShapeDimension {
  return {
    id: regenerateId ? nextShapeDimensionId() : def.id,
    from: [def.from[0], def.from[1], def.from[2]],
    to: [def.to[0], def.to[1], def.to[2]],
    offset: def.offset,
    autoOffset: def.autoOffset,
    label: def.label,
    color: def.color,
    components: def.components ? [...def.components] : undefined,
    currentComponent: def.currentComponent,
  };
}

function cloneDimensions(defs: ShapeDimension[], regenerateIds = false): ShapeDimension[] {
  return defs.map((def) => cloneDimension(def, regenerateIds));
}

function setShapeDimensionsInternal(shape: Shape, dims: ShapeDimension[]): Shape {
  if (dims.length === 0) {
    _shapeDimensions.delete(shape);
  } else {
    _shapeDimensions.set(shape, dims);
  }
  return shape;
}

function getShapeDimensionsInternal(shape: Shape): ShapeDimension[] {
  return _shapeDimensions.get(shape) ?? [];
}

function transformPointByMat4(m: Mat4, p: [number, number, number]): [number, number, number] {
  const x = p[0],
    y = p[1],
    z = p[2];
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}

function transformDimensions(defs: ShapeDimension[], m: Mat4): ShapeDimension[] {
  return defs.map((def) => ({
    id: nextShapeDimensionId(),
    from: transformPointByMat4(m, def.from),
    to: transformPointByMat4(m, def.to),
    offset: def.offset,
    autoOffset: def.autoOffset,
    label: def.label,
    color: def.color,
    components: def.components ? [...def.components] : undefined,
    currentComponent: def.currentComponent,
  }));
}

function rotationEulerMatrix(xDeg: number, yDeg: number, zDeg: number): Mat4 {
  return Transform.identity().rotateAxis([1, 0, 0], xDeg).rotateAxis([0, 1, 0], yDeg).rotateAxis([0, 0, 1], zDeg).toArray();
}

function rotationAroundAxisMatrix(axis: [number, number, number], angleDeg: number, pivot: [number, number, number]): Mat4 {
  const [px, py, pz] = pivot;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const len = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2) || 1;
  const ux = axis[0] / len;
  const uy = axis[1] / len;
  const uz = axis[2] / len;

  const m00 = cos + ux * ux * (1 - cos);
  const m01 = ux * uy * (1 - cos) - uz * sin;
  const m02 = ux * uz * (1 - cos) + uy * sin;
  const m10 = uy * ux * (1 - cos) + uz * sin;
  const m11 = cos + uy * uy * (1 - cos);
  const m12 = uy * uz * (1 - cos) - ux * sin;
  const m20 = uz * ux * (1 - cos) - uy * sin;
  const m21 = uz * uy * (1 - cos) + ux * sin;
  const m22 = cos + uz * uz * (1 - cos);

  const tx = px - (m00 * px + m01 * py + m02 * pz);
  const ty = py - (m10 * px + m11 * py + m12 * pz);
  const tz = pz - (m20 * px + m21 * py + m22 * pz);

  return [m00, m10, m20, 0, m01, m11, m21, 0, m02, m12, m22, 0, tx, ty, tz, 1];
}

function mirrorMatrix(normal: [number, number, number]): Mat4 {
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

  return [m00, m10, m20, 0, m01, m11, m21, 0, m02, m12, m22, 0, 0, 0, 0, 1];
}

function normalizeShapeScale(v: number | [number, number, number]): [number, number, number] | null {
  const scale = typeof v === 'number' ? ([v, v, v] as const) : v;
  if (!Number.isFinite(scale[0]) || !Number.isFinite(scale[1]) || !Number.isFinite(scale[2])) {
    return null;
  }
  if (Math.abs(scale[0]) < 1e-12 || Math.abs(scale[1]) < 1e-12 || Math.abs(scale[2]) < 1e-12) {
    return null;
  }
  return [scale[0], scale[1], scale[2]];
}

function dotVec3(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossVec3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function lengthVec3(v: [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function _normalizeVec3(v: [number, number, number]): [number, number, number] {
  const len = lengthVec3(v);
  if (len < 1e-12) return [1, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function rigidTransformStepsFromMatrix(m: Mat4): ShapeCompileTransformStep[] | null {
  const eps = 1e-6;

  if (Math.abs(m[3]) > eps || Math.abs(m[7]) > eps || Math.abs(m[11]) > eps || Math.abs(m[15] - 1) > eps) {
    return null;
  }

  const col0: [number, number, number] = [m[0], m[1], m[2]];
  const col1: [number, number, number] = [m[4], m[5], m[6]];
  const col2: [number, number, number] = [m[8], m[9], m[10]];

  const len0 = lengthVec3(col0);
  const len1 = lengthVec3(col1);
  const len2 = lengthVec3(col2);
  if (Math.abs(len0 - 1) > eps || Math.abs(len1 - 1) > eps || Math.abs(len2 - 1) > eps) {
    return null;
  }

  if (Math.abs(dotVec3(col0, col1)) > eps || Math.abs(dotVec3(col0, col2)) > eps || Math.abs(dotVec3(col1, col2)) > eps) {
    return null;
  }

  const det = dotVec3(col0, crossVec3(col1, col2));
  if (Math.abs(det - 1) > eps) return null;

  const r00 = m[0],
    _r01 = m[4],
    _r02 = m[8];
  const _r10 = m[1],
    r11 = m[5],
    _r12 = m[9];
  const _r20 = m[2],
    _r21 = m[6],
    r22 = m[10];
  const _tx = m[12],
    _ty = m[13],
    _tz = m[14];

  const trace = r00 + r11 + r22;
  const cosTheta = Math.max(-1, Math.min(1, (trace - 1) / 2));
  const angle = Math.acos(cosTheta);
  const _angleDeg = (angle * 180) / Math.PI;

  // Matrix is confirmed rigid — use workplanePlacement which both backends handle natively.
  // This avoids fragile axis/angle decomposition that can fail on numerical edge cases
  // (e.g. rotation matrices built from cross products with floating-point imprecision).
  return [{ kind: 'workplanePlacement', matrix: Array.from(m) as Mat4 }];
}

function withCopiedDimensions(source: Shape, out: Shape): Shape {
  setShapeDimensionsInternal(out, cloneDimensions(getShapeDimensionsInternal(source), true));
  setShapeGeometryInfoInternal(out, getShapeGeometryInfoInternal(source));
  setShapePlacementRefsInternal(out, getShapePlacementRefsInternal(source));
  setShapePortsInternal(out, getShapePortsInternal(source));
  if (source.materialProps) out.materialProps = { ...source.materialProps };
  return setShapeCompilePlanInternal(out, getShapeCompilePlanInternal(source));
}

function withTransformedDimensions(source: Shape, out: Shape, m: Mat4): Shape {
  const dims = getShapeDimensionsInternal(source);
  if (dims.length === 0) {
    setShapeDimensionsInternal(out, []);
  } else {
    setShapeDimensionsInternal(out, transformDimensions(dims, m));
  }
  setShapeGeometryInfoInternal(out, getShapeGeometryInfoInternal(source));
  setShapePlacementRefsInternal(out, transformPlacementReferences(getShapePlacementRefsInternal(source), m));
  setShapePortsInternal(out, transformPortMap(getShapePortsInternal(source), m));
  if (source.materialProps) out.materialProps = { ...source.materialProps };
  return setShapeCompilePlanInternal(out, getShapeCompilePlanInternal(source));
}

function withMergedDimensions(sources: Shape[], out: Shape): Shape {
  const merged = sources.flatMap((s) => getShapeDimensionsInternal(s));
  setShapeDimensionsInternal(out, cloneDimensions(merged, true));
  const baseInfo = sources.length > 0 ? getShapeGeometryInfoInternal(sources[0]) : DEFAULT_GEOMETRY_INFO;
  setShapeGeometryInfoInternal(out, baseInfo);
  setShapePlacementRefsInternal(out, mergePlacementReferences(...sources.map((shape) => getShapePlacementRefsInternal(shape))));
  setShapePortsInternal(out, mergePortMaps(...sources.map((shape) => getShapePortsInternal(shape))));
  if (sources.length > 0) {
    setShapeCompilePlanInternal(out, getShapeCompilePlanInternal(sources[0]));
    if (sources[0].materialProps) out.materialProps = { ...sources[0].materialProps };
  }
  return out;
}

function withBaseDimensions(base: Shape, out: Shape): Shape {
  setShapeDimensionsInternal(out, cloneDimensions(getShapeDimensionsInternal(base), true));
  setShapeGeometryInfoInternal(out, getShapeGeometryInfoInternal(base));
  setShapePlacementRefsInternal(out, getShapePlacementRefsInternal(base));
  setShapePortsInternal(out, getShapePortsInternal(base));
  return setShapeCompilePlanInternal(out, getShapeCompilePlanInternal(base));
}

type ShapeAnchorTarget = Shape | { referencePoint(ref: string): [number, number, number] } | { _bbox(): { min: number[]; max: number[] } };

type RotationPointLike = PlacementAnchorLike | Vec3;

function resolveRotationPoint(shape: Shape, point: RotationPointLike): Vec3 {
  if (Array.isArray(point)) return [point[0], point[1], point[2]];
  return shape.referencePoint(point);
}

/**
 * Bind dimensions to a shape instance. Used for require()-scoped dimensions.
 * By default IDs are regenerated so multiple instances never collide.
 */
export function setShapeDimensions(shape: Shape, dims: ShapeDimension[], options: { regenerateIds?: boolean } = {}): Shape {
  const regenerateIds = options.regenerateIds ?? true;
  return setShapeDimensionsInternal(shape, cloneDimensions(dims, regenerateIds));
}

/** Read dimensions bound to this shape instance (defensive copy). */
export function getShapeDimensions(shape: Shape): ShapeDimension[] {
  return cloneDimensions(getShapeDimensionsInternal(shape), false);
}

export function setShapePlacementReferences(shape: Shape, refs: PlacementReferenceInput, options: { merge?: boolean } = {}): Shape {
  const next =
    (options.merge ?? true)
      ? applyPlacementReferenceInput(getShapePlacementRefsInternal(shape), refs)
      : applyPlacementReferenceInput(createPlacementReferences(), refs);
  return setShapePlacementRefsInternal(shape, next);
}

export function getShapePlacementReferences(shape: Shape): PlacementReferences {
  return getShapePlacementRefsInternal(shape);
}

export function getShapePorts(shape: Shape): PortMap {
  return getShapePortsInternal(shape);
}

export function getShapeRuntimeBackend(shape: Shape): ShapeBackend {
  return getShapeRuntimeBackendInternal(shape);
}

export function getShapeGeometryInfo(shape: Shape): GeometryInfo {
  return getShapeGeometryInfoInternal(shape);
}

export function setShapeGeometryInfo(shape: Shape, info: Partial<GeometryInfo>): Shape {
  const current = getShapeGeometryInfoInternal(shape);
  return setShapeGeometryInfoInternal(
    shape,
    createGeometryInfo({
      backend: info.backend ?? current.backend,
      representation: info.representation ?? current.representation,
      fidelity: info.fidelity ?? current.fidelity,
      topology: info.topology ?? current.topology,
      sources: info.sources ?? current.sources,
    }),
  );
}

export function getShapeCompilePlan(shape: Shape): ShapeCompilePlan {
  return getShapeCompilePlanInternal(shape);
}

export function setShapeCompilePlan(shape: Shape, plan: ShapeCompilePlan): Shape {
  return setShapeCompilePlanInternal(shape, plan);
}

export function getShapePrimaryQueryOwner(shape: Shape): ShapeQueryOwner | null {
  return findShapePrimaryQueryOwner(getShapeCompilePlanInternal(shape));
}

export function getShapeQueryOwners(shape: Shape): ShapeQueryOwner[] {
  return collectShapeQueryOwners(getShapeCompilePlanInternal(shape));
}

export function getShapeWorkplanePlacement(shape: Shape): ShapeWorkplanePlacement | null {
  return findShapeWorkplanePlacement(getShapeCompilePlanInternal(shape));
}

export function getShapeTopologyRewritePropagation(shape: Shape): TopologyRewritePropagation | null {
  return findShapeTopologyRewritePropagation(getShapeCompilePlanInternal(shape));
}

export function getShapeTopologyRewritePropagations(shape: Shape): TopologyRewritePropagation[] {
  return collectShapeTopologyRewritePropagations(getShapeCompilePlanInternal(shape));
}

export function buildShapeFromCompilePlan(plan: ShapeCompilePlan, color?: string, geometryInfo?: Partial<GeometryInfo>): Shape {
  let backend: ShapeBackend;
  if (_activeBackend === 'manifold') {
    backend = lowerShapeCompilePlanToShapeBackend(plan, getWasm());
  } else {
    backend = lowerShapeCompilePlanToOCCTBackend(plan);
  }
  // Ensure geometryInfo.backend reflects the actual backend used, not the caller's default.
  const resolvedInfo: Partial<GeometryInfo> = {
    ...geometryInfo,
    backend: _activeBackend,
  };
  return setShapeCompilePlan(new Shape(backend, color, resolvedInfo), plan);
}

export const getShapeBrepPlan = getShapeCompilePlan;
export const setShapeBrepPlan = setShapeCompilePlan;

function createOwnedTopologyRewritePlan(
  plan: ShapeCompilePlan,
  operation: string,
  buildPropagation: (owner: ShapeQueryOwner) => TopologyRewritePropagation,
): ShapeCompilePlan {
  const owner = createShapeQueryOwner(operation);
  return wrapShapeCompilePlanWithQueryOwner(attachTopologyRewritePropagation(plan, buildPropagation(owner)), owner);
}

/** Per-object material properties for controlling visual appearance. */
export interface ShapeMaterialProps {
  /** Metalness factor (0 = dielectric, 1 = metal). Default: 0.05 */
  metalness?: number;
  /** Roughness factor (0 = mirror, 1 = fully diffuse). Default: 0.35 */
  roughness?: number;
  /** Emissive glow color (hex string, e.g. "#ff6b35"). */
  emissive?: string;
  /** Emissive intensity multiplier. Default: 1 */
  emissiveIntensity?: number;
  /** Opacity (0 = fully transparent, 1 = fully opaque). Default: 1 */
  opacity?: number;
  /** Render as wireframe. Default: false */
  wireframe?: boolean;
  /** Clearcoat intensity (0–1). Default: 0.1 */
  clearcoat?: number;
  /** Clearcoat roughness (0–1). Default: 0.4 */
  clearcoatRoughness?: number;
}

/**
 * Core 3D solid shape. All operations are immutable and return new shapes.
 *
 * Supports transforms (translate, rotate, scale, mirror, transform, rotateAround, pointAlong),
 * booleans (add, subtract, intersect), cutting (split, splitByPlane, trimByPlane),
 * shelling, anchor positioning (attachTo, onFace), placement references, and queries
 * (volume, surfaceArea, boundingBox, isEmpty, numTri, geometryInfo).
 */
export class Shape {
  public colorHex: string | undefined;
  public materialProps: ShapeMaterialProps | undefined;

  constructor(payload: ShapeRuntimePayload, color?: string, geometryInfo?: Partial<GeometryInfo>) {
    this.colorHex = color;
    setShapeRuntimeBackendInternal(this, payload);
    setShapeGeometryInfoInternal(this, createGeometryInfo(geometryInfo));
    // No compile plan set here — callers (buildShapeFromCompilePlan, etc.) must set it immediately after.
  }

  /** Set the color of this shape (hex string, e.g. "#ff0000") */
  setColor(value: string | undefined): Shape {
    const out = withCopiedDimensions(this, new Shape(getShapeRuntimeBackendInternal(this).clone(), value));
    out.materialProps = this.materialProps ? { ...this.materialProps } : undefined;
    return out;
  }

  /** Alias for setColor */
  color(value: string | undefined): Shape {
    return this.setColor(value);
  }

  /**
   * Set material properties for this shape's visual appearance.
   * Returns a new Shape with the specified material properties merged.
   *
   * @example
   * ```js
   * box(50, 50, 50).material({ metalness: 0.9, roughness: 0.1 });
   * sphere(30).material({ emissive: '#ff6b35', emissiveIntensity: 2 });
   * cylinder(40, 20).material({ opacity: 0.3 });
   * ```
   */
  material(props: ShapeMaterialProps): Shape {
    if (!props || typeof props !== 'object') {
      throw new Error('material() expects an object with material properties');
    }
    const out = this.clone();
    out.materialProps = { ...(this.materialProps ?? {}), ...props };
    return out;
  }

  /** Return a new Shape wrapper for explicit duplication in scripts. */
  clone(): Shape {
    const out = withCopiedDimensions(this, new Shape(getShapeRuntimeBackendInternal(this).clone(), this.colorHex));
    out.materialProps = this.materialProps ? { ...this.materialProps } : undefined;
    return out;
  }

  /** Alias for clone() */
  duplicate(): Shape {
    return this.clone();
  }

  /** Inspect which backend/representation produced this solid. */
  geometryInfo(): GeometryInfo {
    return getShapeGeometryInfoInternal(this);
  }

  /** Attach named placement references that survive normal transforms and imports. */
  withReferences(refs: PlacementReferenceInput): Shape {
    return setShapePlacementReferences(this.clone(), refs, { merge: true });
  }

  /** List named placement references carried by this shape. */
  referenceNames(kind?: PlacementReferenceKind): string[] {
    return placementReferenceNames(getShapePlacementRefsInternal(this), kind);
  }

  /** Attach named assembly ports (origin + axis + up) that survive transforms and imports. */
  withPorts(ports: Record<string, PortInput>): Shape {
    const out = this.clone();
    const existing = getShapePortsInternal(this);
    const incoming = normalizePortMapInput(ports);
    setShapePortsInternal(out, mergePortMaps(existing, incoming));
    return out;
  }

  /** List named port identifiers carried by this shape. */
  portNames(): string[] {
    return Object.keys(getShapePortsInternal(this)).sort();
  }

  /** Resolve a named placement reference or built-in anchor to a 3D point. */
  referencePoint(ref: PlacementAnchorLike): [number, number, number] {
    return resolveAnchorLikePoint(this, ref);
  }

  /** Resolve a semantic face by name or query.  Works on compile-covered shapes and, as a
   *  fallback, on any planar-faced mesh (e.g. the result of boolean ops) via
   *  coplanar triangle clustering. */
  face(selector: FaceSelector): FaceRef {
    const { compilePlanName, query } = normalizeFaceSelector(selector);

    // 1. Compile-plan lookup (string names only — preserves tracked lineage for BREP)
    if (compilePlanName) {
      const plan = getShapeCompilePlanInternal(this);
      const face = resolveShapeFace(plan, compilePlanName);
      if (face) return face;
    }

    // 2. Mesh query engine
    if (query) {
      const detected = queryMeshFace(this, query);
      if (detected) return detected;
    }

    // 3. Error
    if (compilePlanName) {
      const plan = getShapeCompilePlanInternal(this);
      throw new Error(explainMissingShapeFace(plan, compilePlanName));
    }
    const allFaces = queryMeshFaces(this, {});
    throw new Error(explainNoFaceQueryMatch(query!, allFaces));
  }

  /** Return all faces matching a query, or all mesh-detected faces when no query is given. */
  faces(query?: FaceQuery): FaceRef[] {
    return queryMeshFaces(this, query ?? {});
  }

  /** List defended semantic face names currently available on this shape. */
  faceNames(): string[] {
    return listShapeFaceNames(getShapeCompilePlanInternal(this));
  }

  /** Get the transformation history for a specific face. */
  faceHistory(name: string): FaceTransformationHistory {
    const plan = getShapeCompilePlanInternal(this);
    const face = resolveShapeFace(plan, name);
    if (!face) {
      throw new Error(explainMissingShapeFace(plan, name));
    }
    return traceFaceTransformationHistory(plan, face);
  }

  /** Translate the shape so the given reference lands on the target coordinate. */
  placeReference(ref: PlacementAnchorLike, target: [number, number, number], offset?: [number, number, number]): Shape {
    const sourcePoint = this.referencePoint(ref);
    let dx = target[0] - sourcePoint[0];
    let dy = target[1] - sourcePoint[1];
    let dz = target[2] - sourcePoint[2];
    if (offset) {
      dx += offset[0];
      dy += offset[1];
      dz += offset[2];
    }
    return this.translate(dx, dy, dz);
  }

  // --- Transforms (all return new Shape, immutable) ---

  /** Move the shape relative to its current position. All transforms are immutable and return new shapes. */
  translate(x: number, y: number, z: number): Shape {
    const nextPlan = appendShapeCompileTransform(getShapeCompilePlanInternal(this), { kind: 'translate', x, y, z });
    return setShapeCompilePlanInternal(
      withTransformedDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex), Transform.translation(x, y, z).toArray()),
      nextPlan,
    );
  }

  /** Position the shape so its bounding box min corner is at the given global coordinate. */
  moveTo(x: number, y: number, z: number): Shape {
    const bb = this.boundingBox();
    return this.translate(x - (bb.min as number[])[0], y - (bb.min as number[])[1], z - (bb.min as number[])[2]);
  }

  /** Position the shape relative to another shape's local coordinate system (bounding box min corner). */
  moveToLocal(target: Shape | { toShape(): Shape }, x: number, y: number, z: number): Shape {
    const s = 'toShape' in target ? target.toShape() : target;
    const tbb = s.boundingBox();
    return this.moveTo((tbb.min as number[])[0] + x, (tbb.min as number[])[1] + y, (tbb.min as number[])[2] + z);
  }

  /** Rotate using Euler angles in degrees around each axis. */
  rotate(x: number, y: number, z: number): Shape {
    const nextPlan = appendShapeCompileTransform(getShapeCompilePlanInternal(this), { kind: 'rotate', xDeg: x, yDeg: y, zDeg: z });
    return setShapeCompilePlanInternal(
      withTransformedDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex), rotationEulerMatrix(x, y, z)),
      nextPlan,
    );
  }

  /** Apply a 4x4 affine transform matrix (column-major) or a Transform object. */
  transform(m: Mat4 | Transform): Shape {
    const mat = m instanceof Transform ? m.toArray() : m;
    const steps = rigidTransformStepsFromMatrix(mat);
    if (steps == null) {
      // Non-rigid transforms (shear, perspective) are not supported in the compile plan IR.
      throw new Error(
        'Shape.transform() received a non-rigid matrix (contains shear, perspective, or non-uniform scale). ' +
          'Only rigid transforms (rotation + translation) are supported.',
      );
    }
    const nextPlan =
      steps.length === 0 ? getShapeCompilePlanInternal(this) : appendShapeCompileTransforms(getShapeCompilePlanInternal(this), steps);
    return setShapeCompilePlanInternal(withTransformedDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex), mat), nextPlan);
  }

  /** Scale the shape uniformly or per-axis. Accepts a single number or [x, y, z] array. */
  scale(v: number | [number, number, number]): Shape {
    const scale = normalizeShapeScale(v);
    if (scale) {
      const nextPlan = appendShapeCompileTransform(getShapeCompilePlanInternal(this), {
        kind: 'scale',
        x: scale[0],
        y: scale[1],
        z: scale[2],
      });
      return setShapeCompilePlanInternal(
        withTransformedDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex), Transform.scale(v).toArray()),
        nextPlan,
      );
    }
    // Degenerate scale (zero or non-finite component) produces degenerate geometry.
    throw new Error(
      `Shape.scale() received a degenerate scale value (${JSON.stringify(v)}). ` + 'All scale components must be finite and non-zero.',
    );
  }

  /** Mirror across a plane defined by its normal vector (does not need to be unit length). */
  mirror(normal: [number, number, number]): Shape {
    const transformedPlan = appendShapeCompileTransform(getShapeCompilePlanInternal(this), {
      kind: 'mirror',
      normalX: normal[0],
      normalY: normal[1],
      normalZ: normal[2],
    });
    const nextPlan = wrapRepeatedShapeCompilePlan(transformedPlan, 'mirror');
    return setShapeCompilePlanInternal(
      withTransformedDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex), mirrorMatrix(normal)),
      nextPlan,
    );
  }

  /**
   * Reorient a shape so its primary axis (Z) points along the given direction.
   * Useful for laying cylinders/extrusions along X or Y without thinking about Euler angles.
   *
   * Example: cylinder(40, 5).pointAlong([1, 0, 0]) — lays cylinder along X
   */
  pointAlong(direction: [number, number, number]): Shape {
    const [dx, dy, dz] = direction;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const nx = dx / len,
      ny = dy / len,
      nz = dz / len;
    // From [0,0,1] to [nx,ny,nz] via cross product (rotation axis) and dot product (angle)
    // cross([0,0,1], [nx,ny,nz]) = [-ny, nx, 0]
    const cx = -ny,
      cy = nx,
      cz = 0;
    const sinA = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const cosA = nz; // dot([0,0,1], [nx,ny,nz])
    if (sinA < 1e-10) {
      // Parallel or anti-parallel to Z
      return cosA > 0 ? this : this.rotate(180, 0, 0);
    }
    const angleDeg = (Math.atan2(sinA, cosA) * 180) / Math.PI;
    // Normalize cross product to get rotation axis
    const ax = cx / sinA,
      ay = cy / sinA,
      az = cz / sinA;
    return this.rotateAround([ax, ay, az], angleDeg);
  }

  /**
   * Rotate around an arbitrary axis through a pivot point.
   * Equivalent to: translate(-pivot) → rotate around axis → translate(+pivot)
   */
  rotateAround(axis: [number, number, number], angleDeg: number, pivot: [number, number, number] = [0, 0, 0]): Shape {
    const len = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2) || 1;
    const normalizedAxis: [number, number, number] = [axis[0] / len, axis[1] / len, axis[2] / len];
    const matrix = rotationAroundAxisMatrix(normalizedAxis, angleDeg, pivot);
    const nextPlan = appendShapeCompileTransform(getShapeCompilePlanInternal(this), {
      kind: 'rotateAround',
      axisX: normalizedAxis[0],
      axisY: normalizedAxis[1],
      axisZ: normalizedAxis[2],
      degrees: angleDeg,
      pivotX: pivot[0],
      pivotY: pivot[1],
      pivotZ: pivot[2],
    });
    return setShapeCompilePlanInternal(
      withTransformedDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex), matrix),
      nextPlan,
    );
  }

  /**
   * Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point.
   * `movingPoint` / `targetPoint` may be raw world points or this shape's anchors/references.
   */
  rotateAroundTo(
    axis: [number, number, number],
    pivot: [number, number, number],
    movingPoint: RotationPointLike,
    targetPoint: RotationPointLike,
    options: RotateAroundToOptions = {},
  ): Shape {
    const moving = resolveRotationPoint(this, movingPoint);
    const target = resolveRotationPoint(this, targetPoint);
    const angleDeg = solveRotateAroundAngle(axis, pivot, moving, target, options);
    return this.rotateAround(axis, angleDeg, pivot);
  }

  // --- Booleans ---

  /** Unwrap TrackedShape (or any object with toShape()) without circular import. */
  private static _unwrap(value: unknown): Shape {
    return unwrapShapeLike(value);
  }

  /** Union this shape with others (additive boolean). Method form of union(). */
  add(...others: ShapeOperandInput[]): Shape {
    const shapes = [
      this,
      ...normalizeShapeOperands('Shape.add()', others, 1, 'Use shape.add(other1, other2) or shape.add([other1, other2]).'),
    ];
    const operandPlans = shapes.map((shape) => getShapeCompilePlanInternal(shape));
    const nextPlan = createOwnedTopologyRewritePlan(buildBooleanShapeCompilePlan('union', operandPlans), 'boolean:union', (owner) =>
      buildBooleanTopologyRewritePropagation('union', owner, operandPlans),
    )!;
    return setShapeCompilePlanInternal(
      setShapeGeometryInfoInternal(
        withMergedDimensions(shapes, buildShapeFromCompilePlan(nextPlan, this.colorHex)),
        mergeGeometryInfos(
          shapes.map((shape) => getShapeGeometryInfoInternal(shape)),
          'boolean',
          { topology: 'none' },
        ),
      ),
      nextPlan,
    );
  }

  /** Subtract other shapes from this one. Method form of difference(). */
  subtract(...others: ShapeOperandInput[]): Shape {
    const shapes = [
      this,
      ...normalizeShapeOperands('Shape.subtract()', others, 1, 'Use shape.subtract(other1, other2) or shape.subtract([other1, other2]).'),
    ];
    const operandPlans = shapes.map((shape) => getShapeCompilePlanInternal(shape));
    const nextPlan = createOwnedTopologyRewritePlan(
      buildBooleanShapeCompilePlan('difference', operandPlans),
      'boolean:difference',
      (owner) => buildBooleanTopologyRewritePropagation('difference', owner, operandPlans),
    )!;
    return setShapeCompilePlanInternal(
      setShapeGeometryInfoInternal(
        withBaseDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex)),
        mergeGeometryInfos(
          shapes.map((shape) => getShapeGeometryInfoInternal(shape)),
          'boolean',
          { topology: 'none' },
        ),
      ),
      nextPlan,
    );
  }

  /** Keep only the overlap with other shapes. Method form of intersection(). */
  intersect(...others: ShapeOperandInput[]): Shape {
    const shapes = [
      this,
      ...normalizeShapeOperands(
        'Shape.intersect()',
        others,
        1,
        'Use shape.intersect(other1, other2) or shape.intersect([other1, other2]).',
      ),
    ];
    const operandPlans = shapes.map((shape) => getShapeCompilePlanInternal(shape));
    const nextPlan = createOwnedTopologyRewritePlan(
      buildBooleanShapeCompilePlan('intersection', operandPlans),
      'boolean:intersection',
      (owner) => buildBooleanTopologyRewritePropagation('intersection', owner, operandPlans),
    )!;
    return setShapeCompilePlanInternal(
      setShapeGeometryInfoInternal(
        withMergedDimensions(shapes, buildShapeFromCompilePlan(nextPlan, this.colorHex)),
        mergeGeometryInfos(
          shapes.map((shape) => getShapeGeometryInfoInternal(shape)),
          'boolean',
          { topology: 'none' },
        ),
      ),
      nextPlan,
    );
  }

  // --- Cutting ---

  /** Split into [inside, outside] by another shape. */
  split(cutter: Shape | { toShape(): Shape }): [Shape, Shape] {
    const c = Shape._unwrap(cutter);
    const insideOperandPlans = [getShapeCompilePlanInternal(this), getShapeCompilePlanInternal(c)];
    const insidePlan = createOwnedTopologyRewritePlan(
      buildBooleanShapeCompilePlan('intersection', insideOperandPlans),
      'split:inside',
      (owner) => buildBooleanTopologyRewritePropagation('intersection', owner, insideOperandPlans),
    );
    const outsideOperandPlans = [getShapeCompilePlanInternal(this), getShapeCompilePlanInternal(c)];
    const outsidePlan = createOwnedTopologyRewritePlan(
      buildBooleanShapeCompilePlan('difference', outsideOperandPlans),
      'split:outside',
      (owner) => buildBooleanTopologyRewritePropagation('difference', owner, outsideOperandPlans),
    );
    const info = mergeGeometryInfos([getShapeGeometryInfoInternal(this), getShapeGeometryInfoInternal(c)], 'boolean', { topology: 'none' });
    return [
      setShapeCompilePlanInternal(
        setShapeGeometryInfoInternal(withBaseDimensions(this, buildShapeFromCompilePlan(insidePlan, this.colorHex)), info),
        insidePlan,
      ),
      setShapeCompilePlanInternal(
        setShapeGeometryInfoInternal(withBaseDimensions(this, buildShapeFromCompilePlan(outsidePlan, this.colorHex)), info),
        outsidePlan,
      ),
    ];
  }

  /** Split by infinite plane. Returns [positive-side, negative-side]. */
  splitByPlane(normal: [number, number, number], originOffset = 0): [Shape, Shape] {
    const info = deriveGeometryInfo(getShapeGeometryInfoInternal(this), 'boolean', { topology: 'none' });
    const basePlan = getShapeCompilePlanInternal(this);
    const firstPlan = createOwnedTopologyRewritePlan(
      buildTrimByPlaneShapeCompilePlan(basePlan, normal, originOffset),
      'splitByPlane:positive',
      (owner) => buildTrimByPlaneTopologyRewritePropagation(owner, basePlan),
    );
    const secondPlan = createOwnedTopologyRewritePlan(
      buildTrimByPlaneShapeCompilePlan(basePlan, [-normal[0], -normal[1], -normal[2]], -originOffset),
      'splitByPlane:opposite',
      (owner) => buildTrimByPlaneTopologyRewritePropagation(owner, basePlan),
    );
    return [
      setShapeCompilePlanInternal(
        setShapeGeometryInfoInternal(withBaseDimensions(this, buildShapeFromCompilePlan(firstPlan, this.colorHex)), info),
        firstPlan,
      ),
      setShapeCompilePlanInternal(
        setShapeGeometryInfoInternal(withBaseDimensions(this, buildShapeFromCompilePlan(secondPlan, this.colorHex)), info),
        secondPlan,
      ),
    ];
  }

  /** Keep the positive side of the plane and discard the opposite side. */
  trimByPlane(normal: [number, number, number], originOffset = 0): Shape {
    const basePlan = getShapeCompilePlanInternal(this);
    const nextPlan = createOwnedTopologyRewritePlan(
      buildTrimByPlaneShapeCompilePlan(basePlan, normal, originOffset),
      'trimByPlane',
      (owner) => buildTrimByPlaneTopologyRewritePropagation(owner, basePlan),
    );
    return setShapeCompilePlanInternal(
      setShapeGeometryInfoInternal(
        withBaseDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex)),
        deriveGeometryInfo(getShapeGeometryInfoInternal(this), 'boolean', { topology: 'none' }),
      ),
      nextPlan,
    );
  }

  /** Hollow out compile-covered boxes, cylinders, and straight extrudes.
   * `openFaces` names any subset of the base shape's faces to leave open (no wall).
   * Box bases accept any of: top, bottom, front (=side-bottom), back (=side-top),
   * left (=side-left), right (=side-right), or the raw internal names.
   * Cylinder and extrude bases accept top and bottom only.
   */
  shell(thickness: number, opts: { openFaces?: string[] } = {}): Shape {
    const basePlan = getShapeCompilePlanInternal(this);
    const shellPlan = buildShellShapeCompilePlan(basePlan, thickness, opts.openFaces);
    if (!shellPlan) {
      throw new Error(
        'Shape.shell() supports compile-covered box(), cylinder(), and straight extrude() solids with optional face openings and rigid transforms.',
      );
    }
    const nextPlan = createOwnedTopologyRewritePlan(shellPlan, 'shell', (owner) =>
      buildShellTopologyRewritePropagation(owner, basePlan, opts.openFaces ?? []),
    );
    return setShapeCompilePlanInternal(
      setShapeGeometryInfoInternal(
        withBaseDimensions(this, buildShapeFromCompilePlan(nextPlan, this.colorHex)),
        deriveGeometryInfo(getShapeGeometryInfoInternal(this), 'shell', { topology: 'none' }),
      ),
      nextPlan,
    );
  }

  // --- Query ---

  /** Get the axis-aligned bounding box as { min: [x,y,z], max: [x,y,z] }. */
  boundingBox() {
    return getShapeRuntimeBackendInternal(this).boundingBox();
  }

  /** Volume in mm cubed. */
  volume(): number {
    return getShapeRuntimeBackendInternal(this).volume();
  }

  /** Surface area in mm squared. */
  surfaceArea(): number {
    return getShapeRuntimeBackendInternal(this).surfaceArea();
  }

  /** True if the shape contains no geometry. */
  isEmpty(): boolean {
    return getShapeRuntimeBackendInternal(this).isEmpty();
  }

  /** Triangle count of the mesh representation. */
  numTri(): number {
    return getShapeRuntimeBackendInternal(this).numTri();
  }

  /** Extract triangle mesh for Three.js rendering */
  getMesh() {
    return getShapeRuntimeBackendInternal(this).getMesh();
  }

  /** Slice the runtime solid by a plane normal to local Z at the given offset. */
  slice(offset = 0) {
    return getShapeRuntimeBackendInternal(this).slice(offset);
  }

  /** Orthographically project the runtime solid onto the local XY plane. */
  project() {
    return getShapeRuntimeBackendInternal(this).project();
  }

  /**
   * Position this shape relative to another using named 3D anchor points.
   *
   * Anchors are bounding-box-relative: 'center', face centers ('top', 'front', ...),
   * edge midpoints ('top-front', 'back-left', ...), and corners ('top-front-left', ...).
   * Anchor word order is flexible: 'front-left' and 'left-front' are equivalent.
   * Named placement references (from withReferences) can also be used as anchors.
   */
  attachTo(
    target: ShapeAnchorTarget,
    targetAnchor: PlacementAnchorLike,
    selfAnchor: PlacementAnchorLike = 'center',
    offset?: [number, number, number],
  ): Shape {
    const tp = resolveTargetAnchorLikePoint(target, targetAnchor);
    const sp = this.referencePoint(selfAnchor);
    let dx = tp[0] - sp[0],
      dy = tp[1] - sp[1],
      dz = tp[2] - sp[2];
    if (offset) {
      dx += offset[0];
      dy += offset[1];
      dz += offset[2];
    }
    return this.translate(dx, dy, dz);
  }

  /**
   * Place this shape on a face of a parent shape.
   *
   * Think of it like sticking a label on a box surface:
   * - `face` picks which surface ('front', 'back', 'top', etc.)
   * - `u, v` position within that face's 2D plane (from center)
   *   - front/back: u = left/right (X), v = up/down (Z)
   *   - left/right: u = forward/back (Y), v = up/down (Z)
   *   - top/bottom: u = left/right (X), v = forward/back (Y)
   * - `protrude` = how far the child sticks out (positive = outward from face)
   */
  onFace(
    parent: ShapeAnchorTarget,
    face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom',
    opts: { u?: number; v?: number; protrude?: number } = {},
  ): Shape {
    const u = opts.u ?? 0;
    const v = opts.v ?? 0;
    const p = opts.protrude ?? 0;

    // Map face → which attachTo anchors + how u,v,protrude map to x,y,z offset
    // The child's "inward" face attaches to the parent's face, then protrude pushes outward
    type FaceAnchor = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
    const opposite: Record<FaceAnchor, FaceAnchor> = {
      front: 'back',
      back: 'front',
      left: 'right',
      right: 'left',
      top: 'bottom',
      bottom: 'top',
    };
    // For each parent face, map (u, v, protrude) → (dx, dy, dz)
    const uvMap: Record<FaceAnchor, (u: number, v: number, p: number) => [number, number, number]> = {
      front: (u, v, p) => [u, -p, v], // front = −Y face, outward = −Y
      back: (u, v, p) => [u, p, v], // back = +Y face, outward = +Y
      left: (u, v, p) => [-p, u, v], // left = −X face, outward = −X
      right: (u, v, p) => [p, u, v], // right = +X face, outward = +X
      top: (u, v, p) => [u, v, p], // top = +Z face, outward = +Z
      bottom: (u, v, p) => [u, v, -p], // bottom = −Z face, outward = −Z
    };

    const selfAnchor = opposite[face]; // child's inward face
    const offset = uvMap[face](u, v, p);
    return this.attachTo(parent, face, selfAnchor, offset);
  }
}

// --- 3D Anchor positioning ---

export function getAnchorPoint3D(shape: Shape, anchor: Anchor3D): [number, number, number] {
  const s: Shape = typeof (shape as any).toShape === 'function' ? (shape as any).toShape() : shape;
  const bb = s.boundingBox();
  return resolveAnchor3D(bb.min as [number, number, number], bb.max as [number, number, number], anchor);
}

function resolveAnchorLikePoint(shape: Shape, ref: PlacementAnchorLike): [number, number, number] {
  if (isAnchor3D(ref)) return getAnchorPoint3D(shape, ref);
  const point = resolvePlacementReferencePoint(getShapePlacementRefsInternal(shape), ref);
  if (point) return point;
  const normalized = normalizeAnchor3D(ref);
  if (normalized) return getAnchorPoint3D(shape, normalized);
  throw new Error(
    `Unknown placement reference "${ref}". Available: ${placementReferenceNames(getShapePlacementRefsInternal(shape)).join(', ') || 'none'}`,
  );
}

function resolveTargetAnchorLikePoint(target: ShapeAnchorTarget, ref: PlacementAnchorLike): [number, number, number] {
  if (target instanceof Shape) return resolveAnchorLikePoint(target, ref);
  if ('referencePoint' in target && typeof target.referencePoint === 'function') {
    return target.referencePoint(ref);
  }
  const normalized = normalizeAnchor3D(ref);
  if (!normalized) {
    throw new Error(`ShapeGroup targets only support built-in anchors, got "${ref}"`);
  }
  if (!('_bbox' in target) || typeof target._bbox !== 'function') {
    throw new Error('ShapeGroup anchor target is missing _bbox()');
  }
  const bb = target._bbox();
  return resolveAnchor3D(bb.min as [number, number, number], bb.max as [number, number, number], normalized);
}

// --- Primitive constructors ---

/**
 * Create a rectangular box with named faces and edges.
 *
 * Returns a TrackedShape with faces: top, bottom, side-left, side-right,
 * side-top, side-bottom; and edges: vert-bl, vert-br, vert-tr, vert-tl, etc.
 * When center is false (the default), one corner sits at the origin.
 */
export function box(x: number, y: number, z: number, center = false): Shape {
  return buildShapeFromCompilePlan(createOwnedShapeCompilePlan({ kind: 'box', x, y, z, center }, 'primitive:box')!, undefined, {
    fidelity: 'kernel-native',
    sources: ['primitive'],
  });
}

/**
 * Create a cylinder or cone with named faces and edges.
 *
 * When radiusTop differs from radius, creates a tapered cone. Use the segments
 * parameter to create regular prisms (e.g. 6 for a hexagonal prism). Returns a
 * TrackedShape with faces: top, bottom, side; and edges: top-rim, bottom-rim.
 */
export function cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center = false): Shape {
  return buildShapeFromCompilePlan(
    createOwnedShapeCompilePlan(
      {
        kind: 'cylinder' as const,
        height,
        radius,
        radiusTop: radiusTop != null && radiusTop >= 0 ? radiusTop : undefined,
        segments: segments != null && segments > 0 ? segments : undefined,
        center,
      },
      'primitive:cylinder',
    )!,
    undefined,
    { fidelity: 'kernel-native', sources: ['primitive'] },
  );
}

/** Create a sphere centered at the origin. Use segments for lower-poly approximations. */
export function sphere(radius: number, segments?: number): Shape {
  return buildShapeFromCompilePlan(
    createOwnedShapeCompilePlan(
      {
        kind: 'sphere',
        radius,
        segments: segments != null && segments > 0 ? segments : undefined,
      },
      'primitive:sphere',
    )!,
    undefined,
    { fidelity: 'kernel-native', sources: ['primitive'] },
  );
}

/** Create a torus (donut shape) centered at the origin, lying in the XY plane. */
export function torus(majorRadius: number, minorRadius: number, segments?: number): Shape {
  const plan: ShapeCompilePlan = {
    kind: 'torus',
    majorRadius,
    minorRadius,
    segments: segments != null && segments > 0 ? segments : undefined,
  };
  return buildShapeFromCompilePlan(createOwnedShapeCompilePlan(plan, 'primitive:torus')!, undefined, {
    fidelity: 'kernel-native',
    sources: ['primitive'],
  });
}

function normalizeShapeOperands(apiName: string, inputs: readonly unknown[], minCount: number, usage: string): Shape[] {
  return normalizeVariadicArgs({
    apiName,
    inputs,
    minCount,
    itemName: 'shape',
    usage,
    coerce: (value) => unwrapShapeLike(value),
  });
}

function _normalizePoint3(value: unknown, apiName: string, index: number): [number, number, number] {
  if (Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    return value as [number, number, number];
  }
  throw new Error(`${apiName} argument ${index}: expected a [x, y, z] point, got ${describeApiArg(value)}`);
}

// --- Boolean helpers ---

/**
 * Combine shapes into a single solid (additive boolean).
 *
 * Accepts individual shapes, or an array of shapes.
 * The first operand's color is preserved in the result.
 */
export function union(...inputs: ShapeOperandInput[]): Shape {
  const shapes = normalizeShapeOperands('union()', inputs, 1, 'Use union(shape1, shape2) or union([shape1, shape2]).');
  if (shapes.length === 0) throw new Error('union requires at least one shape');
  if (shapes.length === 1) return shapes[0];
  const operandPlans = shapes.map((shape) => getShapeCompilePlanInternal(shape));
  const nextPlan = createOwnedTopologyRewritePlan(buildBooleanShapeCompilePlan('union', operandPlans), 'boolean:union', (owner) =>
    buildBooleanTopologyRewritePropagation('union', owner, operandPlans),
  )!;
  return setShapeCompilePlanInternal(
    setShapeGeometryInfoInternal(
      withMergedDimensions(shapes, buildShapeFromCompilePlan(nextPlan, shapes[0].colorHex)),
      mergeGeometryInfos(
        shapes.map((shape) => getShapeGeometryInfoInternal(shape)),
        'boolean',
        { topology: 'none' },
      ),
    ),
    nextPlan,
  );
}

/**
 * Subtract shapes from a base shape (subtractive boolean).
 *
 * The first shape is the base; all subsequent shapes are subtracted from it.
 * Accepts individual shapes, or an array of shapes.
 */
export function difference(...inputs: ShapeOperandInput[]): Shape {
  const shapes = normalizeShapeOperands(
    'difference()',
    inputs,
    2,
    'Use difference(base, cutter1, cutter2) or difference([base, cutter1, cutter2]).',
  );
  if (shapes.length < 2) throw new Error('difference requires at least two shapes');
  const operandPlans = shapes.map((shape) => getShapeCompilePlanInternal(shape));
  const nextPlan = createOwnedTopologyRewritePlan(buildBooleanShapeCompilePlan('difference', operandPlans), 'boolean:difference', (owner) =>
    buildBooleanTopologyRewritePropagation('difference', owner, operandPlans),
  )!;
  return setShapeCompilePlanInternal(
    setShapeGeometryInfoInternal(
      withBaseDimensions(shapes[0], buildShapeFromCompilePlan(nextPlan, shapes[0].colorHex)),
      mergeGeometryInfos(
        shapes.map((shape) => getShapeGeometryInfoInternal(shape)),
        'boolean',
        { topology: 'none' },
      ),
    ),
    nextPlan,
  );
}

/**
 * Keep only the overlapping volume of the input shapes (intersection boolean).
 *
 * Requires at least two shapes. Accepts individual shapes, or an array.
 */
export function intersection(...inputs: ShapeOperandInput[]): Shape {
  const shapes = normalizeShapeOperands('intersection()', inputs, 2, 'Use intersection(shape1, shape2) or intersection([shape1, shape2]).');
  if (shapes.length < 2) throw new Error('intersection requires at least two shapes');
  const operandPlans = shapes.map((shape) => getShapeCompilePlanInternal(shape));
  const nextPlan = createOwnedTopologyRewritePlan(
    buildBooleanShapeCompilePlan('intersection', operandPlans),
    'boolean:intersection',
    (owner) => buildBooleanTopologyRewritePropagation('intersection', owner, operandPlans),
  )!;
  return setShapeCompilePlanInternal(
    setShapeGeometryInfoInternal(
      withMergedDimensions(shapes, buildShapeFromCompilePlan(nextPlan, shapes[0].colorHex)),
      mergeGeometryInfos(
        shapes.map((shape) => getShapeGeometryInfoInternal(shape)),
        'boolean',
        { topology: 'none' },
      ),
    ),
    nextPlan,
  );
}

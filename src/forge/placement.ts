import { type Anchor3D, normalizeAnchor3D, resolveAnchor3D } from './anchors';
import type { Mat4, Vec3 } from './transform';
import { Transform } from './transform';

export type PlacementReferenceKind = 'points' | 'edges' | 'surfaces' | 'objects';

export interface PlacementEdgeRef {
  start: Vec3;
  end: Vec3;
}

export interface PlacementSurfaceRef {
  center: Vec3;
  normal: Vec3;
}

export interface PlacementObjectRef {
  min: Vec3;
  max: Vec3;
}

export interface PlacementReferences {
  points: Record<string, Vec3>;
  edges: Record<string, PlacementEdgeRef>;
  surfaces: Record<string, PlacementSurfaceRef>;
  objects: Record<string, PlacementObjectRef>;
}

export type PlacementObjectInput =
  | PlacementObjectRef
  | { min: [number, number, number]; max: [number, number, number] }
  | { boundingBox(): { min: number[]; max: number[] } }
  | { _bbox(): { min: number[]; max: number[] } };

export interface PlacementReferenceInput {
  points?: Record<string, [number, number, number]>;
  edges?: Record<string, PlacementEdgeRef>;
  surfaces?: Record<string, PlacementSurfaceRef>;
  objects?: Record<string, PlacementObjectInput>;
}

const PLACEMENT_REFERENCE_KINDS: PlacementReferenceKind[] = ['points', 'edges', 'surfaces', 'objects'];

function cloneVec3(value: [number, number, number] | number[], label: string): Vec3 {
  if (!Array.isArray(value) || value.length < 3) {
    throw new Error(`${label} must be a [x, y, z] tuple`);
  }
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new Error(`${label} must contain finite numbers`);
  }
  return [x, y, z];
}

function midpoint(start: Vec3, end: Vec3): Vec3 {
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
}

function normalizeVector(value: Vec3): Vec3 {
  const len = Math.hypot(value[0], value[1], value[2]);
  if (len < 1e-10) return [0, 0, 1];
  return [value[0] / len, value[1] / len, value[2] / len];
}

function isBoundsObject(value: unknown): value is { min: [number, number, number]; max: [number, number, number] } {
  return !!value && typeof value === 'object' && 'min' in value && 'max' in value;
}

function toObjectBounds(value: PlacementObjectInput, label: string): PlacementObjectRef {
  if (isBoundsObject(value)) {
    return {
      min: cloneVec3(value.min, `${label}.min`),
      max: cloneVec3(value.max, `${label}.max`),
    };
  }

  if (typeof value === 'object' && value != null) {
    if ('boundingBox' in value && typeof value.boundingBox === 'function') {
      const bounds = value.boundingBox();
      return {
        min: cloneVec3(bounds.min, `${label}.min`),
        max: cloneVec3(bounds.max, `${label}.max`),
      };
    }
    if ('_bbox' in value && typeof value._bbox === 'function') {
      const bounds = value._bbox();
      return {
        min: cloneVec3(bounds.min, `${label}.min`),
        max: cloneVec3(bounds.max, `${label}.max`),
      };
    }
  }

  throw new Error(`${label} must be a bounds object or a shape/group with a bounding box`);
}

function transformBounds(bounds: PlacementObjectRef, matrix: Mat4): PlacementObjectRef {
  const tx = Transform.from(matrix);
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const corners: Vec3[] = [
    [minX, minY, minZ],
    [minX, minY, maxZ],
    [minX, maxY, minZ],
    [minX, maxY, maxZ],
    [maxX, minY, minZ],
    [maxX, minY, maxZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
  ];

  const outMin: Vec3 = [Infinity, Infinity, Infinity];
  const outMax: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const corner of corners) {
    const point = tx.point(corner);
    outMin[0] = Math.min(outMin[0], point[0]);
    outMin[1] = Math.min(outMin[1], point[1]);
    outMin[2] = Math.min(outMin[2], point[2]);
    outMax[0] = Math.max(outMax[0], point[0]);
    outMax[1] = Math.max(outMax[1], point[1]);
    outMax[2] = Math.max(outMax[2], point[2]);
  }

  return { min: outMin, max: outMax };
}

export function createPlacementReferences(): PlacementReferences {
  return {
    points: {},
    edges: {},
    surfaces: {},
    objects: {},
  };
}

export function clonePlacementReferences(refs: PlacementReferences): PlacementReferences {
  const out = createPlacementReferences();
  for (const [name, point] of Object.entries(refs.points)) {
    out.points[name] = cloneVec3(point, `points.${name}`);
  }
  for (const [name, edge] of Object.entries(refs.edges)) {
    out.edges[name] = {
      start: cloneVec3(edge.start, `edges.${name}.start`),
      end: cloneVec3(edge.end, `edges.${name}.end`),
    };
  }
  for (const [name, surface] of Object.entries(refs.surfaces)) {
    out.surfaces[name] = {
      center: cloneVec3(surface.center, `surfaces.${name}.center`),
      normal: cloneVec3(surface.normal, `surfaces.${name}.normal`),
    };
  }
  for (const [name, objectRef] of Object.entries(refs.objects)) {
    out.objects[name] = {
      min: cloneVec3(objectRef.min, `objects.${name}.min`),
      max: cloneVec3(objectRef.max, `objects.${name}.max`),
    };
  }
  return out;
}

export function normalizePlacementReferenceInput(input: PlacementReferenceInput = {}): PlacementReferences {
  const out = createPlacementReferences();

  for (const [name, point] of Object.entries(input.points ?? {})) {
    out.points[name] = cloneVec3(point, `points.${name}`);
  }
  for (const [name, edge] of Object.entries(input.edges ?? {})) {
    out.edges[name] = {
      start: cloneVec3(edge.start, `edges.${name}.start`),
      end: cloneVec3(edge.end, `edges.${name}.end`),
    };
  }
  for (const [name, surface] of Object.entries(input.surfaces ?? {})) {
    out.surfaces[name] = {
      center: cloneVec3(surface.center, `surfaces.${name}.center`),
      normal: normalizeVector(cloneVec3(surface.normal, `surfaces.${name}.normal`)),
    };
  }
  for (const [name, objectRef] of Object.entries(input.objects ?? {})) {
    out.objects[name] = toObjectBounds(objectRef, `objects.${name}`);
  }

  return out;
}

export function mergePlacementReferences(...refsList: PlacementReferences[]): PlacementReferences {
  const out = createPlacementReferences();
  for (const refs of refsList) {
    for (const [name, point] of Object.entries(refs.points)) out.points[name] = cloneVec3(point, `points.${name}`);
    for (const [name, edge] of Object.entries(refs.edges)) {
      out.edges[name] = {
        start: cloneVec3(edge.start, `edges.${name}.start`),
        end: cloneVec3(edge.end, `edges.${name}.end`),
      };
    }
    for (const [name, surface] of Object.entries(refs.surfaces)) {
      out.surfaces[name] = {
        center: cloneVec3(surface.center, `surfaces.${name}.center`),
        normal: cloneVec3(surface.normal, `surfaces.${name}.normal`),
      };
    }
    for (const [name, objectRef] of Object.entries(refs.objects)) {
      out.objects[name] = {
        min: cloneVec3(objectRef.min, `objects.${name}.min`),
        max: cloneVec3(objectRef.max, `objects.${name}.max`),
      };
    }
  }
  return out;
}

export function hasPlacementReferences(refs: PlacementReferences): boolean {
  return PLACEMENT_REFERENCE_KINDS.some((kind) => Object.keys(refs[kind]).length > 0);
}

export function applyPlacementReferenceInput(base: PlacementReferences, input: PlacementReferenceInput): PlacementReferences {
  return mergePlacementReferences(base, normalizePlacementReferenceInput(input));
}

export function transformPlacementReferences(refs: PlacementReferences, matrix: Mat4): PlacementReferences {
  const tx = Transform.from(matrix);
  const out = createPlacementReferences();

  for (const [name, point] of Object.entries(refs.points)) {
    out.points[name] = tx.point(point);
  }
  for (const [name, edge] of Object.entries(refs.edges)) {
    out.edges[name] = {
      start: tx.point(edge.start),
      end: tx.point(edge.end),
    };
  }
  for (const [name, surface] of Object.entries(refs.surfaces)) {
    out.surfaces[name] = {
      center: tx.point(surface.center),
      normal: normalizeVector(tx.vector(surface.normal)),
    };
  }
  for (const [name, objectRef] of Object.entries(refs.objects)) {
    out.objects[name] = transformBounds(objectRef, matrix);
  }

  return out;
}

function placementRefSelectorError(ref: string, message: string): never {
  throw new Error(`Placement reference "${ref}" ${message}`);
}

function resolvePointFromKind(
  refs: PlacementReferences,
  kind: PlacementReferenceKind,
  name: string,
  selector: string | undefined,
  originalRef: string,
): Vec3 | null {
  switch (kind) {
    case 'points': {
      const point = refs.points[name];
      if (!point) return null;
      if (selector != null) placementRefSelectorError(originalRef, 'does not support selectors');
      return cloneVec3(point, `points.${name}`);
    }
    case 'edges': {
      const edge = refs.edges[name];
      if (!edge) return null;
      if (selector == null || selector === 'midpoint' || selector === 'center') {
        return midpoint(edge.start, edge.end);
      }
      if (selector === 'start') return cloneVec3(edge.start, `edges.${name}.start`);
      if (selector === 'end') return cloneVec3(edge.end, `edges.${name}.end`);
      placementRefSelectorError(originalRef, 'supports only .start, .end, or .midpoint');
    }
    case 'surfaces': {
      const surface = refs.surfaces[name];
      if (!surface) return null;
      if (selector != null && selector !== 'center') {
        placementRefSelectorError(originalRef, 'supports only .center');
      }
      return cloneVec3(surface.center, `surfaces.${name}.center`);
    }
    case 'objects': {
      const objectRef = refs.objects[name];
      if (!objectRef) return null;
      const anchor = selector ?? 'center';
      const normalized = normalizeAnchor3D(anchor);
      if (!normalized) {
        placementRefSelectorError(
          originalRef,
          `supports only Anchor3D selectors (${['center', 'top', 'bottom', 'left', 'right', 'front', 'back'].join(', ')} ...)`,
        );
      }
      return resolveAnchor3D(objectRef.min, objectRef.max, normalized);
    }
    default:
      return null;
  }
}

export function resolvePlacementReferencePoint(refs: PlacementReferences, ref: string): Vec3 | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const segments = trimmed.split('.');
  if (segments.length >= 2 && PLACEMENT_REFERENCE_KINDS.includes(segments[0] as PlacementReferenceKind)) {
    const kind = segments[0] as PlacementReferenceKind;
    const name = segments[1];
    const selector = segments.length > 2 ? segments.slice(2).join('.') : undefined;
    return resolvePointFromKind(refs, kind, name, selector, trimmed);
  }

  const matches = PLACEMENT_REFERENCE_KINDS.map((kind) => ({
    kind,
    point: resolvePointFromKind(refs, kind, trimmed, undefined, trimmed),
  })).filter((entry): entry is { kind: PlacementReferenceKind; point: Vec3 } => entry.point != null);

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(
      `Placement reference "${trimmed}" is ambiguous. Use one of: ${matches.map((entry) => `${entry.kind}.${trimmed}`).join(', ')}`,
    );
  }
  return matches[0].point;
}

export function placementReferenceNames(refs: PlacementReferences, kind?: PlacementReferenceKind): string[] {
  if (kind) return Object.keys(refs[kind]).sort();
  return PLACEMENT_REFERENCE_KINDS.flatMap((entryKind) =>
    Object.keys(refs[entryKind])
      .sort()
      .map((name) => `${entryKind}.${name}`),
  );
}

export function createSurfaceReference(center: [number, number, number], normal: [number, number, number]): PlacementSurfaceRef {
  return {
    center: cloneVec3(center, 'surface.center'),
    normal: normalizeVector(cloneVec3(normal, 'surface.normal')),
  };
}

export function createEdgeReference(start: [number, number, number], end: [number, number, number]): PlacementEdgeRef {
  return {
    start: cloneVec3(start, 'edge.start'),
    end: cloneVec3(end, 'edge.end'),
  };
}

export function createObjectReference(min: [number, number, number], max: [number, number, number]): PlacementObjectRef {
  return {
    min: cloneVec3(min, 'object.min'),
    max: cloneVec3(max, 'object.max'),
  };
}

export type PlacementAnchorLike = Anchor3D | string;

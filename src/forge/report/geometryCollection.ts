/**
 * Shape → triangles/edges collection for report rendering.
 */

import type { ColorRgb } from '../export/pdfUtils';
import type { Shape } from '../kernel';
import { shapeToGeometry } from '../mesh/meshToGeometry';
import { mapDimensionsToOwnerIds } from '../reportDimensionOwnership';
import type { SceneObject } from '../runner';
import type { DimensionDef } from '../sketch/dimensions';
import {
  DEFAULT_COLOR_HEX,
  MAX_FILL_TRIANGLES_PER_OBJECT,
  MAX_EDGE_SEGMENTS_PER_OBJECT,
  type Bounds3,
  type ReportTriangle,
  type ReportEdge,
  type ReportObject,
  type DimensionOwnership,
  type ComponentPageGroup,
} from './_internal';
import type { ReportObjectVisual } from './types';
import { clamp, cross3, sub3, norm, distance3, mergeBounds3 } from './mathUtils';

function hexToRgb01(hex: string | undefined): ColorRgb {
  const input = (hex || DEFAULT_COLOR_HEX).trim();
  const m = input.match(/^#?([0-9a-f]{6})$/i);
  if (!m) {
    return [0x5b / 255, 0x9b / 255, 0xd5 / 255];
  }
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return [r / 255, g / 255, b / 255];
}

export { hexToRgb01 };

function collectShapeTriangles(shape: Shape): ReportTriangle[] {
  const mesh = shape.getMesh();
  const triCount = mesh.numTri;
  if (triCount <= 0 || triCount > MAX_FILL_TRIANGLES_PER_OBJECT) return [];

  const tris: ReportTriangle[] = [];
  const numProp = mesh.numProp;
  for (let t = 0; t < triCount; t += 1) {
    const i0 = mesh.triVerts[t * 3];
    const i1 = mesh.triVerts[t * 3 + 1];
    const i2 = mesh.triVerts[t * 3 + 2];

    const a: [number, number, number] = [mesh.vertProperties[i0 * numProp], mesh.vertProperties[i0 * numProp + 1], mesh.vertProperties[i0 * numProp + 2]];
    const b: [number, number, number] = [mesh.vertProperties[i1 * numProp], mesh.vertProperties[i1 * numProp + 1], mesh.vertProperties[i1 * numProp + 2]];
    const c: [number, number, number] = [mesh.vertProperties[i2 * numProp], mesh.vertProperties[i2 * numProp + 1], mesh.vertProperties[i2 * numProp + 2]];

    const n = norm(cross3(sub3(b, a), sub3(c, a)));
    tris.push({ a, b, c, normal: n });
  }
  return tris;
}

function collectShapeEdges(shape: Shape): ReportEdge[] {
  const { solid, edges: edgesGeo } = shapeToGeometry(shape);
  const attr = edgesGeo.getAttribute('position');
  const count = Math.floor(attr.count / 2);
  const stride = count > MAX_EDGE_SEGMENTS_PER_OBJECT ? Math.ceil(count / MAX_EDGE_SEGMENTS_PER_OBJECT) : 1;

  const edges: ReportEdge[] = [];
  for (let i = 0; i < count; i += stride) {
    const i0 = i * 2;
    const i1 = i0 + 1;
    const a: [number, number, number] = [attr.getX(i0), attr.getY(i0), attr.getZ(i0)];
    const b: [number, number, number] = [attr.getX(i1), attr.getY(i1), attr.getZ(i1)];
    edges.push({ a, b });
  }

  edgesGeo.dispose();
  solid.dispose();
  return edges;
}

export function collectReportObjects(objects: SceneObject[], visuals: Record<string, ReportObjectVisual> | undefined): ReportObject[] {
  const out: ReportObject[] = [];

  for (const obj of objects) {
    if (!obj.shape) continue;

    const visual = visuals?.[obj.id];
    if (visual?.visible === false) continue;

    const bb = obj.shape.boundingBox();
    const bbox: Bounds3 = {
      min: [bb.min[0], bb.min[1], bb.min[2]],
      max: [bb.max[0], bb.max[1], bb.max[2]],
    };

    const triangles = collectShapeTriangles(obj.shape);
    const edges = collectShapeEdges(obj.shape);
    const opacity = clamp(visual?.opacity ?? 1, 0.08, 1);
    const baseColor = hexToRgb01(visual?.color || obj.color || DEFAULT_COLOR_HEX);
    const color: ColorRgb = [1 - (1 - baseColor[0]) * opacity, 1 - (1 - baseColor[1]) * opacity, 1 - (1 - baseColor[2]) * opacity];

    out.push({
      id: obj.id,
      name: obj.name,
      groupName: obj.groupName,
      bbox,
      color,
      opacity,
      triangles,
      edges,
    });
  }

  return out;
}

function signatureNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(4);
}

function summarizeMetricSeries(values: number[]): string {
  if (values.length === 0) return '0:0:0:0';

  let sum = 0;
  let sumSquares = 0;
  let min = Infinity;
  let max = -Infinity;

  values.forEach((value) => {
    sum += value;
    sumSquares += value * value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  });

  return [signatureNumber(sum), signatureNumber(sumSquares), signatureNumber(min), signatureNumber(max)].join(':');
}

function triangleArea(triangle: ReportTriangle): number {
  const c = cross3(sub3(triangle.b, triangle.a), sub3(triangle.c, triangle.a));
  return Math.hypot(c[0], c[1], c[2]) * 0.5;
}

function makeComponentPageSignature(object: ReportObject): string {
  const extents = [
    Math.abs(object.bbox.max[0] - object.bbox.min[0]),
    Math.abs(object.bbox.max[1] - object.bbox.min[1]),
    Math.abs(object.bbox.max[2] - object.bbox.min[2]),
  ]
    .sort((a, b) => a - b)
    .map(signatureNumber)
    .join(':');
  const triangleAreas = object.triangles.map(triangleArea);
  const edgeLengths = object.edges.map((edge) => distance3(edge.a, edge.b));

  return [
    extents,
    object.triangles.length,
    summarizeMetricSeries(triangleAreas),
    object.edges.length,
    summarizeMetricSeries(edgeLengths),
  ].join('|');
}

export function buildDimensionOwnership(dimensions: DimensionDef[], objects: ReportObject[]): DimensionOwnership {
  const byId = mapDimensionsToOwnerIds(dimensions, objects);
  const combined: DimensionDef[] = [];
  const byComponent = new Map<string, DimensionDef[]>();
  objects.forEach((obj) => byComponent.set(obj.id, []));

  dimensions.forEach((dim) => {
    const owners = byId.get(dim.id) || [];
    if (owners.length === 1) {
      const list = byComponent.get(owners[0]);
      if (list) list.push(dim);
      else combined.push(dim);
      return;
    }
    combined.push(dim);
  });

  return { byId, combined, byComponent };
}

export function collectComponentPageGroups(objects: ReportObject[], ownership: DimensionOwnership): ComponentPageGroup[] {
  const grouped = new Map<string, ReportObject[]>();

  objects.forEach((object) => {
    const key = makeComponentPageSignature(object);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(object);
      return;
    }
    grouped.set(key, [object]);
  });

  return Array.from(grouped.values()).map((groupObjects) => {
    let representative = groupObjects[0];
    let dimensions = ownership.byComponent.get(representative.id) || [];

    groupObjects.slice(1).forEach((object) => {
      const candidateDimensions = ownership.byComponent.get(object.id) || [];
      if (candidateDimensions.length > dimensions.length) {
        representative = object;
        dimensions = candidateDimensions;
      }
    });

    return {
      representative,
      dimensions,
      instanceCount: groupObjects.length,
    };
  });
}

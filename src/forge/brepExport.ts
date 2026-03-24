import type { CadQueryShapePlan } from './cadqueryPlan';
import { buildCompiledSceneReport, type CompiledSceneReport } from './scene/compiledScene';
import type { GeometryInfo, Shape } from './kernel';
import type { SceneObject } from './runner';

export interface BrepMesh {
  vertices: [number, number, number][];
  triangles: [number, number, number][];
}

export interface BrepExactExportObject {
  kind: 'exact';
  target: 'cadquery-occt';
  name: string;
  color?: string;
  plan: CadQueryShapePlan;
}

export interface BrepFacetedExportObject {
  kind: 'faceted';
  name: string;
  color?: string;
  mesh: BrepMesh;
}

export type BrepExportObject = BrepExactExportObject | BrepFacetedExportObject;

export interface BrepExportUnsupportedObject {
  name: string;
  reason: string;
  geometryInfo?: GeometryInfo | null;
}

export interface BrepExportSkippedObject {
  name: string;
  reason: string;
}

export interface BrepExportFallbackObject {
  name: string;
  reason: string;
  geometryInfo?: GeometryInfo | null;
}

export interface BrepExportManifest {
  objects: BrepExportObject[];
  unsupported: BrepExportUnsupportedObject[];
  skipped: BrepExportSkippedObject[];
  fallbacks: BrepExportFallbackObject[];
}

export interface BuildBrepExportOptions {
  allowFaceted?: boolean;
  compiledSceneReport?: CompiledSceneReport;
}

function serializeShapeMesh(shape: Shape): BrepMesh {
  const mesh = shape.getMesh();
  const vertexCount = Math.floor(mesh.vertProperties.length / mesh.numProp);
  const vertices: [number, number, number][] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * mesh.numProp;
    vertices.push([mesh.vertProperties[offset], mesh.vertProperties[offset + 1], mesh.vertProperties[offset + 2]]);
  }

  const triangles: [number, number, number][] = [];
  for (let index = 0; index < mesh.numTri; index += 1) {
    const offset = index * 3;
    triangles.push([mesh.triVerts[offset], mesh.triVerts[offset + 1], mesh.triVerts[offset + 2]]);
  }

  return { vertices, triangles };
}

export function buildBrepExportManifest(objects: SceneObject[], options: BuildBrepExportOptions = {}): BrepExportManifest {
  const compiledSceneReport = options.compiledSceneReport ?? buildCompiledSceneReport(objects);
  const manifest: BrepExportManifest = {
    objects: [],
    unsupported: [],
    skipped: [],
    fallbacks: [],
  };

  for (const object of compiledSceneReport.objects) {
    const route = options.allowFaceted ? object.routes.faceted : object.routes.exact;

    switch (route.kind) {
      case 'skipped':
        manifest.skipped.push({
          name: object.name,
          reason: route.reason,
        });
        break;
      case 'unsupported':
        manifest.unsupported.push({
          name: object.name,
          reason: route.reason,
          geometryInfo: route.geometryInfo ?? ('geometryInfo' in object ? (object.geometryInfo ?? null) : null),
        });
        break;
      case 'exact':
        manifest.objects.push({
          kind: 'exact',
          target: 'cadquery-occt',
          name: object.name,
          color: object.color,
          plan: route.plan as CadQueryShapePlan,
        });
        break;
      case 'faceted':
        if (object.kind !== 'shape') {
          throw new Error(`Faceted route requires a shape payload (${object.name})`);
        }
        manifest.objects.push({
          kind: 'faceted',
          name: object.name,
          color: object.color,
          mesh: serializeShapeMesh(object.shape),
        });
        manifest.fallbacks.push({
          name: object.name,
          reason: route.reason,
          geometryInfo: route.geometryInfo,
        });
        break;
    }
  }

  return manifest;
}

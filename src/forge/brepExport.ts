import type { GeometryInfo, Shape } from './kernel';
import type { SceneObject } from './runner';
import type { BrepShapePlan } from './brepPlan';
import { buildShapeCompilerReport, summarizeCompilerDiagnostics } from './compilerReport';

export interface BrepMesh {
  vertices: [number, number, number][];
  triangles: [number, number, number][];
}

export interface BrepExactExportObject {
  kind: 'exact';
  name: string;
  color?: string;
  plan: BrepShapePlan;
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
}

function serializeShapeMesh(shape: Shape): BrepMesh {
  const mesh = shape.getMesh();
  const vertexCount = Math.floor(mesh.vertProperties.length / mesh.numProp);
  const vertices: [number, number, number][] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * mesh.numProp;
    vertices.push([
      mesh.vertProperties[offset],
      mesh.vertProperties[offset + 1],
      mesh.vertProperties[offset + 2],
    ]);
  }

  const triangles: [number, number, number][] = [];
  for (let index = 0; index < mesh.numTri; index += 1) {
    const offset = index * 3;
    triangles.push([
      mesh.triVerts[offset],
      mesh.triVerts[offset + 1],
      mesh.triVerts[offset + 2],
    ]);
  }

  return { vertices, triangles };
}

export function buildBrepExportManifest(
  objects: SceneObject[],
  options: BuildBrepExportOptions = {},
): BrepExportManifest {
  const manifest: BrepExportManifest = {
    objects: [],
    unsupported: [],
    skipped: [],
    fallbacks: [],
  };

  for (const object of objects) {
    if (object.sketch) {
      manifest.skipped.push({
        name: object.name,
        reason: 'Sketch objects are skipped for STEP/BREP export.',
      });
      continue;
    }
    if (!object.shape) {
      manifest.unsupported.push({
        name: object.name,
        reason: 'Object has no shape payload.',
        geometryInfo: object.geometryInfo ?? null,
      });
      continue;
    }

    const report = buildShapeCompilerReport(object.shape);
    const geometryInfo = object.geometryInfo ?? report.geometryInfo;
    if (!report.exactBrep.supported) {
      if (options.allowFaceted && report.facetedMesh.supported) {
        manifest.objects.push({
          kind: 'faceted',
          name: object.name,
          color: object.color,
          mesh: serializeShapeMesh(object.shape),
        });
        manifest.fallbacks.push({
          name: object.name,
          reason: `Using faceted mesh fallback because exact BREP lowering failed: ${summarizeCompilerDiagnostics(
            report.exactBrep.diagnostics,
            'geometry is outside exact BREP coverage.',
          )}`,
          geometryInfo,
        });
      } else {
        manifest.unsupported.push({
          name: object.name,
          reason: summarizeCompilerDiagnostics(
            report.exactBrep.diagnostics,
            'No exact BREP export plan is available for this geometry.',
          ),
          geometryInfo,
        });
      }
      continue;
    }

    manifest.objects.push({
      kind: 'exact',
      name: object.name,
      color: object.color,
      plan: report.exactBrep.output as BrepShapePlan,
    });
  }

  return manifest;
}

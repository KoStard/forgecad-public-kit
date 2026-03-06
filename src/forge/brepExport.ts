import { getShapeBrepPlan, type GeometryInfo } from './kernel';
import type { SceneObject } from './runner';
import type { BrepShapePlan } from './brepPlan';

export interface BrepExportObject {
  name: string;
  color?: string;
  plan: BrepShapePlan;
}

export interface BrepExportUnsupportedObject {
  name: string;
  reason: string;
  geometryInfo?: GeometryInfo | null;
}

export interface BrepExportSkippedObject {
  name: string;
  reason: string;
}

export interface BrepExportManifest {
  objects: BrepExportObject[];
  unsupported: BrepExportUnsupportedObject[];
  skipped: BrepExportSkippedObject[];
}

export function buildBrepExportManifest(objects: SceneObject[]): BrepExportManifest {
  const manifest: BrepExportManifest = {
    objects: [],
    unsupported: [],
    skipped: [],
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

    const plan = getShapeBrepPlan(object.shape);
    if (!plan) {
      const sources = object.geometryInfo?.sources?.join('+') ?? 'unknown';
      manifest.unsupported.push({
        name: object.name,
        reason: `No exact BREP export plan is available for this geometry (sources: ${sources}).`,
        geometryInfo: object.geometryInfo ?? object.shape.geometryInfo(),
      });
      continue;
    }

    manifest.objects.push({
      name: object.name,
      color: object.color,
      plan,
    });
  }

  return manifest;
}

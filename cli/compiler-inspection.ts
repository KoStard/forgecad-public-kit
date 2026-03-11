import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { CrossSection } from 'manifold-3d';
import { buildBrepExportManifest, type BrepExportManifest } from '../src/forge/brepExport';
import {
  buildCompiledSceneReport,
  type CompiledSceneObjectReport,
} from '../src/forge/compiledScene';
import { lowerProfileCompilePlanToCadQueryResult } from '../src/forge/compilePlanCadQuery';
import { lowerProfileCompilePlanToCrossSection, lowerShapeCompilePlanToShapeBackend } from '../src/forge/compilePlanManifold';
import type { ShapeCompilerReport } from '../src/forge/compilerReport';
import type { ProfileCompilePlan, ShapeCompilePlan } from '../src/forge/compilePlan';
import type { CadQueryProfilePlan, CadQueryShapePlan } from '../src/forge/cadqueryPlan';
import { getWasm, type GeometryInfo, type Shape } from '../src/forge/kernel';
import { runScript, type SceneObject } from '../src/forge/headless';
import { getSketchCompileProfilePlan } from '../src/forge/sketch/core';
import { collectProjectFiles } from './collect-files';

type ShapeRuntimeLike = Pick<Shape, 'boundingBox' | 'getMesh' | 'numTri' | 'surfaceArea' | 'volume'>;

export interface CompilerManifestSummary {
  objects: Array<{ name: string; kind: 'exact' | 'faceted' }>;
  unsupported: Array<{ name: string; reason: string }>;
  skipped: Array<{ name: string; reason: string }>;
  fallbacks: Array<{ name: string; reason: string }>;
}

export interface ShapeRuntimeSummary {
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  volume: number;
  surfaceArea: number;
  numTri: number;
  vertexCount: number;
  meshDigest: string;
}

export interface SketchRuntimeSummary {
  area: number;
  bounds: {
    min: [number, number];
    max: [number, number];
  };
  numVert: number;
  polygonDigest: string;
}

export interface CompilerRouteInspection {
  kind: 'exact' | 'faceted' | 'skipped' | 'unsupported';
  target?: 'cadquery-occt' | 'faceted-mesh';
  reason?: string;
  diagnostics?: Array<{
    target: string;
    code: string;
    path: string;
    message: string;
  }>;
}

export interface CompilerShapeInspection {
  kind: 'shape';
  name: string;
  geometryInfo: GeometryInfo;
  compilePlan: ShapeCompilePlan | null;
  exactRoute: CompilerRouteInspection;
  facetedRoute: CompilerRouteInspection;
  cadqueryOcct: {
    supported: boolean;
    diagnostics: ShapeCompilerReport['cadqueryOcct']['diagnostics'];
    plan: CadQueryShapePlan | null;
  };
  facetedMesh: {
    supported: boolean;
    diagnostics: ShapeCompilerReport['facetedMesh']['diagnostics'];
  };
  runtime: ShapeRuntimeSummary;
  loweredRuntime: ShapeRuntimeSummary | null;
  loweredRuntimeMatches: boolean | null;
  loweredRuntimeError: string | null;
}

export interface CompilerSketchInspection {
  kind: 'sketch';
  name: string;
  compilePlan: ProfileCompilePlan | null;
  exactRoute: CompilerRouteInspection;
  facetedRoute: CompilerRouteInspection;
  cadqueryOcctProfile: {
    supported: boolean;
    diagnostics: ReturnType<typeof lowerProfileCompilePlanToCadQueryResult>['diagnostics'];
    plan: CadQueryProfilePlan | null;
  };
  runtime: SketchRuntimeSummary;
  loweredRuntime: SketchRuntimeSummary | null;
  loweredRuntimeMatches: boolean | null;
  loweredRuntimeError: string | null;
}

export type CompilerObjectInspection = CompilerShapeInspection | CompilerSketchInspection;

export interface CompilerSceneInspection {
  objects: CompilerObjectInspection[];
  exactExport: CompilerManifestSummary;
  facetedExport: CompilerManifestSummary;
}

export interface CompilerInspectionInput {
  displayPath: string;
  code: string;
  fileName: string;
  allFiles: Record<string, string>;
}

export interface CompilerCaseSnapshot {
  id: string;
  description: string;
  scene: CompilerSceneInspection;
}

function roundNumber(value: number, digits = 6): number {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function stableDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function summarizeShapeRuntime(shape: ShapeRuntimeLike): ShapeRuntimeSummary {
  const bounds = shape.boundingBox() as { min: [number, number, number]; max: [number, number, number] };
  const mesh = shape.getMesh();
  const vertexCount = Math.floor(mesh.vertProperties.length / mesh.numProp);
  const quantizedVertProperties = Array.from(mesh.vertProperties, (entry) => roundNumber(entry));
  const triVerts = Array.from(mesh.triVerts);

  return {
    boundingBox: {
      min: [roundNumber(bounds.min[0]), roundNumber(bounds.min[1]), roundNumber(bounds.min[2])],
      max: [roundNumber(bounds.max[0]), roundNumber(bounds.max[1]), roundNumber(bounds.max[2])],
    },
    volume: roundNumber(shape.volume()),
    surfaceArea: roundNumber(shape.surfaceArea()),
    numTri: shape.numTri(),
    vertexCount,
    meshDigest: stableDigest([mesh.numProp, quantizedVertProperties, triVerts]),
  };
}

function summarizeCrossSectionRuntime(crossSection: Pick<CrossSection, 'area' | 'bounds' | 'numVert' | 'toPolygons'>): SketchRuntimeSummary {
  const bounds = crossSection.bounds() as { min: [number, number]; max: [number, number] };
  const polygons = (crossSection.toPolygons() as [number, number][][]).map((polygon) =>
    polygon.map((point) => [roundNumber(point[0]), roundNumber(point[1])]),
  );

  return {
    area: roundNumber(crossSection.area()),
    bounds: {
      min: [roundNumber(bounds.min[0]), roundNumber(bounds.min[1])],
      max: [roundNumber(bounds.max[0]), roundNumber(bounds.max[1])],
    },
    numVert: crossSection.numVert(),
    polygonDigest: stableDigest(polygons),
  };
}

function summarizeManifest(manifest: BrepExportManifest): CompilerManifestSummary {
  return {
    objects: manifest.objects.map((object) => ({ name: object.name, kind: object.kind })),
    unsupported: manifest.unsupported.map((item) => ({ name: item.name, reason: item.reason })),
    skipped: manifest.skipped.map((item) => ({ name: item.name, reason: item.reason })),
    fallbacks: manifest.fallbacks.map((item) => ({ name: item.name, reason: item.reason })),
  };
}

function summarizeRoute(route: CompiledSceneObjectReport['routes']['exact']): CompilerRouteInspection {
  switch (route.kind) {
    case 'exact':
      return {
        kind: 'exact',
        target: route.target,
        diagnostics: route.diagnostics.map((diagnostic) => ({
          target: diagnostic.target,
          code: diagnostic.code,
          path: diagnostic.path,
          message: diagnostic.message,
        })),
      };
    case 'faceted':
      return {
        kind: 'faceted',
        target: route.target,
        reason: route.reason,
        diagnostics: route.diagnostics.map((diagnostic) => ({
          target: diagnostic.target,
          code: diagnostic.code,
          path: diagnostic.path,
          message: diagnostic.message,
        })),
      };
    case 'skipped':
      return {
        kind: 'skipped',
        reason: route.reason,
      };
    case 'unsupported':
      return {
        kind: 'unsupported',
        reason: route.reason,
        diagnostics: route.diagnostics.map((diagnostic) => ({
          target: diagnostic.target,
          code: diagnostic.code,
          path: diagnostic.path,
          message: diagnostic.message,
        })),
      };
  }
}

function inspectShapeObject(
  object: SceneObject & { shape: NonNullable<SceneObject['shape']> },
  compiled: Extract<CompiledSceneObjectReport, { kind: 'shape' }>,
): CompilerShapeInspection {
  const report = compiled.compiler;
  const runtime = summarizeShapeRuntime(object.shape);
  const loweredRuntime = (() => {
    if (!report.compilePlan) return { summary: null, error: null as string | null };
    try {
      return {
        summary: summarizeShapeRuntime(lowerShapeCompilePlanToShapeBackend(report.compilePlan, getWasm())),
        error: null,
      };
    } catch (error) {
      return {
        summary: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  return {
    kind: 'shape',
    name: object.name,
    geometryInfo: report.geometryInfo,
    compilePlan: report.compilePlan,
    exactRoute: summarizeRoute(compiled.routes.exact),
    facetedRoute: summarizeRoute(compiled.routes.faceted),
    cadqueryOcct: {
      supported: report.cadqueryOcct.supported,
      diagnostics: report.cadqueryOcct.diagnostics,
      plan: report.cadqueryOcct.output ?? null,
    },
    facetedMesh: {
      supported: report.facetedMesh.supported,
      diagnostics: report.facetedMesh.diagnostics,
    },
    runtime,
    loweredRuntime: loweredRuntime.summary,
    loweredRuntimeMatches: loweredRuntime.summary ? JSON.stringify(runtime) === JSON.stringify(loweredRuntime.summary) : null,
    loweredRuntimeError: loweredRuntime.error,
  };
}

function inspectSketchObject(
  object: SceneObject & { sketch: NonNullable<SceneObject['sketch']> },
  compiled: Extract<CompiledSceneObjectReport, { kind: 'sketch' }>,
): CompilerSketchInspection {
  const compilePlan = getSketchCompileProfilePlan(object.sketch);
  const runtime = summarizeCrossSectionRuntime(object.sketch.cross);
  const cadqueryOcctProfile = lowerProfileCompilePlanToCadQueryResult(compilePlan);
  const loweredRuntime = (() => {
    if (!compilePlan) return { summary: null, error: null as string | null };
    try {
      return {
        summary: summarizeCrossSectionRuntime(lowerProfileCompilePlanToCrossSection(compilePlan, getWasm())),
        error: null,
      };
    } catch (error) {
      return {
        summary: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  return {
    kind: 'sketch',
    name: object.name,
    compilePlan,
    exactRoute: summarizeRoute(compiled.routes.exact),
    facetedRoute: summarizeRoute(compiled.routes.faceted),
    cadqueryOcctProfile: {
      supported: cadqueryOcctProfile.ok,
      diagnostics: cadqueryOcctProfile.diagnostics,
      plan: cadqueryOcctProfile.ok ? cadqueryOcctProfile.value : null,
    },
    runtime,
    loweredRuntime: loweredRuntime.summary,
    loweredRuntimeMatches: loweredRuntime.summary ? JSON.stringify(runtime) === JSON.stringify(loweredRuntime.summary) : null,
    loweredRuntimeError: loweredRuntime.error,
  };
}

export function inspectCompilerScene(input: CompilerInspectionInput): CompilerSceneInspection {
  const result = runScript(input.code, input.fileName, input.allFiles);
  if (result.error) {
    throw new Error(`${input.displayPath}: ${result.error}`);
  }
  const compiledSceneReport = buildCompiledSceneReport(result.objects);
  const compiledById = new Map(compiledSceneReport.objects.map((object) => [object.id, object]));

  const objects: CompilerObjectInspection[] = result.objects.flatMap((object) => {
    const compiled = compiledById.get(object.id);
    if (!compiled) return [];
    if (object.shape && compiled.kind === 'shape') {
      return [inspectShapeObject(object as SceneObject & { shape: NonNullable<SceneObject['shape']> }, compiled)];
    }
    if (object.sketch && compiled.kind === 'sketch') {
      return [inspectSketchObject(object as SceneObject & { sketch: NonNullable<SceneObject['sketch']> }, compiled)];
    }
    return [];
  });

  return {
    objects,
    exactExport: summarizeManifest(buildBrepExportManifest(result.objects, { compiledSceneReport })),
    facetedExport: summarizeManifest(buildBrepExportManifest(result.objects, { allowFaceted: true, compiledSceneReport })),
  };
}

export function loadCompilerInspectionInput(scriptPath: string): CompilerInspectionInput {
  const abs = resolve(scriptPath);
  const code = readFileSync(abs, 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(abs);
  return {
    displayPath: abs,
    code,
    fileName,
    allFiles,
  };
}

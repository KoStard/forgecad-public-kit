import type { CadQueryShapePlan } from './cadqueryPlan';
import type { CompilerDiagnostic } from './compilerDiagnostics';
import { buildShapeCompilerReport, type ShapeCompilerReport, summarizeCompilerDiagnostics } from './compilerReport';
import type { GeometryInfo, Shape } from './kernel';
import type { SceneObject } from './runner';

export type CompiledSceneTargetRoute =
  | {
      kind: 'exact';
      target: 'cadquery-occt';
      plan: CadQueryShapePlan;
      diagnostics: CompilerDiagnostic[];
    }
  | {
      kind: 'faceted';
      target: 'faceted-mesh';
      reason: string;
      diagnostics: CompilerDiagnostic[];
      geometryInfo: GeometryInfo;
    }
  | {
      kind: 'skipped';
      reason: string;
    }
  | {
      kind: 'unsupported';
      reason: string;
      diagnostics: CompilerDiagnostic[];
      geometryInfo?: GeometryInfo | null;
    };

interface CompiledSceneObjectReportBase {
  id: string;
  name: string;
  color?: string;
  groupName?: string;
  treePath?: string[];
  routes: {
    exact: CompiledSceneTargetRoute;
    faceted: CompiledSceneTargetRoute;
  };
}

export interface CompiledSceneShapeObjectReport extends CompiledSceneObjectReportBase {
  kind: 'shape';
  shape: Shape;
  geometryInfo: GeometryInfo;
  compiler: ShapeCompilerReport;
}

export interface CompiledSceneSketchObjectReport extends CompiledSceneObjectReportBase {
  kind: 'sketch';
}

export interface CompiledSceneEmptyObjectReport extends CompiledSceneObjectReportBase {
  kind: 'empty';
  geometryInfo?: GeometryInfo | null;
}

export type CompiledSceneObjectReport = CompiledSceneShapeObjectReport | CompiledSceneSketchObjectReport | CompiledSceneEmptyObjectReport;

export interface CompiledSceneReport {
  objects: CompiledSceneObjectReport[];
}

function skippedRoute(reason: string): CompiledSceneTargetRoute {
  return { kind: 'skipped', reason };
}

function unsupportedRoute(
  reason: string,
  diagnostics: CompilerDiagnostic[] = [],
  geometryInfo?: GeometryInfo | null,
): CompiledSceneTargetRoute {
  return {
    kind: 'unsupported',
    reason,
    diagnostics,
    geometryInfo,
  };
}

function exactRoute(report: ShapeCompilerReport): CompiledSceneTargetRoute {
  return {
    kind: 'exact',
    target: 'cadquery-occt',
    plan: report.cadqueryOcct.output as CadQueryShapePlan,
    diagnostics: report.cadqueryOcct.diagnostics,
  };
}

function facetedRoute(report: ShapeCompilerReport): CompiledSceneTargetRoute {
  return {
    kind: 'faceted',
    target: 'faceted-mesh',
    reason: `Using faceted mesh fallback because exact BREP lowering failed: ${summarizeCompilerDiagnostics(
      report.cadqueryOcct.diagnostics,
      'geometry is outside exact BREP coverage.',
    )}`,
    diagnostics: report.cadqueryOcct.diagnostics,
    geometryInfo: report.geometryInfo,
  };
}

function facetedUnsupportedReason(report: ShapeCompilerReport): string {
  const exactReason = summarizeCompilerDiagnostics(
    report.cadqueryOcct.diagnostics,
    'No exact BREP export plan is available for this geometry.',
  );
  const facetedReason = summarizeCompilerDiagnostics(report.facetedMesh.diagnostics, 'Faceted fallback is unavailable for this geometry.');
  return `Exact BREP lowering failed: ${exactReason} Faceted fallback unavailable: ${facetedReason}`;
}

function buildShapeRoutes(report: ShapeCompilerReport): {
  exact: CompiledSceneTargetRoute;
  faceted: CompiledSceneTargetRoute;
} {
  const exact = report.cadqueryOcct.supported
    ? exactRoute(report)
    : unsupportedRoute(
        summarizeCompilerDiagnostics(report.cadqueryOcct.diagnostics, 'No exact BREP export plan is available for this geometry.'),
        report.cadqueryOcct.diagnostics,
        report.geometryInfo,
      );

  const faceted = report.cadqueryOcct.supported
    ? exactRoute(report)
    : report.facetedMesh.supported
      ? facetedRoute(report)
      : unsupportedRoute(
          facetedUnsupportedReason(report),
          [...report.cadqueryOcct.diagnostics, ...report.facetedMesh.diagnostics],
          report.geometryInfo,
        );

  return { exact, faceted };
}

function buildSceneObjectReport(object: SceneObject): CompiledSceneObjectReport {
  if (object.sketch) {
    const routes = {
      exact: skippedRoute('Sketch objects are skipped for STEP/BREP export.'),
      faceted: skippedRoute('Sketch objects are skipped for STEP/BREP export.'),
    };
    return {
      kind: 'sketch',
      id: object.id,
      name: object.name,
      color: object.color,
      groupName: object.groupName,
      treePath: object.treePath,
      routes,
    };
  }

  if (!object.shape) {
    const routes = {
      exact: unsupportedRoute('Object has no shape payload.', [], object.geometryInfo ?? null),
      faceted: unsupportedRoute('Object has no shape payload.', [], object.geometryInfo ?? null),
    };
    return {
      kind: 'empty',
      id: object.id,
      name: object.name,
      color: object.color,
      groupName: object.groupName,
      treePath: object.treePath,
      geometryInfo: object.geometryInfo ?? null,
      routes,
    };
  }

  const compiler = buildShapeCompilerReport(object.shape);
  return {
    kind: 'shape',
    id: object.id,
    name: object.name,
    color: object.color,
    groupName: object.groupName,
    treePath: object.treePath,
    shape: object.shape,
    geometryInfo: object.geometryInfo ?? compiler.geometryInfo,
    compiler,
    routes: buildShapeRoutes(compiler),
  };
}

export function buildCompiledSceneReport(objects: SceneObject[]): CompiledSceneReport {
  return {
    objects: objects.map((object) => buildSceneObjectReport(object)),
  };
}

import type { ShapeCompilePlan } from './compilePlan';
import type { CadQueryShapePlan } from './cadqueryPlan';
import {
  compilerDiagnostic,
  describeCompilerTarget,
  primaryCompilerDiagnosticMessage,
  type CompilerDiagnostic,
  type CompilerTarget,
} from './compilerDiagnostics';
import { lowerShapeCompilePlanToCadQueryResult } from './compilePlanCadQuery';
import { collectShapeTopologyRewritePropagations } from './queryPropagation';
import { getShapeCompilePlan, type GeometryInfo, type Shape } from './kernel';
import type { TopologyRewritePropagation } from './queryModel';

export interface CompilerTargetReport<T> {
  target: CompilerTarget;
  supported: boolean;
  diagnostics: CompilerDiagnostic[];
  output?: T;
}

export interface ShapeCompilerReport {
  geometryInfo: GeometryInfo;
  compilePlan: ShapeCompilePlan | null;
  topologyRewritePropagations: TopologyRewritePropagation[];
  cadqueryOcct: CompilerTargetReport<CadQueryShapePlan>;
  facetedMesh: CompilerTargetReport<null>;
}

function unsupportedTargetReport<T>(
  target: CompilerTarget,
  diagnostics: CompilerDiagnostic[],
): CompilerTargetReport<T> {
  return {
    target,
    supported: false,
    diagnostics,
  };
}

function supportedTargetReport<T>(
  target: CompilerTarget,
  output: T,
  diagnostics: CompilerDiagnostic[] = [],
): CompilerTargetReport<T> {
  return {
    target,
    supported: true,
    diagnostics,
    output,
  };
}

function missingCompilePlanDiagnostic(target: CompilerTarget): CompilerDiagnostic {
  return compilerDiagnostic(
    target,
    'missing-compile-plan',
    '$',
    `Forge compile intent is missing, so ${describeCompilerTarget(target)} lowering cannot replay this shape.`,
  );
}

function nonMeshFacetedFallbackDiagnostic(geometryInfo: GeometryInfo): CompilerDiagnostic {
  return compilerDiagnostic(
    'faceted-mesh',
    'faceted-mesh-unavailable',
    '$',
    `Faceted fallback requires mesh-solid runtime geometry, got ${geometryInfo.representation}.`,
  );
}

export function summarizeCompilerDiagnostics(
  diagnostics: CompilerDiagnostic[],
  fallback: string,
): string {
  return primaryCompilerDiagnosticMessage(diagnostics, fallback);
}

export function buildShapeCompilerReport(shape: Shape): ShapeCompilerReport {
  const compilePlan = getShapeCompilePlan(shape);
  const geometryInfo = shape.geometryInfo();
  const cadqueryOcct = (() => {
    if (!compilePlan) {
      return unsupportedTargetReport<CadQueryShapePlan>('cadquery-occt', [missingCompilePlanDiagnostic('cadquery-occt')]);
    }
    const lowered = lowerShapeCompilePlanToCadQueryResult(compilePlan);
    return lowered.ok
      ? supportedTargetReport('cadquery-occt', lowered.value, lowered.diagnostics)
      : unsupportedTargetReport<CadQueryShapePlan>('cadquery-occt', lowered.diagnostics);
  })();

  const facetedMesh = geometryInfo.representation === 'mesh-solid'
    ? supportedTargetReport('faceted-mesh', null)
    : unsupportedTargetReport<null>('faceted-mesh', [nonMeshFacetedFallbackDiagnostic(geometryInfo)]);

  return {
    geometryInfo,
    compilePlan,
    topologyRewritePropagations: collectShapeTopologyRewritePropagations(compilePlan),
    cadqueryOcct,
    facetedMesh,
  };
}

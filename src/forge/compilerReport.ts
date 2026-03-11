import type { ShapeCompilePlan } from './compilePlan';
import type { BrepShapePlan } from './brepPlan';
import {
  compilerDiagnostic,
  primaryCompilerDiagnosticMessage,
  type CompilerDiagnostic,
  type CompilerTarget,
} from './compilerDiagnostics';
import { lowerShapeCompilePlanToBrepResult } from './compilePlanBrep';
import { getShapeCompilePlan, type GeometryInfo, type Shape } from './kernel';

export interface CompilerTargetReport<T> {
  target: CompilerTarget;
  supported: boolean;
  diagnostics: CompilerDiagnostic[];
  output?: T;
}

export interface ShapeCompilerReport {
  geometryInfo: GeometryInfo;
  compilePlan: ShapeCompilePlan | null;
  exactBrep: CompilerTargetReport<BrepShapePlan>;
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
    `Forge compile intent is missing, so ${target} lowering cannot replay this shape.`,
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
  const exactBrep = (() => {
    if (!compilePlan) {
      return unsupportedTargetReport<BrepShapePlan>('exact-brep', [missingCompilePlanDiagnostic('exact-brep')]);
    }
    const lowered = lowerShapeCompilePlanToBrepResult(compilePlan);
    return lowered.ok
      ? supportedTargetReport('exact-brep', lowered.value, lowered.diagnostics)
      : unsupportedTargetReport<BrepShapePlan>('exact-brep', lowered.diagnostics);
  })();

  const facetedMesh = geometryInfo.representation === 'mesh-solid'
    ? supportedTargetReport('faceted-mesh', null)
    : unsupportedTargetReport<null>('faceted-mesh', [nonMeshFacetedFallbackDiagnostic(geometryInfo)]);

  return {
    geometryInfo,
    compilePlan,
    exactBrep,
    facetedMesh,
  };
}

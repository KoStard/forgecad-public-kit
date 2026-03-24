import { appendCadQueryProfileTransform, type CadQueryProfilePlan, type CadQueryShapePlan } from './cadqueryPlan';
import { assertExhaustive, type ProfileCompilePlan, type ShapeCompilePlan } from './compilePlan';
import { type CompileLoweringResult, compilerDiagnostic, compilerFailure, compilerSuccess } from './compilerDiagnostics';
import { resolveSupportedEdgeFeatureSelection, selectionToResolvedSelector } from './edgeFeatureResolution';
import { lowerCutShapeCompilePlanToConcretePlan, lowerHoleShapeCompilePlanToConcretePlan } from './holeCutCompilePlan';
import { lowerSheetMetalBasePlan } from './sheetMetalModel';
import { lowerShellShapeCompilePlanToConcretePlan } from './shellCompilePlan';

function segmentedProfileDiagnostic(kind: string, path: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    `cadquery-occt-segmented-${kind}`,
    path,
    `CadQuery/OCCT lowering does not support segmented ${kind} geometry at ${path}; use the analytic form or faceted fallback.`,
  );
}

function segmentedShapeDiagnostic(kind: string, path: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    `cadquery-occt-segmented-${kind}`,
    path,
    `CadQuery/OCCT lowering does not support segmented ${kind} solids at ${path}; use the analytic form or faceted fallback.`,
  );
}

function unsupportedNodeDiagnostic(kind: string, path: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    `cadquery-occt-unsupported-${kind}`,
    path,
    `CadQuery/OCCT lowering does not support Forge ${kind} intent at ${path} yet.`,
  );
}

function unsupportedProjectDiagnostic(path: string, reason: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    'cadquery-occt-unsupported-project',
    path,
    `CadQuery/OCCT lowering cannot replay Forge projection intent at ${path}: ${reason}`,
  );
}

function unsupportedShellDiagnostic(path: string, reason: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    'cadquery-occt-unsupported-shell',
    path,
    `CadQuery/OCCT lowering cannot replay Forge shell intent at ${path}: ${reason}`,
  );
}

function unsupportedHoleCutDiagnostic(kind: 'hole' | 'cut', path: string, reason: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    `cadquery-occt-unsupported-${kind}`,
    path,
    `CadQuery/OCCT lowering cannot replay Forge ${kind} intent at ${path}: ${reason}`,
  );
}

function unsupportedSheetMetalDiagnostic(path: string, reason: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    'cadquery-occt-unsupported-sheet-metal',
    path,
    `CadQuery/OCCT lowering cannot replay Forge sheet-metal intent at ${path}: ${reason}`,
  );
}

function unsupportedEdgeFeatureDiagnostic(kind: 'fillet' | 'chamfer', path: string, reason: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    `cadquery-occt-unsupported-${kind}`,
    path,
    `CadQuery/OCCT lowering cannot replay Forge ${kind} intent at ${path}: ${reason}`,
  );
}

function missingCompilePlanDiagnostic(path: string) {
  return compilerDiagnostic(
    'cadquery-occt',
    'missing-compile-plan',
    path,
    `CadQuery/OCCT lowering cannot proceed because Forge compile intent is missing at ${path}.`,
  );
}

function lowerProfileCompilePlanToCadQueryResultAtPath(
  plan: ProfileCompilePlan | null,
  path: string,
): CompileLoweringResult<CadQueryProfilePlan> {
  if (!plan) return compilerFailure(missingCompilePlanDiagnostic(path));

  switch (plan.kind) {
    case 'rect':
      return compilerSuccess({
        kind: 'rect',
        width: plan.width,
        height: plan.height,
        center: plan.center,
        transforms: [...plan.transforms],
      });
    case 'roundedRect':
      return compilerSuccess({
        kind: 'roundedRect',
        width: plan.width,
        height: plan.height,
        radius: plan.radius,
        center: plan.center,
        transforms: [...plan.transforms],
      });
    case 'circle':
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedProfileDiagnostic('circle profiles', path));
      }
      return compilerSuccess({
        kind: 'circle',
        radius: plan.radius,
        transforms: [...plan.transforms],
      });
    case 'polygon':
      return compilerSuccess({
        kind: 'polygon',
        points: plan.points.map(([x, y]) => [x, y]),
        transforms: [...plan.transforms],
      });
    case 'boolean': {
      const profiles: CadQueryProfilePlan[] = [];
      const diagnostics = [];
      for (let index = 0; index < plan.profiles.length; index += 1) {
        const lowered = lowerProfileCompilePlanToCadQueryResultAtPath(plan.profiles[index], `${path}.profiles[${index}]`);
        if (!lowered.ok) {
          diagnostics.push(...lowered.diagnostics);
          continue;
        }
        diagnostics.push(...lowered.diagnostics);
        profiles.push(lowered.value);
      }
      if (profiles.length !== plan.profiles.length) {
        return compilerFailure(...diagnostics);
      }
      return compilerSuccess(
        {
          kind: 'boolean',
          op: plan.op,
          profiles,
          transforms: [...plan.transforms],
        },
        diagnostics,
      );
    }
    case 'offset': {
      const base = lowerProfileCompilePlanToCadQueryResultAtPath(plan.base, `${path}.base`);
      if (!base.ok) return compilerFailure(...base.diagnostics);
      return compilerSuccess(
        {
          kind: 'offset',
          base: base.value,
          delta: plan.delta,
          join: plan.join,
          transforms: [...plan.transforms],
        },
        base.diagnostics,
      );
    }
    case 'project': {
      if (!plan.replayProfile) {
        return compilerFailure(unsupportedProjectDiagnostic(path, plan.replayReason ?? 'projection replay metadata is missing.'));
      }

      const replay = lowerProfileCompilePlanToCadQueryResultAtPath(plan.replayProfile, `${path}.replayProfile`);
      if (!replay.ok) return compilerFailure(...replay.diagnostics);

      let lowered = replay.value;
      for (const transform of plan.transforms) {
        lowered = appendCadQueryProfileTransform(lowered, transform)!;
      }
      return compilerSuccess(lowered, replay.diagnostics);
    }
    default:
      assertExhaustive(plan);
  }
}

function lowerShapeCompilePlanToCadQueryResultAtPath(
  plan: ShapeCompilePlan | null,
  path: string,
): CompileLoweringResult<CadQueryShapePlan> {
  if (!plan) return compilerFailure(missingCompilePlanDiagnostic(path));

  switch (plan.kind) {
    case 'box':
      return compilerSuccess({ kind: 'box', x: plan.x, y: plan.y, z: plan.z, center: plan.center });
    case 'cylinder':
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedShapeDiagnostic('cylinder', path));
      }
      return compilerSuccess({
        kind: 'cylinder',
        height: plan.height,
        radius: plan.radius,
        radiusTop: plan.radiusTop,
        center: plan.center,
      });
    case 'sphere':
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedShapeDiagnostic('sphere', path));
      }
      return compilerSuccess({ kind: 'sphere', radius: plan.radius });
    case 'torus':
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedShapeDiagnostic('torus', path));
      }
      return compilerSuccess({ kind: 'torus', majorRadius: plan.majorRadius, minorRadius: plan.minorRadius });
    case 'extrude': {
      const profile = lowerProfileCompilePlanToCadQueryResultAtPath(plan.profile, `${path}.profile`);
      if (!profile.ok) return compilerFailure(...profile.diagnostics);
      return compilerSuccess(
        {
          kind: 'extrude',
          profile: profile.value,
          height: plan.height,
          center: plan.center,
          scaleTop: plan.scaleTop ? [plan.scaleTop[0], plan.scaleTop[1]] : undefined,
        },
        profile.diagnostics,
      );
    }
    case 'sheetMetal': {
      try {
        return lowerShapeCompilePlanToCadQueryResultAtPath(lowerSheetMetalBasePlan(plan.model, plan.output), path);
      } catch (error) {
        return compilerFailure(unsupportedSheetMetalDiagnostic(path, error instanceof Error ? error.message : String(error)));
      }
    }
    case 'shell': {
      const lowered = lowerShellShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) return compilerFailure(unsupportedShellDiagnostic(path, lowered.reason));
      return lowerShapeCompilePlanToCadQueryResultAtPath(lowered.plan, path);
    }
    case 'hole': {
      const lowered = lowerHoleShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) return compilerFailure(unsupportedHoleCutDiagnostic('hole', path, lowered.reason));
      return lowerShapeCompilePlanToCadQueryResultAtPath(lowered.plan, path);
    }
    case 'cut': {
      const lowered = lowerCutShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) return compilerFailure(unsupportedHoleCutDiagnostic('cut', path, lowered.reason));
      return lowerShapeCompilePlanToCadQueryResultAtPath(lowered.plan, path);
    }
    case 'revolve': {
      if (plan.segments != null && plan.segments > 0) {
        return compilerFailure(segmentedShapeDiagnostic('revolve', path));
      }
      const profile = lowerProfileCompilePlanToCadQueryResultAtPath(plan.profile, `${path}.profile`);
      if (!profile.ok) return compilerFailure(...profile.diagnostics);
      return compilerSuccess(
        {
          kind: 'revolve',
          profile: profile.value,
          degrees: plan.degrees,
        },
        profile.diagnostics,
      );
    }
    case 'loft': {
      const profiles: CadQueryProfilePlan[] = [];
      const diagnostics = [];
      for (let index = 0; index < plan.profiles.length; index += 1) {
        const lowered = lowerProfileCompilePlanToCadQueryResultAtPath(plan.profiles[index], `${path}.profiles[${index}]`);
        if (!lowered.ok) {
          diagnostics.push(...lowered.diagnostics);
          continue;
        }
        diagnostics.push(...lowered.diagnostics);
        profiles.push(lowered.value);
      }
      if (profiles.length !== plan.profiles.length) {
        return compilerFailure(...diagnostics);
      }
      return compilerSuccess(
        {
          kind: 'loft',
          profiles,
          heights: [...plan.heights],
          edgeLength: plan.edgeLength,
          boundsPadding: plan.boundsPadding,
        },
        diagnostics,
      );
    }
    case 'sweep': {
      const profile = lowerProfileCompilePlanToCadQueryResultAtPath(plan.profile, `${path}.profile`);
      if (!profile.ok) return compilerFailure(...profile.diagnostics);
      return compilerSuccess(
        {
          kind: 'sweep',
          profile: profile.value,
          path: {
            kind: plan.path.kind,
            points: plan.path.points.map(([x, y, z]) => [x, y, z]),
          },
          edgeLength: plan.edgeLength,
          boundsPadding: plan.boundsPadding,
          up: [plan.up[0], plan.up[1], plan.up[2]],
        },
        profile.diagnostics,
      );
    }
    case 'boolean': {
      const shapes: CadQueryShapePlan[] = [];
      const diagnostics = [];
      for (let index = 0; index < plan.shapes.length; index += 1) {
        const lowered = lowerShapeCompilePlanToCadQueryResultAtPath(plan.shapes[index], `${path}.shapes[${index}]`);
        if (!lowered.ok) {
          diagnostics.push(...lowered.diagnostics);
          continue;
        }
        diagnostics.push(...lowered.diagnostics);
        shapes.push(lowered.value);
      }
      if (shapes.length !== plan.shapes.length) {
        return compilerFailure(...diagnostics);
      }
      return compilerSuccess(
        {
          kind: 'boolean',
          op: plan.op,
          shapes,
        },
        diagnostics,
      );
    }
    case 'transform': {
      const base = lowerShapeCompilePlanToCadQueryResultAtPath(plan.base, `${path}.base`);
      if (!base.ok) return compilerFailure(...base.diagnostics);
      return compilerSuccess(
        {
          kind: 'transform',
          base: base.value,
          steps: [...plan.steps],
        },
        base.diagnostics,
      );
    }
    case 'queryOwner':
      return lowerShapeCompilePlanToCadQueryResultAtPath(plan.base, `${path}.base`);
    case 'fillet': {
      const base = lowerShapeCompilePlanToCadQueryResultAtPath(plan.base, `${path}.base`);
      if (!base.ok) return compilerFailure(...base.diagnostics);
      const selection = resolveSupportedEdgeFeatureSelection(plan.base, plan.edge);
      if (!selection.ok) {
        return compilerFailure(unsupportedEdgeFeatureDiagnostic('fillet', path, selection.issue.reason));
      }
      if (selection.selection.quadrant[0] !== plan.quadrant[0] || selection.selection.quadrant[1] !== plan.quadrant[1]) {
        return compilerFailure(
          unsupportedEdgeFeatureDiagnostic(
            'fillet',
            path,
            `supported ${selection.selection.edgeName} queries currently require quadrant [${selection.selection.quadrant[0]}, ${selection.selection.quadrant[1]}].`,
          ),
        );
      }
      return compilerSuccess(
        {
          kind: 'fillet',
          base: base.value,
          edge: plan.edge,
          radius: plan.radius,
          quadrant: [plan.quadrant[0], plan.quadrant[1]],
          segments: plan.segments,
          resolvedEdge: selectionToResolvedSelector(selection.selection),
        },
        base.diagnostics,
      );
    }
    case 'chamfer': {
      const base = lowerShapeCompilePlanToCadQueryResultAtPath(plan.base, `${path}.base`);
      if (!base.ok) return compilerFailure(...base.diagnostics);
      const selection = resolveSupportedEdgeFeatureSelection(plan.base, plan.edge);
      if (!selection.ok) {
        return compilerFailure(unsupportedEdgeFeatureDiagnostic('chamfer', path, selection.issue.reason));
      }
      if (selection.selection.quadrant[0] !== plan.quadrant[0] || selection.selection.quadrant[1] !== plan.quadrant[1]) {
        return compilerFailure(
          unsupportedEdgeFeatureDiagnostic(
            'chamfer',
            path,
            `supported ${selection.selection.edgeName} queries currently require quadrant [${selection.selection.quadrant[0]}, ${selection.selection.quadrant[1]}].`,
          ),
        );
      }
      return compilerSuccess(
        {
          kind: 'chamfer',
          base: base.value,
          edge: plan.edge,
          size: plan.size,
          quadrant: [plan.quadrant[0], plan.quadrant[1]],
          resolvedEdge: selectionToResolvedSelector(selection.selection),
        },
        base.diagnostics,
      );
    }
    case 'trimByPlane': {
      const base = lowerShapeCompilePlanToCadQueryResultAtPath(plan.base, `${path}.base`);
      if (!base.ok) return compilerFailure(...base.diagnostics);
      return compilerSuccess(
        {
          kind: 'trimByPlane',
          base: base.value,
          normalX: plan.normalX,
          normalY: plan.normalY,
          normalZ: plan.normalZ,
          originOffset: plan.originOffset,
        },
        base.diagnostics,
      );
    }
    case 'filletEdges':
    case 'chamferEdges': {
      const base = lowerShapeCompilePlanToCadQueryResultAtPath(plan.base, `${path}.base`);
      if (!base.ok) return compilerFailure(...base.diagnostics);
      return compilerSuccess(base.value, base.diagnostics);
    }
    case 'draft':
      return compilerFailure(unsupportedNodeDiagnostic('shape-draft', path));
    case 'offsetSolid':
      return compilerFailure(unsupportedNodeDiagnostic('shape-offsetSolid', path));
    case 'importedMesh':
      return compilerFailure(unsupportedNodeDiagnostic('shape-importedMesh', path));
    default:
      assertExhaustive(plan);
  }
}

/**
 * Explicit lowering boundary from Forge's canonical compile plan into the
 * CadQuery/OCCT exact subset.
 */
export function lowerProfileCompilePlanToCadQueryResult(plan: ProfileCompilePlan | null): CompileLoweringResult<CadQueryProfilePlan> {
  return lowerProfileCompilePlanToCadQueryResultAtPath(plan, '$');
}

export function lowerShapeCompilePlanToCadQueryResult(plan: ShapeCompilePlan | null): CompileLoweringResult<CadQueryShapePlan> {
  return lowerShapeCompilePlanToCadQueryResultAtPath(plan, '$');
}

export function lowerProfileCompilePlanToCadQueryPlan(plan: ProfileCompilePlan | null): CadQueryProfilePlan | null {
  const lowered = lowerProfileCompilePlanToCadQueryResult(plan);
  return lowered.ok ? lowered.value : null;
}

export function lowerShapeCompilePlanToCadQueryPlan(plan: ShapeCompilePlan | null): CadQueryShapePlan | null {
  const lowered = lowerShapeCompilePlanToCadQueryResult(plan);
  return lowered.ok ? lowered.value : null;
}

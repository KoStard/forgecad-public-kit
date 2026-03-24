/**
 * Face Transformation History Tracing
 *
 * Exposes the transformation chain that led to each surface.
 */

import { assertExhaustive, type ProfileCompilePlan, type ShapeCompilePlan, type ShapeCompileTransformStep } from '../compilePlan';
import type { FaceQueryRef, ShapeQueryOwner } from '../queryModel';
import type { FaceRef } from '../sketch/topology';

export interface TransformationStep {
  kind: string;
  description: string;
  details?: Record<string, unknown>;
}

export type TimelineEntryCategory = 'primitive' | 'sketch' | 'modifier' | 'boolean' | 'transform';

export interface TimelineEntry {
  kind: string;
  label: string;
  summary: string;
  category: TimelineEntryCategory;
}

export interface FaceTransformationHistory {
  faceName: string;
  origin: {
    operation: string;
    owner?: ShapeQueryOwner;
  };
  transformations: TransformationStep[];
  query?: FaceQueryRef;
  /** Ordered list of operations that built this shape, oldest first. */
  timeline: TimelineEntry[];
}

function describeTransformStep(step: ShapeCompileTransformStep): TransformationStep {
  switch (step.kind) {
    case 'translate':
      return {
        kind: 'translate',
        description: `Translate by [${step.x}, ${step.y}, ${step.z}]`,
        details: { x: step.x, y: step.y, z: step.z },
      };
    case 'rotate':
      return {
        kind: 'rotate',
        description: `Rotate by [${step.xDeg}°, ${step.yDeg}°, ${step.zDeg}°]`,
        details: { xDeg: step.xDeg, yDeg: step.yDeg, zDeg: step.zDeg },
      };
    case 'scale':
      return {
        kind: 'scale',
        description: `Scale by [${step.x}, ${step.y}, ${step.z}]`,
        details: { x: step.x, y: step.y, z: step.z },
      };
    case 'mirror':
      return {
        kind: 'mirror',
        description: `Mirror across plane with normal [${step.normalX}, ${step.normalY}, ${step.normalZ}]`,
        details: { normalX: step.normalX, normalY: step.normalY, normalZ: step.normalZ },
      };
    case 'rotateAround':
      return {
        kind: 'rotateAround',
        description: `Rotate ${step.degrees}° around axis [${step.axisX}, ${step.axisY}, ${step.axisZ}] at pivot [${step.pivotX}, ${step.pivotY}, ${step.pivotZ}]`,
        details: {
          axisX: step.axisX,
          axisY: step.axisY,
          axisZ: step.axisZ,
          degrees: step.degrees,
          pivotX: step.pivotX,
          pivotY: step.pivotY,
          pivotZ: step.pivotZ,
        },
      };
    case 'workplanePlacement':
      return {
        kind: 'workplanePlacement',
        description: `Place on workplane`,
        details: { matrix: step.matrix, placement: step.placement },
      };
  }
}

function tracePlanTransformations(plan: ShapeCompilePlan | null): TransformationStep[] {
  if (!plan) return [];

  const steps: TransformationStep[] = [];

  // Recursively trace through the plan structure
  switch (plan.kind) {
    case 'transform':
      steps.push(...tracePlanTransformations(plan.base));
      steps.push(...plan.steps.map(describeTransformStep));
      break;

    case 'queryOwner':
      steps.push(...tracePlanTransformations(plan.base));
      break;

    case 'boolean':
      // For booleans, trace the first operand (the base)
      if (plan.shapes.length > 0) {
        steps.push(...tracePlanTransformations(plan.shapes[0]));
      }
      break;

    case 'shell':
    case 'hole':
    case 'cut':
    case 'fillet':
    case 'chamfer':
    case 'filletEdges':
    case 'chamferEdges':
    case 'draft':
    case 'offsetSolid':
    case 'trimByPlane':
      steps.push(...tracePlanTransformations(plan.base));
      break;

    default:
      // Primitives and other operations don't have base transformations
      break;
  }

  return steps;
}

function findOriginOperation(plan: ShapeCompilePlan | null): { operation: string; owner?: ShapeQueryOwner } {
  if (!plan) return { operation: 'unknown' };

  switch (plan.kind) {
    case 'queryOwner':
      return { operation: plan.owner.operation, owner: plan.owner };

    case 'transform':
      return findOriginOperation(plan.base);

    case 'boolean':
      return { operation: `${plan.op} (${plan.shapes.length} operands)` };

    case 'shell':
    case 'hole':
    case 'cut':
    case 'fillet':
    case 'chamfer':
    case 'filletEdges':
    case 'chamferEdges':
    case 'draft':
    case 'offsetSolid':
    case 'trimByPlane':
      return findOriginOperation(plan.base);

    default:
      return { operation: plan.kind };
  }
}

function summarizeProfile(profile: ProfileCompilePlan): string {
  switch (profile.kind) {
    case 'rect':
      return `${profile.width}×${profile.height} rect`;
    case 'roundedRect':
      return `${profile.width}×${profile.height} rounded rect`;
    case 'circle':
      return `r=${profile.radius} circle`;
    case 'polygon':
      return `polygon (${profile.points.length} pts)`;
    case 'boolean':
      return `${profile.op} profile`;
    case 'offset':
      return 'offset profile';
    case 'project':
      return 'projected profile';
    default:
      assertExhaustive(profile);
  }
}

function collectTimelineEntries(plan: ShapeCompilePlan, entries: TimelineEntry[]): void {
  // Post-order traversal: recurse into base first → results in chronological (oldest-first) order.
  switch (plan.kind) {
    case 'queryOwner':
      // Transparent metadata wrapper — skip, just recurse.
      collectTimelineEntries(plan.base, entries);
      return;

    case 'transform':
      collectTimelineEntries(plan.base, entries);
      for (const step of plan.steps) {
        const d = describeTransformStep(step);
        const label =
          step.kind === 'translate'
            ? 'Move'
            : step.kind === 'rotate'
              ? 'Rotate'
              : step.kind === 'rotateAround'
                ? 'Rotate Around'
                : step.kind === 'scale'
                  ? 'Scale'
                  : step.kind === 'mirror'
                    ? 'Mirror'
                    : 'Place on Workplane';
        entries.push({ kind: step.kind, label, summary: d.description, category: 'transform' });
      }
      return;

    case 'shell':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'shell', label: 'Shell', summary: `t = ${plan.thickness}`, category: 'modifier' });
      return;

    case 'hole':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'hole', label: 'Hole', summary: `r = ${plan.hole.radius}`, category: 'modifier' });
      return;

    case 'cut':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'cut', label: 'Cut', summary: summarizeProfile(plan.profile), category: 'modifier' });
      return;

    case 'fillet':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'fillet', label: 'Fillet', summary: `r = ${plan.radius}`, category: 'modifier' });
      return;

    case 'chamfer':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'chamfer', label: 'Chamfer', summary: `size = ${plan.size}`, category: 'modifier' });
      return;

    case 'filletEdges':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'filletEdges', label: 'Fillet Edges', summary: `r = ${plan.radius}`, category: 'modifier' });
      return;

    case 'chamferEdges':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'chamferEdges', label: 'Chamfer Edges', summary: `size = ${plan.size}`, category: 'modifier' });
      return;

    case 'draft':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'draft', label: 'Draft', summary: `${plan.angleDeg}°`, category: 'modifier' });
      return;

    case 'offsetSolid':
      collectTimelineEntries(plan.base, entries);
      entries.push({ kind: 'offsetSolid', label: 'Offset Solid', summary: `thickness = ${plan.thickness}`, category: 'modifier' });
      return;

    case 'trimByPlane':
      collectTimelineEntries(plan.base, entries);
      entries.push({
        kind: 'trimByPlane',
        label: 'Trim by Plane',
        summary: `normal [${plan.normalX}, ${plan.normalY}, ${plan.normalZ}]`,
        category: 'modifier',
      });
      return;

    case 'boolean':
      // Follow the primary operand (base body) as the spine.
      if (plan.shapes.length > 0) collectTimelineEntries(plan.shapes[0], entries);
      entries.push({
        kind: 'boolean',
        label: plan.op === 'union' ? 'Union' : plan.op === 'difference' ? 'Difference' : 'Intersection',
        summary: `${plan.shapes.length} operand${plan.shapes.length !== 1 ? 's' : ''}`,
        category: 'boolean',
      });
      return;

    case 'extrude':
      entries.push({
        kind: 'extrude',
        label: 'Extrude',
        summary: `${summarizeProfile(plan.profile)}, h = ${plan.height}`,
        category: 'sketch',
      });
      return;

    case 'revolve':
      entries.push({ kind: 'revolve', label: 'Revolve', summary: `${plan.degrees}°`, category: 'sketch' });
      return;

    case 'loft':
      entries.push({ kind: 'loft', label: 'Loft', summary: `${plan.profiles.length} sections`, category: 'sketch' });
      return;

    case 'sweep':
      entries.push({ kind: 'sweep', label: 'Sweep', summary: summarizeProfile(plan.profile), category: 'sketch' });
      return;

    case 'box':
      entries.push({ kind: 'box', label: 'Box', summary: `${plan.x} × ${plan.y} × ${plan.z}`, category: 'primitive' });
      return;

    case 'cylinder':
      entries.push({
        kind: 'cylinder',
        label: 'Cylinder',
        summary:
          plan.radiusTop !== undefined && plan.radiusTop !== plan.radius
            ? `r = ${plan.radius}→${plan.radiusTop}, h = ${plan.height}`
            : `r = ${plan.radius}, h = ${plan.height}`,
        category: 'primitive',
      });
      return;

    case 'sphere':
      entries.push({ kind: 'sphere', label: 'Sphere', summary: `r = ${plan.radius}`, category: 'primitive' });
      return;

    case 'torus':
      entries.push({ kind: 'torus', label: 'Torus', summary: `R = ${plan.majorRadius}, r = ${plan.minorRadius}`, category: 'primitive' });
      return;

    case 'sheetMetal':
      entries.push({ kind: 'sheetMetal', label: 'Sheet Metal', summary: '', category: 'primitive' });
      return;

    default: {
      const k = (plan as { kind: string }).kind;
      entries.push({ kind: k, label: k, summary: '', category: 'primitive' });
      return;
    }
  }
}

export function buildOperationTimeline(plan: ShapeCompilePlan | null): TimelineEntry[] {
  if (!plan) return [];
  const entries: TimelineEntry[] = [];
  collectTimelineEntries(plan, entries);
  return entries;
}

export function traceFaceTransformationHistory(plan: ShapeCompilePlan | null, face: FaceRef): FaceTransformationHistory {
  const transformations = tracePlanTransformations(plan);
  const origin = findOriginOperation(plan);
  const timeline = buildOperationTimeline(plan);

  return {
    faceName: face.name,
    origin,
    transformations,
    query: face.query,
    timeline,
  };
}

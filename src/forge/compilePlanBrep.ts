import type { ProfileCompilePlan, ShapeCompilePlan } from './compilePlan';
import {
  cloneBrepProfilePlan,
  cloneBrepShapePlan,
  type BrepProfilePlan,
  type BrepShapePlan,
} from './brepPlan';

/**
 * Explicit lowering boundary from Forge's canonical compile plan into
 * the exact BREP export replay subset.
 *
 * Today this lowering is structural because the exact subset matches the
 * current compile-plan nodes 1:1. Keeping the boundary explicit matters:
 * the compile plan can grow beyond the exact BREP subset without forcing
 * callers to treat "Forge plan" and "BREP export plan" as the same concept.
 */
export function lowerProfileCompilePlanToBrepPlan(plan: ProfileCompilePlan | null): BrepProfilePlan | null {
  if (!plan) return null;
  return cloneBrepProfilePlan(plan as BrepProfilePlan);
}

export function lowerShapeCompilePlanToBrepPlan(plan: ShapeCompilePlan | null): BrepShapePlan | null {
  if (!plan) return null;
  return cloneBrepShapePlan(plan as BrepShapePlan);
}

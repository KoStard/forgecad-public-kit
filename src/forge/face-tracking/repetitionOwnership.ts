import type { ShapeCompilePlan } from '../compilePlan';
import { createOwnedShapeCompilePlan } from '../compilePlan';

export type PatternOwnershipKind = 'linear' | 'circular';

export function wrapRepeatedShapeCompilePlan(plan: ShapeCompilePlan, operation: string): ShapeCompilePlan {
  return createOwnedShapeCompilePlan(plan, operation);
}

export function buildPatternOwnershipOperation(kind: PatternOwnershipKind, index: number): string {
  return `pattern:${kind}:${index}`;
}

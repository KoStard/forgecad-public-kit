/**
 * Compatibility wrapper.
 *
 * The true exact compiler target is CadQuery/OCCT. Keep the BREP-named entry
 * points while the repo transitions internal callsites and tooling.
 */
export {
  lowerProfileCompilePlanToCadQueryPlan as lowerProfileCompilePlanToBrepPlan,
  lowerProfileCompilePlanToCadQueryResult as lowerProfileCompilePlanToBrepResult,
  lowerShapeCompilePlanToCadQueryPlan as lowerShapeCompilePlanToBrepPlan,
  lowerShapeCompilePlanToCadQueryResult as lowerShapeCompilePlanToBrepResult,
} from './compilePlanCadQuery';

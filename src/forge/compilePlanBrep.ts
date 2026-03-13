/**
 * Compatibility wrapper.
 *
 * The true exact compiler target is CadQuery/OCCT. Keep the BREP-named entry
 * points while the repo transitions internal callsites and tooling.
 */
export {
  lowerProfileCompilePlanToCadQueryResult as lowerProfileCompilePlanToBrepResult,
  lowerShapeCompilePlanToCadQueryResult as lowerShapeCompilePlanToBrepResult,
  lowerProfileCompilePlanToCadQueryPlan as lowerProfileCompilePlanToBrepPlan,
  lowerShapeCompilePlanToCadQueryPlan as lowerShapeCompilePlanToBrepPlan,
} from './compilePlanCadQuery';

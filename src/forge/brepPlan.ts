/**
 * Compatibility bridge.
 *
 * The compiler target is CadQuery/OCCT, not "BREP" as a first-class modeling
 * concept. Keep these exports for existing code while the repo transitions to
 * the CadQuery/OCCT naming.
 */
export type {
  CadQueryProfileTransformStep as BrepProfileTransformStep,
  CadQueryProfilePlan as BrepProfilePlan,
  CadQueryShapeTransformStep as BrepShapeTransformStep,
  CadQueryShapePlan as BrepShapePlan,
} from './cadqueryPlan';

export {
  cloneCadQueryProfilePlan as cloneBrepProfilePlan,
  cloneCadQueryShapePlan as cloneBrepShapePlan,
  appendCadQueryProfileTransform as appendBrepProfileTransform,
  appendCadQueryShapeTransform as appendBrepShapeTransform,
  appendCadQueryShapeTransforms as appendBrepShapeTransforms,
  buildCadQueryBooleanPlan as buildBrepBooleanPlan,
  buildCadQueryBooleanProfilePlan as buildBrepBooleanProfilePlan,
  buildCadQueryOffsetProfilePlan as buildBrepOffsetProfilePlan,
} from './cadqueryPlan';

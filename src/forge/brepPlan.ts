/**
 * Compatibility bridge.
 *
 * The compiler target is CadQuery/OCCT, not "BREP" as a first-class modeling
 * concept. Keep these exports for existing code while the repo transitions to
 * the CadQuery/OCCT naming.
 */
export type {
  CadQueryProfilePlan as BrepProfilePlan,
  CadQueryProfileTransformStep as BrepProfileTransformStep,
  CadQueryShapePlan as BrepShapePlan,
  CadQueryShapeTransformStep as BrepShapeTransformStep,
} from './cadqueryPlan';

export {
  appendCadQueryProfileTransform as appendBrepProfileTransform,
  appendCadQueryShapeTransform as appendBrepShapeTransform,
  appendCadQueryShapeTransforms as appendBrepShapeTransforms,
  buildCadQueryBooleanPlan as buildBrepBooleanPlan,
  buildCadQueryBooleanProfilePlan as buildBrepBooleanProfilePlan,
  buildCadQueryOffsetProfilePlan as buildBrepOffsetProfilePlan,
  cloneCadQueryProfilePlan as cloneBrepProfilePlan,
  cloneCadQueryShapePlan as cloneBrepShapePlan,
} from './cadqueryPlan';

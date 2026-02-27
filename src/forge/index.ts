/**
 * ForgeCAD — Browser Entry Point
 *
 * Re-exports everything from the headless module (the single source of truth)
 * plus the browser-specific initKernel for the App bootstrap.
 */

export { initKernel } from './kernel';
export {
  Shape, box, cylinder, sphere, union, difference, intersection, hull3d, levelSet, getWasm,
  Transform, composeChain,
  intersectWithPlane, projectToPlane,
  param, resetParams, getCollectedParams, setParamOverrides,
  Assembly, SolvedAssembly, assembly, bomToCsv,
  bom, resetBom, getCollectedBom,
  explodeView, resetExplodeView, getCollectedExplodeView,
  jointsView, resetJointsView, getCollectedJointsView,
  clampAnimationProgress, findJointAnimationClip, resolveJointAnimation,
  runScript,
  partLibrary,
  shapeToGeometry,
  buildScene,
  generateReportPdf,
  init,
} from './headless';
export type { PlaneSpec } from './headless';
export type { ParamDef } from './headless';
export type { Mat4, Vec3, TransformInput } from './headless';
export type {
  AssemblyPart,
  JointType,
  JointState,
  PartMetadata,
  PartOptions,
  JointOptions,
  BomRow,
  CollisionOptions,
  CollisionFinding,
  JointSweepFrame,
} from './headless';
export type { BomDef, BomOpts } from './headless';
export type { ExplodeViewDirection, ExplodeViewDirective, ExplodeViewOptions } from './headless';
export type {
  JointViewType,
  JointViewInput,
  JointViewDef,
  JointViewAnimationInput,
  JointViewAnimationDef,
  JointViewAnimationKeyframeInput,
  JointViewAnimationKeyframeDef,
  JointsViewOptions,
  CollectedJointsView,
} from './headless';
export type { RunResult, SceneObject, LogEntry } from './headless';
export type { ForgeGeometry } from './headless';
export type {
  ReportViewId,
  ReportObjectVisual,
  ReportOptions,
  ReportGenerationResult,
} from './headless';
export * from './sketch';

/**
 * ForgeCAD — Browser Entry Point
 *
 * Re-exports everything from the headless module (the single source of truth)
 * plus the browser-specific initKernel for the App bootstrap.
 */

export { initKernel, setActiveBackend, getActiveBackend, type ActiveBackend } from './kernel';
export {
  Shape, box, cylinder, sphere, union, difference, intersection, hull3d, getWasm,
  Transform, composeChain,
  intersectWithPlane, projectToPlane,
  param, resetParams, getCollectedParams, setParamOverrides,
  Assembly, ImportedAssembly, SolvedAssembly, assembly, bomToCsv,
  robotExport, resetRobotExport, getCollectedRobotExport,
  bom, resetBom, getCollectedBom,
  explodeView, resetExplodeView, getCollectedExplodeView,
  jointsView, resetJointsView, getCollectedJointsView, resolveJointViewValues,
  viewConfig, resetViewConfig, getCollectedViewConfig, DEFAULT_VIEW_CONFIG, DEFAULT_JOINT_OVERLAY_VIEW_CONFIG,
  clampAnimationProgress, findJointAnimationClip, resolveJointAnimation,
  runScript,
  FORGE_QUALITY_PRESETS,
  FORGE_QUALITY_PROFILES,
  resolveForgeQualityPreset,
  partLibrary,
  shapeToGeometry,
  buildScene,
  generateReportPdf,
  init,
  sheetMetal,
  SheetMetalPart,
} from './headless';
export type { PlaneSpec } from './headless';
export type { ParamDef } from './headless';
export type { Mat4, Vec3, TransformInput } from './headless';
export type {
  GeometryBackend,
  GeometryRepresentation,
  GeometryFidelity,
  GeometryTopology,
  GeometrySource,
  GeometryInfo,
} from './headless';
export type {
  SheetMetalOptions,
  SheetMetalFlangeOptions,
  SheetMetalCutoutOptions,
  SheetMetalEdge,
  SheetMetalModel,
  SheetMetalOutput,
  SheetMetalRegionName,
  SheetMetalPlanarRegionName,
} from './headless';
export type {
  AssemblyPart,
  JointType,
  JointState,
  AssemblyPartDef,
  AssemblyJointDef,
  AssemblyJointCouplingDef,
  AssemblyDefinition,
  PartMetadata,
  PartOptions,
  JointOptions,
  JointCouplingTerm,
  JointCouplingOptions,
  GearRatioLike,
  GearCouplingOptions,
  BomRow,
  CollisionOptions,
  CollisionFinding,
  JointSweepFrame,
  MergeIntoOptions,
  RobotLinkExportOptions,
  RobotJointExportOptions,
  RobotDiffDrivePluginOptions,
  RobotJointStatePublisherOptions,
  RobotPose6,
  RobotWorldKeyboardTeleopOptions,
  RobotWorldOptions,
  RobotExportOptions,
  CollectedRobotExport,
} from './headless';
export type { BomDef, BomOpts } from './headless';
export type { CutPlaneDef, CutPlaneExcludeInput, CutPlaneOptions } from './headless';
export type { ExplodeViewDirection, ExplodeViewDirective, ExplodeViewOptions } from './headless';
export type {
  ViewConfig,
  ViewConfigOptions,
  JointOverlayViewConfig,
  JointOverlayViewConfigOptions,
} from './headless';
export type {
  JointViewType,
  JointViewInput,
  JointViewDef,
  JointViewCouplingInput,
  JointViewCouplingDef,
  JointViewCouplingTermInput,
  JointViewCouplingTermDef,
  JointViewAnimationInput,
  JointViewAnimationDef,
  JointViewAnimationKeyframeInput,
  JointViewAnimationKeyframeDef,
  JointsViewOptions,
  CollectedJointsView,
} from './headless';
export type { RunResult, SceneObject, LogEntry } from './headless';
export type { VerificationResult, VerificationStatus } from './headless';
export type { ForgeGeometry } from './headless';
export type { ForgeQualityPreset, ForgeQualityProfile } from './headless';
export type { GroupChild, NamedGroupChild, GroupInput } from './headless';
export type {
  ReportViewId,
  ReportObjectVisual,
  ReportOptions,
  ReportGenerationResult,
} from './headless';
export * from './sketch';

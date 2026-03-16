/**
 * ForgeCAD Headless Entry Point — Single Source of Truth
 *
 * This module re-exports the complete forge API and works in both
 * Node.js (CLI tools) and browser contexts.
 *
 * Browser: imports via src/forge/index.ts which re-exports from here.
 * CLI:     imports directly from this file.
 *
 * Usage:
 *   import { init, runScript, Sketch, Shape, ... } from '../src/forge/headless';
 *   await init();
 *   const result = runScript(code, fileName, allFiles);
 *   // result.objects contains Shape/Sketch results
 */

import { initKernel } from './kernel';

// Re-export everything from the public API
export {
  Shape,
  box,
  cylinder,
  sphere,
  union,
  difference,
  intersection,
  hull3d,
  levelSet,
  getWasm,
  isAnchor3D,
  resolveAnchor3D,
  getShapePlacementReferences,
  setShapePlacementReferences,
} from './kernel';
export type {
  Anchor3D,
  GeometryBackend,
  GeometryRepresentation,
  GeometryFidelity,
  GeometryTopology,
  GeometrySource,
  GeometryInfo,
  PlacementReferenceInput,
  PlacementReferenceKind,
  PlacementReferences,
  FaceTransformationHistory,
  TransformationStep,
} from './kernel';
export { Transform, composeChain } from './transform';
export type { Mat4, Vec3, TransformInput, RotateAroundToMode, RotateAroundToOptions } from './transform';
export { intersectWithPlane, projectToPlane } from './section';
export type { PlaneSpec } from './section';
export * from './holeCut';
export * from './sheetMetal';
export * from './sketch';
export { param, boolParam, resetParams, getCollectedParams, setParamOverrides } from './params';
export type { ParamDef } from './params';
export { joint } from './joint';
export type { RevoluteJointOpts } from './joint';
export { Assembly, ImportedAssembly, SolvedAssembly, assembly, bomToCsv } from './assembly';
export type {
  AssemblyPart,
  AssemblyPartDef,
  AssemblyJointDef,
  AssemblyJointCouplingDef,
  AssemblyDefinition,
  JointType,
  JointState,
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
} from './assembly';
export { robotExport, resetRobotExport, getCollectedRobotExport } from './robotExport';
export type {
  RobotLinkExportOptions,
  RobotJointExportOptions,
  RobotDiffDrivePluginOptions,
  RobotJointStatePublisherOptions,
  RobotPose6,
  RobotWorldKeyboardTeleopOptions,
  RobotWorldOptions,
  RobotExportOptions,
  CollectedRobotExport,
} from './robotExport';
export { runScript } from './runner';
export type { RunResult, SceneObject, LogEntry, RunScriptOptions } from './runner';
export type { VerificationResult, VerificationStatus } from './verification';
export {
  FORGE_QUALITY_PRESETS,
  FORGE_QUALITY_PROFILES,
  resolveForgeQualityPreset,
} from './quality';
export type { ForgeQualityPreset, ForgeQualityProfile } from './quality';
export { partLibrary } from './library';
export { shapeToGeometry } from './meshToGeometry';
export { buildScene, CAD_MATERIAL_PROPS, EDGE_MATERIAL_PROPS } from './sceneBuilder';
export type { ForgeGeometry } from './meshToGeometry';
export { ShapeGroup, group } from './group';
export type { GroupChild, NamedGroupChild, GroupInput } from './group';
export { cutPlane, resetCutPlanes, getCollectedCutPlanes } from './cutPlane';
export type { CutPlaneDef, CutPlaneExcludeInput, CutPlaneOptions } from './cutPlane';
export { explodeView, resetExplodeView, getCollectedExplodeView } from './explodeView';
export type { ExplodeViewDirection, ExplodeViewDirective, ExplodeViewOptions } from './explodeView';
export { jointsView, resetJointsView, getCollectedJointsView, resolveJointViewValues } from './jointsView';
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
} from './jointsView';
export {
  viewConfig,
  resetViewConfig,
  getCollectedViewConfig,
  DEFAULT_VIEW_CONFIG,
  DEFAULT_JOINT_OVERLAY_VIEW_CONFIG,
} from './viewConfig';
export type {
  ViewConfig,
  ViewConfigOptions,
  JointOverlayViewConfig,
  JointOverlayViewConfigOptions,
} from './viewConfig';
export { clampAnimationProgress, findJointAnimationClip, resolveJointAnimation } from './jointAnimation';
export { bom, resetBom, getCollectedBom } from './bom';
export type { BomDef, BomOpts } from './bom';
export { generateReportPdf } from './report';
export type {
  ReportViewId,
  ReportObjectVisual,
  ReportOptions,
  ReportGenerationResult,
} from './report';

/**
 * Initialize the geometry kernel. Must be called once before using any forge API.
 * Safe to call multiple times (idempotent).
 */
export async function init() {
  await initKernel();
}

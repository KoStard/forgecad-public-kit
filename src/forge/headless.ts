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
import { initSolverWasm } from './sketch/constraints/solver-wasm';

export type {
  AssemblyDefinition,
  AssemblyJointCouplingDef,
  AssemblyJointDef,
  AssemblyPart,
  AssemblyPartDef,
  BomRow,
  CollisionFinding,
  CollisionOptions,
  GearCouplingOptions,
  GearRatioLike,
  JointCouplingOptions,
  JointCouplingTerm,
  JointOptions,
  JointState,
  JointSweepFrame,
  JointType,
  MergeIntoOptions,
  PartMetadata,
  PartOptions,
} from './assembly/assembly';
export { Assembly, assembly, bomToCsv, ImportedAssembly, SolvedAssembly } from './assembly/assembly';
export type { BomDef, BomOpts } from './bom';
export { bom, getCollectedBom, resetBom } from './bom';
export type { CutPlaneDef, CutPlaneExcludeInput, CutPlaneOptions } from './cutPlane';
export { cutPlane, getCollectedCutPlanes, resetCutPlanes } from './cutPlane';
export type { ExplodeViewDirection, ExplodeViewDirective, ExplodeViewOptions } from './assembly/explodeView';
export { explodeView, getCollectedExplodeView, resetExplodeView } from './assembly/explodeView';
export type { MeshExportObject, ThreeMfExportOptions } from './exportMesh';
export { build3mfBuffer, buildBinaryStl } from './exportMesh';
export type { PreheatOptions, PrinterProfile, ToolpathData, ToolpathSegment } from './gcode';
export { GCodeBuilder, gcode } from './gcode';
export type { GroupChild, GroupInput, NamedGroupChild } from './group';
export { group, ShapeGroup } from './group';
export * from './holeCut';
export type { RevoluteJointOpts } from './assembly/joint';
export { joint } from './assembly/joint';
export { clampAnimationProgress, findJointAnimationClip, resolveJointAnimation } from './assembly/jointAnimation';
export type {
  CollectedJointsView,
  JointsViewOptions,
  JointViewAnimationDef,
  JointViewAnimationInput,
  JointViewAnimationKeyframeDef,
  JointViewAnimationKeyframeInput,
  JointViewCouplingDef,
  JointViewCouplingInput,
  JointViewCouplingTermDef,
  JointViewCouplingTermInput,
  JointViewDef,
  JointViewInput,
  JointViewType,
} from './assembly/jointsView';
export { getCollectedJointsView, jointsView, resetJointsView, resolveJointViewValues } from './assembly/jointsView';
export type {
  Anchor3D,
  FaceTransformationHistory,
  GeometryBackend,
  GeometryFidelity,
  GeometryInfo,
  GeometryRepresentation,
  GeometrySource,
  GeometryTopology,
  PlacementReferenceInput,
  PlacementReferenceKind,
  PlacementReferences,
  ShapeMaterialProps,
  TransformationStep,
} from './kernel';
// Re-export everything from the public API
export {
  box,
  cylinder,
  difference,
  getShapePlacementReferences,
  getWasm,
  intersection,
  isAnchor3D,
  resolveAnchor3D,
  Shape,
  setShapePlacementReferences,
  sphere,
  torus,
  union,
} from './kernel';
export { partLibrary } from './library';
export type { ForgeGeometry } from './mesh/meshToGeometry';
export { shapeToGeometry } from './mesh/meshToGeometry';
export type { ParamDef } from './params';
export { boolParam, getCollectedParams, param, resetParams, setParamOverrides } from './params';
export type { ForgeQualityPreset, ForgeQualityProfile } from './quality';
export {
  FORGE_QUALITY_PRESETS,
  FORGE_QUALITY_PROFILES,
  resolveForgeQualityPreset,
} from './quality';
export type {
  ReportGenerationResult,
  ReportObjectVisual,
  ReportOptions,
  ReportViewId,
} from './report';
export { generateReportPdf } from './report';
export type {
  CollectedRobotExport,
  RobotDiffDrivePluginOptions,
  RobotExportOptions,
  RobotJointExportOptions,
  RobotJointStatePublisherOptions,
  RobotLinkExportOptions,
  RobotPose6,
  RobotWorldKeyboardTeleopOptions,
  RobotWorldOptions,
} from './robotExport';
export { getCollectedRobotExport, resetRobotExport, robotExport } from './robotExport';
export type { LogEntry, MeshImportOptions, RunResult, RunScriptOptions, SceneObject } from './runner';
export { runScript } from './runner';
export type {
  SceneBackgroundGradient,
  SceneBloomConfig,
  SceneCameraConfig,
  SceneCaptureConfig,
  SceneConfig,
  SceneEnvironmentConfig,
  SceneFogConfig,
  SceneGrainConfig,
  SceneGroundConfig,
  SceneLightConfig,
  SceneLightType,
  SceneOptions,
  ScenePostProcessingConfig,
  SceneVignetteConfig,
} from './scene';
export { getCollectedScene, resetScene, scene } from './scene';
export { buildScene, CAD_MATERIAL_PROPS, EDGE_MATERIAL_PROPS } from './scene/sceneBuilder';
export type { PlaneSpec } from './section';
export { intersectWithPlane, projectToPlane } from './section';
export * from './sheetMetal';
export type { SheetStockDef, SheetStockOpts } from './sheetStock';
export { getCollectedSheetStock, resetSheetStock, sheetStock } from './sheetStock';
export * from './sketch';
export type { Mat4, RotateAroundToMode, RotateAroundToOptions, TransformInput, Vec3 } from './transform';
export { composeChain, Transform } from './transform';
export type { VerificationResult, VerificationStatus } from './verification';
export type {
  JointOverlayViewConfig,
  JointOverlayViewConfigOptions,
  ViewConfig,
  ViewConfigOptions,
} from './scene/viewConfig';
export {
  DEFAULT_JOINT_OVERLAY_VIEW_CONFIG,
  DEFAULT_VIEW_CONFIG,
  getCollectedViewConfig,
  resetViewConfig,
  viewConfig,
} from './scene/viewConfig';

/**
 * Initialize the geometry kernel. Must be called once before using any forge API.
 * Safe to call multiple times (idempotent).
 */
export async function init() {
  await initSolverWasm();
  await initKernel();
}

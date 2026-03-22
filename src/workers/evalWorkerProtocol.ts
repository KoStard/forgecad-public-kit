import type {
  ForgeQualityPreset,
  LogEntry,
  ParamDef,
  VerificationResult,
} from '@forge/index';
import type { DimensionDef } from '../forge/sketch/dimensions';
import type { HighlightDef } from '../forge/sketch/highlights';
import type { BomDef } from '../forge/bom';
import type { CutPlaneDef } from '../forge/cutPlane';
import type { ExplodeViewOptions } from '../forge/explodeView';
import type { CollectedJointsView } from '../forge/jointsView';
import type { ViewConfig } from '../forge/viewConfig';
import type { CollectedRobotExport } from '../forge/robotExport';
import type { FaceRef } from '../forge/sketch/topology';
import type { FaceTransformationHistory } from '../forge/faceHistory';
import type { GeometryInfo } from '../forge/kernel';
import type { ShapeCompilePlan } from '../forge/compilePlan';
import type { SketchConstraintMeta, ConstraintDefinition } from '../forge/sketch/constraints';
import type { SolverWasmRunDebugSnapshot } from '../forge/sketch/constraints/solver-wasm';

/** Wire format for a serialized Shape — all WASM data extracted into transferable TypedArrays. */
export interface SerializedShapeData {
  meshNumProp: number;
  meshTriVerts: Uint32Array;
  meshVertProperties: Float32Array;
  meshMergeFromVert: Uint32Array;
  meshMergeToVert: Uint32Array;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  numTriangles: number;
  faceNames: string[];
  faces: Record<string, FaceRef>;
  faceHistories: Record<string, FaceTransformationHistory>;
  colorHex: string | null;
  geometryInfo: GeometryInfo | null;
  /** Pre-computed Three.js-ready arrays — built in the worker to keep main thread free. */
  geometryPositions: Float32Array;
  geometryNormals: Float32Array;
  geometryEdgePositions: Float32Array;
}

/** Wire format for a serialized Sketch — polygon data extracted into plain arrays. */
export interface SerializedSketchData {
  /** toPolygons() result — Vec2 = [number, number] */
  polygons: [number, number][][];
  bounds: { min: [number, number]; max: [number, number] };
  /** getSketchWorldMatrix() — 16-element Mat4, or null for flat sketches */
  worldMatrix: number[] | null;
  colorHex: string | undefined;
  /** Populated for ConstraintSketch */
  constraintMeta?: SketchConstraintMeta;
  /** Populated for ConstraintSketch — allows updateSketchConstraint on main thread */
  constraintDefinition?: ConstraintDefinition;
}

/** Serialized SceneObject — shape and sketch replaced with wire-safe equivalents. */
export interface SerializedSceneObject {
  id: string;
  name: string;
  shapeData: SerializedShapeData | null;
  sketchData: SerializedSketchData | null;
  compilePlan?: ShapeCompilePlan | null;
  color?: string;
  geometryInfo?: GeometryInfo | null;
  sketchMeta?: SketchConstraintMeta;
  groupName?: string;
  treePath?: string[];
}

/** Full serialized RunResult — no WASM objects, safe to postMessage. */
export interface SerializedRunResult {
  objects: SerializedSceneObject[];
  params: ParamDef[];
  dimensions: DimensionDef[];
  highlights: HighlightDef[];
  bom: BomDef[];
  cutPlanes: CutPlaneDef[];
  explodeView: ExplodeViewOptions | null;
  jointsView: CollectedJointsView | null;
  viewConfig: ViewConfig | null;
  robotExport: CollectedRobotExport | null;
  quality: ForgeQualityPreset;
  error: string | null;
  timeMs: number;
  logs: LogEntry[];
  verifications: VerificationResult[];
  solverDebug?: SolverWasmRunDebugSnapshot | null;
}

// ---- Message types ----

export type ActiveBackend = 'occt' | 'manifold';

export type ExactExportFormat = 'step' | 'brep';

export type EvalPhase = 'kernel-init' | 'evaluating' | 'serializing' | 'export-evaluating' | 'export-writing';

export interface EvalWorkerRunPayload {
  seq: number;
  code: string;
  file: string;
  files: Record<string, string>;
  quality: ForgeQualityPreset;
  paramOverrides: Record<string, number>;
  isNotebook: boolean;
  activeBackend: ActiveBackend;
}

export interface EvalWorkerRunRequest {
  type: 'run';
  payload: EvalWorkerRunPayload;
}

export interface EvalWorkerRunSuccess {
  type: 'run-success';
  payload: {
    seq: number;
    result: SerializedRunResult;
  };
}

export interface EvalWorkerRunError {
  type: 'run-error';
  payload: {
    seq: number;
    message: string;
    logs: LogEntry[];
  };
}

/** Request face names + histories for a specific object (on-demand, for face info panel). */
export interface EvalWorkerFaceInfoRequest {
  type: 'face-info';
  payload: {
    reqId: number;
    objectId: string;
  };
}

export interface EvalWorkerFaceInfoResult {
  faceNames: string[];
  faces: Record<string, FaceRef>;
  faceHistories: Record<string, FaceTransformationHistory>;
}

export interface EvalWorkerFaceInfoSuccess {
  type: 'face-info-success';
  payload: { reqId: number; result: EvalWorkerFaceInfoResult };
}

export interface EvalWorkerFaceInfoError {
  type: 'face-info-error';
  payload: { reqId: number; message: string };
}

export interface EvalWorkerProgressMessage {
  type: 'progress';
  payload: {
    seq: number;
    phase: EvalPhase;
  };
}

/** Request exact-geometry export (STEP/BREP) using live OCCT shapes in the worker. */
export interface EvalWorkerExportExactRequest {
  type: 'export-exact';
  payload: {
    reqId: number;
    format: ExactExportFormat;
    /** Script context so the worker can re-evaluate if lastRunResult is stale/missing. */
    code: string;
    file: string;
    files: Record<string, string>;
    quality: ForgeQualityPreset;
    paramOverrides: Record<string, number>;
    isNotebook: boolean;
  };
}

export interface EvalWorkerExportExactSuccess {
  type: 'export-exact-success';
  payload: { reqId: number; data: ArrayBuffer; format: ExactExportFormat };
}

export interface EvalWorkerExportExactError {
  type: 'export-exact-error';
  payload: { reqId: number; message: string };
}

export type EvalWorkerRequest = EvalWorkerRunRequest | EvalWorkerFaceInfoRequest | EvalWorkerExportExactRequest;
export type EvalWorkerResponse = EvalWorkerRunSuccess | EvalWorkerRunError | EvalWorkerProgressMessage | EvalWorkerFaceInfoSuccess | EvalWorkerFaceInfoError | EvalWorkerExportExactSuccess | EvalWorkerExportExactError;

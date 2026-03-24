/**
 * Runner public types: SceneObject, RunResult, RunScriptOptions, etc.
 */

import type { ToolpathData } from '../export/gcode';
import type { ExplodeViewOptions } from '../assembly/explodeView';
import type { CollectedJointsView } from '../assembly/jointsView';
import type { BomDef } from '../bom';
import type { CutPlaneDef } from '../cutPlane';
import type { ForgeQualityPreset } from '../quality';
import type { CollectedRobotExport } from '../export/robotExport';
import type { SceneConfig } from '../scene';
import type { SheetStockDef } from '../export/sheetStock';
import type { ViewConfig } from '../scene/viewConfig';
import type {
  DebugHighlight3D,
  DimensionDef,
  HighlightDef,
  Sketch,
  SketchConstraintMeta,
} from '../sketch';
import type { GeometryInfo, Shape, ShapeMaterialProps } from '../kernel';
import type { ParamDef } from '../params';
import type { VerificationResult } from '../verification';
import type { SolverWasmRunDebugSnapshot } from '../sketch/constraints/solver-wasm';

export interface SceneObject {
  id: string;
  name: string;
  shape: Shape | null;
  sketch: Sketch | null;
  toolpath?: ToolpathData | null;
  color?: string;
  /** Per-object material properties (metalness, roughness, emissive, etc.) */
  materialProps?: ShapeMaterialProps;
  geometryInfo?: GeometryInfo | null;
  sketchMeta?: SketchConstraintMeta;
  /** If this object belongs to a named group (assembly), the group name */
  groupName?: string;
  /** Full object-tree path including ancestor groups and this object's local label. */
  treePath?: string[];
}

export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  args: string[];
  timestamp: number;
}

export interface RunResult {
  shape: Shape | null;
  sketch: Sketch | null;
  objects: SceneObject[];
  params: ParamDef[];
  dimensions: DimensionDef[];
  highlights: HighlightDef[];
  debugHighlights3D: DebugHighlight3D[];
  bom: BomDef[];
  sheetStock: SheetStockDef[];
  cutPlanes: CutPlaneDef[];
  explodeView: ExplodeViewOptions | null;
  jointsView: CollectedJointsView | null;
  viewConfig: ViewConfig | null;
  sceneConfig: SceneConfig | null;
  robotExport: CollectedRobotExport | null;
  quality: ForgeQualityPreset;
  error: string | null;
  timeMs: number;
  logs: LogEntry[];
  verifications: VerificationResult[];
  solverDebug?: SolverWasmRunDebugSnapshot | null;
}

export interface MeshImportOptions {
  /** Uniform scale factor applied to the imported mesh (e.g. 25.4 for inch→mm). */
  scale?: number;
  /** Center the mesh at the origin based on its bounding box. */
  center?: boolean;
}

export interface RunScriptOptions {
  /** Emit structured import trace logs into result.logs (CLI-friendly debugging). */
  debugImports?: boolean;
  /** Geometry quality profile for this execution. */
  quality?: ForgeQualityPreset;
  /** Allow successful runs that intentionally do not return renderable objects. */
  allowEmptyResult?: boolean;
  /**
   * Read a binary file by resolved path.  Required for importMesh() support.
   * Browser: fetches via /api endpoint.  CLI: reads from disk.
   */
  readBinaryFile?: (resolvedPath: string) => ArrayBuffer;
}

export interface ImportScope {
  namePrefix?: string;
  localOverrides?: Record<string, number>;
}

export interface SourceMapSegment {
  generatedColumn: number;
  sourceLine: number;
  sourceColumn: number;
}

export interface CompiledScript {
  source: string;
  code: string;
  sourceMapSegments: SourceMapSegment[][];
}

export interface ModuleCacheEntry {
  exports: unknown;
  loaded: boolean;
}

export interface ResolvedImportSource {
  source: string;
  lookupKey: string;
  resolvedPath: string;
}

export interface RunnerExecutionOptions {
  debugImports: boolean;
  fileIndex: Map<string, string>;
  compiledFiles: Map<string, CompiledScript>;
  moduleCache: Map<string, ModuleCacheEntry>;
  readBinaryFile?: (resolvedPath: string) => ArrayBuffer;
}

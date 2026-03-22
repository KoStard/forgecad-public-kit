import { create } from 'zustand';
import {
  type ParamDef,
  type RunResult,
  type SceneObject,
  type LogEntry,
  type ForgeQualityPreset,
  resolveForgeQualityPreset,
  isConstraintSketch,
  updateConstraintValue,
} from '@forge/index';
import type { ShapeCompilePlan } from '../forge/compilePlan';
import { setParamOverrides } from '@forge/params';
import projectFiles from 'virtual:forge-project';
import { fileSystem } from '../fs';
import { isNotebookFile, serializeNotebook, createNotebook } from '../notebook/model';
import { evalWorkerClient } from '../workers/evalWorkerClient';
import { deserializeRunResult } from '../forge/deserializeRunResult';
import type { SerializedRunResult, SerializedSceneObject, SerializedShapeData } from '../workers/evalWorkerProtocol';
import { publishSolverWasmRunDebug } from '../forge/sketch/constraints/solver-wasm';
import { type ThemeName, applyTheme } from '../theme';
import type { LengthUnit } from '@forge/units';
import { clampAnimationSpeed } from '../animationSpeed';
import type { ViewportCameraState } from '../capture/cameraState';
import { decodeSharedHash, getGistId } from '../share';

// ---------------------------------------------------------------------------
// Run result LRU cache — avoids re-evaluating a file you just switched away from.
// Persisted to sessionStorage so it survives page refreshes within the same tab.
// ---------------------------------------------------------------------------
const RUN_RESULT_CACHE_MAX = 8;
const SESSION_STORAGE_KEY = 'forgecad-run-cache';
const CACHE_VERSION = 1;
/** Don't persist if serialized cache exceeds this size (sessionStorage limit ~5 MB). */
const MAX_PERSIST_BYTES = 4 * 1024 * 1024;

interface CacheEntry {
  code: string;
  files: Record<string, string>;
  paramOverrides: Record<string, number>;
  quality: string;
  backend: string;
  result: RunResult;
  /** Kept around so we can persist to sessionStorage without re-serializing shapes. */
  serialized: SerializedRunResult;
}

/** JSON-safe representation of a CacheEntry (TypedArrays → plain number[]). */
interface PersistedCacheEntry {
  code: string;
  files: Record<string, string>;
  paramOverrides: Record<string, number>;
  quality: string;
  backend: string;
  serialized: unknown; // SerializedRunResult with TypedArrays replaced by number[]
}

/** Module-level LRU map: filePath → entry. JS Map preserves insertion order. */
const runResultCache = new Map<string, CacheEntry>();

// -- TypedArray ↔ plain array helpers for JSON serialization -----------------

function typedArrayToArray(ta: Uint32Array | Float32Array): number[] {
  return Array.from(ta);
}

function shapeDataToJson(sd: SerializedShapeData): Record<string, unknown> {
  return {
    ...sd,
    meshTriVerts: typedArrayToArray(sd.meshTriVerts),
    meshVertProperties: typedArrayToArray(sd.meshVertProperties),
    meshMergeFromVert: typedArrayToArray(sd.meshMergeFromVert),
    meshMergeToVert: typedArrayToArray(sd.meshMergeToVert),
    geometryPositions: typedArrayToArray(sd.geometryPositions),
    geometryNormals: typedArrayToArray(sd.geometryNormals),
    geometryEdgePositions: typedArrayToArray(sd.geometryEdgePositions),
  };
}

function jsonToShapeData(raw: Record<string, any>): SerializedShapeData {
  return {
    ...raw,
    meshTriVerts: new Uint32Array(raw.meshTriVerts),
    meshVertProperties: new Float32Array(raw.meshVertProperties),
    meshMergeFromVert: new Uint32Array(raw.meshMergeFromVert),
    meshMergeToVert: new Uint32Array(raw.meshMergeToVert),
    geometryPositions: new Float32Array(raw.geometryPositions),
    geometryNormals: new Float32Array(raw.geometryNormals),
    geometryEdgePositions: new Float32Array(raw.geometryEdgePositions),
  } as SerializedShapeData;
}

function serializedResultToJson(sr: SerializedRunResult): unknown {
  return {
    ...sr,
    objects: sr.objects.map((obj) => ({
      ...obj,
      shapeData: obj.shapeData ? shapeDataToJson(obj.shapeData) : null,
    })),
  };
}

function jsonToSerializedResult(raw: any): SerializedRunResult {
  return {
    ...raw,
    objects: (raw.objects as any[]).map((obj: any) => ({
      ...obj,
      shapeData: obj.shapeData ? jsonToShapeData(obj.shapeData) : null,
    })),
  } as SerializedRunResult;
}

// -- sessionStorage persistence ----------------------------------------------

function persistCache(): void {
  try {
    const entries: Record<string, PersistedCacheEntry> = {};
    for (const [key, entry] of runResultCache) {
      entries[key] = {
        code: entry.code,
        files: entry.files,
        paramOverrides: entry.paramOverrides,
        quality: entry.quality,
        backend: entry.backend,
        serialized: serializedResultToJson(entry.serialized),
      };
    }
    const json = JSON.stringify({ v: CACHE_VERSION, entries });
    if (json.length > MAX_PERSIST_BYTES) {
      // Too large — clear any stale persisted data and bail
      try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
      return;
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, json);
  } catch {
    // sessionStorage may be unavailable (private browsing) or full — ignore
  }
}

function rehydrateCache(): void {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== CACHE_VERSION || !parsed.entries) return;
    for (const [key, pe] of Object.entries<any>(parsed.entries)) {
      const serialized = jsonToSerializedResult(pe.serialized);
      const result = deserializeRunResult(serialized);
      runResultCache.set(key, {
        code: pe.code,
        files: pe.files,
        paramOverrides: pe.paramOverrides,
        quality: pe.quality,
        backend: pe.backend,
        result,
        serialized,
      });
    }
  } catch {
    // Corrupt or incompatible data — start fresh
    try { sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* ignore */ }
  }
}

// Rehydrate on module load
rehydrateCache();

// -- Cache lookup / store ----------------------------------------------------

function lookupCache(
  filePath: string,
  code: string,
  files: Record<string, string>,
  paramOverrides: Record<string, number>,
  quality: string,
  backend: string,
): RunResult | null {
  const key = `${filePath}::${backend}`;
  const entry = runResultCache.get(key);
  if (!entry) return null;
  if (
    entry.code !== code ||
    entry.quality !== quality ||
    JSON.stringify(entry.paramOverrides) !== JSON.stringify(paramOverrides) ||
    JSON.stringify(entry.files) !== JSON.stringify(files)
  ) return null;
  return entry.result;
}

function storeCache(
  filePath: string,
  code: string,
  files: Record<string, string>,
  paramOverrides: Record<string, number>,
  quality: string,
  backend: string,
  result: RunResult,
  serialized: SerializedRunResult,
): void {
  const key = `${filePath}::${backend}`;
  runResultCache.delete(key); // re-insert to mark as recently used
  runResultCache.set(key, { code, files, paramOverrides, quality, backend, result, serialized });
  if (runResultCache.size > RUN_RESULT_CACHE_MAX) {
    runResultCache.delete(runResultCache.keys().next().value!);
  }
  persistCache();
}

// ---------------------------------------------------------------------------

const EMPTY_FILE: Record<string, string> = {
  'untitled.forge.js': '// New part\n\nreturn box(50, 30, 10);\n',
};

const INITIAL_FILES = projectFiles && Object.keys(projectFiles).length > 0
  ? projectFiles as Record<string, string>
  : EMPTY_FILE;

const collectInitialFolders = (files: Record<string, string>): string[] => {
  const folders = new Set<string>();
  Object.keys(files).forEach((name) => {
    const parts = name.replace(/\\/g, '/').split('/');
    if (parts.length <= 1) return;
    let current = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      folders.add(current);
    }
  });
  return Array.from(folders).sort();
};

const INITIAL_FOLDERS = collectInitialFolders(INITIAL_FILES);
const isModelFile = (name: string): boolean => (
  name.endsWith('.forge.js')
  || name.endsWith('.sketch.js') // legacy compat
);
const isRunnableFile = isModelFile;
const findPreferredEntryFile = (names: string[]): string | null => (
  names.find((n) => isModelFile(n))
  || names.find((n) => isNotebookFile(n))
  || null
);

const getActiveFileFromHash = (): string | null => {
  const hash = window.location.hash.slice(1); // Remove the #
  if (hash.startsWith('code/')) return null; // handled by shared model logic
  return hash || null;
};

/** If the URL contains a shared model (`#code/...`), decode it once at startup. */
const sharedModel = decodeSharedHash(window.location.hash);
if (sharedModel) {
  INITIAL_FILES[sharedModel.filename] = sharedModel.code;
}

/** Exported so applyServerSnapshot can inject the shared model into the file set. */
export { sharedModel };

const initialActive = (() => {
  if (sharedModel) return sharedModel.filename;
  const hashFile = getActiveFileFromHash();
  if (hashFile && INITIAL_FILES[hashFile]) {
    return hashFile;
  }
  const names = Object.keys(INITIAL_FILES);
  return findPreferredEntryFile(names)
    || names.find((n) => n.endsWith('.js'))
    || names.find((n) => isNotebookFile(n))
    || names[0];
})();

const INITIAL_SAVED = projectFiles && Object.keys(projectFiles).length > 0
  ? projectFiles as Record<string, string>
  : EMPTY_FILE;

export interface ProjectFile {
  name: string;
  code: string;
}

const normalizePath = (value: string): string => value
  .replace(/\\/g, '/')
  .replace(/\/+/g, '/')
  .replace(/^\/+|\/+$/g, '');

const getParentPath = (value: string): string => {
  const normalized = normalizePath(value);
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '' : normalized.slice(0, idx);
};

const sharedPathDepth = (a: string, b: string): number => {
  const aParts = normalizePath(a).split('/').filter(Boolean);
  const bParts = normalizePath(b).split('/').filter(Boolean);
  const length = Math.min(aParts.length, bParts.length);
  let depth = 0;
  while (depth < length && aParts[depth] === bParts[depth]) depth += 1;
  return depth;
};

const resolvePreviewFile = (activeFile: string, files: Record<string, string>): string | null => {
  if (isRunnableFile(activeFile) || isNotebookFile(activeFile)) return activeFile;

  const candidates = Object.keys(files).filter((name) => isRunnableFile(name) || isNotebookFile(name));
  if (candidates.length === 0) return null;

  const activeDir = getParentPath(activeFile);
  let best = candidates[0];
  let bestDepth = -1;
  for (const candidate of candidates) {
    const depth = sharedPathDepth(activeDir, getParentPath(candidate));
    const bestIsNotebook = isNotebookFile(best);
    const candidateIsNotebook = isNotebookFile(candidate);
    if (
      depth > bestDepth
      || (depth === bestDepth && bestIsNotebook && !candidateIsNotebook)
      || (depth === bestDepth && bestIsNotebook === candidateIsNotebook && candidate < best)
    ) {
      best = candidate;
      bestDepth = depth;
    }
  }
  return best;
};

const collectParentPaths = (value: string): string[] => {
  const normalized = normalizePath(value);
  const parts = normalized.split('/');
  if (parts.length <= 1) return [];
  const parents: string[] = [];
  let current = '';
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    parents.push(current);
  }
  return parents;
};

const movePath = (value: string, from: string, to: string): string => {
  if (value === from) return to;
  if (value.startsWith(`${from}/`)) return `${to}${value.slice(from.length)}`;
  return value;
};

export type RenderMode = 'solid' | 'wireframe' | 'overlay';
export type ProjectionMode = 'perspective' | 'orthographic';

export interface ObjectSettings {
  visible: boolean;
  opacity: number;
  color: string;
}

type ObjectSettingsMap = Record<string, ObjectSettings>;
type ObjectSettingsByFile = Record<string, ObjectSettingsMap>;

export interface ViewCommand {
  id: number;
  type: 'fit' | 'zoom' | 'snap';
  view?: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso';
  targetId?: string | null;
}

export interface Measurement {
  id: string;
  points: number[][];
}

export type MeasureEntityKind = 'face' | 'edge' | 'vertex';

export interface MeasureFaceEntity {
  kind: 'face';
  normal: [number, number, number];
  center: [number, number, number];
  area: number;
  triangleIndices: number[];
  meshUuid: string;
}

export interface MeasureEdgeEntity {
  kind: 'edge';
  start: [number, number, number];
  end: [number, number, number];
  length: number;
  direction: [number, number, number];
  meshUuid: string;
}

export interface MeasureVertexEntity {
  kind: 'vertex';
  position: [number, number, number];
  meshUuid: string;
}

export type MeasureEntity = MeasureFaceEntity | MeasureEdgeEntity | MeasureVertexEntity;

interface ForgeStore {
  files: Record<string, string>;
  savedFiles: Record<string, string>;
  folders: string[];
  activeFile: string;
  setActiveFile: (name: string) => void;
  updateFileCode: (name: string, code: string) => void;
  createFile: (name: string) => void;
  createFolder: (name: string) => void;
  deleteFile: (name: string) => void;
  renameFile: (oldName: string, newName: string) => void;
  renameFolder: (oldPath: string, newPath: string) => void;
  deleteFolder: (path: string) => void;
  moveEntry: (oldPath: string, newPath: string) => void;

  dirty: boolean;

  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (h: FileSystemFileHandle | null) => void;

  result: RunResult | null;
  lastValidResult: RunResult | null;
  consoleLogs: LogEntry[];
  params: ParamDef[];
  runQuality: ForgeQualityPreset;
  setRunQuality: (quality: ForgeQualityPreset) => void;
  paramOverrides: Record<string, number>;
  paramOverridesByFile: Record<string, Record<string, number>>;
  jointValues: Record<string, number>;
  jointAnimationClip: string | null;
  jointAnimationProgress: number;
  jointAnimationPlaying: boolean;
  jointAnimationSpeed: number;

  isEvaluating: boolean;
  evaluationPhase: 'idle' | 'kernel-init' | 'evaluating' | 'serializing' | 'exporting';
  pauseAutoEval: boolean;
  togglePauseAutoEval: () => void;
  activeBackend: 'occt' | 'manifold';
  setActiveBackend: (backend: 'occt' | 'manifold') => void;

  execute: () => Promise<void>;
  setParam: (name: string, value: number) => void;
  resetParamOverrides: () => void;
  setJointValue: (name: string, value: number) => void;
  setJointAnimationClip: (name: string | null) => void;
  setJointAnimationProgress: (value: number) => void;
  setJointAnimationPlaying: (playing: boolean) => void;
  setJointAnimationSpeed: (value: number) => void;
  toggleJointAnimationPlayback: () => void;

  lengthUnit: LengthUnit;
  setLengthUnit: (unit: LengthUnit) => void;

  renderMode: RenderMode;
  setRenderMode: (mode: RenderMode) => void;
  projectionMode: ProjectionMode;
  setProjectionMode: (mode: ProjectionMode) => void;
  gridEnabled: boolean;
  gridSize: number;
  setGridEnabled: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  showPerformanceInfo: boolean;
  setShowPerformanceInfo: (enabled: boolean) => void;
  previewFile: string | null;
  objectSettings: ObjectSettingsMap;
  objectSettingsByFile: ObjectSettingsByFile;
  setObjectVisibility: (id: string, visible: boolean) => void;
  showAllObjects: () => void;
  setObjectsVisibility: (ids: string[], visible: boolean) => void;
  setObjectOpacity: (id: string, opacity: number) => void;
  setObjectColor: (id: string, color: string) => void;
  selectedObjectId: string | null;
  selectObject: (id: string | null) => void;
  constructionGhost: { plan: ShapeCompilePlan; objectId: string } | null;
  setConstructionGhost: (ghost: { plan: ShapeCompilePlan; objectId: string } | null) => void;
  focusedObjectIds: string[];
  focusObject: (id: string | null, options?: { additive?: boolean }) => void;
  clearFocusedObject: () => void;
  hoveredObjectId: string | null;
  setHoveredObjectId: (id: string | null) => void;
  selectedConstraintId: string | null;
  setSelectedConstraintId: (id: string | null) => void;
  hoveredSurfaceIndex: number | null;
  setHoveredSurfaceIndex: (index: number | null) => void;
  selectedSurfaceIndex: number | null;
  setSelectedSurfaceIndex: (index: number | null) => void;
  selectedSketchEntityId: string | null;
  setSelectedSketchEntityId: (id: string | null) => void;
  hoveredJointName: string | null;
  setHoveredJointName: (name: string | null) => void;
  objectPickSyncEnabled: boolean;
  setObjectPickSyncEnabled: (enabled: boolean) => void;
  viewCommand: ViewCommand | null;
  requestViewCommand: (command: Omit<ViewCommand, 'id'>) => void;
  clearViewCommand: () => void;
  viewportCameraState: ViewportCameraState | null;
  setViewportCameraState: (state: ViewportCameraState | null) => void;

  measureMode: boolean;
  toggleMeasure: () => void;
  measureSelections: MeasureEntity[];
  addMeasureSelection: (entity: MeasureEntity) => void;
  clearMeasureSelections: () => void;
  measurements: Measurement[];
  addMeasurePoint: (pt: number[]) => void;
  updateMeasurePoint: (id: string, index: number, pt: number[]) => void;
  removeMeasurement: (id: string) => void;
  clearMeasure: () => void;
  measureSnapPx: number;
  setMeasureSnapPx: (value: number) => void;

  dimensionsVisible: boolean;
  toggleDimensions: () => void;

  surfacesVisible: boolean;
  toggleSurfaces: () => void;

  explodeAmount: number;
  setExplodeAmount: (amount: number) => void;

  cutPlaneEnabled: Record<string, boolean>;
  setCutPlaneEnabled: (name: string, enabled: boolean) => void;
  sectionPlaneGuidesEnabled: boolean;
  sectionPlaneFillEnabled: boolean;
  sectionPlaneFillOpacity: number;
  sectionPlaneBorderEnabled: boolean;
  sectionPlaneAxisEnabled: boolean;
  setSectionPlaneGuidesEnabled: (enabled: boolean) => void;
  setSectionPlaneFillEnabled: (enabled: boolean) => void;
  setSectionPlaneFillOpacity: (opacity: number) => void;
  setSectionPlaneBorderEnabled: (enabled: boolean) => void;
  setSectionPlaneAxisEnabled: (enabled: boolean) => void;

  newProject: () => void;
  saveFile: () => Promise<void>;
  saveFileAs: () => Promise<void>;
  loadFromText: (text: string, name: string) => void;

  kernelReady: boolean;
  setKernelReady: (v: boolean) => void;
  fileExplorerOpen: boolean;
  toggleFileExplorer: () => void;
  viewPanelOpen: boolean;
  toggleViewPanel: () => void;

  updateSketchConstraint: (objectId: string, constraintId: string, value: number) => void;

  applyServerSnapshot: (serverFiles: Record<string, string>) => void;
  applyServerFileChange: (filename: string, content: string) => void;
  applyServerFileDelete: (filename: string) => void;

  theme: ThemeName;
  setTheme: (name: ThemeName) => void;

  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;

  fileSwitcherOpen: boolean;
  openFileSwitcher: () => void;
  closeFileSwitcher: () => void;

  shortcutsOverlayOpen: boolean;
  openShortcutsOverlay: () => void;
  closeShortcutsOverlay: () => void;

  /** Non-null when the UI wants the code editor to jump to a specific line. */
  editorNavigate: { line: number; id: number } | null;
  requestEditorNavigate: (line: number) => void;
  clearEditorNavigate: () => void;

  /** When true, skip the run-result cache — every param/code change round-trips to the worker. */
  disableRunCache: boolean;
  setDisableRunCache: (disabled: boolean) => void;
}

interface ViewPreferencesState {
  runQuality: ForgeQualityPreset;
  renderMode: RenderMode;
  projectionMode: ProjectionMode;
  gridEnabled: boolean;
  gridSize: number;
  showPerformanceInfo: boolean;
  objectSettingsByFile: ObjectSettingsByFile;
  objectPickSyncEnabled: boolean;
  measureSnapPx: number;
  dimensionsVisible: boolean;
  surfacesVisible: boolean;
  explodeAmount: number;
  jointAnimationSpeed: number;
  cutPlaneEnabled: Record<string, boolean>;
  sectionPlaneGuidesEnabled: boolean;
  sectionPlaneFillEnabled: boolean;
  sectionPlaneFillOpacity: number;
  sectionPlaneBorderEnabled: boolean;
  sectionPlaneAxisEnabled: boolean;
  fileExplorerOpen: boolean;
  viewPanelOpen: boolean;
  lengthUnit: LengthUnit;
  /** Disable the run-result cache so every execution round-trips to the worker. */
  disableRunCache: boolean;
  /** Active geometry backend for evaluation. */
  activeBackend: 'occt' | 'manifold';
}

const DEFAULT_OBJECT_COLOR = '#5b9bd5';
const VIEW_PREFERENCES_KEY = 'fc-view-preferences-v1';

const getObjectSettingsForPreviewFile = (
  objectSettingsByFile: ObjectSettingsByFile,
  previewFile: string | null,
): ObjectSettingsMap => {
  if (!previewFile) return {};
  return objectSettingsByFile[previewFile] ?? {};
};

const setObjectSettingsForPreviewFile = (
  objectSettingsByFile: ObjectSettingsByFile,
  previewFile: string | null,
  objectSettings: ObjectSettingsMap,
): ObjectSettingsByFile => {
  if (!previewFile) return objectSettingsByFile;
  if (Object.keys(objectSettings).length === 0) {
    if (!(previewFile in objectSettingsByFile)) return objectSettingsByFile;
    const next = { ...objectSettingsByFile };
    delete next[previewFile];
    return next;
  }
  return { ...objectSettingsByFile, [previewFile]: objectSettings };
};

const remapObjectSettingsByFile = (
  objectSettingsByFile: ObjectSettingsByFile,
  from: string,
  to: string,
): ObjectSettingsByFile => {
  let changed = false;
  const next: ObjectSettingsByFile = {};
  Object.entries(objectSettingsByFile).forEach(([file, settings]) => {
    const mapped = movePath(file, from, to);
    if (mapped !== file) changed = true;
    next[mapped] = settings;
  });
  return changed ? next : objectSettingsByFile;
};

const removeObjectSettingsForFile = (
  objectSettingsByFile: ObjectSettingsByFile,
  file: string,
): ObjectSettingsByFile => {
  if (!(file in objectSettingsByFile)) return objectSettingsByFile;
  const next = { ...objectSettingsByFile };
  delete next[file];
  return next;
};

const syncObjectSettings = (
  objects: SceneObject[],
  prevSettings: Record<string, ObjectSettings>,
  selectedObjectId: string | null,
  focusedObjectIds: string[],
): { settings: Record<string, ObjectSettings>; selectedObjectId: string | null; focusedObjectIds: string[] } => {
  const nextSettings: Record<string, ObjectSettings> = { ...prevSettings };
  const ids = new Set(objects.map((obj) => obj.id));
  Object.keys(nextSettings).forEach((id) => {
    if (!ids.has(id)) delete nextSettings[id];
  });
  objects.forEach((obj) => {
    if (!nextSettings[obj.id]) {
      nextSettings[obj.id] = { visible: true, opacity: 1, color: obj.color || DEFAULT_OBJECT_COLOR };
    } else {
      nextSettings[obj.id].color = obj.color || DEFAULT_OBJECT_COLOR;
    }
  });
  const nextSelected = objects.length === 0
    ? null
    : (selectedObjectId && ids.has(selectedObjectId) ? selectedObjectId : objects[0].id);
  const nextFocused = focusedObjectIds.filter((id) => ids.has(id));
  return { settings: nextSettings, selectedObjectId: nextSelected, focusedObjectIds: nextFocused };
};

const syncCutPlaneEnabled = (
  cutPlanes: { name: string }[],
  prevEnabled: Record<string, boolean>,
): Record<string, boolean> => {
  const next: Record<string, boolean> = {};
  cutPlanes.forEach((cp) => {
    next[cp.name] = prevEnabled[cp.name] ?? false;
  });
  return next;
};

const clampJointValue = (
  value: number,
  min?: number,
  max?: number,
): number => {
  let next = Number.isFinite(value) ? value : 0;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};

const clampAnimationProgress = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const sanitizeAnimationProgress = (
  value: number,
  clip?: { loop: boolean; continuous?: boolean } | null,
): number => {
  if (!Number.isFinite(value)) return 0;
  if (clip?.loop && clip.continuous) return Math.max(0, value);
  return clampAnimationProgress(value);
};

const syncJointValues = (
  result: RunResult,
  prev: Record<string, number>,
): Record<string, number> => {
  const joints = result.jointsView?.enabled === false ? [] : (result.jointsView?.joints ?? []);
  const next: Record<string, number> = {};
  joints.forEach((joint) => {
    const raw = prev[joint.name] ?? joint.defaultValue;
    next[joint.name] = clampJointValue(raw, joint.min, joint.max);
  });
  return next;
};

const syncHoveredJointName = (
  result: RunResult,
  hoveredJointName: string | null,
): string | null => {
  if (!hoveredJointName) return null;
  const joints = result.jointsView?.enabled === false ? [] : (result.jointsView?.joints ?? []);
  return joints.some((joint) => joint.name === hoveredJointName) ? hoveredJointName : null;
};

interface JointAnimationState {
  clip: string | null;
  progress: number;
  playing: boolean;
}

const syncJointAnimationState = (
  result: RunResult,
  prevClip: string | null,
  prevProgress: number,
  prevPlaying: boolean,
): JointAnimationState => {
  const clips = result.jointsView?.enabled === false ? [] : (result.jointsView?.animations ?? []);
  if (clips.length === 0) return { clip: null, progress: 0, playing: false };

  const clipNames = new Set(clips.map((clip) => clip.name));
  const previousStillValid = !!prevClip && clipNames.has(prevClip);
  let clip = previousStillValid ? prevClip : null;

  if (!clip) {
    const preferred = result.jointsView?.defaultAnimation;
    if (preferred && clipNames.has(preferred)) clip = preferred;
  }

  const activeClip = clip ? clips.find((entry) => entry.name === clip) ?? null : null;
  const progress = previousStillValid ? sanitizeAnimationProgress(prevProgress, activeClip) : 0;
  const playing = clip ? prevPlaying : false;
  return { clip, progress, playing };
};

function createErrorRunResult(message: string, quality: ForgeQualityPreset): RunResult {
  return {
    shape: null,
    sketch: null,
    objects: [],
    params: [],
    dimensions: [],
    highlights: [],
    bom: [],
    cutPlanes: [],
    explodeView: null,
    jointsView: null,
    viewConfig: null,
    robotExport: null,
    quality,
    error: message,
    timeMs: 0,
    logs: [{ level: 'error', args: [message], timestamp: Date.now() }],
    verifications: [],
  };
}


function buildRunState(
  previewFile: string | null,
  runResult: RunResult,
  state: Pick<
    ForgeStore,
    | 'objectSettingsByFile'
    | 'selectedObjectId'
    | 'focusedObjectIds'
    | 'cutPlaneEnabled'
    | 'jointValues'
    | 'jointAnimationClip'
    | 'jointAnimationProgress'
    | 'jointAnimationPlaying'
    | 'hoveredJointName'
  >,
) {
  const synced = syncObjectSettings(
    runResult.objects,
    getObjectSettingsForPreviewFile(state.objectSettingsByFile, previewFile),
    state.selectedObjectId,
    state.focusedObjectIds,
  );
  const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(
    state.objectSettingsByFile,
    previewFile,
    synced.settings,
  );
  const nextCutPlaneEnabled = syncCutPlaneEnabled(runResult.cutPlanes, state.cutPlaneEnabled);
  const nextJointValues = syncJointValues(runResult, state.jointValues);
  const nextAnimationState = syncJointAnimationState(
    runResult,
    state.jointAnimationClip,
    state.jointAnimationProgress,
    state.jointAnimationPlaying,
  );

  return {
    nextState: {
      result: runResult,
      consoleLogs: runResult.logs,
      params: runResult.params,
      jointValues: nextJointValues,
      jointAnimationClip: nextAnimationState.clip,
      jointAnimationProgress: nextAnimationState.progress,
      jointAnimationPlaying: nextAnimationState.playing,
      hoveredJointName: syncHoveredJointName(runResult, state.hoveredJointName),
      previewFile,
      objectSettings: synced.settings,
      objectSettingsByFile: nextObjectSettingsByFile,
      selectedObjectId: synced.selectedObjectId,
      focusedObjectIds: synced.focusedObjectIds,
      cutPlaneEnabled: nextCutPlaneEnabled,
    },
    nextCutPlaneEnabled,
    nextObjectSettingsByFile,
  };
}

const readViewPreferences = (): Partial<ViewPreferencesState> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(VIEW_PREFERENCES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Partial<ViewPreferencesState>;
  } catch {
    return {};
  }
};

const writeViewPreferences = (patch: Partial<ViewPreferencesState>): void => {
  if (typeof window === 'undefined') return;
  try {
    const next = { ...readViewPreferences(), ...patch };
    if ('objectSettingsByFile' in patch) {
      delete (next as { objectSettings?: unknown }).objectSettings;
    }
    localStorage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
};

const initialViewPreferences = readViewPreferences();
const initialPreviewFile = resolvePreviewFile(initialActive, INITIAL_FILES);
const initialObjectSettingsByFile: ObjectSettingsByFile = (() => {
  const viewPreferences = initialViewPreferences as Partial<ViewPreferencesState> & { objectSettings?: ObjectSettingsMap };
  if (viewPreferences.objectSettingsByFile && typeof viewPreferences.objectSettingsByFile === 'object') {
    return viewPreferences.objectSettingsByFile;
  }
  if (initialPreviewFile && viewPreferences.objectSettings && typeof viewPreferences.objectSettings === 'object') {
    return { [initialPreviewFile]: viewPreferences.objectSettings };
  }
  return {};
})();

export const useForgeStore = create<ForgeStore>((set, get) => ({
  files: { ...INITIAL_FILES },
  savedFiles: { ...INITIAL_SAVED },
  folders: [...INITIAL_FOLDERS],
  activeFile: initialActive,
  setActiveFile: (name) => {
    // Update URL hash when active file changes
    if (name) {
      window.history.replaceState(null, '', `#${name}`);
    }
    // Save current file's param overrides before switching
    const { activeFile: prevFile, paramOverrides, paramOverridesByFile } = get();
    const nextByFile = { ...paramOverridesByFile };
    if (prevFile) {
      if (Object.keys(paramOverrides).length > 0) {
        nextByFile[prevFile] = paramOverrides;
      } else {
        delete nextByFile[prevFile];
      }
    }
    // Restore target file's saved overrides (empty if none)
    const restored = (name && nextByFile[name]) ? nextByFile[name] : {};
    set({
      activeFile: name,
      lastValidResult: null,
      paramOverrides: restored,
      paramOverridesByFile: nextByFile,
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
    });
    setParamOverrides(restored);
    setTimeout(() => get().execute(), 0);
  },
  updateFileCode: (name, code) => {
    set((s) => ({ files: { ...s.files, [name]: code }, dirty: true }));
  },
  createFile: (name) => {
    const normalized = normalizePath(name);
    if (!normalized) return;
    if (get().files[normalized]) return;
    if (get().folders.includes(normalized)) return;
    const template = isNotebookFile(normalized)
      ? serializeNotebook(createNotebook())
      : normalized.endsWith('.svg')
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z" fill="none" stroke="#000" stroke-width="4" />
</svg>
`
      : normalized.endsWith('.forge.js')
          ? '// 3D Part\n\nreturn box(50, 30, 10);\n'
          : '// Shared JS utilities for ForgeCAD.\n\nexport function exampleValue() {\n  return 42;\n}\n';
    const newFolders = Array.from(new Set([...get().folders, ...collectParentPaths(normalized)])).sort();
    set((s) => ({
      files: { ...s.files, [normalized]: template },
      activeFile: normalized,
      paramOverrides: {},
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
      folders: newFolders,
    }));
    setTimeout(() => get().execute(), 0);
  },
  createFolder: (name) => {
    const normalized = normalizePath(name);
    if (!normalized) return;
    const { files, folders } = get();
    if (files[normalized]) return;
    if (folders.includes(normalized)) return;
    const next = Array.from(new Set([...folders, normalized, ...collectParentPaths(normalized)])).sort();
    set({ folders: next });
  },
  deleteFile: (name) => {
    const { files, savedFiles, activeFile, objectSettingsByFile } = get();
    const remaining = { ...files };
    delete remaining[name];
    const remainingSaved = { ...savedFiles };
    delete remainingSaved[name];
    const names = Object.keys(remaining);
    if (names.length === 0) return;
    const newActive = name === activeFile ? names[0] : activeFile;
    const nextObjectSettingsByFile = removeObjectSettingsForFile(objectSettingsByFile, name);
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
    set({
      files: remaining,
      savedFiles: remainingSaved,
      activeFile: newActive,
      objectSettingsByFile: nextObjectSettingsByFile,
      paramOverrides: {},
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
    });
    setTimeout(() => get().execute(), 0);
  },
  renameFile: (oldName, newName) => {
    const normalized = normalizePath(newName);
    if (!normalized || normalized === oldName) return;
    const { files, savedFiles, activeFile, objectSettingsByFile } = get();
    const code = files[oldName];
    if (!code) return;
    if (files[normalized]) return;
    if (get().folders.includes(normalized)) return;
    const remaining = { ...files };
    delete remaining[oldName];
    remaining[normalized] = code;
    
    // Note: We do NOT update savedFiles with the new name because it hasn't been saved to disk yet
    // But we should remove the old name from savedFiles
    const remainingSaved = { ...savedFiles };
    delete remainingSaved[oldName];
    const nextObjectSettingsByFile = remapObjectSettingsByFile(objectSettingsByFile, oldName, normalized);
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });

    set({
      files: remaining,
      savedFiles: remainingSaved,
      activeFile: oldName === activeFile ? normalized : activeFile,
      objectSettingsByFile: nextObjectSettingsByFile,
      folders: Array.from(new Set([...get().folders, ...collectParentPaths(normalized)])).sort(),
    });
  },
  renameFolder: (oldPath, newPath) => {
    const normalizedOld = normalizePath(oldPath);
    const normalizedNew = normalizePath(newPath);
    if (!normalizedOld || !normalizedNew) return;
    if (normalizedOld === normalizedNew) return;
    const { files, savedFiles, activeFile, folders, objectSettingsByFile } = get();
    if (!folders.includes(normalizedOld)) return;
    if (files[normalizedNew]) return;
    if (folders.includes(normalizedNew)) return;
    if (normalizedNew.startsWith(`${normalizedOld}/`)) return;

    const conflict = Object.keys(files).some((key) => {
      if (key === normalizedOld || key.startsWith(`${normalizedOld}/`)) return false;
      return key === normalizedNew || key.startsWith(`${normalizedNew}/`);
    });
    if (conflict) return;

    const updatedFiles: Record<string, string> = {};
    Object.keys(files).forEach((key) => {
      const next = movePath(key, normalizedOld, normalizedNew);
      updatedFiles[next] = files[key];
    });

    const updatedSaved: Record<string, string> = {};
    Object.keys(savedFiles).forEach((key) => {
      if (key === normalizedOld || key.startsWith(`${normalizedOld}/`)) return;
      updatedSaved[key] = savedFiles[key];
    });

    const updatedFolders = Array.from(new Set(
      folders
        .map((folder) => movePath(folder, normalizedOld, normalizedNew))
        .concat(collectParentPaths(normalizedNew)),
    )).sort();

    const nextActive = activeFile && activeFile.startsWith(`${normalizedOld}/`)
      ? movePath(activeFile, normalizedOld, normalizedNew)
      : activeFile;
    const nextObjectSettingsByFile = remapObjectSettingsByFile(objectSettingsByFile, normalizedOld, normalizedNew);
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });

    set({
      files: updatedFiles,
      savedFiles: updatedSaved,
      folders: updatedFolders,
      activeFile: nextActive,
      objectSettingsByFile: nextObjectSettingsByFile,
      paramOverrides: {},
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
    });
    setTimeout(() => get().execute(), 0);
  },
  deleteFolder: (path) => {
    const normalized = normalizePath(path);
    if (!normalized) return;
    const { folders, files } = get();
    if (!folders.includes(normalized)) return;
    const hasFileContents = Object.keys(files).some((file) => file.startsWith(`${normalized}/`));
    if (hasFileContents) return;
    const hasChildFolder = folders.some((folder) => folder.startsWith(`${normalized}/`));
    if (hasChildFolder) return;
    set({ folders: folders.filter((folder) => folder !== normalized) });
  },
  moveEntry: (oldPath, newPath) => {
    const normalizedOld = normalizePath(oldPath);
    const normalizedNew = normalizePath(newPath);
    if (!normalizedOld || !normalizedNew) return;
    const { files, folders } = get();
    if (files[normalizedOld]) {
      get().renameFile(normalizedOld, normalizedNew);
      return;
    }
    if (folders.includes(normalizedOld)) {
      get().renameFolder(normalizedOld, normalizedNew);
    }
  },

  dirty: false,

  fileHandle: null,
  setFileHandle: (fileHandle) => set({ fileHandle }),

  result: null,
  lastValidResult: null,
  consoleLogs: [],
  params: [],
  runQuality: resolveForgeQualityPreset(initialViewPreferences.runQuality ?? 'live'),
  setRunQuality: (quality) => {
    const next = resolveForgeQualityPreset(quality);
    writeViewPreferences({ runQuality: next });
    set({ runQuality: next });
  },
  paramOverrides: {},
  paramOverridesByFile: {},
  jointValues: {},
  jointAnimationClip: null,
  jointAnimationProgress: 0,
  jointAnimationPlaying: false,
  jointAnimationSpeed: clampAnimationSpeed(initialViewPreferences.jointAnimationSpeed ?? 1),

  isEvaluating: false,
  evaluationPhase: 'idle' as const,
  pauseAutoEval: false,
  togglePauseAutoEval: () => set((s) => ({ pauseAutoEval: !s.pauseAutoEval })),
  activeBackend: (initialViewPreferences.activeBackend as 'occt' | 'manifold') || 'manifold',
  setActiveBackend: (backend) => {
    writeViewPreferences({ activeBackend: backend });
    set({ activeBackend: backend });
    get().execute();
  },

  execute: async () => {
    const {
      files,
      activeFile,
      runQuality,
      paramOverrides,
    } = get();
    const previewFile = resolvePreviewFile(activeFile, files);
    if (!previewFile) {
      set({ result: null, lastValidResult: null, consoleLogs: [], params: [], previewFile: null, objectSettings: {} });
      return;
    }
    const code = files[previewFile];
    if (!code) return;

    // Cache hit — show previous result immediately, no worker round-trip
    const cached = get().disableRunCache ? null : lookupCache(previewFile, code, files, paramOverrides, runQuality, get().activeBackend);
    if (cached) {
      const applied = buildRunState(previewFile, cached, get());
      set({ ...applied.nextState, lastValidResult: cached, isEvaluating: false, evaluationPhase: 'idle' as const });
      writeViewPreferences({ objectSettingsByFile: applied.nextObjectSettingsByFile, cutPlaneEnabled: applied.nextCutPlaneEnabled });
      return;
    }

    set({ isEvaluating: true, evaluationPhase: 'kernel-init' });

    try {
      const tDispatch = performance.now();
      const serialized = await evalWorkerClient.run({
        code,
        file: previewFile,
        files,
        quality: runQuality,
        paramOverrides,
        isNotebook: isNotebookFile(previewFile),
        activeBackend: get().activeBackend,
      });
      const tReceived = performance.now();

      const runResult = deserializeRunResult(serialized);
      const tDeserialize = performance.now();
      publishSolverWasmRunDebug(runResult.solverDebug ?? null);

      console.log(
        `[main]   workerRoundTrip=${(tReceived - tDispatch).toFixed(0)}ms  deserialize=${(tDeserialize - tReceived).toFixed(0)}ms`,
      );

      if (runResult.error) {
        set({ result: runResult, consoleLogs: runResult.logs, previewFile, isEvaluating: false, evaluationPhase: 'idle' as const });
      } else {
        storeCache(previewFile, code, files, paramOverrides, runQuality, get().activeBackend, runResult, serialized);
        const applied = buildRunState(previewFile, runResult, get());
        set({ ...applied.nextState, lastValidResult: runResult, isEvaluating: false, evaluationPhase: 'idle' as const });
        writeViewPreferences({ objectSettingsByFile: applied.nextObjectSettingsByFile, cutPlaneEnabled: applied.nextCutPlaneEnabled });
      }
    } catch (error: unknown) {
      // 'cancelled' means a newer run was already started — keep isEvaluating true
      if (error instanceof Error && error.message === 'cancelled') return;
      const message = error instanceof Error ? error.message : String(error);
      const errResult = createErrorRunResult(message, runQuality);
      set({ result: errResult, consoleLogs: errResult.logs, previewFile, isEvaluating: false, evaluationPhase: 'idle' as const });
    }
  },

  setParam: (name, value) => {
    const overrides = { ...get().paramOverrides, [name]: value };
    const { activeFile: curFile, paramOverridesByFile } = get();
    const previewKey = curFile ? resolvePreviewFile(curFile, get().files) : null;
    const nextByFile = previewKey
      ? { ...paramOverridesByFile, [previewKey]: overrides }
      : paramOverridesByFile;
    set({ paramOverrides: overrides, paramOverridesByFile: nextByFile });
    get().execute();
  },

  resetParamOverrides: () => {
    const { activeFile, files, paramOverridesByFile } = get();
    const previewKey = activeFile ? resolvePreviewFile(activeFile, files) : null;
    const nextByFile = { ...paramOverridesByFile };
    if (previewKey) delete nextByFile[previewKey];
    set({ paramOverrides: {}, paramOverridesByFile: nextByFile });
    setParamOverrides({});
    get().execute();
  },

  setJointValue: (name, value) => set((state) => {
    const joints = state.lastValidResult?.jointsView?.enabled === false ? [] : (state.lastValidResult?.jointsView?.joints ?? []);
    const couplings = state.lastValidResult?.jointsView?.enabled === false ? [] : (state.lastValidResult?.jointsView?.couplings ?? []);
    const coupled = new Set(couplings.map((coupling) => coupling.joint));
    if (coupled.has(name)) return {};
    const joint = joints.find((entry) => entry.name === name);
    if (!joint) return {};
    const clamped = clampJointValue(value, joint.min, joint.max);
    return {
      jointValues: { ...state.jointValues, [name]: clamped },
      jointAnimationPlaying: false,
    };
  }),

  setJointAnimationClip: (name) => set((state) => {
    const clips = state.lastValidResult?.jointsView?.enabled === false ? [] : (state.lastValidResult?.jointsView?.animations ?? []);
    if (!name) {
      return {
        jointAnimationClip: null,
        jointAnimationPlaying: false,
      };
    }
    if (!clips.some((clip) => clip.name === name)) return {};
    return {
      jointAnimationClip: name,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
    };
  }),

  setJointAnimationProgress: (value) => set({
    jointAnimationProgress: sanitizeAnimationProgress(
      value,
      get().result?.jointsView?.animations.find((clip) => clip.name === get().jointAnimationClip) ?? null,
    ),
  }),

  setJointAnimationPlaying: (playing) => set((state) => {
    if (!playing) return { jointAnimationPlaying: false };
    const clips = state.lastValidResult?.jointsView?.enabled === false ? [] : (state.lastValidResult?.jointsView?.animations ?? []);
    if (clips.length === 0) return { jointAnimationPlaying: false };
    const clipName = state.jointAnimationClip
      && clips.some((clip) => clip.name === state.jointAnimationClip)
      ? state.jointAnimationClip
      : (state.lastValidResult?.jointsView?.defaultAnimation && clips.some((clip) => clip.name === state.lastValidResult?.jointsView?.defaultAnimation)
        ? state.lastValidResult?.jointsView?.defaultAnimation
        : clips[0].name);
    return {
      jointAnimationClip: clipName,
      jointAnimationPlaying: true,
    };
  }),

  setJointAnimationSpeed: (value) => {
    const safeSpeed = clampAnimationSpeed(value);
    writeViewPreferences({ jointAnimationSpeed: safeSpeed });
    set({ jointAnimationSpeed: safeSpeed });
  },

  toggleJointAnimationPlayback: () => set((state) => {
    if (state.jointAnimationPlaying) return { jointAnimationPlaying: false };
    const clips = state.lastValidResult?.jointsView?.enabled === false ? [] : (state.lastValidResult?.jointsView?.animations ?? []);
    if (clips.length === 0) return {};
    const clipName = state.jointAnimationClip
      && clips.some((clip) => clip.name === state.jointAnimationClip)
      ? state.jointAnimationClip
      : (state.lastValidResult?.jointsView?.defaultAnimation && clips.some((clip) => clip.name === state.lastValidResult?.jointsView?.defaultAnimation)
        ? state.lastValidResult?.jointsView?.defaultAnimation
        : clips[0].name);
    return {
      jointAnimationClip: clipName,
      jointAnimationPlaying: true,
    };
  }),

  lengthUnit: (initialViewPreferences.lengthUnit as LengthUnit) ?? 'mm',
  setLengthUnit: (unit) => {
    writeViewPreferences({ lengthUnit: unit });
    set({ lengthUnit: unit });
  },

  renderMode: initialViewPreferences.renderMode ?? 'overlay',
  setRenderMode: (mode) => {
    writeViewPreferences({ renderMode: mode });
    set({ renderMode: mode });
  },
  projectionMode: initialViewPreferences.projectionMode ?? 'perspective',
  setProjectionMode: (mode) => {
    writeViewPreferences({ projectionMode: mode });
    set({ projectionMode: mode });
  },
  gridEnabled: initialViewPreferences.gridEnabled ?? true,
  gridSize: initialViewPreferences.gridSize ?? 10,
  setGridEnabled: (enabled) => {
    writeViewPreferences({ gridEnabled: enabled });
    set({ gridEnabled: enabled });
  },
  setGridSize: (size) => {
    writeViewPreferences({ gridSize: size });
    set({ gridSize: size });
  },
  showPerformanceInfo: initialViewPreferences.showPerformanceInfo ?? false,
  setShowPerformanceInfo: (enabled) => {
    writeViewPreferences({ showPerformanceInfo: enabled });
    set({ showPerformanceInfo: enabled });
  },
  previewFile: initialPreviewFile,
  objectSettingsByFile: initialObjectSettingsByFile,
  objectSettings: getObjectSettingsForPreviewFile(initialObjectSettingsByFile, initialPreviewFile),
  setObjectVisibility: (id, visible) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, visible } };
    const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(
      s.objectSettingsByFile,
      s.previewFile,
      nextObjectSettings,
    );
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
    return {
      objectSettings: nextObjectSettings,
      objectSettingsByFile: nextObjectSettingsByFile,
    };
  }),
  showAllObjects: () => set((state) => {
    const objectMetaById = new Map((state.lastValidResult?.objects ?? []).map((obj) => [obj.id, obj]));
    const ids = new Set([
      ...Object.keys(state.objectSettings),
      ...objectMetaById.keys(),
    ]);

    if (ids.size === 0) return state;

    let changed = false;
    const nextObjectSettings = { ...state.objectSettings };
    ids.forEach((id) => {
      const objectMeta = objectMetaById.get(id);
      const fallbackColor = objectMeta?.color || DEFAULT_OBJECT_COLOR;
      const current = nextObjectSettings[id] ?? { visible: true, opacity: 1, color: fallbackColor };
      if (!current.visible) changed = true;
      nextObjectSettings[id] = { ...current, visible: true };
    });

    if (!changed) return state;
    const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(
      state.objectSettingsByFile,
      state.previewFile,
      nextObjectSettings,
    );
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
    return {
      objectSettings: nextObjectSettings,
      objectSettingsByFile: nextObjectSettingsByFile,
    };
  }),
  setObjectsVisibility: (ids, visible) => set((s) => {
    if (ids.length === 0) return {} as Partial<ForgeStore>;

    let changed = false;
    const nextObjectSettings = { ...s.objectSettings };
    ids.forEach((id) => {
      const current = nextObjectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
      if (current.visible === visible) return;
      nextObjectSettings[id] = { ...current, visible };
      changed = true;
    });

    if (!changed) return {} as Partial<ForgeStore>;
    const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(
      s.objectSettingsByFile,
      s.previewFile,
      nextObjectSettings,
    );
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
    return {
      objectSettings: nextObjectSettings,
      objectSettingsByFile: nextObjectSettingsByFile,
    };
  }),
  setObjectOpacity: (id, opacity) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, opacity } };
    const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(
      s.objectSettingsByFile,
      s.previewFile,
      nextObjectSettings,
    );
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
    return {
      objectSettings: nextObjectSettings,
      objectSettingsByFile: nextObjectSettingsByFile,
    };
  }),
  setObjectColor: (id, color) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, color } };
    const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(
      s.objectSettingsByFile,
      s.previewFile,
      nextObjectSettings,
    );
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
    return {
      objectSettings: nextObjectSettings,
      objectSettingsByFile: nextObjectSettingsByFile,
    };
  }),
  selectedObjectId: null,
  selectObject: (id) => set({ selectedObjectId: id, constructionGhost: null, selectedConstraintId: null }),
  constructionGhost: null,
  setConstructionGhost: (ghost) => set({ constructionGhost: ghost }),
  focusedObjectIds: [],
  focusObject: (id, options) => set((state) => {
    if (!id) return { focusedObjectIds: [] };
    if (!options?.additive) {
      return { focusedObjectIds: [id], selectedObjectId: id };
    }
    if (state.focusedObjectIds.includes(id)) {
      const nextFocusedObjectIds = state.focusedObjectIds.filter((focusedId) => focusedId !== id);
      return {
        focusedObjectIds: nextFocusedObjectIds,
        selectedObjectId: nextFocusedObjectIds.length > 0
          ? nextFocusedObjectIds[nextFocusedObjectIds.length - 1]
          : state.selectedObjectId,
      };
    }
    return { focusedObjectIds: [...state.focusedObjectIds, id], selectedObjectId: id };
  }),
  clearFocusedObject: () => set({ focusedObjectIds: [] }),
  hoveredObjectId: null,
  setHoveredObjectId: (id) => set((state) => (
    state.hoveredObjectId === id ? state : { hoveredObjectId: id }
  )),
  selectedConstraintId: null,
  setSelectedConstraintId: (id) => set((state) => (
    state.selectedConstraintId === id ? { selectedConstraintId: null } : { selectedConstraintId: id }
  )),
  hoveredSurfaceIndex: null,
  setHoveredSurfaceIndex: (index) => set((state) => (
    state.hoveredSurfaceIndex === index ? state : { hoveredSurfaceIndex: index }
  )),
  selectedSurfaceIndex: null,
  setSelectedSurfaceIndex: (index) => set((state) => (
    state.selectedSurfaceIndex === index ? { selectedSurfaceIndex: null } : { selectedSurfaceIndex: index }
  )),
  selectedSketchEntityId: null,
  setSelectedSketchEntityId: (id) => set((state) => (
    state.selectedSketchEntityId === id ? { selectedSketchEntityId: null } : { selectedSketchEntityId: id }
  )),
  hoveredJointName: null,
  setHoveredJointName: (name) => set((state) => (
    state.hoveredJointName === name ? state : { hoveredJointName: name }
  )),
  objectPickSyncEnabled: initialViewPreferences.objectPickSyncEnabled ?? true,
  setObjectPickSyncEnabled: (enabled) => {
    writeViewPreferences({ objectPickSyncEnabled: enabled });
    set({ objectPickSyncEnabled: enabled });
  },
  viewCommand: null,
  requestViewCommand: (command) => set({ viewCommand: { ...command, id: Date.now() } }),
  clearViewCommand: () => set({ viewCommand: null }),
  viewportCameraState: null,
  setViewportCameraState: (state) => set({ viewportCameraState: state }),

  measureMode: false,
  toggleMeasure: () => {
    set((s) => {
      const next = !s.measureMode;
      // Clear all measure state when deactivating
      if (!next) {
        return { measureMode: false, measureSelections: [], measurements: [] };
      }
      return { measureMode: true };
    });
  },
  measureSelections: [],
  addMeasureSelection: (entity) => {
    set((s) => {
      const sels = s.measureSelections;
      if (sels.length < 2) return { measureSelections: [...sels, entity] };
      // Third click: start fresh with just the new entity
      return { measureSelections: [entity] };
    });
  },
  clearMeasureSelections: () => set({ measureSelections: [] }),
  measurements: [],
  addMeasurePoint: (pt) => {
    const measurements = get().measurements;
    const last = measurements[measurements.length - 1];
    if (!last || last.points.length >= 2) {
      const id = `m_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
      set({ measurements: [...measurements, { id, points: [pt] }] });
      return;
    }
    const next = measurements.map((m, i) => (i === measurements.length - 1 ? { ...m, points: [...m.points, pt] } : m));
    set({ measurements: next });
  },
  updateMeasurePoint: (id, index, pt) => set((s) => ({
    measurements: s.measurements.map((m) => (
      m.id === id ? { ...m, points: m.points.map((p, i) => (i === index ? pt : p)) } : m
    )),
  })),
  removeMeasurement: (id) => set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
  clearMeasure: () => set({ measurements: [] }),
  measureSnapPx: initialViewPreferences.measureSnapPx ?? 12,
  setMeasureSnapPx: (value) => {
    writeViewPreferences({ measureSnapPx: value });
    set({ measureSnapPx: value });
  },

  dimensionsVisible: initialViewPreferences.dimensionsVisible ?? true,
  toggleDimensions: () => set((s) => {
    const nextDimensionsVisible = !s.dimensionsVisible;
    writeViewPreferences({ dimensionsVisible: nextDimensionsVisible });
    return { dimensionsVisible: nextDimensionsVisible };
  }),

  surfacesVisible: initialViewPreferences.surfacesVisible ?? true,
  toggleSurfaces: () => set((s) => {
    const nextSurfacesVisible = !s.surfacesVisible;
    writeViewPreferences({ surfacesVisible: nextSurfacesVisible });
    return { surfacesVisible: nextSurfacesVisible };
  }),

  explodeAmount: initialViewPreferences.explodeAmount ?? 0,
  setExplodeAmount: (amount) => {
    const safeAmount = Math.max(0, Math.min(500, Number.isFinite(amount) ? amount : 0));
    writeViewPreferences({ explodeAmount: safeAmount });
    set({ explodeAmount: safeAmount });
  },

  cutPlaneEnabled: initialViewPreferences.cutPlaneEnabled ?? {},
  setCutPlaneEnabled: (name, enabled) => set((s) => {
    const nextCutPlaneEnabled = { ...s.cutPlaneEnabled, [name]: enabled };
    writeViewPreferences({ cutPlaneEnabled: nextCutPlaneEnabled });
    return { cutPlaneEnabled: nextCutPlaneEnabled };
  }),
  sectionPlaneGuidesEnabled: initialViewPreferences.sectionPlaneGuidesEnabled ?? true,
  sectionPlaneFillEnabled: initialViewPreferences.sectionPlaneFillEnabled ?? true,
  sectionPlaneFillOpacity: initialViewPreferences.sectionPlaneFillOpacity ?? 0.2,
  sectionPlaneBorderEnabled: initialViewPreferences.sectionPlaneBorderEnabled ?? true,
  sectionPlaneAxisEnabled: initialViewPreferences.sectionPlaneAxisEnabled ?? true,
  setSectionPlaneGuidesEnabled: (enabled) => {
    writeViewPreferences({ sectionPlaneGuidesEnabled: enabled });
    set({ sectionPlaneGuidesEnabled: enabled });
  },
  setSectionPlaneFillEnabled: (enabled) => {
    writeViewPreferences({ sectionPlaneFillEnabled: enabled });
    set({ sectionPlaneFillEnabled: enabled });
  },
  setSectionPlaneFillOpacity: (opacity) => {
    const safeOpacity = Math.max(0, Math.min(1, opacity));
    writeViewPreferences({ sectionPlaneFillOpacity: safeOpacity });
    set({ sectionPlaneFillOpacity: safeOpacity });
  },
  setSectionPlaneBorderEnabled: (enabled) => {
    writeViewPreferences({ sectionPlaneBorderEnabled: enabled });
    set({ sectionPlaneBorderEnabled: enabled });
  },
  setSectionPlaneAxisEnabled: (enabled) => {
    writeViewPreferences({ sectionPlaneAxisEnabled: enabled });
    set({ sectionPlaneAxisEnabled: enabled });
  },

  newProject: () => {
    writeViewPreferences({ objectSettingsByFile: initialObjectSettingsByFile });
    set({
      files: { ...INITIAL_FILES },
      savedFiles: { ...INITIAL_SAVED },
      folders: [],
      activeFile: initialActive,
      previewFile: initialPreviewFile,
      objectSettings: getObjectSettingsForPreviewFile(initialObjectSettingsByFile, initialPreviewFile),
      objectSettingsByFile: initialObjectSettingsByFile,
      fileHandle: null,
      dirty: false,
      paramOverrides: {},
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
    });
    setTimeout(() => get().execute(), 0);
  },

  saveFile: async () => {
    const { files, activeFile } = get();
    if (!activeFile || !(activeFile in files)) return;
    try {
      await fileSystem.save(activeFile, files[activeFile]);
      set((s) => ({
        dirty: false,
        savedFiles: { ...s.savedFiles, [activeFile]: files[activeFile] },
      }));
    } catch (e) {
      console.error('Save failed:', e);
    }
  },

  saveFileAs: async () => {
    const { files, activeFile } = get();
    const code = files[activeFile];
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: activeFile,
          types: [
            { description: 'ForgeCAD scripts', accept: { 'text/javascript': ['.forge.js', '.js'] } },
            { description: 'ForgeCAD notebooks', accept: { 'application/json': ['.forge-notebook.json'] } },
            { description: 'SVG', accept: { 'image/svg+xml': ['.svg'] } },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(code);
        await writable.close();
        // Since we saved as a "new" file (potentially), or same file, we should update savedFiles?
        // Actually saveAs usually implies the current editor content is now associated with this new file.
        // But activeFile name in the store might remain the same unless we update it?
        // The current implementation of saveAs DOES NOT update activeFile name or file handle in a persistent way
        // EXCEPT it sets fileHandle. 
        // Wait, if I saveAs "foo.js" and activeFile was "untitled.js", does the editor rename it?
        // In the previous code:
        // set({ fileHandle: handle, dirty: false });
        // It didn't rename the active file in `files` map!
        // This seems like a potential existing bug or limitation.
        // However, for the purpose of THIS task, I should just mark the CURRENT buffer as saved.
        // If the user saves as a DIFFERENT name, usually the editor switches to that file.
        // I will assume for now we just verify the content is clean.
        set((s) => ({ 
          fileHandle: handle, 
          dirty: false,
          savedFiles: { ...s.savedFiles, [activeFile]: code } // This assumes we are satisfied with current content being "saved"
        }));
      } else {
        const mime = isNotebookFile(activeFile)
          ? 'application/json'
          : (activeFile.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript');
        const blob = new Blob([code], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeFile;
        a.click();
        URL.revokeObjectURL(url);
        set((s) => ({ 
          dirty: false,
          savedFiles: { ...s.savedFiles, [activeFile]: code }
        }));
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('Save failed:', e);
    }
  },

  loadFromText: (text, name) => {
    const normalized = normalizePath(name);
    const newFolders = Array.from(new Set([...get().folders, ...collectParentPaths(normalized)])).sort();
    set((s) => ({
      files: { ...s.files, [normalized]: text },
      // When loading from text, we assume it's like opening a file, so it's "saved" state initially?
      // Or is it a drop?
      // If it's a drop, it's like opening.
      // So we should update savedFiles.
      savedFiles: { ...s.savedFiles, [normalized]: text },
      activeFile: normalized,
      fileHandle: null,
      dirty: false,
      previewFile: null,
      objectSettings: {},
      paramOverrides: {},
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
      folders: newFolders,
    }));
    setTimeout(() => get().execute(), 0);
  },

  kernelReady: false,
  setKernelReady: (v) => set({ kernelReady: v }),

  fileExplorerOpen: initialViewPreferences.fileExplorerOpen ?? true,
  toggleFileExplorer: () => set((s) => {
    const nextFileExplorerOpen = !s.fileExplorerOpen;
    writeViewPreferences({ fileExplorerOpen: nextFileExplorerOpen });
    return { fileExplorerOpen: nextFileExplorerOpen };
  }),
  viewPanelOpen: initialViewPreferences.viewPanelOpen ?? true,
  toggleViewPanel: () => set((s) => {
    const nextViewPanelOpen = !s.viewPanelOpen;
    writeViewPreferences({ viewPanelOpen: nextViewPanelOpen });
    return { viewPanelOpen: nextViewPanelOpen };
  }),

  updateSketchConstraint: (objectId, constraintId, value) => {
    const current = get().lastValidResult;
    if (!current) return;
    const objects = current.objects.map((obj) => {
      if (obj.id !== objectId || !obj.sketch || !isConstraintSketch(obj.sketch)) return obj;
      const updated = updateConstraintValue(obj.sketch, constraintId, value);
      return { ...obj, sketch: updated, sketchMeta: updated.constraintMeta };
    });
    set({ lastValidResult: { ...current, objects } });
  },

  applyServerSnapshot: (serverFiles: Record<string, string>) => {
    const { files, savedFiles, activeFile, objectSettingsByFile } = get();

    const dirtyFiles = new Set<string>();
    Object.keys(files).forEach((p) => {
      if (!(p in savedFiles) || savedFiles[p] !== files[p]) dirtyFiles.add(p);
    });

    const nextFiles: Record<string, string> = {};
    const nextSaved: Record<string, string> = {};
    const newFolders = new Set<string>();

    Object.keys(serverFiles).forEach((p) => {
      if (dirtyFiles.has(p)) {
        nextFiles[p] = files[p];
        if (p in savedFiles) nextSaved[p] = savedFiles[p];
      } else {
        nextFiles[p] = serverFiles[p];
        nextSaved[p] = serverFiles[p];
      }
      collectParentPaths(p).forEach((folder) => newFolders.add(folder));
    });

    // Keep locally modified files that no longer exist on disk
    Object.keys(files).forEach((p) => {
      if (p in nextFiles || !dirtyFiles.has(p)) return;
      nextFiles[p] = files[p];
      if (p in savedFiles) nextSaved[p] = savedFiles[p];
      collectParentPaths(p).forEach((folder) => newFolders.add(folder));
    });

    // Inject shared model from URL (if any) so it survives server snapshots
    if (sharedModel) {
      nextFiles[sharedModel.filename] = sharedModel.code;
      nextSaved[sharedModel.filename] = sharedModel.code;
      collectParentPaths(sharedModel.filename).forEach((folder) => newFolders.add(folder));
    }

    const hashFile = getActiveFileFromHash();
    const availableFiles = Object.keys(nextFiles);
    const newActiveFile = sharedModel
      ? sharedModel.filename
      : (hashFile && nextFiles[hashFile])
        ? hashFile
        : (activeFile && nextFiles[activeFile]
          ? activeFile
          : (findPreferredEntryFile(availableFiles)
            || availableFiles.find((n) => n.endsWith('.js'))
            || availableFiles[0]));

    const nextDirty = Object.keys(nextFiles).some((p) => nextSaved[p] !== nextFiles[p]);
    const nextObjectSettingsByFile = Object.fromEntries(
      Object.entries(objectSettingsByFile).filter(([f]) => f in nextFiles),
    ) as ObjectSettingsByFile;
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });

    set({
      files: nextFiles,
      savedFiles: nextSaved,
      folders: Array.from(newFolders).sort(),
      activeFile: newActiveFile,
      dirty: nextDirty,
      objectSettingsByFile: nextObjectSettingsByFile,
    });

    if (newActiveFile && newActiveFile !== activeFile) {
      set({ paramOverrides: {}, lastValidResult: null });
      setParamOverrides({});
      window.history.replaceState(null, '', `#${newActiveFile}`);
      setTimeout(() => get().execute(), 0);
    } else {
      const previewFile = resolvePreviewFile(newActiveFile, nextFiles);
      if (previewFile && nextFiles[previewFile] !== files[previewFile]) {
        setTimeout(() => get().execute(), 0);
      }
    }
  },

  applyServerFileChange: (filename: string, content: string) => {
    const { files, savedFiles, activeFile } = get();
    const isDirty = filename in files && savedFiles[filename] !== files[filename];
    if (isDirty) return;
    if (files[filename] === content) return;
    const folders = new Set(get().folders);
    collectParentPaths(filename).forEach((f) => folders.add(f));
    const nextFiles = { ...files, [filename]: content };
    set({
      files: nextFiles,
      savedFiles: { ...savedFiles, [filename]: content },
      folders: Array.from(folders).sort(),
    });
    const previewFile = resolvePreviewFile(activeFile, nextFiles);
    if (previewFile === filename) setTimeout(() => get().execute(), 0);
  },

  applyServerFileDelete: (filename: string) => {
    const { files, savedFiles, activeFile, objectSettingsByFile } = get();
    const isDirty = filename in files && savedFiles[filename] !== files[filename];
    if (isDirty) return;
    if (!(filename in files)) return;
    const nextFiles = { ...files };
    const nextSaved = { ...savedFiles };
    delete nextFiles[filename];
    delete nextSaved[filename];
    const newFolders = new Set<string>();
    Object.keys(nextFiles).forEach((p) => collectParentPaths(p).forEach((f) => newFolders.add(f)));
    const availableFiles = Object.keys(nextFiles);
    const newActiveFile = activeFile === filename
      ? (findPreferredEntryFile(availableFiles) || availableFiles.find((n) => n.endsWith('.js')) || availableFiles[0])
      : activeFile;
    const nextObjectSettingsByFile = Object.fromEntries(
      Object.entries(objectSettingsByFile).filter(([f]) => f in nextFiles),
    ) as ObjectSettingsByFile;
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
    set({
      files: nextFiles,
      savedFiles: nextSaved,
      folders: Array.from(newFolders).sort(),
      activeFile: newActiveFile,
      dirty: Object.keys(nextFiles).some((p) => nextSaved[p] !== nextFiles[p]),
      objectSettingsByFile: nextObjectSettingsByFile,
    });
    if (newActiveFile && newActiveFile !== activeFile) {
      set({ paramOverrides: {}, lastValidResult: null });
      setParamOverrides({});
      window.history.replaceState(null, '', `#${newActiveFile}`);
      setTimeout(() => get().execute(), 0);
    }
  },

  theme: (localStorage.getItem('fc-theme') as ThemeName) || 'dark',
  setTheme: (name) => {
    applyTheme(name);
    localStorage.setItem('fc-theme', name);
    set({ theme: name });
  },

  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  fileSwitcherOpen: false,
  openFileSwitcher: () => set({ fileSwitcherOpen: true }),
  closeFileSwitcher: () => set({ fileSwitcherOpen: false }),

  shortcutsOverlayOpen: false,
  openShortcutsOverlay: () => set({ shortcutsOverlayOpen: true }),
  closeShortcutsOverlay: () => set({ shortcutsOverlayOpen: false }),

  editorNavigate: null,
  requestEditorNavigate: (line) => set((s) => ({ editorNavigate: { line, id: (s.editorNavigate?.id ?? 0) + 1 } })),
  clearEditorNavigate: () => set({ editorNavigate: null }),

  disableRunCache: initialViewPreferences.disableRunCache ?? false,
  setDisableRunCache: (disabled) => {
    writeViewPreferences({ disableRunCache: disabled });
    set({ disableRunCache: disabled });
  },
}));

// Wire up worker progress reporting → store evaluationPhase
evalWorkerClient.onProgress = (phase) => {
  useForgeStore.setState({ evaluationPhase: phase });
};

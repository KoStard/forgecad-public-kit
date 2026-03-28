import projectFiles from 'virtual:forge-project';
import {
  type ForgeQualityPreset,
  isConstraintSketch,
  type LogEntry,
  type ParamDef,
  type RunResult,
  resolveForgeQualityPreset,
  type SceneObject,
  updateConstraintValue,
} from '@forge/index';
import { setParamOverrides } from '@forge/params';
import type { LengthUnit } from '@forge/units';
import { create } from 'zustand';
import { clampAnimationSpeed } from '../animationSpeed';
import type { ViewportCameraState } from '../capture/cameraState';
import type { ShapeCompilePlan } from '../forge/compilePlan';
import { deserializeRunResult } from '../forge/deserializeRunResult';
import { publishSolverWasmRunDebug } from '../forge/sketch/constraints/solver-wasm';
import { fileSystem } from '../fs';
import { createNotebook, isNotebookFile, serializeNotebook } from '../notebook/model';
import { applyTheme, type ThemeName } from '../theme';
import { evalWorkerClient } from '../workers/evalWorkerClient';
import { lookupCache, storeCache } from './runResultCache';
import {
  INITIAL_FILES,
  INITIAL_FOLDERS,
  EMPTY_FILE,
  isModelFile,
  isRunnableFile,
  findPreferredEntryFile,
  STARTUP_HASH_FILE,
  sharedModel,
  sharedBundle,
  LAST_ACTIVE_FILE_KEY,
  normalizePath,
  getParentPath,
  resolvePreviewFile,
  collectParentPaths,
  movePath,
} from './fileHelpers';
import {
  type ObjectSettings,
  type ObjectSettingsMap,
  type ObjectSettingsByFile,
  DEFAULT_OBJECT_COLOR,
  getObjectSettingsForPreviewFile,
  setObjectSettingsForPreviewFile,
  remapObjectSettingsByFile,
  removeObjectSettingsForFile,
} from './objectSettings';
import {
  type ViewPreferencesState,
  clampJointValue,
  sanitizeAnimationProgress,
  createErrorRunResult,
  buildRunState,
  readViewPreferences,
  writeViewPreferences,
} from './executionHelpers';
import {
  computeServerSnapshot,
  postApplyServerSnapshot,
  computeServerFileChange,
  computeServerFileDelete,
} from './serverSync';

// ---------------------------------------------------------------------------
// Re-export sharedBundle/sharedModel for consumers that need them
export { sharedBundle, sharedModel };

const initialActive = (() => {
  if (sharedBundle) return sharedBundle.entry;
  if (sharedModel) return sharedModel.filename;
  const hashFile = STARTUP_HASH_FILE;
  if (hashFile && hashFile in INITIAL_FILES) {
    return hashFile;
  }
  // Restore last opened file from localStorage.
  // Do NOT replaceState here — the URL hash represents user intent and must be
  // preserved for computeServerSnapshot to read when the SSE init arrives
  // (in production builds INITIAL_FILES is empty until the server snapshot).
  try {
    const last = localStorage.getItem(LAST_ACTIVE_FILE_KEY);
    if (last && INITIAL_FILES[last]) {
      return last;
    }
  } catch {
    /* localStorage unavailable */
  }
  const names = Object.keys(INITIAL_FILES);
  const fallback =
    findPreferredEntryFile(names) || names.find((n) => n.endsWith('.js')) || names.find((n) => isNotebookFile(n)) || names[0];
  return fallback;
})();

const INITIAL_SAVED = projectFiles && Object.keys(projectFiles).length > 0 ? (projectFiles as Record<string, string>) : EMPTY_FILE;

export interface ProjectFile {
  name: string;
  code: string;
}

export type RenderMode = 'solid' | 'wireframe' | 'overlay';
export type ProjectionMode = 'perspective' | 'orthographic';

export type { ObjectSettings } from './objectSettings';

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

  /** When set, execute() renders this mesh file instead of the active script. Cleared on file switch or code edit. */
  meshPreviewFile: string | null;
  setMeshPreview: (meshPath: string | null) => void;
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

  applyServerSnapshot: (serverFiles: Record<string, string>, serverFolders?: string[]) => void;
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
      try {
        localStorage.setItem(LAST_ACTIVE_FILE_KEY, name);
      } catch {
        /* */
      }
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
    const restored = name && nextByFile[name] ? nextByFile[name] : {};
    set({
      activeFile: name,
      meshPreviewFile: null, // Clear mesh preview when switching files
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
    set((s) => ({ files: { ...s.files, [name]: code }, dirty: true, meshPreviewFile: null }));
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
      savedFiles: { ...s.savedFiles, [normalized]: template },
      activeFile: normalized,
      paramOverrides: {},
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
      folders: newFolders,
    }));
    fileSystem.save(normalized, template).catch((e) => console.error('Save failed:', e));
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
    fileSystem.mkdir(normalized).catch((e) => console.error('mkdir failed:', e));
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
    fileSystem.delete(name).catch((e) => console.error('Delete failed:', e));
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

    const remainingSaved = { ...savedFiles };
    delete remainingSaved[oldName];
    remainingSaved[normalized] = code;
    const nextObjectSettingsByFile = remapObjectSettingsByFile(objectSettingsByFile, oldName, normalized);
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });

    set({
      files: remaining,
      savedFiles: remainingSaved,
      activeFile: oldName === activeFile ? normalized : activeFile,
      objectSettingsByFile: nextObjectSettingsByFile,
      folders: Array.from(new Set([...get().folders, ...collectParentPaths(normalized)])).sort(),
    });
    fileSystem
      .delete(oldName)
      .then(() => fileSystem.save(normalized, code))
      .catch((e) => console.error('Rename persist failed:', e));
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
    const movedFiles: { oldKey: string; newKey: string; content: string }[] = [];
    Object.keys(savedFiles).forEach((key) => {
      if (key === normalizedOld || key.startsWith(`${normalizedOld}/`)) {
        const newKey = movePath(key, normalizedOld, normalizedNew);
        updatedSaved[newKey] = savedFiles[key];
        movedFiles.push({ oldKey: key, newKey, content: savedFiles[key] });
      } else {
        updatedSaved[key] = savedFiles[key];
      }
    });
    // Also persist any files that were in `files` but not in `savedFiles` (newly created, never saved)
    Object.keys(files).forEach((key) => {
      if ((key === normalizedOld || key.startsWith(`${normalizedOld}/`)) && !savedFiles[key]) {
        const newKey = movePath(key, normalizedOld, normalizedNew);
        updatedSaved[newKey] = files[key];
        movedFiles.push({ oldKey: key, newKey, content: files[key] });
      }
    });

    const updatedFolders = Array.from(
      new Set(folders.map((folder) => movePath(folder, normalizedOld, normalizedNew)).concat(collectParentPaths(normalizedNew))),
    ).sort();

    const nextActive = activeFile?.startsWith(`${normalizedOld}/`) ? movePath(activeFile, normalizedOld, normalizedNew) : activeFile;
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
    // Delete old files first, then save at new paths (ordering prevents watcher from re-adding old files)
    Promise.all(movedFiles.map(({ oldKey }) => fileSystem.delete(oldKey)))
      .then(() => Promise.all(movedFiles.map(({ newKey, content }) => fileSystem.save(newKey, content))))
      .catch((e) => console.error('Folder rename persist failed:', e));
    setTimeout(() => get().execute(), 0);
  },
  deleteFolder: (path) => {
    const normalized = normalizePath(path);
    if (!normalized) return;
    const { folders, files, savedFiles, activeFile, objectSettingsByFile } = get();
    if (!folders.includes(normalized)) return;
    const prefix = `${normalized}/`;

    // Remove all files inside this folder
    const remainingFiles: Record<string, string> = {};
    const remainingSaved: Record<string, string> = {};
    const deletedFiles: string[] = [];
    for (const key of Object.keys(files)) {
      if (key.startsWith(prefix)) {
        deletedFiles.push(key);
      } else {
        remainingFiles[key] = files[key];
      }
    }
    for (const key of Object.keys(savedFiles)) {
      if (!key.startsWith(prefix)) {
        remainingSaved[key] = savedFiles[key];
      }
    }

    // Ensure we still have at least one file
    if (Object.keys(remainingFiles).length === 0) return;

    // Remove this folder and all child folders
    const remainingFolders = folders.filter((f) => f !== normalized && !f.startsWith(prefix));

    // Pick a new active file if the current one was deleted
    const newActive = activeFile?.startsWith(prefix) ? Object.keys(remainingFiles)[0] : activeFile;

    let nextObjectSettingsByFile = objectSettingsByFile;
    for (const f of deletedFiles) {
      nextObjectSettingsByFile = removeObjectSettingsForFile(nextObjectSettingsByFile, f);
    }
    writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });

    set({
      files: remainingFiles,
      savedFiles: remainingSaved,
      folders: remainingFolders,
      activeFile: newActive,
      objectSettingsByFile: nextObjectSettingsByFile,
      paramOverrides: {},
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
    });
    for (const f of deletedFiles) {
      fileSystem.delete(f).catch((e) => console.error('Delete failed:', e));
    }
    setTimeout(() => get().execute(), 0);
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
    get().execute();
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
  meshPreviewFile: null,
  setMeshPreview: (meshPath) => {
    if (meshPath) {
      window.history.replaceState(null, '', `#${meshPath}`);
    }
    set({ meshPreviewFile: meshPath });
    if (meshPath) get().execute();
  },
  activeBackend: (initialViewPreferences.activeBackend as 'occt' | 'manifold') || 'manifold',
  setActiveBackend: (backend) => {
    writeViewPreferences({ activeBackend: backend });
    set({ activeBackend: backend });
    get().execute();
  },

  execute: async () => {
    const { files, activeFile, meshPreviewFile, runQuality, paramOverrides } = get();

    // Mesh preview mode: render a temporary importMesh() script
    let previewFile: string | null;
    let code: string | undefined;
    if (meshPreviewFile) {
      // Use the mesh file's directory as the script location so importMesh resolves correctly.
      // "./" prefix makes it resolve relative to the script (bare names resolve at project root).
      previewFile = meshPreviewFile.replace(/\.[^.]+$/, '.forge.js');
      const meshFileName = meshPreviewFile.split('/').pop() ?? meshPreviewFile;
      code = `return importMesh("./${meshFileName}");`;
    } else {
      previewFile = resolvePreviewFile(activeFile, files);
      if (!previewFile) {
        set({ result: null, lastValidResult: null, consoleLogs: [], params: [], previewFile: null, objectSettings: {} });
        return;
      }
      code = files[previewFile];
    }
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
    const nextByFile = previewKey ? { ...paramOverridesByFile, [previewKey]: overrides } : paramOverridesByFile;
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

  setJointValue: (name, value) =>
    set((state) => {
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

  setJointAnimationClip: (name) =>
    set((state) => {
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

  setJointAnimationProgress: (value) =>
    set({
      jointAnimationProgress: sanitizeAnimationProgress(
        value,
        get().result?.jointsView?.animations.find((clip) => clip.name === get().jointAnimationClip) ?? null,
      ),
    }),

  setJointAnimationPlaying: (playing) =>
    set((state) => {
      if (!playing) return { jointAnimationPlaying: false };
      const clips = state.lastValidResult?.jointsView?.enabled === false ? [] : (state.lastValidResult?.jointsView?.animations ?? []);
      if (clips.length === 0) return { jointAnimationPlaying: false };
      const clipName =
        state.jointAnimationClip && clips.some((clip) => clip.name === state.jointAnimationClip)
          ? state.jointAnimationClip
          : state.lastValidResult?.jointsView?.defaultAnimation &&
              clips.some((clip) => clip.name === state.lastValidResult?.jointsView?.defaultAnimation)
            ? state.lastValidResult?.jointsView?.defaultAnimation
            : clips[0].name;
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

  toggleJointAnimationPlayback: () =>
    set((state) => {
      if (state.jointAnimationPlaying) return { jointAnimationPlaying: false };
      const clips = state.lastValidResult?.jointsView?.enabled === false ? [] : (state.lastValidResult?.jointsView?.animations ?? []);
      if (clips.length === 0) return {};
      const clipName =
        state.jointAnimationClip && clips.some((clip) => clip.name === state.jointAnimationClip)
          ? state.jointAnimationClip
          : state.lastValidResult?.jointsView?.defaultAnimation &&
              clips.some((clip) => clip.name === state.lastValidResult?.jointsView?.defaultAnimation)
            ? state.lastValidResult?.jointsView?.defaultAnimation
            : clips[0].name;
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
  setObjectVisibility: (id, visible) =>
    set((s) => {
      const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
      const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, visible } };
      const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(s.objectSettingsByFile, s.previewFile, nextObjectSettings);
      writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
      return {
        objectSettings: nextObjectSettings,
        objectSettingsByFile: nextObjectSettingsByFile,
      };
    }),
  showAllObjects: () =>
    set((state) => {
      const objectMetaById = new Map((state.lastValidResult?.objects ?? []).map((obj) => [obj.id, obj]));
      const ids = new Set([...Object.keys(state.objectSettings), ...objectMetaById.keys()]);

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
      const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(state.objectSettingsByFile, state.previewFile, nextObjectSettings);
      writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
      return {
        objectSettings: nextObjectSettings,
        objectSettingsByFile: nextObjectSettingsByFile,
      };
    }),
  setObjectsVisibility: (ids, visible) =>
    set((s) => {
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
      const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(s.objectSettingsByFile, s.previewFile, nextObjectSettings);
      writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
      return {
        objectSettings: nextObjectSettings,
        objectSettingsByFile: nextObjectSettingsByFile,
      };
    }),
  setObjectOpacity: (id, opacity) =>
    set((s) => {
      const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
      const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, opacity } };
      const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(s.objectSettingsByFile, s.previewFile, nextObjectSettings);
      writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
      return {
        objectSettings: nextObjectSettings,
        objectSettingsByFile: nextObjectSettingsByFile,
      };
    }),
  setObjectColor: (id, color) =>
    set((s) => {
      const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
      const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, color } };
      const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(s.objectSettingsByFile, s.previewFile, nextObjectSettings);
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
  focusObject: (id, options) =>
    set((state) => {
      if (!id) return { focusedObjectIds: [] };
      if (!options?.additive) {
        return { focusedObjectIds: [id], selectedObjectId: id };
      }
      if (state.focusedObjectIds.includes(id)) {
        const nextFocusedObjectIds = state.focusedObjectIds.filter((focusedId) => focusedId !== id);
        return {
          focusedObjectIds: nextFocusedObjectIds,
          selectedObjectId:
            nextFocusedObjectIds.length > 0 ? nextFocusedObjectIds[nextFocusedObjectIds.length - 1] : state.selectedObjectId,
        };
      }
      return { focusedObjectIds: [...state.focusedObjectIds, id], selectedObjectId: id };
    }),
  clearFocusedObject: () => set({ focusedObjectIds: [] }),
  hoveredObjectId: null,
  setHoveredObjectId: (id) => set((state) => (state.hoveredObjectId === id ? state : { hoveredObjectId: id })),
  selectedConstraintId: null,
  setSelectedConstraintId: (id) =>
    set((state) => (state.selectedConstraintId === id ? { selectedConstraintId: null } : { selectedConstraintId: id })),
  hoveredSurfaceIndex: null,
  setHoveredSurfaceIndex: (index) => set((state) => (state.hoveredSurfaceIndex === index ? state : { hoveredSurfaceIndex: index })),
  selectedSurfaceIndex: null,
  setSelectedSurfaceIndex: (index) =>
    set((state) => (state.selectedSurfaceIndex === index ? { selectedSurfaceIndex: null } : { selectedSurfaceIndex: index })),
  selectedSketchEntityId: null,
  setSelectedSketchEntityId: (id) =>
    set((state) => (state.selectedSketchEntityId === id ? { selectedSketchEntityId: null } : { selectedSketchEntityId: id })),
  hoveredJointName: null,
  setHoveredJointName: (name) => set((state) => (state.hoveredJointName === name ? state : { hoveredJointName: name })),
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
  updateMeasurePoint: (id, index, pt) =>
    set((s) => ({
      measurements: s.measurements.map((m) => (m.id === id ? { ...m, points: m.points.map((p, i) => (i === index ? pt : p)) } : m)),
    })),
  removeMeasurement: (id) => set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
  clearMeasure: () => set({ measurements: [] }),
  measureSnapPx: initialViewPreferences.measureSnapPx ?? 12,
  setMeasureSnapPx: (value) => {
    writeViewPreferences({ measureSnapPx: value });
    set({ measureSnapPx: value });
  },

  dimensionsVisible: initialViewPreferences.dimensionsVisible ?? true,
  toggleDimensions: () =>
    set((s) => {
      const nextDimensionsVisible = !s.dimensionsVisible;
      writeViewPreferences({ dimensionsVisible: nextDimensionsVisible });
      return { dimensionsVisible: nextDimensionsVisible };
    }),

  surfacesVisible: initialViewPreferences.surfacesVisible ?? true,
  toggleSurfaces: () =>
    set((s) => {
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
  setCutPlaneEnabled: (name, enabled) =>
    set((s) => {
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
          savedFiles: { ...s.savedFiles, [activeFile]: code }, // This assumes we are satisfied with current content being "saved"
        }));
      } else {
        const mime = isNotebookFile(activeFile) ? 'application/json' : activeFile.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript';
        const blob = new Blob([code], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeFile;
        a.click();
        URL.revokeObjectURL(url);
        set((s) => ({
          dirty: false,
          savedFiles: { ...s.savedFiles, [activeFile]: code },
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
    fileSystem.save(normalized, text).catch((e) => console.error('Save failed:', e));
    setTimeout(() => get().execute(), 0);
  },

  kernelReady: false,
  setKernelReady: (v) => set({ kernelReady: v }),

  fileExplorerOpen: initialViewPreferences.fileExplorerOpen ?? true,
  toggleFileExplorer: () =>
    set((s) => {
      const nextFileExplorerOpen = !s.fileExplorerOpen;
      writeViewPreferences({ fileExplorerOpen: nextFileExplorerOpen });
      return { fileExplorerOpen: nextFileExplorerOpen };
    }),
  viewPanelOpen: initialViewPreferences.viewPanelOpen ?? true,
  toggleViewPanel: () =>
    set((s) => {
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

  applyServerSnapshot: (serverFiles: Record<string, string>, serverFolders?: string[]) => {
    const state = get();
    const prevFiles = state.files;
    const prevActiveFile = state.activeFile;
    const nextState = computeServerSnapshot(state, serverFiles, serverFolders, sharedModel, sharedBundle);
    set(nextState as any);
    postApplyServerSnapshot(
      prevActiveFile,
      nextState,
      nextState.files as Record<string, string>,
      prevFiles,
      () => get().execute(),
      (partial) => set(partial as any),
    );
  },

  applyServerFileChange: (filename: string, content: string) => {
    const state = get();
    const nextState = computeServerFileChange(state, filename, content);
    if (!nextState) return;
    set(nextState as any);
    const previewFile = resolvePreviewFile(state.activeFile, nextState.files as Record<string, string>);
    if (previewFile === filename) setTimeout(() => get().execute(), 0);
  },

  applyServerFileDelete: (filename: string) => {
    const state = get();
    const prevActiveFile = state.activeFile;
    const nextState = computeServerFileDelete(state, filename);
    if (!nextState) return;
    set(nextState as any);
    if (nextState.activeFile && nextState.activeFile !== prevActiveFile) {
      set({ paramOverrides: {}, lastValidResult: null } as any);
      setParamOverrides({});
      window.history.replaceState(null, '', `#${nextState.activeFile}`);
      try { localStorage.setItem(LAST_ACTIVE_FILE_KEY, nextState.activeFile); } catch { /* */ }
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

// Wire up worker progress reporting → store evaluationPhase.
// Export phases (export-evaluating, export-writing) are handled by the export
// timeout logic in evalWorkerClient and don't affect the UI status indicator.
evalWorkerClient.onProgress = (phase) => {
  if (phase === 'export-evaluating' || phase === 'export-writing') return;
  useForgeStore.setState({ evaluationPhase: phase });
};

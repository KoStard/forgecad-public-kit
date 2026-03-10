import { create } from 'zustand';
import {
  runScript,
  type ParamDef,
  type RunResult,
  type SceneObject,
  type LogEntry,
  type ForgeQualityPreset,
  resolveForgeQualityPreset,
  isConstraintSketch,
  updateConstraintValue,
} from '@forge/index';
import { setParamOverrides } from '@forge/params';
import projectFiles from 'virtual:forge-project';
import { isNotebookFile, parseNotebook, resolveNotebookPreviewCellId, serializeNotebook, createNotebook } from '../notebook/model';
import { runNotebook } from '../notebook/runtime';
import { type ThemeName, applyTheme } from '../theme';
import { clampAnimationSpeed } from '../animationSpeed';
import type { ViewportCameraState } from '../capture/cameraState';

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
  || name.endsWith('.sketch.js')
);
const isRunnableFile = isModelFile;
const findPreferredEntryFile = (names: string[]): string | null => (
  names.find((n) => isModelFile(n))
  || names.find((n) => isNotebookFile(n))
  || null
);

const getActiveFileFromHash = (): string | null => {
  const hash = window.location.hash.slice(1); // Remove the #
  return hash || null;
};

const initialActive = (() => {
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
  : {};

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
  consoleLogs: LogEntry[];
  params: ParamDef[];
  runQuality: ForgeQualityPreset;
  setRunQuality: (quality: ForgeQualityPreset) => void;
  paramOverrides: Record<string, number>;
  jointValues: Record<string, number>;
  jointAnimationClip: string | null;
  jointAnimationProgress: number;
  jointAnimationPlaying: boolean;
  jointAnimationSpeed: number;

  execute: () => void;
  setParam: (name: string, value: number) => void;
  setJointValue: (name: string, value: number) => void;
  setJointAnimationClip: (name: string | null) => void;
  setJointAnimationProgress: (value: number) => void;
  setJointAnimationPlaying: (playing: boolean) => void;
  setJointAnimationSpeed: (value: number) => void;
  toggleJointAnimationPlayback: () => void;

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
  objectSettings: Record<string, ObjectSettings>;
  setObjectVisibility: (id: string, visible: boolean) => void;
  showAllObjects: () => void;
  setObjectOpacity: (id: string, opacity: number) => void;
  setObjectColor: (id: string, color: string) => void;
  selectedObjectId: string | null;
  selectObject: (id: string | null) => void;
  focusedObjectIds: string[];
  focusObject: (id: string | null, options?: { additive?: boolean }) => void;
  clearFocusedObject: () => void;
  hoveredObjectId: string | null;
  setHoveredObjectId: (id: string | null) => void;
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
  measurements: Measurement[];
  addMeasurePoint: (pt: number[]) => void;
  updateMeasurePoint: (id: string, index: number, pt: number[]) => void;
  removeMeasurement: (id: string) => void;
  clearMeasure: () => void;
  measureSnapPx: number;
  setMeasureSnapPx: (value: number) => void;

  dimensionsVisible: boolean;
  toggleDimensions: () => void;

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

  refreshFiles: () => Promise<void>;

  theme: ThemeName;
  setTheme: (name: ThemeName) => void;

  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;

  fileSwitcherOpen: boolean;
  openFileSwitcher: () => void;
  closeFileSwitcher: () => void;
}

interface ViewPreferencesState {
  runQuality: ForgeQualityPreset;
  renderMode: RenderMode;
  projectionMode: ProjectionMode;
  gridEnabled: boolean;
  gridSize: number;
  showPerformanceInfo: boolean;
  objectSettings: Record<string, ObjectSettings>;
  objectPickSyncEnabled: boolean;
  measureSnapPx: number;
  dimensionsVisible: boolean;
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
}

const DEFAULT_OBJECT_COLOR = '#5b9bd5';
const VIEW_PREFERENCES_KEY = 'fc-view-preferences-v1';

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
    bom: [],
    cutPlanes: [],
    explodeView: null,
    jointsView: null,
    viewConfig: null,
    quality,
    error: message,
    timeMs: 0,
    logs: [{ level: 'error', args: [message], timestamp: Date.now() }],
  };
}

function runNotebookPreview(
  fileName: string,
  source: string,
  files: Record<string, string>,
  quality: ForgeQualityPreset,
): RunResult {
  try {
    const notebook = parseNotebook(source);
    const targetCellId = resolveNotebookPreviewCellId(notebook);
    return runNotebook(notebook, fileName, files, {
      quality,
      targetCellId,
    }).displayResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorRunResult(message, quality);
  }
}

function buildRunState(
  runResult: RunResult,
  state: Pick<
    ForgeStore,
    | 'objectSettings'
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
    state.objectSettings,
    state.selectedObjectId,
    state.focusedObjectIds,
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
      objectSettings: synced.settings,
      selectedObjectId: synced.selectedObjectId,
      focusedObjectIds: synced.focusedObjectIds,
      cutPlaneEnabled: nextCutPlaneEnabled,
    },
    nextCutPlaneEnabled,
    nextObjectSettings: synced.settings,
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
    localStorage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
};

const initialViewPreferences = readViewPreferences();

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
    set({
      activeFile: name,
      paramOverrides: {},
      jointValues: {},
      jointAnimationClip: null,
      jointAnimationProgress: 0,
      jointAnimationPlaying: false,
      hoveredJointName: null,
    });
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
      : normalized.endsWith('.sketch.js')
        ? '// 2D Sketch\n\nreturn rect(50, 30, true);\n'
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
    const { files, savedFiles, activeFile } = get();
    const remaining = { ...files };
    delete remaining[name];
    const remainingSaved = { ...savedFiles };
    delete remainingSaved[name];
    const names = Object.keys(remaining);
    if (names.length === 0) return;
    const newActive = name === activeFile ? names[0] : activeFile;
    set({
      files: remaining,
      savedFiles: remainingSaved,
      activeFile: newActive,
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
    const { files, savedFiles, activeFile } = get();
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

    set({
      files: remaining,
      savedFiles: remainingSaved,
      activeFile: oldName === activeFile ? normalized : activeFile,
      folders: Array.from(new Set([...get().folders, ...collectParentPaths(normalized)])).sort(),
    });
  },
  renameFolder: (oldPath, newPath) => {
    const normalizedOld = normalizePath(oldPath);
    const normalizedNew = normalizePath(newPath);
    if (!normalizedOld || !normalizedNew) return;
    if (normalizedOld === normalizedNew) return;
    const { files, savedFiles, activeFile, folders } = get();
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

    set({
      files: updatedFiles,
      savedFiles: updatedSaved,
      folders: updatedFolders,
      activeFile: nextActive,
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
  consoleLogs: [],
  params: [],
  runQuality: resolveForgeQualityPreset(initialViewPreferences.runQuality ?? 'live'),
  setRunQuality: (quality) => {
    const next = resolveForgeQualityPreset(quality);
    writeViewPreferences({ runQuality: next });
    set({ runQuality: next });
  },
  paramOverrides: {},
  jointValues: {},
  jointAnimationClip: null,
  jointAnimationProgress: 0,
  jointAnimationPlaying: false,
  jointAnimationSpeed: clampAnimationSpeed(initialViewPreferences.jointAnimationSpeed ?? 1),

  execute: () => {
    const {
      files,
      activeFile,
      runQuality,
    } = get();
    const previewFile = resolvePreviewFile(activeFile, files);
    if (!previewFile) {
      set({ result: null, consoleLogs: [], params: [] });
      return;
    }
    const code = files[previewFile];
    if (!code) return;
    setParamOverrides(get().paramOverrides);
    const runResult = isNotebookFile(previewFile)
      ? runNotebookPreview(previewFile, code, files, runQuality)
      : runScript(code, previewFile, files, { quality: runQuality });
    const applied = buildRunState(runResult, get());
    set(applied.nextState);
    writeViewPreferences({ objectSettings: applied.nextObjectSettings, cutPlaneEnabled: applied.nextCutPlaneEnabled });
  },

  setParam: (name, value) => {
    const overrides = { ...get().paramOverrides, [name]: value };
    set({ paramOverrides: overrides });
    setParamOverrides(overrides);
    const {
      files,
      activeFile,
      runQuality,
    } = get();
    const previewFile = resolvePreviewFile(activeFile, files);
    if (!previewFile) {
      set({ result: null, consoleLogs: [], params: [] });
      return;
    }
    const code = files[previewFile];
    if (!code) return;
    const runResult = isNotebookFile(previewFile)
      ? runNotebookPreview(previewFile, code, files, runQuality)
      : runScript(code, previewFile, files, { quality: runQuality });
    const applied = buildRunState(runResult, get());
    set(applied.nextState);
    writeViewPreferences({ objectSettings: applied.nextObjectSettings, cutPlaneEnabled: applied.nextCutPlaneEnabled });
  },

  setJointValue: (name, value) => set((state) => {
    const joints = state.result?.jointsView?.enabled === false ? [] : (state.result?.jointsView?.joints ?? []);
    const couplings = state.result?.jointsView?.enabled === false ? [] : (state.result?.jointsView?.couplings ?? []);
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
    const clips = state.result?.jointsView?.enabled === false ? [] : (state.result?.jointsView?.animations ?? []);
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
    const clips = state.result?.jointsView?.enabled === false ? [] : (state.result?.jointsView?.animations ?? []);
    if (clips.length === 0) return { jointAnimationPlaying: false };
    const clipName = state.jointAnimationClip
      && clips.some((clip) => clip.name === state.jointAnimationClip)
      ? state.jointAnimationClip
      : (state.result?.jointsView?.defaultAnimation && clips.some((clip) => clip.name === state.result?.jointsView?.defaultAnimation)
        ? state.result?.jointsView?.defaultAnimation
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
    const clips = state.result?.jointsView?.enabled === false ? [] : (state.result?.jointsView?.animations ?? []);
    if (clips.length === 0) return {};
    const clipName = state.jointAnimationClip
      && clips.some((clip) => clip.name === state.jointAnimationClip)
      ? state.jointAnimationClip
      : (state.result?.jointsView?.defaultAnimation && clips.some((clip) => clip.name === state.result?.jointsView?.defaultAnimation)
        ? state.result?.jointsView?.defaultAnimation
        : clips[0].name);
    return {
      jointAnimationClip: clipName,
      jointAnimationPlaying: true,
    };
  }),

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
  objectSettings: initialViewPreferences.objectSettings ?? {},
  setObjectVisibility: (id, visible) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, visible } };
    writeViewPreferences({ objectSettings: nextObjectSettings });
    return { objectSettings: nextObjectSettings };
  }),
  showAllObjects: () => set((state) => {
    const objectMetaById = new Map((state.result?.objects ?? []).map((obj) => [obj.id, obj]));
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

    writeViewPreferences({ objectSettings: nextObjectSettings });
    return { objectSettings: nextObjectSettings };
  }),
  setObjectOpacity: (id, opacity) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, opacity } };
    writeViewPreferences({ objectSettings: nextObjectSettings });
    return { objectSettings: nextObjectSettings };
  }),
  setObjectColor: (id, color) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    const nextObjectSettings = { ...s.objectSettings, [id]: { ...current, color } };
    writeViewPreferences({ objectSettings: nextObjectSettings });
    return { objectSettings: nextObjectSettings };
  }),
  selectedObjectId: null,
  selectObject: (id) => set({ selectedObjectId: id }),
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
    set((s) => ({ measureMode: !s.measureMode }));
  },
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
    set({
      files: { ...INITIAL_FILES },
      savedFiles: { ...INITIAL_SAVED },
      folders: [],
      activeFile: initialActive,
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
    const { fileHandle, files, activeFile } = get();

    // Try API endpoint first (for project directories)
    try {
      const response = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: activeFile, content: files[activeFile] }),
      });
      if (response.ok) {
        set((s) => ({ 
          dirty: false,
          savedFiles: { ...s.savedFiles, [activeFile]: files[activeFile] }
        }));
        return;
      }
    } catch (e) {
      // Fall through to file handle
    }

    // Fall back to File System Access API
    if (!fileHandle) return;
    try {
      const writable = await (fileHandle as any).createWritable();
      await writable.write(files[activeFile]);
      await writable.close();
      set((s) => ({ 
        dirty: false,
        savedFiles: { ...s.savedFiles, [activeFile]: files[activeFile] }
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
            { description: 'ForgeCAD scripts', accept: { 'text/javascript': ['.forge.js', '.sketch.js', '.js'] } },
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
    const current = get().result;
    if (!current) return;
    const objects = current.objects.map((obj) => {
      if (obj.id !== objectId || !obj.sketch || !isConstraintSketch(obj.sketch)) return obj;
      const updated = updateConstraintValue(obj.sketch, constraintId, value);
      return { ...obj, sketch: updated, sketchMeta: updated.constraintMeta };
    });
    set({ result: { ...current, objects } });
  },

  refreshFiles: async () => {
    try {
      const response = await fetch('/api/files');
      if (!response.ok) {
        console.error('Failed to refresh files:', response.statusText);
        return;
      }
      const serverFiles: Record<string, string> = await response.json();
      const { files, savedFiles, activeFile } = get();

      const dirtyFiles = new Set<string>();
      Object.keys(files).forEach((path) => {
        if (!(path in savedFiles) || savedFiles[path] !== files[path]) {
          dirtyFiles.add(path);
        }
      });

      const nextFiles: Record<string, string> = {};
      const nextSaved: Record<string, string> = {};
      const newFolders = new Set<string>();

      Object.keys(serverFiles).forEach((path) => {
        if (dirtyFiles.has(path)) {
          nextFiles[path] = files[path];
          if (path in savedFiles) nextSaved[path] = savedFiles[path];
        } else {
          nextFiles[path] = serverFiles[path];
          nextSaved[path] = serverFiles[path];
        }
        collectParentPaths(path).forEach((folder) => newFolders.add(folder));
      });

      // Keep locally modified files that no longer exist on disk
      Object.keys(files).forEach((path) => {
        if (path in nextFiles) return;
        if (!dirtyFiles.has(path)) return;
        nextFiles[path] = files[path];
        if (path in savedFiles) nextSaved[path] = savedFiles[path];
        collectParentPaths(path).forEach((folder) => newFolders.add(folder));
      });

      const hashFile = getActiveFileFromHash();
      const availableFiles = Object.keys(nextFiles);
      const newActiveFile = (hashFile && nextFiles[hashFile])
        ? hashFile
        : (activeFile && nextFiles[activeFile]
          ? activeFile
          : (findPreferredEntryFile(availableFiles)
            || availableFiles.find((n) => n.endsWith('.js'))
            || availableFiles[0]));

      const nextDirty = Object.keys(nextFiles).some((path) => nextSaved[path] !== nextFiles[path]);

      set({
        files: nextFiles,
        savedFiles: nextSaved,
        folders: Array.from(newFolders).sort(),
        activeFile: newActiveFile,
        dirty: nextDirty,
      });

      if (newActiveFile && newActiveFile !== activeFile) {
        window.history.replaceState(null, '', `#${newActiveFile}`);
        setTimeout(() => get().execute(), 0);
      }
    } catch (e) {
      console.error('Error refreshing files:', e);
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
}));

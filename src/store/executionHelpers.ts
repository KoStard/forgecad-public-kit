/**
 * Joint animation, run-state sync, and error-result helpers for the forge store.
 */

import type { ForgeQualityPreset, RunResult } from '@forge/index';
import type { LengthUnit } from '@forge/units';
import type { RenderMode, ProjectionMode } from './forgeStore';
import {
  type ObjectSettings,
  type ObjectSettingsMap,
  type ObjectSettingsByFile,
  getObjectSettingsForPreviewFile,
  setObjectSettingsForPreviewFile,
  syncObjectSettings,
  syncCutPlaneEnabled,
} from './objectSettings';

export const VIEW_PREFERENCES_KEY = 'fc-view-preferences-v1';

export interface ViewPreferencesState {
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
  /** Interactive section explorer state. */
  sectionExplorerEnabled: boolean;
  sectionExplorerNormal: [number, number, number];
  sectionExplorerOffset: number;
  sectionExplorerFlip: boolean;
}

export const clampJointValue = (value: number, min?: number, max?: number): number => {
  let next = Number.isFinite(value) ? value : 0;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};

export const clampAnimationProgress = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

export const sanitizeAnimationProgress = (value: number, clip?: { loop: boolean; continuous?: boolean } | null): number => {
  if (!Number.isFinite(value)) return 0;
  if (clip?.loop && clip.continuous) return Math.max(0, value);
  return clampAnimationProgress(value);
};

export const syncJointValues = (result: RunResult, prev: Record<string, number>): Record<string, number> => {
  const joints = result.jointsView?.enabled === false ? [] : (result.jointsView?.joints ?? []);
  const next: Record<string, number> = {};
  joints.forEach((joint) => {
    const raw = prev[joint.name] ?? joint.defaultValue;
    next[joint.name] = clampJointValue(raw, joint.min, joint.max);
  });
  return next;
};

export const syncHoveredJointName = (result: RunResult, hoveredJointName: string | null): string | null => {
  if (!hoveredJointName) return null;
  const joints = result.jointsView?.enabled === false ? [] : (result.jointsView?.joints ?? []);
  return joints.some((joint) => joint.name === hoveredJointName) ? hoveredJointName : null;
};

export interface JointAnimationState {
  clip: string | null;
  progress: number;
  playing: boolean;
}

export const syncJointAnimationState = (
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

  const activeClip = clip ? (clips.find((entry) => entry.name === clip) ?? null) : null;
  const progress = previousStillValid ? sanitizeAnimationProgress(prevProgress, activeClip) : 0;
  const playing = clip ? prevPlaying : false;
  return { clip, progress, playing };
};

export function createErrorRunResult(message: string, quality: ForgeQualityPreset): RunResult {
  // `satisfies RunResult` ensures a compile error if RunResult gains a new
  // required field — prevents the silent-null bug that hit sceneConfig.
  return {
    shape: null,
    sketch: null,
    objects: [],
    params: [],
    dimensions: [],
    highlights: [],
    debugHighlights3D: [],
    bom: [],
    sheetStock: [],
    cutPlanes: [],
    explodeView: null,
    jointsView: null,
    viewConfig: null,
    sceneConfig: null,
    robotExport: null,
    quality,
    error: message,
    timeMs: 0,
    logs: [{ level: 'error', args: [message], timestamp: Date.now() }],
    verifications: [],
  } satisfies RunResult;
}

interface BuildRunStateInput {
  objectSettingsByFile: ObjectSettingsByFile;
  selectedObjectId: string | null;
  focusedObjectIds: string[];
  cutPlaneEnabled: Record<string, boolean>;
  jointValues: Record<string, number>;
  jointAnimationClip: string | null;
  jointAnimationProgress: number;
  jointAnimationPlaying: boolean;
  hoveredJointName: string | null;
}

export function buildRunState(previewFile: string | null, runResult: RunResult, state: BuildRunStateInput) {
  const synced = syncObjectSettings(
    runResult.objects,
    getObjectSettingsForPreviewFile(state.objectSettingsByFile, previewFile),
    state.selectedObjectId,
    state.focusedObjectIds,
  );
  const nextObjectSettingsByFile = setObjectSettingsForPreviewFile(state.objectSettingsByFile, previewFile, synced.settings);
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

export const readViewPreferences = (): Partial<ViewPreferencesState> => {
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

export const writeViewPreferences = (patch: Partial<ViewPreferencesState>): void => {
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

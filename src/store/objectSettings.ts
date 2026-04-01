/**
 * Object visibility / opacity / color settings helpers for the forge store.
 */

import type { SceneObject } from '@forge/index';

export interface ObjectSettings {
  visible: boolean;
  opacity: number;
  color: string;
}

export type ObjectSettingsMap = Record<string, ObjectSettings>;
export type ObjectSettingsByFile = Record<string, ObjectSettingsMap>;

export const DEFAULT_OBJECT_COLOR = '#5b9bd5';

export const getObjectSettingsForPreviewFile = (
  objectSettingsByFile: ObjectSettingsByFile,
  previewFile: string | null,
): ObjectSettingsMap => {
  if (!previewFile) return {};
  return objectSettingsByFile[previewFile] ?? {};
};

export const setObjectSettingsForPreviewFile = (
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

export const remapObjectSettingsByFile = (objectSettingsByFile: ObjectSettingsByFile, from: string, to: string): ObjectSettingsByFile => {
  let changed = false;
  const next: ObjectSettingsByFile = {};
  Object.entries(objectSettingsByFile).forEach(([file, settings]) => {
    const mapped = movePath(file, from, to);
    if (mapped !== file) changed = true;
    next[mapped] = settings;
  });
  return changed ? next : objectSettingsByFile;
};

export const removeObjectSettingsForFile = (objectSettingsByFile: ObjectSettingsByFile, file: string): ObjectSettingsByFile => {
  if (!(file in objectSettingsByFile)) return objectSettingsByFile;
  const next = { ...objectSettingsByFile };
  delete next[file];
  return next;
};

export const syncObjectSettings = (
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
  const nextSelected = objects.length === 0 ? null : selectedObjectId && ids.has(selectedObjectId) ? selectedObjectId : objects[0].id;
  const nextFocused = focusedObjectIds.filter((id) => ids.has(id));
  return { settings: nextSettings, selectedObjectId: nextSelected, focusedObjectIds: nextFocused };
};

export const syncCutPlaneEnabled = (cutPlanes: { name: string }[], prevEnabled: Record<string, boolean>): Record<string, boolean> => {
  const next: Record<string, boolean> = {};
  cutPlanes.forEach((cp) => {
    next[cp.name] = prevEnabled[cp.name] ?? false;
  });
  return next;
};

// movePath is duplicated here to avoid a circular import with fileHelpers.
// objectSettings is a pure data module that must not depend on file I/O utilities.
function movePath(value: string, from: string, to: string): string {
  if (value === from) return to;
  if (value.startsWith(`${from}/`)) return `${to}${value.slice(from.length)}`;
  return value;
}

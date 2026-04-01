/**
 * Server sync helpers for useForgeStore.
 * Extracted from forgeStore.ts to keep the main store file under control.
 *
 * These are pure functions that compute next state from current state + server payload.
 * The store wires them up to set() / get().
 */

import { setParamOverrides } from '@forge/params';
import { findPreferredEntryFile, STARTUP_HASH_FILE, LAST_ACTIVE_FILE_KEY, collectParentPaths, resolvePreviewFile } from './fileHelpers';
import { type ObjectSettingsByFile, removeObjectSettingsForFile } from './objectSettings';
import { writeViewPreferences } from './executionHelpers';

// Forward-declare the minimal store shape needed so this file doesn't need to
// import the full ForgeStore (which would create a circular dep).
export interface ServerSyncStoreSlice {
  files: Record<string, string>;
  savedFiles: Record<string, string>;
  folders: string[];
  activeFile: string;
  objectSettingsByFile: ObjectSettingsByFile;
  paramOverrides: Record<string, number>;
  lastValidResult: unknown;
}

interface SharedModel {
  filename: string;
  code: string;
}
interface SharedBundle {
  entry: string;
  files: Record<string, string>;
}

const MESH_EXTS = ['.stl', '.obj', '.3mf'];

/**
 * Compute the next store state after receiving a full file snapshot from the server.
 * Returns a partial state object ready to pass to set().
 */
export function computeServerSnapshot(
  state: ServerSyncStoreSlice,
  serverFiles: Record<string, string>,
  serverFolders: string[] | undefined,
  sharedModel: SharedModel | null,
  sharedBundle: SharedBundle | null,
  initialFile?: string,
): Partial<ServerSyncStoreSlice> & {
  meshPreviewFile: string | null;
  dirty: boolean;
} {
  const { files, savedFiles, activeFile, objectSettingsByFile } = state;

  const dirtyFiles = new Set<string>();
  Object.keys(files).forEach((p) => {
    if (!(p in savedFiles) || savedFiles[p] !== files[p]) dirtyFiles.add(p);
  });

  const nextFiles: Record<string, string> = {};
  const nextSaved: Record<string, string> = {};
  const newFolders = new Set<string>();
  if (serverFolders) serverFolders.forEach((f) => newFolders.add(f));

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

  // Inject shared bundle files from URL (if any) so they survive server snapshots
  if (sharedBundle) {
    for (const [name, code] of Object.entries(sharedBundle.files)) {
      nextFiles[name] = code;
      nextSaved[name] = code;
      collectParentPaths(name).forEach((folder) => newFolders.add(folder));
    }
  }

  const hashFile = STARTUP_HASH_FILE;
  const availableFiles = Object.keys(nextFiles);

  const isMeshHash = hashFile && MESH_EXTS.some((ext) => hashFile.toLowerCase().endsWith(ext));
  const meshPreviewFile = isMeshHash && nextFiles[hashFile] !== undefined ? hashFile : null;

  const newActiveFile = sharedBundle
    ? sharedBundle.entry
    : sharedModel
      ? sharedModel.filename
      : hashFile && !isMeshHash && nextFiles[hashFile] !== undefined
        ? hashFile
        : initialFile && nextFiles[initialFile] !== undefined
          ? initialFile
          : activeFile && nextFiles[activeFile]
            ? activeFile
            : findPreferredEntryFile(availableFiles) || availableFiles.find((n) => n.endsWith('.js')) || availableFiles[0];

  const nextDirty = Object.keys(nextFiles).some((p) => nextSaved[p] !== nextFiles[p]);
  const nextObjectSettingsByFile = Object.fromEntries(
    Object.entries(objectSettingsByFile).filter(([f]) => f in nextFiles),
  ) as ObjectSettingsByFile;
  writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });

  return {
    files: nextFiles,
    savedFiles: nextSaved,
    folders: Array.from(newFolders).sort(),
    activeFile: newActiveFile,
    meshPreviewFile,
    dirty: nextDirty,
    objectSettingsByFile: nextObjectSettingsByFile,
  };
}

/**
 * Side-effects after applyServerSnapshot: navigate URL and trigger re-execute.
 */
export function postApplyServerSnapshot(
  prevActiveFile: string,
  newState: ReturnType<typeof computeServerSnapshot>,
  files: Record<string, string>,
  prevFiles: Record<string, string>,
  execute: () => void,
  setSlice: (partial: Partial<ServerSyncStoreSlice>) => void,
): void {
  const { activeFile: newActiveFile, meshPreviewFile } = newState;
  if (meshPreviewFile) {
    setTimeout(execute, 0);
  } else if (newActiveFile && newActiveFile !== prevActiveFile) {
    setSlice({ paramOverrides: {}, lastValidResult: null });
    setParamOverrides({});
    window.history.replaceState(null, '', `#${newActiveFile}`);
    try {
      localStorage.setItem(LAST_ACTIVE_FILE_KEY, newActiveFile);
    } catch {
      /* */
    }
    setTimeout(execute, 0);
  } else {
    const previewFile = newActiveFile ? resolvePreviewFile(newActiveFile, files) : null;
    if (previewFile && files[previewFile] !== prevFiles[previewFile]) {
      setTimeout(execute, 0);
    }
  }
}

/**
 * Compute next state for a single file change from the server.
 */
export function computeServerFileChange(
  state: ServerSyncStoreSlice,
  filename: string,
  content: string,
): Partial<ServerSyncStoreSlice> | null {
  const { files, savedFiles } = state;
  const isDirty = filename in files && savedFiles[filename] !== files[filename];
  if (isDirty) return null;
  if (files[filename] === content) return null;
  const folders = new Set(state.folders);
  collectParentPaths(filename).forEach((f) => folders.add(f));
  return {
    files: { ...files, [filename]: content },
    savedFiles: { ...savedFiles, [filename]: content },
    folders: Array.from(folders).sort(),
  };
}

/**
 * Compute next state for a file deletion reported by the server.
 */
export function computeServerFileDelete(
  state: ServerSyncStoreSlice,
  filename: string,
): (Partial<ServerSyncStoreSlice> & { dirty: boolean }) | null {
  const { files, savedFiles, activeFile, objectSettingsByFile } = state;
  const isDirty = filename in files && savedFiles[filename] !== files[filename];
  if (isDirty) return null;
  if (!(filename in files)) return null;
  const nextFiles = { ...files };
  const nextSaved = { ...savedFiles };
  delete nextFiles[filename];
  delete nextSaved[filename];
  const newFolders = new Set<string>();
  Object.keys(nextFiles).forEach((p) => collectParentPaths(p).forEach((f) => newFolders.add(f)));
  const availableFiles = Object.keys(nextFiles);
  const newActiveFile =
    activeFile === filename
      ? findPreferredEntryFile(availableFiles) || availableFiles.find((n) => n.endsWith('.js')) || availableFiles[0]
      : activeFile;
  const nextObjectSettingsByFile = Object.fromEntries(
    Object.entries(objectSettingsByFile).filter(([f]) => f in nextFiles),
  ) as ObjectSettingsByFile;
  writeViewPreferences({ objectSettingsByFile: nextObjectSettingsByFile });
  return {
    files: nextFiles,
    savedFiles: nextSaved,
    folders: Array.from(newFolders).sort(),
    activeFile: newActiveFile,
    dirty: Object.keys(nextFiles).some((p) => nextSaved[p] !== nextFiles[p]),
    objectSettingsByFile: nextObjectSettingsByFile,
  };
}

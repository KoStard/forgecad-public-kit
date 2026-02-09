import { create } from 'zustand';
import { runScript, type ParamDef, type RunResult, type SceneObject } from '@forge/index';
import { setParamOverrides } from '@forge/params';
import projectFiles from 'virtual:forge-project';

const EMPTY_FILE: Record<string, string> = {
  'untitled.forge.js': '// New part\n\nreturn box(50, 30, 10);\n',
};

const INITIAL_FILES = projectFiles && Object.keys(projectFiles).length > 0
  ? projectFiles as Record<string, string>
  : EMPTY_FILE;

const initialActive = (() => {
  const names = Object.keys(INITIAL_FILES);
  return names.find((n) => n.endsWith('.forge.js')) || names[0];
})();

const INITIAL_SAVED = projectFiles && Object.keys(projectFiles).length > 0
  ? projectFiles as Record<string, string>
  : {};

export interface ProjectFile {
  name: string;
  code: string;
}

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
  activeFile: string;
  setActiveFile: (name: string) => void;
  updateFileCode: (name: string, code: string) => void;
  createFile: (name: string) => void;
  deleteFile: (name: string) => void;
  renameFile: (oldName: string, newName: string) => void;

  dirty: boolean;

  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (h: FileSystemFileHandle | null) => void;

  result: RunResult | null;
  params: ParamDef[];
  paramOverrides: Record<string, number>;

  execute: () => void;
  setParam: (name: string, value: number) => void;

  renderMode: RenderMode;
  setRenderMode: (mode: RenderMode) => void;
  projectionMode: ProjectionMode;
  setProjectionMode: (mode: ProjectionMode) => void;
  gridEnabled: boolean;
  gridSize: number;
  setGridEnabled: (enabled: boolean) => void;
  setGridSize: (size: number) => void;
  objectSettings: Record<string, ObjectSettings>;
  setObjectVisibility: (id: string, visible: boolean) => void;
  setObjectOpacity: (id: string, opacity: number) => void;
  setObjectColor: (id: string, color: string) => void;
  selectedObjectId: string | null;
  selectObject: (id: string | null) => void;
  viewCommand: ViewCommand | null;
  requestViewCommand: (command: Omit<ViewCommand, 'id'>) => void;
  clearViewCommand: () => void;

  measureMode: boolean;
  toggleMeasure: () => void;
  measurements: Measurement[];
  addMeasurePoint: (pt: number[]) => void;
  updateMeasurePoint: (id: string, index: number, pt: number[]) => void;
  removeMeasurement: (id: string) => void;
  clearMeasure: () => void;
  measureSnapPx: number;
  setMeasureSnapPx: (value: number) => void;

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
}

const DEFAULT_OBJECT_COLOR = '#5b9bd5';

const syncObjectSettings = (
  objects: SceneObject[],
  prevSettings: Record<string, ObjectSettings>,
  selectedObjectId: string | null,
): { settings: Record<string, ObjectSettings>; selectedObjectId: string | null } => {
  const nextSettings: Record<string, ObjectSettings> = { ...prevSettings };
  const ids = new Set(objects.map((obj) => obj.id));
  Object.keys(nextSettings).forEach((id) => {
    if (!ids.has(id)) delete nextSettings[id];
  });
  objects.forEach((obj) => {
    if (!nextSettings[obj.id]) {
      nextSettings[obj.id] = { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    }
  });
  const nextSelected = objects.length === 0
    ? null
    : (selectedObjectId && ids.has(selectedObjectId) ? selectedObjectId : objects[0].id);
  return { settings: nextSettings, selectedObjectId: nextSelected };
};

export const useForgeStore = create<ForgeStore>((set, get) => ({
  files: { ...INITIAL_FILES },
  savedFiles: { ...INITIAL_SAVED },
  activeFile: initialActive,
  setActiveFile: (name) => {
    set({ activeFile: name, paramOverrides: {} });
    setTimeout(() => get().execute(), 0);
  },
  updateFileCode: (name, code) => {
    set((s) => ({ files: { ...s.files, [name]: code }, dirty: true }));
  },
  createFile: (name) => {
    const isSketch = name.endsWith('.sketch.js');
    const template = isSketch
      ? '// 2D Sketch\n\nreturn rect(50, 30, true);\n'
      : '// 3D Part\n\nreturn box(50, 30, 10);\n';
    set((s) => ({
      files: { ...s.files, [name]: template },
      activeFile: name,
      paramOverrides: {},
    }));
    setTimeout(() => get().execute(), 0);
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
    set({ files: remaining, savedFiles: remainingSaved, activeFile: newActive, paramOverrides: {} });
    setTimeout(() => get().execute(), 0);
  },
  renameFile: (oldName, newName) => {
    const { files, savedFiles, activeFile } = get();
    const code = files[oldName];
    if (!code) return;
    const remaining = { ...files };
    delete remaining[oldName];
    remaining[newName] = code;
    
    // Note: We do NOT update savedFiles with the new name because it hasn't been saved to disk yet
    // But we should remove the old name from savedFiles
    const remainingSaved = { ...savedFiles };
    delete remainingSaved[oldName];

    set({
      files: remaining,
      savedFiles: remainingSaved,
      activeFile: oldName === activeFile ? newName : activeFile,
    });
  },

  dirty: false,

  fileHandle: null,
  setFileHandle: (fileHandle) => set({ fileHandle }),

  result: null,
  params: [],
  paramOverrides: {},

  execute: () => {
    const { files, activeFile, paramOverrides } = get();
    const code = files[activeFile];
    if (!code) return;
    setParamOverrides(paramOverrides);
    const runResult = runScript(code, activeFile, files);
    const synced = syncObjectSettings(runResult.objects, get().objectSettings, get().selectedObjectId);
    set({ result: runResult, params: runResult.params, objectSettings: synced.settings, selectedObjectId: synced.selectedObjectId });
  },

  setParam: (name, value) => {
    const overrides = { ...get().paramOverrides, [name]: value };
    set({ paramOverrides: overrides });
    setParamOverrides(overrides);
    const { files, activeFile } = get();
    const code = files[activeFile];
    if (!code) return;
    const runResult = runScript(code, activeFile, files);
    const synced = syncObjectSettings(runResult.objects, get().objectSettings, get().selectedObjectId);
    set({ result: runResult, params: runResult.params, objectSettings: synced.settings, selectedObjectId: synced.selectedObjectId });
  },

  renderMode: 'overlay',
  setRenderMode: (mode) => set({ renderMode: mode }),
  projectionMode: 'perspective',
  setProjectionMode: (mode) => set({ projectionMode: mode }),
  gridEnabled: true,
  gridSize: 10,
  setGridEnabled: (enabled) => set({ gridEnabled: enabled }),
  setGridSize: (size) => set({ gridSize: size }),
  objectSettings: {},
  setObjectVisibility: (id, visible) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    return { objectSettings: { ...s.objectSettings, [id]: { ...current, visible } } };
  }),
  setObjectOpacity: (id, opacity) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    return { objectSettings: { ...s.objectSettings, [id]: { ...current, opacity } } };
  }),
  setObjectColor: (id, color) => set((s) => {
    const current = s.objectSettings[id] ?? { visible: true, opacity: 1, color: DEFAULT_OBJECT_COLOR };
    return { objectSettings: { ...s.objectSettings, [id]: { ...current, color } } };
  }),
  selectedObjectId: null,
  selectObject: (id) => set({ selectedObjectId: id }),
  viewCommand: null,
  requestViewCommand: (command) => set({ viewCommand: { ...command, id: Date.now() } }),
  clearViewCommand: () => set({ viewCommand: null }),

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
  measureSnapPx: 12,
  setMeasureSnapPx: (value) => set({ measureSnapPx: value }),

  newProject: () => {
    set({
      files: { ...INITIAL_FILES },
      savedFiles: { ...INITIAL_SAVED },
      activeFile: initialActive,
      fileHandle: null,
      dirty: false,
      paramOverrides: {},
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
          types: [{ description: 'ForgeCAD files', accept: { 'text/javascript': ['.forge.js', '.sketch.js', '.js'] } }],
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
        const blob = new Blob([code], { type: 'text/javascript' });
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
    set((s) => ({
      files: { ...s.files, [name]: text },
      // When loading from text, we assume it's like opening a file, so it's "saved" state initially?
      // Or is it a drop?
      // If it's a drop, it's like opening.
      // So we should update savedFiles.
      savedFiles: { ...s.savedFiles, [name]: text },
      activeFile: name,
      fileHandle: null,
      dirty: false,
      paramOverrides: {},
    }));
    setTimeout(() => get().execute(), 0);
  },

  kernelReady: false,
  setKernelReady: (v) => set({ kernelReady: v }),

  fileExplorerOpen: true,
  toggleFileExplorer: () => set((s) => ({ fileExplorerOpen: !s.fileExplorerOpen })),
  viewPanelOpen: true,
  toggleViewPanel: () => set((s) => ({ viewPanelOpen: !s.viewPanelOpen })),
}));

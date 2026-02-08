import { create } from 'zustand';
import { runScript, type ParamDef, type RunResult } from '@forge/index';
import { setParamOverrides } from '@forge/params';

const DEFAULT_PROJECT: Record<string, string> = {
  'bracket-profile.sketch.js': `// 2D Sketch: L-bracket profile
// This sketch defines the cross-section of a mounting bracket.

const w = param("Width", 40, { min: 20, max: 80, unit: "mm" });
const h = param("Height", 30, { min: 15, max: 60, unit: "mm" });
const t = param("Thickness", 5, { min: 2, max: 12, unit: "mm" });

// L-shape profile
const outer = polygon([
  [0, 0], [w, 0], [w, t],
  [t, t], [t, h], [0, h]
]);

return outer;
`,
  'bracket.forge.js': `// 3D Part: Mounting Bracket
// Imports the 2D profile and extrudes it into a 3D bracket with holes.

const profile = importSketch("bracket-profile.sketch.js");
const depth = param("Depth", 60, { min: 30, max: 120, unit: "mm" });
const holeDia = param("Hole Diameter", 6, { min: 3, max: 12, unit: "mm" });

// Extrude the 2D profile into 3D
const body = profile.extrude(depth);

// Drill mounting holes
const hole1 = cylinder(depth + 2, holeDia / 2)
  .rotate(90, 0, 0)
  .translate(20, depth / 2, 2.5);

const hole2 = cylinder(10, holeDia / 2)
  .translate(2.5, depth / 2, 20);

return body.subtract(hole1).subtract(hole2);
`,
};

export interface ProjectFile {
  name: string;
  code: string;
}

interface ForgeStore {
  // Project files
  files: Record<string, string>;
  activeFile: string;
  setActiveFile: (name: string) => void;
  updateFileCode: (name: string, code: string) => void;
  createFile: (name: string) => void;
  deleteFile: (name: string) => void;
  renameFile: (oldName: string, newName: string) => void;

  // Editor
  dirty: boolean;

  // File handle (File System Access API)
  fileHandle: FileSystemFileHandle | null;
  setFileHandle: (h: FileSystemFileHandle | null) => void;

  // Execution result
  result: RunResult | null;
  params: ParamDef[];
  paramOverrides: Record<string, number>;

  // Actions
  execute: () => void;
  setParam: (name: string, value: number) => void;

  // Measurement
  measureMode: boolean;
  toggleMeasure: () => void;
  measurePoints: number[][];
  addMeasurePoint: (pt: number[]) => void;
  clearMeasure: () => void;

  // File operations
  newProject: () => void;
  saveFile: () => Promise<void>;
  saveFileAs: () => Promise<void>;
  loadFromText: (text: string, name: string) => void;

  // UI state
  kernelReady: boolean;
  setKernelReady: (v: boolean) => void;
  fileExplorerOpen: boolean;
  toggleFileExplorer: () => void;
}

export const useForgeStore = create<ForgeStore>((set, get) => ({
  files: { ...DEFAULT_PROJECT },
  activeFile: 'bracket.forge.js',
  setActiveFile: (name) => {
    set({ activeFile: name, paramOverrides: {} });
    // Re-execute with new active file
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
    const { files, activeFile } = get();
    const remaining = { ...files };
    delete remaining[name];
    const names = Object.keys(remaining);
    if (names.length === 0) return; // don't delete last file
    const newActive = name === activeFile ? names[0] : activeFile;
    set({ files: remaining, activeFile: newActive, paramOverrides: {} });
    setTimeout(() => get().execute(), 0);
  },
  renameFile: (oldName, newName) => {
    const { files, activeFile } = get();
    const code = files[oldName];
    if (!code) return;
    const remaining = { ...files };
    delete remaining[oldName];
    remaining[newName] = code;
    set({
      files: remaining,
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
    const result = runScript(code, activeFile, files);
    set({ result, params: result.params });
  },

  setParam: (name, value) => {
    const overrides = { ...get().paramOverrides, [name]: value };
    set({ paramOverrides: overrides });
    setParamOverrides(overrides);
    const { files, activeFile } = get();
    const code = files[activeFile];
    if (!code) return;
    const result = runScript(code, activeFile, files);
    set({ result, params: result.params });
  },

  // --- Measurement ---
  measureMode: false,
  toggleMeasure: () => {
    set((s) => ({ measureMode: !s.measureMode, measurePoints: [] }));
  },
  measurePoints: [],
  addMeasurePoint: (pt) => {
    const pts = get().measurePoints;
    set({ measurePoints: pts.length >= 2 ? [pt] : [...pts, pt] });
  },
  clearMeasure: () => set({ measurePoints: [], measureMode: false }),

  // --- File operations ---
  newProject: () => {
    set({
      files: { ...DEFAULT_PROJECT },
      activeFile: 'bracket.forge.js',
      fileHandle: null,
      dirty: false,
      paramOverrides: {},
    });
    setTimeout(() => get().execute(), 0);
  },

  saveFile: async () => {
    const { fileHandle, files, activeFile } = get();
    if (!fileHandle) return;
    try {
      const writable = await (fileHandle as any).createWritable();
      await writable.write(files[activeFile]);
      await writable.close();
      set({ dirty: false });
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
        set({ fileHandle: handle, dirty: false });
      } else {
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = activeFile;
        a.click();
        URL.revokeObjectURL(url);
        set({ dirty: false });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('Save failed:', e);
    }
  },

  loadFromText: (text, name) => {
    set((s) => ({
      files: { ...s.files, [name]: text },
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
}));

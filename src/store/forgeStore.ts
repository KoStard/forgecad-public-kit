import { create } from 'zustand';
import { runScript, type ParamDef, type RunResult } from '@forge/index';
import { setParamOverrides } from '@forge/params';
import { EXAMPLE_PHONE_STAND } from '../examples/defaults';

interface ForgeStore {
  // Editor
  code: string;
  setCode: (code: string) => void;
  fileName: string;
  setFileName: (name: string) => void;
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
  newFile: () => void;
  openFile: () => Promise<void>;
  saveFile: () => Promise<void>;
  saveFileAs: () => Promise<void>;
  loadFromText: (text: string, name: string) => void;

  // UI state
  kernelReady: boolean;
  setKernelReady: (v: boolean) => void;
}

export const useForgeStore = create<ForgeStore>((set, get) => ({
  code: EXAMPLE_PHONE_STAND,
  setCode: (code) => set({ code, dirty: true }),
  fileName: 'untitled.forge.js',
  setFileName: (fileName) => set({ fileName }),
  dirty: false,

  fileHandle: null,
  setFileHandle: (fileHandle) => set({ fileHandle }),

  result: null,
  params: [],
  paramOverrides: {},

  execute: () => {
    const { code, paramOverrides } = get();
    setParamOverrides(paramOverrides);
    const result = runScript(code);
    set({ result, params: result.params });
  },

  setParam: (name, value) => {
    const overrides = { ...get().paramOverrides, [name]: value };
    set({ paramOverrides: overrides });
    setParamOverrides(overrides);
    const result = runScript(get().code);
    set({ result, params: result.params });
  },

  // --- Measurement ---
  measureMode: false,
  toggleMeasure: () => {
    const { measureMode } = get();
    set({ measureMode: !measureMode, measurePoints: [] });
  },
  measurePoints: [],
  addMeasurePoint: (pt) => {
    const pts = get().measurePoints;
    if (pts.length >= 2) {
      // Start new measurement
      set({ measurePoints: [pt] });
    } else {
      set({ measurePoints: [...pts, pt] });
    }
  },
  clearMeasure: () => set({ measurePoints: [], measureMode: false }),

  // --- File operations ---
  newFile: () => {
    set({
      code: '// New ForgeCAD file\n\nreturn box(50, 30, 10);\n',
      fileName: 'untitled.forge.js',
      fileHandle: null,
      dirty: false,
      paramOverrides: {},
    });
    get().execute();
  },

  openFile: async () => {
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'ForgeCAD files',
              accept: { 'text/javascript': ['.forge.js', '.js'] },
            },
          ],
        });
        const file = await handle.getFile();
        const text = await file.text();
        set({
          code: text,
          fileName: file.name,
          fileHandle: handle,
          dirty: false,
          paramOverrides: {},
        });
        get().execute();
      } else {
        // Fallback: file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.js,.forge.js';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const text = await file.text();
          set({
            code: text,
            fileName: file.name,
            fileHandle: null,
            dirty: false,
            paramOverrides: {},
          });
          get().execute();
        };
        input.click();
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('Open failed:', e);
    }
  },

  saveFile: async () => {
    const { fileHandle, code, fileName } = get();
    if (fileHandle) {
      try {
        const writable = await (fileHandle as any).createWritable();
        await writable.write(code);
        await writable.close();
        set({ dirty: false });
        return;
      } catch {
        // Fall through to saveAs
      }
    }
    get().saveFileAs();
  },

  saveFileAs: async () => {
    const { code, fileName } = get();
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'ForgeCAD files',
              accept: { 'text/javascript': ['.forge.js', '.js'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(code);
        await writable.close();
        set({ fileHandle: handle, fileName: handle.name, dirty: false });
      } else {
        // Fallback: download
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        set({ dirty: false });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') console.error('Save failed:', e);
    }
  },

  loadFromText: (text, name) => {
    set({
      code: text,
      fileName: name,
      fileHandle: null,
      dirty: false,
      paramOverrides: {},
    });
    get().execute();
  },

  kernelReady: false,
  setKernelReady: (v) => set({ kernelReady: v }),
}));

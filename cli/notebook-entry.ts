import { readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { exportNotebookToForgeScript } from '../src/notebook/export';

const NOTEBOOK_FILE_EXTENSION = '.forge-notebook.json';

export interface MaterializedCliInput {
  originalPath: string;
  runnablePath: string;
  didMaterialize: boolean;
  cleanup: () => void;
}

export function isNotebookCliInputPath(inputPath: string): boolean {
  return inputPath.endsWith(NOTEBOOK_FILE_EXTENSION);
}

export function replaceRenderableInputExtension(inputPath: string, replacement: string): string {
  if (inputPath.endsWith(NOTEBOOK_FILE_EXTENSION)) {
    return `${inputPath.slice(0, -NOTEBOOK_FILE_EXTENSION.length)}${replacement}`;
  }
  if (/\.(forge\.)?js$/i.test(inputPath)) {
    return inputPath.replace(/\.(forge\.)?js$/i, replacement);
  }
  return `${inputPath}${replacement}`;
}

export function materializeNotebookPreviewScript(inputPath: string): MaterializedCliInput {
  const originalPath = resolve(inputPath);
  if (!isNotebookCliInputPath(originalPath)) {
    return {
      originalPath,
      runnablePath: originalPath,
      didMaterialize: false,
      cleanup: () => {},
    };
  }

  const notebookText = readFileSync(originalPath, 'utf-8');
  const scriptText = exportNotebookToForgeScript(notebookText, originalPath);
  const notebookBase = basename(originalPath, NOTEBOOK_FILE_EXTENSION);
  const tempPath = join(dirname(originalPath), `.${notebookBase}.forge-cli-preview-${process.pid}-${Date.now()}.forge.js`);
  writeFileSync(tempPath, scriptText, 'utf-8');

  let cleaned = false;
  return {
    originalPath,
    runnablePath: tempPath,
    didMaterialize: true,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      rmSync(tempPath, { force: true });
    },
  };
}

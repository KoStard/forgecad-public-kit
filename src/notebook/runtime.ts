import { runScript, type ForgeQualityPreset, type RunResult } from '../forge/index';
import { compileNotebookProgram } from './compiler';
import { type ForgeNotebook } from './model';

export interface NotebookRunResults {
  cellResult: RunResult;
  displayResult: RunResult;
  targetCellId: string | null;
}

export function runNotebook(
  notebook: ForgeNotebook,
  fileName: string,
  allFiles: Record<string, string>,
  options: {
    quality: ForgeQualityPreset;
    targetCellId?: string | null;
  },
): NotebookRunResults {
  const cellProgram = compileNotebookProgram(notebook, {
    mode: 'cell',
    targetCellId: options.targetCellId,
  });
  const displayProgram = compileNotebookProgram(notebook, {
    mode: 'display',
    targetCellId: options.targetCellId,
  });

  return {
    cellResult: runScript(cellProgram.code, fileName, allFiles, {
      quality: options.quality,
      allowEmptyResult: true,
    }),
    displayResult: runScript(displayProgram.code, fileName, allFiles, {
      quality: options.quality,
      allowEmptyResult: true,
    }),
    targetCellId: displayProgram.targetCellId,
  };
}

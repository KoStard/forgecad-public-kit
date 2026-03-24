import { compileNotebookProgram } from './compiler';
import { parseNotebook } from './model';

export function notebookDefaultScriptPath(notebookPath: string): string {
  if (notebookPath.endsWith('.forge-notebook.json')) {
    return notebookPath.slice(0, -'.forge-notebook.json'.length) + '.forge.js';
  }
  return `${notebookPath}.forge.js`;
}

export function exportNotebookToForgeScript(notebookText: string, notebookPath: string): string {
  const notebook = parseNotebook(notebookText);
  const compiled = compileNotebookProgram(notebook, { mode: 'display' });
  const sourceName = notebookPath.replace(/\\/g, '/').split('/').pop() ?? notebookPath;

  return [
    `// Generated from ${sourceName}`,
    '// ForgeCAD notebook export',
    '//',
    '// This script preserves notebook preview behavior:',
    '// - cells execute top-to-bottom',
    '// - show(value) pins the visible result',
    '// - the final return matches the notebook preview cell',
    '',
    compiled.code.trimEnd(),
    '',
  ].join('\n');
}

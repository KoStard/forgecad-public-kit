import * as ts from 'typescript';
import { cellSourceToString, resolveNotebookPreviewCellId, type ForgeNotebook } from './model';

const NOTEBOOK_STATE = '__forgeNotebookState';

export interface CompileNotebookOptions {
  mode?: 'cell' | 'display';
  targetCellId?: string | null;
}

export interface CompiledNotebookProgram {
  code: string;
  targetCellId: string | null;
}

function compileNotebookCellSource(source: string, cellId: string): string {
  const sourceFile = ts.createSourceFile(`forge-notebook-${cellId}.js`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const statements = [...sourceFile.statements];
  if (statements.length === 0) {
    return `${source}${source.endsWith('\n') || source.length === 0 ? '' : '\n'}${NOTEBOOK_STATE}.lastValue = undefined;\n`;
  }

  const topLevelReturns = statements.filter((statement): statement is ts.ReturnStatement => ts.isReturnStatement(statement));
  if (topLevelReturns.length > 1 || (topLevelReturns.length === 1 && statements[statements.length - 1] !== topLevelReturns[0])) {
    throw new Error(`Notebook cell ${cellId} may only use top-level return as its last statement.`);
  }

  const last = statements[statements.length - 1];
  const before = source.slice(0, last.getFullStart());
  const leading = source.slice(last.getFullStart(), last.getStart(sourceFile));

  if (ts.isExpressionStatement(last)) {
    const expression = source.slice(last.expression.getStart(sourceFile), last.expression.getEnd());
    return `${before}${leading}${NOTEBOOK_STATE}.lastValue = (${expression});\n`;
  }

  if (ts.isReturnStatement(last)) {
    const expression = last.expression
      ? source.slice(last.expression.getStart(sourceFile), last.expression.getEnd())
      : 'undefined';
    return `${before}${leading}${NOTEBOOK_STATE}.lastValue = (${expression});\n`;
  }

  return `${source}${source.endsWith('\n') ? '' : '\n'}${NOTEBOOK_STATE}.lastValue = undefined;\n`;
}

export function compileNotebookProgram(
  notebook: ForgeNotebook,
  options: CompileNotebookOptions = {},
): CompiledNotebookProgram {
  const targetCellId = resolveNotebookPreviewCellId(notebook, options.targetCellId);
  const targetIndex = targetCellId ? notebook.cells.findIndex((cell) => cell.id === targetCellId) : -1;
  const executedCells = targetIndex >= 0 ? notebook.cells.slice(0, targetIndex + 1) : [];

  const chunks: string[] = [
    '"use strict";',
    `const ${NOTEBOOK_STATE} = globalThis.${NOTEBOOK_STATE} ?? { display: undefined, lastValue: undefined };`,
    `globalThis.${NOTEBOOK_STATE} = ${NOTEBOOK_STATE};`,
    `${NOTEBOOK_STATE}.display = undefined;`,
    `${NOTEBOOK_STATE}.lastValue = undefined;`,
    'const show = (value) => {',
    `  ${NOTEBOOK_STATE}.display = value;`,
    `  ${NOTEBOOK_STATE}.lastValue = value;`,
    '  return value;',
    '};',
    'const display = show;',
    'const clearDisplay = () => {',
    `  ${NOTEBOOK_STATE}.display = undefined;`,
    `  ${NOTEBOOK_STATE}.lastValue = undefined;`,
    '};',
    'const __forgeNotebookIsNamedObject = (value) => {',
    "  if (!value || typeof value !== 'object') return false;",
    '  if (!(\'name\' in value)) return false;',
    "  return ('shape' in value) || ('sketch' in value) || ('group' in value);",
    '};',
    'const __forgeNotebookIsRenderableArray = (value) => (',
    '  Array.isArray(value)',
    '  && value.every((entry) => (',
    '    entry instanceof Shape',
    '    || entry instanceof Sketch',
    '    || entry instanceof TrackedShape',
    '    || entry instanceof ShapeGroup',
    '    || __forgeNotebookIsNamedObject(entry)',
    '  ))',
    ');',
    'const __forgeNotebookIsRenderable = (value) => (',
    '  value instanceof Shape',
    '  || value instanceof Sketch',
    '  || value instanceof TrackedShape',
    '  || value instanceof ShapeGroup',
    '  || __forgeNotebookIsRenderableArray(value)',
    ');',
  ];

  executedCells.forEach((cell, index) => {
    const source = cellSourceToString(cell.source);
    chunks.push(`\n// Notebook cell ${index + 1}: ${cell.id}`);
    chunks.push(compileNotebookCellSource(source, cell.id));
    chunks.push(`if (__forgeNotebookIsRenderable(${NOTEBOOK_STATE}.lastValue)) ${NOTEBOOK_STATE}.display = ${NOTEBOOK_STATE}.lastValue;`);
  });

  chunks.push(
    options.mode === 'cell'
      ? `return ${NOTEBOOK_STATE}.lastValue;`
      : `return ${NOTEBOOK_STATE}.display ?? ${NOTEBOOK_STATE}.lastValue;`,
  );

  return {
    code: `${chunks.join('\n')}\n`,
    targetCellId,
  };
}

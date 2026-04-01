import {
  cellSourceToString,
  type ForgeNotebook,
  type ForgeNotebookCell,
  type ForgeNotebookOutput,
  resolveNotebookPreviewCellId,
} from './model';

export interface RenderNotebookForTerminalOptions {
  filename?: string;
  cellSpecifier?: string | null;
}

interface SelectedNotebookCell {
  cell: ForgeNotebookCell;
  index: number;
}

function splitTextLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (normalized.length === 0) return [];
  const parts = normalized.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function flattenTextChunks(chunks: string[]): string[] {
  const lines = chunks.flatMap((chunk) => splitTextLines(String(chunk)));
  return lines.length > 0 ? lines : [''];
}

function renderIndentedLines(lines: string[]): string[] {
  return lines.length > 0 ? lines.map((line) => `  ${line}`) : ['  (empty)'];
}

function renderSourceBlock(cell: ForgeNotebookCell): string[] {
  const lines = splitTextLines(cellSourceToString(cell.source));
  if (lines.length === 0) return ['Source:', '  (empty)'];
  const width = String(lines.length).length;
  return ['Source:', ...lines.map((line, index) => `  ${String(index + 1).padStart(width)} | ${line}`)];
}

function renderOutputBlock(output: ForgeNotebookOutput, index: number): string[] {
  if (output.output_type === 'stream') {
    return [`Output ${index + 1} [${output.name}]:`, ...renderIndentedLines(flattenTextChunks(output.text))];
  }

  if (output.output_type === 'display_data') {
    return [`Output ${index + 1} [display]:`, ...renderIndentedLines(flattenTextChunks(output.data['text/plain']))];
  }

  const errorLines = output.traceback.length > 0 ? flattenTextChunks(output.traceback) : [output.evalue];
  return [`Output ${index + 1} [error]:`, ...renderIndentedLines(errorLines)];
}

function resolveSelectedCells(notebook: ForgeNotebook, cellSpecifier?: string | null): SelectedNotebookCell[] {
  if (!cellSpecifier) {
    return notebook.cells.map((cell, index) => ({ cell, index }));
  }

  const previewCellId = resolveNotebookPreviewCellId(notebook);
  if (cellSpecifier === 'preview') {
    const previewIndex = notebook.cells.findIndex((cell) => cell.id === previewCellId);
    if (previewIndex === -1) {
      throw new Error('Notebook has no preview cell.');
    }
    return [{ cell: notebook.cells[previewIndex], index: previewIndex }];
  }

  if (/^\d+$/.test(cellSpecifier)) {
    const index = Number.parseInt(cellSpecifier, 10) - 1;
    const cell = notebook.cells[index];
    if (!cell) {
      throw new Error(`Notebook has ${notebook.cells.length} cell(s); cannot view cell ${cellSpecifier}.`);
    }
    return [{ cell, index }];
  }

  const index = notebook.cells.findIndex((cell) => cell.id === cellSpecifier);
  if (index === -1) {
    throw new Error(`Notebook does not contain cell "${cellSpecifier}". Use a 1-based cell number, exact cell id, or "preview".`);
  }
  return [{ cell: notebook.cells[index], index }];
}

function renderCell(notebook: ForgeNotebook, selected: SelectedNotebookCell): string {
  const previewCellId = resolveNotebookPreviewCellId(notebook);
  const tags = [
    selected.cell.id === previewCellId ? 'preview' : null,
    selected.cell.execution_count == null ? 'not run' : `run ${selected.cell.execution_count}`,
  ].filter(Boolean);

  const sections = [
    `Cell ${selected.index + 1}${tags.length > 0 ? ` [${tags.join(', ')}]` : ''}`,
    `Id: ${selected.cell.id}`,
    ...renderSourceBlock(selected.cell),
  ];

  if (selected.cell.outputs.length === 0) {
    sections.push('Outputs:', '  (none)');
  } else {
    selected.cell.outputs.forEach((output, outputIndex) => {
      sections.push('', ...renderOutputBlock(output, outputIndex));
    });
  }

  return sections.join('\n');
}

export function renderNotebookForTerminal(notebook: ForgeNotebook, options: RenderNotebookForTerminalOptions = {}): string {
  const selectedCells = resolveSelectedCells(notebook, options.cellSpecifier);
  const previewCellId = resolveNotebookPreviewCellId(notebook);
  const previewIndex = notebook.cells.findIndex((cell) => cell.id === previewCellId);

  const header = [
    options.filename ? `Notebook: ${options.filename}` : 'Notebook',
    notebook.metadata.forgecad.title ? `Title: ${notebook.metadata.forgecad.title}` : null,
    `Cells: ${notebook.cells.length}`,
    previewCellId ? `Preview: Cell ${previewIndex + 1} (${previewCellId})` : 'Preview: none',
    !options.cellSpecifier && selectedCells.length === notebook.cells.length
      ? 'Selection: all cells'
      : `Selection: Cell ${selectedCells[0].index + 1} (${selectedCells[0].cell.id})`,
  ].filter((value): value is string => Boolean(value));

  return [
    ...header,
    '',
    ...selectedCells.map((selected, index) =>
      index === 0 ? renderCell(notebook, selected) : ['-'.repeat(72), renderCell(notebook, selected)].join('\n'),
    ),
    '',
  ].join('\n');
}

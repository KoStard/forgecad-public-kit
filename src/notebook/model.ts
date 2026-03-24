export const NOTEBOOK_FILE_EXTENSION = '.forge-notebook.json';
export const NOTEBOOK_FORMAT = 'forgecad-notebook/v1';

export interface NotebookExecutionSummary {
  objectCount: number;
  paramNames: string[];
  timeMs: number;
  error: string | null;
}

export interface ForgeNotebookStreamOutput {
  output_type: 'stream';
  name: 'stdout' | 'stderr';
  text: string[];
}

export interface ForgeNotebookDisplayOutput {
  output_type: 'display_data';
  data: {
    'text/plain': string[];
    'application/vnd.forgecad.summary+json'?: NotebookExecutionSummary;
  };
  metadata: Record<string, unknown>;
}

export interface ForgeNotebookErrorOutput {
  output_type: 'error';
  ename: string;
  evalue: string;
  traceback: string[];
}

export type ForgeNotebookOutput = ForgeNotebookStreamOutput | ForgeNotebookDisplayOutput | ForgeNotebookErrorOutput;

export interface ForgeNotebookCell {
  cell_type: 'code';
  execution_count: number | null;
  id: string;
  metadata: Record<string, unknown>;
  outputs: ForgeNotebookOutput[];
  source: string[];
}

export interface ForgeNotebookMetadata {
  forgecad: {
    format: typeof NOTEBOOK_FORMAT;
    previewCellId: string | null;
    title?: string | null;
  };
  kernelspec: {
    display_name: 'ForgeCAD';
    language: 'javascript';
    name: 'forgecad';
  };
  language_info: {
    name: 'javascript';
    file_extension: '.js';
    mimetype: 'text/javascript';
  };
  [key: string]: unknown;
}

export interface ForgeNotebook {
  cells: ForgeNotebookCell[];
  metadata: ForgeNotebookMetadata;
  nbformat: 4;
  nbformat_minor: 5;
}

function createCellId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `forge-cell-${Math.random().toString(36).slice(2, 10)}`;
}

export function isNotebookFile(name: string): boolean {
  return name.endsWith(NOTEBOOK_FILE_EXTENSION);
}

export function cellSourceToString(source: string[] | string): string {
  return Array.isArray(source) ? source.join('') : source;
}

export function stringToCellSource(source: string): string[] {
  if (!source) return [];
  const lines = source.match(/[^\n]*\n|[^\n]+/g);
  return lines ?? [];
}

export function createNotebookCell(source = ''): ForgeNotebookCell {
  return {
    cell_type: 'code',
    execution_count: null,
    id: createCellId(),
    metadata: {},
    outputs: [],
    source: stringToCellSource(source),
  };
}

export function createNotebook(initialSource = 'show(box(50, 30, 10));\n'): ForgeNotebook {
  const cell = createNotebookCell(initialSource);
  return {
    cells: [cell],
    metadata: {
      forgecad: {
        format: NOTEBOOK_FORMAT,
        previewCellId: cell.id,
      },
      kernelspec: {
        display_name: 'ForgeCAD',
        language: 'javascript',
        name: 'forgecad',
      },
      language_info: {
        name: 'javascript',
        file_extension: '.js',
        mimetype: 'text/javascript',
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

function normalizeOutputs(value: unknown): ForgeNotebookOutput[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<ForgeNotebookOutput[]>((acc, entry) => {
    if (!entry || typeof entry !== 'object') return acc;
    const output = entry as Partial<ForgeNotebookOutput>;
    if (output.output_type === 'stream') {
      acc.push({
        output_type: 'stream',
        name: output.name === 'stderr' ? 'stderr' : 'stdout',
        text: Array.isArray(output.text) ? output.text.map(String) : [],
      });
      return acc;
    }
    if (output.output_type === 'display_data') {
      const data = (output as Partial<ForgeNotebookDisplayOutput>).data;
      const text =
        data && typeof data === 'object' && 'text/plain' in data
          ? Array.isArray(data['text/plain'])
            ? data['text/plain'].map(String)
            : []
          : [];
      const summary =
        data && typeof data === 'object' && 'application/vnd.forgecad.summary+json' in data
          ? (data['application/vnd.forgecad.summary+json'] as NotebookExecutionSummary)
          : undefined;
      acc.push({
        output_type: 'display_data',
        data: {
          'text/plain': text,
          ...(summary ? { 'application/vnd.forgecad.summary+json': summary } : {}),
        },
        metadata:
          (output as Partial<ForgeNotebookDisplayOutput>).metadata &&
          typeof (output as Partial<ForgeNotebookDisplayOutput>).metadata === 'object'
            ? { ...(output as Partial<ForgeNotebookDisplayOutput>).metadata }
            : {},
      });
      return acc;
    }
    if (output.output_type === 'error') {
      acc.push({
        output_type: 'error',
        ename: typeof output.ename === 'string' ? output.ename : 'ForgeError',
        evalue: typeof output.evalue === 'string' ? output.evalue : 'Notebook execution failed',
        traceback: Array.isArray(output.traceback) ? output.traceback.map(String) : [],
      });
      return acc;
    }
    return acc;
  }, []);
}

function normalizeCell(value: unknown): ForgeNotebookCell {
  const raw = value && typeof value === 'object' ? (value as Partial<ForgeNotebookCell>) : {};
  return {
    cell_type: 'code',
    execution_count: typeof raw.execution_count === 'number' ? raw.execution_count : null,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createCellId(),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? { ...raw.metadata } : {},
    outputs: normalizeOutputs(raw.outputs),
    source: stringToCellSource(cellSourceToString(raw.source ?? '')),
  };
}

export function parseNotebook(text: string): ForgeNotebook {
  const parsed = JSON.parse(text) as Partial<ForgeNotebook>;
  const rawMetadata = parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {};
  const cells = Array.isArray(parsed.cells) ? parsed.cells.map(normalizeCell) : [];
  const firstCell = cells[0] ?? createNotebookCell();
  const normalizedCells = cells.length > 0 ? cells : [firstCell];
  const previewCellId =
    typeof parsed.metadata?.forgecad?.previewCellId === 'string' &&
    normalizedCells.some((cell) => cell.id === parsed.metadata?.forgecad?.previewCellId)
      ? parsed.metadata?.forgecad?.previewCellId
      : (normalizedCells[normalizedCells.length - 1]?.id ?? null);

  return {
    cells: normalizedCells,
    metadata: {
      ...rawMetadata,
      forgecad: {
        format: NOTEBOOK_FORMAT,
        previewCellId,
        title: typeof parsed.metadata?.forgecad?.title === 'string' ? parsed.metadata?.forgecad?.title : undefined,
      },
      kernelspec: {
        display_name: 'ForgeCAD',
        language: 'javascript',
        name: 'forgecad',
      },
      language_info: {
        name: 'javascript',
        file_extension: '.js',
        mimetype: 'text/javascript',
      },
    } as ForgeNotebookMetadata,
    nbformat: 4,
    nbformat_minor: 5,
  };
}

export function serializeNotebook(notebook: ForgeNotebook): string {
  return `${JSON.stringify(notebook, null, 2)}\n`;
}

export function resolveNotebookPreviewCellId(notebook: ForgeNotebook, preferredCellId?: string | null): string | null {
  if (preferredCellId && notebook.cells.some((cell) => cell.id === preferredCellId)) {
    return preferredCellId;
  }
  const previewCellId = notebook.metadata.forgecad.previewCellId;
  if (previewCellId && notebook.cells.some((cell) => cell.id === previewCellId)) {
    return previewCellId;
  }
  return notebook.cells[notebook.cells.length - 1]?.id ?? null;
}

export function upsertNotebookCellSource(notebook: ForgeNotebook, cellId: string, source: string): ForgeNotebook {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) =>
      cell.id === cellId
        ? {
            ...cell,
            source: stringToCellSource(source),
          }
        : cell,
    ),
  };
}

export function appendNotebookCell(
  notebook: ForgeNotebook,
  source = '',
  afterCellId?: string | null,
): { notebook: ForgeNotebook; cell: ForgeNotebookCell } {
  const cell = createNotebookCell(source);
  const insertAt = afterCellId ? notebook.cells.findIndex((entry) => entry.id === afterCellId) + 1 : notebook.cells.length;
  const nextCells = [...notebook.cells];
  const safeIndex = insertAt > 0 ? insertAt : nextCells.length;
  nextCells.splice(safeIndex, 0, cell);
  return {
    cell,
    notebook: {
      ...notebook,
      cells: nextCells,
      metadata: {
        ...notebook.metadata,
        forgecad: {
          ...notebook.metadata.forgecad,
          previewCellId: cell.id,
        },
      },
    },
  };
}

export function deleteNotebookCell(notebook: ForgeNotebook, cellId: string): ForgeNotebook {
  const remaining = notebook.cells.filter((cell) => cell.id !== cellId);
  const cells = remaining.length > 0 ? remaining : [createNotebookCell()];
  const previewCellId = resolveNotebookPreviewCellId(
    { ...notebook, cells, metadata: notebook.metadata },
    notebook.metadata.forgecad.previewCellId === cellId ? null : notebook.metadata.forgecad.previewCellId,
  );
  return {
    ...notebook,
    cells,
    metadata: {
      ...notebook.metadata,
      forgecad: {
        ...notebook.metadata.forgecad,
        previewCellId,
      },
    },
  };
}

export function updateNotebookCellExecution(notebook: ForgeNotebook, cellId: string, outputs: ForgeNotebookOutput[]): ForgeNotebook {
  return {
    ...notebook,
    cells: notebook.cells.map((cell) =>
      cell.id === cellId
        ? {
            ...cell,
            execution_count: (cell.execution_count ?? 0) + 1,
            outputs,
          }
        : cell,
    ),
    metadata: {
      ...notebook.metadata,
      forgecad: {
        ...notebook.metadata.forgecad,
        previewCellId: cellId,
      },
    },
  };
}

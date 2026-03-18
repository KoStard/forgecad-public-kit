import { useEffect, useMemo, useState } from 'react';
import { useForgeStore } from '../store/forgeStore';
import { fileSystem } from '../fs';
import {
  appendNotebookCell,
  cellSourceToString,
  deleteNotebookCell,
  parseNotebook,
  resolveNotebookPreviewCellId,
  serializeNotebook,
  upsertNotebookCellSource,
  type ForgeNotebookOutput,
} from '../notebook/model';

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 16,
  overflowY: 'auto',
  height: '100%',
  background: 'var(--fc-bg)',
};

const buttonStyle: React.CSSProperties = {
  padding: '4px 9px',
  background: 'var(--fc-bgHover)',
  color: 'var(--fc-text)',
  border: '1px solid var(--fc-border)',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
};

function OutputBlock({ output }: { output: ForgeNotebookOutput }) {
  if (output.output_type === 'error') {
    return (
      <div style={{ border: '1px solid var(--fc-error)', background: 'rgba(224, 82, 82, 0.08)', color: 'var(--fc-error)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
        {[output.evalue, ...output.traceback].join('\n')}
      </div>
    );
  }

  if (output.output_type === 'stream') {
    return (
      <div style={{ border: '1px solid var(--fc-border)', background: 'var(--fc-bgSurface)', color: output.name === 'stderr' ? 'var(--fc-error)' : 'var(--fc-textMuted)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
        {output.text.join('\n')}
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid var(--fc-border)', background: 'var(--fc-bgSurface)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--fc-text)' }}>
      {output.data['text/plain'].join('\n')}
    </div>
  );
}

export function NotebookEditor() {
  const activeFile = useForgeStore((state) => state.activeFile);
  const fileText = useForgeStore((state) => state.files[state.activeFile] || '');
  const updateFileCode = useForgeStore((state) => state.updateFileCode);
  const runQuality = useForgeStore((state) => state.runQuality);
  const [runningCellId, setRunningCellId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [activeCellId, setActiveCellId] = useState<string | null>(null);

  const parsed = useMemo(() => {
    try {
      return {
        notebook: parseNotebook(fileText),
        error: null,
      };
    } catch (error) {
      return {
        notebook: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [fileText]);

  useEffect(() => {
    if (!parsed.notebook) {
      setActiveCellId(null);
      return;
    }
    setActiveCellId((current) => (
      current && parsed.notebook?.cells.some((cell) => cell.id === current)
        ? current
        : resolveNotebookPreviewCellId(parsed.notebook)
    ));
  }, [parsed.notebook]);

  const replaceNotebookText = (nextText: string, markSaved: boolean) => {
    useForgeStore.setState((state) => ({
      files: { ...state.files, [activeFile]: nextText },
      savedFiles: markSaved ? { ...state.savedFiles, [activeFile]: nextText } : state.savedFiles,
      dirty: (() => {
        if (!markSaved) return true;
        const nextFiles = { ...state.files, [activeFile]: nextText };
        const nextSaved = { ...state.savedFiles, [activeFile]: nextText };
        return Object.keys(nextFiles).some((path) => nextFiles[path] !== nextSaved[path]);
      })(),
    }));
  };

  const updateNotebook = (updater: (source: NonNullable<typeof parsed.notebook>) => string) => {
    if (!parsed.notebook) return;
    setRequestError(null);
    updateFileCode(activeFile, updater(parsed.notebook));
  };

  const runCell = async (cellId: string) => {
    if (!parsed.notebook) return;
    if (!fileSystem.capabilities.notebookServer) {
      setRequestError('Notebook execution requires the local ForgeCAD Studio (forgecad studio <dir>). Run the app locally to use notebooks.');
      return;
    }
    setRequestError(null);
    setRunningCellId(cellId);
    try {
      const response = await fetch('/api/notebook/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: activeFile,
          notebook: serializeNotebook(parsed.notebook),
          cellId,
          quality: runQuality,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Notebook execution failed');
      }
      replaceNotebookText(payload.notebookText, true);
      setActiveCellId(payload.cellId || cellId);
      useForgeStore.getState().execute();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunningCellId(null);
    }
  };

  if (!parsed.notebook) {
    return (
      <div style={{ padding: 16, color: 'var(--fc-error)', fontSize: 13 }}>
        Notebook JSON is invalid: {parsed.error}
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fc-text)' }}>Forge Notebook</div>
          <div style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>
            Cells share state. Use `show(...)` to pin geometry from the current cell.
          </div>
        </div>
        <button
          style={buttonStyle}
          onClick={() => {
            const appended = appendNotebookCell(parsed.notebook, '', activeCellId);
            updateFileCode(activeFile, serializeNotebook(appended.notebook));
            setActiveCellId(appended.cell.id);
          }}
        >
          + Code Cell
        </button>
      </div>

      {requestError && (
        <div style={{ border: '1px solid var(--fc-error)', borderRadius: 8, background: 'rgba(224, 82, 82, 0.08)', color: 'var(--fc-error)', padding: 12, fontSize: 12 }}>
          {requestError}
        </div>
      )}

      {parsed.notebook.cells.map((cell, index) => {
        const source = cellSourceToString(cell.source);
        const isActive = activeCellId === cell.id;
        return (
          <div
            key={cell.id}
            style={{
              border: isActive ? '1px solid var(--fc-accent)' : '1px solid var(--fc-border)',
              borderRadius: 12,
              background: 'var(--fc-bgSurface)',
              boxShadow: isActive ? '0 0 0 1px color-mix(in srgb, var(--fc-accent) 22%, transparent)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--fc-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--fc-textDim)', fontFamily: 'monospace' }}>
                  In [{cell.execution_count ?? ' '}]
                </span>
                <span style={{ fontSize: 12, color: 'var(--fc-textMuted)' }}>Cell {index + 1}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={buttonStyle}
                  disabled={runningCellId === cell.id}
                  onClick={() => void runCell(cell.id)}
                >
                  {runningCellId === cell.id ? 'Running...' : 'Run'}
                </button>
                <button
                  style={buttonStyle}
                  onClick={() => {
                    const appended = appendNotebookCell(parsed.notebook, '', cell.id);
                    updateFileCode(activeFile, serializeNotebook(appended.notebook));
                    setActiveCellId(appended.cell.id);
                  }}
                >
                  + Below
                </button>
                <button
                  style={buttonStyle}
                  onClick={() => {
                    const nextNotebook = deleteNotebookCell(parsed.notebook, cell.id);
                    updateFileCode(activeFile, serializeNotebook(nextNotebook));
                    setActiveCellId(resolveNotebookPreviewCellId(nextNotebook));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            <textarea
              data-fc-editor-surface="notebook"
              value={source}
              spellCheck={false}
              onFocus={() => setActiveCellId(cell.id)}
              onChange={(event) => updateNotebook((notebook) => serializeNotebook(
                upsertNotebookCellSource(notebook, cell.id, event.target.value),
              ))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.shiftKey) {
                  event.preventDefault();
                  void runCell(cell.id);
                }
              }}
              style={{
                width: '100%',
                minHeight: 150,
                resize: 'vertical',
                border: 'none',
                borderBottom: cell.outputs.length > 0 ? '1px solid var(--fc-border)' : 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--fc-text)',
                fontFamily: 'monospace',
                fontSize: 13,
                lineHeight: 1.55,
                padding: 14,
                boxSizing: 'border-box',
              }}
            />

            {cell.outputs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
                {cell.outputs.map((output, outputIndex) => (
                  <OutputBlock key={`${cell.id}-${outputIndex}`} output={output} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

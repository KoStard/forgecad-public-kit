import React, { useEffect } from 'react';
import { initKernel } from '@forge/kernel';
import { useForgeStore } from './store/forgeStore';
import { fileSystem } from './fs';
import { CodeEditor } from './components/CodeEditor';
import { NotebookEditor } from './components/NotebookEditor';
import { Viewport } from './components/Viewport';
import { ParamPanel } from './components/ParamPanel';
import { ExportPanel } from './components/ExportPanel';
import { FileExplorer } from './components/FileExplorer';
import { ViewPanel } from './components/ViewPanel';
import { CommandPalette } from './components/CommandPalette';
import { FileSwitcher } from './components/FileSwitcher';
import { KeyboardShortcutsOverlay } from './components/KeyboardShortcutsOverlay';
import { ConsolePanel } from './components/ConsolePanel';
import { VerificationsPanel } from './components/VerificationsPanel';
import { ResizablePanel } from './components/ResizablePanel';
import { isSaveShortcut, shouldBlockBrowserShortcut, type EditorSurface } from './editorShortcuts';
import { isNotebookFile } from './notebook/model';

const GITHUB_REPO = 'KoStard/ForgeCAD';

function GitHubStarButton() {
  const [stars, setStars] = React.useState<number | null>(null);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`)
      .then((r) => r.json())
      .then((data: { stargazers_count?: number }) => {
        if (typeof data.stargazers_count === 'number') setStars(data.stargazers_count);
      })
      .catch(() => { /* fail silently — button still works as a plain link */ });
  }, []);

  const label = stars === null ? null : stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars);

  return (
    <a
      href={`https://github.com/${GITHUB_REPO}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Star on GitHub"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        background: 'transparent',
        color: 'var(--fc-textMuted)',
        border: '1px solid var(--fc-border)',
        borderRadius: 3,
        fontSize: 12,
        textDecoration: 'none',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <svg height="13" width="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      Star
      {label !== null && (
        <>
          <span style={{ width: 1, height: 10, background: 'var(--fc-border)', display: 'inline-block' }} />
          <span style={{ color: 'var(--fc-text)', fontVariantNumeric: 'tabular-nums' }}>{label}</span>
        </>
      )}
    </a>
  );
}

const btnStyle = (active = false): React.CSSProperties => ({
  padding: '4px 10px',
  background: active ? 'var(--fc-accent)' : 'transparent',
  color: active ? 'var(--fc-accentText)' : 'var(--fc-textMuted)',
  border: '1px solid var(--fc-border)',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
});

const FILE_EXPLORER_PANEL_WIDTH_KEY = 'fc-layout-file-panel-width-v1';
const CODE_PANEL_WIDTH_KEY = 'fc-layout-code-panel-width-v1';
const VIEW_PANEL_WIDTH_KEY = 'fc-layout-view-panel-width-v1';

function Toolbar() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const dirty = useForgeStore((s) => s.dirty);
  const newProject = useForgeStore((s) => s.newProject);
  const saveFile = useForgeStore((s) => s.saveFile);
  const saveFileAs = useForgeStore((s) => s.saveFileAs);
  const measureMode = useForgeStore((s) => s.measureMode);
  const toggleMeasure = useForgeStore((s) => s.toggleMeasure);
  const clearMeasure = useForgeStore((s) => s.clearMeasure);
  const measurements = useForgeStore((s) => s.measurements);
  const removeMeasurement = useForgeStore((s) => s.removeMeasurement);
  const fileExplorerOpen = useForgeStore((s) => s.fileExplorerOpen);
  const toggleFileExplorer = useForgeStore((s) => s.toggleFileExplorer);
  const viewPanelOpen = useForgeStore((s) => s.viewPanelOpen);
  const toggleViewPanel = useForgeStore((s) => s.toggleViewPanel);
  const openCommandPalette = useForgeStore((s) => s.openCommandPalette);

  const measureDistances = measurements.map((measurement, index) => {
    if (measurement.points.length !== 2) return null;
    const [a, b] = measurement.points;
    const dist = Math.sqrt(
      (b[0] - a[0]) ** 2 +
        (b[1] - a[1]) ** 2 +
        (b[2] - a[2]) ** 2,
    );
    return {
      id: measurement.id,
      label: `M${index + 1}`,
      dist,
    };
  }).filter((entry): entry is { id: string; label: string; dist: number } => entry !== null);

  return (
    <div style={{ padding: '6px 12px', background: 'var(--fc-bgHover)', borderBottom: '1px solid var(--fc-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 16 }}>⚒</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fc-accent)' }}>ForgeCAD</span>
      <span style={{ color: 'var(--fc-textDim)', fontSize: 12, marginLeft: 4 }}>
        {activeFile}{dirty ? ' •' : ''}
      </span>
      <button
        onClick={openCommandPalette}
        title="Open command palette (⌘⇧P)"
        style={{
          marginLeft: 8,
          padding: '2px 8px',
          background: 'var(--fc-bgSurface)',
          border: '1px solid var(--fc-border)',
          borderRadius: 4,
          color: 'var(--fc-textDim)',
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontFamily: 'inherit',
        }}
      >
        <span>Commands</span>
        <kbd style={{ fontSize: 10, opacity: 0.7, fontFamily: 'inherit' }}>⌘⇧P</kbd>
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
        <button style={btnStyle(fileExplorerOpen)} onClick={toggleFileExplorer} title="Toggle file explorer">📁 Files</button>
        <button style={btnStyle(viewPanelOpen)} onClick={toggleViewPanel} title="Toggle view panel">🧭 View</button>
        <div style={{ width: 1, height: 20, background: 'var(--fc-border)', margin: '0 4px' }} />
        <button style={btnStyle()} onClick={newProject} title="New project">New Project</button>
        <button style={btnStyle()} onClick={saveFile} title="Save (⌘S)">Save</button>
        <button style={btnStyle()} onClick={saveFileAs} title="Save as new file">Save As</button>
        <div style={{ width: 1, height: 20, background: 'var(--fc-border)', margin: '0 4px' }} />
        <button style={btnStyle(measureMode)} onClick={toggleMeasure} title="Toggle measurement tool">📏 Measure</button>
        {measureMode && <button style={btnStyle()} onClick={clearMeasure}>Clear All</button>}
        {__FORGE_MODE__ === 'web' && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--fc-border)', margin: '0 4px' }} />
            <GitHubStarButton />
          </>
        )}
        {measureDistances.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {measureDistances.map((measurement) => (
              <span
                key={measurement.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 6px',
                  border: '1px solid var(--fc-border)',
                  borderRadius: 4,
                  fontSize: 11,
                  color: 'var(--fc-warning)',
                  fontFamily: 'monospace',
                }}
              >
                {measurement.label} {measurement.dist.toFixed(2)} mm
                <button
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--fc-warning)',
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1,
                  }}
                  onClick={() => removeMeasurement(measurement.id)}
                  title={`Remove ${measurement.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function App() {
  const kernelReady = useForgeStore((s) => s.kernelReady);
  const setKernelReady = useForgeStore((s) => s.setKernelReady);
  const execute = useForgeStore((s) => s.execute);
  const activeFile = useForgeStore((s) => s.activeFile);
  const fileExplorerOpen = useForgeStore((s) => s.fileExplorerOpen);
  const viewPanelOpen = useForgeStore((s) => s.viewPanelOpen);
  const applyServerSnapshot = useForgeStore((s) => s.applyServerSnapshot);
  const applyServerFileChange = useForgeStore((s) => s.applyServerFileChange);
  const applyServerFileDelete = useForgeStore((s) => s.applyServerFileDelete);
  const saveFile = useForgeStore((s) => s.saveFile);
  const minFileExplorerWidth = 220;
  const maxFileExplorerWidth = 520;
  const minCodePanelWidth = 320;
  const maxCodePanelWidth = 860;
  const minViewPanelWidth = 220;
  const maxViewPanelWidth = 460;
  const notebookMode = isNotebookFile(activeFile);

  useEffect(() => {
    initKernel().then(() => {
      setKernelReady(true);
      execute();
    });
  }, []);

  // Sync project files via the active FileSystemProvider
  useEffect(() => {
    return fileSystem.subscribe((event) => {
      if (event.type === 'init') applyServerSnapshot(event.files);
      else if (event.type === 'change') applyServerFileChange(event.filename, event.content);
      else if (event.type === 'delete') applyServerFileDelete(event.filename);
    });
  }, [applyServerSnapshot, applyServerFileChange, applyServerFileDelete]);

  // Warn before closing/refreshing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const { files, savedFiles } = useForgeStore.getState();
      const hasUnsaved = Object.keys(files).some((k) => files[k] !== savedFiles[k]);
      if (hasUnsaved) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== '?') return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // Don't trigger inside text inputs or editor surfaces
      if (target.closest('[data-fc-editor-surface]')) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      event.preventDefault();
      const state = useForgeStore.getState();
      if (state.commandPaletteOpen || state.fileSwitcherOpen) return;
      state.openShortcutsOverlay();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handleEditorShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const surfaceValue = target
        .closest<HTMLElement>('[data-fc-editor-surface]')
        ?.dataset.fcEditorSurface;

      if (surfaceValue !== 'monaco' && surfaceValue !== 'notebook') return;

      const surface = surfaceValue as EditorSurface;

      if (surface === 'notebook' && isSaveShortcut(event)) {
        event.preventDefault();
        void saveFile();
        return;
      }

      if (shouldBlockBrowserShortcut(event, surface)) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleEditorShortcut, true);
    return () => window.removeEventListener('keydown', handleEditorShortcut, true);
  }, [saveFile]);

  if (!kernelReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--fc-textDim)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚒ ForgeCAD</div>
          <div style={{ fontSize: 14 }}>Loading geometry kernel...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {fileExplorerOpen && (
          <ResizablePanel
            storageKey={FILE_EXPLORER_PANEL_WIDTH_KEY}
            defaultWidth={280}
            minWidth={minFileExplorerWidth}
            maxWidth={maxFileExplorerWidth}
            edge="right"
            handleLabel="Resize project files panel"
          >
            <FileExplorer />
          </ResizablePanel>
        )}
        <ResizablePanel
          storageKey={CODE_PANEL_WIDTH_KEY}
          defaultWidth={520}
          minWidth={minCodePanelWidth}
          maxWidth={maxCodePanelWidth}
          edge="right"
          handleLabel="Resize code editor panel"
          panelStyle={{ borderRight: '1px solid var(--fc-border)' }}
        >
          <div style={{ flex: 1, minHeight: 0 }}>
            {notebookMode ? <NotebookEditor /> : <CodeEditor />}
          </div>
          <ParamPanel />
          <VerificationsPanel />
          <ConsolePanel />
          <ExportPanel />
        </ResizablePanel>
        <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Viewport />
          </div>
          {viewPanelOpen && (
            <ResizablePanel
              storageKey={VIEW_PANEL_WIDTH_KEY}
              defaultWidth={280}
              minWidth={minViewPanelWidth}
              maxWidth={maxViewPanelWidth}
              edge="left"
              handleLabel="Resize view panel"
              panelStyle={{ overflow: 'hidden' }}
            >
              <ViewPanel />
            </ResizablePanel>
          )}
        </div>
      </div>
      <CommandPalette />
      <FileSwitcher />
      <KeyboardShortcutsOverlay />
    </div>
  );
}

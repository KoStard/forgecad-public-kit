import { useEffect, useRef, useState } from 'react';
import { initKernel } from '@forge/kernel';
import { useForgeStore } from './store/forgeStore';
import { CodeEditor } from './components/CodeEditor';
import { Viewport } from './components/Viewport';
import { ParamPanel } from './components/ParamPanel';
import { ExportPanel } from './components/ExportPanel';
import { FileExplorer } from './components/FileExplorer';
import { ViewPanel } from './components/ViewPanel';
import { CommandPalette } from './components/CommandPalette';
import { FileSwitcher } from './components/FileSwitcher';

const btnStyle = (active = false): React.CSSProperties => ({
  padding: '4px 10px',
  background: active ? 'var(--fc-accent)' : 'transparent',
  color: active ? 'var(--fc-accentText)' : 'var(--fc-textMuted)',
  border: '1px solid var(--fc-border)',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
});

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

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
        <button style={btnStyle(fileExplorerOpen)} onClick={toggleFileExplorer}>📁 Files</button>
        <button style={btnStyle(viewPanelOpen)} onClick={toggleViewPanel}>🧭 View</button>
        <div style={{ width: 1, height: 20, background: 'var(--fc-border)', margin: '0 4px' }} />
        <button style={btnStyle()} onClick={newProject}>New Project</button>
        <button style={btnStyle()} onClick={saveFile}>Save</button>
        <button style={btnStyle()} onClick={saveFileAs}>Save As</button>
        <div style={{ width: 1, height: 20, background: 'var(--fc-border)', margin: '0 4px' }} />
        <button style={btnStyle(measureMode)} onClick={toggleMeasure}>📏 Measure</button>
        {measureMode && <button style={btnStyle()} onClick={clearMeasure}>Clear All</button>}
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
  const fileExplorerOpen = useForgeStore((s) => s.fileExplorerOpen);
  const viewPanelOpen = useForgeStore((s) => s.viewPanelOpen);
  const refreshFiles = useForgeStore((s) => s.refreshFiles);
  const [codePanelWidth, setCodePanelWidth] = useState(520);
  const [viewPanelWidth, setViewPanelWidth] = useState(280);
  const dragStateRef = useRef<{ type: 'code' | 'view'; startX: number; startWidth: number } | null>(null);
  const minCodePanelWidth = 320;
  const maxCodePanelWidth = 860;
  const minViewPanelWidth = 220;
  const maxViewPanelWidth = 460;

  useEffect(() => {
    initKernel().then(() => {
      setKernelReady(true);
      execute();
    });
  }, []);

  // Refresh files on mount and when tab becomes visible
  useEffect(() => {
    refreshFiles();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshFiles();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshFiles]);

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
    const handleMove = (e: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      const delta = e.clientX - state.startX;
      if (state.type === 'code') {
        const next = Math.min(maxCodePanelWidth, Math.max(minCodePanelWidth, state.startWidth + delta));
        setCodePanelWidth(next);
      } else {
        const next = Math.min(maxViewPanelWidth, Math.max(minViewPanelWidth, state.startWidth - delta));
        setViewPanelWidth(next);
      }
    };
    const handleUp = () => {
      dragStateRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

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
        {fileExplorerOpen && <FileExplorer />}
        <div style={{ width: codePanelWidth, minWidth: minCodePanelWidth, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--fc-border)' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor />
          </div>
          <ParamPanel />
          <ExportPanel />
        </div>
        <div
          onMouseDown={(e) => {
            dragStateRef.current = { type: 'code', startX: e.clientX, startWidth: codePanelWidth };
          }}
          style={{
            width: 6,
            cursor: 'col-resize',
            background: 'var(--fc-bgOverlay)',
            borderRight: '1px solid var(--fc-border)',
          }}
        />
        <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Viewport />
          </div>
          {viewPanelOpen && (
            <>
              <div
                onMouseDown={(e) => {
                  dragStateRef.current = { type: 'view', startX: e.clientX, startWidth: viewPanelWidth };
                }}
                style={{
                  width: 6,
                  cursor: 'col-resize',
                  background: 'var(--fc-bgOverlay)',
                  borderLeft: '1px solid var(--fc-border)',
                }}
              />
              <div style={{ width: viewPanelWidth, minWidth: minViewPanelWidth, maxWidth: maxViewPanelWidth, overflowY: 'auto' }}>
                <ViewPanel />
              </div>
            </>
          )}
        </div>
      </div>
      <CommandPalette />
      <FileSwitcher />
    </div>
  );
}

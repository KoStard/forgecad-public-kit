import { useEffect } from 'react';
import { initKernel } from '@forge/kernel';
import { useForgeStore } from './store/forgeStore';
import { CodeEditor } from './components/CodeEditor';
import { Viewport } from './components/Viewport';
import { ParamPanel } from './components/ParamPanel';
import { ExportPanel } from './components/ExportPanel';
import { FileExplorer } from './components/FileExplorer';

const btnStyle = (active = false): React.CSSProperties => ({
  padding: '4px 10px',
  background: active ? '#4a9eff' : 'transparent',
  color: active ? '#fff' : '#aaa',
  border: '1px solid #444',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
});

function Toolbar() {
  const fileName = useForgeStore((s) => s.fileName);
  const dirty = useForgeStore((s) => s.dirty);
  const newFile = useForgeStore((s) => s.newFile);
  const openFile = useForgeStore((s) => s.openFile);
  const saveFile = useForgeStore((s) => s.saveFile);
  const saveFileAs = useForgeStore((s) => s.saveFileAs);
  const measureMode = useForgeStore((s) => s.measureMode);
  const toggleMeasure = useForgeStore((s) => s.toggleMeasure);
  const clearMeasure = useForgeStore((s) => s.clearMeasure);
  const measurePoints = useForgeStore((s) => s.measurePoints);
  const fileExplorerOpen = useForgeStore((s) => s.fileExplorerOpen);
  const toggleFileExplorer = useForgeStore((s) => s.toggleFileExplorer);

  const dist =
    measurePoints.length === 2
      ? Math.sqrt(
          (measurePoints[1][0] - measurePoints[0][0]) ** 2 +
            (measurePoints[1][1] - measurePoints[0][1]) ** 2 +
            (measurePoints[1][2] - measurePoints[0][2]) ** 2,
        )
      : null;

  return (
    <div
      style={{
        padding: '6px 12px',
        background: '#2d2d2d',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 16 }}>⚒</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: '#4a9eff' }}>ForgeCAD</span>
      <span style={{ color: '#888', fontSize: 12, marginLeft: 4 }}>
        {fileName}
        {dirty ? ' •' : ''}
      </span>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
        <button style={btnStyle(fileExplorerOpen)} onClick={toggleFileExplorer}>
          📁 Files
        </button>

        <div style={{ width: 1, height: 20, background: '#444', margin: '0 4px' }} />

        <button style={btnStyle()} onClick={newFile}>New</button>
        <button style={btnStyle()} onClick={openFile}>Open</button>
        <button style={btnStyle()} onClick={saveFile}>Save</button>
        <button style={btnStyle()} onClick={saveFileAs}>Save As</button>

        <div style={{ width: 1, height: 20, background: '#444', margin: '0 4px' }} />

        <button style={btnStyle(measureMode)} onClick={toggleMeasure}>
          📏 Measure
        </button>
        {measureMode && (
          <button style={btnStyle()} onClick={clearMeasure}>Clear</button>
        )}
        {dist !== null && (
          <span style={{ color: '#ffcc00', fontSize: 12, fontFamily: 'monospace' }}>
            {dist.toFixed(2)} mm
          </span>
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

  useEffect(() => {
    initKernel().then(() => {
      setKernelReady(true);
      execute();
    });
  }, []);

  if (!kernelReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>
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
        
        {/* Left panel: editor + params */}
        <div style={{ width: '45%', minWidth: 300, display: 'flex', flexDirection: 'column', borderRight: '1px solid #333' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor />
          </div>
          <ParamPanel />
          <ExportPanel />
        </div>

        {/* Right panel: 3D viewport */}
        <div style={{ flex: 1 }}>
          <Viewport />
        </div>
      </div>
    </div>
  );
}

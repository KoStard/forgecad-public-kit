import { useState } from 'react';
import { useForgeStore } from '../store/forgeStore';
import {
  exportMeshFromStore,
  exportExactFromStore,
  exportOrbitGifFromStore,
  exportReportFromStore,
  type MeshExportFormat,
  type ExactExportFormat,
  type ExportQualityChoice,
} from './exportActions';

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

interface Export3DPanelProps {
  fileStem: string;
  defaultStem: string;
  shapeCount: number;
  totalTriangles: number;
  onClose: () => void;
}

export function Export3DPanel({ fileStem: initialStem, defaultStem, shapeCount, totalTriangles, onClose }: Export3DPanelProps) {
  const activeBackend = useForgeStore((s) => s.activeBackend);
  const [meshFormat, setMeshFormat] = useState<MeshExportFormat>('3mf');
  const [exportQuality, setExportQuality] = useState<ExportQualityChoice>('default');
  const [meshFileStem, setMeshFileStem] = useState(initialStem);
  const [meshBusy, setMeshBusy] = useState(false);
  const [exactBusy, setExactBusy] = useState(false);
  const [gifBusy, setGifBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const anyBusy = meshBusy || exactBusy || gifBusy || reportBusy;
  const isOCCT = activeBackend === 'occt';

  const exportMesh = async () => {
    if (meshBusy) return;
    setMeshBusy(true);
    try {
      await exportMeshFromStore(meshFormat, meshFileStem || defaultStem, { quality: exportQuality });
      onClose();
    } catch (err) {
      console.error('Mesh export failed:', err);
      alert(`Mesh export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMeshBusy(false);
    }
  };

  const exportExact = async (format: ExactExportFormat) => {
    if (exactBusy) return;
    setExactBusy(true);
    try {
      await exportExactFromStore(format, meshFileStem || defaultStem);
      onClose();
    } catch (err) {
      console.error(`${format.toUpperCase()} export failed:`, err);
      alert(`${format.toUpperCase()} export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExactBusy(false);
    }
  };

  const exportGif = async () => {
    if (gifBusy) return;
    setGifBusy(true);
    try {
      await waitForNextPaint();
      await exportOrbitGifFromStore(meshFileStem || defaultStem, { quality: exportQuality });
      onClose();
    } catch (err) {
      console.error('GIF export failed:', err);
      alert(`GIF export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGifBusy(false);
    }
  };

  const exportReport = async () => {
    if (reportBusy) return;
    setReportBusy(true);
    try {
      await waitForNextPaint();
      await exportReportFromStore(meshFileStem || defaultStem, { quality: exportQuality });
    } catch (err) {
      console.error('Report export failed:', err);
      alert(`Report export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReportBusy(false);
    }
  };

  // Shared styles
  const sectionBorder = { borderTop: '1px solid var(--fc-borderLight)', marginTop: 12, paddingTop: 12 };
  const formatBtn = (selected: boolean, accent = 'var(--fc-accent)') => ({
    textAlign: 'left' as const,
    border: `1px solid ${selected ? accent : 'var(--fc-border)'}`,
    background: selected ? 'var(--fc-bgActive)' : 'var(--fc-bgOverlay)',
    color: 'var(--fc-text)',
    borderRadius: 6,
    padding: '9px 10px',
    cursor: 'pointer',
  });
  const actionBtn = (busy: boolean) => ({
    width: '100%',
    padding: '7px 8px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    background: !busy ? 'var(--fc-accent)' : 'var(--fc-border)',
    color: !busy ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
    border: 'none',
    borderRadius: 4,
    cursor: !busy ? 'pointer' : 'default',
    fontSize: 12,
  });

  return (
    <>
      {/* Mesh Format Selection */}
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fc-textDim)' }}>Mesh format</div>
      <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
        <button onClick={() => setMeshFormat('3mf')} style={formatBtn(meshFormat === '3mf')}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>3MF (recommended)</div>
          <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
            Preserves manifold topology and object structure.
          </div>
        </button>
        <button onClick={() => setMeshFormat('obj')} style={formatBtn(meshFormat === 'obj')}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>OBJ (universal)</div>
          <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
            Wavefront OBJ — widely supported by 3D tools, renderers, and game engines.
          </div>
        </button>
        <button onClick={() => setMeshFormat('stl')} style={formatBtn(meshFormat === 'stl', 'var(--fc-warning)')}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>STL (legacy)</div>
          <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
            Triangle-only export, may not preserve manifold topology on re-import.
          </div>
        </button>
      </div>

      {meshFormat === 'stl' && (
        <div style={{
          marginTop: 8,
          border: '1px solid var(--fc-warning)',
          background: 'color-mix(in srgb, var(--fc-warning) 12%, transparent)',
          color: 'var(--fc-text)',
          borderRadius: 6,
          padding: '8px 10px',
          fontSize: 11,
          lineHeight: 1.4,
        }}>
          STL is lossy for solid models. Use 3MF for reliable manifold round-trips.
        </div>
      )}

      {/* Exact Geometry Formats (OCCT only) */}
      <div style={sectionBorder}>
        <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>
          Exact geometry
          {!isOCCT && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>(requires OCCT backend)</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => exportExact('step')}
            disabled={!isOCCT || exactBusy}
            style={{
              flex: 1,
              padding: '7px 8px',
              background: isOCCT && !exactBusy ? 'var(--fc-accent)' : 'var(--fc-border)',
              color: isOCCT && !exactBusy ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
              border: 'none',
              borderRadius: 4,
              cursor: isOCCT && !exactBusy ? 'pointer' : 'default',
              fontSize: 12,
              opacity: isOCCT ? 1 : 0.5,
            }}
          >
            {exactBusy ? 'Exporting...' : 'Export STEP'}
          </button>
          <button
            onClick={() => exportExact('brep')}
            disabled={!isOCCT || exactBusy}
            style={{
              flex: 1,
              padding: '7px 8px',
              background: isOCCT && !exactBusy ? 'var(--fc-accent)' : 'var(--fc-border)',
              color: isOCCT && !exactBusy ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
              border: 'none',
              borderRadius: 4,
              cursor: isOCCT && !exactBusy ? 'pointer' : 'default',
              fontSize: 12,
              opacity: isOCCT ? 1 : 0.5,
            }}
          >
            {exactBusy ? 'Exporting...' : 'Export BREP'}
          </button>
        </div>
        {!isOCCT && (
          <div style={{ fontSize: 10, color: 'var(--fc-textDim)', marginTop: 4 }}>
            Switch to OCCT backend for STEP/BREP export with exact B-rep geometry.
          </div>
        )}
      </div>

      {/* Geometry Quality — always visible */}
      <div style={sectionBorder}>
        <div style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>Geometry quality</div>
        <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
          <button onClick={() => setExportQuality('default')} style={formatBtn(exportQuality === 'default')}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Default (current scene)</div>
            <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
              Uses the geometry already loaded in the viewport.
            </div>
          </button>
          <button onClick={() => setExportQuality('live')} style={formatBtn(exportQuality === 'live')}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Live (fast)</div>
            <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
              Re-runs script with faster tessellation before export.
            </div>
          </button>
          <button onClick={() => setExportQuality('high')} style={formatBtn(exportQuality === 'high')}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>High (export)</div>
            <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
              Re-runs script with denser tessellation for final output.
            </div>
          </button>
        </div>
        {exportQuality !== 'default' && (
          <div style={{
            marginTop: 8,
            border: '1px solid var(--fc-border)',
            background: 'var(--fc-bgOverlay)',
            color: 'var(--fc-textDim)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            lineHeight: 1.4,
          }}>
            This export will regenerate geometry with the selected quality profile.
          </div>
        )}
      </div>

      {/* Filename */}
      <label style={{ display: 'block', marginTop: 12, fontSize: 12, color: 'var(--fc-textDim)' }}>
        Filename
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 5, gap: 6 }}>
          <input
            type="text"
            value={meshFileStem}
            onChange={(event) => setMeshFileStem(event.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              background: 'var(--fc-bgInput)',
              border: '1px solid var(--fc-border)',
              borderRadius: 4,
              padding: '6px 8px',
              color: 'var(--fc-text)',
              fontSize: 12,
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--fc-textDim)', width: 44, textAlign: 'left' }}>
            .{meshFormat}
          </span>
        </div>
      </label>

      {/* Primary Mesh Export Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button
          onClick={onClose}
          disabled={anyBusy}
          style={{
            border: '1px solid var(--fc-border)',
            background: 'transparent',
            color: 'var(--fc-textMuted)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
            cursor: anyBusy ? 'default' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={exportMesh}
          disabled={meshBusy}
          style={{
            border: 'none',
            background: 'var(--fc-accent)',
            color: 'var(--fc-accentText)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
            cursor: meshBusy ? 'default' : 'pointer',
          }}
        >
          {meshBusy ? `Exporting ${meshFormat.toUpperCase()}...` : `Export ${meshFormat.toUpperCase()}`}
        </button>
      </div>

      {/* Animation GIF */}
      <div style={sectionBorder}>
        <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>Animation</div>
        <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 7 }}>
          Renders a full 360 orbit in solid, then wireframe.
        </div>
        <button onClick={exportGif} disabled={gifBusy} style={actionBtn(gifBusy)}>
          {gifBusy ? 'Rendering Orbit GIF...' : 'Export Orbit GIF'}
        </button>
      </div>

      {/* Report PDF */}
      <div style={sectionBorder}>
        <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>Report</div>
        <button onClick={exportReport} disabled={reportBusy} style={actionBtn(reportBusy)}>
          {reportBusy ? (
            <>
              <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
                <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2">
                  <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.75s" repeatCount="indefinite" />
                </path>
              </svg>
              <span>Generating Report...</span>
            </>
          ) : (
            `Export Report PDF${shapeCount > 1 ? ` (${shapeCount} components)` : ''}`
          )}
        </button>
      </div>
    </>
  );
}

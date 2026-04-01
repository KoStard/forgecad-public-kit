import { useState } from 'react';
import { useForgeStore } from '../store/forgeStore';
import {
  type ExactExportFormat,
  type ExportQualityChoice,
  exportExactFromStore,
  exportMeshFromStore,
  exportOrbitGifFromStore,
  exportReportFromStore,
  type MeshExportFormat,
} from './exportActions';

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

type ExportFormat = MeshExportFormat | ExactExportFormat;

const FORMAT_META: Record<ExportFormat, { label: string; desc: string; accent?: string }> = {
  '3mf': { label: '3MF (recommended)', desc: 'Preserves manifold topology and object structure.' },
  obj: { label: 'OBJ (universal)', desc: 'Wavefront OBJ — widely supported by 3D tools, renderers, and game engines.' },
  stl: {
    label: 'STL (legacy)',
    desc: 'Triangle-only export, may not preserve manifold topology on re-import.',
    accent: 'var(--fc-warning)',
  },
  step: { label: 'STEP (exact)', desc: 'Industry-standard exact geometry exchange format (OCCT).' },
  brep: { label: 'BREP (exact)', desc: 'Native OpenCascade boundary representation format.' },
};

const MESH_FORMATS: MeshExportFormat[] = ['3mf', 'obj', 'stl'];
const EXACT_FORMATS: ExactExportFormat[] = ['step', 'brep'];

function isExactFormat(f: ExportFormat): f is ExactExportFormat {
  return f === 'step' || f === 'brep';
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
  const [format, setFormat] = useState<ExportFormat>('3mf');
  const [exportQuality, setExportQuality] = useState<ExportQualityChoice>('default');
  const [fileStem, setFileStem] = useState(initialStem);
  const [exportBusy, setExportBusy] = useState(false);
  const [gifBusy, setGifBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const anyBusy = exportBusy || gifBusy || reportBusy;
  const isExact = isExactFormat(format);

  const doExport = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const stem = fileStem || defaultStem;
      if (isExactFormat(format)) {
        await exportExactFromStore(format, stem);
      } else {
        await exportMeshFromStore(format, stem, { quality: exportQuality });
      }
      onClose();
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportBusy(false);
    }
  };

  const exportGif = async () => {
    if (gifBusy) return;
    setGifBusy(true);
    try {
      await waitForNextPaint();
      await exportOrbitGifFromStore(fileStem || defaultStem, { quality: exportQuality });
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
      await exportReportFromStore(fileStem || defaultStem, { quality: exportQuality });
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
  const disabledFormatBtn = () => ({
    textAlign: 'left' as const,
    border: '1px solid var(--fc-border)',
    background: 'var(--fc-bgOverlay)',
    color: 'var(--fc-textDim)',
    borderRadius: 6,
    padding: '9px 10px',
    cursor: 'default' as const,
    opacity: 0.45,
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
      {/* Format Selection */}
      <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fc-textDim)' }}>Format</div>
      <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
        {/* Mesh formats */}
        {MESH_FORMATS.map((f) => {
          const meta = FORMAT_META[f];
          return (
            <button key={f} onClick={() => setFormat(f)} style={formatBtn(format === f, meta.accent)}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>{meta.desc}</div>
            </button>
          );
        })}

        {/* Exact formats */}
        <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 4 }}>Exact geometry (OCCT)</div>
        {EXACT_FORMATS.map((f) => {
          const meta = FORMAT_META[f];
          return (
            <button key={f} onClick={() => setFormat(f)} style={formatBtn(format === f)}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
              <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>{meta.desc}</div>
            </button>
          );
        })}
      </div>

      {format === 'stl' && (
        <div
          style={{
            marginTop: 8,
            border: '1px solid var(--fc-warning)',
            background: 'color-mix(in srgb, var(--fc-warning) 12%, transparent)',
            color: 'var(--fc-text)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          STL is lossy for solid models. Use 3MF for reliable manifold round-trips.
        </div>
      )}

      {isExact && activeBackend !== 'occt' && (
        <div style={{ fontSize: 10, color: 'var(--fc-textDim)', marginTop: 4 }}>
          Will re-evaluate with OCCT backend for exact B-rep geometry.
        </div>
      )}

      {/* Geometry Quality — disabled for exact formats */}
      <div style={sectionBorder}>
        <div style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>
          Geometry quality
          {isExact && <span style={{ fontSize: 10, marginLeft: 6 }}>(not applicable for exact formats)</span>}
        </div>
        <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
          <button
            onClick={() => !isExact && setExportQuality('default')}
            style={isExact ? disabledFormatBtn() : formatBtn(exportQuality === 'default')}
            disabled={isExact}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>Default (current scene)</div>
            <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>Uses the geometry already loaded in the viewport.</div>
          </button>
          <button
            onClick={() => !isExact && setExportQuality('live')}
            style={isExact ? disabledFormatBtn() : formatBtn(exportQuality === 'live')}
            disabled={isExact}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>Live (fast)</div>
            <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
              Re-runs script with faster tessellation before export.
            </div>
          </button>
          <button
            onClick={() => !isExact && setExportQuality('high')}
            style={isExact ? disabledFormatBtn() : formatBtn(exportQuality === 'high')}
            disabled={isExact}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>High (export)</div>
            <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
              Re-runs script with denser tessellation for final output.
            </div>
          </button>
        </div>
        {!isExact && exportQuality !== 'default' && (
          <div
            style={{
              marginTop: 8,
              border: '1px solid var(--fc-border)',
              background: 'var(--fc-bgOverlay)',
              color: 'var(--fc-textDim)',
              borderRadius: 6,
              padding: '8px 10px',
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
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
            value={fileStem}
            onChange={(event) => setFileStem(event.target.value)}
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
          <span style={{ fontSize: 12, color: 'var(--fc-textDim)', width: 44, textAlign: 'left' }}>.{format}</span>
        </div>
      </label>

      {/* Single Export Button */}
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
          onClick={doExport}
          disabled={exportBusy}
          style={{
            border: 'none',
            background: !exportBusy ? 'var(--fc-accent)' : 'var(--fc-border)',
            color: !exportBusy ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
            borderRadius: 4,
            padding: '6px 10px',
            fontSize: 12,
            cursor: exportBusy ? 'default' : 'pointer',
          }}
        >
          {exportBusy ? `Exporting ${format.toUpperCase()}...` : `Export ${format.toUpperCase()}`}
        </button>
      </div>

      {/* Animation GIF */}
      <div style={sectionBorder}>
        <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>Animation</div>
        <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 7 }}>Renders a full 360 orbit in solid, then wireframe.</div>
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
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 8 8"
                    to="360 8 8"
                    dur="0.75s"
                    repeatCount="indefinite"
                  />
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

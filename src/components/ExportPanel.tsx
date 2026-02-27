import { useMemo, useState } from 'react';
import { useForgeStore } from '../store/forgeStore';
import {
  deriveExportStem,
  exportOrbitGifFromStore,
  exportMeshFromStore,
  exportReportFromStore,
  type MeshExportFormat,
} from './exportActions';

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function ExportPanel() {
  const result = useForgeStore((s) => s.result);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const activeFile = useForgeStore((s) => s.activeFile);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [meshFormat, setMeshFormat] = useState<MeshExportFormat>('3mf');
  const [meshBusy, setMeshBusy] = useState(false);
  const [meshFileStem, setMeshFileStem] = useState('forge-export');
  const [gifBusy, setGifBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  const shapeObjects = result?.objects?.filter((obj) => obj.shape) ?? [];
  const hasShapes = shapeObjects.length > 0;
  const defaultMeshStem = useMemo(() => deriveExportStem(activeFile), [activeFile]);

  const meshObjects = useMemo(() => (
    shapeObjects.map((obj) => ({
      name: obj.name,
      shape: obj.shape!,
      color: objectSettings[obj.id]?.color || obj.color,
    }))
  ), [shapeObjects, objectSettings]);

  const totalTriangles = useMemo(
    () => meshObjects.reduce((sum, obj) => sum + obj.shape.numTri(), 0),
    [meshObjects],
  );

  const openDialog = () => {
    if (!hasShapes) return;
    setMeshFormat('3mf');
    setMeshFileStem(defaultMeshStem);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (meshBusy || gifBusy) return;
    setDialogOpen(false);
  };

  const exportMesh = async () => {
    if (!hasShapes || meshBusy) return;
    setMeshBusy(true);
    try {
      await exportMeshFromStore(meshFormat, meshFileStem || defaultMeshStem);
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Mesh export failed:', err);
      alert(`Mesh export failed: ${message}`);
    } finally {
      setMeshBusy(false);
    }
  };

  const exportReport = async () => {
    if (!hasShapes || reportBusy) return;
    setReportBusy(true);
    try {
      // Let React commit `reportBusy` so the loading indicator is visible
      // before worker startup and message handoff.
      await waitForNextPaint();
      await exportReportFromStore();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Report export failed:', err);
      alert(`Report export failed: ${message}`);
    } finally {
      setReportBusy(false);
    }
  };

  const exportGif = async () => {
    if (!hasShapes || gifBusy) return;
    setGifBusy(true);
    try {
      await waitForNextPaint();
      await exportOrbitGifFromStore(meshFileStem || defaultMeshStem);
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('GIF export failed:', err);
      alert(`GIF export failed: ${message}`);
    } finally {
      setGifBusy(false);
    }
  };

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--fc-border)' }}>
      <button
        onClick={openDialog}
        disabled={!hasShapes}
        style={{
          width: '100%',
          padding: '7px 8px',
          background: hasShapes ? 'var(--fc-accent)' : 'var(--fc-border)',
          color: hasShapes ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
          border: 'none',
          borderRadius: 4,
          cursor: hasShapes ? 'pointer' : 'default',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Export...
      </button>
      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: 'var(--fc-textDim)',
          lineHeight: 1.35,
        }}
      >
        3MF is recommended for manifold CAD solids. STL is kept as a legacy option.
      </div>

      {dialogOpen && (
        <div
          role="presentation"
          onMouseDown={closeDialog}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 18,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Export options"
            onMouseDown={(event) => event.stopPropagation()}
            style={{
              width: 'min(540px, calc(100vw - 32px))',
              background: 'var(--fc-bgPanel)',
              border: '1px solid var(--fc-border)',
              borderRadius: 8,
              boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fc-text)' }}>Export</div>
                <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginTop: 2 }}>
                  {pluralize(shapeObjects.length, 'object')} • {pluralize(totalTriangles, 'triangle')}
                </div>
              </div>
              <button
                onClick={closeDialog}
                disabled={meshBusy || gifBusy}
                style={{
                  border: '1px solid var(--fc-border)',
                  background: 'transparent',
                  color: 'var(--fc-textMuted)',
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: (meshBusy || gifBusy) ? 'default' : 'pointer',
                  fontSize: 17,
                  lineHeight: 1,
                }}
                title="Close export dialog"
              >
                ×
              </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--fc-textDim)' }}>Mesh format</div>
            <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
              <button
                onClick={() => setMeshFormat('3mf')}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${meshFormat === '3mf' ? 'var(--fc-accent)' : 'var(--fc-border)'}`,
                  background: meshFormat === '3mf' ? 'var(--fc-bgActive)' : 'var(--fc-bgOverlay)',
                  color: 'var(--fc-text)',
                  borderRadius: 6,
                  padding: '9px 10px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>3MF (recommended)</div>
                <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
                  Preserves manifold topology and object structure.
                </div>
              </button>
              <button
                onClick={() => setMeshFormat('stl')}
                style={{
                  textAlign: 'left',
                  border: `1px solid ${meshFormat === 'stl' ? 'var(--fc-warning)' : 'var(--fc-border)'}`,
                  background: meshFormat === 'stl' ? 'var(--fc-bgActive)' : 'var(--fc-bgOverlay)',
                  color: 'var(--fc-text)',
                  borderRadius: 6,
                  padding: '9px 10px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>STL (legacy)</div>
                <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginTop: 2 }}>
                  Triangle-only export, may not preserve manifold topology on re-import.
                </div>
              </button>
            </div>

            {meshFormat === 'stl' && (
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                onClick={closeDialog}
                disabled={meshBusy || gifBusy}
                style={{
                  border: '1px solid var(--fc-border)',
                  background: 'transparent',
                  color: 'var(--fc-textMuted)',
                  borderRadius: 4,
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: (meshBusy || gifBusy) ? 'default' : 'pointer',
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

            <div style={{ borderTop: '1px solid var(--fc-borderLight)', marginTop: 12, paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>Animation</div>
              <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 7 }}>
                Renders a full 360 orbit in solid, then wireframe.
              </div>
              <button
                onClick={exportGif}
                disabled={gifBusy}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: !gifBusy ? 'var(--fc-accent)' : 'var(--fc-border)',
                  color: !gifBusy ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: !gifBusy ? 'pointer' : 'default',
                  fontSize: 12,
                }}
              >
                {gifBusy ? 'Rendering Orbit GIF...' : 'Export Orbit GIF'}
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--fc-borderLight)', marginTop: 12, paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>Report</div>
              <button
                onClick={exportReport}
                disabled={reportBusy}
                style={{
                  width: '100%',
                  padding: '7px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: !reportBusy ? 'var(--fc-accent)' : 'var(--fc-border)',
                  color: !reportBusy ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: !reportBusy ? 'pointer' : 'default',
                  fontSize: 12,
                }}
              >
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
                  `Export Report PDF${shapeObjects.length > 1 ? ` (${shapeObjects.length} components)` : ''}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { exportSketchFromStore, type SketchExportFormat } from './exportActions';

interface ExportSketchPanelProps {
  fileStem: string;
}

export function ExportSketchPanel({ fileStem }: ExportSketchPanelProps) {
  const formats: { format: SketchExportFormat; label: string; description: string }[] = [
    { format: 'svg', label: 'SVG', description: 'Vector graphics for laser cutting, CNC' },
    { format: 'dxf', label: 'DXF', description: 'AutoCAD-compatible drawing exchange' },
    { format: 'pdf', label: 'Sketch PDF', description: 'Annotated PDF with constraints' },
  ];

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>2D Sketch Export</div>
      <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 7 }}>
        Export 2D sketches for laser cutting, CNC, or vector graphics.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {formats.map(({ format, label }) => (
          <button
            key={format}
            onClick={() => {
              try { exportSketchFromStore(format, fileStem); }
              catch (err) { alert(`${label} export failed: ${err instanceof Error ? err.message : String(err)}`); }
            }}
            style={{
              flex: 1,
              padding: '7px 8px',
              background: 'var(--fc-accent)',
              color: 'var(--fc-accentText)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Export {label}
          </button>
        ))}
      </div>
    </div>
  );
}

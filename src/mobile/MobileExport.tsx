/**
 * Mobile export sheet — mesh-only exports (3MF, STL, OBJ).
 * No STEP/BREP since OCCT isn't loaded on mobile.
 */
import { useState } from 'react';
import { exportMeshFromStore, type MeshExportFormat } from '../components/exportActions';

interface Props {
  onClose: () => void;
}

const FORMATS: { format: MeshExportFormat; label: string; desc: string }[] = [
  { format: '3mf', label: '3MF', desc: 'Color + multi-body (recommended)' },
  { format: 'stl', label: 'STL', desc: 'Universal mesh format' },
  { format: 'obj', label: 'OBJ', desc: 'Wavefront OBJ' },
];

export function MobileExport({ onClose }: Props) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: MeshExportFormat) => {
    setExporting(format);
    setError(null);
    try {
      await exportMeshFromStore(format);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fc-mobile-filepicker-overlay" onClick={onClose}>
      <div className="fc-mobile-export-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="fc-mobile-filepicker-header">
          <span>Export</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--fc-accent)', fontSize: 14, cursor: 'pointer', padding: '4px 8px' }}
          >
            Done
          </button>
        </div>
        {FORMATS.map(({ format, label, desc }) => (
          <button key={format} className="fc-mobile-export-item" onClick={() => handleExport(format)} disabled={exporting !== null}>
            <span style={{ fontSize: 18 }}>{exporting === format ? '\u23F3' : '\u{1F4E6}'}</span>
            <div>
              <div style={{ fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--fc-textMuted)' }}>{desc}</div>
            </div>
          </button>
        ))}
        {error && <div style={{ padding: '8px 16px', color: 'var(--fc-error)', fontSize: 12 }}>{error}</div>}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { generateCuttingLayoutPdf } from '../forge/cuttingLayout';
import type { SheetStockDef } from '../forge/sheetStock';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface CuttingLayoutPanelProps {
  fileStem: string;
  entries: SheetStockDef[];
}

export function CuttingLayoutPanel({ fileStem, entries }: CuttingLayoutPanelProps) {
  const [sheetWidth, setSheetWidth] = useState(2440);
  const [sheetHeight, setSheetHeight] = useState(1220);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    let totalPieces = 0;
    let totalArea = 0;
    const materials = new Set<string>();
    for (const e of entries) {
      const qty = Math.max(1, Math.round(e.quantity));
      totalPieces += qty;
      totalArea += e.width * e.height * qty;
      materials.add(e.material);
    }
    return { totalPieces, totalAreaM2: totalArea / 1_000_000, materialCount: materials.size };
  }, [entries]);

  const doExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = generateCuttingLayoutPdf(entries, sheetWidth, sheetHeight);
      const blob = new Blob([result.pdf], { type: 'application/pdf' });
      triggerDownload(blob, `${fileStem || 'cutting-layout'}.cutting-layout.pdf`);
    } catch (err) {
      console.error('Cutting layout export failed:', err);
      alert(`Cutting layout export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: 80,
    background: 'var(--fc-bgInput)',
    border: '1px solid var(--fc-border)',
    borderRadius: 4,
    padding: '5px 7px',
    color: 'var(--fc-text)',
    fontSize: 12,
    textAlign: 'right',
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>Sheet Cutting Layout</div>
      <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 10 }}>
        {stats.totalPieces} piece{stats.totalPieces !== 1 ? 's' : ''} &middot; {stats.totalAreaM2.toFixed(3)} m&sup2; total area
        {stats.materialCount > 1 ? ` \u00b7 ${stats.materialCount} materials` : ''}
      </div>

      {/* Stock sheet dimensions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--fc-textDim)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Stock sheet
          <input
            type="number"
            value={sheetWidth}
            onChange={(e) => setSheetWidth(Math.max(1, Number(e.target.value) || 1))}
            min={1}
            style={inputStyle}
          />
          <span style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>&times;</span>
          <input
            type="number"
            value={sheetHeight}
            onChange={(e) => setSheetHeight(Math.max(1, Number(e.target.value) || 1))}
            min={1}
            style={inputStyle}
          />
          <span style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>mm</span>
        </label>
      </div>

      <button
        onClick={doExport}
        disabled={busy}
        style={{
          width: '100%',
          padding: '7px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: !busy ? 'var(--fc-accent)' : 'var(--fc-border)',
          color: !busy ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
          border: 'none',
          borderRadius: 4,
          cursor: !busy ? 'pointer' : 'default',
          fontSize: 12,
        }}
      >
        {busy ? 'Generating Cutting Layout...' : 'Export Cutting Layout PDF'}
      </button>
    </div>
  );
}

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

/** Pick the smallest standard plywood sheet that fits the largest piece. */
function smartDefaults(entries: SheetStockDef[]): { w: number; h: number } {
  if (entries.length === 0) return { w: 2440, h: 1220 };

  // Max piece dimension in either orientation
  let maxLong = 0;
  let maxShort = 0;
  for (const e of entries) {
    const long = Math.max(e.width, e.height);
    const short = Math.min(e.width, e.height);
    if (long > maxLong) maxLong = long;
    if (short > maxShort) maxShort = short;
  }

  // Common plywood sheet sizes (width >= height)
  const standards: [number, number][] = [
    [1220, 610],
    [1525, 1525],
    [1830, 1220],
    [2440, 1220],
    [2440, 1830],
    [3050, 1525],
  ];

  for (const [w, h] of standards) {
    if (w >= maxLong && h >= maxShort) return { w, h };
  }

  // Nothing standard fits — round up to nearest 100mm
  return {
    w: Math.max(2440, Math.ceil(maxLong / 100) * 100),
    h: Math.max(1220, Math.ceil(maxShort / 100) * 100),
  };
}

interface CuttingLayoutPanelProps {
  fileStem: string;
  entries: SheetStockDef[];
}

export function CuttingLayoutPanel({ fileStem, entries }: CuttingLayoutPanelProps) {
  const defaults = useMemo(() => smartDefaults(entries), [entries]);
  const [sheetWidth, setSheetWidth] = useState(defaults.w);
  const [sheetHeight, setSheetHeight] = useState(defaults.h);
  const [kerf, setKerf] = useState(3);
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
    const stockArea = sheetWidth * sheetHeight;
    return { totalPieces, totalAreaM2: totalArea / 1_000_000, materialCount: materials.size, stockAreaM2: stockArea / 1_000_000 };
  }, [entries, sheetWidth, sheetHeight]);

  const doExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = generateCuttingLayoutPdf(entries, sheetWidth, sheetHeight, kerf);
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

  const smallInputStyle: React.CSSProperties = {
    ...inputStyle,
    width: 52,
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginBottom: 6 }}>Sheet Cutting Layout</div>
      <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 10 }}>
        {stats.totalPieces} piece{stats.totalPieces !== 1 ? 's' : ''} &middot; {stats.totalAreaM2.toFixed(3)} m&sup2; total piece area
        {stats.materialCount > 1 ? ` \u00b7 ${stats.materialCount} materials` : ''}
        &nbsp;&middot; Stock sheet: {stats.stockAreaM2.toFixed(3)} m&sup2;
      </div>

      {/* Stock sheet dimensions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
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

      {/* Kerf / cutting clearance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--fc-textDim)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Cutting clearance (kerf)
          <input
            type="number"
            value={kerf}
            onChange={(e) => setKerf(Math.max(0, Number(e.target.value) || 0))}
            min={0}
            max={20}
            step={0.5}
            style={smallInputStyle}
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

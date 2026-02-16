import { useState } from 'react';
import { generateReportPdf } from '@forge/index';
import { useForgeStore } from '../store/forgeStore';

function hexToRGB555(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // VisCAM/SolidView color STL: bit15=1, then RGB555
  return 0x8000 | ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

interface MeshEntry {
  mesh: { numTri: number; numProp: number; triVerts: Uint32Array; vertProperties: Float32Array };
  color: number; // RGB555 with bit15 set, or 0
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function buildSTL(entries: MeshEntry[]): ArrayBuffer {
  const totalTri = entries.reduce((sum, e) => sum + e.mesh.numTri, 0);
  const buffer = new ArrayBuffer(84 + totalTri * 50);
  const view = new DataView(buffer);

  const header = 'ForgeCAD STL Export (color)';
  for (let i = 0; i < 80; i++)
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  view.setUint32(80, totalTri, true);

  let offset = 84;
  for (const { mesh, color } of entries) {
    const { numTri, numProp, triVerts, vertProperties } = mesh;
    for (let t = 0; t < numTri; t++) {
      const i0 = triVerts[t * 3], i1 = triVerts[t * 3 + 1], i2 = triVerts[t * 3 + 2];
      const v0x = vertProperties[i0 * numProp], v0y = vertProperties[i0 * numProp + 1], v0z = vertProperties[i0 * numProp + 2];
      const v1x = vertProperties[i1 * numProp], v1y = vertProperties[i1 * numProp + 1], v1z = vertProperties[i1 * numProp + 2];
      const v2x = vertProperties[i2 * numProp], v2y = vertProperties[i2 * numProp + 1], v2z = vertProperties[i2 * numProp + 2];

      const e1x = v1x - v0x, e1y = v1y - v0y, e1z = v1z - v0z;
      const e2x = v2x - v0x, e2y = v2y - v0y, e2z = v2z - v0z;
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      view.setFloat32(offset, nx / len, true); offset += 4;
      view.setFloat32(offset, ny / len, true); offset += 4;
      view.setFloat32(offset, nz / len, true); offset += 4;
      view.setFloat32(offset, v0x, true); offset += 4;
      view.setFloat32(offset, v0y, true); offset += 4;
      view.setFloat32(offset, v0z, true); offset += 4;
      view.setFloat32(offset, v1x, true); offset += 4;
      view.setFloat32(offset, v1y, true); offset += 4;
      view.setFloat32(offset, v1z, true); offset += 4;
      view.setFloat32(offset, v2x, true); offset += 4;
      view.setFloat32(offset, v2y, true); offset += 4;
      view.setFloat32(offset, v2z, true); offset += 4;
      view.setUint16(offset, color, true); offset += 2;
    }
  }
  return buffer;
}

export function ExportPanel() {
  const result = useForgeStore((s) => s.result);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const activeFile = useForgeStore((s) => s.activeFile);
  const [reportBusy, setReportBusy] = useState(false);

  const shapeObjects = result?.objects?.filter((obj) => obj.shape) ?? [];
  const hasShapes = shapeObjects.length > 0;

  const exportSTL = () => {
    if (!hasShapes) return;

    const entries: MeshEntry[] = shapeObjects.map((obj) => {
      const color = objectSettings[obj.id]?.color || obj.color;
      return { mesh: obj.shape!.getMesh(), color: color ? hexToRGB555(color) : 0 };
    });

    const buffer = buildSTL(entries);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'forge-export.stl';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportReport = async () => {
    if (!result || !hasShapes || reportBusy) return;
    setReportBusy(true);
    try {
      // Let React commit `reportBusy` so the loading indicator is visible
      // before synchronous report generation blocks the main thread.
      await waitForNextPaint();

      const title = activeFile
        .replace(/^.*[\\/]/, '')
        .replace(/\.(forge\.)?js$/i, '')
        || 'ForgeCAD Report';

      const report = generateReportPdf(result, {
        title,
        includeDisassembled: true,
        objectVisuals: objectSettings,
      });

      const bytes = new Uint8Array(report.pdf);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Report export failed:', err);
      alert(`Report export failed: ${message}`);
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--fc-border)' }}>
      <button
        onClick={exportSTL}
        disabled={!hasShapes}
        style={{
          width: '100%',
          padding: '6px',
          background: hasShapes ? 'var(--fc-accent)' : 'var(--fc-border)',
          color: hasShapes ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
          border: 'none',
          borderRadius: 4,
          cursor: hasShapes ? 'pointer' : 'default',
          fontSize: 13,
        }}
      >
        Export STL{shapeObjects.length > 1 ? ` (${shapeObjects.length} objects)` : ''}
      </button>
      <button
        onClick={exportReport}
        disabled={!hasShapes || reportBusy}
        style={{
          width: '100%',
          marginTop: 8,
          padding: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: hasShapes && !reportBusy ? 'var(--fc-accent)' : 'var(--fc-border)',
          color: hasShapes && !reportBusy ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
          border: 'none',
          borderRadius: 4,
          cursor: hasShapes && !reportBusy ? 'pointer' : 'default',
          fontSize: 13,
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
  );
}

import { useMemo, useState } from 'react';
import { useForgeStore } from '../store/forgeStore';
import { CuttingLayoutPanel } from './CuttingLayoutPanel';
import { Export3DPanel } from './Export3DPanel';
import { ExportSketchPanel } from './ExportSketchPanel';
import { deriveExportStem } from './exportActions';

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function ExportPanel() {
  const result = useForgeStore((s) => s.lastValidResult);
  const activeFile = useForgeStore((s) => s.activeFile);
  const [dialogOpen, setDialogOpen] = useState(false);

  const shapeObjects = result?.objects?.filter((obj) => obj.shape) ?? [];
  const sketchObjects = result?.objects?.filter((obj) => obj.sketch) ?? [];
  const sheetStockEntries = useMemo(() => result?.sheetStock ?? [], [result]);
  const hasShapes = shapeObjects.length > 0;
  const hasSketches = sketchObjects.length > 0;
  const hasSheetStock = sheetStockEntries.length > 0;
  const defaultMeshStem = useMemo(() => deriveExportStem(activeFile), [activeFile]);

  const totalTriangles = useMemo(() => shapeObjects.reduce((sum, obj) => sum + (obj.shape?.numTri() ?? 0), 0), [shapeObjects]);

  const hasAnything = hasShapes || hasSketches || hasSheetStock;

  const openDialog = () => {
    if (!hasAnything) return;
    setDialogOpen(true);
  };

  const closeDialog = () => setDialogOpen(false);

  // Determine dialog title based on content
  const multiType = [hasShapes, hasSketches, hasSheetStock].filter(Boolean).length > 1;
  const dialogTitle = multiType ? 'Export' : hasShapes ? 'Export 3D' : hasSketches ? 'Export Sketch' : 'Export Cutting Layout';
  const subtitleParts: string[] = [];
  if (hasShapes) subtitleParts.push(`${pluralize(shapeObjects.length, 'object')} \u00b7 ${pluralize(totalTriangles, 'triangle')}`);
  if (hasSketches) subtitleParts.push(pluralize(sketchObjects.length, 'sketch', 'sketches'));
  if (hasSheetStock) subtitleParts.push(`${sheetStockEntries.length} sheet stock entr${sheetStockEntries.length === 1 ? 'y' : 'ies'}`);
  const subtitle = subtitleParts.join(' \u00b7 ');

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--fc-border)' }}>
      <button
        onClick={openDialog}
        disabled={!hasAnything}
        style={{
          width: '100%',
          padding: '7px 8px',
          background: hasAnything ? 'var(--fc-accent)' : 'var(--fc-border)',
          color: hasAnything ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
          border: 'none',
          borderRadius: 4,
          cursor: hasAnything ? 'pointer' : 'default',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {dialogTitle}...
      </button>
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
              maxHeight: 'calc(100vh - 64px)',
              overflowY: 'auto',
              background: 'var(--fc-bgPanel)',
              border: '1px solid var(--fc-border)',
              borderRadius: 8,
              boxShadow: '0 18px 48px rgba(0, 0, 0, 0.35)',
              padding: 14,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fc-text)' }}>{dialogTitle}</div>
                <div style={{ fontSize: 12, color: 'var(--fc-textDim)', marginTop: 2 }}>{subtitle}</div>
              </div>
              <button
                onClick={closeDialog}
                style={{
                  border: '1px solid var(--fc-border)',
                  background: 'transparent',
                  color: 'var(--fc-textMuted)',
                  borderRadius: 4,
                  width: 28,
                  height: 28,
                  cursor: 'pointer',
                  fontSize: 17,
                  lineHeight: 1,
                }}
                title="Close export dialog"
              >
                ×
              </button>
            </div>

            {/* 3D Export Panel */}
            {hasShapes && (
              <Export3DPanel
                fileStem={defaultMeshStem}
                defaultStem={defaultMeshStem}
                shapeCount={shapeObjects.length}
                totalTriangles={totalTriangles}
                onClose={closeDialog}
              />
            )}

            {/* 2D Sketch Export Panel */}
            {hasSketches && (
              <div style={hasShapes ? { borderTop: '1px solid var(--fc-borderLight)', marginTop: 12, paddingTop: 12 } : undefined}>
                <ExportSketchPanel fileStem={defaultMeshStem} />
              </div>
            )}

            {/* Sheet Cutting Layout */}
            {hasSheetStock && (
              <div
                style={
                  hasShapes || hasSketches ? { borderTop: '1px solid var(--fc-borderLight)', marginTop: 12, paddingTop: 12 } : undefined
                }
              >
                <CuttingLayoutPanel fileStem={defaultMeshStem} entries={sheetStockEntries} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

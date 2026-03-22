import { useMemo, useState } from 'react';
import { useForgeStore } from '../store/forgeStore';
import { deriveExportStem } from './exportActions';
import { Export3DPanel } from './Export3DPanel';
import { ExportSketchPanel } from './ExportSketchPanel';

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function ExportPanel() {
  const result = useForgeStore((s) => s.lastValidResult);
  const activeFile = useForgeStore((s) => s.activeFile);
  const [dialogOpen, setDialogOpen] = useState(false);

  const shapeObjects = result?.objects?.filter((obj) => obj.shape) ?? [];
  const sketchObjects = result?.objects?.filter((obj) => obj.sketch) ?? [];
  const hasShapes = shapeObjects.length > 0;
  const hasSketches = sketchObjects.length > 0;
  const defaultMeshStem = useMemo(() => deriveExportStem(activeFile), [activeFile]);

  const totalTriangles = useMemo(
    () => shapeObjects.reduce((sum, obj) => sum + (obj.shape?.numTri() ?? 0), 0),
    [shapeObjects],
  );

  const openDialog = () => {
    if (!hasShapes && !hasSketches) return;
    setDialogOpen(true);
  };

  const closeDialog = () => setDialogOpen(false);

  // Determine dialog title based on content
  const dialogTitle = hasShapes && hasSketches ? 'Export' : hasShapes ? 'Export 3D' : 'Export Sketch';
  const subtitle = hasShapes
    ? `${pluralize(shapeObjects.length, 'object')} · ${pluralize(totalTriangles, 'triangle')}`
    : `${pluralize(sketchObjects.length, 'sketch', 'sketches')}`;

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--fc-border)' }}>
      <button
        onClick={openDialog}
        disabled={!hasShapes && !hasSketches}
        style={{
          width: '100%',
          padding: '7px 8px',
          background: (hasShapes || hasSketches) ? 'var(--fc-accent)' : 'var(--fc-border)',
          color: (hasShapes || hasSketches) ? 'var(--fc-accentText)' : 'var(--fc-textDim)',
          border: 'none',
          borderRadius: 4,
          cursor: (hasShapes || hasSketches) ? 'pointer' : 'default',
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
          </div>
        </div>
      )}
    </div>
  );
}

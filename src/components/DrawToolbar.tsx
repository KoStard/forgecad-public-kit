/**
 * Draw mode toolbar — floating tool palette shown over the viewport.
 * Provides tool selection, status display, and keyboard shortcut handling.
 */
import { useEffect, useCallback } from 'react';
import { useDrawStore, type DrawTool } from '../draw/drawStore';

const tools: { id: DrawTool; label: string; icon: string; shortcut: string; tip: string }[] = [
  { id: 'point', label: 'Point', icon: '·', shortcut: 'P', tip: 'Click to place a point' },
  { id: 'line', label: 'Line', icon: '╱', shortcut: 'L', tip: 'Click two points to draw a line' },
  { id: 'rectangle', label: 'Rect', icon: '▭', shortcut: 'R', tip: 'Click two corners to draw a rectangle' },
  { id: 'circle', label: 'Circle', icon: '○', shortcut: 'C', tip: 'Click center, then edge to draw a circle' },
];

export function DrawToolbar() {
  const active = useDrawStore((s) => s.active);
  const tool = useDrawStore((s) => s.tool);
  const setTool = useDrawStore((s) => s.setTool);
  const exitDrawMode = useDrawStore((s) => s.exitDrawMode);
  const cancelPending = useDrawStore((s) => s.cancelPending);
  const undo = useDrawStore((s) => s.undo);
  const pendingClicks = useDrawStore((s) => s.pendingClicks);
  const statements = useDrawStore((s) => s.statements);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return;
    // Don't intercept if user is typing in an input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.target as HTMLElement)?.closest('[data-fc-editor-surface]')) return;

    switch (e.key) {
      case 'Escape':
        if (pendingClicks.length > 0) {
          cancelPending();
        } else {
          exitDrawMode();
        }
        e.preventDefault();
        break;
      case 'p':
      case 'P':
        setTool('point');
        e.preventDefault();
        break;
      case 'l':
      case 'L':
        setTool('line');
        e.preventDefault();
        break;
      case 'r':
      case 'R':
        setTool('rectangle');
        e.preventDefault();
        break;
      case 'c':
      case 'C':
        setTool('circle');
        e.preventDefault();
        break;
      case 'z':
      case 'Z':
        if (e.metaKey || e.ctrlKey) {
          undo();
          e.preventDefault();
        }
        break;
    }
  }, [active, pendingClicks.length, cancelPending, exitDrawMode, setTool, undo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!active) return null;

  const toolTip = tools.find((t) => t.id === tool)?.tip ?? '';
  const pendingLabel = pendingClicks.length > 0
    ? tool === 'line' ? 'Click second point...'
    : tool === 'rectangle' ? 'Click opposite corner...'
    : tool === 'circle' ? 'Click edge point...'
    : ''
    : toolTip;

  return (
    <>
      {/* Left-side tool palette */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          background: 'var(--fc-bgPanel)',
          border: '1px solid var(--fc-border)',
          borderRadius: 8,
          padding: 4,
          zIndex: 15,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        }}
      >
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.shortcut})`}
            style={{
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: 6,
              background: tool === t.id ? 'var(--fc-accent)' : 'transparent',
              color: tool === t.id ? 'var(--fc-accentText)' : 'var(--fc-text)',
              fontSize: 18,
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            {t.icon}
          </button>
        ))}

        <div style={{ height: 1, background: 'var(--fc-border)', margin: '4px 0' }} />

        <button
          onClick={exitDrawMode}
          title="Done drawing (Esc)"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: 6,
            background: 'var(--fc-success)',
            color: '#fff',
            fontSize: 14,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          ✓
        </button>
      </div>

      {/* Top status bar */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--fc-accent)',
          color: 'var(--fc-accentText)',
          padding: '5px 16px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          zIndex: 15,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        }}
      >
        <span>Draw Mode</span>
        <span style={{ opacity: 0.8, fontWeight: 400 }}>{pendingLabel}</span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>
          {statements.length} statement{statements.length !== 1 ? 's' : ''}
        </span>
        <kbd
          style={{
            fontSize: 10,
            opacity: 0.6,
            fontFamily: 'inherit',
            background: 'rgba(255,255,255,0.15)',
            padding: '1px 5px',
            borderRadius: 3,
          }}
        >
          Esc to finish
        </kbd>
      </div>
    </>
  );
}

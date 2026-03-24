import { useEffect } from 'react';
import { useForgeStore } from '../store/forgeStore';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

const sections: { title: string; shortcuts: { keys: string; description: string }[] }[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: `${mod}⇧P`, description: 'Command palette' },
      { keys: `${mod}K`, description: 'Switch file' },
      { keys: '?', description: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Viewport',
    shortcuts: [
      { keys: `${mod}⇧F`, description: 'Fit geometry to view' },
      { keys: `${mod}⇧H`, description: 'Snap to isometric view' },
      { keys: 'Drag', description: 'Orbit camera' },
      { keys: 'Scroll', description: 'Zoom in / out' },
      { keys: 'Right-click', description: 'Pan camera' },
      { keys: 'Double-click', description: 'Focus object' },
      { keys: 'Right-click object', description: 'Context menu (Info, Hide)' },
      { keys: 'Esc', description: 'Clear focused objects' },
    ],
  },
  {
    title: 'Code Editor',
    shortcuts: [
      { keys: `${mod}S`, description: 'Save file' },
      { keys: `${mod}Z`, description: 'Undo' },
      { keys: `${mod}⇧Z`, description: 'Redo' },
      { keys: `${mod}F`, description: 'Find in file' },
      { keys: `${mod}Space`, description: 'Trigger IntelliSense' },
    ],
  },
  {
    title: 'Construction Tree',
    shortcuts: [
      { keys: '↑ / ↓', description: 'Navigate nodes' },
      { keys: '→ / ←', description: 'Expand / collapse or enter / exit node' },
      { keys: 'Esc', description: 'Clear selection' },
    ],
  },
  {
    title: 'Panel Resize',
    shortcuts: [
      { keys: 'Drag divider', description: 'Resize panel' },
      { keys: '← / → (focused)', description: 'Nudge panel width (16 px)' },
      { keys: '⇧← / ⇧→ (focused)', description: 'Nudge panel width (48 px)' },
      { keys: 'Home / End (focused)', description: 'Minimize / maximize panel' },
    ],
  },
];

export function KeyboardShortcutsOverlay() {
  const open = useForgeStore((s) => s.shortcutsOverlayOpen);
  const close = useForgeStore((s) => s.closeShortcutsOverlay);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        close();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px 16px',
      }}
      onClick={close}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--fc-bg)', opacity: 0.6 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 560,
          maxHeight: '80vh',
          background: 'var(--fc-bgPanel)',
          border: '1px solid var(--fc-border)',
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--fc-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fc-text)' }}>Keyboard Shortcuts</span>
          <button
            onClick={close}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--fc-textDim)',
              fontSize: 18,
              lineHeight: 1,
              padding: '0 2px',
            }}
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 18px 18px' }}>
          {sections.map((section) => (
            <div key={section.title} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--fc-textDim)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}
              >
                {section.title}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {section.shortcuts.map(({ keys, description }) => (
                    <tr key={keys} style={{ borderBottom: '1px solid var(--fc-borderLight)' }}>
                      <td style={{ padding: '5px 10px 5px 0', width: 1, whiteSpace: 'nowrap' }}>
                        <kbd
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            background: 'var(--fc-bgSurface)',
                            border: '1px solid var(--fc-border)',
                            borderRadius: 4,
                            fontSize: 12,
                            fontFamily: 'inherit',
                            color: 'var(--fc-text)',
                            lineHeight: 1.4,
                          }}
                        >
                          {keys}
                        </kbd>
                      </td>
                      <td style={{ padding: '5px 0', fontSize: 13, color: 'var(--fc-textMuted)' }}>{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

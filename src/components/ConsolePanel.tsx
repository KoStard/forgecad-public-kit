import { useState } from 'react';
import { useForgeStore } from '../store/forgeStore';

const levelColors: Record<string, string> = {
  warn: 'var(--fc-warning, #e6a817)',
  error: 'var(--fc-error, #e05252)',
};

export function ConsolePanel() {
  const logs = useForgeStore((s) => s.consoleLogs);
  const [collapsed, setCollapsed] = useState(true);

  if (logs.length === 0) return null;

  return (
    <div style={{ maxHeight: '40%', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--fc-border)', background: 'var(--fc-bg)' }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '6px 12px',
          fontSize: 11,
          color: 'var(--fc-textDim)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Console ({logs.length})</span>
        <span style={{ fontSize: 10 }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && (
        <div style={{ overflowY: 'auto', padding: '0 12px 8px', fontFamily: 'monospace', fontSize: 12 }}>
          {logs.map((entry, i) => (
            <div key={i} style={{ color: levelColors[entry.level] || 'var(--fc-text)', padding: '1px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {entry.args.join(' ')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

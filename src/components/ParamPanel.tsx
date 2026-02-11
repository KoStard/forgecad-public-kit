import { useState } from 'react';
import { useForgeStore } from '../store/forgeStore';

export function ParamPanel() {
  const params = useForgeStore((s) => s.params);
  const setParam = useForgeStore((s) => s.setParam);
  const [collapsed, setCollapsed] = useState(false);

  if (params.length === 0) return null;

  return (
    <div style={{ maxHeight: '50%', display: 'flex', flexDirection: 'column', borderTop: '1px solid #333', background: '#1e1e1e' }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '6px 12px',
          fontSize: 11,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: 1,
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Parameters ({params.length})</span>
        <span style={{ fontSize: 10 }}>{collapsed ? '▶' : '▼'}</span>
      </div>
      {!collapsed && (
        <div style={{ overflowY: 'auto', padding: '0 12px 8px' }}>
          {params.map((p) => (
            <div key={p.name} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: '#ccc' }}>{p.name}</span>
                <span style={{ color: '#4a9eff', fontFamily: 'monospace' }}>
                  {p.value}{p.unit ? ` ${p.unit}` : ''}
                </span>
              </div>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={p.value}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setParam(p.name, p.integer ? Math.round(v) : v);
                }}
                style={{ width: '100%', accentColor: '#4a9eff', direction: p.reverse ? 'rtl' : undefined }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

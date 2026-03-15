import { useState, useMemo } from 'react';
import { useForgeStore } from '../store/forgeStore';

export function ParamPanel() {
  const params = useForgeStore((s) => s.params);
  const paramOverrides = useForgeStore((s) => s.paramOverrides);
  const setParam = useForgeStore((s) => s.setParam);
  const resetParams = useForgeStore((s) => s.resetParamOverrides);
  const [collapsed, setCollapsed] = useState(false);

  const hasOverrides = useMemo(
    () => params.some((p) => p.value !== p.defaultValue),
    [params],
  );

  if (params.length === 0) return null;

  return (
    <div style={{ maxHeight: '50%', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--fc-border)', background: 'var(--fc-bg)' }}>
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
        <span>Parameters ({params.length})</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {hasOverrides && (
            <button
              onClick={(e) => { e.stopPropagation(); resetParams(); }}
              title="Reset all parameters to defaults"
              style={{
                background: 'none',
                border: '1px solid var(--fc-border)',
                borderRadius: 3,
                color: 'var(--fc-textDim)',
                fontSize: 10,
                padding: '1px 5px',
                cursor: 'pointer',
                lineHeight: '14px',
              }}
            >
              Reset
            </button>
          )}
          <span style={{ fontSize: 10 }}>{collapsed ? '▶' : '▼'}</span>
        </span>
      </div>
      {!collapsed && (
        <div style={{ overflowY: 'auto', padding: '0 12px 8px' }}>
          {params.map((p) => {
            // Use the in-flight override if present — makes the slider feel instant
            // even while the model is still evaluating.
            const displayValue = paramOverrides[p.name] ?? p.value;
            const isChanged = displayValue !== p.defaultValue;
            return (
              <div key={p.name} style={{ marginBottom: 6 }}>
                {p.boolean ? (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={displayValue === 1}
                      onChange={(e) => setParam(p.name, e.target.checked ? 1 : 0)}
                      style={{ accentColor: 'var(--fc-accent)' }}
                    />
                    <span style={{ color: isChanged ? 'var(--fc-accent)' : 'var(--fc-text)', fontWeight: isChanged ? 600 : 400 }}>
                      {p.name}
                    </span>
                  </label>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                      <span style={{ color: isChanged ? 'var(--fc-accent)' : 'var(--fc-text)', fontWeight: isChanged ? 600 : 400 }}>
                        {p.name}
                      </span>
                      <span style={{ color: 'var(--fc-accent)', fontFamily: 'monospace' }}>
                        {displayValue}{p.unit ? ` ${p.unit}` : ''}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      value={displayValue}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setParam(p.name, p.integer ? Math.round(v) : v);
                      }}
                      style={{ width: '100%', accentColor: 'var(--fc-accent)', direction: p.reverse ? 'rtl' : undefined }}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

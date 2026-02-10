import { useForgeStore } from '../store/forgeStore';

export function ParamPanel() {
  const params = useForgeStore((s) => s.params);
  const setParam = useForgeStore((s) => s.setParam);

  if (params.length === 0) return null;

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid #333', background: '#1e1e1e' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
        Parameters
      </div>
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
            style={{ width: '100%', accentColor: '#4a9eff' }}
          />
        </div>
      ))}
    </div>
  );
}

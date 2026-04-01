/**
 * Compact parameter sliders for mobile — shown below the code editor.
 */
import { useForgeStore } from '../store/forgeStore';

export function MobileParams() {
  const params = useForgeStore((s) => s.params);
  const paramOverrides = useForgeStore((s) => s.paramOverrides);
  const setParam = useForgeStore((s) => s.setParam);

  if (params.length === 0) return null;

  return (
    <div className="fc-mobile-params">
      {params.map((p) => {
        const value = paramOverrides[p.name] ?? p.defaultValue;
        return (
          <div key={p.name} className="fc-mobile-param-row">
            <span className="fc-mobile-param-label">{p.name}</span>
            <input
              type="range"
              className="fc-mobile-param-slider"
              min={p.min}
              max={p.max}
              step={p.step ?? (p.max - p.min) / 100}
              value={value}
              onChange={(e) => setParam(p.name, parseFloat(e.target.value))}
            />
            <span className="fc-mobile-param-value">{value.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

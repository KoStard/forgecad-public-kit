import { useMemo } from 'react';
import { useForgeStore } from '../store/forgeStore';
import { themes, applyTheme, type ThemeName } from '../theme';

const THEME_NAMES = Object.keys(themes) as ThemeName[];

const formatMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

export function StatusBar() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const result = useForgeStore((s) => s.lastValidResult);
  const isEvaluating = useForgeStore((s) => s.isEvaluating);
  const theme = useForgeStore((s) => s.theme);
  const setTheme = useForgeStore((s) => s.setTheme);
  const activeBackend = useForgeStore((s) => s.activeBackend);

  const objectCount = result?.objects?.length ?? 0;
  const evalTime = result?.timeMs ?? null;
  const errorCount = result?.error ? 1 : 0;
  const verificationFails = useMemo(
    () => result?.verifications?.filter((v) => v.status === 'fail').length ?? 0,
    [result?.verifications],
  );

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value as ThemeName;
    setTheme(name);
    applyTheme(name);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '2px 12px',
      background: 'var(--fc-bgPanel)',
      borderTop: '1px solid var(--fc-border)',
      fontSize: 11,
      color: 'var(--fc-textDim)',
      userSelect: 'none',
      flexShrink: 0,
      height: 24,
    }}>
      {/* File name */}
      <span style={{ fontWeight: 500, color: 'var(--fc-textMuted)' }}>
        {activeFile || 'No file'}
      </span>

      <span style={{ flex: 1 }} />

      {/* Error/verification status */}
      {errorCount > 0 && (
        <span style={{ color: 'var(--fc-error)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 9 }}>●</span> Error
        </span>
      )}
      {verificationFails > 0 && errorCount === 0 && (
        <span style={{ color: 'var(--fc-warning)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 9 }}>●</span> {verificationFails} fail{verificationFails !== 1 ? 's' : ''}
        </span>
      )}
      {errorCount === 0 && verificationFails === 0 && result && !isEvaluating && (
        <span style={{ color: 'var(--fc-success)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 9 }}>●</span> OK
        </span>
      )}

      {/* Eval time */}
      {evalTime !== null && (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {formatMs(evalTime)}
        </span>
      )}

      {/* Object count */}
      {objectCount > 0 && (
        <span>{objectCount} object{objectCount !== 1 ? 's' : ''}</span>
      )}

      {/* Backend */}
      <span style={{ textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
        {activeBackend}
      </span>

      {/* Theme switcher */}
      <select
        value={theme}
        onChange={handleThemeChange}
        title="Switch theme"
        style={{
          background: 'var(--fc-bgInput)',
          border: '1px solid var(--fc-border)',
          borderRadius: 3,
          color: 'var(--fc-textDim)',
          fontSize: 10,
          padding: '0 4px',
          height: 18,
          cursor: 'pointer',
        }}
      >
        {THEME_NAMES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

/* --- Evaluation Indicator --- */

export const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

export const PHASE_CONFIG: Record<string, { color: string; label: string }> = {
  'kernel-init': { color: '#f5a623', label: 'Loading geometry kernel' },
  evaluating: { color: '#4a9eff', label: 'Evaluating model' },
  serializing: { color: '#7c4dff', label: 'Preparing display' },
  exporting: { color: '#4caf50', label: 'Exporting geometry' },
  idle: { color: '#888', label: '' },
};

export const PHASE_ORDER: Array<string> = ['kernel-init', 'evaluating', 'serializing'];

export function EvaluationIndicator({ phase }: { phase: string }) {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  // Reset timer when phase changes
  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
  }, [phase]);

  useEffect(() => {
    const spinnerInterval = setInterval(() => setFrame((f) => (f + 1) % BRAILLE_FRAMES.length), 80);
    const timerInterval = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
    return () => {
      clearInterval(spinnerInterval);
      clearInterval(timerInterval);
    };
  }, []);

  const config = PHASE_CONFIG[phase] ?? PHASE_CONFIG['evaluating'];
  const elapsedSec = (elapsed / 1000).toFixed(1);
  const phaseIdx = PHASE_ORDER.indexOf(phase);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        background: 'var(--fc-bgPanel)',
        border: '1px solid var(--fc-border)',
        borderRadius: 8,
        padding: '8px 14px',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 12,
        animation: 'fc-fadein 0.2s ease-out',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      }}
    >
      {/* Spinner */}
      <span style={{ color: config.color, fontSize: 16, fontWeight: 700, width: 16, textAlign: 'center' }}>{BRAILLE_FRAMES[frame]}</span>

      {/* Label */}
      <span style={{ color: 'var(--fc-text)', fontWeight: 500 }}>{config.label}</span>

      {/* Phase dots */}
      <span style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 2 }}>
        {PHASE_ORDER.map((p, i) => (
          <span
            key={p}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: i <= phaseIdx ? (PHASE_CONFIG[p]?.color ?? 'var(--fc-border)') : 'var(--fc-border)',
              transition: 'background 0.3s ease',
              animation: i === phaseIdx ? 'fc-pulse 1.2s ease-in-out infinite' : undefined,
            }}
          />
        ))}
      </span>

      {/* Elapsed time */}
      <span style={{ color: 'var(--fc-textDim)', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{elapsedSec}s</span>
    </div>
  );
}

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Toast store — lightweight pub/sub, no Zustand dependency
// ---------------------------------------------------------------------------

type ToastVariant = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

let nextId = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function notify() { listeners.forEach((l) => l()); }

export function showToast(message: string, variant: ToastVariant = 'info', durationMs = 3000) {
  const toast: Toast = { id: nextId++, message, variant, durationMs };
  toasts = [...toasts, toast];
  notify();

  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    notify();
  }, durationMs);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot() { return toasts; }

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const VARIANT_COLORS: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  success: { bg: 'var(--fc-successBg)', border: 'var(--fc-success)', icon: '✓' },
  error:   { bg: 'var(--fc-errorBg)',   border: 'var(--fc-error)',   icon: '✕' },
  info:    { bg: 'var(--fc-bgSurface)',  border: 'var(--fc-accent)',  icon: 'ℹ' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const [exiting, setExiting] = useState(false);
  const colors = VARIANT_COLORS[toast.variant];

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), toast.durationMs - 300);
    return () => clearTimeout(timer);
  }, [toast.durationMs]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--fc-text)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        animation: exiting ? 'fc-slide-out-right 0.25s ease-in forwards' : 'fc-slide-in-right 0.25s ease-out',
        pointerEvents: 'auto',
        maxWidth: 320,
      }}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: colors.border,
        color: '#fff',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {colors.icon}
      </span>
      <span>{toast.message}</span>
    </div>
  );
}

export function ToastContainer() {
  const items = useSyncExternalStore(subscribe, getSnapshot);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 52,
      right: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 9999,
      pointerEvents: 'none',
    }}>
      {items.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}

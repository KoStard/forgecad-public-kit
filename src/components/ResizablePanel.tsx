import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

type ResizeEdge = 'left' | 'right';

interface ResizablePanelProps {
  children: ReactNode;
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  edge: ResizeEdge;
  handleLabel: string;
  panelStyle?: CSSProperties;
}

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

interface BodyStyleState {
  cursor: string;
  userSelect: string;
}

const HANDLE_WIDTH = 8;

function clampWidth(value: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, value));
}

function readStoredWidth(storageKey: string, fallback: number, minWidth: number, maxWidth: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? Number(raw) : Number.NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return clampWidth(parsed, minWidth, maxWidth);
  } catch {
    return fallback;
  }
}

function persistStoredWidth(storageKey: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, String(value));
  } catch {
    // Ignore storage failures such as private mode or quota exhaustion.
  }
}

export function ResizablePanel({
  children,
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  edge,
  handleLabel,
  panelStyle,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(() => readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth));
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const bodyStyleRef = useRef<BodyStyleState | null>(null);

  useEffect(() => {
    setWidth((currentWidth) => clampWidth(currentWidth, minWidth, maxWidth));
  }, [minWidth, maxWidth]);

  useEffect(() => {
    persistStoredWidth(storageKey, width);
  }, [storageKey, width]);

  useEffect(() => {
    const restoreBodyStyles = () => {
      if (!bodyStyleRef.current || typeof document === 'undefined') return;
      document.body.style.cursor = bodyStyleRef.current.cursor;
      document.body.style.userSelect = bodyStyleRef.current.userSelect;
      bodyStyleRef.current = null;
    };

    const stopDrag = () => {
      dragStateRef.current = null;
      setIsDragging(false);
      restoreBodyStyles();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - dragState.startX;
      const signedDelta = edge === 'right' ? deltaX : -deltaX;
      setWidth(clampWidth(dragState.startWidth + signedDelta, minWidth, maxWidth));
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      stopDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      stopDrag();
    };
  }, [edge, minWidth, maxWidth]);

  const nudgeWidth = (delta: number) => {
    const signedDelta = edge === 'right' ? delta : -delta;
    setWidth((currentWidth) => clampWidth(currentWidth + signedDelta, minWidth, maxWidth));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();

    if (typeof document !== 'undefined' && !bodyStyleRef.current) {
      bodyStyleRef.current = {
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect,
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
    setIsDragging(true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      setWidth(minWidth);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setWidth(maxWidth);
      return;
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    nudgeWidth(event.key === 'ArrowRight' ? step : -step);
  };

  const handleStyle: CSSProperties = {
    width: HANDLE_WIDTH,
    flexShrink: 0,
    cursor: 'col-resize',
    background: isDragging ? 'var(--fc-bgActive)' : 'var(--fc-bgOverlay)',
    touchAction: 'none',
    position: 'relative',
    outline: 'none',
    borderLeft: edge === 'left' ? '1px solid var(--fc-border)' : undefined,
    borderRight: edge === 'right' ? '1px solid var(--fc-border)' : undefined,
  };

  const handle = (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={handleLabel}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={width}
      tabIndex={0}
      title={`${handleLabel}. Drag to resize, double-click to reset.`}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => setWidth(defaultWidth)}
      onKeyDown={handleKeyDown}
      className="fc-resize-handle"
      style={handleStyle}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 2,
          height: 44,
          borderRadius: 999,
          background: isDragging ? 'var(--fc-accent)' : 'var(--fc-borderLight)',
          transition: 'background 0.15s ease',
        }}
      />
    </div>
  );

  const panel = (
    <div
      style={{
        width,
        minWidth,
        maxWidth,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        ...panelStyle,
      }}
    >
      {children}
    </div>
  );

  return edge === 'right' ? (
    <>
      {panel}
      {handle}
    </>
  ) : (
    <>
      {handle}
      {panel}
    </>
  );
}

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

type ResizeEdge = 'left' | 'right' | 'top' | 'bottom';

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
  startPos: number;
  startSize: number;
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
  const isVertical = edge === 'top' || edge === 'bottom';
  const [size, setSize] = useState(() => readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth));
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const bodyStyleRef = useRef<BodyStyleState | null>(null);

  useEffect(() => {
    setSize((current) => clampWidth(current, minWidth, maxWidth));
  }, [minWidth, maxWidth]);

  useEffect(() => {
    persistStoredWidth(storageKey, size);
  }, [storageKey, size]);

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
      const delta = isVertical ? event.clientY - dragState.startPos : event.clientX - dragState.startPos;
      const signedDelta = edge === 'right' || edge === 'bottom' ? delta : -delta;
      setSize(clampWidth(dragState.startSize + signedDelta, minWidth, maxWidth));
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
  }, [edge, isVertical, minWidth, maxWidth]);

  const nudgeSize = (delta: number) => {
    const signedDelta = edge === 'right' || edge === 'bottom' ? delta : -delta;
    setSize((current) => clampWidth(current + signedDelta, minWidth, maxWidth));
  };

  const cursorStyle = isVertical ? 'row-resize' : 'col-resize';

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();

    if (typeof document !== 'undefined' && !bodyStyleRef.current) {
      bodyStyleRef.current = {
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect,
      };
      document.body.style.cursor = cursorStyle;
      document.body.style.userSelect = 'none';
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startPos: isVertical ? event.clientY : event.clientX,
      startSize: size,
    };
    setIsDragging(true);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      setSize(minWidth);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setSize(maxWidth);
      return;
    }
    const growKey = isVertical ? 'ArrowDown' : 'ArrowRight';
    const shrinkKey = isVertical ? 'ArrowUp' : 'ArrowLeft';
    if (event.key !== growKey && event.key !== shrinkKey) return;

    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    nudgeSize(event.key === growKey ? step : -step);
  };

  const handleStyle: CSSProperties = isVertical
    ? {
        height: HANDLE_WIDTH,
        flexShrink: 0,
        cursor: cursorStyle,
        background: isDragging ? 'var(--fc-bgActive)' : 'var(--fc-bgOverlay)',
        touchAction: 'none',
        position: 'relative',
        outline: 'none',
        borderTop: edge === 'top' ? '1px solid var(--fc-border)' : undefined,
        borderBottom: edge === 'bottom' ? '1px solid var(--fc-border)' : undefined,
      }
    : {
        width: HANDLE_WIDTH,
        flexShrink: 0,
        cursor: cursorStyle,
        background: isDragging ? 'var(--fc-bgActive)' : 'var(--fc-bgOverlay)',
        touchAction: 'none',
        position: 'relative',
        outline: 'none',
        borderLeft: edge === 'left' ? '1px solid var(--fc-border)' : undefined,
        borderRight: edge === 'right' ? '1px solid var(--fc-border)' : undefined,
      };

  const indicatorStyle: CSSProperties = isVertical
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        height: 2,
        width: 44,
        borderRadius: 999,
        background: isDragging ? 'var(--fc-accent)' : 'var(--fc-borderLight)',
        transition: 'background 0.15s ease',
      }
    : {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 2,
        height: 44,
        borderRadius: 999,
        background: isDragging ? 'var(--fc-accent)' : 'var(--fc-borderLight)',
        transition: 'background 0.15s ease',
      };

  const handle = (
    <div
      role="separator"
      aria-orientation={isVertical ? 'horizontal' : 'vertical'}
      aria-label={handleLabel}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={size}
      tabIndex={0}
      title={`${handleLabel}. Drag to resize, double-click to reset.`}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => setSize(defaultWidth)}
      onKeyDown={handleKeyDown}
      className="fc-resize-handle"
      style={handleStyle}
    >
      <div style={indicatorStyle} />
    </div>
  );

  const panelSizeStyle: CSSProperties = isVertical
    ? { height: size, minHeight: minWidth, maxHeight: maxWidth, minWidth: 0 }
    : { width: size, minWidth, maxWidth, minHeight: 0 };

  const panel = (
    <div
      style={{
        ...panelSizeStyle,
        display: 'flex',
        flexDirection: 'column',
        ...panelStyle,
      }}
    >
      {children}
    </div>
  );

  const handleFirst = edge === 'left' || edge === 'top';
  return handleFirst ? (
    <>
      {handle}
      {panel}
    </>
  ) : (
    <>
      {panel}
      {handle}
    </>
  );
}

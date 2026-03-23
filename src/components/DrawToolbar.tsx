/**
 * Draw mode toolbar — floating tool palette, constraint palette, and status bar.
 * Provides tool selection, constraint application, and keyboard shortcut handling.
 */
import { useEffect, useCallback, useState, useRef, type CSSProperties } from 'react';
import {
  useDrawStore,
  type DrawTool,
  type ConstraintTool,
  isConstraintTool,
  isDrawingTool,
  isEditTool,
} from '../draw/drawStore';

// ─── Tool definitions ────────────────────────────────────────────────────────

interface ToolDef {
  id: DrawTool;
  label: string;
  icon: string;
  shortcut?: string;
  tip: string;
  section: 'draw' | 'constraint' | 'edit';
  /** For constraint tools: what entity types are required (e.g., ['line'] or ['point', 'point']) */
  requires?: string[];
  /** Whether this constraint needs a numeric value input */
  needsValue?: boolean;
}

const drawTools: ToolDef[] = [
  { id: 'select', label: 'Select', icon: '⊹', shortcut: 'V', tip: 'Select entities for constraints', section: 'draw' },
  { id: 'point', label: 'Point', icon: '·', shortcut: 'P', tip: 'Click to place a point', section: 'draw' },
  { id: 'line', label: 'Line', icon: '╱', shortcut: 'L', tip: 'Click two points to draw a line', section: 'draw' },
  { id: 'polyline', label: 'Polyline', icon: '⏍', shortcut: 'W', tip: 'Click points, double-click to finish', section: 'draw' },
  { id: 'rectangle', label: 'Rect', icon: '▭', shortcut: 'R', tip: 'Click two corners to draw a rectangle', section: 'draw' },
  { id: 'circle', label: 'Circle', icon: '○', shortcut: 'C', tip: 'Click center, then edge to draw a circle', section: 'draw' },
  { id: 'arc', label: 'Arc', icon: '⌒', shortcut: 'A', tip: 'Click 3 points to draw an arc', section: 'draw' },
  { id: 'polygon', label: 'Polygon', icon: '⬡', shortcut: 'G', tip: 'Click center, then vertex for regular polygon', section: 'draw' },
  { id: 'ellipse', label: 'Ellipse', icon: '⬮', shortcut: 'E', tip: 'Click center, then bounding box corner', section: 'draw' },
  { id: 'slot', label: 'Slot', icon: '⊝', shortcut: 'S', tip: 'Click two centers, then set width', section: 'draw' },
];

const constraintTools: ToolDef[] = [
  { id: 'c:horizontal', label: 'Horizontal', icon: '━', shortcut: 'H', tip: 'Make line horizontal', section: 'constraint', requires: ['line'] },
  { id: 'c:vertical', label: 'Vertical', icon: '┃', tip: 'Make line vertical', section: 'constraint', requires: ['line'] },
  { id: 'c:length', label: 'Length', icon: '↔', shortcut: 'D', tip: 'Set line length', section: 'constraint', requires: ['line'], needsValue: true },
  { id: 'c:distance', label: 'Distance', icon: '⟷', tip: 'Set distance between points', section: 'constraint', requires: ['point', 'point'], needsValue: true },
  { id: 'c:angle', label: 'Angle', icon: '∠', tip: 'Set angle between lines', section: 'constraint', requires: ['line', 'line'], needsValue: true },
  { id: 'c:radius', label: 'Radius', icon: 'R', tip: 'Set circle radius', section: 'constraint', requires: ['circle'], needsValue: true },
  { id: 'c:parallel', label: 'Parallel', icon: '∥', tip: 'Make lines parallel', section: 'constraint', requires: ['line', 'line'] },
  { id: 'c:perpendicular', label: 'Perp', icon: '⊥', tip: 'Make lines perpendicular', section: 'constraint', requires: ['line', 'line'] },
  { id: 'c:coincident', label: 'Coincident', icon: '⊙', tip: 'Make points coincident', section: 'constraint', requires: ['point', 'point'] },
  { id: 'c:tangent', label: 'Tangent', icon: '⊸', tip: 'Make line tangent to circle', section: 'constraint', requires: ['line', 'circle'] },
  { id: 'c:equal', label: 'Equal', icon: '=', tip: 'Make entities equal', section: 'constraint', requires: ['line', 'line'] },
  { id: 'c:fixed', label: 'Fix', icon: '📌', tip: 'Fix point position', section: 'constraint', requires: ['point'] },
  { id: 'c:midpoint', label: 'Midpoint', icon: '⊥·', tip: 'Point at midpoint of line', section: 'constraint', requires: ['point', 'line'] },
  { id: 'c:symmetric', label: 'Symmetric', icon: '⇄', tip: 'Make points symmetric about line', section: 'constraint', requires: ['point', 'point'] },
  { id: 'c:concentric', label: 'Concentric', icon: '◎', tip: 'Make circles concentric', section: 'constraint', requires: ['circle', 'circle'] },
  { id: 'c:pointOnLine', label: 'On Line', icon: '⊶', shortcut: 'O', tip: 'Constrain point onto a line', section: 'constraint', requires: ['point', 'line'] },
  { id: 'c:pointOnCircle', label: 'On Circle', icon: '⊕', tip: 'Constrain point onto a circle', section: 'constraint', requires: ['point', 'circle'] },
];

const editTools: ToolDef[] = [
  { id: 'trim', label: 'Trim', icon: '✂', shortcut: 'T', tip: 'Click entity to remove it', section: 'edit' },
  { id: 'mirror', label: 'Mirror', icon: '⧓', shortcut: 'I', tip: 'Select mirror line, then click to place mirrored points', section: 'edit' },
  { id: 'offset', label: 'Offset', icon: '⧈', shortcut: 'F', tip: 'Click entity, then click to set offset distance', section: 'edit' },
];

const allTools = [...drawTools, ...editTools, ...constraintTools];

// ─── Dimension Input Popup ───────────────────────────────────────────────────

function DimensionInputPopup({ label, onSubmit, onCancel }: {
  label: string;
  onSubmit: (value: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const num = parseFloat(value);
    if (isFinite(num) && num > 0) {
      onSubmit(num);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--fc-bgPanel)',
        border: '1px solid var(--fc-border)',
        borderRadius: 8,
        padding: '12px 16px',
        zIndex: 30,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 200,
      }}
    >
      <label style={{ fontSize: 12, color: 'var(--fc-textMuted)', fontWeight: 600 }}>
        {label}
      </label>
      <input
        ref={inputRef}
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') onCancel();
          e.stopPropagation();
        }}
        style={{
          background: 'var(--fc-bgInput)',
          border: '1px solid var(--fc-border)',
          borderRadius: 4,
          padding: '6px 8px',
          color: 'var(--fc-text)',
          fontSize: 14,
          outline: 'none',
        }}
        placeholder="Enter value..."
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid var(--fc-border)',
            borderRadius: 4,
            padding: '4px 10px',
            color: 'var(--fc-textMuted)',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          style={{
            background: 'var(--fc-accent)',
            border: 'none',
            borderRadius: 4,
            padding: '4px 10px',
            color: 'var(--fc-accentText)',
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ─── Exit Confirmation Dialog ────────────────────────────────────────────────

function ExitConfirmDialog() {
  const confirmExit = useDrawStore((s) => s.confirmExit);
  const cancelExit = useDrawStore((s) => s.cancelExit);

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--fc-bgPanel)',
        border: '1px solid var(--fc-border)',
        borderRadius: 10,
        padding: '20px 24px',
        zIndex: 30,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 280,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fc-text)' }}>
        Leave Draw Mode?
      </div>
      <div style={{ fontSize: 12, color: 'var(--fc-textMuted)' }}>
        Your sketch has been saved to the file. You can re-enter draw mode to continue editing.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={cancelExit}
          style={{
            background: 'transparent',
            border: '1px solid var(--fc-border)',
            borderRadius: 6,
            padding: '6px 14px',
            color: 'var(--fc-text)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Keep Drawing
        </button>
        <button
          onClick={confirmExit}
          style={{
            background: 'var(--fc-accent)',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            color: 'var(--fc-accentText)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Leave
        </button>
      </div>
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const tooltipStyle: CSSProperties = {
  position: 'absolute',
  left: 'calc(100% + 8px)',
  top: '50%',
  transform: 'translateY(-50%)',
  background: '#1e1e2e',
  color: '#e0e0e0',
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 11,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  pointerEvents: 'none' as const,
  zIndex: 100,
  border: '1px solid rgba(255,255,255,0.08)',
};

function Tooltip({ def, visible }: { def: ToolDef; visible: boolean }) {
  if (!visible) return null;
  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>
        {def.label}
        {def.shortcut && (
          <kbd style={{
            marginLeft: 6,
            fontSize: 10,
            background: 'rgba(255,255,255,0.1)',
            padding: '1px 5px',
            borderRadius: 3,
            fontFamily: 'inherit',
          }}>
            {def.shortcut}
          </kbd>
        )}
      </div>
      <div style={{ opacity: 0.7, fontSize: 10 }}>{def.tip}</div>
    </div>
  );
}

// ─── Tool Button ─────────────────────────────────────────────────────────────

function ToolButton({ def, active, onClick }: { def: ToolDef; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onEnter = useCallback(() => {
    setHovered(true);
    timerRef.current = setTimeout(() => setShowTip(true), 100);
  }, []);

  const onLeave = useCallback(() => {
    setHovered(false);
    setShowTip(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <button
      onClick={onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 6,
        background: active ? 'var(--fc-accent)' : hovered ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: active ? 'var(--fc-accentText)' : 'var(--fc-text)',
        fontSize: def.icon.length > 1 ? 12 : 18,
        cursor: 'pointer',
        fontFamily: 'monospace',
        position: 'relative',
      }}
    >
      {def.icon}
      {def.shortcut && (
        <span style={{
          position: 'absolute',
          bottom: 1,
          right: 2,
          fontSize: 8,
          opacity: 0.4,
          fontFamily: 'sans-serif',
        }}>
          {def.shortcut}
        </span>
      )}
      <Tooltip def={def} visible={showTip} />
    </button>
  );
}

// ─── Section Label ───────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 8,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: 'var(--fc-textMuted)',
      textAlign: 'center',
      padding: '2px 0',
      opacity: 0.6,
    }}>
      {text}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--fc-border)', margin: '4px 0' }} />;
}

// ─── Main Toolbar ────────────────────────────────────────────────────────────

export function DrawToolbar() {
  const active = useDrawStore((s) => s.active);
  const tool = useDrawStore((s) => s.tool);
  const setTool = useDrawStore((s) => s.setTool);
  const requestExit = useDrawStore((s) => s.requestExit);
  const cancelPending = useDrawStore((s) => s.cancelPending);
  const undo = useDrawStore((s) => s.undo);
  const pendingClicks = useDrawStore((s) => s.pendingClicks);
  const statements = useDrawStore((s) => s.statements);
  const selectedEntities = useDrawStore((s) => s.selectedEntities);
  const showExitConfirm = useDrawStore((s) => s.showExitConfirm);
  const constructionMode = useDrawStore((s) => s.constructionMode);
  const toggleConstructionMode = useDrawStore((s) => s.toggleConstructionMode);
  const applyConstraint = useDrawStore((s) => s.applyConstraint);

  // Dimension input popup state
  const [dimInput, setDimInput] = useState<{ tool: ConstraintTool; label: string } | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if ((e.target as HTMLElement)?.closest('[data-fc-editor-surface]')) return;

    switch (e.key) {
      case 'Escape':
        if (dimInput) {
          setDimInput(null);
        } else if (pendingClicks.length > 0) {
          // For polyline, finish the chain on Escape
          if (tool === 'polyline' && pendingClicks.length >= 2) {
            useDrawStore.getState().handleDoubleClick(0, 0);
          } else {
            cancelPending();
          }
        } else if (isDrawingTool(tool) || isEditTool(tool) || isConstraintTool(tool)) {
          // Deactivate tool → go to select mode
          setTool('select');
        } else {
          // Already in select mode → request exit
          requestExit();
        }
        e.preventDefault();
        break;
      // Drawing tools
      case 'v': case 'V': setTool('select'); e.preventDefault(); break;
      case 'p': case 'P': setTool('point'); e.preventDefault(); break;
      case 'l': case 'L': setTool('line'); e.preventDefault(); break;
      case 'w': case 'W': setTool('polyline'); e.preventDefault(); break;
      case 'r': case 'R': setTool('rectangle'); e.preventDefault(); break;
      case 'c': case 'C': setTool('circle'); e.preventDefault(); break;
      case 'a': case 'A': setTool('arc'); e.preventDefault(); break;
      case 'g': case 'G': setTool('polygon'); e.preventDefault(); break;
      case 'e': case 'E': setTool('ellipse'); e.preventDefault(); break;
      case 's': case 'S': setTool('slot'); e.preventDefault(); break;
      // Edit tool shortcuts
      case 't': case 'T': setTool('trim'); e.preventDefault(); break;
      case 'i': case 'I': setTool('mirror'); e.preventDefault(); break;
      case 'f': case 'F': setTool('offset'); e.preventDefault(); break;
      // Constraint shortcuts
      case 'h': case 'H': setTool('c:horizontal'); e.preventDefault(); break;
      case 'd': case 'D': setTool('c:length'); e.preventDefault(); break;
      case 'o': case 'O': setTool('c:pointOnLine'); e.preventDefault(); break;
      // Undo
      case 'z': case 'Z':
        if (e.metaKey || e.ctrlKey) { undo(); e.preventDefault(); }
        break;
      // Enter to finish polyline
      case 'Enter':
        if (tool === 'polyline' && pendingClicks.length >= 2) {
          useDrawStore.getState().handleDoubleClick(0, 0);
          e.preventDefault();
        }
        break;
      // Construction mode toggle
      case 'x': case 'X':
        toggleConstructionMode();
        e.preventDefault();
        break;
    }
  }, [active, pendingClicks, tool, cancelPending, requestExit, setTool, undo, dimInput, toggleConstructionMode]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!active) return null;

  // Build context-aware status message
  const currentDef = allTools.find((t) => t.id === tool);
  let statusMessage = currentDef?.tip ?? '';
  if (pendingClicks.length > 0) {
    if (tool === 'line') statusMessage = 'Click second point...';
    else if (tool === 'polyline') statusMessage = `${pendingClicks.length} points — double-click or Enter to finish`;
    else if (tool === 'rectangle') statusMessage = 'Click opposite corner...';
    else if (tool === 'circle') statusMessage = 'Click edge point for radius...';
    else if (tool === 'arc' && pendingClicks.length === 1) statusMessage = 'Click second point...';
    else if (tool === 'arc' && pendingClicks.length === 2) statusMessage = 'Click third point to finish arc...';
    else if (tool === 'polygon') statusMessage = 'Click vertex point...';
    else if (tool === 'ellipse') statusMessage = 'Click bounding box corner...';
    else if (tool === 'slot' && pendingClicks.length === 1) statusMessage = 'Click second center...';
    else if (tool === 'slot' && pendingClicks.length === 2) statusMessage = 'Click to set width...';
    else if (tool === 'offset') statusMessage = 'Click to set offset distance...';
  }
  if (isConstraintTool(tool)) {
    const needed = currentDef?.requires ?? [];
    const have = selectedEntities.length;
    if (have < needed.length) {
      statusMessage = `Select ${needed.slice(have).join(', ')}... (${have}/${needed.length})`;
    } else {
      statusMessage = 'Ready — click Apply or press Enter';
    }
  }
  if (tool === 'select' && selectedEntities.length > 0) {
    statusMessage = `Selected: ${selectedEntities.map((e) => `${e.type} ${e.varName}`).join(', ')}`;
  }
  if (tool === 'mirror') {
    const mirrorLineVar = useDrawStore.getState().mirrorLineVar;
    if (mirrorLineVar) {
      statusMessage = `Mirror axis: ${mirrorLineVar} — click to place points (mirrored automatically)`;
    } else {
      statusMessage = 'Click a line to set as mirror axis';
    }
  }

  // Auto-apply constraints when selection is complete (for non-value constraints)
  const handleConstraintToolClick = (def: ToolDef) => {
    setTool(def.id);
    // If we already have the right selection, apply immediately (for no-value constraints)
    if (!def.needsValue && selectedEntities.length >= (def.requires?.length ?? 0)) {
      setTimeout(() => {
        const state = useDrawStore.getState();
        if (state.selectedEntities.length >= (def.requires?.length ?? 0)) {
          state.applyConstraint(def.id as ConstraintTool);
        }
      }, 0);
    }
  };

  return (
    <>
      {/* Left-side draw tool palette */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          background: 'var(--fc-bgPanel)',
          border: '1px solid var(--fc-border)',
          borderRadius: 8,
          padding: 4,
          zIndex: 15,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <SectionLabel text="Draw" />
        {drawTools.map((t) => (
          <ToolButton key={t.id} def={t} active={tool === t.id} onClick={() => setTool(t.id)} />
        ))}

        <Divider />
        <SectionLabel text="Edit" />
        {editTools.map((t) => (
          <ToolButton key={t.id} def={t} active={tool === t.id} onClick={() => setTool(t.id)} />
        ))}

        <Divider />
        <SectionLabel text="Constrain" />
        {constraintTools.map((t) => (
          <ToolButton key={t.id} def={t} active={tool === t.id} onClick={() => handleConstraintToolClick(t)} />
        ))}

        <Divider />

        {/* Construction mode toggle */}
        <ToolButton
          def={{ id: 'select' as DrawTool, label: 'Construction', icon: '┈┈', shortcut: 'X', tip: 'Toggle construction mode — dashed lines', section: 'draw' }}
          active={constructionMode}
          onClick={toggleConstructionMode}
        />

        <Divider />

        {/* Done button */}
        <ToolButton
          def={{ id: 'select' as DrawTool, label: 'Done', icon: '\u2713', tip: 'Leave draw mode (Esc x2)', section: 'draw' }}
          active={false}
          onClick={requestExit}
        />
      </div>

      {/* Top status bar */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--fc-accent)',
          color: 'var(--fc-accentText)',
          padding: '5px 16px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          zIndex: 15,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        }}
      >
        <span>Draw Mode</span>
        {constructionMode && (
          <span style={{
            background: '#7c3aed',
            padding: '1px 6px',
            borderRadius: 3,
            fontSize: 10,
          }}>
            Construction
          </span>
        )}
        <span style={{ opacity: 0.8, fontWeight: 400, maxWidth: 300 }}>{statusMessage}</span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>
          {statements.length} stmt{statements.length !== 1 ? 's' : ''}
        </span>
        <kbd
          style={{
            fontSize: 10,
            opacity: 0.6,
            fontFamily: 'inherit',
            background: 'rgba(255,255,255,0.15)',
            padding: '1px 5px',
            borderRadius: 3,
          }}
        >
          Esc × 2 to finish
        </kbd>
      </div>

      {/* Apply constraint button — shown when selection is ready for a value constraint */}
      {isConstraintTool(tool) && currentDef?.needsValue && selectedEntities.length >= (currentDef.requires?.length ?? 0) && !dimInput && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
          }}
        >
          <button
            onClick={() => setDimInput({ tool: tool as ConstraintTool, label: `${currentDef.label} value` })}
            style={{
              background: 'var(--fc-accent)',
              border: 'none',
              borderRadius: 6,
              padding: '8px 20px',
              color: 'var(--fc-accentText)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            Enter {currentDef.label} Value...
          </button>
        </div>
      )}

      {/* Non-value constraint: apply button when selection is complete */}
      {isConstraintTool(tool) && !currentDef?.needsValue && selectedEntities.length >= (currentDef?.requires?.length ?? 0) && (
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
          }}
        >
          <button
            onClick={() => applyConstraint(tool as ConstraintTool)}
            style={{
              background: 'var(--fc-accent)',
              border: 'none',
              borderRadius: 6,
              padding: '8px 20px',
              color: 'var(--fc-accentText)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            Apply {currentDef?.label}
          </button>
        </div>
      )}

      {/* Dimension input popup */}
      {dimInput && (
        <DimensionInputPopup
          label={dimInput.label}
          onSubmit={(value) => {
            applyConstraint(dimInput.tool, value);
            setDimInput(null);
          }}
          onCancel={() => setDimInput(null)}
        />
      )}

      {/* Exit confirmation dialog */}
      {showExitConfirm && <ExitConfirmDialog />}
    </>
  );
}

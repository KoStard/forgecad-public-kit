import { useState, useEffect, useRef, useCallback } from 'react';
import { useForgeStore } from '../store/forgeStore';
import { exportMeshFromStore, exportOrbitGifFromStore, exportReportFromStore } from './exportActions';

interface Command {
  id: string;
  label: string;
  action: () => void;
  /** If set, selecting this command opens a sub-list instead of executing */
  children?: Command[];
}

function handleCommandError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Command failed:', err);
  alert(message);
}

export function CommandPalette() {
  const open = useForgeStore((s) => s.commandPaletteOpen);
  const close = useForgeStore((s) => s.closeCommandPalette);
  const openPalette = useForgeStore((s) => s.openCommandPalette);
  const showAllObjects = useForgeStore((s) => s.showAllObjects);
  const setTheme = useForgeStore((s) => s.setTheme);
  const theme = useForgeStore((s) => s.theme);
  const result = useForgeStore((s) => s.lastValidResult);
  const showPerformanceInfo = useForgeStore((s) => s.showPerformanceInfo);
  const setShowPerformanceInfo = useForgeStore((s) => s.setShowPerformanceInfo);
  const objectSettings = useForgeStore((s) => s.objectSettings);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [subCommands, setSubCommands] = useState<Command[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasShapes = (result?.objects?.some((obj) => Boolean(obj.shape)) ?? false);
  const hiddenObjectCount = (result?.objects ?? []).filter((obj) => !(objectSettings[obj.id]?.visible ?? true)).length;
  const hasObjectCommands = (result?.objects?.length ?? 0) > 0 || Object.keys(objectSettings).length > 0;

  const themeChoices: Command[] = (['dark', 'light', 'gruvbox', 'tokyo-night', 'kanagawa-lotus'] as const).map((t) => ({
    id: `theme-${t}`,
    label: `${t.charAt(0).toUpperCase() + t.slice(1)}${theme === t ? '  ✓' : ''}`,
    action: () => { setTheme(t); close(); },
  }));

  const exportChoices: Command[] = [
    {
      id: 'export-3mf',
      label: `Export 3MF${hasShapes ? '' : ' (no geometry)'}`,
      action: () => {
        close();
        void exportMeshFromStore('3mf').catch(handleCommandError);
      },
    },
    {
      id: 'export-stl',
      label: `Export STL (legacy)${hasShapes ? '' : ' (no geometry)'}`,
      action: () => {
        close();
        void exportMeshFromStore('stl').catch(handleCommandError);
      },
    },
    {
      id: 'export-report',
      label: `Export Report PDF${hasShapes ? '' : ' (no geometry)'}`,
      action: () => {
        close();
        void exportReportFromStore().catch(handleCommandError);
      },
    },
    {
      id: 'export-gif',
      label: `Export Orbit GIF${hasShapes ? '' : ' (no geometry)'}`,
      action: () => {
        close();
        void exportOrbitGifFromStore().catch(handleCommandError);
      },
    },
  ];

  const rootCommands: Command[] = [
    ...(hasObjectCommands
      ? [{
        id: 'show-all-objects',
        label: hiddenObjectCount > 0 ? `Show All Objects (${hiddenObjectCount} hidden)` : 'Show All Objects',
        action: () => {
          showAllObjects();
          close();
        },
      } satisfies Command]
      : []),
    {
      id: 'toggle-performance-info',
      label: `${showPerformanceInfo ? 'Hide' : 'Show'} Performance Info`,
      action: () => {
        setShowPerformanceInfo(!showPerformanceInfo);
        close();
      },
    },
    { id: 'export', label: 'Export', children: exportChoices, action: () => {} },
    { id: 'theme', label: 'Change Theme', children: themeChoices, action: () => {} },
  ];

  const commands = subCommands ?? rootCommands;
  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (open) { close(); } else { openPalette(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close, openPalette]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setSubCommands(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query, subCommands]);

  const select = useCallback((cmd: Command) => {
    if (cmd.children) {
      setSubCommands(cmd.children);
      setQuery('');
    } else {
      cmd.action();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (subCommands) { setSubCommands(null); setQuery(''); }
      else close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && filtered[selected]) {
      select(filtered[selected]);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', justifyContent: 'center', paddingTop: '15vh',
      }}
      onClick={close}
    >
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--fc-bg)', opacity: 0.5 }} />

      {/* Palette */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 420,
          maxHeight: 340,
          background: 'var(--fc-bgPanel)',
          border: '1px solid var(--fc-border)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={subCommands ? 'Choose...' : 'Type a command...'}
          style={{
            padding: '10px 14px',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--fc-border)',
            color: 'var(--fc-text)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', color: 'var(--fc-textDim)', fontSize: 13 }}>
              No matching commands
            </div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              onClick={() => select(cmd)}
              onMouseEnter={() => setSelected(i)}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--fc-text)',
                background: i === selected ? 'var(--fc-bgHover)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{cmd.label}</span>
              {cmd.children && <span style={{ color: 'var(--fc-textDim)', fontSize: 11 }}>›</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

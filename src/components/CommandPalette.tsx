import { useState, useEffect, useRef, useCallback } from 'react';
import { useForgeStore } from '../store/forgeStore';
import type { ThemeName } from '../theme';

interface Command {
  id: string;
  label: string;
  action: () => void;
  /** If set, selecting this command opens a sub-list instead of executing */
  children?: Command[];
}

export function CommandPalette() {
  const open = useForgeStore((s) => s.commandPaletteOpen);
  const close = useForgeStore((s) => s.closeCommandPalette);
  const openPalette = useForgeStore((s) => s.openCommandPalette);
  const setTheme = useForgeStore((s) => s.setTheme);
  const theme = useForgeStore((s) => s.theme);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [subCommands, setSubCommands] = useState<Command[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const themeChoices: Command[] = (['dark', 'light', 'gruvbox', 'tokyo-night', 'kanagawa-lotus'] as const).map((t) => ({
    id: `theme-${t}`,
    label: `${t.charAt(0).toUpperCase() + t.slice(1)}${theme === t ? '  ✓' : ''}`,
    action: () => { setTheme(t); close(); },
  }));

  const rootCommands: Command[] = [
    { id: 'theme', label: 'Change Theme', children: themeChoices, action: () => {} },
  ];

  const commands = subCommands ?? rootCommands;
  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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

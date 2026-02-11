import { useState, useEffect, useRef, useCallback } from 'react';
import { useForgeStore } from '../store/forgeStore';

export function FileSwitcher() {
  const open = useForgeStore((s) => s.fileSwitcherOpen);
  const close = useForgeStore((s) => s.closeFileSwitcher);
  const openSwitcher = useForgeStore((s) => s.openFileSwitcher);
  const files = useForgeStore((s) => s.files);
  const activeFile = useForgeStore((s) => s.activeFile);
  const setActiveFile = useForgeStore((s) => s.setActiveFile);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fileNames = Object.keys(files).filter((f) => f !== activeFile);
  // Put active file at the end so it's not the default selection
  const allFiles = [...fileNames, activeFile];

  const filtered = allFiles.filter((f) => {
    if (!query) return true;
    const q = query.toLowerCase();
    // Fuzzy: every character in query appears in order in filename
    const name = f.toLowerCase();
    let qi = 0;
    for (let i = 0; i < name.length && qi < q.length; i++) {
      if (name[i] === q[qi]) qi++;
    }
    return qi === q.length;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'k') {
        e.preventDefault();
        if (open) close(); else openSwitcher();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close, openSwitcher]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  const pick = useCallback((name: string) => {
    setActiveFile(name);
    close();
  }, [setActiveFile, close]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && filtered[selected]) {
      pick(filtered[selected]);
    }
  };

  if (!open) return null;

  // Highlight matching characters
  const highlight = (name: string) => {
    if (!query) return <span>{name}</span>;
    const q = query.toLowerCase();
    const parts: React.ReactNode[] = [];
    let qi = 0;
    for (let i = 0; i < name.length; i++) {
      if (qi < q.length && name[i].toLowerCase() === q[qi]) {
        parts.push(<span key={i} style={{ color: 'var(--fc-accent)' }}>{name[i]}</span>);
        qi++;
      } else {
        parts.push(<span key={i}>{name[i]}</span>);
      }
    }
    return <>{parts}</>;
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'center', paddingTop: '15vh' }}
      onClick={close}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'var(--fc-bg)', opacity: 0.5 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: 420, maxHeight: 340,
          background: 'var(--fc-bgPanel)', border: '1px solid var(--fc-border)',
          borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Switch to file..."
          style={{
            padding: '10px 14px', background: 'transparent', border: 'none',
            borderBottom: '1px solid var(--fc-border)', color: 'var(--fc-text)',
            fontSize: 14, outline: 'none',
          }}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', color: 'var(--fc-textDim)', fontSize: 13 }}>No matching files</div>
          )}
          {filtered.map((name, i) => (
            <div
              key={name}
              onClick={() => pick(name)}
              onMouseEnter={() => setSelected(i)}
              style={{
                padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                color: name === activeFile ? 'var(--fc-textDim)' : 'var(--fc-text)',
                background: i === selected ? 'var(--fc-bgHover)' : 'transparent',
              }}
            >
              {highlight(name)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

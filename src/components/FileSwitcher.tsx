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

  const filtered = (() => {
    if (!query) return allFiles;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    // Fuzzy match a single token against a name, allowing up to maxErrors skipped query chars.
    // Returns { matched, score } where score is higher for better matches.
    function matchToken(name: string, token: string, maxErrors: number): { matched: boolean; score: number } {
      let bestScore = -Infinity;
      // Try skipping each subset of up to maxErrors chars in the token
      // Simple approach: try with 0 errors first, then 1 error (drop one char)
      const candidates = [token];
      if (maxErrors >= 1) {
        for (let drop = 0; drop < token.length; drop++) {
          candidates.push(token.slice(0, drop) + token.slice(drop + 1));
        }
      }
      let matched = false;
      for (let ci = 0; ci < candidates.length; ci++) {
        const q = candidates[ci];
        if (!q) continue;
        let qi = 0, firstMatchIdx = -1, consecutiveBonus = 0, prevMatchIdx = -1;
        for (let i = 0; i < name.length && qi < q.length; i++) {
          if (name[i] === q[qi]) {
            if (firstMatchIdx === -1) firstMatchIdx = i;
            if (prevMatchIdx === i - 1) consecutiveBonus++;
            prevMatchIdx = i;
            qi++;
          }
        }
        if (qi < q.length) continue;
        matched = true;
        let score = 0;
        if (ci === 0) score += 200; // no errors bonus
        if (name.includes(q)) score += 1000;
        if (name.startsWith(q)) score += 500;
        score += consecutiveBonus * 10;
        score -= firstMatchIdx;
        if (score > bestScore) bestScore = score;
      }
      return { matched, score: bestScore };
    }

    const scored: { name: string; score: number }[] = [];
    for (const f of allFiles) {
      const name = f.toLowerCase();
      let totalScore = 0;
      let allMatched = true;
      for (const token of tokens) {
        const { matched, score } = matchToken(name, token, 1);
        if (!matched) { allMatched = false; break; }
        totalScore += score;
      }
      if (!allMatched) continue;
      scored.push({ name: f, score: totalScore });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.name);
  })();

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

  // Highlight matching characters for all tokens
  const highlight = (name: string) => {
    if (!query) return <span>{name}</span>;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    // Build a set of highlighted char indices by fuzzy-matching each token
    const highlighted = new Set<number>();
    for (const token of tokens) {
      const lower = name.toLowerCase();
      let qi = 0;
      for (let i = 0; i < lower.length && qi < token.length; i++) {
        if (lower[i] === token[qi]) { highlighted.add(i); qi++; }
      }
    }
    return (
      <>
        {name.split('').map((ch, i) =>
          highlighted.has(i)
            ? <span key={i} style={{ color: 'var(--fc-accent)' }}>{ch}</span>
            : <span key={i}>{ch}</span>
        )}
      </>
    );
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

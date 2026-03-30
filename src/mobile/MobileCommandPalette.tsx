/**
 * Mobile command palette — bottom sheet with searchable commands.
 *
 * Provides access to all major ForgeCAD features on mobile:
 * AI Skill, exports, themes, viewport controls, etc.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import contextMd from '../../dist-skill/CONTEXT.md?raw';
import { exportMeshFromStore, exportSketchFromStore } from '../components/exportActions';
import { useForgeStore } from '../store/forgeStore';

interface Command {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  children?: Command[];
}

interface Props {
  onClose: () => void;
}

function handleCommandError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Command failed:', err);
  alert(message);
}

export function MobileCommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [subCommands, setSubCommands] = useState<Command[] | null>(null);
  const [subTitle, setSubTitle] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const theme = useForgeStore((s) => s.theme);
  const setTheme = useForgeStore((s) => s.setTheme);
  const result = useForgeStore((s) => s.lastValidResult);
  const activeFile = useForgeStore((s) => s.activeFile);
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const showPerformanceInfo = useForgeStore((s) => s.showPerformanceInfo);
  const setShowPerformanceInfo = useForgeStore((s) => s.setShowPerformanceInfo);
  const showAllObjects = useForgeStore((s) => s.showAllObjects);
  const objectSettings = useForgeStore((s) => s.objectSettings);

  const hasShapes = result?.objects?.some((obj) => Boolean(obj.shape)) ?? false;
  const hasSketches = result?.objects?.some((obj) => Boolean(obj.sketch)) ?? false;
  const hiddenObjectCount = (result?.objects ?? []).filter(
    (obj) => !(objectSettings[obj.id]?.visible ?? true),
  ).length;

  // ── Clipboard copy helper ──
  const copyToClipboard = useCallback(async (text: string, successMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(successMsg);
    } catch {
      // Fallback: create a temporary textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert(successMsg);
    }
  }, []);

  // ── Download file helper ──
  const downloadFile = useCallback((content: string, filename: string, mime = 'text/markdown') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Theme sub-commands ──
  const themeChoices: Command[] = (
    ['dark', 'light', 'gruvbox', 'tokyo-night', 'kanagawa-lotus'] as const
  ).map((t) => ({
    id: `theme-${t}`,
    label: `${t.charAt(0).toUpperCase() + t.slice(1)}${theme === t ? '  \u2713' : ''}`,
    icon: theme === t ? '\u2713' : '\u25CB',
    action: () => {
      setTheme(t);
      onClose();
    },
  }));

  // ── Export sub-commands ──
  const exportChoices: Command[] = [
    {
      id: 'export-3mf',
      label: `3MF${hasShapes ? '' : ' (no geometry)'}`,
      icon: '\uD83D\uDCE6',
      action: () => {
        onClose();
        void exportMeshFromStore('3mf').catch(handleCommandError);
      },
    },
    {
      id: 'export-stl',
      label: `STL${hasShapes ? '' : ' (no geometry)'}`,
      icon: '\uD83D\uDCE6',
      action: () => {
        onClose();
        void exportMeshFromStore('stl').catch(handleCommandError);
      },
    },
    {
      id: 'export-obj',
      label: `OBJ${hasShapes ? '' : ' (no geometry)'}`,
      icon: '\uD83D\uDCE6',
      action: () => {
        onClose();
        void exportMeshFromStore('obj').catch(handleCommandError);
      },
    },
    {
      id: 'export-svg',
      label: `Sketch SVG${hasSketches ? '' : ' (no sketches)'}`,
      icon: '\u2712',
      action: () => {
        onClose();
        try { exportSketchFromStore('svg'); } catch (e) { handleCommandError(e); }
      },
    },
    {
      id: 'export-dxf',
      label: `Sketch DXF${hasSketches ? '' : ' (no sketches)'}`,
      icon: '\u2712',
      action: () => {
        onClose();
        try { exportSketchFromStore('dxf'); } catch (e) { handleCommandError(e); }
      },
    },
  ];

  // ── AI Skill sub-commands ──
  const aiSkillChoices: Command[] = [
    {
      id: 'skill-copy',
      label: 'Copy Context to Clipboard',
      icon: '\uD83D\uDCCB',
      action: () => {
        onClose();
        void copyToClipboard(contextMd, 'ForgeCAD context copied to clipboard!');
      },
    },
    {
      id: 'skill-download',
      label: 'Download Context File',
      icon: '\u2B07\uFE0F',
      action: () => {
        onClose();
        downloadFile(contextMd, 'forgecad-context.md');
      },
    },
  ];

  // ── Root commands ──
  const rootCommands: Command[] = [
    {
      id: 'ai-skill',
      label: 'AI Skill',
      icon: '\uD83E\uDD16',
      action: () => {},
      children: aiSkillChoices,
    },
    {
      id: 'export',
      label: 'Export',
      icon: '\uD83D\uDCE5',
      action: () => {},
      children: exportChoices,
    },
    {
      id: 'fit-viewport',
      label: 'Fit Geometry to View',
      icon: '\u26F6',
      action: () => {
        requestViewCommand({ type: 'fit' });
        onClose();
      },
    },
    {
      id: 'iso-view',
      label: 'Snap to Isometric View',
      icon: '\uD83D\uDD36',
      action: () => {
        requestViewCommand({ type: 'snap', view: 'iso' });
        onClose();
      },
    },
    ...(hiddenObjectCount > 0
      ? [
          {
            id: 'show-all-objects',
            label: `Show All Objects (${hiddenObjectCount} hidden)`,
            icon: '\uD83D\uDC41',
            action: () => {
              showAllObjects();
              onClose();
            },
          },
        ]
      : []),
    {
      id: 'theme',
      label: 'Change Theme',
      icon: '\uD83C\uDFA8',
      action: () => {},
      children: themeChoices,
    },
    ...(activeFile
      ? [
          {
            id: 'copy-file-path',
            label: `Copy Path: ${activeFile}`,
            icon: '\uD83D\uDCCE',
            action: () => {
              onClose();
              void navigator.clipboard
                .writeText(activeFile)
                .catch(() => {});
            },
          },
        ]
      : []),
    {
      id: 'toggle-performance-info',
      label: `${showPerformanceInfo ? 'Hide' : 'Show'} Performance Info`,
      icon: '\u2699\uFE0F',
      action: () => {
        setShowPerformanceInfo(!showPerformanceInfo);
        onClose();
      },
    },
    {
      id: 'open-gist',
      label: 'Open from GitHub Gist',
      icon: '\uD83D\uDD17',
      action: () => {
        onClose();
        const input = window.prompt('Paste a GitHub Gist URL or ID:');
        if (!input) return;
        const match = input.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/i);
        const gistId = match ? match[1] : input.trim();
        import('../share').then(({ fetchGistModel }) =>
          fetchGistModel(gistId)
            .then((model) => {
              useForgeStore.getState().loadFromText(model.code, model.filename);
            })
            .catch(handleCommandError),
        );
      },
    },
    {
      id: 'open-url',
      label: 'Open from URL',
      icon: '\uD83C\uDF10',
      action: () => {
        onClose();
        const input = window.prompt('Paste a URL to a .forge.js file:');
        if (!input) return;
        import('../share').then(({ fetchUrlModel }) =>
          fetchUrlModel(input.trim())
            .then((model) => {
              useForgeStore.getState().loadFromText(model.code, model.filename);
            })
            .catch(handleCommandError),
        );
      },
    },
  ];

  const commands = subCommands ?? rootCommands;
  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Reset selection when query or sub-commands change
  useEffect(() => {
    setSelected(0);
  }, [query, subCommands]);

  const select = useCallback(
    (cmd: Command) => {
      if (cmd.children) {
        setSubCommands(cmd.children);
        setSubTitle(cmd.label);
        setQuery('');
      } else {
        cmd.action();
      }
    },
    [],
  );

  const handleBack = useCallback(() => {
    setSubCommands(null);
    setSubTitle(null);
    setQuery('');
  }, []);

  return (
    <div className="fc-mobile-cmdpal-overlay" onClick={onClose}>
      <div
        className="fc-mobile-cmdpal-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="fc-mobile-cmdpal-header">
          {subCommands ? (
            <button className="fc-mobile-cmdpal-back" onClick={handleBack}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          ) : (
            <span className="fc-mobile-cmdpal-title">Commands</span>
          )}
          {subTitle && subCommands && (
            <span className="fc-mobile-cmdpal-title">{subTitle}</span>
          )}
          <div style={{ flex: 1 }} />
          <button
            className="fc-mobile-cmdpal-close"
            onClick={onClose}
          >
            Done
          </button>
        </div>

        {/* Search */}
        <div className="fc-mobile-cmdpal-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={subCommands ? 'Filter...' : 'Search commands...'}
            className="fc-mobile-cmdpal-input"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {query && (
            <button
              className="fc-mobile-cmdpal-clear"
              onClick={() => setQuery('')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </button>
          )}
        </div>

        {/* Command list */}
        <div className="fc-mobile-cmdpal-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="fc-mobile-cmdpal-empty">No matching commands</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className="fc-mobile-cmdpal-item"
              data-selected={i === selected ? 'true' : undefined}
              onClick={() => select(cmd)}
            >
              <span className="fc-mobile-cmdpal-item-icon">{cmd.icon}</span>
              <span className="fc-mobile-cmdpal-item-label">{cmd.label}</span>
              {cmd.children && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.4 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

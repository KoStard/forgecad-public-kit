import { useState, useEffect, useRef, useCallback } from 'react';
import { useForgeStore } from '../store/forgeStore';
import { exportMeshFromStore, exportOrbitGifFromStore, exportReportFromStore, exportSketchFromStore } from './exportActions';
import { fileSystem } from '../fs';
import { fetchGistModel } from '../share';
import { FLAG_DEFINITIONS, useFeatureFlagStore } from '../featureFlags';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
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
  const activeFile = useForgeStore((s) => s.activeFile);
  const fileExplorerOpen = useForgeStore((s) => s.fileExplorerOpen);
  const toggleFileExplorer = useForgeStore((s) => s.toggleFileExplorer);
  const viewPanelOpen = useForgeStore((s) => s.viewPanelOpen);
  const toggleViewPanel = useForgeStore((s) => s.toggleViewPanel);
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const openShortcutsOverlay = useForgeStore((s) => s.openShortcutsOverlay);
  const featureFlags = useFeatureFlagStore((s) => s.flags);
  const toggleFeatureFlag = useFeatureFlagStore((s) => s.toggle);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [subCommands, setSubCommands] = useState<Command[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasShapes = (result?.objects?.some((obj) => Boolean(obj.shape)) ?? false);
  const hasSketches = (result?.objects?.some((obj) => Boolean(obj.sketch)) ?? false);
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
    {
      id: 'export-svg',
      label: `Export Sketch SVG${hasSketches ? '' : ' (no sketches)'}`,
      action: () => {
        close();
        try { exportSketchFromStore('svg'); } catch (err) { handleCommandError(err); }
      },
    },
    {
      id: 'export-dxf',
      label: `Export Sketch DXF${hasSketches ? '' : ' (no sketches)'}`,
      action: () => {
        close();
        try { exportSketchFromStore('dxf'); } catch (err) { handleCommandError(err); }
      },
    },
    {
      id: 'export-sketch-pdf',
      label: `Export Sketch PDF${hasSketches ? '' : ' (no sketches)'}`,
      action: () => {
        close();
        try { exportSketchFromStore('pdf'); } catch (err) { handleCommandError(err); }
      },
    },
  ];

  const copyFilePathCommand: Command = {
    id: 'copy-file-path',
    label: activeFile ? `Copy Path: ${activeFile}` : 'Copy File Path',
    action: () => {
      close();
      if (!activeFile) return;
      fileSystem.projectPath()
        .then((projectDir) => {
          const absPath = projectDir ? `${projectDir}/${activeFile}` : activeFile;
          return navigator.clipboard.writeText(absPath);
        })
        .catch((err: unknown) => { console.error('Failed to copy path:', err); });
    },
  };

  const rootCommands: Command[] = [
    ...(activeFile ? [copyFilePathCommand] : []),
    {
      id: 'toggle-file-explorer',
      label: `${fileExplorerOpen ? 'Hide' : 'Show'} File Explorer`,
      action: () => { toggleFileExplorer(); close(); },
    },
    {
      id: 'toggle-view-panel',
      label: `${viewPanelOpen ? 'Hide' : 'Show'} View Panel`,
      action: () => { toggleViewPanel(); close(); },
    },
    {
      id: 'fit-viewport',
      label: 'Fit Geometry to View',
      shortcut: `${mod}⇧F`,
      action: () => { requestViewCommand({ type: 'fit' }); close(); },
    },
    {
      id: 'iso-view',
      label: 'Snap to Isometric View',
      shortcut: `${mod}⇧H`,
      action: () => { requestViewCommand({ type: 'snap', view: 'iso' }); close(); },
    },
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
    {
      id: 'open-gist',
      label: 'Open from GitHub Gist',
      action: () => {
        close();
        const input = window.prompt('Paste a GitHub Gist URL or ID:');
        if (!input) return;
        // Extract gist ID from URL or use as-is
        const match = input.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/i);
        const gistId = match ? match[1] : input.trim();
        fetchGistModel(gistId)
          .then((model) => {
            useForgeStore.getState().loadFromText(model.code, model.filename);
          })
          .catch(handleCommandError);
      },
    },
    { id: 'export', label: 'Export', children: exportChoices, action: () => {} },
    { id: 'theme', label: 'Change Theme', children: themeChoices, action: () => {} },
    {
      id: 'advanced',
      label: 'Advanced',
      action: () => {},
      children: Object.entries(FLAG_DEFINITIONS).map(([name, def]) => ({
        id: `ff-${name}`,
        label: `${featureFlags[name] ?? def.defaultEnabled ? '✓' : '✗'}  ${def.label}`,
        action: () => { toggleFeatureFlag(name); close(); },
      })),
    },
    {
      id: 'keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      shortcut: '?',
      action: () => { close(); openShortcutsOverlay(); },
    },
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
                gap: 12,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.label}</span>
              {cmd.shortcut && (
                <kbd style={{
                  fontSize: 11,
                  color: 'var(--fc-textDim)',
                  background: 'var(--fc-bgSurface)',
                  border: '1px solid var(--fc-border)',
                  borderRadius: 3,
                  padding: '1px 5px',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {cmd.shortcut}
                </kbd>
              )}
              {cmd.children && !cmd.shortcut && <span style={{ color: 'var(--fc-textDim)', fontSize: 11 }}>›</span>}
              {cmd.children && cmd.shortcut && <span style={{ color: 'var(--fc-textDim)', fontSize: 11, marginLeft: -8 }}>›</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

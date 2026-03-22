import React, { useEffect } from 'react';
import { initKernel } from '@forge/kernel';
import { initSolverWasm } from '@forge/sketch/constraints/solver-wasm';
import { useForgeStore } from './store/forgeStore';
import { fileSystem } from './fs';
import { CodeEditor } from './components/CodeEditor';
import { NotebookEditor } from './components/NotebookEditor';
import { Viewport } from './components/Viewport';
import { ParamPanel } from './components/ParamPanel';
import { ExportPanel } from './components/ExportPanel';
import { FileExplorer } from './components/FileExplorer';
import { ViewPanel } from './components/ViewPanel';
import { CommandPalette } from './components/CommandPalette';
import { FileSwitcher } from './components/FileSwitcher';
import { KeyboardShortcutsOverlay } from './components/KeyboardShortcutsOverlay';
import { ConsolePanel } from './components/ConsolePanel';
import { VerificationsPanel } from './components/VerificationsPanel';
import { ResizablePanel } from './components/ResizablePanel';
import { isSaveShortcut, shouldBlockBrowserShortcut, type EditorSurface } from './editorShortcuts';
import { isNotebookFile } from './notebook/model';
import { buildShareUrl, buildEmbedUrl, buildEmbedSnippet, isEmbedMode } from './share';
import { EmbedViewer } from './components/EmbedViewer';
import { AISkillDialog } from './components/AISkillDialog';
import { isMobile } from './mobile/isMobile';
import { MobileApp } from './mobile/MobileApp';
import { ToastContainer, showToast } from './components/Toast';
import { StatusBar } from './components/StatusBar';

const GITHUB_REPO = 'KoStard/ForgeCAD';

function GitHubStarButton() {
  const [stars, setStars] = React.useState<number | null>(null);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`)
      .then((r) => r.json())
      .then((data: { stargazers_count?: number }) => {
        if (typeof data.stargazers_count === 'number') setStars(data.stargazers_count);
      })
      .catch(() => { /* fail silently — button still works as a plain link */ });
  }, []);

  const label = stars === null ? null : stars >= 1000 ? `${(stars / 1000).toFixed(1)}k` : String(stars);

  return (
    <a
      href={`https://github.com/${GITHUB_REPO}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Star on GitHub"
      className="fc-btn"
      style={{ textDecoration: 'none', padding: '3px 8px' }}
    >
      <svg height="13" width="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      Star
      {label !== null && (
        <>
          <span style={{ width: 1, height: 10, background: 'var(--fc-border)', display: 'inline-block' }} />
          <span style={{ color: 'var(--fc-text)', fontVariantNumeric: 'tabular-nums' }}>{label}</span>
        </>
      )}
    </a>
  );
}

function ShareButton() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const files = useForgeStore((s) => s.files);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${label} copied to clipboard`, 'success', 2500);
    });
  };

  const handleShare = () => {
    if (!activeFile) return;
    const code = files[activeFile];
    if (!code) return;
    const url = buildShareUrl(activeFile, code);

    if (url.length > 8000) {
      const ok = window.confirm(
        `The share URL is ${(url.length / 1024).toFixed(0)} KB — some browsers or services may truncate it. Copy anyway?`,
      );
      if (!ok) return;
    }

    copyToClipboard(url, 'Share link');
  };

  const handleEmbed = () => {
    if (!activeFile) return;
    const code = files[activeFile];
    if (!code) return;
    const embedUrl = buildEmbedUrl(activeFile, code);

    if (embedUrl.length > 8000) {
      const ok = window.confirm(
        `The embed URL is ${(embedUrl.length / 1024).toFixed(0)} KB — some browsers or services may truncate it.\nFor large models, consider creating a GitHub Gist and using ?gist=<id> instead.\nCopy anyway?`,
      );
      if (!ok) return;
    }

    copyToClipboard(buildEmbedSnippet(embedUrl), 'Embed snippet');
  };

  return (
    <span style={{ display: 'inline-flex' }}>
      <button onClick={handleShare} title="Copy shareable link to clipboard" className="fc-btn" style={{ borderRadius: '4px 0 0 4px' }}>
        <svg height="12" width="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3.75 2h3.5a.75.75 0 010 1.5h-3.5a.25.25 0 00-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25v-3.5a.75.75 0 011.5 0v3.5A1.75 1.75 0 0112.25 14h-8.5A1.75 1.75 0 012 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-.22a.75.75 0 011.062 0l2.554 2.553a.75.75 0 010 1.062l-5.5 5.5a.75.75 0 01-.53.22H5.75a.75.75 0 01-.75-.75V7.914a.75.75 0 01.22-.53l5.384-5.604zm.69 1.28L6.5 7.854v1.396h1.396l4.793-4.794-1.395-1.396z" />
        </svg>
        Share
      </button>
      <button onClick={handleEmbed} title="Copy embed iframe snippet to clipboard" className="fc-btn" style={{ borderLeft: 'none', borderRadius: '0 4px 4px 0' }}>
        <svg height="12" width="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H1.75zM4.47 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L7.19 8 4.47 5.28a.75.75 0 010-1.06z" />
        </svg>
        Embed
      </button>
    </span>
  );
}

const btn = (active = false) => `fc-btn${active ? ' active' : ''}`;

const FILE_EXPLORER_PANEL_WIDTH_KEY = 'fc-layout-file-panel-width-v1';
const CODE_PANEL_WIDTH_KEY = 'fc-layout-code-panel-width-v1';
const VIEW_PANEL_WIDTH_KEY = 'fc-layout-view-panel-width-v1';

function AutoBuildToggle() {
  const pauseAutoEval = useForgeStore((s) => s.pauseAutoEval);
  const togglePauseAutoEval = useForgeStore((s) => s.togglePauseAutoEval);
  const execute = useForgeStore((s) => s.execute);
  return (
    <>
      <button
        className={btn(!pauseAutoEval)}
        style={pauseAutoEval ? { color: 'var(--fc-warning, #e6a817)', borderColor: 'var(--fc-warning, #e6a817)' } : undefined}
        onClick={togglePauseAutoEval}
        title={pauseAutoEval ? 'Auto-build paused — click to enable' : 'Auto-build active — click to pause'}
      >
        {pauseAutoEval ? '⏸ Manual' : '▶ Auto'}
      </button>
      {pauseAutoEval && (
        <button className={btn(true)} onClick={() => execute()} title="Build now (⌘↵)">
          Build
        </button>
      )}
    </>
  );
}

function Toolbar() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const dirty = useForgeStore((s) => s.dirty);
  const newProject = useForgeStore((s) => s.newProject);
  const saveFile = useForgeStore((s) => s.saveFile);
  const saveFileAs = useForgeStore((s) => s.saveFileAs);
  const measureMode = useForgeStore((s) => s.measureMode);
  const toggleMeasure = useForgeStore((s) => s.toggleMeasure);
  const clearMeasureSelections = useForgeStore((s) => s.clearMeasureSelections);
  const measureSelections = useForgeStore((s) => s.measureSelections);
  const fileExplorerOpen = useForgeStore((s) => s.fileExplorerOpen);
  const toggleFileExplorer = useForgeStore((s) => s.toggleFileExplorer);
  const viewPanelOpen = useForgeStore((s) => s.viewPanelOpen);
  const toggleViewPanel = useForgeStore((s) => s.toggleViewPanel);
  const openCommandPalette = useForgeStore((s) => s.openCommandPalette);
  const [skillDialogOpen, setSkillDialogOpen] = React.useState(false);

  return (
    <div className="fc-toolbar">
      <span style={{ fontSize: 16 }}>⚒</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fc-accent)' }}>ForgeCAD</span>
      <span style={{ color: 'var(--fc-textDim)', fontSize: 12, marginLeft: 4 }}>
        {activeFile}{dirty ? ' •' : ''}
      </span>
      <button
        onClick={openCommandPalette}
        title="Open command palette (⌘⇧P)"
        className="fc-btn"
        style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11, background: 'var(--fc-bgSurface)' }}
      >
        <span>Commands</span>
        <kbd style={{ fontSize: 10, opacity: 0.7, fontFamily: 'inherit' }}>⌘⇧P</kbd>
      </button>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
        <button className={btn(fileExplorerOpen)} onClick={toggleFileExplorer} title="Toggle file explorer">📁 Files</button>
        <button className={btn(viewPanelOpen)} onClick={toggleViewPanel} title="Toggle view panel">🧭 View</button>
        <div className="fc-separator" />
        <button className={btn()} onClick={newProject} title="New project">New Project</button>
        <button className={btn()} onClick={saveFile} title="Save (⌘S)">Save</button>
        <button className={btn()} onClick={saveFileAs} title="Save as new file">Save As</button>
        <div className="fc-separator" />
        <button className={btn(measureMode)} onClick={toggleMeasure} title="Toggle measurement tool (M)">📏 Measure</button>
        {measureMode && measureSelections.length > 0 && (
          <button className={btn()} onClick={clearMeasureSelections} title="Clear selections">Clear</button>
        )}
        <div className="fc-separator" />
        <AutoBuildToggle />
        <div className="fc-separator" />
        <button className={btn()} onClick={() => setSkillDialogOpen(true)} title="Get AI skill for writing ForgeCAD models">🤖 AI Skill</button>
        <div className="fc-separator" />
        <ShareButton />
        {__FORGE_MODE__ === 'web' && <GitHubStarButton />}
      </div>
      {skillDialogOpen && <AISkillDialog onClose={() => setSkillDialogOpen(false)} />}
    </div>
  );
}

// Module-level constants — URL params don't change during session
const embedMode = isEmbedMode();

export function App() {
  if (embedMode) {
    return <EmbedViewer />;
  }
  if (isMobile) {
    return <MobileApp />;
  }
  return <FullApp />;
}

function FullApp() {
  const kernelReady = useForgeStore((s) => s.kernelReady);
  const setKernelReady = useForgeStore((s) => s.setKernelReady);
  const execute = useForgeStore((s) => s.execute);
  const activeFile = useForgeStore((s) => s.activeFile);
  const fileExplorerOpen = useForgeStore((s) => s.fileExplorerOpen);
  const viewPanelOpen = useForgeStore((s) => s.viewPanelOpen);
  const applyServerSnapshot = useForgeStore((s) => s.applyServerSnapshot);
  const applyServerFileChange = useForgeStore((s) => s.applyServerFileChange);
  const applyServerFileDelete = useForgeStore((s) => s.applyServerFileDelete);
  const saveFile = useForgeStore((s) => s.saveFile);
  const minFileExplorerWidth = 220;
  const maxFileExplorerWidth = 520;
  const minCodePanelWidth = 320;
  const maxCodePanelWidth = 860;
  const minViewPanelWidth = 220;
  const maxViewPanelWidth = 460;
  const notebookMode = isNotebookFile(activeFile);

  useEffect(() => {
    Promise.all([initKernel(), initSolverWasm()]).then(() => {
      setKernelReady(true);
      execute();
    });
  }, []);

  // Sync project files via the active FileSystemProvider
  useEffect(() => {
    return fileSystem.subscribe((event) => {
      if (event.type === 'init') applyServerSnapshot(event.files);
      else if (event.type === 'change') applyServerFileChange(event.filename, event.content);
      else if (event.type === 'delete') applyServerFileDelete(event.filename);
    });
  }, [applyServerSnapshot, applyServerFileChange, applyServerFileDelete]);

  // Warn before closing/refreshing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const { files, savedFiles } = useForgeStore.getState();
      const hasUnsaved = Object.keys(files).some((k) => files[k] !== savedFiles[k]);
      if (hasUnsaved) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== '?') return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // Don't trigger inside text inputs or editor surfaces
      if (target.closest('[data-fc-editor-surface]')) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      event.preventDefault();
      const state = useForgeStore.getState();
      if (state.commandPaletteOpen || state.fileSwitcherOpen) return;
      state.openShortcutsOverlay();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handleEditorShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const surfaceValue = target
        .closest<HTMLElement>('[data-fc-editor-surface]')
        ?.dataset.fcEditorSurface;

      if (surfaceValue !== 'monaco' && surfaceValue !== 'notebook') return;

      const surface = surfaceValue as EditorSurface;

      if (surface === 'notebook' && isSaveShortcut(event)) {
        event.preventDefault();
        void saveFile();
        return;
      }

      if (shouldBlockBrowserShortcut(event, surface)) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleEditorShortcut, true);
    return () => window.removeEventListener('keydown', handleEditorShortcut, true);
  }, [saveFile]);

  if (!kernelReady) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: 'var(--fc-textDim)',
        animation: 'fc-fadein 0.3s ease-out',
      }}>
        <div style={{ textAlign: 'center' }}>
          {/* Anvil icon with gentle pulse */}
          <div style={{
            fontSize: 48,
            marginBottom: 16,
            animation: 'fc-pulse 2s ease-in-out infinite',
          }}>
            ⚒
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--fc-accent)',
            marginBottom: 6,
            letterSpacing: 1,
          }}>
            ForgeCAD
          </div>
          <div style={{ fontSize: 13, color: 'var(--fc-textDim)', marginBottom: 20 }}>
            Loading geometry kernel...
          </div>
          {/* Shimmer progress bar */}
          <div style={{
            width: 200,
            height: 3,
            borderRadius: 2,
            background: 'var(--fc-border)',
            overflow: 'hidden',
            margin: '0 auto',
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: 2,
              background: 'linear-gradient(90deg, transparent, var(--fc-accent), transparent)',
              backgroundSize: '200% 100%',
              animation: 'fc-shimmer 1.5s ease-in-out infinite',
            }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {fileExplorerOpen && (
          <ResizablePanel
            storageKey={FILE_EXPLORER_PANEL_WIDTH_KEY}
            defaultWidth={280}
            minWidth={minFileExplorerWidth}
            maxWidth={maxFileExplorerWidth}
            edge="right"
            handleLabel="Resize project files panel"
          >
            <FileExplorer />
          </ResizablePanel>
        )}
        <ResizablePanel
          storageKey={CODE_PANEL_WIDTH_KEY}
          defaultWidth={520}
          minWidth={minCodePanelWidth}
          maxWidth={maxCodePanelWidth}
          edge="right"
          handleLabel="Resize code editor panel"
          panelStyle={{ borderRight: '1px solid var(--fc-border)' }}
        >
          <div style={{ flex: 1, minHeight: 0 }}>
            {notebookMode ? <NotebookEditor /> : <CodeEditor />}
          </div>
          <ParamPanel />
          <VerificationsPanel />
          <ConsolePanel />
          <ExportPanel />
        </ResizablePanel>
        <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Viewport />
          </div>
          {viewPanelOpen && (
            <ResizablePanel
              storageKey={VIEW_PANEL_WIDTH_KEY}
              defaultWidth={280}
              minWidth={minViewPanelWidth}
              maxWidth={maxViewPanelWidth}
              edge="left"
              handleLabel="Resize view panel"
              panelStyle={{ overflow: 'hidden' }}
            >
              <ViewPanel />
            </ResizablePanel>
          )}
        </div>
      </div>
      <StatusBar />
      <CommandPalette />
      <FileSwitcher />
      <KeyboardShortcutsOverlay />
      <ToastContainer />
    </div>
  );
}

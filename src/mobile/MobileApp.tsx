/**
 * Mobile-first ForgeCAD app.
 *
 * - Tab-based: Code and Model are never visible simultaneously
 * - Loads only Manifold backend (no OCCT)
 * - Passive 3D viewport (orbit/zoom/pan only)
 * - Mesh-only exports (3MF/STL/OBJ)
 */

import { initKernelManifoldOnly } from '@forge/kernel';
import { initSolverWasm } from '@forge/sketch/constraints/solver-wasm';
import { useCallback, useEffect, useState } from 'react';
import { fileSystem } from '../fs';
import { useForgeStore } from '../store/forgeStore';
import { MobileCodeEditor } from './MobileCodeEditor';
import { MobileCommandPalette } from './MobileCommandPalette';
import { MobileExport } from './MobileExport';
import { MobileFilePicker } from './MobileFilePicker';
import { MobileParams } from './MobileParams';
import { MobileViewport } from './MobileViewport';
import './mobile.css';

type Tab = 'code' | 'model';

export function MobileApp() {
  const kernelReady = useForgeStore((s) => s.kernelReady);
  const setKernelReady = useForgeStore((s) => s.setKernelReady);
  const execute = useForgeStore((s) => s.execute);
  const activeFile = useForgeStore((s) => s.activeFile);
  const isEvaluating = useForgeStore((s) => s.isEvaluating);
  const result = useForgeStore((s) => s.result);
  const applyServerSnapshot = useForgeStore((s) => s.applyServerSnapshot);
  const applyServerFileChange = useForgeStore((s) => s.applyServerFileChange);
  const applyServerFileDelete = useForgeStore((s) => s.applyServerFileDelete);
  const [tab, setTab] = useState<Tab>('code');
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // ── Init kernel (Manifold only) ──
  useEffect(() => {
    Promise.all([initKernelManifoldOnly(), initSolverWasm()]).then(() => {
      setKernelReady(true);
      execute();
    });
  }, []);

  // ── File system events (studio mode) ──
  useEffect(() => {
    return fileSystem.subscribe((event) => {
      if (event.type === 'init') applyServerSnapshot(event.files);
      else if (event.type === 'change') applyServerFileChange(event.filename, event.content);
      else if (event.type === 'delete') applyServerFileDelete(event.filename);
    });
  }, [applyServerSnapshot, applyServerFileChange, applyServerFileDelete]);

  // ── Run ──
  const handleRun = useCallback(() => {
    execute();
    setTab('model');
  }, [execute]);

  // ── Error display ──
  const errorMessage = result?.error ?? null;

  // ── Loading screen ──
  if (!kernelReady) {
    return (
      <div className="fc-mobile" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>ForgeCAD</div>
          <div style={{ fontSize: 13, color: 'var(--fc-textDim)' }}>
            <span className="fc-mobile-spinner" style={{ marginRight: 8 }} />
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // Extract display filename
  const displayName = activeFile ? activeFile.replace(/^.*[\\/]/, '') : 'No file';

  return (
    <div className="fc-mobile">
      {/* ── Top bar ── */}
      <div className="fc-mobile-topbar">
        <button className="fc-mobile-topbar-btn" onClick={() => setFilePickerOpen(true)} title="Switch file">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </button>
        <span
          className="fc-mobile-topbar-title"
          data-tappable="true"
          onClick={() => setCommandPaletteOpen(true)}
          role="button"
          tabIndex={0}
        >
          {displayName}
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginLeft: 4, opacity: 0.4, verticalAlign: 'middle' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
        <button className="fc-mobile-topbar-btn" onClick={() => setExportOpen(true)} title="Export">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
        </button>
      </div>

      {/* ── Content area ── */}
      <div className="fc-mobile-content">
        {/* Code tab */}
        <div className="fc-mobile-tab-panel" data-active={tab === 'code' ? 'true' : undefined}>
          <MobileCodeEditor />
          <MobileParams />
          {errorMessage && <div className="fc-mobile-error">{errorMessage}</div>}
        </div>

        {/* Model tab */}
        <div className="fc-mobile-tab-panel" data-active={tab === 'model' ? 'true' : undefined}>
          <MobileViewport />
          <MobileParams />
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="fc-mobile-bottombar">
        <button className="fc-mobile-tab-btn" data-active={tab === 'code' ? 'true' : undefined} onClick={() => setTab('code')}>
          <span className="fc-mobile-tab-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </span>
          Code
        </button>

        <button className="fc-mobile-run-btn" onClick={handleRun} disabled={isEvaluating}>
          {isEvaluating ? (
            <span className="fc-mobile-spinner" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
          Run
        </button>

        <button className="fc-mobile-tab-btn" data-active={tab === 'model' ? 'true' : undefined} onClick={() => setTab('model')}>
          <span className="fc-mobile-tab-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </span>
          Model
        </button>
      </div>

      {/* ── Overlays ── */}
      {filePickerOpen && <MobileFilePicker onClose={() => setFilePickerOpen(false)} />}
      {exportOpen && <MobileExport onClose={() => setExportOpen(false)} />}
      {commandPaletteOpen && <MobileCommandPalette onClose={() => setCommandPaletteOpen(false)} />}
    </div>
  );
}

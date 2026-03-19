import React, { useEffect, useState } from 'react';
import { initKernel } from '@forge/kernel';
import { initSolverWasm } from '@forge/sketch/constraints/solver-wasm';
import { useForgeStore } from '../store/forgeStore';
import { Viewport } from './Viewport';
import { getGistId, fetchGistModel, buildShareUrl } from '../share';

/**
 * Minimal embed view — just the 3D viewport with a small watermark link.
 * Used when ?embed=1 is in the URL.
 */
export function EmbedViewer() {
  const kernelReady = useForgeStore((s) => s.kernelReady);
  const setKernelReady = useForgeStore((s) => s.setKernelReady);
  const execute = useForgeStore((s) => s.execute);
  const activeFile = useForgeStore((s) => s.activeFile);
  const files = useForgeStore((s) => s.files);
  const updateFileCode = useForgeStore((s) => s.updateFileCode);
  const setActiveFile = useForgeStore((s) => s.setActiveFile);
  const [gistError, setGistError] = useState<string | null>(null);
  const [gistLoading, setGistLoading] = useState(false);

  // Load gist if ?gist=<id> is present
  useEffect(() => {
    const gistId = getGistId();
    if (!gistId) return;

    setGistLoading(true);
    fetchGistModel(gistId)
      .then((model) => {
        updateFileCode(model.filename, model.code);
        setActiveFile(model.filename);
        setGistLoading(false);
      })
      .catch((err) => {
        setGistError(err.message);
        setGistLoading(false);
      });
  }, []);

  // Init kernel
  useEffect(() => {
    Promise.all([initKernel(), initSolverWasm()]).then(() => {
      setKernelReady(true);
      execute();
    });
  }, []);

  // Re-execute when gist finishes loading
  useEffect(() => {
    if (kernelReady && !gistLoading) {
      execute();
    }
  }, [gistLoading, kernelReady]);

  // Build the "Open in ForgeCAD" link — point to the full editor with the same model
  const openUrl = (() => {
    const gistId = getGistId();
    if (gistId) {
      const base = `${window.location.origin}${window.location.pathname}`;
      return `${base}?gist=${encodeURIComponent(gistId)}`;
    }
    const code = files[activeFile];
    if (activeFile && code) {
      return buildShareUrl(activeFile, code);
    }
    return `${window.location.origin}${window.location.pathname}`;
  })();

  if (gistError) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: '#e74c3c', background: '#1e1e1e', fontFamily: 'system-ui',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Failed to load model</div>
          <div style={{ fontSize: 13, color: '#999' }}>{gistError}</div>
        </div>
      </div>
    );
  }

  if (!kernelReady || gistLoading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', color: 'var(--fc-textDim)', background: 'var(--fc-bg, #1e1e1e)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, marginBottom: 8 }}>ForgeCAD</div>
          <div style={{ fontSize: 13 }}>{gistLoading ? 'Loading model...' : 'Loading geometry kernel...'}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Viewport />
      <a
        href={openUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: 'absolute',
          bottom: 8,
          right: 12,
          padding: '3px 8px',
          background: 'rgba(0,0,0,0.55)',
          color: 'rgba(255,255,255,0.75)',
          fontSize: 11,
          borderRadius: 4,
          textDecoration: 'none',
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'auto',
          zIndex: 10,
          backdropFilter: 'blur(4px)',
        }}
      >
        Open in ForgeCAD
      </a>
    </div>
  );
}

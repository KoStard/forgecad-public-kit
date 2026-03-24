import { useFrame, useThree } from '@react-three/fiber';
import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { formatPerformanceCount, PERFORMANCE_SAMPLE_INTERVAL_SEC, type ViewportPerformanceInfo } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getProgramCount = (gl: THREE.WebGLRenderer): number => {
  const info = gl.info as typeof gl.info & { programs?: unknown[] };
  return Array.isArray(info.programs) ? info.programs.length : 0;
};

// ---------------------------------------------------------------------------
// PerformanceInfoSampler — runs inside the R3F Canvas to collect stats
// ---------------------------------------------------------------------------

export function PerformanceInfoSampler({
  enabled,
  modelTriangles,
  sceneObjects,
  reactRenderCountRef,
  onStatsChange,
}: {
  enabled: boolean;
  modelTriangles: number;
  sceneObjects: number;
  reactRenderCountRef: MutableRefObject<number>;
  onStatsChange: (stats: ViewportPerformanceInfo | null) => void;
}) {
  const gl = useThree((s) => s.gl);
  const sampleRef = useRef({
    frames: 0,
    elapsedSec: 0,
    frameTimeMsTotal: 0,
    sinceEmitSec: 0,
    reactRenderCountAtLastEmit: 0,
  });

  useEffect(() => {
    sampleRef.current = {
      frames: 0,
      elapsedSec: 0,
      frameTimeMsTotal: 0,
      sinceEmitSec: 0,
      reactRenderCountAtLastEmit: reactRenderCountRef.current,
    };
    if (!enabled) onStatsChange(null);
  }, [enabled, modelTriangles, onStatsChange, reactRenderCountRef, sceneObjects]);

  useFrame((_state, delta) => {
    if (!enabled) return;

    const sample = sampleRef.current;
    sample.frames += 1;
    sample.elapsedSec += delta;
    sample.frameTimeMsTotal += delta * 1000;
    sample.sinceEmitSec += delta;

    if (sample.sinceEmitSec < PERFORMANCE_SAMPLE_INTERVAL_SEC) return;

    const frameCount = Math.max(1, sample.frames);
    const reactRendersDelta = reactRenderCountRef.current - sample.reactRenderCountAtLastEmit;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    onStatsChange({
      fps: frameCount / Math.max(sample.elapsedSec, 1e-6),
      frameTimeMs: sample.frameTimeMsTotal / frameCount,
      sceneObjects,
      modelTriangles,
      drawCalls: gl.info.render.calls,
      renderTriangles: gl.info.render.triangles,
      renderLines: gl.info.render.lines,
      renderPoints: gl.info.render.points,
      memoryGeometries: gl.info.memory.geometries,
      memoryTextures: gl.info.memory.textures,
      programCount: getProgramCount(gl),
      jsHeapMB: mem ? mem.usedJSHeapSize / (1024 * 1024) : null,
      jsHeapLimitMB: mem ? mem.jsHeapSizeLimit / (1024 * 1024) : null,
      reactRendersPerSec: reactRendersDelta / Math.max(sample.sinceEmitSec, 1e-6),
    });

    sample.frames = 0;
    sample.elapsedSec = 0;
    sample.frameTimeMsTotal = 0;
    sample.sinceEmitSec = 0;
    sample.reactRenderCountAtLastEmit = reactRenderCountRef.current;
  });

  return null;
}

// ---------------------------------------------------------------------------
// PerformanceInfoPanel — renders outside the Canvas as an HTML overlay
// ---------------------------------------------------------------------------

export function PerformanceInfoPanel({ enabled, stats }: { enabled: boolean; stats: ViewportPerformanceInfo | null }) {
  if (!enabled) return null;

  const rows = stats
    ? [
        ['FPS', stats.fps.toFixed(1)],
        ['Frame ms', stats.frameTimeMs.toFixed(1)],
        ['React renders/s', stats.reactRendersPerSec.toFixed(1)],
        null,
        ['Objects', formatPerformanceCount(stats.sceneObjects)],
        ['Model tris', formatPerformanceCount(stats.modelTriangles)],
        ['Drawn tris', formatPerformanceCount(stats.renderTriangles)],
        ['Draw calls', formatPerformanceCount(stats.drawCalls)],
        ['Lines', formatPerformanceCount(stats.renderLines)],
        ['Points', formatPerformanceCount(stats.renderPoints)],
        null,
        ['Geometries', formatPerformanceCount(stats.memoryGeometries)],
        ['Textures', formatPerformanceCount(stats.memoryTextures)],
        ['Programs', formatPerformanceCount(stats.programCount)],
        ...(stats.jsHeapMB !== null
          ? [null, ['JS heap', `${stats.jsHeapMB.toFixed(1)} MB`], ['Heap limit', `${stats.jsHeapLimitMB!.toFixed(0)} MB`]]
          : []),
      ]
    : null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        minWidth: 180,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--fc-border)',
        background: 'var(--fc-bgPanel)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22)',
        color: 'var(--fc-text)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.45,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          marginBottom: 6,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: 'var(--fc-textDim)',
        }}
      >
        Performance
      </div>
      {!rows && <div style={{ color: 'var(--fc-textDim)' }}>Measuring...</div>}
      {rows?.map((row, i) =>
        row === null ? (
          <div key={`sep-${i}`} style={{ height: 4 }} />
        ) : (
          <div
            key={row[0]}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span style={{ color: 'var(--fc-textDim)' }}>{row[0]}</span>
            <span>{row[1]}</span>
          </div>
        ),
      )}
    </div>
  );
}

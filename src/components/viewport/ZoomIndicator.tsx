import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

// ---------------------------------------------------------------------------
// ZoomSampler — runs inside the R3F Canvas, computes world-units-per-pixel
// ---------------------------------------------------------------------------

export function ZoomSampler({ onZoomChange }: { onZoomChange: (mmPerPx: number) => void }) {
  const lastEmittedRef = useRef(0);

  useFrame(({ camera, size, controls }) => {
    if (size.height <= 0) return;

    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    let mmPerPx: number;

    if (isOrtho) {
      const ortho = camera as THREE.OrthographicCamera;
      mmPerPx = (ortho.top - ortho.bottom) / Math.max(1e-6, ortho.zoom) / size.height;
    } else {
      // For perspective, use distance to orbit target (not origin)
      const orbitTarget = (controls as OrbitControlsImpl | null)?.target;
      const dist = orbitTarget ? camera.position.distanceTo(orbitTarget) : camera.position.length();
      const persp = camera as THREE.PerspectiveCamera;
      mmPerPx =
        (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov * 0.5)) * dist) /
        (size.height * Math.max(1e-6, persp.zoom));
    }

    // Only emit when the value changes meaningfully (>1% relative change)
    if (Math.abs(mmPerPx - lastEmittedRef.current) / Math.max(1e-9, lastEmittedRef.current) > 0.01) {
      lastEmittedRef.current = mmPerPx;
      onZoomChange(mmPerPx);
    }
  });

  return null;
}

// ---------------------------------------------------------------------------
// ZoomIndicatorPanel — HTML overlay, bottom-right corner
// ---------------------------------------------------------------------------

/**
 * Computes a nice scale ratio string like "2 : 1" or "1 : 5".
 *
 * We compare the on-screen size to real-world size by using the physical DPI
 * of the display (assumed 96 CSS px/inch = 25.4mm per 96px).
 *
 * mmPerPx: how many mm of model space correspond to 1 CSS pixel on screen.
 * physicalMmPerPx: how many mm of physical screen 1 CSS pixel occupies.
 *
 * scale = physicalMmPerPx / mmPerPx   (>1 means magnified, <1 means shrunk)
 */
function formatScale(mmPerPx: number): string {
  // Physical mm per CSS pixel — assuming standard 96 DPI display.
  // 1 inch = 25.4 mm, 96 px per inch → ~0.2646 mm/px.
  // On retina displays devicePixelRatio>1 but CSS pixels stay the same size,
  // so this is still correct for CSS-pixel-based layout.
  const physicalMmPerCssPx = 25.4 / 96;
  const scale = physicalMmPerCssPx / mmPerPx;

  if (!Number.isFinite(scale) || scale <= 0) return '—';

  // Find a clean ratio representation
  if (scale >= 1) {
    // Magnified: "N : 1"
    const n = roundToNice(scale);
    return n === 1 ? '1 : 1' : `${n} : 1`;
  } else {
    // Shrunk: "1 : N"
    const n = roundToNice(1 / scale);
    return n === 1 ? '1 : 1' : `1 : ${n}`;
  }
}

/** Round to a "nice" number for display — snaps to common scale values. */
function roundToNice(v: number): number {
  if (v < 1.05) return 1;
  if (v < 1000) {
    // For values < 10, show one decimal; for larger values, round to integer
    if (v < 10) return Math.round(v * 10) / 10;
    if (v < 100) return Math.round(v);
    return Math.round(v / 10) * 10;
  }
  // Very large ratios — round to significant figures
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.round(v / mag) * mag;
}

function formatPercentage(mmPerPx: number): string {
  const physicalMmPerCssPx = 25.4 / 96;
  const pct = (physicalMmPerCssPx / mmPerPx) * 100;
  if (!Number.isFinite(pct) || pct <= 0) return '—';
  if (pct >= 1000) return `${Math.round(pct)}%`;
  if (pct >= 100) return `${Math.round(pct)}%`;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

export function ZoomIndicatorPanel({ mmPerPx }: { mmPerPx: number | null }) {
  if (mmPerPx === null) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        padding: '5px 10px',
        borderRadius: 6,
        border: '1px solid var(--fc-border)',
        background: 'var(--fc-bgPanel)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.18)',
        color: 'var(--fc-text)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.4,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ color: 'var(--fc-textDim)' }}>{formatScale(mmPerPx)}</span>
      <span style={{ color: 'var(--fc-textMuted)', fontSize: 10 }}>{formatPercentage(mmPerPx)}</span>
    </div>
  );
}

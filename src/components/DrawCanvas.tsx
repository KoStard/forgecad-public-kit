/**
 * DrawCanvas — Three.js component rendered inside the R3F Canvas.
 * Provides a hit plane for capturing draw-mode clicks and renders
 * preview geometry (rubber-band lines, snap indicators, etc.).
 */
import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useDrawStore } from '../draw/drawStore';
import * as THREE from 'three';

/** Crosshair rendered at the snap position. */
function SnapCrosshair({ x, y, snapped }: { x: number; y: number; snapped: boolean }) {
  const size = 4;
  const color = snapped ? '#4ade80' : '#a3a3a3';
  const geo = useMemo(() => {
    const pts = [
      new THREE.Vector3(x - size, y, 0.6),
      new THREE.Vector3(x + size, y, 0.6),
      new THREE.Vector3(x, y, 0.6),
      new THREE.Vector3(x, y - size, 0.6),
      new THREE.Vector3(x, y + size, 0.6),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [x, y, size]);

  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} linewidth={1} transparent opacity={0.8} />
    </lineSegments>
  );
}

/** Rubber-band line from first click to current mouse position. */
function RubberBandLine({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const lineObj = useMemo(() => {
    const pts = [
      new THREE.Vector3(from.x, from.y, 0.6),
      new THREE.Vector3(to.x, to.y, 0.6),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [from.x, from.y, to.x, to.y]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Preview rectangle outline. */
function RubberBandRect({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const lineObj = useMemo(() => {
    const x1 = Math.min(from.x, to.x);
    const y1 = Math.min(from.y, to.y);
    const x2 = Math.max(from.x, to.x);
    const y2 = Math.max(from.y, to.y);
    const pts = [
      new THREE.Vector3(x1, y1, 0.6),
      new THREE.Vector3(x2, y1, 0.6),
      new THREE.Vector3(x2, y2, 0.6),
      new THREE.Vector3(x1, y2, 0.6),
      new THREE.Vector3(x1, y1, 0.6),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [from.x, from.y, to.x, to.y]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Preview circle outline. */
function RubberBandCircle({ center, radius }: { center: { x: number; y: number }; radius: number }) {
  const lineObj = useMemo(() => {
    const segments = 64;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(
        center.x + Math.cos(angle) * radius,
        center.y + Math.sin(angle) * radius,
        0.6,
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: '#60a5fa', transparent: true, opacity: 0.7 });
    return new THREE.Line(geo, mat);
  }, [center.x, center.y, radius]);

  return <primitive object={lineObj} raycast={() => null} />;
}

/** Coordinate label showing current position near the cursor. */
function CoordLabel({ x, y }: { x: number; y: number }) {
  return (
    <Html position={[x + 5, y - 5, 0.7]} center={false} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: '#111111d9',
          color: '#e5e5e5',
          padding: '2px 6px',
          borderRadius: 3,
          fontSize: 10,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          border: '1px solid #333',
        }}
      >
        {x.toFixed(1)}, {y.toFixed(1)}
      </div>
    </Html>
  );
}

/** Axis alignment guides — lines from aligned point to cursor. */
function AlignmentGuides({
  x, y, points, snapResult,
}: {
  x: number;
  y: number;
  points: { x: number; y: number }[];
  snapResult: { xAligned: boolean; yAligned: boolean; snappedToVar: string | null } | null;
}) {
  const lineObjs = useMemo(() => {
    if (!snapResult || snapResult.snappedToVar) return [];
    const result: THREE.Line[] = [];
    const mat = new THREE.LineBasicMaterial({ color: '#34d399', transparent: true, opacity: 0.4 });

    if (snapResult.xAligned) {
      for (const p of points) {
        if (Math.abs(p.x - x) < 0.01) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, Math.min(y, p.y), 0.5),
            new THREE.Vector3(x, Math.max(y, p.y), 0.5),
          ]);
          result.push(new THREE.Line(geo, mat));
          break;
        }
      }
    }

    if (snapResult.yAligned) {
      for (const p of points) {
        if (Math.abs(p.y - y) < 0.01) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(Math.min(x, p.x), y, 0.5),
            new THREE.Vector3(Math.max(x, p.x), y, 0.5),
          ]);
          result.push(new THREE.Line(geo, mat));
          break;
        }
      }
    }

    return result;
  }, [x, y, points, snapResult]);

  return (
    <>
      {lineObjs.map((obj, i) => (
        <primitive key={i} object={obj} raycast={() => null} />
      ))}
    </>
  );
}

export function DrawCanvas() {
  const active = useDrawStore((s) => s.active);
  const tool = useDrawStore((s) => s.tool);
  const handleClick = useDrawStore((s) => s.handleClick);
  const setPreviewPoint = useDrawStore((s) => s.setPreviewPoint);
  const pendingClicks = useDrawStore((s) => s.pendingClicks);
  const previewPoint = useDrawStore((s) => s.previewPoint);
  const snapResult = useDrawStore((s) => s.snapResult);
  const points = useDrawStore((s) => s.points);

  // Adapt snap threshold to zoom level
  const worldThresholdRef = useRef(5);
  useFrame(({ camera, size }) => {
    const ortho = camera as THREE.OrthographicCamera;
    if (!ortho.isOrthographicCamera) return;
    const worldH = (ortho.top - ortho.bottom) / Math.max(1e-6, ortho.zoom);
    worldThresholdRef.current = (worldH / Math.max(1, size.height)) * 10;
  });

  if (!active) return null;

  const isSnappedToPoint = !!snapResult?.snappedToVar;

  return (
    <>
      {/* Large transparent hit plane to capture all pointer events */}
      <mesh
        position={[0, 0, 0.4]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setPreviewPoint({ x: e.point.x, y: e.point.y });
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          handleClick(e.point.x, e.point.y);
        }}
        onPointerLeave={() => setPreviewPoint(null)}
        onContextMenu={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          useDrawStore.getState().cancelPending();
        }}
      >
        <planeGeometry args={[4000, 4000]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Snap crosshair */}
      {previewPoint && (
        <SnapCrosshair x={previewPoint.x} y={previewPoint.y} snapped={isSnappedToPoint} />
      )}

      {/* Coordinate label */}
      {previewPoint && (
        <CoordLabel x={previewPoint.x} y={previewPoint.y} />
      )}

      {/* Alignment guides */}
      {previewPoint && (
        <AlignmentGuides x={previewPoint.x} y={previewPoint.y} points={points} snapResult={snapResult} />
      )}

      {/* Rubber-band preview for line tool */}
      {tool === 'line' && pendingClicks.length === 1 && previewPoint && (
        <RubberBandLine from={pendingClicks[0]} to={previewPoint} />
      )}

      {/* Rubber-band preview for rectangle tool */}
      {tool === 'rectangle' && pendingClicks.length === 1 && previewPoint && (
        <RubberBandRect from={pendingClicks[0]} to={previewPoint} />
      )}

      {/* Rubber-band preview for circle tool */}
      {tool === 'circle' && pendingClicks.length === 1 && previewPoint && (
        <RubberBandCircle
          center={pendingClicks[0]}
          radius={Math.hypot(previewPoint.x - pendingClicks[0].x, previewPoint.y - pendingClicks[0].y)}
        />
      )}

      {/* Point markers for pending clicks */}
      {pendingClicks.map((pt, i) => (
        <mesh key={`pending-${i}`} position={[pt.x, pt.y, 0.6]}>
          <circleGeometry args={[2, 16]} />
          <meshBasicMaterial color="#60a5fa" />
        </mesh>
      ))}
    </>
  );
}

import type { DebugHighlight3D, DebugHighlightEdge, DebugHighlightPlane, DebugHighlightPoint } from '@forge/sketch/highlights';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

// ─── Debug Highlights 3D Overlay ────────────────────────────────────────────
// Renders highlight()'d 3D geometry: points, edges, planes, shape outlines.

const DEBUG_HL_DEFAULT_COLOR = '#ff00ff';
const DEBUG_HL_DEFAULT_POINT_SIZE = 3;
const DEBUG_HL_DEFAULT_PLANE_SIZE = 50;

function DebugHighlightLabel({ color, label }: { color: string; label: string }) {
  return (
    <Html center style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}>
      <span
        style={{
          color,
          fontSize: 11,
          fontFamily: 'monospace',
          fontWeight: 600,
          background: 'rgba(0,0,0,0.7)',
          padding: '1px 4px',
          borderRadius: 3,
        }}
      >
        {label}
      </span>
    </Html>
  );
}

function DebugHighlightPointItem({ hl, opacity }: { hl: DebugHighlightPoint; opacity: number }) {
  const color = hl.color ?? DEBUG_HL_DEFAULT_COLOR;
  const sz = hl.size ?? DEBUG_HL_DEFAULT_POINT_SIZE;
  return (
    <group position={hl.position}>
      <mesh>
        <sphereGeometry args={[sz, 16, 12]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
      </mesh>
      {hl.label && <DebugHighlightLabel color={color} label={hl.label} />}
    </group>
  );
}

function DebugHighlightEdgeItem({ hl, opacity }: { hl: DebugHighlightEdge; opacity: number }) {
  const color = hl.color ?? DEBUG_HL_DEFAULT_COLOR;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([hl.start[0], hl.start[1], hl.start[2], hl.end[0], hl.end[1], hl.end[2]], 3),
    );
    return g;
  }, [hl.start[0], hl.start[1], hl.start[2], hl.end[0], hl.end[1], hl.end[2]]);
  const mid: [number, number, number] = [(hl.start[0] + hl.end[0]) / 2, (hl.start[1] + hl.end[1]) / 2, (hl.start[2] + hl.end[2]) / 2];
  return (
    <group>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
      </lineSegments>
      <mesh position={hl.start}>
        <sphereGeometry args={[1.5, 8, 6]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
      </mesh>
      <mesh position={hl.end}>
        <sphereGeometry args={[1.5, 8, 6]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
      </mesh>
      {hl.label && (
        <group position={mid}>
          <DebugHighlightLabel color={color} label={hl.label} />
        </group>
      )}
    </group>
  );
}

function DebugHighlightPlaneItem({ hl, opacity }: { hl: DebugHighlightPlane; opacity: number }) {
  const color = hl.color ?? DEBUG_HL_DEFAULT_COLOR;
  const sz = hl.size ?? DEBUG_HL_DEFAULT_PLANE_SIZE;

  const { matrix, center, arrowEnd } = useMemo(() => {
    const n = new THREE.Vector3(hl.normal[0], hl.normal[1], hl.normal[2]).normalize();
    const c = n.clone().multiplyScalar(hl.offset);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const mat = new THREE.Matrix4().compose(c, q, new THREE.Vector3(1, 1, 1));
    const arrowTip = c.clone().add(n.clone().multiplyScalar(sz * 0.4));
    return {
      matrix: mat,
      center: [c.x, c.y, c.z] as [number, number, number],
      arrowEnd: [arrowTip.x, arrowTip.y, arrowTip.z] as [number, number, number],
    };
  }, [hl.normal[0], hl.normal[1], hl.normal[2], hl.offset, sz]);

  const arrowGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([center[0], center[1], center[2], arrowEnd[0], arrowEnd[1], arrowEnd[2]], 3),
    );
    return g;
  }, [center[0], center[1], center[2], arrowEnd[0], arrowEnd[1], arrowEnd[2]]);

  return (
    <group>
      {/* Semi-transparent disc */}
      <mesh matrixAutoUpdate={false} matrix={matrix}>
        <circleGeometry args={[sz, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Disc border ring */}
      <mesh matrixAutoUpdate={false} matrix={matrix}>
        <ringGeometry args={[sz * 0.98, sz, 48]} />
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Normal arrow */}
      <lineSegments geometry={arrowGeo}>
        <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
      </lineSegments>
      {/* Arrow tip sphere */}
      <mesh position={arrowEnd}>
        <sphereGeometry args={[1.5, 8, 6]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
      </mesh>
      {hl.label && (
        <group position={center}>
          <DebugHighlightLabel color={color} label={hl.label} />
        </group>
      )}
    </group>
  );
}

export function DebugHighlightsOverlay({ highlights }: { highlights: DebugHighlight3D[] }) {
  const pulseRef = useRef(1.0);
  useFrame(({ clock }) => {
    pulseRef.current = 0.75 + 0.25 * Math.sin(clock.elapsedTime * 4);
  });

  if (highlights.length === 0) return null;

  return (
    <group>
      {highlights.map((hl, i) => {
        const opacity = 'pulse' in hl && hl.pulse ? pulseRef.current : 0.9;
        if (hl.kind === 'point') return <DebugHighlightPointItem key={`dh-pt-${i}`} hl={hl} opacity={opacity} />;
        if (hl.kind === 'edge') return <DebugHighlightEdgeItem key={`dh-edge-${i}`} hl={hl} opacity={opacity} />;
        if (hl.kind === 'plane') return <DebugHighlightPlaneItem key={`dh-plane-${i}`} hl={hl} opacity={opacity} />;
        return null;
      })}
    </group>
  );
}

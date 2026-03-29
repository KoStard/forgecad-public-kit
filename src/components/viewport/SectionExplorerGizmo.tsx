import { PivotControls } from '@react-three/drei';
import { useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useForgeStore } from '../../store/forgeStore';

const PLANE_COLOR = '#00bbff';
const PLANE_OPACITY = 0.12;

/** Keyed by resetKey so it remounts when the user picks an axis preset. */
function SectionGizmoInner({ size, initialNormal, initialOffset }: {
  size: number;
  initialNormal: [number, number, number];
  initialOffset: number;
}) {
  const setNormal = useForgeStore((s) => s.setSectionExplorerNormal);
  const setOffset = useForgeStore((s) => s.setSectionExplorerOffset);
  const persist = useForgeStore((s) => s.persistSectionExplorer);

  const initialMatrix = useMemo(() => {
    const m = new THREE.Matrix4();
    const n = new THREE.Vector3(...initialNormal).normalize();
    const center = n.clone().multiplyScalar(initialOffset);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.compose(center, q, new THREE.Vector3(1, 1, 1));
    return m;
  }, [initialNormal, initialOffset]);

  const handleDrag = useCallback(
    (local: THREE.Matrix4) => {
      const pos = new THREE.Vector3();
      const rot = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      local.decompose(pos, rot, scl);

      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(rot).normalize();
      setNormal([n.x, n.y, n.z]);
      setOffset(pos.dot(n));
    },
    [setNormal, setOffset],
  );

  const planeSize = Math.max(40, size * 0.9);

  const borderPositions = useMemo(() => {
    const h = planeSize / 2;
    return new Float32Array([-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0]);
  }, [planeSize]);

  return (
    <PivotControls
      matrix={initialMatrix}
      onDrag={handleDrag}
      onDragEnd={persist}
      autoTransform
      depthTest={false}
      scale={planeSize * 0.45}
      lineWidth={2}
      axisColors={['#ff4060', '#40ff60', '#4080ff']}
      hoveredColor="#ffcc00"
      disableScaling
      userData={{ measureHelper: true }}
    >
      <mesh userData={{ measureHelper: true }} renderOrder={19}>
        <planeGeometry args={[planeSize, planeSize]} />
        <meshBasicMaterial
          color={PLANE_COLOR}
          transparent
          opacity={PLANE_OPACITY}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <lineLoop renderOrder={20}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[borderPositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={PLANE_COLOR} transparent opacity={0.5} depthTest={false} />
      </lineLoop>

      {/* Normal arrow — shows clip direction */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh userData={{ measureHelper: true }} position={[0, planeSize * 0.06, 0]}>
          <cylinderGeometry args={[planeSize * 0.004, planeSize * 0.004, planeSize * 0.12, 8]} />
          <meshBasicMaterial color={PLANE_COLOR} depthTest={false} />
        </mesh>
        <mesh userData={{ measureHelper: true }} position={[0, planeSize * 0.13, 0]}>
          <coneGeometry args={[planeSize * 0.012, planeSize * 0.035, 10]} />
          <meshBasicMaterial color={PLANE_COLOR} depthTest={false} />
        </mesh>
      </group>
    </PivotControls>
  );
}

export function SectionExplorerGizmo({ size }: { size: number }) {
  const normal = useForgeStore((s) => s.sectionExplorerNormal);
  const offset = useForgeStore((s) => s.sectionExplorerOffset);
  const resetKey = useForgeStore((s) => s.sectionExplorerResetKey);

  return (
    <SectionGizmoInner
      key={resetKey}
      size={size}
      initialNormal={normal}
      initialOffset={offset}
    />
  );
}

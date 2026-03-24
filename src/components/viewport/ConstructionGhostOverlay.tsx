import { buildShapeFromCompilePlan } from '@forge/kernel';
import { shapeToGeometry } from '@forge/meshToGeometry';
import { useMemo } from 'react';
import * as THREE from 'three';
import { useForgeStore } from '../../store/forgeStore';

/** Ghost overlay for construction tree node preview.
 *  Two-pass X-ray: visible portions render as a solid+edges; occluded portions
 *  show as faint edge lines drawn through the parent object (depthTest off). */
export function ConstructionGhostOverlay({ matrix }: { matrix: THREE.Matrix4 }) {
  const ghost = useForgeStore((s) => s.constructionGhost);

  const { solidGeo, edgesGeo } = useMemo(() => {
    if (!ghost) return { solidGeo: null, edgesGeo: null };
    try {
      const shape = buildShapeFromCompilePlan(ghost.plan);
      const { solid, edges } = shapeToGeometry(shape);
      return { solidGeo: solid, edgesGeo: edges };
    } catch {
      return { solidGeo: null, edgesGeo: null };
    }
  }, [ghost]);

  if (!solidGeo || !edgesGeo) return null;

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      {/* Pass 1 — depth-tested: solid fill + crisp edges for the visible portion */}
      <mesh geometry={solidGeo} renderOrder={1}>
        <meshStandardMaterial color="#4a9eff" transparent opacity={0.25} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={edgesGeo} renderOrder={2}>
        <lineBasicMaterial color="#4a9eff" transparent opacity={1.0} depthWrite={false} />
      </lineSegments>
      {/* Pass 2 — no depth test: faint edges visible through the parent solid */}
      <lineSegments geometry={edgesGeo} renderOrder={3}>
        <lineBasicMaterial color="#4a9eff" transparent opacity={0.55} depthTest={false} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

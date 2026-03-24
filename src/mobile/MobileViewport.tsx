/**
 * Passive 3D viewport for mobile — orbit, zoom, pan only.
 * No face selection, measurements, context menus, GIF export, or performance overlay.
 */

import type { SceneObject } from '@forge/index';
import { shapeToGeometry } from '@forge/meshToGeometry';
import { getSketchWorldMatrix } from '@forge/sketch/placement3d';
import { Environment, Grid, Lightformer, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MOUSE_BUTTONS_3D, TOUCH_GESTURES_3D } from '../capture/controlsConfig';
import { useForgeStore } from '../store/forgeStore';

function MobileForgeObject({ obj, matrix }: { obj: SceneObject; matrix: THREE.Matrix4 }) {
  const geometry = useMemo(() => {
    if (!obj.shape) return null;
    return shapeToGeometry(obj.shape);
  }, [obj.shape]);

  if (!geometry) return null;

  const color = obj.color ?? '#5b9bd5';

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh geometry={geometry.solid}>
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {geometry.edges && (
        <lineSegments geometry={geometry.edges}>
          <lineBasicMaterial color="#000000" opacity={0.15} transparent linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
}

function MobileStudioEnvironment() {
  return (
    <Environment resolution={128}>
      <Lightformer form="rect" intensity={4} color="#ffffff" rotation-x={Math.PI / 2} position={[0, 40, 0]} scale={[120, 120, 1]} />
      <Lightformer form="rect" intensity={3} color="#f8fbff" rotation-y={Math.PI / 2} position={[40, 10, 20]} scale={[80, 80, 1]} />
      <Lightformer form="rect" intensity={2} color="#f4f6ff" rotation-y={-Math.PI / 2} position={[-35, -8, 16]} scale={[70, 60, 1]} />
      <Lightformer form="ring" intensity={1.25} color="#dbe8ff" rotation-x={Math.PI / 2} position={[0, -20, 0]} scale={[35, 35, 1]} />
    </Environment>
  );
}

export function MobileViewport() {
  const result = useForgeStore((s) => s.lastValidResult);
  const isEvaluating = useForgeStore((s) => s.isEvaluating);
  const objects = useMemo(() => result?.objects ?? [], [result]);
  const controlsRef = useRef(null);

  const objectMatrices = useMemo(() => {
    const out: Record<string, THREE.Matrix4> = {};
    objects.forEach((obj) => {
      out[obj.id] = obj.sketch ? new THREE.Matrix4().fromArray(getSketchWorldMatrix(obj.sketch)) : new THREE.Matrix4();
    });
    return out;
  }, [objects]);

  const themeBg = getComputedStyle(document.documentElement).getPropertyValue('--fc-viewportBg').trim() || '#1e1e1e';

  return (
    <div className="fc-mobile-viewport">
      {isEvaluating && (
        <div className="fc-mobile-status">
          <span className="fc-mobile-spinner" style={{ marginRight: 8 }} />
          Running...
        </div>
      )}
      <Canvas
        style={{ background: themeBg }}
        dpr={Math.min(window.devicePixelRatio, 2)}
        gl={{
          antialias: true,
          logarithmicDepthBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
          powerPreference: 'low-power',
        }}
        camera={{ up: [0, 0, 1] }}
      >
        <PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={100000} up={[0, 0, 1]} />
        <MobileStudioEnvironment />
        <ambientLight intensity={0.3} />
        <directionalLight position={[100, 150, 80]} intensity={1.2} />
        <directionalLight position={[-60, -40, -80]} intensity={0.3} />
        <hemisphereLight args={['#b1e1ff', '#444444', 0.4]} />

        {objects.map((obj) => {
          if (!obj.shape) return null;
          const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
          return <MobileForgeObject key={obj.id} obj={obj} matrix={matrix} />;
        })}

        <Grid
          args={[500, 500]}
          rotation-x={Math.PI / 2}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#444"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#666"
          fadeDistance={400}
          infiniteGrid
        />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          mouseButtons={MOUSE_BUTTONS_3D}
          touches={TOUCH_GESTURES_3D}
        />
      </Canvas>
    </div>
  );
}

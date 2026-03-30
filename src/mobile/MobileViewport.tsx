/**
 * Passive 3D viewport for mobile — orbit, zoom, pan only.
 * No face selection, measurements, context menus, GIF export, or performance overlay.
 * Full-quality rendering: meshPhysicalMaterial, scene() API support, post-processing.
 */

import type { SceneObject } from '@forge/index';
import { shapeToGeometry } from '@forge/mesh/meshToGeometry';
import { getSketchWorldMatrix } from '@forge/sketch/placement3d';
import { Grid, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useCallback, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { MOUSE_BUTTONS_3D, TOUCH_GESTURES_3D } from '../capture/controlsConfig';
import { SceneConfigurator } from '../components/SceneConfigurator';
import { LocalStudioEnvironment } from '../components/viewport/LocalStudioEnvironment';
import { useForgeStore } from '../store/forgeStore';

function MobileForgeObject({ obj, matrix }: { obj: SceneObject; matrix: THREE.Matrix4 }) {
  const { solid, edges, hasSmoothNormals } = useMemo(() => {
    if (!obj.shape) return { solid: null, edges: null, hasSmoothNormals: false };
    return shapeToGeometry(obj.shape);
  }, [obj.shape]);

  if (!solid) return null;

  const color = obj.color ?? '#5b9bd5';

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      <mesh geometry={solid}>
        <meshPhysicalMaterial
          color={color}
          metalness={obj.materialProps?.metalness ?? 0.05}
          roughness={obj.materialProps?.roughness ?? 0.35}
          clearcoat={obj.materialProps?.clearcoat ?? 0.1}
          clearcoatRoughness={obj.materialProps?.clearcoatRoughness ?? 0.4}
          flatShading={!hasSmoothNormals}
          side={THREE.DoubleSide}
          transparent={obj.materialProps?.opacity !== undefined && obj.materialProps.opacity < 1}
          opacity={obj.materialProps?.opacity ?? 1}
          emissive={obj.materialProps?.emissive ?? '#000000'}
          emissiveIntensity={obj.materialProps?.emissiveIntensity ?? 0}
          wireframe={obj.materialProps?.wireframe ?? false}
        />
      </mesh>
      {edges && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#000000" opacity={0.15} transparent linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
}

export function MobileViewport() {
  const result = useForgeStore((s) => s.lastValidResult);
  const isEvaluating = useForgeStore((s) => s.isEvaluating);
  const objects = useMemo(() => result?.objects ?? [], [result]);
  const sceneConfig = useMemo(() => result?.sceneConfig ?? null, [result]);
  const controlsRef = useRef(null);

  const [defaultLightsOverridden, setDefaultLightsOverridden] = useState(false);
  const [defaultEnvironmentOverridden, setDefaultEnvironmentOverridden] = useState(false);
  const handleDefaultLightsOverridden = useCallback((v: boolean) => setDefaultLightsOverridden(v), []);
  const handleDefaultEnvironmentOverridden = useCallback((v: boolean) => setDefaultEnvironmentOverridden(v), []);

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
        dpr={[1, 2]}
        gl={{
          antialias: true,
          logarithmicDepthBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        camera={{ up: [0, 0, 1] }}
      >
        <PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={100000} up={[0, 0, 1]} />

        {/* Scene configurator — applies script scene() settings */}
        {sceneConfig && (
          <SceneConfigurator
            config={sceneConfig}
            onDefaultLightsOverridden={handleDefaultLightsOverridden}
            onDefaultEnvironmentOverridden={handleDefaultEnvironmentOverridden}
          />
        )}

        {/* Default environment map (offline-safe) — hidden when script overrides */}
        {!defaultEnvironmentOverridden && <LocalStudioEnvironment />}
        {/* Default lights — hidden when script provides custom lights */}
        {!defaultLightsOverridden && (
          <>
            <ambientLight intensity={0.3} />
            <directionalLight position={[100, 150, 80]} intensity={1.2} castShadow />
            <directionalLight position={[-60, -40, -80]} intensity={0.3} />
            <hemisphereLight args={['#b1e1ff', '#444444', 0.4]} />
          </>
        )}

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

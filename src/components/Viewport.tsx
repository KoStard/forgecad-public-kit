import { useMemo, useState, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useForgeStore } from '../store/forgeStore';
import * as THREE from 'three';

/**
 * Renders the solid body with proper CAD-style shading.
 *
 * The key insight for CAD rendering vs game rendering:
 * - CAD needs FLAT shading on planar faces (each triangle keeps its own normal)
 * - CAD needs visible edges to show topology
 * - Games use smooth shading everywhere — that's what makes a box look "blobby"
 *
 * computeVertexNormals() averages normals at shared vertices, which smooths
 * the box corners. For CAD we need non-indexed geometry so each face has
 * independent flat normals.
 */
function ForgeBody() {
  const result = useForgeStore((s) => s.result);

  const { solidGeo, edgesGeo } = useMemo(() => {
    if (!result?.shape) return { solidGeo: null, edgesGeo: null };

    try {
      const mesh = result.shape.getMesh();
      const numProp = mesh.numProp;

      // Build non-indexed geometry for flat shading.
      // Each triangle gets its own 3 vertices with the face normal.
      const triCount = mesh.numTri;
      const positions = new Float32Array(triCount * 9);
      const normals = new Float32Array(triCount * 9);

      for (let t = 0; t < triCount; t++) {
        const i0 = mesh.triVerts[t * 3];
        const i1 = mesh.triVerts[t * 3 + 1];
        const i2 = mesh.triVerts[t * 3 + 2];

        const ax = mesh.vertProperties[i0 * numProp], ay = mesh.vertProperties[i0 * numProp + 1], az = mesh.vertProperties[i0 * numProp + 2];
        const bx = mesh.vertProperties[i1 * numProp], by = mesh.vertProperties[i1 * numProp + 1], bz = mesh.vertProperties[i1 * numProp + 2];
        const cx = mesh.vertProperties[i2 * numProp], cy = mesh.vertProperties[i2 * numProp + 1], cz = mesh.vertProperties[i2 * numProp + 2];

        // Face normal via cross product
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;

        const o = t * 9;
        positions[o] = ax; positions[o + 1] = ay; positions[o + 2] = az;
        positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz;
        positions[o + 6] = cx; positions[o + 7] = cy; positions[o + 8] = cz;
        normals[o] = nx; normals[o + 1] = ny; normals[o + 2] = nz;
        normals[o + 3] = nx; normals[o + 4] = ny; normals[o + 5] = nz;
        normals[o + 6] = nx; normals[o + 7] = ny; normals[o + 8] = nz;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

      // Edge geometry — extract edges where adjacent face normals differ
      // (i.e. sharp edges, which is what CAD tools show)
      const edgeGeo = new THREE.EdgesGeometry(geo, 1); // 1 degree threshold

      return { solidGeo: geo, edgesGeo: edgeGeo };
    } catch {
      return { solidGeo: null, edgesGeo: null };
    }
  }, [result]);

  if (!solidGeo) return null;

  return (
    <group>
      <mesh geometry={solidGeo}>
        <meshPhysicalMaterial
          color="#5b9bd5"
          metalness={0.05}
          roughness={0.35}
          clearcoat={0.1}
          clearcoatRoughness={0.4}
          flatShading
          side={THREE.DoubleSide}
        />
      </mesh>
      {edgesGeo && (
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial color="#1a1a2e" linewidth={1} transparent opacity={0.6} />
        </lineSegments>
      )}
    </group>
  );
}

/** Measurement tool — click two points on the model surface to measure distance */
function MeasureTool() {
  const measureMode = useForgeStore((s) => s.measureMode);
  const addMeasurePoint = useForgeStore((s) => s.addMeasurePoint);
  const measurePoints = useForgeStore((s) => s.measurePoints);
  const { camera, raycaster, scene } = useThree();

  const handleClick = useCallback(
    (e: any) => {
      if (!measureMode) return;
      e.stopPropagation();

      // Raycast against mesh children in the scene
      const meshes: THREE.Mesh[] = [];
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
      });

      const intersects = raycaster.intersectObjects(meshes, false);
      if (intersects.length > 0) {
        const p = intersects[0].point;
        addMeasurePoint([p.x, p.y, p.z]);
      }
    },
    [measureMode, addMeasurePoint, scene, raycaster],
  );

  return (
    <>
      {/* Invisible click-catcher plane when in measure mode */}
      {measureMode && (
        <mesh visible={false} onClick={handleClick}>
          <sphereGeometry args={[10000]} />
          <meshBasicMaterial side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Render measurement points and lines */}
      {measurePoints.map((pt, i) => (
        <mesh key={i} position={pt as [number, number, number]}>
          <sphereGeometry args={[1.2, 16, 16]} />
          <meshBasicMaterial color="#ff4444" />
        </mesh>
      ))}

      {measurePoints.length === 2 && <MeasureLine a={measurePoints[0]} b={measurePoints[1]} />}
    </>
  );
}

function MeasureLine({ a, b }: { a: number[]; b: number[] }) {
  const points = useMemo(
    () => [new THREE.Vector3(...a), new THREE.Vector3(...b)],
    [a, b],
  );
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  const dist = useMemo(
    () => Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2),
    [a, b],
  );
  const mid = useMemo(
    () => new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2),
    [a, b],
  );

  return (
    <group>
      <primitive object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffcc00' }))} />
      {/* Distance label as a sprite */}
      <sprite position={mid} scale={[30, 10, 1]}>
        <spriteMaterial>
          <canvasTexture
            attach="map"
            image={(() => {
              const canvas = document.createElement('canvas');
              canvas.width = 256;
              canvas.height = 64;
              const ctx = canvas.getContext('2d')!;
              ctx.fillStyle = '#000000cc';
              ctx.fillRect(0, 0, 256, 64);
              ctx.fillStyle = '#ffcc00';
              ctx.font = 'bold 32px monospace';
              ctx.textAlign = 'center';
              ctx.fillText(`${dist.toFixed(2)} mm`, 128, 42);
              return canvas;
            })()}
          />
        </spriteMaterial>
      </sprite>
    </group>
  );
}

export function Viewport() {
  const measureMode = useForgeStore((s) => s.measureMode);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [120, 80, 120], fov: 45, near: 0.1, far: 10000 }}
        style={{ background: '#252526', cursor: measureMode ? 'crosshair' : 'default' }}
        raycaster={{ params: { Line: { threshold: 0.5 } } } as any}
      >
        {/* Environment map for realistic reflections */}
        <Environment preset="studio" />
        <ambientLight intensity={0.3} />
        <directionalLight position={[100, 150, 80]} intensity={1.2} castShadow />
        <directionalLight position={[-60, -40, -80]} intensity={0.3} />
        <hemisphereLight args={['#b1e1ff', '#444444', 0.4]} />

        <ForgeBody />
        <MeasureTool />

        <Grid
          args={[500, 500]}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#404040"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#555"
          fadeDistance={400}
          infiniteGrid
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
      </Canvas>

      {/* Measure mode indicator */}
      {measureMode && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#ffcc00',
            color: '#000',
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          📏 Click two points on the model to measure
        </div>
      )}
    </div>
  );
}

import { useMemo, useState, useCallback, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useForgeStore } from '../store/forgeStore';
import { Sketch } from '@forge/sketch';
import { shapeToGeometry } from '@forge/meshToGeometry';
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
      const { solid, edges } = shapeToGeometry(result.shape);
      return { solidGeo: solid, edgesGeo: edges };
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

/** Renders a 2D sketch as filled shape + outline on the XY plane */
function SketchView() {
  const result = useForgeStore((s) => s.result);

  const { fillGeo, lineGeos, pointGeos } = useMemo(() => {
    if (!result?.sketch) return { fillGeo: null, lineGeos: [] as THREE.BufferGeometry[], pointGeos: [] as THREE.BufferGeometry[] };
    try {
      const polys = result.sketch.toPolygons();
      const lines: THREE.BufferGeometry[] = [];
      const points: THREE.BufferGeometry[] = [];

      // Build geometries for each contour
      for (const contour of polys) {
        if (contour.length === 1) {
          // Single point - render as dot
          const pt = new THREE.Vector3(contour[0][0], contour[0][1], 0);
          points.push(new THREE.BufferGeometry().setFromPoints([pt]));
        } else if (contour.length >= 2) {
          // Line or polygon
          const pts = contour.map((p: number[]) => new THREE.Vector3(p[0], p[1], 0));
          pts.push(pts[0]); // close the loop
          lines.push(new THREE.BufferGeometry().setFromPoints(pts));
        }
      }

      // Build filled shape using THREE.ShapeGeometry
      const shapes: THREE.Shape[] = [];
      for (const contour of polys) {
        if (contour.length < 3) continue;
        const shape = new THREE.Shape();
        shape.moveTo(contour[0][0], contour[0][1]);
        for (let i = 1; i < contour.length; i++) {
          shape.lineTo(contour[i][0], contour[i][1]);
        }
        shape.closePath();
        shapes.push(shape);
      }
      const fill = shapes.length > 0 ? new THREE.ShapeGeometry(shapes) : null;

      return { fillGeo: fill, lineGeos: lines, pointGeos: points };
    } catch {
      return { fillGeo: null, lineGeos: [] as THREE.BufferGeometry[], pointGeos: [] as THREE.BufferGeometry[] };
    }
  }, [result]);

  if (lineGeos.length === 0 && pointGeos.length === 0) return null;

  return (
    <group>
      {fillGeo && (
        <mesh geometry={fillGeo}>
          <meshBasicMaterial color="#5b9bd5" transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      )}
      {lineGeos.map((geo, i) => (
        <primitive key={i} object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', linewidth: 1 }))} />
      ))}
      {pointGeos.map((geo, i) => (
        <primitive key={`pt-${i}`} object={new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 5 }))} />
      ))}
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
  const result = useForgeStore((s) => s.result);
  const isSketch = result?.sketch && !result?.shape;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [120, 80, 120], fov: 45, near: 0.1, far: 10000 }}
        style={{ background: '#252526', cursor: measureMode ? 'crosshair' : 'default' }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        raycaster={{ params: { Line: { threshold: 0.5 } } } as any}
      >
        {/* Environment map for realistic reflections */}
        <Environment preset="studio" />
        <ambientLight intensity={0.3} />
        <directionalLight position={[100, 150, 80]} intensity={1.2} castShadow />
        <directionalLight position={[-60, -40, -80]} intensity={0.3} />
        <hemisphereLight args={['#b1e1ff', '#444444', 0.4]} />

        <ForgeBody />
        <SketchView />
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
          rotation={isSketch ? [Math.PI / 2, 0, 0] : undefined}
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

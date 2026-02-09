import { useMemo, useCallback, useRef, useEffect, type MutableRefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { useForgeStore, type ObjectSettings, type RenderMode, type ViewCommand } from '../store/forgeStore';
import type { SceneObject } from '@forge/index';
import { shapeToGeometry } from '@forge/meshToGeometry';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

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
function ForgeObject({
  obj,
  settings,
  renderMode,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  renderMode: RenderMode;
}) {
  const { solidGeo, edgesGeo } = useMemo(() => {
    if (!obj.shape) return { solidGeo: null, edgesGeo: null };
    try {
      const { solid, edges } = shapeToGeometry(obj.shape);
      return { solidGeo: solid, edgesGeo: edges };
    } catch {
      return { solidGeo: null, edgesGeo: null };
    }
  }, [obj.shape]);

  if (!solidGeo || !settings.visible) return null;

  const meshOpacity = settings.opacity;
  const showSolid = renderMode !== 'wireframe';
  const showEdges = renderMode === 'overlay';
  const showWire = renderMode === 'wireframe';

  return (
    <group>
      {showSolid && (
        <mesh geometry={solidGeo}>
          <meshPhysicalMaterial
            color={settings.color}
            metalness={0.05}
            roughness={0.35}
            clearcoat={0.1}
            clearcoatRoughness={0.4}
            flatShading
            side={THREE.DoubleSide}
            transparent={meshOpacity < 1}
            opacity={meshOpacity}
          />
        </mesh>
      )}
      {showWire && (
        <mesh geometry={solidGeo}>
          <meshBasicMaterial
            color={settings.color}
            wireframe
            transparent={meshOpacity < 1}
            opacity={meshOpacity}
          />
        </mesh>
      )}
      {showEdges && edgesGeo && (
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial color="#1a1a2e" linewidth={1} transparent opacity={Math.min(1, meshOpacity + 0.1)} />
        </lineSegments>
      )}
    </group>
  );
}

/** Renders a 2D sketch as filled shape + outline on the XY plane */
const formatConstraintValue = (value: number): string => {
  if (Number.isNaN(value)) return '';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
  return rounded.replace(/\\.00$/, '');
};

function SketchObject({
  obj,
  settings,
  renderMode,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  renderMode: RenderMode;
}) {
  const { fillGeo, lineGeos, pointGeos } = useMemo(() => {
    if (!obj.sketch) return { fillGeo: null, lineGeos: [] as THREE.BufferGeometry[], pointGeos: [] as THREE.BufferGeometry[] };
    try {
      const polys = obj.sketch.toPolygons();
      const lines: THREE.BufferGeometry[] = [];
      const points: THREE.BufferGeometry[] = [];

      for (const contour of polys) {
        if (contour.length === 1) {
          const pt = new THREE.Vector3(contour[0][0], contour[0][1], 0);
          points.push(new THREE.BufferGeometry().setFromPoints([pt]));
        } else if (contour.length >= 2) {
          const pts = contour.map((p: number[]) => new THREE.Vector3(p[0], p[1], 0));
          pts.push(pts[0]);
          lines.push(new THREE.BufferGeometry().setFromPoints(pts));
        }
      }

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
  }, [obj.sketch]);

  const constraintColor = obj.sketchMeta?.status === 'over'
    ? '#ff4d4f'
    : obj.sketchMeta?.status === 'fully'
      ? '#35c759'
      : obj.sketchMeta?.status === 'under'
        ? '#4aa3ff'
        : settings.color;

  const constraintSprites = useMemo(() => {
    if (!obj.sketchMeta) return [] as { id: string; texture: THREE.Texture; position: [number, number, number]; scale: [number, number, number]; }[];
    return obj.sketchMeta.constraints.map((constraint) => {
      const unit = constraint.type === 'angle' ? 'deg' : 'mm';
      const label = constraint.isDimension && constraint.value !== undefined
        ? `${constraint.label} ${formatConstraintValue(constraint.value)}${unit}`
        : constraint.label;
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = constraint.isConflicting ? '#5b1d1d' : '#111111cc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = constraint.isConflicting ? '#ff4d4f' : '#4aa3ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
        ctx.fillStyle = '#f1f1f1';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 2);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return {
        id: constraint.id,
        texture,
        position: [constraint.position[0], constraint.position[1], 0.1],
        scale: [20, 5, 1],
      };
    });
  }, [obj.sketchMeta]);

  const constructionLines = useMemo(() => {
    const meta = obj.sketchMeta?.construction;
    if (!meta) return [] as THREE.Line[];
    return meta.lines.map((line) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(line.a[0], line.a[1], 0),
        new THREE.Vector3(line.b[0], line.b[1], 0),
      ]);
      const mat = new THREE.LineDashedMaterial({ color: '#888', dashSize: 2, gapSize: 1, transparent: true, opacity: 0.6 });
      const dashed = new THREE.Line(geo, mat);
      dashed.computeLineDistances();
      return dashed;
    });
  }, [obj.sketchMeta]);

  const constructionCircles = useMemo(() => {
    const meta = obj.sketchMeta?.construction;
    if (!meta) return [] as THREE.Line[];
    const segments = 64;
    return meta.circles.map((circle) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          circle.center[0] + Math.cos(angle) * circle.radius,
          circle.center[1] + Math.sin(angle) * circle.radius,
          0,
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({ color: '#888', dashSize: 2, gapSize: 1, transparent: true, opacity: 0.6 });
      const dashed = new THREE.Line(geo, mat);
      dashed.computeLineDistances();
      return dashed;
    });
  }, [obj.sketchMeta]);

  if (!settings.visible) return null;

  const showFill = renderMode !== 'wireframe';

  return (
    <group>
      {fillGeo && showFill && (
        <mesh geometry={fillGeo}>
          <meshBasicMaterial color={constraintColor} transparent opacity={Math.min(0.6, settings.opacity)} side={THREE.DoubleSide} />
        </mesh>
      )}
      {lineGeos.map((geo, i) => (
        <primitive
          key={i}
          object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: constraintColor, linewidth: 1, transparent: true, opacity: settings.opacity }))}
        />
      ))}
      {pointGeos.map((geo, i) => (
        <primitive
          key={`pt-${i}`}
          object={new THREE.Points(geo, new THREE.PointsMaterial({ color: constraintColor, size: 5 }))}
        />
      ))}
      {constructionLines.map((line, i) => (
        <primitive key={`cl-${i}`} object={line} />
      ))}
      {constructionCircles.map((circle, i) => (
        <primitive key={`cc-${i}`} object={circle} />
      ))}
      {constraintSprites.map((sprite) => (
        <sprite key={sprite.id} position={sprite.position} scale={sprite.scale}>
          <spriteMaterial map={sprite.texture} transparent />
        </sprite>
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

function ViewController({
  controlsRef,
  command,
  objects,
  settings,
  clearCommand,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  command: ViewCommand | null;
  objects: SceneObject[];
  settings: Record<string, ObjectSettings>;
  clearCommand: () => void;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!command) return;
    const visibleObjects = objects.filter((obj) => settings[obj.id]?.visible);
    const targetObjects = command.targetId
      ? visibleObjects.filter((obj) => obj.id === command.targetId)
      : visibleObjects;

    const computeBounds = (obj: SceneObject): THREE.Box3 | null => {
      if (obj.shape) {
        try {
          const { solid } = shapeToGeometry(obj.shape);
          solid.computeBoundingBox();
          return solid.boundingBox ?? null;
        } catch {
          return null;
        }
      }
      if (obj.sketch) {
        try {
          const polys = obj.sketch.toPolygons();
          const box = new THREE.Box3();
          let hasPoint = false;
          polys.forEach((contour) => {
            contour.forEach((p) => {
              box.expandByPoint(new THREE.Vector3(p[0], p[1], 0));
              hasPoint = true;
            });
          });
          return hasPoint ? box : null;
        } catch {
          return null;
        }
      }
      return null;
    };

    const bounds = new THREE.Box3();
    let hasBounds = false;
    targetObjects.forEach((obj) => {
      const box = computeBounds(obj);
      if (box) {
        if (!hasBounds) bounds.copy(box);
        else bounds.union(box);
        hasBounds = true;
      }
    });

    if (!hasBounds) {
      clearCommand();
      return;
    }

    const center = new THREE.Vector3();
    bounds.getCenter(center);
    const sizeVec = new THREE.Vector3();
    bounds.getSize(sizeVec);
    const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 1);

    const controls = controlsRef.current;
    const camDir = new THREE.Vector3();
    if (command.type === 'snap') {
      const viewMap: Record<string, THREE.Vector3> = {
        front: new THREE.Vector3(0, 0, 1),
        back: new THREE.Vector3(0, 0, -1),
        left: new THREE.Vector3(-1, 0, 0),
        right: new THREE.Vector3(1, 0, 0),
        top: new THREE.Vector3(0, 1, 0),
        bottom: new THREE.Vector3(0, -1, 0),
        iso: new THREE.Vector3(1, 1, 1),
      };
      camDir.copy(viewMap[command.view ?? 'iso']).normalize();
    } else if (controls) {
      camDir.subVectors(camera.position, controls.target).normalize();
      if (camDir.lengthSq() === 0) camDir.set(1, 1, 1).normalize();
    } else {
      camDir.set(1, 1, 1).normalize();
    }

    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    if (isOrtho) {
      const ortho = camera as THREE.OrthographicCamera;
      const zoom = Math.min(size.width, size.height) / maxDim / 2.2;
      ortho.zoom = Math.max(0.1, zoom);
      ortho.position.copy(center.clone().add(camDir.multiplyScalar(maxDim * 2)));
      ortho.updateProjectionMatrix();
    } else {
      const persp = camera as THREE.PerspectiveCamera;
      const dist = maxDim / (2 * Math.tan((persp.fov * Math.PI) / 360)) * 1.4;
      persp.position.copy(center.clone().add(camDir.multiplyScalar(dist)));
      persp.updateProjectionMatrix();
    }

    if (controls) {
      controls.target.copy(center);
      controls.update();
    } else {
      camera.lookAt(center);
    }

    clearCommand();
  }, [camera, clearCommand, command, controlsRef, objects, settings, size.height, size.width]);

  return null;
}

export function Viewport() {
  const measureMode = useForgeStore((s) => s.measureMode);
  const result = useForgeStore((s) => s.result);
  const renderMode = useForgeStore((s) => s.renderMode);
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const gridEnabled = useForgeStore((s) => s.gridEnabled);
  const gridSize = useForgeStore((s) => s.gridSize);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const viewCommand = useForgeStore((s) => s.viewCommand);
  const clearViewCommand = useForgeStore((s) => s.clearViewCommand);
  const objects = result?.objects ?? [];
  const hasShape = objects.some((obj) => obj.shape);
  const isSketchOnly = !hasShape && objects.some((obj) => obj.sketch);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        style={{ background: '#252526', cursor: measureMode ? 'crosshair' : 'default' }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        raycaster={{ params: { Line: { threshold: 0.5 } } } as any}
      >
        {projectionMode === 'orthographic' ? (
          <OrthographicCamera makeDefault position={[120, 80, 120]} zoom={2} near={0.1} far={10000} />
        ) : (
          <PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={10000} />
        )}

        {/* Environment map for realistic reflections */}
        <Environment preset="studio" />
        <ambientLight intensity={0.3} />
        <directionalLight position={[100, 150, 80]} intensity={1.2} castShadow />
        <directionalLight position={[-60, -40, -80]} intensity={0.3} />
        <hemisphereLight args={['#b1e1ff', '#444444', 0.4]} />

        {objects.map((obj) => {
          const settings = objectSettings[obj.id] ?? { visible: true, opacity: 1, color: '#5b9bd5' };
          if (obj.shape) {
            return <ForgeObject key={obj.id} obj={obj} settings={settings} renderMode={renderMode} />;
          }
          if (obj.sketch) {
            return <SketchObject key={obj.id} obj={obj} settings={settings} renderMode={renderMode} />;
          }
          return null;
        })}
        <MeasureTool />

        {gridEnabled && (
          <Grid
            args={[500, 500]}
            cellSize={gridSize}
            cellThickness={0.5}
            cellColor="#404040"
            sectionSize={gridSize * 5}
            sectionThickness={1}
            sectionColor="#555"
            fadeDistance={400}
            infiniteGrid
            rotation={isSketchOnly ? [Math.PI / 2, 0, 0] : undefined}
          />
        )}
        <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.1} />
        <ViewController
          controlsRef={controlsRef}
          command={viewCommand}
          objects={objects}
          settings={objectSettings}
          clearCommand={clearViewCommand}
        />
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

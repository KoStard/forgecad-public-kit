import { useMemo, useCallback, useRef, useEffect, useState, type MutableRefObject } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, OrthographicCamera, PerspectiveCamera, Html } from '@react-three/drei';
import { useForgeStore, type ObjectSettings, type ProjectionMode, type RenderMode, type ViewCommand } from '../store/forgeStore';
import type { SceneObject } from '@forge/index';
import { shapeToGeometry } from '@forge/meshToGeometry';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

/** Labeled axes helper — draws X/Y/Z arrows with text labels */
function LabeledAxes({ size = 50 }: { size?: number }) {
  const labelStyle = (color: string): React.CSSProperties => ({
    color,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'monospace',
    userSelect: 'none',
    pointerEvents: 'none',
    textShadow: '0 0 3px #000, 0 0 6px #000',
  });
  return (
    <group>
      <axesHelper args={[size]} />
      <Html position={[size + 3, 0, 0]} center style={labelStyle('#ff4444')}>X</Html>
      <Html position={[0, size + 3, 0]} center style={labelStyle('#44ff44')}>Y</Html>
      <Html position={[0, 0, size + 3]} center style={labelStyle('#4488ff')}>Z</Html>
    </group>
  );
}

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
type SnapKind = 'vertex' | 'edge' | 'edge-mid' | 'face-center' | 'free';

type SnapResult = {
  point: THREE.Vector3;
  type: SnapKind;
  edge?: [THREE.Vector3, THREE.Vector3];
};

type DragInfo = {
  id: string;
  index: number;
};

const SNAP_COLORS: Record<SnapKind, string> = {
  vertex: '#4a9eff',
  edge: '#ffcc00',
  'edge-mid': '#ff8a00',
  'face-center': '#7bd88f',
  free: '#ff4444',
};

const distance2D = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
};

const closestPointOnSegment = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 => {
  const ab = b.clone().sub(a);
  const denom = ab.lengthSq();
  if (denom === 0) return a.clone();
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / denom, 0, 1);
  return a.clone().add(ab.multiplyScalar(t));
};

const distancePointToSegment2D = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return distance2D(px, py, ax, ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return distance2D(px, py, cx, cy);
};

function MeasureTool() {
  const measureMode = useForgeStore((s) => s.measureMode);
  const measurements = useForgeStore((s) => s.measurements);
  const addMeasurePoint = useForgeStore((s) => s.addMeasurePoint);
  const updateMeasurePoint = useForgeStore((s) => s.updateMeasurePoint);
  const measureSnapPx = useForgeStore((s) => s.measureSnapPx);
  const { camera, raycaster, scene, gl, controls } = useThree();
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<DragInfo | null>(null);
  const [draggingMarker, setDraggingMarker] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const snapEdgeGeometry = useRef<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!snapEdgeGeometry.current) return;
    if (snap?.type === 'edge' && snap.edge) {
      snapEdgeGeometry.current.setFromPoints([snap.edge[0], snap.edge[1]]);
      const position = snapEdgeGeometry.current.getAttribute('position');
      if (position) position.needsUpdate = true;
    }
  }, [snap]);

  const setCursor = useCallback((value: string) => {
    gl.domElement.style.cursor = value;
  }, [gl]);

  useEffect(() => {
    if (!measureMode) {
      setCursor('default');
      return;
    }
    if (draggingMarker) {
      setCursor('grabbing');
      return;
    }
    if (hoveredMarker) {
      setCursor('grab');
      return;
    }
    setCursor('crosshair');
  }, [draggingMarker, hoveredMarker, measureMode, setCursor]);

  useEffect(() => {
    if (!controls) return;
    const orbit = controls as OrbitControlsImpl;
    orbit.enabled = !draggingMarker;
    return () => {
      orbit.enabled = true;
    };
  }, [controls, draggingMarker]);

  const getMeshes = useCallback((): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !mesh.userData?.measureHelper) meshes.push(mesh);
    });
    return meshes;
  }, [scene]);

  const getPointerNDC = useCallback((event: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return { x, y };
  }, [gl.domElement]);

  const worldToScreen = useCallback((point: THREE.Vector3): { x: number; y: number } => {
    const rect = gl.domElement.getBoundingClientRect();
    const projected = point.clone().project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }, [camera, gl.domElement]);

  const computeSnap = useCallback((event: PointerEvent | React.PointerEvent): SnapResult | null => {
    if (!measureMode) return null;
    const pointer = getPointerNDC(event);
    raycaster.setFromCamera(pointer, camera);

    const meshes = getMeshes();
    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) {
      return null;
    }

    const hit = intersects[0];
    const hitPoint = hit.point.clone();
    if (!hit.face || !(hit.object as THREE.Mesh).geometry) {
      return { point: hitPoint, type: 'free' };
    }

    const mesh = hit.object as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    const { a, b, c } = hit.face;
    if (!position || a == null || b == null || c == null) {
      return { point: hitPoint, type: 'free' };
    }

    const vA = new THREE.Vector3().fromBufferAttribute(position, a).applyMatrix4(mesh.matrixWorld);
    const vB = new THREE.Vector3().fromBufferAttribute(position, b).applyMatrix4(mesh.matrixWorld);
    const vC = new THREE.Vector3().fromBufferAttribute(position, c).applyMatrix4(mesh.matrixWorld);

    const edgeAB: [THREE.Vector3, THREE.Vector3] = [vA, vB];
    const edgeBC: [THREE.Vector3, THREE.Vector3] = [vB, vC];
    const edgeCA: [THREE.Vector3, THREE.Vector3] = [vC, vA];
    const midAB = vA.clone().add(vB).multiplyScalar(0.5);
    const midBC = vB.clone().add(vC).multiplyScalar(0.5);
    const midCA = vC.clone().add(vA).multiplyScalar(0.5);
    const faceCenter = vA.clone().add(vB).add(vC).multiplyScalar(1 / 3);

    const pointerScreen = { x: event.clientX, y: event.clientY };
    let best: SnapResult | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    const considerPoint = (type: SnapKind, point: THREE.Vector3) => {
      const screen = worldToScreen(point);
      const dist = distance2D(pointerScreen.x, pointerScreen.y, screen.x, screen.y);
      if (dist < bestDist && dist <= measureSnapPx) {
        bestDist = dist;
        best = { point, type };
      }
    };

    const considerEdge = (edge: [THREE.Vector3, THREE.Vector3]) => {
      const sA = worldToScreen(edge[0]);
      const sB = worldToScreen(edge[1]);
      const dist = distancePointToSegment2D(pointerScreen.x, pointerScreen.y, sA.x, sA.y, sB.x, sB.y);
      if (dist < bestDist && dist <= measureSnapPx) {
        bestDist = dist;
        const point = closestPointOnSegment(hitPoint, edge[0], edge[1]);
        best = { point, type: 'edge', edge };
      }
    };

    considerPoint('vertex', vA);
    considerPoint('vertex', vB);
    considerPoint('vertex', vC);
    considerPoint('edge-mid', midAB);
    considerPoint('edge-mid', midBC);
    considerPoint('edge-mid', midCA);
    considerPoint('face-center', faceCenter);
    considerEdge(edgeAB);
    considerEdge(edgeBC);
    considerEdge(edgeCA);

    return best ?? { point: hitPoint, type: 'free' };
  }, [camera, getMeshes, getPointerNDC, measureMode, measureSnapPx, raycaster, worldToScreen]);

  const updateSnap = useCallback((event: PointerEvent | React.PointerEvent): SnapResult | null => {
    const next = computeSnap(event);
    setSnap(next && next.type !== 'free' ? next : null);
    return next;
  }, [computeSnap]);

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!measureMode || event.button !== 0) return;
    pointerDownRef.current = { x: event.clientX, y: event.clientY, moved: false };
  }, [measureMode]);

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!measureMode) return;
    if (pointerDownRef.current) {
      const dx = event.clientX - pointerDownRef.current.x;
      const dy = event.clientY - pointerDownRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 4) {
        pointerDownRef.current.moved = true;
      }
    }
    const nextSnap = updateSnap(event);
    if (dragRef.current && nextSnap) {
      updateMeasurePoint(dragRef.current.id, dragRef.current.index, [nextSnap.point.x, nextSnap.point.y, nextSnap.point.z]);
    }
  }, [measureMode, updateMeasurePoint, updateSnap]);

  const handlePointerUp = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!measureMode || event.button !== 0) return;
    if (dragRef.current) {
      dragRef.current = null;
      setDraggingMarker(null);
      return;
    }
    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!down || down.moved) return;
    const nextSnap = updateSnap(event);
    if (!nextSnap) return;
    addMeasurePoint([nextSnap.point.x, nextSnap.point.y, nextSnap.point.z]);
  }, [addMeasurePoint, measureMode, updateSnap]);

  return (
    <>
      {/* Invisible click-catcher plane when in measure mode */}
      {measureMode && (
        <mesh
          visible={false}
          userData={{ measureHelper: true }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOut={() => setSnap(null)}
        >
          <sphereGeometry args={[10000]} />
          <meshBasicMaterial side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Render measurement points and lines */}
      {measurements.flatMap((measurement) => (
        measurement.points.map((pt, index) => {
          const isHovered = hoveredMarker?.id === measurement.id && hoveredMarker.index === index;
          const isDragging = draggingMarker?.id === measurement.id && draggingMarker.index === index;
          const color = isDragging ? '#ffe38a' : (isHovered ? '#ff8888' : '#ff4444');
          return (
            <mesh
              key={`${measurement.id}-${index}`}
              position={pt as [number, number, number]}
              userData={{ measureHelper: true }}
              onPointerOver={(event) => {
                event.stopPropagation();
                if (!dragRef.current) setHoveredMarker({ id: measurement.id, index });
              }}
              onPointerOut={(event) => {
                event.stopPropagation();
                if (!dragRef.current) setHoveredMarker(null);
              }}
              onPointerDown={(event) => {
                if (!measureMode || event.button !== 0) return;
                event.stopPropagation();
                pointerDownRef.current = null;
                const target = event.target as HTMLElement | null;
                target?.setPointerCapture?.(event.pointerId);
                dragRef.current = { id: measurement.id, index };
                setDraggingMarker({ id: measurement.id, index });
              }}
              onPointerMove={(event) => {
                if (!measureMode || !dragRef.current) return;
                event.stopPropagation();
                const nextSnap = updateSnap(event);
                if (nextSnap) {
                  updateMeasurePoint(measurement.id, index, [nextSnap.point.x, nextSnap.point.y, nextSnap.point.z]);
                }
              }}
              onPointerUp={(event) => {
                if (!measureMode || event.button !== 0) return;
                event.stopPropagation();
                const target = event.target as HTMLElement | null;
                target?.releasePointerCapture?.(event.pointerId);
                dragRef.current = null;
                setDraggingMarker(null);
              }}
            >
              <sphereGeometry args={[1.2, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
          );
        })
      ))}

      {measurements.filter((m) => m.points.length === 2).map((measurement) => (
        <MeasureLine key={measurement.id} a={measurement.points[0]} b={measurement.points[1]} />
      ))}

      {measureMode && snap && snap.type !== 'edge' && (
        <mesh position={snap.point} userData={{ measureHelper: true }}>
          <sphereGeometry args={[1.6, 16, 16]} />
          <meshBasicMaterial color={SNAP_COLORS[snap.type]} />
        </mesh>
      )}

      {measureMode && snap && snap.type === 'edge' && snap.edge && (
        <line userData={{ measureHelper: true }}>
          <bufferGeometry ref={snapEdgeGeometry} />
          <lineBasicMaterial color={SNAP_COLORS.edge} linewidth={2} />
        </line>
      )}
    </>
  );
}

function MeasureLine({ a, b }: { a: number[]; b: number[] }) {
  const { camera } = useThree();
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
  const labelPos = useMemo(() => {
    const pos = mid.clone();
    const dir = camera.position.clone().sub(mid);
    if (dir.lengthSq() > 0) {
      dir.normalize();
      pos.add(dir.multiplyScalar(2));
    }
    return pos;
  }, [camera.position, mid]);
  const labelTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    return new THREE.CanvasTexture(canvas);
  }, []);

  useEffect(() => {
    const canvas = labelTexture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000cc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${dist.toFixed(2)} mm`, canvas.width / 2, canvas.height / 2);
    labelTexture.needsUpdate = true;
  }, [dist, labelTexture]);

  return (
    <group>
      <primitive object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffcc00' }))} />
      {/* Distance label as a sprite */}
      <sprite position={labelPos} scale={[30, 10, 1]}>
        <spriteMaterial map={labelTexture} depthTest={false} />
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
      // Camera position direction (Z-up convention, see coordinate-system.md)
      const viewMap: Record<string, THREE.Vector3> = {
        front: new THREE.Vector3(0, -1, 0),
        back: new THREE.Vector3(0, 1, 0),
        right: new THREE.Vector3(1, 0, 0),
        left: new THREE.Vector3(-1, 0, 0),
        top: new THREE.Vector3(0, 0, 1),
        bottom: new THREE.Vector3(0, 0, -1),
        iso: new THREE.Vector3(1, -1, 1),
      };
      // Camera up vector — top/bottom views need special up to avoid gimbal lock
      // Top: up=(0,1,0) so screen-right=X, screen-up=Y
      // Bottom: up=(0,-1,0) so screen-right=X, screen-up=-Y
      const upMap: Record<string, THREE.Vector3> = {
        top: new THREE.Vector3(0, 1, 0),
        bottom: new THREE.Vector3(0, -1, 0),
      };
      camDir.copy(viewMap[command.view ?? 'iso']).normalize();
      const up = upMap[command.view ?? ''] ?? new THREE.Vector3(0, 0, 1);
      camera.up.copy(up);
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

function ViewManager({
  isSketchOnly,
  controlsRef,
}: {
  isSketchOnly: boolean;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const wasSketchOnlyRef = useRef(false);
  const savedProjectionRef = useRef<ProjectionMode>('perspective');

  useEffect(() => {
    if (isSketchOnly && !wasSketchOnlyRef.current) {
      savedProjectionRef.current = projectionMode;
    }

    if (isSketchOnly) {
      // Switch to straight-on 2D view
      camera.position.set(0, 0, 200);
      camera.lookAt(0, 0, 0);
      camera.up.set(0, 0, 1);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
      if (projectionMode !== 'orthographic') {
        setProjectionMode('orthographic');
      }
    } else if (wasSketchOnlyRef.current) {
      const restoreMode = savedProjectionRef.current ?? 'perspective';
      if (projectionMode !== restoreMode) {
        setProjectionMode(restoreMode);
      }
    }

    wasSketchOnlyRef.current = isSketchOnly;
  }, [camera, controlsRef, isSketchOnly, projectionMode, setProjectionMode]);

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
        camera={{ up: [0, 0, 1] }}
      >
        {projectionMode === 'orthographic' ? (
          <OrthographicCamera makeDefault position={[120, 80, 120]} zoom={2} near={0.1} far={10000} up={[0, 0, 1]} />
        ) : (
          <PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={10000} up={[0, 0, 1]} />
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

        {gridEnabled && !isSketchOnly && (
          <Grid
            args={[500, 500]}
            rotation-x={Math.PI / 2}
            cellSize={gridSize}
            cellThickness={0.5}
            cellColor="#404040"
            sectionSize={gridSize * 5}
            sectionThickness={1}
            sectionColor="#555"
            fadeDistance={400}
            infiniteGrid
          />
        )}
        {!isSketchOnly && <LabeledAxes />}
        {gridEnabled && isSketchOnly && (
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
            rotation={[Math.PI / 2, 0, 0]}
            side={THREE.DoubleSide}
          />
        )}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          enableRotate={!isSketchOnly}
          mouseButtons={isSketchOnly ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : undefined}
          touches={isSketchOnly ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : undefined}
        />

        <ViewManager
          isSketchOnly={isSketchOnly}
          controlsRef={controlsRef}
        />

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
          📏 Click to place points, drag markers to adjust
        </div>
      )}
    </div>
  );
}

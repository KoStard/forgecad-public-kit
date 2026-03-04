import { useMemo, useCallback, useRef, useEffect, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Lightformer, OrthographicCamera, PerspectiveCamera, Html } from '@react-three/drei';
import { useForgeStore, type ObjectSettings, type ProjectionMode, type RenderMode, type ViewCommand } from '../store/forgeStore';
import { DEFAULT_VIEW_CONFIG } from '@forge/index';
import type {
  SceneObject,
  RunResult,
  ExplodeViewDirection,
  ExplodeViewOptions,
  JointViewDef,
  JointOverlayViewConfig,
} from '@forge/index';
import type { DimensionDef } from '@forge/sketch/dimensions';
import type { CutPlaneDef } from '@forge/cutPlane';
import { shapeToGeometry } from '@forge/meshToGeometry';
import { findJointAnimationClip, resolveJointAnimation } from '@forge/jointAnimation';
import { resolveJointViewValues } from '@forge/jointsView';
import {
  registerOrbitGifExporter,
  type OrbitGifExportOptions,
  type OrbitGifMode,
} from './exportActions';
import { themes } from '../theme';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

interface PersistedViewportCameraState {
  projectionMode: ProjectionMode;
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  orthoZoom?: number;
}

const VIEWPORT_CAMERA_STORAGE_KEY = 'fc-viewport-camera-v1';
const GIF_DEFAULT_SIZE = 720;
const GIF_DEFAULT_FPS = 18;
const GIF_DEFAULT_FRAMES_PER_TURN = 54;
const GIF_DEFAULT_HOLD_FRAMES = 4;
const GIF_DEFAULT_PITCH_DEG = 18;
const FOCUS_MODE_DIM_OPACITY = 0.1;

const waitForAnimationFrame = (): Promise<void> => (
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  })
);

const applyOrbitPose = (
  camera: THREE.Camera,
  target: THREE.Vector3,
  radius: number,
  turn: number,
  pitchDeg: number,
): void => {
  const normalizedTurn = ((turn % 1) + 1) % 1;
  const clampedPitch = THREE.MathUtils.clamp(pitchDeg, -80, 80);
  const yaw = normalizedTurn * Math.PI * 2;
  const pitch = THREE.MathUtils.degToRad(clampedPitch);
  const cosPitch = Math.cos(pitch);
  const direction = new THREE.Vector3(
    Math.sin(yaw) * cosPitch,
    -Math.cos(yaw) * cosPitch,
    Math.sin(pitch),
  ).normalize();

  camera.position.copy(target).addScaledVector(direction, radius);
  camera.up.set(0, 0, 1);
  camera.lookAt(target);
  if ('updateProjectionMatrix' in camera && typeof camera.updateProjectionMatrix === 'function') {
    camera.updateProjectionMatrix();
  }
};

interface OrbitGifOverrideSession {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  center: THREE.Vector3;
  distance: number;
  solids: THREE.Object3D[];
  wires: THREE.Object3D[];
}

function parseExportColor(input: string | undefined, fallback: number): THREE.Color {
  if (!input) return new THREE.Color(fallback);
  try {
    return new THREE.Color(input);
  } catch {
    return new THREE.Color(fallback);
  }
}

function addExportLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dir1.position.set(100, 150, 80);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-60, -40, -80);
  scene.add(dir2);

  scene.add(new THREE.HemisphereLight(0xb1e1ff, 0x444444, 0.4));
}

function setOverrideSessionMode(session: OrbitGifOverrideSession, mode: OrbitGifMode): void {
  const showSolid = mode === 'solid';
  session.solids.forEach((node) => { node.visible = showSolid; });
  session.wires.forEach((node) => { node.visible = true; });
}

function setOverrideOrbitCamera(session: OrbitGifOverrideSession, turn: number, pitchDeg: number): void {
  const normalizedTurn = ((turn % 1) + 1) % 1;
  const clampedPitch = THREE.MathUtils.clamp(pitchDeg, -80, 80);
  const yaw = normalizedTurn * Math.PI * 2;
  const pitch = THREE.MathUtils.degToRad(clampedPitch);
  const cosPitch = Math.cos(pitch);
  const direction = new THREE.Vector3(
    Math.sin(yaw) * cosPitch,
    -Math.cos(yaw) * cosPitch,
    Math.sin(pitch),
  ).normalize();

  session.camera.position.copy(session.center).addScaledVector(direction, session.distance);
  session.camera.lookAt(session.center);
  session.camera.updateProjectionMatrix();
}

function disposeOverrideSession(session: OrbitGifOverrideSession): void {
  session.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((mat) => mat.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function createOverrideSessionFromRunResult(
  runResult: RunResult,
  objectSettings: Record<string, ObjectSettings> | undefined,
  background?: string,
): OrbitGifOverrideSession {
  const scene = new THREE.Scene();
  scene.background = parseExportColor(background, 0x252526);
  addExportLights(scene);

  const solids: THREE.Object3D[] = [];
  const wires: THREE.Object3D[] = [];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  runResult.objects.forEach((obj) => {
    if (!obj.shape) return;

    const color = objectSettings?.[obj.id]?.color || obj.color;
    const geo = shapeToGeometry(obj.shape);
    const solid = new THREE.Mesh(
      geo.solid,
      new THREE.MeshPhysicalMaterial({
        color: parseExportColor(color, 0x5b9bd5),
        metalness: 0.05,
        roughness: 0.35,
        clearcoat: 0.1,
        clearcoatRoughness: 0.4,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    );
    scene.add(solid);
    solids.push(solid);

    const wire = new THREE.LineSegments(
      geo.edges,
      new THREE.LineBasicMaterial({
        color: parseExportColor(color, 0x1a1a2e),
        transparent: true,
        opacity: 0.9,
      }),
    );
    scene.add(wire);
    wires.push(wire);

    try {
      const bb = obj.shape.boundingBox();
      minX = Math.min(minX, bb.min[0]);
      minY = Math.min(minY, bb.min[1]);
      minZ = Math.min(minZ, bb.min[2]);
      maxX = Math.max(maxX, bb.max[0]);
      maxY = Math.max(maxY, bb.max[1]);
      maxZ = Math.max(maxZ, bb.max[2]);
    } catch {
      // Skip invalid bounds; export still works with remaining objects.
    }
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    throw new Error('No 3D objects available for GIF export.');
  }

  const center = new THREE.Vector3(
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
  );
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDim = Math.max(1, sizeX, sizeY, sizeZ);
  const fov = 45;
  const distance = maxDim / (2 * Math.tan((fov * Math.PI) / 360)) * 1.6;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, Math.max(10, distance * 10));
  camera.up.set(0, 0, 1);
  camera.aspect = 1;
  camera.updateProjectionMatrix();

  const session: OrbitGifOverrideSession = {
    scene,
    camera,
    center,
    distance,
    solids,
    wires,
  };
  setOverrideSessionMode(session, 'solid');
  setOverrideOrbitCamera(session, 0, GIF_DEFAULT_PITCH_DEG);
  return session;
}

const isVector3Tuple = (value: unknown): value is [number, number, number] => {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
};

const parsePersistedViewportCameraState = (value: unknown): PersistedViewportCameraState | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PersistedViewportCameraState>;
  if (candidate.projectionMode !== 'perspective' && candidate.projectionMode !== 'orthographic') return null;
  if (!isVector3Tuple(candidate.position)) return null;
  if (!isVector3Tuple(candidate.target)) return null;
  if (!isVector3Tuple(candidate.up)) return null;
  if (candidate.orthoZoom !== undefined && (!Number.isFinite(candidate.orthoZoom) || candidate.orthoZoom <= 0)) return null;
  return {
    projectionMode: candidate.projectionMode,
    position: candidate.position,
    target: candidate.target,
    up: candidate.up,
    orthoZoom: candidate.orthoZoom,
  };
};

const readPersistedViewportCameraState = (): PersistedViewportCameraState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VIEWPORT_CAMERA_STORAGE_KEY);
    if (!raw) return null;
    return parsePersistedViewportCameraState(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writePersistedViewportCameraState = (state: PersistedViewportCameraState): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIEWPORT_CAMERA_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
};

const resolveHoverObjectName = (name: string, knownFileNames: Set<string>): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Unnamed returns fall back to source filenames; skip those in hover tooltips.
  if (knownFileNames.has(trimmed)) return null;
  return trimmed;
};

const ZERO_OFFSET: [number, number, number] = [0, 0, 0];
const IDENTITY_MATRIX = new THREE.Matrix4();

const explodeHash = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const explodeFallbackVector = (seed: string): [number, number, number] => {
  const x = ((explodeHash(`${seed}|x`) % 2001) - 1000) / 1000;
  const y = ((explodeHash(`${seed}|y`) % 2001) - 1000) / 1000;
  const z = ((explodeHash(`${seed}|z`) % 2001) - 1000) / 1000;
  return [x, y, z];
};

const explodeLength = (v: [number, number, number]): number =>
  Math.hypot(v[0], v[1], v[2]);

const explodeNormalize = (
  v: [number, number, number],
  fallback: [number, number, number],
): [number, number, number] => {
  const len = explodeLength(v);
  if (len > 1e-8) return [v[0] / len, v[1] / len, v[2] / len];
  const fbLen = explodeLength(fallback);
  if (fbLen > 1e-8) return [fallback[0] / fbLen, fallback[1] / fbLen, fallback[2] / fbLen];
  return [1, 0, 0];
};

const resolveObjectCenter = (obj: SceneObject): [number, number, number] | null => {
  if (obj.shape) {
    try {
      const bb = obj.shape.boundingBox();
      return [
        (bb.min[0] + bb.max[0]) / 2,
        (bb.min[1] + bb.max[1]) / 2,
        (bb.min[2] + bb.max[2]) / 2,
      ];
    } catch {
      return null;
    }
  }
  if (obj.sketch) {
    try {
      const bb = obj.sketch.bounds();
      return [
        (bb.min[0] + bb.max[0]) / 2,
        (bb.min[1] + bb.max[1]) / 2,
        0,
      ];
    } catch {
      return null;
    }
  }
  return null;
};

const resolveExplodeDirection = (
  mode: ExplodeViewDirection,
  center: [number, number, number],
  rootCenter: [number, number, number],
  seed: string,
): [number, number, number] => {
  if (Array.isArray(mode)) {
    return explodeNormalize(mode, explodeFallbackVector(`${seed}|vec`));
  }
  if (mode === 'radial') {
    return explodeNormalize(
      [center[0] - rootCenter[0], center[1] - rootCenter[1], center[2] - rootCenter[2]],
      explodeFallbackVector(`${seed}|radial`),
    );
  }
  if (mode === 'x') return [1, 0, 0];
  if (mode === 'y') return [0, 1, 0];
  return [0, 0, 1];
};

const applyExplodeAxisLock = (
  vec: [number, number, number],
  axis: 'x' | 'y' | 'z' | undefined,
  seed: string,
): [number, number, number] => {
  if (!axis) return vec;
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const fallback = explodeFallbackVector(`${seed}|axis`);
  const comp = Math.abs(vec[idx]) > 1e-8 ? vec[idx] : fallback[idx];
  const sign = comp >= 0 ? 1 : -1;
  if (idx === 0) return [sign, 0, 0];
  if (idx === 1) return [0, sign, 0];
  return [0, 0, sign];
};

const clampJointValue = (joint: JointViewDef, value: number): number => {
  let clamped = Number.isFinite(value) ? value : joint.defaultValue;
  if (joint.min !== undefined) clamped = Math.max(joint.min, clamped);
  if (joint.max !== undefined) clamped = Math.min(joint.max, clamped);
  return clamped;
};

const resolveVisualArcAngleDeg = (
  valueDeg: number,
  visualLimitDeg: number,
): number => {
  if (!Number.isFinite(valueDeg)) return 0;
  const limit = THREE.MathUtils.clamp(visualLimitDeg, 0, 360);
  if (limit <= 1e-8) return 0;

  // Preserve exact one-turn visuals; wrap only when value goes beyond +/-360.
  if (Math.abs(valueDeg) <= 360) {
    return THREE.MathUtils.clamp(valueDeg, -limit, limit);
  }

  const wrapped = valueDeg % 360;
  return THREE.MathUtils.clamp(wrapped, -limit, limit);
};

const resolveArcReferenceDirection = (axisWorld: THREE.Vector3): THREE.Vector3 => {
  const candidates = [
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
  ];
  for (const candidate of candidates) {
    const projected = candidate.clone().addScaledVector(axisWorld, -candidate.dot(axisWorld));
    if (projected.lengthSq() > 1e-8) return projected.normalize();
  }

  const fallback = new THREE.Vector3(1, 0, 0).cross(axisWorld);
  if (fallback.lengthSq() <= 1e-8) fallback.set(0, 1, 0).cross(axisWorld);
  if (fallback.lengthSq() <= 1e-8) fallback.set(0, 0, 1);
  return fallback.normalize();
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

interface SegmentMeshTransform {
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
}

const resolveSegmentMeshTransform = (
  start: THREE.Vector3,
  end: THREE.Vector3,
): SegmentMeshTransform | null => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 1e-6) return null;
  direction.multiplyScalar(1 / length);
  return {
    midpoint: start.clone().add(end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(WORLD_UP, direction),
    length,
  };
};

const computeJointNodeMatrices = (
  joints: JointViewDef[],
  jointValues: Record<string, number>,
): Map<string, THREE.Matrix4> => {
  const byChild = new Map<string, JointViewDef>();
  joints.forEach((joint) => {
    byChild.set(joint.child, joint);
  });

  const cache = new Map<string, THREE.Matrix4>();
  const resolving = new Set<string>();

  const solveNodeMatrix = (nodeName: string): THREE.Matrix4 => {
    const cached = cache.get(nodeName);
    if (cached) return cached.clone();
    if (resolving.has(nodeName)) return new THREE.Matrix4();
    resolving.add(nodeName);

    const joint = byChild.get(nodeName);
    if (!joint) {
      const identity = new THREE.Matrix4();
      cache.set(nodeName, identity);
      resolving.delete(nodeName);
      return identity.clone();
    }

    let parentMatrix = new THREE.Matrix4();
    if (joint.parent) {
      parentMatrix = solveNodeMatrix(joint.parent);
    }

    const axis = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize();
    const axisWorld = axis.clone().transformDirection(parentMatrix);
    if (axisWorld.lengthSq() <= 1e-8) axisWorld.copy(axis);
    axisWorld.normalize();

    const value = clampJointValue(joint, jointValues[joint.name] ?? joint.defaultValue);
    let motion = new THREE.Matrix4();
    if (joint.type === 'prismatic') {
      motion.makeTranslation(axisWorld.x * value, axisWorld.y * value, axisWorld.z * value);
    } else {
      const pivotWorld = new THREE.Vector3(joint.pivot[0], joint.pivot[1], joint.pivot[2]).applyMatrix4(parentMatrix);
      motion = buildRevoluteMatrix(axisWorld, pivotWorld, value);
    }

    const solved = motion.multiply(parentMatrix);
    cache.set(nodeName, solved.clone());
    resolving.delete(nodeName);
    return solved;
  };

  joints.forEach((joint) => {
    solveNodeMatrix(joint.child);
  });

  return cache;
};

const buildRevoluteMatrix = (
  axisWorld: THREE.Vector3,
  pivotWorld: THREE.Vector3,
  angleDeg: number,
): THREE.Matrix4 => {
  const rotation = new THREE.Matrix4().makeRotationAxis(axisWorld, THREE.MathUtils.degToRad(angleDeg));
  const toPivot = new THREE.Matrix4().makeTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z);
  const fromPivot = new THREE.Matrix4().makeTranslation(-pivotWorld.x, -pivotWorld.y, -pivotWorld.z);
  return toPivot.multiply(rotation).multiply(fromPivot);
};

const expandBoundsByTransformedAabb = (
  target: THREE.Box3,
  min: [number, number, number],
  max: [number, number, number],
  matrix: THREE.Matrix4,
): void => {
  const corners: [number, number, number][] = [
    [min[0], min[1], min[2]],
    [min[0], min[1], max[2]],
    [min[0], max[1], min[2]],
    [min[0], max[1], max[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]],
  ];
  corners.forEach((corner) => {
    target.expandByPoint(new THREE.Vector3(corner[0], corner[1], corner[2]).applyMatrix4(matrix));
  });
};

/** Enable local clipping on the WebGL renderer when any cut planes are active */
function ClippingManager({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = active;
  }, [gl, active]);
  return null;
}

/** Labeled axes helper — draws X/Y/Z arrows with text labels */
function LabeledAxes({ size = 50 }: { size?: number }) {
  const axesRef = useRef<THREE.AxesHelper>(null);

  useEffect(() => {
    if (!axesRef.current) return;
    // Render axes on top of everything so they're always visible at origin
    axesRef.current.renderOrder = 999;
    axesRef.current.material = (axesRef.current.material as THREE.Material[]).length
      ? (axesRef.current.material as THREE.Material[]).map((m) => {
          m.depthTest = false;
          return m;
        })
      : (() => { (axesRef.current!.material as THREE.Material).depthTest = false; return axesRef.current!.material; })();
  }, []);

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
      <axesHelper ref={axesRef} args={[size]} />
      <Html position={[size + 3, 0, 0]} center style={labelStyle('#ff4444')}>X</Html>
      <Html position={[0, size + 3, 0]} center style={labelStyle('#44ff44')}>Y</Html>
      <Html position={[0, 0, size + 3]} center style={labelStyle('#4488ff')}>Z</Html>
    </group>
  );
}

/** Local studio lights for PBR reflections without remote HDR fetches. */
function LocalStudioEnvironment() {
  return (
    <Environment resolution={128}>
      <Lightformer
        form="rect"
        intensity={4}
        color="#ffffff"
        rotation-x={Math.PI / 2}
        position={[0, 40, 0]}
        scale={[120, 120, 1]}
      />
      <Lightformer
        form="rect"
        intensity={3}
        color="#f8fbff"
        rotation-y={Math.PI / 2}
        position={[40, 10, 20]}
        scale={[80, 80, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2}
        color="#f4f6ff"
        rotation-y={-Math.PI / 2}
        position={[-35, -8, 16]}
        scale={[70, 60, 1]}
      />
      <Lightformer
        form="ring"
        intensity={1.25}
        color="#dbe8ff"
        rotation-x={Math.PI / 2}
        position={[0, -20, 0]}
        scale={[35, 35, 1]}
      />
    </Environment>
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
  matrix,
  isHovered,
  cutPlanes,
  fallbackClippingPlanes,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onClick,
  onDoubleClick,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  renderMode: RenderMode;
  matrix: THREE.Matrix4;
  isHovered?: boolean;
  cutPlanes?: CutPlaneDef[];
  fallbackClippingPlanes?: THREE.Plane[];
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const { solidGeo, edgesGeo, useFallbackClipping } = useMemo(() => {
    if (!obj.shape) return { solidGeo: null, edgesGeo: null, useFallbackClipping: false };
    let shapeForRender = obj.shape;
    let fallbackToGpuClip = false;

    if ((cutPlanes?.length ?? 0) > 0) {
      try {
        // Cut planes are defined in world space, so convert each plane into this object's
        // local coordinates before trimming to keep sectioning aligned with animated transforms.
        const inverseMatrix = matrix.clone().invert();
        cutPlanes?.forEach((cutPlaneDef) => {
          const worldNormal = new THREE.Vector3(
            cutPlaneDef.normal[0],
            cutPlaneDef.normal[1],
            cutPlaneDef.normal[2],
          );
          if (worldNormal.lengthSq() <= 1e-8) return;
          worldNormal.normalize();

          const worldPlane = new THREE.Plane(worldNormal, -cutPlaneDef.offset);
          const localPlane = worldPlane.clone().applyMatrix4(inverseMatrix);
          const normalLength = localPlane.normal.length();
          if (!Number.isFinite(normalLength) || normalLength <= 1e-8) return;

          const invNormalLength = 1 / normalLength;
          const localNormal: [number, number, number] = [
            localPlane.normal.x * invNormalLength,
            localPlane.normal.y * invNormalLength,
            localPlane.normal.z * invNormalLength,
          ];
          const localOffset = -localPlane.constant * invNormalLength;
          shapeForRender = shapeForRender.trimByPlane(localNormal, localOffset);
        });
      } catch {
        // If boolean trimming fails on pathological geometry, fall back to GPU clipping.
        shapeForRender = obj.shape;
        fallbackToGpuClip = true;
      }
    }

    try {
      const { solid, edges } = shapeToGeometry(shapeForRender);
      return { solidGeo: solid, edgesGeo: edges, useFallbackClipping: fallbackToGpuClip };
    } catch {
      if (!fallbackToGpuClip && (cutPlanes?.length ?? 0) > 0) {
        try {
          const { solid, edges } = shapeToGeometry(obj.shape);
          return { solidGeo: solid, edgesGeo: edges, useFallbackClipping: true };
        } catch {
          return { solidGeo: null, edgesGeo: null, useFallbackClipping: false };
        }
      }
      return { solidGeo: null, edgesGeo: null, useFallbackClipping: false };
    }
  }, [cutPlanes, matrix, obj.shape]);

  useEffect(() => {
    return () => {
      solidGeo?.dispose();
      edgesGeo?.dispose();
    };
  }, [edgesGeo, solidGeo]);

  if (!solidGeo || !settings.visible) return null;

  const meshOpacity = settings.opacity;
  const showSolid = renderMode !== 'wireframe';
  const showEdges = renderMode === 'overlay';
  const showWire = renderMode === 'wireframe';
  const activeClippingPlanes = useFallbackClipping ? (fallbackClippingPlanes ?? []) : [];

  return (
    <group
      matrixAutoUpdate={false}
      matrix={matrix}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
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
            emissive={isHovered ? settings.color : '#000000'}
            emissiveIntensity={isHovered ? 0.3 : 0}
            clippingPlanes={activeClippingPlanes}
          />
        </mesh>
      )}
      {showWire && edgesGeo && (
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial color={settings.color} transparent={meshOpacity < 1} opacity={meshOpacity} clippingPlanes={activeClippingPlanes} />
        </lineSegments>
      )}
      {showEdges && edgesGeo && (
        <lineSegments geometry={edgesGeo}>
          <lineBasicMaterial color="#1a1a2e" linewidth={1} transparent opacity={Math.min(1, meshOpacity + 0.1)} clippingPlanes={activeClippingPlanes} />
        </lineSegments>
      )}
    </group>
  );
}

interface SectionPlaneGuideStyle {
  showFill: boolean;
  fillOpacity: number;
  showBorder: boolean;
  showAxis: boolean;
}

const colorFromName = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 72%, 58%)`;
};

function SectionPlaneGuide({
  def,
  sectionSize,
  style,
}: {
  def: CutPlaneDef;
  sectionSize: number;
  style: SectionPlaneGuideStyle;
}) {
  const transform = useMemo(() => {
    const normal = new THREE.Vector3(def.normal[0], def.normal[1], def.normal[2]);
    if (normal.lengthSq() < 1e-8) return null;
    normal.normalize();

    const center = normal.clone().multiplyScalar(def.offset);
    const ref = Math.abs(normal.z) < 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const tangent = new THREE.Vector3().crossVectors(ref, normal).normalize();
    if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(tangent, bitangent, normal),
    );

    return { center, quaternion };
  }, [def.normal, def.offset]);

  const borderGeometry = useMemo(() => {
    const half = sectionSize / 2;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
    ]);
  }, [sectionSize]);

  const guideColor = useMemo(() => colorFromName(def.name), [def.name]);
  const axisLength = Math.max(8, sectionSize * 0.2);
  const axisRadius = Math.max(0.2, sectionSize * 0.0045);
  const coneRadius = Math.max(0.45, sectionSize * 0.008);
  const coneHeight = Math.max(1.8, sectionSize * 0.03);

  if (!transform) return null;

  return (
    <group position={[transform.center.x, transform.center.y, transform.center.z]} quaternion={transform.quaternion}>
      {style.showFill && (
        <mesh userData={{ measureHelper: true }} renderOrder={20}>
          <planeGeometry args={[sectionSize, sectionSize]} />
          <meshBasicMaterial
            color={guideColor}
            transparent
            opacity={style.fillOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {style.showBorder && (
        <lineLoop geometry={borderGeometry} renderOrder={21}>
          <lineBasicMaterial color={guideColor} transparent opacity={0.9} depthTest={false} />
        </lineLoop>
      )}
      {style.showAxis && (
        <group renderOrder={22}>
          <mesh userData={{ measureHelper: true }} position={[0, 0, axisLength * 0.5]}>
            <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 12]} />
            <meshBasicMaterial color={guideColor} depthTest={false} />
          </mesh>
          <mesh userData={{ measureHelper: true }} position={[0, 0, axisLength + coneHeight * 0.5]}>
            <coneGeometry args={[coneRadius, coneHeight, 14]} />
            <meshBasicMaterial color={guideColor} depthTest={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function SectionPlaneGuides({
  cutPlanes,
  sectionSize,
  style,
}: {
  cutPlanes: CutPlaneDef[];
  sectionSize: number;
  style: SectionPlaneGuideStyle;
}) {
  if (cutPlanes.length === 0 || sectionSize <= 0) return null;

  return (
    <group>
      {cutPlanes.map((def) => (
        <SectionPlaneGuide key={def.name} def={def} sectionSize={sectionSize} style={style} />
      ))}
    </group>
  );
}

interface HoveredJointOverlayState {
  joint: JointViewDef;
  value: number;
  pivotWorld: THREE.Vector3;
  axisWorld: THREE.Vector3;
  axisLength: number;
}

function HoveredJointOverlay({
  state,
  config,
}: {
  state: HoveredJointOverlayState;
  config: JointOverlayViewConfig;
}) {
  const axisStart = useMemo(
    () => state.pivotWorld.clone().addScaledVector(state.axisWorld, -state.axisLength * 0.5),
    [state.axisLength, state.axisWorld, state.pivotWorld],
  );
  const axisEnd = useMemo(
    () => state.pivotWorld.clone().addScaledVector(state.axisWorld, state.axisLength * 0.5),
    [state.axisLength, state.axisWorld, state.pivotWorld],
  );
  const axisSegment = useMemo(
    () => resolveSegmentMeshTransform(axisStart, axisEnd),
    [axisEnd, axisStart],
  );
  const isRevolute = state.joint.type === 'revolute';
  const visualArcAngleDeg = useMemo(
    () => resolveVisualArcAngleDeg(state.value, config.arcVisualLimitDeg),
    [config.arcVisualLimitDeg, state.value],
  );
  const arcAngleRad = useMemo(() => THREE.MathUtils.degToRad(visualArcAngleDeg), [visualArcAngleDeg]);

  const axisLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.axisLineRadiusScale,
    config.axisLineRadiusMin,
    config.axisLineRadiusMax,
  );
  const spokeLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.spokeLineRadiusScale,
    config.spokeLineRadiusMin,
    config.spokeLineRadiusMax,
  );
  const arcLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.arcLineRadiusScale,
    config.arcLineRadiusMin,
    config.arcLineRadiusMax,
  );
  const axisDotRadius = Math.max(config.axisDotRadiusMin, state.axisLength * config.axisDotRadiusScale);
  const axisArrowRadius = Math.max(config.axisArrowRadiusMin, state.axisLength * config.axisArrowRadiusScale);
  const axisArrowLength = Math.max(config.axisArrowLengthMin, state.axisLength * config.axisArrowLengthScale);
  const arrowPosition = useMemo(
    () => axisEnd.clone().addScaledVector(state.axisWorld, axisArrowLength * config.axisArrowOffsetFactor),
    [axisArrowLength, axisEnd, config.axisArrowOffsetFactor, state.axisWorld],
  );
  const arrowQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), state.axisWorld),
    [state.axisWorld],
  );

  const arcRadius = Math.max(config.arcRadiusMin, state.axisLength * config.arcRadiusScale);
  const arcDotRadius = Math.max(config.arcDotRadiusMin, state.axisLength * config.arcDotRadiusScale);
  const arcStartDirection = useMemo(
    () => resolveArcReferenceDirection(state.axisWorld),
    [state.axisWorld],
  );
  const arcStartPoint = useMemo(
    () => state.pivotWorld.clone().addScaledVector(arcStartDirection, arcRadius),
    [arcRadius, arcStartDirection, state.pivotWorld],
  );
  const arcEndDirection = useMemo(
    () => arcStartDirection.clone().applyAxisAngle(state.axisWorld, arcAngleRad),
    [arcAngleRad, arcStartDirection, state.axisWorld],
  );
  const arcEndPoint = useMemo(
    () => state.pivotWorld.clone().addScaledVector(arcEndDirection, arcRadius),
    [arcEndDirection, arcRadius, state.pivotWorld],
  );
  const arcStartArmSegment = useMemo(
    () => resolveSegmentMeshTransform(state.pivotWorld, arcStartPoint),
    [arcStartPoint, state.pivotWorld],
  );
  const arcCurrentArmSegment = useMemo(
    () => resolveSegmentMeshTransform(state.pivotWorld, arcEndPoint),
    [arcEndPoint, state.pivotWorld],
  );
  const arcCurvePoints = useMemo(() => {
    if (!isRevolute || Math.abs(arcAngleRad) <= 1e-4) return null;
    const steps = Math.max(config.arcMinSteps, Math.ceil(Math.abs(visualArcAngleDeg) / config.arcStepDeg));
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const theta = arcAngleRad * (i / steps);
      const direction = arcStartDirection.clone().applyAxisAngle(state.axisWorld, theta);
      points.push(state.pivotWorld.clone().addScaledVector(direction, arcRadius));
    }
    return points;
  }, [
    arcAngleRad,
    config.arcMinSteps,
    config.arcStepDeg,
    arcRadius,
    arcStartDirection,
    visualArcAngleDeg,
    isRevolute,
    state.axisWorld,
    state.pivotWorld,
  ]);
  const arcTubeGeometry = useMemo(() => {
    if (!arcCurvePoints || arcCurvePoints.length < 2) return null;
    const segments = Math.max(config.arcTubeSegmentsMin, Math.ceil(arcCurvePoints.length * config.arcTubeSegmentsFactor));
    const curve = new THREE.CatmullRomCurve3(arcCurvePoints, false, 'centripetal');
    return new THREE.TubeGeometry(curve, segments, arcLineRadius, config.arcTubeRadialSegments, false);
  }, [arcCurvePoints, arcLineRadius, config.arcTubeRadialSegments, config.arcTubeSegmentsFactor, config.arcTubeSegmentsMin]);
  const arcArrowLength = Math.max(config.arcArrowLengthMin, state.axisLength * config.arcArrowLengthScale);
  const arcArrowRadius = Math.max(config.arcArrowRadiusMin, state.axisLength * config.arcArrowRadiusScale);
  const arcTangent = useMemo(() => {
    if (!isRevolute || Math.abs(arcAngleRad) <= 1e-4) return null;
    const tangent = state.axisWorld.clone().cross(arcEndDirection);
    if (tangent.lengthSq() <= 1e-8) return null;
    tangent.normalize();
    if (arcAngleRad < 0) tangent.multiplyScalar(-1);
    return tangent;
  }, [arcAngleRad, arcEndDirection, isRevolute, state.axisWorld]);
  const arcArrowPosition = useMemo(() => {
    if (!arcTangent || !arcCurvePoints) return null;
    return arcEndPoint.clone().addScaledVector(arcTangent, arcArrowLength * config.arcArrowOffsetFactor);
  }, [arcArrowLength, arcCurvePoints, arcEndPoint, arcTangent, config.arcArrowOffsetFactor]);
  const arcArrowQuaternion = useMemo(() => {
    if (!arcTangent || !arcCurvePoints) return null;
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), arcTangent);
  }, [arcCurvePoints, arcTangent]);

  useEffect(() => () => {
    arcTubeGeometry?.dispose();
  }, [arcTubeGeometry]);

  return (
    <group>
      {axisSegment && (
        <mesh
          position={[axisSegment.midpoint.x, axisSegment.midpoint.y, axisSegment.midpoint.z]}
          quaternion={axisSegment.quaternion}
          renderOrder={95}
          userData={{ measureHelper: true }}
        >
          <cylinderGeometry args={[axisLineRadius, axisLineRadius, axisSegment.length, 18]} />
          <meshBasicMaterial color={config.axisColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
        </mesh>
      )}
      <mesh
        position={[state.pivotWorld.x, state.pivotWorld.y, state.pivotWorld.z]}
        renderOrder={96}
        userData={{ measureHelper: true }}
      >
        <sphereGeometry args={[axisDotRadius, 18, 18]} />
        <meshBasicMaterial color={config.axisCoreColor} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh
        position={[arrowPosition.x, arrowPosition.y, arrowPosition.z]}
        quaternion={arrowQuaternion}
        renderOrder={96}
        userData={{ measureHelper: true }}
      >
        <coneGeometry args={[axisArrowRadius, axisArrowLength, 18]} />
        <meshBasicMaterial color={config.axisColor} depthTest={false} toneMapped={false} />
      </mesh>
      {isRevolute && (
        <>
          {arcStartArmSegment && (
            <mesh
              position={[arcStartArmSegment.midpoint.x, arcStartArmSegment.midpoint.y, arcStartArmSegment.midpoint.z]}
              quaternion={arcStartArmSegment.quaternion}
              renderOrder={97}
              userData={{ measureHelper: true }}
            >
              <cylinderGeometry args={[spokeLineRadius, spokeLineRadius, arcStartArmSegment.length, 14]} />
              <meshBasicMaterial color={config.zeroColor} depthTest={false} transparent opacity={0.95} toneMapped={false} />
            </mesh>
          )}
          {arcCurrentArmSegment && (
            <mesh
              position={[arcCurrentArmSegment.midpoint.x, arcCurrentArmSegment.midpoint.y, arcCurrentArmSegment.midpoint.z]}
              quaternion={arcCurrentArmSegment.quaternion}
              renderOrder={97}
              userData={{ measureHelper: true }}
            >
              <cylinderGeometry args={[spokeLineRadius, spokeLineRadius, arcCurrentArmSegment.length, 14]} />
              <meshBasicMaterial color={config.arcColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
            </mesh>
          )}
          {arcTubeGeometry && (
            <mesh geometry={arcTubeGeometry} renderOrder={98} userData={{ measureHelper: true }}>
              <meshBasicMaterial color={config.arcColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
            </mesh>
          )}
          <mesh
            position={[arcStartPoint.x, arcStartPoint.y, arcStartPoint.z]}
            renderOrder={98}
            userData={{ measureHelper: true }}
          >
            <sphereGeometry args={[arcDotRadius, 14, 14]} />
            <meshBasicMaterial color={config.zeroColor} depthTest={false} toneMapped={false} />
          </mesh>
          <mesh
            position={[arcEndPoint.x, arcEndPoint.y, arcEndPoint.z]}
            renderOrder={98}
            userData={{ measureHelper: true }}
          >
            <sphereGeometry args={[arcDotRadius, 14, 14]} />
            <meshBasicMaterial color={config.arcColor} depthTest={false} toneMapped={false} />
          </mesh>
          {arcArrowPosition && arcArrowQuaternion && (
            <mesh
              position={[arcArrowPosition.x, arcArrowPosition.y, arcArrowPosition.z]}
              quaternion={arcArrowQuaternion}
              renderOrder={99}
              userData={{ measureHelper: true }}
            >
              <coneGeometry args={[arcArrowRadius, arcArrowLength, 14]} />
              <meshBasicMaterial color={config.arcColor} depthTest={false} toneMapped={false} />
            </mesh>
          )}
        </>
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
  matrix,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onClick,
  onDoubleClick,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  renderMode: RenderMode;
  matrix: THREE.Matrix4;
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
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
        position: [constraint.position[0], constraint.position[1], 0.1] as [number, number, number],
        scale: [20, 5, 1] as [number, number, number],
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
    <group
      matrixAutoUpdate={false}
      matrix={matrix}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
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

/** Renders a single dimension annotation — Fusion360-style with extension lines, arrows, and label */
function DimensionAnnotation({ def }: { def: DimensionDef }) {
  const from = useMemo(() => new THREE.Vector3(...def.from), [def.from]);
  const to = useMemo(() => new THREE.Vector3(...def.to), [def.to]);
  const color = def.color ?? '#e0e0e0';
  const labelSpriteRef = useRef<THREE.Sprite>(null);
  const arrowStartRef = useRef<THREE.Mesh>(null);
  const arrowEndRef = useRef<THREE.Mesh>(null);

  // Stable perpendicular offset (camera-independent).
  // Convention: positive offset pushes "outward" (−Y for X/Z lines, −X for Y lines).
  const { dimStart, dimEnd, mid, dist } = useMemo(() => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 1e-6) return { dimStart: from, dimEnd: to, mid: from, dist: 0 };
    const dirN = dir.clone().normalize();
    const ax = Math.abs(dirN.x), ay = Math.abs(dirN.y), az = Math.abs(dirN.z);

    // Pick a perpendicular axis that pushes "outward" for typical geometry at origin:
    // X-aligned → −Y, Y-aligned → −X, Z-aligned → −Y, diagonal → cross with Z then fallback
    let perp: THREE.Vector3;
    if (az > ax && az > ay) {
      // Mostly Z-aligned → offset in −Y
      perp = new THREE.Vector3(0, -1, 0);
    } else if (ay > ax) {
      // Mostly Y-aligned → offset in −X
      perp = new THREE.Vector3(-1, 0, 0);
    } else {
      // Mostly X-aligned → offset in −Y
      perp = new THREE.Vector3(0, -1, 0);
    }
    perp.multiplyScalar(def.offset);

    const dS = from.clone().add(perp);
    const dE = to.clone().add(perp);
    return { dimStart: dS, dimEnd: dE, mid: dS.clone().add(dE).multiplyScalar(0.5), dist: len };
  }, [from, to, def.offset]);

  const label = def.label ? `${def.label}: ${dist.toFixed(1)}` : dist.toFixed(1);

  // Extension lines with gap near geometry and overshoot past dimension line
  const extDir = useMemo(() => dimStart.clone().sub(from).normalize(), [dimStart, from]);
  const extGap = Math.max(Math.abs(def.offset) * 0.15, 0.8);
  const extOver = Math.max(Math.abs(def.offset) * 0.15, 0.8);
  const extAGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    from.clone().add(extDir.clone().multiplyScalar(extGap)),
    dimStart.clone().add(extDir.clone().multiplyScalar(extOver)),
  ]), [from, dimStart, extDir, extGap, extOver]);
  const extBGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    to.clone().add(extDir.clone().multiplyScalar(extGap)),
    dimEnd.clone().add(extDir.clone().multiplyScalar(extOver)),
  ]), [to, dimEnd, extDir, extGap, extOver]);
  const dimLineGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([dimStart, dimEnd]), [dimStart, dimEnd]);

  const dimDir = useMemo(() => dimEnd.clone().sub(dimStart).normalize(), [dimStart, dimEnd]);
  const labelTextureData = useMemo(() => {
    const fontPx = 36;
    const padX = 28;
    const logicalHeight = 80;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3);

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d')!;
    measureCtx.font = `bold ${fontPx}px -apple-system, "Segoe UI", sans-serif`;
    const textWidth = measureCtx.measureText(label).width;
    const logicalWidth = THREE.MathUtils.clamp(Math.ceil(textWidth + padX * 2), 220, 720);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(logicalWidth * dpr));
    canvas.height = Math.max(1, Math.round(logicalHeight * dpr));
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    ctx.fillStyle = '#1a1a1acc';
    ctx.beginPath();
    ctx.roundRect(8, 8, logicalWidth - 16, logicalHeight - 16, 12);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `bold ${fontPx}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, logicalWidth / 2, logicalHeight / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return {
      texture,
      aspect: logicalWidth / logicalHeight,
    };
  }, [label, color]);

  useEffect(() => {
    return () => {
      labelTextureData.texture.dispose();
    };
  }, [labelTextureData]);

  useFrame(({ camera, size }) => {
    if (dist < 1e-6 || size.height <= 0) return;

    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    const worldUnitsPerPixel = isOrtho
      ? (
          (((camera as THREE.OrthographicCamera).top - (camera as THREE.OrthographicCamera).bottom)
            / Math.max(1e-6, (camera as THREE.OrthographicCamera).zoom))
          / size.height
        )
      : (
          (2
            * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov * 0.5))
            * camera.position.distanceTo(mid))
          / (size.height * Math.max(1e-6, (camera as THREE.PerspectiveCamera).zoom))
        );

    // Camera-aware on-screen sizing: stable across tiny/huge models and zoom levels.
    const labelHeightPx = 28;
    const labelWidthPx = labelHeightPx * labelTextureData.aspect;
    labelSpriteRef.current?.scale.set(
      labelWidthPx * worldUnitsPerPixel,
      labelHeightPx * worldUnitsPerPixel,
      1,
    );

    const arrowHeightPx = 12;
    const desiredArrowHeight = arrowHeightPx * worldUnitsPerPixel;
    const maxArrowHeight = Math.max(dist * 0.3, worldUnitsPerPixel * 2);
    const arrowHeight = Math.min(desiredArrowHeight, maxArrowHeight);
    arrowStartRef.current?.scale.set(arrowHeight, arrowHeight, arrowHeight);
    arrowEndRef.current?.scale.set(arrowHeight, arrowHeight, arrowHeight);
  });

  if (dist < 1e-6) return null;

  return (
    <group>
      <lineSegments geometry={extAGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.4} />
      </lineSegments>
      <lineSegments geometry={extBGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.4} />
      </lineSegments>
      <lineSegments geometry={dimLineGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.8} />
      </lineSegments>
      <mesh ref={arrowStartRef} position={dimStart} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dimDir)}>
        <coneGeometry args={[0.5, 1, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={arrowEndRef} position={dimEnd} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dimDir.clone().negate())}>
        <coneGeometry args={[0.5, 1, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <sprite ref={labelSpriteRef} position={mid}>
        <spriteMaterial map={labelTextureData.texture} depthTest={false} transparent />
      </sprite>
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
type PointerLike = { clientX: number; clientY: number };

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
  const snapEdgeLine = useMemo(() => {
    if (!snap || snap.type !== 'edge' || !snap.edge) return null;
    const geo = new THREE.BufferGeometry().setFromPoints([snap.edge[0], snap.edge[1]]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: SNAP_COLORS.edge, linewidth: 2 }));
    line.userData.measureHelper = true;
    return line;
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

  const getPointerNDC = useCallback((event: PointerLike): { x: number; y: number } => {
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

  const computeSnap = useCallback((event: PointerLike): SnapResult | null => {
    if (!measureMode) return null;
    const pointer = getPointerNDC(event);
    raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);

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

  const updateSnap = useCallback((event: PointerLike): SnapResult | null => {
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

      {measureMode && snap && snap.type === 'edge' && snap.edge && snapEdgeLine && (
        <primitive object={snapEdgeLine} />
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
  objectMatrices,
  settings,
  clearCommand,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  command: ViewCommand | null;
  objects: SceneObject[];
  objectMatrices: Record<string, THREE.Matrix4>;
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
      const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
      if (obj.shape) {
        try {
          const { solid } = shapeToGeometry(obj.shape);
          solid.computeBoundingBox();
          const bounds = solid.boundingBox ?? null;
          if (!bounds) return null;
          const out = new THREE.Box3();
          expandBoundsByTransformedAabb(
            out,
            [bounds.min.x, bounds.min.y, bounds.min.z],
            [bounds.max.x, bounds.max.y, bounds.max.z],
            matrix,
          );
          return out;
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
          if (!hasPoint) return null;
          const out = new THREE.Box3();
          expandBoundsByTransformedAabb(
            out,
            [box.min.x, box.min.y, box.min.z],
            [box.max.x, box.max.y, box.max.z],
            matrix,
          );
          return out;
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

    // "snap" (Home) targets origin; "fit"/"zoom" target model center
    const target = command.type === 'snap' ? new THREE.Vector3(0, 0, 0) : center;
    // Distance must cover model extent + offset from target
    const maxReach = command.type === 'snap'
      ? Math.max(
          sizeVec.x / 2 + Math.abs(center.x),
          sizeVec.y / 2 + Math.abs(center.y),
          sizeVec.z / 2 + Math.abs(center.z),
        ) * 2
      : maxDim;

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
      const zoom = Math.min(size.width, size.height) / maxReach / 2.2;
      ortho.zoom = Math.max(0.1, zoom);
      ortho.position.copy(target.clone().add(camDir.multiplyScalar(maxReach * 2)));
      ortho.updateProjectionMatrix();
    } else {
      const persp = camera as THREE.PerspectiveCamera;
      const dist = maxReach / (2 * Math.tan((persp.fov * Math.PI) / 360)) * 1.4;
      persp.position.copy(target.clone().add(camDir.multiplyScalar(dist)));
      persp.updateProjectionMatrix();
    }

    if (controls) {
      controls.target.copy(target);
      controls.update();
    } else {
      camera.lookAt(target);
    }

    clearCommand();
  }, [camera, clearCommand, command, controlsRef, objectMatrices, objects, settings, size.height, size.width]);

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

function ViewPersistence({
  controlsRef,
  isSketchOnly,
  onResolved,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  isSketchOnly: boolean;
  onResolved: (restored: boolean) => void;
}) {
  const { camera } = useThree();
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const restoreStatusRef = useRef<'pending' | 'done'>('pending');
  const didResolveRef = useRef(false);
  const savedStateRef = useRef<PersistedViewportCameraState | null>(readPersistedViewportCameraState());

  const resolve = useCallback((restored: boolean) => {
    if (didResolveRef.current) return;
    didResolveRef.current = true;
    onResolved(restored);
  }, [onResolved]);

  useEffect(() => {
    if (isSketchOnly) {
      restoreStatusRef.current = 'done';
      resolve(false);
    }
  }, [isSketchOnly, resolve]);

  useEffect(() => {
    if (isSketchOnly) return;
    if (restoreStatusRef.current === 'done') return;

    const saved = savedStateRef.current;
    if (!saved) {
      restoreStatusRef.current = 'done';
      resolve(false);
      return;
    }

    if (saved.projectionMode !== projectionMode) {
      setProjectionMode(saved.projectionMode);
      return;
    }

    const controls = controlsRef.current;
    if (!controls) return;

    camera.position.set(saved.position[0], saved.position[1], saved.position[2]);
    camera.up.set(saved.up[0], saved.up[1], saved.up[2]);

    if ((camera as THREE.OrthographicCamera).isOrthographicCamera && saved.orthoZoom !== undefined) {
      const ortho = camera as THREE.OrthographicCamera;
      ortho.zoom = Math.max(0.1, saved.orthoZoom);
      ortho.updateProjectionMatrix();
    } else {
      camera.updateProjectionMatrix();
    }

    controls.target.set(saved.target[0], saved.target[1], saved.target[2]);
    controls.update();

    restoreStatusRef.current = 'done';
    resolve(true);
  }, [camera, controlsRef, isSketchOnly, projectionMode, resolve, setProjectionMode]);

  useEffect(() => {
    if (restoreStatusRef.current !== 'done') return;
    if (isSketchOnly) return;

    const controls = controlsRef.current;
    if (!controls) return;

    const persistCamera = () => {
      const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
      const nextState: PersistedViewportCameraState = {
        projectionMode,
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        up: [camera.up.x, camera.up.y, camera.up.z],
        orthoZoom: isOrtho ? Math.max(0.1, (camera as THREE.OrthographicCamera).zoom) : undefined,
      };
      writePersistedViewportCameraState(nextState);
    };

    persistCamera();
    controls.addEventListener('change', persistCamera);
    return () => controls.removeEventListener('change', persistCamera);
  }, [camera, controlsRef, isSketchOnly, projectionMode]);

  return null;
}

function OrbitGifExporterBridge({
  controlsRef,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera, gl, scene } = useThree();
  const setRenderMode = useForgeStore((s) => s.setRenderMode);

  const exportOrbitGif = useCallback(async (options?: OrbitGifExportOptions): Promise<Blob> => {
    const size = Math.max(64, Math.min(2048, Math.round(options?.size ?? GIF_DEFAULT_SIZE)));
    const fps = Math.max(1, Math.round(options?.fps ?? GIF_DEFAULT_FPS));
    const framesPerTurn = Math.max(1, Math.round(options?.framesPerTurn ?? GIF_DEFAULT_FRAMES_PER_TURN));
    const holdFrames = Math.max(0, Math.round(options?.holdFrames ?? GIF_DEFAULT_HOLD_FRAMES));
    const pitchDeg = options?.pitchDeg ?? GIF_DEFAULT_PITCH_DEG;
    const includeWireframePass = options?.includeWireframePass ?? true;
    const delayMs = Math.max(20, Math.round(1000 / fps));
    const modePlan: OrbitGifMode[] = includeWireframePass ? ['solid', 'wireframe'] : ['solid'];
    const encoder = GIFEncoder();

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = size;
    captureCanvas.height = size;
    const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });
    if (!captureCtx) {
      throw new Error('Could not create GIF capture context.');
    }

    const overrideSession = options?.runResult
      ? createOverrideSessionFromRunResult(options.runResult, options.objectSettings, options.background)
      : null;

    const controls = controlsRef.current;
    const orbitTarget = overrideSession
      ? overrideSession.center.clone()
      : (controls?.target.clone() ?? new THREE.Vector3(0, 0, 0));
    let orbitRadius = overrideSession
      ? overrideSession.distance
      : camera.position.distanceTo(orbitTarget);
    if (!Number.isFinite(orbitRadius) || orbitRadius <= 1e-3) orbitRadius = 160;

    const prevCameraPos = camera.position.clone();
    const prevCameraQuat = camera.quaternion.clone();
    const prevCameraUp = camera.up.clone();
    const prevRenderMode = useForgeStore.getState().renderMode;
    const prevControlsTarget = controls?.target.clone() ?? null;
    const prevDamping = controls?.enableDamping ?? null;
    const prevSize = gl.getSize(new THREE.Vector2());
    const prevPixelRatio = gl.getPixelRatio();

    let frameIndex = 0;
    const writeFrame = async (mode: OrbitGifMode, turn: number): Promise<void> => {
      await waitForAnimationFrame();

      if (overrideSession) {
        setOverrideSessionMode(overrideSession, mode);
        setOverrideOrbitCamera(overrideSession, turn, pitchDeg);
        gl.render(overrideSession.scene, overrideSession.camera);
      } else {
        setRenderMode(mode);
        applyOrbitPose(camera, orbitTarget, orbitRadius, turn, pitchDeg);
        if (controls) {
          controls.target.copy(orbitTarget);
          controls.update();
        }
        gl.render(scene, camera);
      }

      captureCtx.clearRect(0, 0, size, size);
      captureCtx.drawImage(gl.domElement, 0, 0, size, size);
      const image = captureCtx.getImageData(0, 0, size, size);
      const palette = quantize(image.data, 256);
      const indexed = applyPalette(image.data, palette);

      if (frameIndex === 0) {
        encoder.writeFrame(indexed, size, size, {
          palette,
          delay: delayMs,
          repeat: 0,
        });
      } else {
        encoder.writeFrame(indexed, size, size, {
          palette,
          delay: delayMs,
        });
      }

      frameIndex += 1;
    };

    try {
      if (controls && !overrideSession) controls.enableDamping = false;
      gl.setPixelRatio(1);
      gl.setSize(size, size, false);

      for (const mode of modePlan) {
        for (let i = 0; i < holdFrames; i += 1) {
          await writeFrame(mode, 0);
        }
        for (let i = 0; i < framesPerTurn; i += 1) {
          await writeFrame(mode, i / framesPerTurn);
        }
      }

      encoder.finish();
      const bytes = new Uint8Array(encoder.bytes());
      return new Blob([bytes], { type: 'image/gif' });
    } finally {
      if (overrideSession) {
        disposeOverrideSession(overrideSession);
      } else {
        setRenderMode(prevRenderMode);
        await waitForAnimationFrame();

        camera.position.copy(prevCameraPos);
        camera.quaternion.copy(prevCameraQuat);
        camera.up.copy(prevCameraUp);
        if (controls && prevControlsTarget) {
          controls.target.copy(prevControlsTarget);
        }
        if (controls && prevDamping !== null) {
          controls.enableDamping = prevDamping;
          controls.update();
        } else if (!controls && prevControlsTarget) {
          camera.lookAt(prevControlsTarget);
        }
      }

      gl.setPixelRatio(prevPixelRatio);
      gl.setSize(prevSize.x, prevSize.y, false);
      gl.render(scene, camera);
    }
  }, [camera, controlsRef, gl, scene, setRenderMode]);

  useEffect(() => {
    registerOrbitGifExporter(exportOrbitGif);
    return () => {
      registerOrbitGifExporter(null);
    };
  }, [exportOrbitGif]);

  return null;
}

export function Viewport() {
  const measureMode = useForgeStore((s) => s.measureMode);
  const result = useForgeStore((s) => s.result);
  const files = useForgeStore((s) => s.files);
  const renderMode = useForgeStore((s) => s.renderMode);
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const gridEnabled = useForgeStore((s) => s.gridEnabled);
  const gridSize = useForgeStore((s) => s.gridSize);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const hoveredObjectId = useForgeStore((s) => s.hoveredObjectId);
  const setHoveredObjectId = useForgeStore((s) => s.setHoveredObjectId);
  const selectObject = useForgeStore((s) => s.selectObject);
  const focusedObjectId = useForgeStore((s) => s.focusedObjectId);
  const focusObject = useForgeStore((s) => s.focusObject);
  const clearFocusedObject = useForgeStore((s) => s.clearFocusedObject);
  const objectPickSyncEnabled = useForgeStore((s) => s.objectPickSyncEnabled);
  const explodeAmount = useForgeStore((s) => s.explodeAmount);
  const viewCommand = useForgeStore((s) => s.viewCommand);
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const clearViewCommand = useForgeStore((s) => s.clearViewCommand);
  const jointValues = useForgeStore((s) => s.jointValues);
  const jointAnimationClip = useForgeStore((s) => s.jointAnimationClip);
  const jointAnimationProgress = useForgeStore((s) => s.jointAnimationProgress);
  const jointAnimationPlaying = useForgeStore((s) => s.jointAnimationPlaying);
  const jointAnimationSpeed = useForgeStore((s) => s.jointAnimationSpeed);
  const hoveredJointName = useForgeStore((s) => s.hoveredJointName);
  const setJointAnimationProgress = useForgeStore((s) => s.setJointAnimationProgress);
  const setJointAnimationPlaying = useForgeStore((s) => s.setJointAnimationPlaying);
  const objects = result?.objects ?? [];
  const dimensions = result?.dimensions ?? [];
  const dimensionsVisible = useForgeStore((s) => s.dimensionsVisible);
  const cutPlaneEnabled = useForgeStore((s) => s.cutPlaneEnabled);
  const sectionPlaneGuidesEnabled = useForgeStore((s) => s.sectionPlaneGuidesEnabled);
  const sectionPlaneFillEnabled = useForgeStore((s) => s.sectionPlaneFillEnabled);
  const sectionPlaneFillOpacity = useForgeStore((s) => s.sectionPlaneFillOpacity);
  const sectionPlaneBorderEnabled = useForgeStore((s) => s.sectionPlaneBorderEnabled);
  const sectionPlaneAxisEnabled = useForgeStore((s) => s.sectionPlaneAxisEnabled);
  const cutPlaneDefs: CutPlaneDef[] = result?.cutPlanes ?? [];
  const explodeConfig: ExplodeViewOptions | null = result?.explodeView ?? null;
  const jointsConfig = result?.jointsView ?? null;
  const jointOverlayConfig = result?.viewConfig?.jointOverlay ?? DEFAULT_VIEW_CONFIG.jointOverlay;
  const joints = jointsConfig?.enabled === false ? [] : (jointsConfig?.joints ?? []);
  const jointCouplings = jointsConfig?.enabled === false ? [] : (jointsConfig?.couplings ?? []);
  const jointAnimations = jointsConfig?.enabled === false ? [] : (jointsConfig?.animations ?? []);
  const activeJointAnimation = useMemo(
    () => findJointAnimationClip(jointAnimations, jointAnimationClip),
    [jointAnimationClip, jointAnimations],
  );
  const animatedJointValues = useMemo(
    () => resolveJointAnimation(activeJointAnimation, jointAnimationProgress, jointValues),
    [activeJointAnimation, jointAnimationProgress, jointValues],
  );
  const effectiveJointValues = useMemo(
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues),
    [animatedJointValues, jointCouplings, joints],
  );

  const activeCutPlaneDefs = useMemo(() => {
    return cutPlaneDefs
      .filter((cp) => cutPlaneEnabled[cp.name])
      .filter((cp) => new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).lengthSq() > 1e-8);
  }, [cutPlaneDefs, cutPlaneEnabled]);

  const activeClippingPlanes = useMemo(() => {
    return activeCutPlaneDefs.map((cp) => {
      const n = new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).normalize();
      // THREE.Plane convention: clips geometry on the positive side of the plane.
      // We negate the normal so that geometry on the normal side is removed.
      return new THREE.Plane(n.negate(), cp.offset);
    });
  }, [activeCutPlaneDefs]);

  const explodeOffsets = useMemo(() => {
    if (explodeAmount <= 1e-8) return {} as Record<string, [number, number, number]>;
    if (explodeConfig?.enabled === false) return {} as Record<string, [number, number, number]>;
    if (objects.length === 0) return {} as Record<string, [number, number, number]>;

    const centersById: Record<string, [number, number, number]> = {};
    const centers: [number, number, number][] = [];
    objects.forEach((obj) => {
      const center = resolveObjectCenter(obj);
      if (!center) return;
      centersById[obj.id] = center;
      centers.push(center);
    });
    if (centers.length === 0) return {} as Record<string, [number, number, number]>;

    const rootCenter: [number, number, number] = [
      centers.reduce((sum, c) => sum + c[0], 0) / centers.length,
      centers.reduce((sum, c) => sum + c[1], 0) / centers.length,
      centers.reduce((sum, c) => sum + c[2], 0) / centers.length,
    ];

    const globalMode = explodeConfig?.mode ?? 'radial';
    const globalAxis = explodeConfig?.axisLock;
    const globalScale = explodeConfig?.amountScale ?? 1;
    const byName = explodeConfig?.byName ?? {};

    const offsets: Record<string, [number, number, number]> = {};
    objects.forEach((obj) => {
      const center = centersById[obj.id] ?? rootCenter;
      const directive = byName[obj.name];
      const mode = directive?.direction ?? globalMode;
      const axisLock = directive?.axisLock ?? globalAxis;
      const stage = directive?.stage ?? 1;
      const amount = explodeAmount * globalScale * stage;
      if (Math.abs(amount) <= 1e-8) return;
      const seed = `${obj.id}|${obj.name}`;
      const direction = resolveExplodeDirection(mode, center, rootCenter, seed);
      const locked = applyExplodeAxisLock(direction, axisLock, seed);
      offsets[obj.id] = [locked[0] * amount, locked[1] * amount, locked[2] * amount];
    });

    return offsets;
  }, [explodeAmount, explodeConfig, objects]);

  const jointNodeMatrices = useMemo(
    () => computeJointNodeMatrices(joints, effectiveJointValues),
    [effectiveJointValues, joints],
  );

  const jointMatrices = useMemo(() => {
    const out: Record<string, THREE.Matrix4> = {};
    objects.forEach((obj) => {
      out[obj.id] = new THREE.Matrix4();
    });

    if (joints.length === 0 || objects.length === 0) return out;

    const jointByChild = new Map<string, JointViewDef>();
    joints.forEach((joint) => {
      jointByChild.set(joint.child, joint);
    });

    objects.forEach((obj) => {
      let nodeName: string | null = null;
      if (jointByChild.has(obj.name)) {
        nodeName = obj.name;
      } else if (obj.groupName && jointByChild.has(obj.groupName)) {
        // ShapeGroup returns are flattened as "Group.1", "Group.2", ...
        // Resolve joints against the parent group name when exact object name is absent.
        nodeName = obj.groupName;
      }
      if (!nodeName) return;
      out[obj.id] = jointNodeMatrices.get(nodeName)?.clone() ?? new THREE.Matrix4();
    });

    return out;
  }, [jointNodeMatrices, joints, objects]);

  const objectMatrices = useMemo(() => {
    const out: Record<string, THREE.Matrix4> = {};
    objects.forEach((obj) => {
      const jointMatrix = jointMatrices[obj.id] ?? new THREE.Matrix4();
      const offset = explodeOffsets[obj.id] ?? ZERO_OFFSET;
      const explodeMatrix = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);
      out[obj.id] = explodeMatrix.multiply(jointMatrix);
    });
    return out;
  }, [explodeOffsets, jointMatrices, objects]);

  useEffect(() => {
    if (!jointAnimationPlaying || !activeJointAnimation) return;

    let raf = 0;
    let lastTs = performance.now();
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const dtSec = Math.max(0, (now - lastTs) / 1000);
      lastTs = now;

      const step = (dtSec * jointAnimationSpeed) / Math.max(1e-6, activeJointAnimation.duration);
      let next = useForgeStore.getState().jointAnimationProgress + step;
      if (next >= 1) {
        if (activeJointAnimation.loop) next = next % 1;
        else {
          next = 1;
          setJointAnimationPlaying(false);
        }
      }
      setJointAnimationProgress(next);

      if (useForgeStore.getState().jointAnimationPlaying) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [activeJointAnimation, jointAnimationPlaying, jointAnimationSpeed, setJointAnimationPlaying, setJointAnimationProgress]);

  const sectionGuideSize = useMemo(() => {
    const bounds = new THREE.Box3();
    let hasBounds = false;

    objects.forEach((obj) => {
      const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
      if (obj.shape) {
        try {
          const bb = obj.shape.boundingBox();
          expandBoundsByTransformedAabb(bounds, bb.min, bb.max, matrix);
          hasBounds = true;
        } catch {
          // Ignore bad shape bounds from partial execution failures.
        }
        return;
      }
      if (obj.sketch) {
        try {
          const bb = obj.sketch.bounds();
          expandBoundsByTransformedAabb(
            bounds,
            [bb.min[0], bb.min[1], 0],
            [bb.max[0], bb.max[1], 0],
            matrix,
          );
          hasBounds = true;
        } catch {
          // Ignore bad sketch bounds from partial execution failures.
        }
      }
    });

    if (!hasBounds) return Math.max(60, gridSize * 8);

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const diagonal = Math.max(1, size.length());
    return Math.max(60, diagonal * 1.35, gridSize * 6);
  }, [gridSize, objectMatrices, objects]);

  const jointOverlayBaseSize = useMemo(() => {
    const bounds = new THREE.Box3();
    let hasBounds = false;

    objects.forEach((obj) => {
      if (obj.shape) {
        try {
          const bb = obj.shape.boundingBox();
          expandBoundsByTransformedAabb(bounds, bb.min, bb.max, IDENTITY_MATRIX);
          hasBounds = true;
        } catch {
          // Ignore bad shape bounds from partial execution failures.
        }
        return;
      }
      if (obj.sketch) {
        try {
          const bb = obj.sketch.bounds();
          expandBoundsByTransformedAabb(
            bounds,
            [bb.min[0], bb.min[1], 0],
            [bb.max[0], bb.max[1], 0],
            IDENTITY_MATRIX,
          );
          hasBounds = true;
        } catch {
          // Ignore bad sketch bounds from partial execution failures.
        }
      }
    });

    if (!hasBounds) return Math.max(60, gridSize * 8);

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const diagonal = Math.max(1, size.length());
    return Math.max(60, diagonal * 1.35, gridSize * 6);
  }, [gridSize, objects]);

  const hoveredJointOverlay = useMemo((): HoveredJointOverlayState | null => {
    if (!jointOverlayConfig.enabled) return null;
    if (!hoveredJointName) return null;
    const joint = joints.find((entry) => entry.name === hoveredJointName);
    if (!joint) return null;

    const parentMatrix = joint.parent
      ? (jointNodeMatrices.get(joint.parent)?.clone() ?? new THREE.Matrix4())
      : new THREE.Matrix4();
    const axisLocal = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize();
    const axisWorld = axisLocal.clone().transformDirection(parentMatrix);
    if (axisWorld.lengthSq() <= 1e-8) axisWorld.copy(axisLocal);
    axisWorld.normalize();

    const pivotWorld = new THREE.Vector3(joint.pivot[0], joint.pivot[1], joint.pivot[2]).applyMatrix4(parentMatrix);
    const childObject = objects.find((obj) => obj.name === joint.child || obj.groupName === joint.child);
    if (childObject) {
      const offset = explodeOffsets[childObject.id] ?? ZERO_OFFSET;
      pivotWorld.add(new THREE.Vector3(offset[0], offset[1], offset[2]));
    }

    const value = clampJointValue(joint, effectiveJointValues[joint.name] ?? joint.defaultValue);
    const axisLength = Math.max(jointOverlayConfig.axisLengthMin, jointOverlayBaseSize * jointOverlayConfig.axisLengthScale);
    return {
      joint,
      value,
      pivotWorld,
      axisWorld,
      axisLength,
    };
  }, [
    effectiveJointValues,
    explodeOffsets,
    hoveredJointName,
    jointNodeMatrices,
    jointOverlayConfig,
    jointOverlayBaseSize,
    joints,
    objects,
  ]);

  const hasShape = objects.some((obj) => obj.shape);
  const isSketchOnly = !hasShape && objects.some((obj) => obj.sketch);
  const knownFileNames = useMemo(() => new Set(Object.keys(files)), [files]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const initialFitRequestedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewPersistenceResolved, setViewPersistenceResolved] = useState(false);
  const [hoverLabel, setHoverLabel] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const themeName = useForgeStore((s) => s.theme);
  const t = themes[themeName];

  const handleViewPersistenceResolved = useCallback((restored: boolean) => {
    if (restored) {
      initialFitRequestedRef.current = true;
    }
    setViewPersistenceResolved(true);
  }, []);

  useEffect(() => {
    if (!viewPersistenceResolved) return;
    if (initialFitRequestedRef.current) return;
    if (viewCommand) return;
    if (objects.length === 0) return;
    initialFitRequestedRef.current = true;
    requestViewCommand({ type: 'fit' });
  }, [objects.length, requestViewCommand, viewCommand, viewPersistenceResolved]);

  useEffect(() => {
    if (objectPickSyncEnabled) return;
    setHoverLabel(null);
    setHoveredObjectId(null);
  }, [objectPickSyncEnabled, setHoveredObjectId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!useForgeStore.getState().focusedObjectId) return;
      clearFocusedObject();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [clearFocusedObject]);

  const updateHoverLabel = useCallback((obj: SceneObject, event: ThreeEvent<PointerEvent>) => {
    if (!objectPickSyncEnabled || measureMode) return;
    event.stopPropagation();
    setHoveredObjectId(obj.id);
    const hoverName = resolveHoverObjectName(obj.name, knownFileNames);
    if (!hoverName) {
      setHoverLabel(null);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverLabel({
      id: obj.id,
      name: hoverName,
      x: event.clientX - rect.left + 10,
      y: event.clientY - rect.top + 12,
    });
  }, [knownFileNames, measureMode, objectPickSyncEnabled, setHoveredObjectId]);

  const clearHoverLabel = useCallback((obj: SceneObject, event: ThreeEvent<PointerEvent>) => {
    if (!objectPickSyncEnabled || measureMode) return;
    event.stopPropagation();
    if (hoveredObjectId === obj.id) setHoveredObjectId(null);
    setHoverLabel((prev) => (prev?.id === obj.id ? null : prev));
  }, [hoveredObjectId, measureMode, objectPickSyncEnabled, setHoveredObjectId]);

  const handleObjectClick = useCallback((obj: SceneObject, event: ThreeEvent<MouseEvent>) => {
    if (!objectPickSyncEnabled || measureMode) return;
    event.stopPropagation();
    selectObject(obj.id);
  }, [measureMode, objectPickSyncEnabled, selectObject]);

  const handleObjectDoubleClick = useCallback((obj: SceneObject, event: ThreeEvent<MouseEvent>) => {
    if (measureMode) return;
    event.stopPropagation();
    focusObject(obj.id);
  }, [focusObject, measureMode]);

  const handleViewportPointerMissed = useCallback((event: MouseEvent) => {
    if (event.detail !== 2) return;
    if (measureMode) return;
    clearFocusedObject();
  }, [clearFocusedObject, measureMode]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        style={{ background: t.viewportBg, cursor: measureMode ? 'crosshair' : 'default' }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          logarithmicDepthBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        raycaster={{ params: { Line: { threshold: 0.5 } } } as any}
        camera={{ up: [0, 0, 1] }}
        onPointerMissed={handleViewportPointerMissed}
      >
        {projectionMode === 'orthographic' ? (
          <OrthographicCamera makeDefault position={[120, 80, 120]} zoom={2} near={-50000} far={50000} up={[0, 0, 1]} />
        ) : (
          <PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={100000} up={[0, 0, 1]} />
        )}

        {/* Local environment map (offline-safe) */}
        <LocalStudioEnvironment />
        <ambientLight intensity={0.3} />
        <directionalLight position={[100, 150, 80]} intensity={1.2} castShadow />
        <directionalLight position={[-60, -40, -80]} intensity={0.3} />
        <hemisphereLight args={['#b1e1ff', '#444444', 0.4]} />

        <ClippingManager active={activeClippingPlanes.length > 0} />
        {sectionPlaneGuidesEnabled && activeCutPlaneDefs.length > 0 && (
          <SectionPlaneGuides
            cutPlanes={activeCutPlaneDefs}
            sectionSize={sectionGuideSize}
            style={{
              showFill: sectionPlaneFillEnabled,
              fillOpacity: sectionPlaneFillOpacity,
              showBorder: sectionPlaneBorderEnabled,
              showAxis: sectionPlaneAxisEnabled,
            }}
          />
        )}

        {objects.map((obj) => {
          const settings = objectSettings[obj.id] ?? { visible: true, opacity: 1, color: '#5b9bd5' };
          const isDimmedByFocus = !!focusedObjectId && focusedObjectId !== obj.id;
          const effectiveSettings = isDimmedByFocus
            ? { ...settings, opacity: Math.min(settings.opacity, FOCUS_MODE_DIM_OPACITY) }
            : settings;
          const isHovered = hoveredObjectId === obj.id;
          const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
          if (obj.shape) {
            return (
              <ForgeObject
                key={obj.id}
                obj={obj}
                settings={effectiveSettings}
                renderMode={renderMode}
                matrix={matrix}
                isHovered={isHovered}
                cutPlanes={activeCutPlaneDefs}
                fallbackClippingPlanes={activeClippingPlanes}
                onPointerEnter={(event) => updateHoverLabel(obj, event)}
                onPointerMove={(event) => updateHoverLabel(obj, event)}
                onPointerLeave={(event) => clearHoverLabel(obj, event)}
                onClick={(event) => handleObjectClick(obj, event)}
                onDoubleClick={(event) => handleObjectDoubleClick(obj, event)}
              />
            );
          }
          if (obj.sketch) {
            return (
              <SketchObject
                key={obj.id}
                obj={obj}
                settings={effectiveSettings}
                renderMode={renderMode}
                matrix={matrix}
                onPointerEnter={(event) => updateHoverLabel(obj, event)}
                onPointerMove={(event) => updateHoverLabel(obj, event)}
                onPointerLeave={(event) => clearHoverLabel(obj, event)}
                onClick={(event) => handleObjectClick(obj, event)}
                onDoubleClick={(event) => handleObjectDoubleClick(obj, event)}
              />
            );
          }
          return null;
        })}
        {hoveredJointOverlay && <HoveredJointOverlay state={hoveredJointOverlay} config={jointOverlayConfig} />}
        {dimensionsVisible && dimensions.map((d) => (
          <DimensionAnnotation key={d.id} def={d} />
        ))}
        <MeasureTool />

        {gridEnabled && !isSketchOnly && (
          <Grid
            args={[500, 500]}
            rotation-x={Math.PI / 2}
            cellSize={gridSize}
            cellThickness={0.5}
            cellColor={t.gridCell}
            sectionSize={gridSize * 5}
            sectionThickness={1}
            sectionColor={t.gridSection}
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
            cellColor={t.gridCell}
            sectionSize={gridSize * 5}
            sectionThickness={1}
            sectionColor={t.gridSection}
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

        <ViewPersistence
          controlsRef={controlsRef}
          isSketchOnly={isSketchOnly}
          onResolved={handleViewPersistenceResolved}
        />

        <OrbitGifExporterBridge controlsRef={controlsRef} />

        <ViewController
          controlsRef={controlsRef}
          command={viewCommand}
          objects={objects}
          objectMatrices={objectMatrices}
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
            background: 'var(--fc-warning)',
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

      {objectPickSyncEnabled && hoverLabel && !measureMode && (
        <div
          style={{
            position: 'absolute',
            left: hoverLabel.x,
            top: hoverLabel.y,
            background: '#111111d9',
            color: '#f2f2f2',
            padding: '3px 7px',
            borderRadius: 4,
            border: '1px solid #2a2a2a',
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            transform: 'translate(0, -100%)',
          }}
        >
          {hoverLabel.name}
        </div>
      )}
    </div>
  );
}

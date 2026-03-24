import type { RunResult } from '@forge/index';
import { shapeToGeometry } from '@forge/mesh/meshToGeometry';
import * as THREE from 'three';
import type { ObjectSettings } from '../../store/forgeStore';
import type { OrbitGifMode } from '../exportActions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GIF_DEFAULT_SIZE = 960;
export const GIF_DEFAULT_FPS = 24;
export const GIF_DEFAULT_FRAMES_PER_TURN = 72;
export const GIF_DEFAULT_HOLD_FRAMES = 6;
export const GIF_DEFAULT_PITCH_DEG = 18;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrbitGifOverrideSession {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  center: THREE.Vector3;
  distance: number;
  solids: THREE.Object3D[];
  wires: THREE.Object3D[];
}

// ---------------------------------------------------------------------------
// Camera helpers
// ---------------------------------------------------------------------------

export const applyOrbitPose = (camera: THREE.Camera, target: THREE.Vector3, radius: number, turn: number, pitchDeg: number): void => {
  const normalizedTurn = ((turn % 1) + 1) % 1;
  const clampedPitch = THREE.MathUtils.clamp(pitchDeg, -80, 80);
  const yaw = normalizedTurn * Math.PI * 2;
  const pitch = THREE.MathUtils.degToRad(clampedPitch);
  const cosPitch = Math.cos(pitch);
  const direction = new THREE.Vector3(Math.sin(yaw) * cosPitch, -Math.cos(yaw) * cosPitch, Math.sin(pitch)).normalize();

  camera.position.copy(target).addScaledVector(direction, radius);
  camera.up.set(0, 0, 1);
  camera.lookAt(target);
  if ('updateProjectionMatrix' in camera && typeof camera.updateProjectionMatrix === 'function') {
    camera.updateProjectionMatrix();
  }
};

// ---------------------------------------------------------------------------
// Scene helpers
// ---------------------------------------------------------------------------

export function parseExportColor(input: string | undefined, fallback: number): THREE.Color {
  if (!input) return new THREE.Color(fallback);
  try {
    return new THREE.Color(input);
  } catch {
    return new THREE.Color(fallback);
  }
}

export function addExportLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dir1.position.set(100, 150, 80);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-60, -40, -80);
  scene.add(dir2);

  scene.add(new THREE.HemisphereLight(0xb1e1ff, 0x444444, 0.4));
}

// ---------------------------------------------------------------------------
// Override session management
// ---------------------------------------------------------------------------

export function setOverrideSessionMode(session: OrbitGifOverrideSession, mode: OrbitGifMode): void {
  const showSolid = mode === 'solid';
  session.solids.forEach((node) => {
    node.visible = showSolid;
  });
  session.wires.forEach((node) => {
    node.visible = true;
  });
}

export function setOverrideOrbitCamera(session: OrbitGifOverrideSession, turn: number, pitchDeg: number): void {
  const normalizedTurn = ((turn % 1) + 1) % 1;
  const clampedPitch = THREE.MathUtils.clamp(pitchDeg, -80, 80);
  const yaw = normalizedTurn * Math.PI * 2;
  const pitch = THREE.MathUtils.degToRad(clampedPitch);
  const cosPitch = Math.cos(pitch);
  const direction = new THREE.Vector3(Math.sin(yaw) * cosPitch, -Math.cos(yaw) * cosPitch, Math.sin(pitch)).normalize();

  session.camera.position.copy(session.center).addScaledVector(direction, session.distance);
  session.camera.lookAt(session.center);
  session.camera.updateProjectionMatrix();
}

export function disposeOverrideSession(session: OrbitGifOverrideSession): void {
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

export function createOverrideSessionFromRunResult(
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
    const mp = obj.materialProps;
    const geo = shapeToGeometry(obj.shape);
    const solid = new THREE.Mesh(
      geo.solid,
      new THREE.MeshPhysicalMaterial({
        color: parseExportColor(color, 0x5b9bd5),
        metalness: mp?.metalness ?? 0.05,
        roughness: mp?.roughness ?? 0.35,
        clearcoat: mp?.clearcoat ?? 0.1,
        clearcoatRoughness: mp?.clearcoatRoughness ?? 0.4,
        flatShading: true,
        side: THREE.DoubleSide,
        ...(mp?.emissive !== undefined && { emissive: new THREE.Color(mp.emissive) }),
        ...(mp?.emissiveIntensity !== undefined && { emissiveIntensity: mp.emissiveIntensity }),
        ...(mp?.opacity !== undefined && mp.opacity < 1 && { transparent: true, opacity: mp.opacity }),
        ...(mp?.wireframe && { wireframe: true }),
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

  const center = new THREE.Vector3((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDim = Math.max(1, sizeX, sizeY, sizeZ);
  const fov = 45;
  const distance = (maxDim / (2 * Math.tan((fov * Math.PI) / 360))) * 1.6;
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

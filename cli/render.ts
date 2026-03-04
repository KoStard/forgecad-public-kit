/**
 * ForgeCAD — Headless Render Entry Point
 *
 * Loaded by render.html. Exposes __forgeRender() which the CLI
 * calls via puppeteer to execute a script and capture renders.
 *
 * Also exposes orbit-session APIs for animated captures:
 *   __forgeOrbitInit()
 *   __forgeOrbitFrame()
 *   __forgeOrbitDispose()
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { init, runScript, shapeToGeometry, CAD_MATERIAL_PROPS, EDGE_MATERIAL_PROPS } from '../src/forge/headless';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const DEFAULT_BACKGROUND = 0x252526;

let renderer: THREE.WebGLRenderer;
let orbitSession: OrbitSession | null = null;
let studioEnvTexture: THREE.Texture | null = null;

type OrbitMode = 'solid' | 'wireframe';

interface OrbitInitOptions {
  size?: number;
  allFiles?: Record<string, string>;
  fileName?: string;
  background?: string;
}

interface OrbitFrameOptions {
  turn?: number;
  pitchDeg?: number;
  mode?: OrbitMode;
}

interface OrbitSession {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  center: THREE.Vector3;
  dist: number;
  size: number;
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  volume: number;
  params: unknown[];
  solids: THREE.Object3D[];
  wires: THREE.Object3D[];
}

function getRenderer(size: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
      preserveDrawingBuffer: true,
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  renderer.setSize(size, size);
  return renderer;
}

/** Build a local, offline-safe environment map for physically based materials. */
function getStudioEnvironment(r: THREE.WebGLRenderer): THREE.Texture {
  if (studioEnvTexture) return studioEnvTexture;
  const pmrem = new THREE.PMREMGenerator(r);
  const room = new RoomEnvironment();
  studioEnvTexture = pmrem.fromScene(room).texture;
  room.dispose();
  pmrem.dispose();
  return studioEnvTexture;
}

/** Camera positions for each named angle, as a direction vector from center. */
const ANGLE_DIRS: Record<string, [number, number, number]> = {
  front: [0, -1, 0.2],
  back:  [0, 1, 0.2],
  side:  [1, 0, 0.2],
  top:   [0, -0.01, 1],
  iso:   [0.6, -0.6, 0.4],
};

function normalizeVector(dir: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2) || 1;
  return [dir[0] / len, dir[1] / len, dir[2] / len];
}

function renderFromDirection(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  center: THREE.Vector3,
  dist: number,
  dir: [number, number, number],
  r: THREE.WebGLRenderer,
): string {
  const d = normalizeVector(dir);
  camera.position.set(
    center.x + d[0] * dist,
    center.y + d[1] * dist,
    center.z + d[2] * dist,
  );
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  r.render(scene, camera);
  return canvas.toDataURL('image/png');
}

function addDefaultLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dir1.position.set(100, 150, 80);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-60, -40, -80);
  scene.add(dir2);

  scene.add(new THREE.HemisphereLight(0xb1e1ff, 0x444444, 0.4));
}

function parseColor(input: string | undefined, fallback: number): THREE.Color {
  if (!input) return new THREE.Color(fallback);
  try {
    return new THREE.Color(input);
  } catch {
    return new THREE.Color(fallback);
  }
}

function setSessionMode(session: OrbitSession, mode: OrbitMode): void {
  const showSolid = mode === 'solid';
  for (const node of session.solids) node.visible = showSolid;
  for (const node of session.wires) node.visible = true;
}

function setOrbitCamera(session: OrbitSession, turn: number, pitchDeg: number): void {
  const normalizedTurn = ((turn % 1) + 1) % 1;
  const clampedPitch = THREE.MathUtils.clamp(pitchDeg, -80, 80);
  const yaw = normalizedTurn * Math.PI * 2;
  const pitch = THREE.MathUtils.degToRad(clampedPitch);
  const cosPitch = Math.cos(pitch);

  // Start from "front" (-Y) and orbit around +Z.
  const dir: [number, number, number] = [
    Math.sin(yaw) * cosPitch,
    -Math.cos(yaw) * cosPitch,
    Math.sin(pitch),
  ];
  const d = normalizeVector(dir);

  session.camera.position.set(
    session.center.x + d[0] * session.dist,
    session.center.y + d[1] * session.dist,
    session.center.z + d[2] * session.dist,
  );
  session.camera.lookAt(session.center);
  session.camera.updateProjectionMatrix();
}

function renderOrbitFrame(session: OrbitSession, opts?: OrbitFrameOptions): string {
  const turn = opts?.turn ?? 0;
  const pitchDeg = opts?.pitchDeg ?? 18;
  const mode = opts?.mode ?? 'solid';

  setSessionMode(session, mode);
  setOrbitCamera(session, turn, pitchDeg);

  const r = getRenderer(session.size);
  r.render(session.scene, session.camera);
  return canvas.toDataURL('image/png');
}

function disposeSession(session: OrbitSession): void {
  session.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if ((mesh as THREE.Mesh).geometry) {
      (mesh as THREE.Mesh).geometry.dispose();
    }
    const mat = (mesh as THREE.Mesh).material;
    if (Array.isArray(mat)) {
      for (const material of mat) material.dispose();
    } else if (mat) {
      mat.dispose();
    }
  });
}

function destroyOrbitSession(): void {
  if (!orbitSession) return;
  disposeSession(orbitSession);
  orbitSession = null;
}

function createSession(code: string, opts?: OrbitInitOptions): { ok: true; session: OrbitSession } | { ok: false; error: string } {
  const size = opts?.size ?? 1024;
  const r = getRenderer(size);
  const result = runScript(code, opts?.fileName || 'main.forge.js', opts?.allFiles || {});

  if (result.error) {
    return { ok: false, error: String(result.error) };
  }

  const objs = result.objects
    .map((obj) => ({
      shape: obj.shape || (obj.sketch ? obj.sketch.extrude(1) : null),
      color: obj.color,
    }))
    .filter((o): o is { shape: NonNullable<typeof o.shape>; color?: string } => o.shape != null);

  if (objs.length === 0) {
    return { ok: false, error: 'No shape returned' };
  }

  const scene = new THREE.Scene();
  scene.background = parseColor(opts?.background, DEFAULT_BACKGROUND);
  scene.environment = getStudioEnvironment(r);
  addDefaultLights(scene);

  const solids: THREE.Object3D[] = [];
  const wires: THREE.Object3D[] = [];

  for (const obj of objs) {
    const geo = shapeToGeometry(obj.shape);

    const solidMaterialProps = {
      ...CAD_MATERIAL_PROPS,
      color: parseColor(obj.color, CAD_MATERIAL_PROPS.color),
    };
    const solid = new THREE.Mesh(geo.solid, new THREE.MeshPhysicalMaterial(solidMaterialProps));
    scene.add(solid);
    solids.push(solid);

    const wire = new THREE.LineSegments(
      geo.edges,
      new THREE.LineBasicMaterial({
        ...EDGE_MATERIAL_PROPS,
        color: parseColor(obj.color, EDGE_MATERIAL_PROPS.color),
        opacity: 0.9,
      }),
    );
    scene.add(wire);
    wires.push(wire);
  }

  const allShape = objs.slice(1).reduce((acc, cur) => acc.add(cur.shape), objs[0].shape);
  const shapeBB = allShape.boundingBox();
  const bbox = {
    min: [shapeBB.min[0], shapeBB.min[1], shapeBB.min[2]] as [number, number, number],
    max: [shapeBB.max[0], shapeBB.max[1], shapeBB.max[2]] as [number, number, number],
  };

  const bb = new THREE.Box3(
    new THREE.Vector3(...bbox.min),
    new THREE.Vector3(...bbox.max),
  );
  const center = new THREE.Vector3();
  bb.getCenter(center);
  const bsize = new THREE.Vector3();
  bb.getSize(bsize);
  const maxDim = Math.max(1, bsize.x, bsize.y, bsize.z);

  const fov = 45;
  const dist = maxDim / (2 * Math.tan((fov * Math.PI) / 360)) * 1.6;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, Math.max(10, dist * 10));
  camera.up.set(0, 0, 1);
  camera.aspect = 1;
  camera.updateProjectionMatrix();

  const session: OrbitSession = {
    scene,
    camera,
    center,
    dist,
    size,
    bbox,
    volume: allShape.volume(),
    params: result.params,
    solids,
    wires,
  };

  setSessionMode(session, 'solid');
  setOrbitCamera(session, 0, 18);

  return { ok: true, session };
}

async function setup() {
  await init();
  (window as any).__forgeReady = true;
}

(window as any).__forgeRender = function (
  code: string,
  opts?: {
    angles?: string[];
    size?: number;
    allFiles?: Record<string, string>;
    fileName?: string;
    background?: string;
  },
) {
  const angles = opts?.angles || ['front', 'side', 'top', 'iso'];
  const init = createSession(code, {
    size: opts?.size || 1024,
    allFiles: opts?.allFiles,
    fileName: opts?.fileName,
    background: opts?.background,
  });
  if (!init.ok) {
    return { ok: false, error: init.error };
  }
  const session = init.session;
  const r = getRenderer(session.size);

  // Render each angle, looking at bounding box center
  const renders: Record<string, string> = {};
  for (const angle of angles) {
    const d = ANGLE_DIRS[angle];
    if (!d) continue;
    setSessionMode(session, 'solid');
    renders[angle] = renderFromDirection(session.scene, session.camera, session.center, session.dist, d, r);
  }
  disposeSession(session);

  return {
    ok: true,
    renders,
    bbox: session.bbox,
    volume: session.volume,
    params: session.params,
  };
};

(window as any).__forgeOrbitInit = function (code: string, opts?: OrbitInitOptions) {
  destroyOrbitSession();
  const built = createSession(code, opts);
  if (!built.ok) {
    return built;
  }
  orbitSession = built.session;
  return {
    ok: true,
    bbox: orbitSession.bbox,
    volume: orbitSession.volume,
    params: orbitSession.params,
  };
};

(window as any).__forgeOrbitFrame = function (opts?: OrbitFrameOptions) {
  if (!orbitSession) {
    return { ok: false, error: 'No active orbit session. Call __forgeOrbitInit first.' };
  }
  try {
    const png = renderOrbitFrame(orbitSession, opts);
    return { ok: true, png };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
};

(window as any).__forgeOrbitDispose = function () {
  destroyOrbitSession();
  return { ok: true };
};

setup();

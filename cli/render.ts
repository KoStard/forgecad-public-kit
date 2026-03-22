/**
 * ForgeCAD — Headless Render Entry Point
 *
 * Loaded by render.html. Exposes __forgeRender() for still PNG renders and
 * __forgeCapture*() for animated captures driven from the CLI.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  init,
  runScript,
  shapeToGeometry,
  CAD_MATERIAL_PROPS,
  EDGE_MATERIAL_PROPS,
  findJointAnimationClip,
  resolveJointAnimation,
  resolveJointViewValues,
  type CutPlaneDef,
  type ForgeQualityPreset,
  type JointViewAnimationDef,
  type JointViewCouplingDef,
  type JointViewDef,
  type RunResult,
  type SceneObject,
  type SceneConfig,
  type SceneLightConfig,
} from '../src/forge/headless';
import { parseCameraCliSpec, type ViewportCameraState } from '../src/capture/cameraState';
import {
  mergeViewportRenderSceneStates,
  parseRenderSceneCliSpec,
  type ViewportRenderSceneState,
} from '../src/capture/renderSceneState';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const exportCanvas = document.createElement('canvas');
const exportCtx = exportCanvas.getContext('2d');
const DEFAULT_BACKGROUND = 0x252526;
const DEFAULT_PITCH_DEG = 18;
const DEFAULT_FIXED_DIR = new THREE.Vector3(0, -1, 0.32).normalize();

let renderer: THREE.WebGLRenderer;
let rendererPixelRatio = 1;
let captureSession: CaptureSession | null = null;
let studioEnvTexture: THREE.Texture | null = null;

type OrbitMode = 'solid' | 'wireframe';
type CameraMotion = 'orbit' | 'fixed';

interface OrbitInitOptions {
  size?: number;
  pixelRatio?: number;
  allFiles?: Record<string, string>;
  fileName?: string;
  background?: string;
  quality?: ForgeQualityPreset;
  enabledCutPlanes?: string[];
  camera?: ViewportCameraState | null;
  cameraSpec?: string | null;
  sceneState?: ViewportRenderSceneState | null;
  sceneSpec?: string | null;
  animationName?: string | null;
  capture?: 'orbit' | 'animation';
}

interface OrbitFrameOptions {
  turn?: number;
  pitchDeg?: number;
  mode?: OrbitMode;
  cameraMotion?: CameraMotion;
  animationProgress?: number;
}

interface RenderableObject {
  id: string;
  name: string;
  groupName?: string;
  root: THREE.Group;
  solid: THREE.Mesh;
  wire: THREE.LineSegments;
  solidMaterial: THREE.MeshPhysicalMaterial;
  wireMaterial: THREE.LineBasicMaterial;
  jointNodeName: string | null;
}

interface CaptureSession {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  size: number;
  pixelRatio: number;
  center: THREE.Vector3;
  distance: number;
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  volume: number;
  params: unknown[];
  renderables: RenderableObject[];
  joints: JointViewDef[];
  jointCouplings: JointViewCouplingDef[];
  animationClips: JointViewAnimationDef[];
  defaultAnimation: string | null;
  selectedAnimation: JointViewAnimationDef | null;
  availableCutPlaneNames: string[];
  baseJointValues: Record<string, number>;
  fixedCameraState: ViewportCameraState;
  orbitTarget: THREE.Vector3;
  orbitRadius: number;
  orbitBaseTurn: number;
  orbitBasePitchDeg: number;
}

function getRenderer(size: number, pixelRatio = 1): THREE.WebGLRenderer {
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
    renderer.localClippingEnabled = true;
  }
  if (rendererPixelRatio !== pixelRatio) {
    renderer.setPixelRatio(pixelRatio);
    rendererPixelRatio = pixelRatio;
  }
  renderer.setSize(size, size, false);
  return renderer;
}

function captureRenderedPng(size: number): string {
  if (!exportCtx) {
    throw new Error('Could not create export canvas context.');
  }
  exportCanvas.width = size;
  exportCanvas.height = size;
  exportCtx.clearRect(0, 0, size, size);
  exportCtx.drawImage(canvas, 0, 0, size, size);
  return exportCanvas.toDataURL('image/png');
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
  back: [0, 1, 0.2],
  side: [1, 0, 0.2],
  top: [0, -0.01, 1],
  iso: [0.6, -0.6, 0.4],
};

function normalizeVector(dir: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2) || 1;
  return [dir[0] / len, dir[1] / len, dir[2] / len];
}

function renderFromDirection(
  session: CaptureSession,
  dir: [number, number, number],
): string {
  const d = normalizeVector(dir);
  session.camera.position.set(
    session.center.x + d[0] * session.distance,
    session.center.y + d[1] * session.distance,
    session.center.z + d[2] * session.distance,
  );
  session.camera.up.set(0, 0, 1);
  session.camera.lookAt(session.center);
  session.camera.updateProjectionMatrix();
  const r = getRenderer(session.size, session.pixelRatio);
  r.render(session.scene, session.camera);
  return captureRenderedPng(session.size);
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

function createSceneLight(def: SceneLightConfig): THREE.Light {
  const color = def.color ? new THREE.Color(def.color) : new THREE.Color(0xffffff);
  const intensity = def.intensity ?? 1;
  switch (def.type) {
    case 'ambient': return new THREE.AmbientLight(color, intensity);
    case 'directional': {
      const l = new THREE.DirectionalLight(color, intensity);
      if (def.position) l.position.set(...def.position);
      if (def.target) l.target.position.set(...def.target);
      return l;
    }
    case 'point': {
      const l = new THREE.PointLight(color, intensity, def.distance ?? 0, def.decay ?? 2);
      if (def.position) l.position.set(...def.position);
      return l;
    }
    case 'spot': {
      const l = new THREE.SpotLight(color, intensity, def.distance ?? 0, def.angle ?? Math.PI / 6, def.penumbra ?? 0, def.decay ?? 2);
      if (def.position) l.position.set(...def.position);
      if (def.target) l.target.position.set(...def.target);
      return l;
    }
    case 'hemisphere': {
      const sky = def.skyColor ? new THREE.Color(def.skyColor) : color;
      const ground = def.groundColor ? new THREE.Color(def.groundColor) : new THREE.Color(0x444444);
      return new THREE.HemisphereLight(sky, ground, intensity);
    }
    default: return new THREE.AmbientLight(color, intensity);
  }
}

function applySceneConfig(scene: THREE.Scene, config: SceneConfig, r: THREE.WebGLRenderer): void {
  // Background
  if (config.background !== null) {
    if (typeof config.background === 'string') {
      scene.background = new THREE.Color(config.background);
    } else {
      // Gradient — render to a small texture
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, config.background.top);
      gradient.addColorStop(1, config.background.bottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 2, 256);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
    }
  }

  // Lights — replace defaults
  if (config.lights !== null) {
    config.lights.forEach((def) => {
      const light = createSceneLight(def);
      scene.add(light);
      if ('target' in light && light.target instanceof THREE.Object3D) {
        scene.add(light.target);
      }
    });
  } else {
    addDefaultLights(scene);
  }

  // Fog
  if (config.fog) {
    const fogColor = config.fog.color ? new THREE.Color(config.fog.color) : new THREE.Color(0x000000);
    if (config.fog.density !== undefined) {
      scene.fog = new THREE.FogExp2(fogColor, config.fog.density);
    } else {
      scene.fog = new THREE.Fog(fogColor, config.fog.near ?? 100, config.fog.far ?? 1000);
    }
  }

  // Tone mapping exposure
  if (config.postProcessing?.toneMappingExposure !== undefined) {
    r.toneMappingExposure = config.postProcessing.toneMappingExposure;
  }
}

function parseColor(input: string | undefined, fallback: number): THREE.Color {
  if (!input) return new THREE.Color(fallback);
  try {
    return new THREE.Color(input);
  } catch {
    return new THREE.Color(fallback);
  }
}

function buildRevoluteMatrix(
  axisWorld: THREE.Vector3,
  pivotWorld: THREE.Vector3,
  angleDeg: number,
): THREE.Matrix4 {
  const rotation = new THREE.Matrix4().makeRotationAxis(axisWorld, THREE.MathUtils.degToRad(angleDeg));
  const toPivot = new THREE.Matrix4().makeTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z);
  const fromPivot = new THREE.Matrix4().makeTranslation(-pivotWorld.x, -pivotWorld.y, -pivotWorld.z);
  return toPivot.multiply(rotation).multiply(fromPivot);
}

function computeJointNodeMatrices(
  joints: JointViewDef[],
  jointValues: Record<string, number>,
): Map<string, THREE.Matrix4> {
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

    const raw = jointValues[joint.name] ?? joint.defaultValue;
    const value = Number.isFinite(raw) ? raw : joint.defaultValue;
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
}

function toClippingPlane(cp: CutPlaneDef): THREE.Plane {
  const n = new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).normalize();
  return new THREE.Plane(n.negate(), cp.offset);
}

function isObjectExcludedFromCutPlane(obj: SceneObject, cutPlane: CutPlaneDef): boolean {
  const excludedNames = cutPlane.excludeObjectNames;
  if (!excludedNames || excludedNames.length === 0) return false;
  const objectName = obj.name.trim();
  if (!objectName) return false;
  return excludedNames.includes(objectName);
}

function setSessionMode(session: CaptureSession, mode: OrbitMode): void {
  const showSolid = mode === 'solid';
  session.renderables.forEach((renderable) => {
    renderable.solid.visible = showSolid;
    renderable.wire.visible = true;
  });
}

function applyCameraPose(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  state: ViewportCameraState,
): void {
  camera.position.set(state.position[0], state.position[1], state.position[2]);
  camera.up.set(state.up[0], state.up[1], state.up[2]);
  if (camera.isOrthographicCamera) {
    camera.zoom = state.orthoZoom ?? camera.zoom;
  }
  camera.lookAt(state.target[0], state.target[1], state.target[2]);
  camera.updateProjectionMatrix();
}

function applyOrbitPose(
  session: CaptureSession,
  turn: number,
  pitchDeg?: number,
): void {
  const normalizedTurn = ((turn % 1) + 1) % 1;
  const clampedPitch = THREE.MathUtils.clamp(
    pitchDeg ?? session.orbitBasePitchDeg,
    -80,
    80,
  );
  const yaw = (session.orbitBaseTurn + normalizedTurn) * Math.PI * 2;
  const pitch = THREE.MathUtils.degToRad(clampedPitch);
  const cosPitch = Math.cos(pitch);
  const dir: [number, number, number] = [
    Math.sin(yaw) * cosPitch,
    -Math.cos(yaw) * cosPitch,
    Math.sin(pitch),
  ];
  const d = normalizeVector(dir);

  session.camera.position.set(
    session.orbitTarget.x + d[0] * session.orbitRadius,
    session.orbitTarget.y + d[1] * session.orbitRadius,
    session.orbitTarget.z + d[2] * session.orbitRadius,
  );
  session.camera.up.set(
    session.fixedCameraState.up[0],
    session.fixedCameraState.up[1],
    session.fixedCameraState.up[2],
  );
  session.camera.lookAt(session.orbitTarget);
  session.camera.updateProjectionMatrix();
}

function resolveSelectedAnimation(
  animations: JointViewAnimationDef[],
  capture: 'orbit' | 'animation',
  defaultAnimation: string | null,
  requestedName?: string | null,
): JointViewAnimationDef | null {
  if (requestedName) {
    const selected = findJointAnimationClip(animations, requestedName);
    if (!selected) {
      const available = animations.map((animation) => animation.name).join(', ') || '(none)';
      throw new Error(`Animation "${requestedName}" was not found. Available animations: ${available}`);
    }
    return selected;
  }

  if (capture === 'animation') {
    const preferred = findJointAnimationClip(animations, defaultAnimation);
    return preferred ?? animations[0] ?? null;
  }

  return null;
}

function createDefaultCameraState(
  center: THREE.Vector3,
  distance: number,
): ViewportCameraState {
  return {
    projectionMode: 'perspective',
    position: [
      center.x + DEFAULT_FIXED_DIR.x * distance,
      center.y + DEFAULT_FIXED_DIR.y * distance,
      center.z + DEFAULT_FIXED_DIR.z * distance,
    ],
    target: [center.x, center.y, center.z],
    up: [0, 0, 1],
  };
}

function buildCameraRig(
  center: THREE.Vector3,
  distance: number,
  maxDim: number,
  spec?: ViewportCameraState | null,
): {
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  fixedCameraState: ViewportCameraState;
  orbitTarget: THREE.Vector3;
  orbitRadius: number;
  orbitBaseTurn: number;
  orbitBasePitchDeg: number;
} {
  const fixedCameraState = spec ?? createDefaultCameraState(center, distance);
  const nearFar = Math.max(1000, distance * 10);

  // Use a consistent base frustum size for orthographic cameras (matching the UI's approach)
  // The UI (@react-three/drei OrthographicCamera) uses pixel-based frustum: size.width/2, size.height/2
  // For a typical 960px canvas, that's ~480. We use 960 to match the default capture resolution.
  const ORTHO_BASE_SIZE = 960;
  const orthoSpan = ORTHO_BASE_SIZE;

  const camera = fixedCameraState.projectionMode === 'orthographic'
    ? new THREE.OrthographicCamera(-orthoSpan * 0.5, orthoSpan * 0.5, orthoSpan * 0.5, -orthoSpan * 0.5, -nearFar, nearFar)
    : new THREE.PerspectiveCamera(45, 1, 0.1, Math.max(10, distance * 10));
  camera.aspect = 1;
  applyCameraPose(camera, fixedCameraState);

  const orbitTarget = new THREE.Vector3(
    fixedCameraState.target[0],
    fixedCameraState.target[1],
    fixedCameraState.target[2],
  );
  const offset = new THREE.Vector3(
    fixedCameraState.position[0] - fixedCameraState.target[0],
    fixedCameraState.position[1] - fixedCameraState.target[1],
    fixedCameraState.position[2] - fixedCameraState.target[2],
  );
  const orbitRadius = offset.length() > 1e-3 ? offset.length() : distance;
  const orbitBasePitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(offset.z / orbitRadius, -1, 1)));
  const orbitBaseTurn = ((Math.atan2(offset.x, -offset.y) / (Math.PI * 2)) % 1 + 1) % 1;

  return {
    camera,
    fixedCameraState,
    orbitTarget,
    orbitRadius,
    orbitBaseTurn,
    orbitBasePitchDeg: Number.isFinite(orbitBasePitchDeg) ? orbitBasePitchDeg : DEFAULT_PITCH_DEG,
  };
}

function buildBaseJointValues(joints: JointViewDef[]): Record<string, number> {
  const out: Record<string, number> = {};
  joints.forEach((joint) => {
    out[joint.name] = joint.defaultValue;
  });
  return out;
}

function resolveRequestedSceneState(opts?: OrbitInitOptions): ViewportRenderSceneState | null {
  let sceneState = opts?.sceneState ?? null;

  if (opts?.sceneSpec) {
    sceneState = mergeViewportRenderSceneStates(sceneState, parseRenderSceneCliSpec(opts.sceneSpec));
  }
  if (opts?.camera) {
    sceneState = mergeViewportRenderSceneStates(sceneState, { camera: opts.camera });
  }
  if (opts?.cameraSpec) {
    sceneState = mergeViewportRenderSceneStates(sceneState, { camera: parseCameraCliSpec(opts.cameraSpec) });
  }

  return sceneState;
}

function resolveRenderableJointNodeName(
  obj: SceneObject,
  joints: JointViewDef[],
): string | null {
  const jointByChild = new Map<string, JointViewDef>();
  joints.forEach((joint) => {
    jointByChild.set(joint.child, joint);
  });

  if (jointByChild.has(obj.name)) return obj.name;
  if (obj.groupName && jointByChild.has(obj.groupName)) return obj.groupName;
  return null;
}

function applyObjectTransforms(
  session: CaptureSession,
  animationProgress?: number,
): void {
  const animatedValues = resolveJointAnimation(
    session.selectedAnimation,
    animationProgress ?? 0,
    session.baseJointValues,
  );
  const effectiveJointValues = resolveJointViewValues(
    session.joints,
    session.jointCouplings,
    animatedValues,
  );
  const jointMatrices = computeJointNodeMatrices(session.joints, effectiveJointValues);

  session.renderables.forEach((renderable) => {
    const matrix = renderable.jointNodeName
      ? (jointMatrices.get(renderable.jointNodeName)?.clone() ?? new THREE.Matrix4())
      : new THREE.Matrix4();
    renderable.root.matrix.copy(matrix);
    renderable.root.matrixWorldNeedsUpdate = true;
  });
}

function renderCaptureFrame(session: CaptureSession, opts?: OrbitFrameOptions): string {
  const mode = opts?.mode ?? 'solid';
  const cameraMotion = opts?.cameraMotion ?? 'orbit';

  setSessionMode(session, mode);
  applyObjectTransforms(session, opts?.animationProgress);

  if (cameraMotion === 'fixed') {
    applyCameraPose(session.camera, session.fixedCameraState);
  } else {
    applyOrbitPose(session, opts?.turn ?? 0, opts?.pitchDeg);
  }

  const r = getRenderer(session.size, session.pixelRatio);
  session.scene.updateMatrixWorld(true);
  r.render(session.scene, session.camera);
  return captureRenderedPng(session.size);
}

function disposeSession(session: CaptureSession): void {
  session.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function destroyCaptureSession(): void {
  if (!captureSession) return;
  disposeSession(captureSession);
  captureSession = null;
}

function createSession(
  code: string,
  opts?: OrbitInitOptions,
): { ok: true; session: CaptureSession } | { ok: false; error: string } {
  const size = opts?.size ?? 1024;
  const pixelRatio = opts?.pixelRatio ?? 1;
  const r = getRenderer(size, pixelRatio);
  let requestedSceneState: ViewportRenderSceneState | null = null;

  try {
    requestedSceneState = resolveRequestedSceneState(opts);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const result: RunResult = runScript(
    code,
    opts?.fileName || 'main.forge.js',
    opts?.allFiles || {},
    { quality: opts?.quality ?? 'high' },
  );

  if (result.error) {
    return { ok: false, error: String(result.error) };
  }

  const objs = result.objects
    .map((obj) => ({
      source: obj,
      shape: obj.shape || (obj.sketch ? obj.sketch.extrude(1) : null),
      color: requestedSceneState?.objects?.[obj.id]?.color ?? obj.color,
      opacity: THREE.MathUtils.clamp(requestedSceneState?.objects?.[obj.id]?.opacity ?? 1, 0, 1),
      visible: requestedSceneState?.objects?.[obj.id]?.visible !== false,
    }))
    .filter((entry): entry is {
      source: SceneObject;
      shape: NonNullable<typeof entry.shape>;
      color?: string;
      opacity: number;
      visible: boolean;
    } => entry.shape != null);

  if (objs.length === 0) {
    return { ok: false, error: 'No shape returned' };
  }

  const visibleObjs = objs.filter((entry) => entry.visible);
  const boundsObjs = visibleObjs.length > 0 ? visibleObjs : objs;

  const scene = new THREE.Scene();
  const sceneConfig: SceneConfig | null = result.sceneConfig ?? null;
  scene.background = parseColor(opts?.background, DEFAULT_BACKGROUND);
  scene.environment = getStudioEnvironment(r);

  if (sceneConfig) {
    applySceneConfig(scene, sceneConfig, r);
  } else {
    addDefaultLights(scene);
  }

  const allShape = boundsObjs.slice(1).reduce((acc, cur) => acc.add(cur.shape), boundsObjs[0].shape);
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
  const distance = maxDim / (2 * Math.tan((fov * Math.PI) / 360)) * 1.6;
  const joints = result.jointsView?.enabled === false ? [] : (result.jointsView?.joints ?? []);
  const jointCouplings = result.jointsView?.enabled === false ? [] : (result.jointsView?.couplings ?? []);
  const animationClips = result.jointsView?.enabled === false ? [] : (result.jointsView?.animations ?? []);
  const defaultAnimation = result.jointsView?.defaultAnimation ?? null;
  let selectedAnimation: JointViewAnimationDef | null;

  try {
    selectedAnimation = resolveSelectedAnimation(
      animationClips,
      opts?.capture ?? 'orbit',
      defaultAnimation,
      opts?.animationName,
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const enabledCutPlanes = new Set(opts?.enabledCutPlanes ?? []);
  const availableCutPlanes = result.cutPlanes.filter((cp) => (
    new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).lengthSq() > 1e-8
  ));

  if (enabledCutPlanes.size > 0) {
    const availableNames = new Set(availableCutPlanes.map((cp) => cp.name));
    const missing = Array.from(enabledCutPlanes).filter((name) => !availableNames.has(name));
    if (missing.length > 0) {
      return {
        ok: false,
        error: `Unknown cut plane(s): ${missing.join(', ')}. Available cut planes: ${Array.from(availableNames).join(', ') || '(none)'}`,
      };
    }
  }

  const activeCutPlanes = availableCutPlanes.filter((cp) => enabledCutPlanes.has(cp.name));
  const renderables: RenderableObject[] = [];

  for (const obj of visibleObjs) {
    const geo = shapeToGeometry(obj.shape);
    const solidMaterialProps = {
      ...CAD_MATERIAL_PROPS,
      color: parseColor(obj.color, CAD_MATERIAL_PROPS.color),
    };
    const applicableCutPlanes = activeCutPlanes
      .filter((cutPlane) => !isObjectExcludedFromCutPlane(obj.source, cutPlane))
      .map(toClippingPlane);
    const solidMaterial = new THREE.MeshPhysicalMaterial({
      ...solidMaterialProps,
      transparent: obj.opacity < 1,
      opacity: obj.opacity,
      clippingPlanes: applicableCutPlanes,
    });
    const solid = new THREE.Mesh(geo.solid, solidMaterial);
    const wireMaterial = new THREE.LineBasicMaterial({
      ...EDGE_MATERIAL_PROPS,
      color: parseColor(obj.color, EDGE_MATERIAL_PROPS.color),
      transparent: obj.opacity < 1,
      opacity: obj.opacity,
      clippingPlanes: applicableCutPlanes,
    });
    const wire = new THREE.LineSegments(geo.edges, wireMaterial);
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.add(solid);
    root.add(wire);
    scene.add(root);

    renderables.push({
      id: obj.source.id,
      name: obj.source.name,
      groupName: obj.source.groupName,
      root,
      solid,
      wire,
      solidMaterial,
      wireMaterial,
      jointNodeName: resolveRenderableJointNodeName(obj.source, joints),
    });
  }

  // Scene config camera — apply as default if no explicit camera was requested via CLI/state
  let sceneConfigCameraState: ViewportCameraState | null = null;
  if (sceneConfig?.camera && !requestedSceneState?.camera) {
    const cam = sceneConfig.camera;
    sceneConfigCameraState = {
      projectionMode: cam.type ?? 'perspective',
      position: cam.position ?? [
        center.x + DEFAULT_FIXED_DIR.x * distance,
        center.y + DEFAULT_FIXED_DIR.y * distance,
        center.z + DEFAULT_FIXED_DIR.z * distance,
      ],
      target: cam.target ?? [center.x, center.y, center.z],
      up: cam.up ?? [0, 0, 1],
    };
  }

  const cameraRig = buildCameraRig(center, distance, maxDim, requestedSceneState?.camera ?? sceneConfigCameraState);

  // Apply FOV from scene config
  if (sceneConfig?.camera?.fov && cameraRig.camera instanceof THREE.PerspectiveCamera) {
    cameraRig.camera.fov = sceneConfig.camera.fov;
    cameraRig.camera.updateProjectionMatrix();
  }

  const session: CaptureSession = {
    scene,
    camera: cameraRig.camera,
    size,
    pixelRatio,
    center,
    distance,
    bbox,
    volume: allShape.volume(),
    params: result.params,
    renderables,
    joints,
    jointCouplings,
    animationClips,
    defaultAnimation,
    selectedAnimation,
    availableCutPlaneNames: availableCutPlanes.map((cp) => cp.name),
    baseJointValues: buildBaseJointValues(joints),
    fixedCameraState: cameraRig.fixedCameraState,
    orbitTarget: cameraRig.orbitTarget,
    orbitRadius: cameraRig.orbitRadius,
    orbitBaseTurn: cameraRig.orbitBaseTurn,
    orbitBasePitchDeg: cameraRig.orbitBasePitchDeg,
  };

  setSessionMode(session, 'solid');
  applyObjectTransforms(session, 0);
  applyCameraPose(session.camera, session.fixedCameraState);

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
    pixelRatio?: number;
    quality?: ForgeQualityPreset;
    allFiles?: Record<string, string>;
    fileName?: string;
    background?: string;
    camera?: ViewportCameraState | null;
    cameraSpec?: string | null;
    sceneState?: ViewportRenderSceneState | null;
    sceneSpec?: string | null;
  },
) {
  const angles = opts?.angles || ['front', 'side', 'top', 'iso'];
  const built = createSession(code, {
    size: opts?.size || 1024,
    pixelRatio: opts?.pixelRatio || 1,
    quality: opts?.quality,
    allFiles: opts?.allFiles,
    fileName: opts?.fileName,
    background: opts?.background,
    camera: opts?.camera,
    cameraSpec: opts?.cameraSpec,
    sceneState: opts?.sceneState,
    sceneSpec: opts?.sceneSpec,
    capture: 'orbit',
  });
  if (!built.ok) {
    return { ok: false, error: built.error };
  }
  const session = built.session;
  const renders: Record<string, string> = {};

  for (const angle of angles) {
    const d = ANGLE_DIRS[angle];
    if (!d) continue;
    renders[angle] = renderFromDirection(session, d);
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

(window as any).__forgeCaptureInit = function (code: string, opts?: OrbitInitOptions) {
  destroyCaptureSession();
  const built = createSession(code, opts);
  if (!built.ok) {
    return built;
  }
  captureSession = built.session;
  return {
    ok: true,
    bbox: captureSession.bbox,
    volume: captureSession.volume,
    params: captureSession.params,
    cutPlanes: captureSession.availableCutPlaneNames,
    animations: captureSession.animationClips.map((animation) => ({
      name: animation.name,
      duration: animation.duration,
      loop: animation.loop,
    })),
    defaultAnimation: captureSession.defaultAnimation,
    selectedAnimation: captureSession.selectedAnimation?.name ?? null,
  };
};

(window as any).__forgeCaptureFrame = function (opts?: OrbitFrameOptions) {
  if (!captureSession) {
    return { ok: false, error: 'No active capture session. Call __forgeCaptureInit first.' };
  }
  try {
    const png = renderCaptureFrame(captureSession, opts);
    return { ok: true, png };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
};

(window as any).__forgeCaptureDispose = function () {
  destroyCaptureSession();
  return { ok: true };
};

// Backwards-compatible aliases for older GIF-only callers.
(window as any).__forgeOrbitInit = (code: string, opts?: OrbitInitOptions) => (
  (window as any).__forgeCaptureInit(code, opts)
);
(window as any).__forgeOrbitFrame = (opts?: OrbitFrameOptions) => (
  (window as any).__forgeCaptureFrame(opts)
);
(window as any).__forgeOrbitDispose = () => (
  (window as any).__forgeCaptureDispose()
);

setup();

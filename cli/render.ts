/**
 * ForgeCAD — Headless Render Entry Point
 *
 * Loaded by render.html. Exposes __forgeRender() which the CLI
 * calls via puppeteer to execute a script and capture renders
 * from multiple camera angles.
 */

import * as THREE from 'three';
import { initKernel } from '../src/forge/kernel';
import { runScript } from '../src/forge/runner';
import { shapeToGeometry } from '../src/forge/meshToGeometry';
import { buildScene } from '../src/forge/sceneBuilder';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

let renderer: THREE.WebGLRenderer;

function getRenderer(size: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }
  renderer.setSize(size, size);
  return renderer;
}

/** Camera positions for each named angle, as a direction vector from center. */
const ANGLE_DIRS: Record<string, [number, number, number]> = {
  front: [0, -1, 0.2],
  back:  [0, 1, 0.2],
  side:  [1, 0, 0.2],
  top:   [0, -0.01, 1],
  iso:   [0.6, -0.6, 0.4],
};

function renderFromAngle(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  center: THREE.Vector3,
  dist: number,
  dir: [number, number, number],
  r: THREE.WebGLRenderer,
): string {
  const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);
  camera.position.set(
    center.x + (dir[0] / len) * dist,
    center.y + (dir[1] / len) * dist,
    center.z + (dir[2] / len) * dist,
  );
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  r.render(scene, camera);
  return canvas.toDataURL('image/png');
}

async function init() {
  await initKernel();
  (window as any).__forgeReady = true;
}

(window as any).__forgeRender = function (
  code: string,
  opts?: { angles?: string[]; size?: number },
) {
  const angles = opts?.angles || ['front', 'side', 'top', 'iso'];
  const size = opts?.size || 1024;

  const result = runScript(code);

  if (result.error || !result.shape) {
    return { ok: false, error: result.error || 'No shape returned' };
  }

  const shape = result.shape;
  const geo = shapeToGeometry(shape);
  const { scene, camera } = buildScene(geo);

  // Compute framing
  geo.solid.computeBoundingBox();
  const bb = geo.solid.boundingBox!;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  const bsize = new THREE.Vector3();
  bb.getSize(bsize);
  const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
  const dist = maxDim / (2 * Math.tan((45 * Math.PI) / 360)) * 1.6;

  camera.aspect = 1;
  camera.updateProjectionMatrix();

  const r = getRenderer(size);

  // Render each angle
  const renders: Record<string, string> = {};
  for (const angle of angles) {
    const dir = ANGLE_DIRS[angle];
    if (!dir) continue;
    renders[angle] = renderFromAngle(scene, camera, center, dist, dir, r);
  }

  const shapeBB = shape.boundingBox();

  return {
    ok: true,
    renders,
    bbox: {
      min: [shapeBB.min[0], shapeBB.min[1], shapeBB.min[2]],
      max: [shapeBB.max[0], shapeBB.max[1], shapeBB.max[2]],
    },
    volume: shape.volume(),
    params: result.params,
  };
};

init();

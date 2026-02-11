/**
 * ForgeCAD — Headless Render Entry Point
 *
 * Loaded by render.html. Exposes __forgeRender() which the CLI
 * calls via puppeteer to execute a script and capture renders
 * from multiple camera angles.
 */

import * as THREE from 'three';
import { init, runScript, shapeToGeometry, CAD_MATERIAL_PROPS, EDGE_MATERIAL_PROPS } from '../src/forge/headless';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;

let renderer: THREE.WebGLRenderer;

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

async function setup() {
  await init();
  (window as any).__forgeReady = true;
}

(window as any).__forgeRender = function (
  code: string,
  opts?: { angles?: string[]; size?: number; allFiles?: Record<string, string>; fileName?: string },
) {
  const angles = opts?.angles || ['front', 'side', 'top', 'iso'];
  const size = opts?.size || 1024;

  const result = runScript(code, opts?.fileName || 'main.forge.js', opts?.allFiles || {});

  if (result.error) {
    return { ok: false, error: result.error };
  }

  // Collect all shapes (auto-extrude sketches)
  const objs = result.objects
    .map((obj) => ({
      shape: obj.shape || (obj.sketch ? obj.sketch.extrude(1) : null),
      color: obj.color,
    }))
    .filter((o): o is { shape: NonNullable<typeof o.shape>; color?: string } => o.shape != null);

  if (objs.length === 0) {
    return { ok: false, error: 'No shape returned' };
  }

  // Build scene with per-object colors
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x252526);

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));
  const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dir1.position.set(100, 150, 80);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-60, -40, -80);
  scene.add(dir2);
  scene.add(new THREE.HemisphereLight(0xb1e1ff, 0x444444, 0.4));

  // Add each object as a separate mesh with its own color
  for (const obj of objs) {
    const geo = shapeToGeometry(obj.shape);
    const matProps = { ...CAD_MATERIAL_PROPS };
    if (obj.color) (matProps as any).color = new THREE.Color(obj.color);
    scene.add(new THREE.Mesh(geo.solid, new THREE.MeshPhysicalMaterial(matProps)));
    scene.add(new THREE.LineSegments(geo.edges, new THREE.LineBasicMaterial(EDGE_MATERIAL_PROPS)));
  }

  // Union all for bounding box / volume stats
  const allShape = objs.map(o => o.shape).reduce((a, b) => a.add(b));
  const allGeo = shapeToGeometry(allShape);
  allGeo.solid.computeBoundingBox();
  const bb = allGeo.solid.boundingBox!;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  const bsize = new THREE.Vector3();
  bb.getSize(bsize);
  const maxDim = Math.max(bsize.x, bsize.y, bsize.z);
  const fov = 45;
  const dist = maxDim / (2 * Math.tan((fov * Math.PI) / 360)) * 1.6;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, dist * 10);
  camera.up.set(0, 0, 1);
  camera.aspect = 1;
  camera.updateProjectionMatrix();

  const r = getRenderer(size);

  // Render each angle, looking at bounding box center
  const renders: Record<string, string> = {};
  for (const angle of angles) {
    const d = ANGLE_DIRS[angle];
    if (!d) continue;
    renders[angle] = renderFromAngle(scene, camera, center, dist, d, r);
  }

  const shapeBB = allShape.boundingBox();

  return {
    ok: true,
    renders,
    bbox: {
      min: [shapeBB.min[0], shapeBB.min[1], shapeBB.min[2]],
      max: [shapeBB.max[0], shapeBB.max[1], shapeBB.max[2]],
    },
    volume: allShape.volume(),
    params: result.params,
  };
};

setup();

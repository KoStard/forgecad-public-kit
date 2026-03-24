/**
 * ForgeCAD — Scene Builder
 *
 * Creates a Three.js scene with CAD-appropriate lighting and material.
 * Shared between the browser Viewport and the CLI headless renderer.
 */

import * as THREE from 'three';
import type { ForgeGeometry } from '../meshToGeometry';
import type { SceneConfig, SceneLightConfig } from './scene';

export const CAD_MATERIAL_PROPS = {
  color: 0x5b9bd5,
  metalness: 0.05,
  roughness: 0.35,
  clearcoat: 0.1,
  clearcoatRoughness: 0.4,
  flatShading: true,
  side: THREE.DoubleSide,
} as const;

export const EDGE_MATERIAL_PROPS = {
  color: 0x1a1a2e,
  linewidth: 1,
  transparent: true,
  opacity: 0.6,
} as const;

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
    case 'ambient':
      return new THREE.AmbientLight(color, intensity);
    case 'directional': {
      const l = new THREE.DirectionalLight(color, intensity);
      if (def.position) l.position.set(...def.position);
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
      return l;
    }
    case 'hemisphere': {
      const sky = def.skyColor ? new THREE.Color(def.skyColor) : color;
      const ground = def.groundColor ? new THREE.Color(def.groundColor) : new THREE.Color(0x444444);
      return new THREE.HemisphereLight(sky, ground, intensity);
    }
    default:
      return new THREE.AmbientLight(color, intensity);
  }
}

/** Build a complete Three.js scene from ForgeGeometry, ready to render. */
export function buildScene(
  geo: ForgeGeometry,
  sceneConfig?: SceneConfig | null,
): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  const scene = new THREE.Scene();

  // Background
  if (sceneConfig?.background) {
    if (typeof sceneConfig.background === 'string') {
      scene.background = new THREE.Color(sceneConfig.background);
    } else {
      // Gradient background via canvas texture
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, sceneConfig.background.top);
      gradient.addColorStop(1, sceneConfig.background.bottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 2, 256);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
    }
  } else {
    scene.background = new THREE.Color(0x252526);
  }

  // Lighting
  if (sceneConfig?.lights) {
    sceneConfig.lights.forEach((def) => {
      const light = createSceneLight(def);
      scene.add(light);
    });
  } else {
    addDefaultLights(scene);
  }

  // Fog
  if (sceneConfig?.fog) {
    const fogColor = sceneConfig.fog.color ? new THREE.Color(sceneConfig.fog.color) : new THREE.Color(0x000000);
    if (sceneConfig.fog.density !== undefined) {
      scene.fog = new THREE.FogExp2(fogColor, sceneConfig.fog.density);
    } else {
      scene.fog = new THREE.Fog(fogColor, sceneConfig.fog.near ?? 100, sceneConfig.fog.far ?? 1000);
    }
  }

  // Mesh
  const material = new THREE.MeshPhysicalMaterial(CAD_MATERIAL_PROPS);
  const mesh = new THREE.Mesh(geo.solid, material);
  scene.add(mesh);

  // Edges
  const edgeMat = new THREE.LineBasicMaterial(EDGE_MATERIAL_PROPS);
  scene.add(new THREE.LineSegments(geo.edges, edgeMat));

  // Camera — auto-frame the object, then override with scene config
  geo.solid.computeBoundingBox();
  const bb = geo.solid.boundingBox!;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  const size = new THREE.Vector3();
  bb.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = sceneConfig?.camera?.fov ?? 45;
  const dist = (maxDim / (2 * Math.tan((fov * Math.PI) / 360))) * 1.6;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, dist * 10);
  camera.up.set(0, 0, 1);

  if (sceneConfig?.camera) {
    const cam = sceneConfig.camera;
    if (cam.up) camera.up.set(...cam.up);
    if (cam.position) {
      camera.position.set(...cam.position);
    } else {
      camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.6);
    }
    const target = cam.target ? new THREE.Vector3(...cam.target) : center;
    camera.lookAt(target);
  } else {
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.6);
    camera.lookAt(center);
  }

  return { scene, camera };
}

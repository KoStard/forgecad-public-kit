/**
 * ForgeCAD — Scene Builder
 *
 * Creates a Three.js scene with CAD-appropriate lighting and material.
 * Shared between the browser Viewport and the CLI headless renderer.
 */

import * as THREE from 'three';
import type { ForgeGeometry } from './meshToGeometry';

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

/** Build a complete Three.js scene from ForgeGeometry, ready to render. */
export function buildScene(geo: ForgeGeometry): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x252526);

  // Lighting — matches Viewport.tsx
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dir1.position.set(100, 150, 80);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-60, -40, -80);
  scene.add(dir2);

  scene.add(new THREE.HemisphereLight(0xb1e1ff, 0x444444, 0.4));

  // Mesh
  const material = new THREE.MeshPhysicalMaterial(CAD_MATERIAL_PROPS);
  const mesh = new THREE.Mesh(geo.solid, material);
  scene.add(mesh);

  // Edges
  const edgeMat = new THREE.LineBasicMaterial(EDGE_MATERIAL_PROPS);
  scene.add(new THREE.LineSegments(geo.edges, edgeMat));

  // Camera — auto-frame the object
  geo.solid.computeBoundingBox();
  const bb = geo.solid.boundingBox!;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  const size = new THREE.Vector3();
  bb.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = 45;
  const dist = maxDim / (2 * Math.tan((fov * Math.PI) / 360)) * 1.6;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, dist * 10);
  camera.up.set(0, 0, 1);
  // Isometric-ish view angle
  camera.position.set(
    center.x + dist * 0.6,
    center.y + dist * 0.4,
    center.z + dist * 0.6,
  );
  camera.lookAt(center);

  return { scene, camera };
}

/**
 * ForgeCAD — Mesh to Three.js Geometry
 *
 * Converts Manifold mesh data into Three.js BufferGeometry.
 * Shared between the browser Viewport and the CLI renderer.
 *
 * Fast path: if the shape is a FrozenShape with pre-computed arrays from the
 * eval worker, geometry assembly is zero-CPU — just wraps existing TypedArrays
 * in BufferAttribute. No triangle loop, no EdgesGeometry computation.
 *
 * Fallback: computes positions/normals inline and runs EdgesGeometry for live
 * shapes evaluated directly on the main thread (e.g. notebook cells).
 */

import * as THREE from 'three';
import { FrozenShape } from './frozenShape';
import type { Shape } from './kernel';

export interface ForgeGeometry {
  solid: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
}

export function shapeToGeometry(shape: Shape): ForgeGeometry {
  // Fast path: pre-computed arrays from the eval worker
  if (shape instanceof FrozenShape) {
    const { positions, normals, edgePositions } = shape.getPrecomputedGeometry();

    const solid = new THREE.BufferGeometry();
    solid.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    solid.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    const edges = new THREE.BufferGeometry();
    edges.setAttribute('position', new THREE.BufferAttribute(edgePositions, 3));

    return { solid, edges };
  }

  // Fallback: compute from mesh (live shapes, main-thread eval)
  return shapeToGeometryFallback(shape);
}

function shapeToGeometryFallback(shape: Shape): ForgeGeometry {
  const mesh = shape.getMesh();
  const numProp = mesh.numProp;
  const triCount = mesh.numTri;

  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);

  for (let t = 0; t < triCount; t++) {
    const i0 = mesh.triVerts[t * 3];
    const i1 = mesh.triVerts[t * 3 + 1];
    const i2 = mesh.triVerts[t * 3 + 2];

    const ax = mesh.vertProperties[i0 * numProp],
      ay = mesh.vertProperties[i0 * numProp + 1],
      az = mesh.vertProperties[i0 * numProp + 2];
    const bx = mesh.vertProperties[i1 * numProp],
      by = mesh.vertProperties[i1 * numProp + 1],
      bz = mesh.vertProperties[i1 * numProp + 2];
    const cx = mesh.vertProperties[i2 * numProp],
      cy = mesh.vertProperties[i2 * numProp + 1],
      cz = mesh.vertProperties[i2 * numProp + 2];

    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    const o = t * 9;
    positions[o] = ax;
    positions[o + 1] = ay;
    positions[o + 2] = az;
    positions[o + 3] = bx;
    positions[o + 4] = by;
    positions[o + 5] = bz;
    positions[o + 6] = cx;
    positions[o + 7] = cy;
    positions[o + 8] = cz;
    normals[o] = nx;
    normals[o + 1] = ny;
    normals[o + 2] = nz;
    normals[o + 3] = nx;
    normals[o + 4] = ny;
    normals[o + 5] = nz;
    normals[o + 6] = nx;
    normals[o + 7] = ny;
    normals[o + 8] = nz;
  }

  const solid = new THREE.BufferGeometry();
  solid.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  solid.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  const edges = new THREE.EdgesGeometry(solid, 1);

  return { solid, edges };
}

import { Export3MF } from 'manifold-3d/lib/export-3mf.js';
import {
  GLTFNode,
  GLTFNodesToGLTFDoc,
  cleanup as cleanupSceneBuilder,
  setMaterial,
} from 'manifold-3d/lib/scene-builder.js';
import type { Shape } from './kernel';

export interface MeshExportObject {
  name: string;
  shape: Shape;
  color?: string;
}

export interface ThreeMfExportOptions {
  title?: string;
  application?: string;
  description?: string;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseHexColor(hex: string): RGB | null {
  const value = hex.trim();
  if (!value.startsWith('#')) return null;
  if (value.length === 7) {
    const r = Number.parseInt(value.slice(1, 3), 16);
    const g = Number.parseInt(value.slice(3, 5), 16);
    const b = Number.parseInt(value.slice(5, 7), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  if (value.length === 4) {
    const r = Number.parseInt(value[1] + value[1], 16);
    const g = Number.parseInt(value[2] + value[2], 16);
    const b = Number.parseInt(value[3] + value[3], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

function toRGB555(colorHex: string): number {
  const rgb = parseHexColor(colorHex);
  if (!rgb) return 0;
  // VisCAM/SolidView color STL: bit15=1, then RGB555
  return 0x8000 | ((rgb.r >> 3) << 10) | ((rgb.g >> 3) << 5) | (rgb.b >> 3);
}

export function buildBinaryStl(objects: MeshExportObject[]): ArrayBuffer {
  const meshes = objects.map((obj) => ({
    mesh: obj.shape.getMesh(),
    color: obj.color ? toRGB555(obj.color) : 0,
  }));
  const totalTri = meshes.reduce((sum, entry) => sum + entry.mesh.numTri, 0);
  const buffer = new ArrayBuffer(84 + totalTri * 50);
  const view = new DataView(buffer);

  const header = 'ForgeCAD STL Export (legacy)';
  for (let i = 0; i < 80; i += 1) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }
  view.setUint32(80, totalTri, true);

  let offset = 84;
  for (const { mesh, color } of meshes) {
    const { numTri, numProp, triVerts, vertProperties } = mesh;
    for (let tri = 0; tri < numTri; tri += 1) {
      const i0 = triVerts[tri * 3];
      const i1 = triVerts[tri * 3 + 1];
      const i2 = triVerts[tri * 3 + 2];

      const v0x = vertProperties[i0 * numProp];
      const v0y = vertProperties[i0 * numProp + 1];
      const v0z = vertProperties[i0 * numProp + 2];
      const v1x = vertProperties[i1 * numProp];
      const v1y = vertProperties[i1 * numProp + 1];
      const v1z = vertProperties[i1 * numProp + 2];
      const v2x = vertProperties[i2 * numProp];
      const v2y = vertProperties[i2 * numProp + 1];
      const v2z = vertProperties[i2 * numProp + 2];

      const e1x = v1x - v0x;
      const e1y = v1y - v0y;
      const e1z = v1z - v0z;
      const e2x = v2x - v0x;
      const e2y = v2y - v0y;
      const e2z = v2z - v0z;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      view.setFloat32(offset, nx / len, true);
      offset += 4;
      view.setFloat32(offset, ny / len, true);
      offset += 4;
      view.setFloat32(offset, nz / len, true);
      offset += 4;
      view.setFloat32(offset, v0x, true);
      offset += 4;
      view.setFloat32(offset, v0y, true);
      offset += 4;
      view.setFloat32(offset, v0z, true);
      offset += 4;
      view.setFloat32(offset, v1x, true);
      offset += 4;
      view.setFloat32(offset, v1y, true);
      offset += 4;
      view.setFloat32(offset, v1z, true);
      offset += 4;
      view.setFloat32(offset, v2x, true);
      offset += 4;
      view.setFloat32(offset, v2y, true);
      offset += 4;
      view.setFloat32(offset, v2z, true);
      offset += 4;
      view.setUint16(offset, color, true);
      offset += 2;
    }
  }

  return buffer;
}

export async function build3mfBlob(
  objects: MeshExportObject[],
  options: ThreeMfExportOptions = {},
): Promise<Blob> {
  if (objects.length === 0) {
    throw new Error('No shapes available for 3MF export.');
  }

  cleanupSceneBuilder();
  try {
    const nodes = objects.map((obj, index) => {
      const node = new GLTFNode();
      node.name = obj.name || `Object ${index + 1}`;

      const rgb = obj.color ? parseHexColor(obj.color) : null;
      if (rgb) {
        node.manifold = setMaterial(obj.shape.manifold, {
          baseColorFactor: [rgb.r / 255, rgb.g / 255, rgb.b / 255],
        });
      } else {
        node.manifold = obj.shape.manifold;
      }

      return node;
    });

    const doc = GLTFNodesToGLTFDoc(nodes);
    const exporter = new Export3MF();
    exporter.title = options.title ?? exporter.title;
    exporter.application = options.application ?? 'ForgeCAD';
    exporter.description = options.description ?? exporter.description;
    return exporter.asBlob(doc);
  } finally {
    cleanupSceneBuilder();
  }
}

import { strToU8, zipSync } from 'fflate';
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

export interface MeshExportValidationIssue {
  severity: 'warning' | 'error';
  code:
    | 'mesh.no_triangles'
    | 'mesh.degenerate_triangle'
    | 'mesh.duplicate_triangle'
    | 'mesh.non_manifold_edge'
    | 'mesh.disconnected_components';
  message: string;
}

export interface MeshExportValidationReport {
  name: string;
  triangles: number;
  vertices: number;
  connectedComponents: number;
  nonManifoldEdges: number;
  degenerateTriangles: number;
  duplicateTriangles: number;
  issues: MeshExportValidationIssue[];
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function vertexKey(mesh: ReturnType<Shape['getMesh']>, index: number): string {
  const offset = index * mesh.numProp;
  return `${mesh.vertProperties[offset]},${mesh.vertProperties[offset + 1]},${mesh.vertProperties[offset + 2]}`;
}

function triangleAreaSquared(mesh: ReturnType<Shape['getMesh']>, i0: number, i1: number, i2: number): number {
  const a = i0 * mesh.numProp;
  const b = i1 * mesh.numProp;
  const c = i2 * mesh.numProp;
  const abx = mesh.vertProperties[b] - mesh.vertProperties[a];
  const aby = mesh.vertProperties[b + 1] - mesh.vertProperties[a + 1];
  const abz = mesh.vertProperties[b + 2] - mesh.vertProperties[a + 2];
  const acx = mesh.vertProperties[c] - mesh.vertProperties[a];
  const acy = mesh.vertProperties[c + 1] - mesh.vertProperties[a + 1];
  const acz = mesh.vertProperties[c + 2] - mesh.vertProperties[a + 2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return nx * nx + ny * ny + nz * nz;
}

function countConnectedComponents(vertexCount: number, adjacency: Map<number, Set<number>>): number {
  const seen = new Set<number>();
  let components = 0;

  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    if (seen.has(vertex)) continue;
    components += 1;
    const stack = [vertex];
    seen.add(vertex);
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
  }

  return components;
}

export function validateMeshExportObject(obj: MeshExportObject): MeshExportValidationReport {
  const mesh = obj.shape.getMesh();
  const vertexCount = Math.floor(mesh.vertProperties.length / mesh.numProp);
  const edgeUse = new Map<string, number>();
  const triangleUse = new Set<string>();
  const adjacency = new Map<number, Set<number>>();
  let degenerateTriangles = 0;
  let duplicateTriangles = 0;

  const addEdge = (a: number, b: number): void => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };

  for (let tri = 0; tri < mesh.numTri; tri += 1) {
    const i0 = mesh.triVerts[tri * 3];
    const i1 = mesh.triVerts[tri * 3 + 1];
    const i2 = mesh.triVerts[tri * 3 + 2];

    if (i0 === i1 || i1 === i2 || i2 === i0 || triangleAreaSquared(mesh, i0, i1, i2) <= 1e-18) {
      degenerateTriangles += 1;
    }

    const triangleKey = [vertexKey(mesh, i0), vertexKey(mesh, i1), vertexKey(mesh, i2)].sort().join('|');
    if (triangleUse.has(triangleKey)) duplicateTriangles += 1;
    triangleUse.add(triangleKey);

    addEdge(i0, i1);
    addEdge(i1, i2);
    addEdge(i2, i0);
  }

  const nonManifoldEdges = [...edgeUse.values()].filter((count) => count !== 2).length;
  const connectedComponents = countConnectedComponents(vertexCount, adjacency);
  const issues: MeshExportValidationIssue[] = [];

  if (mesh.numTri === 0) {
    issues.push({ severity: 'error', code: 'mesh.no_triangles', message: 'mesh has no triangles' });
  }
  if (degenerateTriangles > 0) {
    issues.push({
      severity: 'error',
      code: 'mesh.degenerate_triangle',
      message: `${degenerateTriangles.toLocaleString()} degenerate triangle(s)`,
    });
  }
  if (duplicateTriangles > 0) {
    issues.push({
      severity: 'warning',
      code: 'mesh.duplicate_triangle',
      message: `${duplicateTriangles.toLocaleString()} duplicate triangle(s)`,
    });
  }
  if (nonManifoldEdges > 0) {
    issues.push({
      severity: 'error',
      code: 'mesh.non_manifold_edge',
      message: `${nonManifoldEdges.toLocaleString()} non-manifold edge(s)`,
    });
  }
  if (connectedComponents > 1) {
    issues.push({
      severity: 'error',
      code: 'mesh.disconnected_components',
      message: `${connectedComponents.toLocaleString()} disconnected component(s)`,
    });
  }

  return {
    name: obj.name,
    triangles: mesh.numTri,
    vertices: vertexCount,
    connectedComponents,
    nonManifoldEdges,
    degenerateTriangles,
    duplicateTriangles,
    issues,
  };
}

export function validateMeshExportObjects(objects: MeshExportObject[]): MeshExportValidationReport[] {
  return objects.map(validateMeshExportObject);
}

/**
 * Build a 3MF archive directly from mesh data, with no Manifold dependency.
 * Each object becomes a separate <object> in the model, with optional per-object color.
 */
function buildPure3mfBuffer(
  objects: MeshExportObject[],
  options: ThreeMfExportOptions = {},
): Uint8Array {
  const title = escapeXml(options.title ?? 'ForgeCAD model');
  const application = escapeXml(options.application ?? 'ForgeCAD');
  const description = escapeXml(options.description ?? title);

  // Collect per-object colors and assign colorgroup entries
  const colors: { hex: string; objectIndices: number[] }[] = [];
  const colorMap = new Map<string, number>(); // hex -> index in colors array
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    if (obj.color) {
      const rgb = parseHexColor(obj.color);
      if (rgb) {
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        if (!colorMap.has(hex)) {
          colorMap.set(hex, colors.length);
          colors.push({ hex, objectIndices: [] });
        }
        colors[colorMap.get(hex)!].objectIndices.push(i);
      }
    }
  }

  // ID allocation: colorgroup gets id=1 (if colors exist), objects start at 2 (or 1 if no colors)
  const hasColors = colors.length > 0;
  const colorgroupId = hasColors ? 1 : 0;
  const objectIdBase = hasColors ? 2 : 1;

  // Build model XML
  const xmlParts: string[] = [];
  xmlParts.push('<?xml version="1.0" encoding="UTF-8"?>');
  xmlParts.push(
    '<model unit="millimeter" xml:lang="en-US"' +
    ' xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"' +
    (hasColors ? ' xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"' : '') +
    '>',
  );

  // Metadata
  xmlParts.push('  <metadata name="Title">' + title + '</metadata>');
  xmlParts.push('  <metadata name="Application">' + application + '</metadata>');
  xmlParts.push('  <metadata name="Description">' + description + '</metadata>');

  xmlParts.push('  <resources>');

  // Colorgroup resource
  if (hasColors) {
    xmlParts.push(`    <m:colorgroup id="${colorgroupId}">`);
    for (const c of colors) {
      xmlParts.push(`      <m:color color="${c.hex}" />`);
    }
    xmlParts.push('    </m:colorgroup>');
  }

  // Object resources
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const mesh = obj.shape.getMesh();
    const objectId = objectIdBase + i;
    const name = escapeXml(obj.name || `Object ${i + 1}`);

    // Determine color attributes for this object
    let pidAttr = '';
    if (obj.color && hasColors) {
      const rgb = parseHexColor(obj.color);
      if (rgb) {
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const colorIdx = colorMap.get(hex);
        if (colorIdx !== undefined) {
          pidAttr = ` pid="${colorgroupId}" pindex="${colorIdx}"`;
        }
      }
    }

    xmlParts.push(`    <object id="${objectId}" type="model" name="${name}"${pidAttr}>`);
    xmlParts.push('      <mesh>');

    // Vertices
    xmlParts.push('        <vertices>');
    const { numProp, triVerts, vertProperties, numTri } = mesh;
    // Collect unique vertex indices referenced by triangles
    const numVerts = vertProperties.length / numProp;
    for (let v = 0; v < numVerts; v++) {
      const x = vertProperties[v * numProp];
      const y = vertProperties[v * numProp + 1];
      const z = vertProperties[v * numProp + 2];
      xmlParts.push(`          <vertex x="${x}" y="${y}" z="${z}" />`);
    }
    xmlParts.push('        </vertices>');

    // Triangles
    xmlParts.push('        <triangles>');
    for (let t = 0; t < numTri; t++) {
      const v1 = triVerts[t * 3];
      const v2 = triVerts[t * 3 + 1];
      const v3 = triVerts[t * 3 + 2];
      xmlParts.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
    }
    xmlParts.push('        </triangles>');

    xmlParts.push('      </mesh>');
    xmlParts.push('    </object>');
  }

  xmlParts.push('  </resources>');

  // Build section
  xmlParts.push('  <build>');
  for (let i = 0; i < objects.length; i++) {
    xmlParts.push(`    <item objectid="${objectIdBase + i}" />`);
  }
  xmlParts.push('  </build>');
  xmlParts.push('</model>');

  const modelXml = xmlParts.join('\n');

  // Content types
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />\n' +
    '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />\n' +
    '</Types>';

  // Relationships
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />\n' +
    '</Relationships>';

  // Create ZIP archive
  const archive = zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    '3D/3dmodel.model': strToU8(modelXml),
  });

  return Uint8Array.from(archive);
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

/**
 * Build a 3MF archive as a Uint8Array (works in Node and browser).
 * Pure implementation — no Manifold dependency.
 */
export async function build3mfBuffer(
  objects: MeshExportObject[],
  options: ThreeMfExportOptions = {},
): Promise<Uint8Array> {
  if (objects.length === 0) {
    throw new Error('No shapes available for 3MF export.');
  }
  return buildPure3mfBuffer(objects, options);
}

export async function build3mfBlob(
  objects: MeshExportObject[],
  options: ThreeMfExportOptions = {},
): Promise<Blob> {
  const buffer = await build3mfBuffer(objects, options);
  return new Blob([buffer.buffer as ArrayBuffer], {
    type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
  });
}

/**
 * Build a Wavefront OBJ string from mesh export objects.
 * Each object becomes a named group (`g`). Includes vertex normals.
 */
export function buildObjString(objects: MeshExportObject[]): string {
  const lines: string[] = [];
  lines.push('# ForgeCAD OBJ Export');

  let vertexOffset = 0;
  let normalOffset = 0;

  for (const obj of objects) {
    const objectName = obj.name || 'Object';
    lines.push(`g ${objectName}`);

    const mesh = obj.shape.getMesh();
    const { numProp, triVerts, vertProperties, numTri } = mesh;
    const numVerts = vertProperties.length / numProp;

    // Emit vertices
    for (let v = 0; v < numVerts; v++) {
      const x = vertProperties[v * numProp];
      const y = vertProperties[v * numProp + 1];
      const z = vertProperties[v * numProp + 2];
      lines.push(`v ${x} ${y} ${z}`);
    }

    // Emit per-face normals and faces
    for (let tri = 0; tri < numTri; tri++) {
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

      lines.push(`vn ${nx / len} ${ny / len} ${nz / len}`);

      // OBJ uses 1-based indices
      const vBase = vertexOffset + 1;
      const nIdx = normalOffset + tri + 1;
      lines.push(`f ${i0 + vBase}//${nIdx} ${i1 + vBase}//${nIdx} ${i2 + vBase}//${nIdx}`);
    }

    vertexOffset += numVerts;
    normalOffset += numTri;
  }

  return lines.join('\n') + '\n';
}

export function buildObjBlob(objects: MeshExportObject[]): Blob {
  const obj = buildObjString(objects);
  return new Blob([obj], { type: 'model/obj' });
}

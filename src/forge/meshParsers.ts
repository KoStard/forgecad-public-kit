/**
 * Mesh file parsers for ForgeCAD mesh import.
 *
 * Pure math — no WASM, no backend dependencies.
 * Each parser produces a `ParsedMesh` that the backend lowering phase
 * can feed into its native geometry constructor.
 */

import { unzipSync } from 'fflate';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ParsedMesh {
  /** Vertex positions: [x0,y0,z0, x1,y1,z1, ...] */
  vertProperties: Float32Array;
  /** Triangle vertex indices: [a0,b0,c0, a1,b1,c1, ...] */
  triVerts: Uint32Array;
  /** Number of properties per vertex (always 3 for xyz). */
  numProp: number;
  /** Vertex welding tables (source → target). */
  mergeFromVert: Uint32Array;
  mergeToVert: Uint32Array;
}

export type MeshFormat = 'stl' | 'obj' | '3mf';

// ─── Format detection ────────────────────────────────────────────────────────

export function detectMeshFormat(filePath: string): MeshFormat | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'stl') return 'stl';
  if (ext === 'obj') return 'obj';
  if (ext === '3mf') return '3mf';
  return null;
}

// ─── STL Parser ──────────────────────────────────────────────────────────────

/**
 * Binary STL format:
 *   80 bytes: header (ignored)
 *    4 bytes: uint32 triangle count
 *   per triangle (50 bytes):
 *     12 bytes: normal (3 × float32) — ignored, we recompute
 *     36 bytes: 3 vertices (each 3 × float32)
 *      2 bytes: attribute byte count (ignored)
 */
function isStlBinary(data: ArrayBuffer): boolean {
  if (data.byteLength < 84) return false;
  const view = new DataView(data);
  const numTriangles = view.getUint32(80, true);
  const expectedSize = 84 + numTriangles * 50;
  // Allow small tolerance for trailing bytes
  if (Math.abs(data.byteLength - expectedSize) <= 10) return true;
  // Also check: if it starts with "solid " and contains "facet", it's likely ASCII
  const header = new Uint8Array(data, 0, Math.min(80, data.byteLength));
  const headerStr = String.fromCharCode(...header);
  if (headerStr.trimStart().startsWith('solid') && data.byteLength > 300) {
    // Peek ahead — if the bytes after the header look like ASCII, treat as ASCII
    const sample = new Uint8Array(data, 80, Math.min(200, data.byteLength - 80));
    const sampleStr = String.fromCharCode(...sample);
    if (sampleStr.includes('facet') || sampleStr.includes('vertex')) return false;
  }
  // If the triangle count doesn't match the file size AND it doesn't look like
  // ASCII STL, the data is likely not an STL file at all — don't default to binary.
  return false;
}

function parseStlBinary(data: ArrayBuffer): { positions: Float32Array; numTriangles: number } {
  const view = new DataView(data);
  const numTriangles = view.getUint32(80, true);
  const expectedSize = 84 + numTriangles * 50;
  if (Math.abs(data.byteLength - expectedSize) > 10) {
    throw new Error(
      `Binary STL corrupt: header says ${numTriangles} triangles (expecting ${expectedSize} bytes) but file is ${data.byteLength} bytes. ` +
      `The file data may not be a valid STL — check that the mesh file was loaded correctly.`,
    );
  }
  const positions = new Float32Array(numTriangles * 9); // 3 verts × 3 coords

  let offset = 84;
  for (let i = 0; i < numTriangles; i++) {
    // Skip normal (12 bytes)
    offset += 12;
    // Read 3 vertices (36 bytes)
    for (let v = 0; v < 9; v++) {
      positions[i * 9 + v] = view.getFloat32(offset, true);
      offset += 4;
    }
    // Skip attribute byte count (2 bytes)
    offset += 2;
  }

  return { positions, numTriangles };
}

function parseStlAscii(text: string): { positions: Float32Array; numTriangles: number } {
  const vertexPattern = /vertex\s+([\-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][\-+]?\d+)?)\s+([\-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][\-+]?\d+)?)\s+([\-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][\-+]?\d+)?)/gi;
  const coords: number[] = [];
  let match;
  while ((match = vertexPattern.exec(text)) !== null) {
    coords.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
  }
  const numTriangles = (coords.length / 9) | 0;
  return { positions: new Float32Array(coords.slice(0, numTriangles * 9)), numTriangles };
}

/**
 * Parse an STL file (binary or ASCII) into a welded indexed mesh.
 */
export function parseStl(data: ArrayBuffer): ParsedMesh {
  let positions: Float32Array;
  let numTriangles: number;

  if (isStlBinary(data)) {
    ({ positions, numTriangles } = parseStlBinary(data));
  } else {
    const text = new TextDecoder().decode(data);
    ({ positions, numTriangles } = parseStlAscii(text));
  }

  if (numTriangles === 0) {
    return {
      vertProperties: new Float32Array(0),
      triVerts: new Uint32Array(0),
      numProp: 3,
      mergeFromVert: new Uint32Array(0),
      mergeToVert: new Uint32Array(0),
    };
  }

  return weldVertices(positions, numTriangles);
}

// ─── Vertex Welding ──────────────────────────────────────────────────────────

/**
 * Spatial-hash vertex welding.
 * Deduplicates vertices that are within `epsilon` of each other,
 * producing an indexed mesh.
 *
 * Since we fully deduplicate, mergeFromVert/mergeToVert are empty —
 * all shared-vertex information is already encoded in the triVerts indices.
 */
function weldVertices(
  positions: Float32Array,
  numTriangles: number,
  epsilon = 1e-5,
): ParsedMesh {
  const totalVerts = numTriangles * 3;

  // Spatial hash for deduplication
  const invEps = 1 / epsilon;
  const vertMap = new Map<string, number>();
  const uniquePositions: number[] = [];
  const triVerts = new Uint32Array(totalVerts);
  let uniqueCount = 0;

  for (let i = 0; i < totalVerts; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    // Quantize to grid cell
    const gx = Math.round(x * invEps);
    const gy = Math.round(y * invEps);
    const gz = Math.round(z * invEps);
    const key = `${gx},${gy},${gz}`;

    const existing = vertMap.get(key);
    if (existing !== undefined) {
      triVerts[i] = existing;
    } else {
      vertMap.set(key, uniqueCount);
      triVerts[i] = uniqueCount;
      uniquePositions.push(x, y, z);
      uniqueCount++;
    }
  }

  return {
    vertProperties: new Float32Array(uniquePositions),
    triVerts,
    numProp: 3,
    mergeFromVert: new Uint32Array(0),
    mergeToVert: new Uint32Array(0),
  };
}

// ─── OBJ Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Wavefront OBJ file into an indexed triangle mesh.
 *
 * Supported:
 *   v x y z          — vertex positions
 *   f v1 v2 v3 ...   — faces (triangles, quads, n-gons; fan-triangulated)
 *   f v1/vt1/vn1 ... — faces with texture/normal indices (only vertex index used)
 *   f v1//vn1 ...    — faces with normal indices (only vertex index used)
 *   Negative indices  — relative to current vertex count (-1 = last vertex)
 *
 * Ignored: vn, vt, #, o, g, s, mtllib, usemtl, and any other lines.
 */
export function parseObj(data: ArrayBuffer): ParsedMesh {
  const text = new TextDecoder().decode(data);
  const lines = text.split('\n');

  const positions: number[] = [];
  const triIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.charCodeAt(0) === 35 /* # */) continue;

    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      const x = parseFloat(parts[1]);
      const y = parseFloat(parts[2]);
      const z = parseFloat(parts[3]);
      positions.push(x, y, z);
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/);
      const vertCount = positions.length / 3;
      const faceVerts: number[] = [];

      for (let j = 1; j < parts.length; j++) {
        const token = parts[j];
        if (token.length === 0) continue;
        // Extract vertex index from v, v/vt, v/vt/vn, or v//vn
        const slashIdx = token.indexOf('/');
        const idxStr = slashIdx === -1 ? token : token.substring(0, slashIdx);
        let idx = parseInt(idxStr, 10);
        if (isNaN(idx)) continue;
        // OBJ indices are 1-based; negative means relative to end
        if (idx < 0) {
          idx = vertCount + idx; // -1 → vertCount - 1
        } else {
          idx = idx - 1; // 1-based → 0-based
        }
        faceVerts.push(idx);
      }

      // Fan-triangulate from first vertex
      for (let j = 1; j < faceVerts.length - 1; j++) {
        triIndices.push(faceVerts[0], faceVerts[j], faceVerts[j + 1]);
      }
    }
    // All other line types (vn, vt, o, g, s, mtllib, usemtl, etc.) are ignored.
  }

  return {
    vertProperties: new Float32Array(positions),
    triVerts: new Uint32Array(triIndices),
    numProp: 3,
    mergeFromVert: new Uint32Array(0),
    mergeToVert: new Uint32Array(0),
  };
}

// ─── 3MF Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a 3MF file (ZIP archive containing XML model data) into an indexed
 * triangle mesh.
 *
 * 3MF is a ZIP archive. The main model lives at `3D/3dmodel.model`.
 * Each `<object>` element may contain a `<mesh>` with `<vertices>` and
 * `<triangles>`. Multiple objects are merged into a single mesh with
 * triangle indices offset accordingly.
 */
export function parse3mf(data: ArrayBuffer): ParsedMesh {
  // Decompress the ZIP archive
  const zip = unzipSync(new Uint8Array(data));

  // Find the main model file — try common path variants
  let modelBytes: Uint8Array | undefined;
  for (const path of Object.keys(zip)) {
    if (path.toLowerCase() === '3d/3dmodel.model') {
      modelBytes = zip[path];
      break;
    }
  }
  if (!modelBytes) {
    throw new Error('3MF archive does not contain 3D/3dmodel.model');
  }

  const xml = new TextDecoder().decode(modelBytes);

  // Extract all <mesh>...</mesh> blocks (one per object)
  const meshPattern = /<mesh\b[^>]*>([\s\S]*?)<\/mesh>/gi;
  const vertexPattern = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*\/>/gi;
  const trianglePattern = /<triangle\s+v1="([^"]+)"\s+v2="([^"]+)"\s+v3="([^"]+)"[^/]*\/>/gi;

  const allPositions: number[] = [];
  const allTriIndices: number[] = [];
  let vertexOffset = 0;

  let meshMatch;
  while ((meshMatch = meshPattern.exec(xml)) !== null) {
    const meshXml = meshMatch[1];

    // Parse vertices for this mesh
    const meshVerts: number[] = [];
    vertexPattern.lastIndex = 0;
    let vMatch;
    while ((vMatch = vertexPattern.exec(meshXml)) !== null) {
      const x = parseFloat(vMatch[1]);
      const y = parseFloat(vMatch[2]);
      const z = parseFloat(vMatch[3]);
      meshVerts.push(x, y, z);
    }

    // Parse triangles for this mesh, offsetting indices
    trianglePattern.lastIndex = 0;
    let tMatch;
    while ((tMatch = trianglePattern.exec(meshXml)) !== null) {
      const v1 = parseInt(tMatch[1], 10) + vertexOffset;
      const v2 = parseInt(tMatch[2], 10) + vertexOffset;
      const v3 = parseInt(tMatch[3], 10) + vertexOffset;
      allTriIndices.push(v1, v2, v3);
    }

    // Append vertices and advance offset
    for (let i = 0; i < meshVerts.length; i++) {
      allPositions.push(meshVerts[i]);
    }
    vertexOffset += meshVerts.length / 3;
  }

  return {
    vertProperties: new Float32Array(allPositions),
    triVerts: new Uint32Array(allTriIndices),
    numProp: 3,
    mergeFromVert: new Uint32Array(0),
    mergeToVert: new Uint32Array(0),
  };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Parse a mesh file in the given format.
 */
export function parseMeshFile(data: ArrayBuffer, format: MeshFormat): ParsedMesh {
  switch (format) {
    case 'stl':
      return parseStl(data);
    case 'obj':
      return parseObj(data);
    case '3mf':
      return parse3mf(data);
  }
}

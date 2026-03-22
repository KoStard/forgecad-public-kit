/**
 * Mesh file parsers for ForgeCAD mesh import.
 *
 * Pure math — no WASM, no backend dependencies.
 * Each parser produces a `ParsedMesh` that the backend lowering phase
 * can feed into its native geometry constructor.
 */

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
  return true;
}

function parseStlBinary(data: ArrayBuffer): { positions: Float32Array; numTriangles: number } {
  const view = new DataView(data);
  const numTriangles = view.getUint32(80, true);
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

// ─── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Parse a mesh file in the given format.
 */
export function parseMeshFile(data: ArrayBuffer, format: MeshFormat): ParsedMesh {
  switch (format) {
    case 'stl':
      return parseStl(data);
    case 'obj':
      throw new Error('OBJ import is not yet implemented. Use STL format for now.');
    case '3mf':
      throw new Error('3MF import is not yet implemented. Use STL format for now.');
  }
}

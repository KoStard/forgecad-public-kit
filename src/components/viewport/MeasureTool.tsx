import { formatLength } from '@forge/units';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  type MeasureEdgeEntity,
  type MeasureEntity,
  type MeasureFaceEntity,
  type MeasureVertexEntity,
  useForgeStore,
} from '../../store/forgeStore';

// ─── Types ───

type PointerLike = { clientX: number; clientY: number };

// ─── Constants ───

export const MEASURE_COLORS = {
  face: '#4a9eff',
  edge: '#ffcc00',
  vertex: '#ff8a00',
  highlight: '#4a9eff',
  highlightSecondary: '#ff8a00',
  line: '#ffcc00',
  panel: '#111111ee',
  panelBorder: '#333',
  panelText: '#e8e8e8',
  panelLabel: '#888',
  panelValue: '#ffcc00',
};

// ─── Face flood-fill: find all connected coplanar triangles ───

const QUANT = 10000; // quantize to 0.0001mm
const q = (v: number) => Math.round(v * QUANT);
const vertKey = (pos: THREE.BufferAttribute, i: number) => `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface FloodFillResult {
  triangleIndices: number[];
  normal: THREE.Vector3;
  center: THREE.Vector3;
  area: number;
}

export interface MeasureResultData {
  type: string;
  distance?: number;
  angle?: number;
  deltaX?: number;
  deltaY?: number;
  deltaZ?: number;
  projectedDistance?: number;
}

type HoverPreview = {
  kind: 'face' | 'edge' | 'vertex';
  faceHighlightGeo?: THREE.BufferGeometry;
  meshUuid?: string;
  meshMatrix?: THREE.Matrix4;
  edgeSegments?: [THREE.Vector3, THREE.Vector3][];
  vertexPosition?: THREE.Vector3;
};

// ─── Utility functions ───

function floodFillFace(geometry: THREE.BufferGeometry, startTriIndex: number, normalTolerance = 0.9995): FloodFillResult {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const triCount = positions.count / 3;

  // Starting triangle normal
  const si = startTriIndex * 3;
  const startNormal = new THREE.Vector3(normals.getX(si), normals.getY(si), normals.getZ(si));

  // Build edge → triangle adjacency
  const edgeToTris = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const base = t * 3;
    const v0 = vertKey(positions, base);
    const v1 = vertKey(positions, base + 1);
    const v2 = vertKey(positions, base + 2);
    for (const ek of [edgeKey(v0, v1), edgeKey(v1, v2), edgeKey(v2, v0)]) {
      let list = edgeToTris.get(ek);
      if (!list) {
        list = [];
        edgeToTris.set(ek, list);
      }
      list.push(t);
    }
  }

  // Flood fill
  const visited = new Set<number>();
  const queue = [startTriIndex];
  visited.add(startTriIndex);

  while (queue.length > 0) {
    const t = queue.pop()!;
    const base = t * 3;
    const v0 = vertKey(positions, base);
    const v1 = vertKey(positions, base + 1);
    const v2 = vertKey(positions, base + 2);

    for (const ek of [edgeKey(v0, v1), edgeKey(v1, v2), edgeKey(v2, v0)]) {
      const neighbors = edgeToTris.get(ek);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (visited.has(n)) continue;
        const ni = n * 3;
        const nNormal = new THREE.Vector3(normals.getX(ni), normals.getY(ni), normals.getZ(ni));
        if (startNormal.dot(nNormal) >= normalTolerance) {
          visited.add(n);
          queue.push(n);
        }
      }
    }
  }

  // Compute center (area-weighted centroid) and total area
  const indices = Array.from(visited);
  let totalArea = 0;
  const centroid = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();

  for (const t of indices) {
    const base = t * 3;
    tmpA.set(positions.getX(base), positions.getY(base), positions.getZ(base));
    tmpB.set(positions.getX(base + 1), positions.getY(base + 1), positions.getZ(base + 1));
    tmpC.set(positions.getX(base + 2), positions.getY(base + 2), positions.getZ(base + 2));
    const ab = tmpB.clone().sub(tmpA);
    const ac = tmpC.clone().sub(tmpA);
    const triArea = ab.cross(ac).length() * 0.5;
    totalArea += triArea;
    const triCenter = tmpA
      .clone()
      .add(tmpB)
      .add(tmpC)
      .multiplyScalar(1 / 3);
    centroid.add(triCenter.multiplyScalar(triArea));
  }
  if (totalArea > 0) centroid.multiplyScalar(1 / totalArea);

  return { triangleIndices: indices, normal: startNormal.clone(), center: centroid, area: totalArea };
}

// ─── Build a highlight geometry from selected triangle indices ───

function buildFaceHighlightGeometry(sourceGeometry: THREE.BufferGeometry, triangleIndices: number[]): THREE.BufferGeometry {
  const srcPos = sourceGeometry.getAttribute('position') as THREE.BufferAttribute;
  const count = triangleIndices.length * 9;
  const positions = new Float32Array(count);
  for (let i = 0; i < triangleIndices.length; i++) {
    const base = triangleIndices[i] * 3;
    const out = i * 9;
    for (let v = 0; v < 3; v++) {
      positions[out + v * 3] = srcPos.getX(base + v);
      positions[out + v * 3 + 1] = srcPos.getY(base + v);
      positions[out + v * 3 + 2] = srcPos.getZ(base + v);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

// ─── Edge detection: find connected sharp edges sharing direction ───

function findEdgeChain(
  geometry: THREE.BufferGeometry,
  hitPoint: THREE.Vector3,
  mesh: THREE.Mesh,
): { start: THREE.Vector3; end: THREE.Vector3; segments: [THREE.Vector3, THREE.Vector3][] } | null {
  // Use EdgesGeometry-like approach: find edges where adjacent triangle normals differ
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const triCount = positions.count / 3;

  // Build edge → adjacent triangle normals map
  const edgeData = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; normals: THREE.Vector3[] }>();

  for (let t = 0; t < triCount; t++) {
    const base = t * 3;
    const triNormal = new THREE.Vector3(normals.getX(base), normals.getY(base), normals.getZ(base));

    for (let e = 0; e < 3; e++) {
      const i0 = base + e;
      const i1 = base + ((e + 1) % 3);
      const vk0 = vertKey(positions, i0);
      const vk1 = vertKey(positions, i1);
      const ek = edgeKey(vk0, vk1);

      let data = edgeData.get(ek);
      if (!data) {
        const a = new THREE.Vector3(positions.getX(i0), positions.getY(i0), positions.getZ(i0));
        const b = new THREE.Vector3(positions.getX(i1), positions.getY(i1), positions.getZ(i1));
        data = { a, b, normals: [] };
        edgeData.set(ek, data);
      }
      data.normals.push(triNormal);
    }
  }

  // Find sharp edges (where adjacent face normals differ)
  const sharpEdges: { a: THREE.Vector3; b: THREE.Vector3; key: string }[] = [];
  for (const [key, data] of edgeData) {
    if (data.normals.length === 2 && data.normals[0].dot(data.normals[1]) < 0.9995) {
      sharpEdges.push({ a: data.a, b: data.b, key });
    } else if (data.normals.length === 1) {
      // Boundary edge
      sharpEdges.push({ a: data.a, b: data.b, key });
    }
  }

  if (sharpEdges.length === 0) return null;

  // Find the closest sharp edge to the hit point (in local space)
  const localHit = hitPoint.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
  let closestEdge: (typeof sharpEdges)[0] | null = null;
  let closestDist = Infinity;

  for (const edge of sharpEdges) {
    const ab = edge.b.clone().sub(edge.a);
    const denom = ab.lengthSq();
    if (denom === 0) continue;
    const t = THREE.MathUtils.clamp(localHit.clone().sub(edge.a).dot(ab) / denom, 0, 1);
    const closest = edge.a.clone().add(ab.multiplyScalar(t));
    const dist = closest.distanceTo(localHit);
    if (dist < closestDist) {
      closestDist = dist;
      closestEdge = edge;
    }
  }

  if (!closestEdge) return null;

  // Now chain: find connected sharp edges that are collinear
  const dir = closestEdge.b.clone().sub(closestEdge.a).normalize();
  const vertToEdges = new Map<string, typeof sharpEdges>();
  for (const edge of sharpEdges) {
    const vk0 = `${q(edge.a.x)},${q(edge.a.y)},${q(edge.a.z)}`;
    const vk1 = `${q(edge.b.x)},${q(edge.b.y)},${q(edge.b.z)}`;
    for (const vk of [vk0, vk1]) {
      let list = vertToEdges.get(vk);
      if (!list) {
        list = [];
        vertToEdges.set(vk, list);
      }
      list.push(edge);
    }
  }

  // BFS along collinear or smoothly-continuing edges
  const chainEdges = new Set<string>();
  const chainQueue = [closestEdge];
  chainEdges.add(closestEdge.key);
  const segments: [THREE.Vector3, THREE.Vector3][] = [];

  while (chainQueue.length > 0) {
    const current = chainQueue.pop()!;
    segments.push([current.a.clone(), current.b.clone()]);
    const curDir = current.b.clone().sub(current.a).normalize();

    const vk0 = `${q(current.a.x)},${q(current.a.y)},${q(current.a.z)}`;
    const vk1 = `${q(current.b.x)},${q(current.b.y)},${q(current.b.z)}`;

    for (const vk of [vk0, vk1]) {
      const neighbors = vertToEdges.get(vk);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (chainEdges.has(neighbor.key)) continue;
        const nDir = neighbor.b.clone().sub(neighbor.a).normalize();
        // Collinear or same arc (angle < ~15°)
        if (Math.abs(curDir.dot(nDir)) > 0.966) {
          chainEdges.add(neighbor.key);
          chainQueue.push(neighbor);
        }
      }
    }
  }

  // Find chain endpoints (extreme points along the primary direction)
  let minT = Infinity,
    maxT = -Infinity;
  let startPt = closestEdge.a.clone(),
    endPt = closestEdge.b.clone();
  const origin = closestEdge.a;

  for (const [a, b] of segments) {
    for (const pt of [a, b]) {
      const t = pt.clone().sub(origin).dot(dir);
      if (t < minT) {
        minT = t;
        startPt = pt.clone();
      }
      if (t > maxT) {
        maxT = t;
        endPt = pt.clone();
      }
    }
  }

  return {
    start: startPt.applyMatrix4(mesh.matrixWorld),
    end: endPt.applyMatrix4(mesh.matrixWorld),
    segments,
  };
}

// ─── Measurement computation between two entities ───

export function computeMeasureResult(a: MeasureEntity, b: MeasureEntity): MeasureResultData {
  const v3 = (xyz: [number, number, number]) => new THREE.Vector3(...xyz);

  if (a.kind === 'vertex' && b.kind === 'vertex') {
    const pa = v3(a.position),
      pb = v3(b.position);
    const delta = pb.clone().sub(pa);
    return {
      type: 'Point to Point',
      distance: pa.distanceTo(pb),
      deltaX: Math.abs(delta.x),
      deltaY: Math.abs(delta.y),
      deltaZ: Math.abs(delta.z),
    };
  }

  if (a.kind === 'face' && b.kind === 'face') {
    const nA = v3(a.normal),
      nB = v3(b.normal);
    const dot = Math.abs(nA.dot(nB));
    const angle = Math.acos(THREE.MathUtils.clamp(dot, 0, 1)) * (180 / Math.PI);

    if (dot > 0.9995) {
      // Parallel faces — compute distance between planes
      const cA = v3(a.center),
        cB = v3(b.center);
      const dist = Math.abs(cB.clone().sub(cA).dot(nA));
      return { type: 'Parallel Faces', distance: dist, angle: 0 };
    }
    // Non-parallel: show angle
    return { type: 'Face to Face', angle };
  }

  if (a.kind === 'edge' && b.kind === 'edge') {
    const dA = v3(a.direction),
      dB = v3(b.direction);
    const dot = Math.abs(dA.dot(dB));
    const angle = Math.acos(THREE.MathUtils.clamp(dot, 0, 1)) * (180 / Math.PI);

    // Min distance between the two line segments
    const dist = minDistBetweenSegments(v3(a.start), v3(a.end), v3(b.start), v3(b.end));
    if (dot > 0.9995) {
      return { type: 'Parallel Edges', distance: dist, angle: 0 };
    }
    return { type: 'Edge to Edge', distance: dist, angle };
  }

  // Mixed: vertex-face
  if ((a.kind === 'vertex' && b.kind === 'face') || (a.kind === 'face' && b.kind === 'vertex')) {
    const vertex = a.kind === 'vertex' ? a : (b as MeasureVertexEntity);
    const face = a.kind === 'face' ? a : (b as MeasureFaceEntity);
    const pt = v3(vertex.position);
    const center = v3(face.center);
    const normal = v3(face.normal);
    const perpDist = Math.abs(pt.clone().sub(center).dot(normal));
    const totalDist = pt.distanceTo(center);
    return { type: 'Point to Face', distance: perpDist, projectedDistance: totalDist };
  }

  // Mixed: vertex-edge
  if ((a.kind === 'vertex' && b.kind === 'edge') || (a.kind === 'edge' && b.kind === 'vertex')) {
    const vertex = a.kind === 'vertex' ? a : (b as MeasureVertexEntity);
    const edge = a.kind === 'edge' ? a : (b as MeasureEdgeEntity);
    const pt = v3(vertex.position);
    const eStart = v3(edge.start),
      eEnd = v3(edge.end);
    const ab = eEnd.clone().sub(eStart);
    const denom = ab.lengthSq();
    const t = denom > 0 ? THREE.MathUtils.clamp(pt.clone().sub(eStart).dot(ab) / denom, 0, 1) : 0;
    const closest = eStart.clone().add(ab.multiplyScalar(t));
    return { type: 'Point to Edge', distance: pt.distanceTo(closest) };
  }

  // Mixed: edge-face
  if ((a.kind === 'edge' && b.kind === 'face') || (a.kind === 'face' && b.kind === 'edge')) {
    const edge = a.kind === 'edge' ? a : (b as MeasureEdgeEntity);
    const face = a.kind === 'face' ? a : (b as MeasureFaceEntity);
    const eDir = v3(edge.direction);
    const fNormal = v3(face.normal);
    const dot = Math.abs(eDir.dot(fNormal));
    const angle = 90 - Math.acos(THREE.MathUtils.clamp(dot, 0, 1)) * (180 / Math.PI);

    // Distance from edge midpoint to face plane
    const eMid = v3(edge.start).add(v3(edge.end)).multiplyScalar(0.5);
    const fCenter = v3(face.center);
    const dist = Math.abs(eMid.clone().sub(fCenter).dot(fNormal));
    return { type: 'Edge to Face', distance: dist, angle };
  }

  return { type: 'Unknown' };
}

function minDistBetweenSegments(p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, p4: THREE.Vector3): number {
  const d1 = p2.clone().sub(p1);
  const d2 = p4.clone().sub(p3);
  const r = p1.clone().sub(p3);

  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);

  if (a <= 1e-10 && e <= 1e-10) return p1.distanceTo(p3);

  let s: number, t: number;
  if (a <= 1e-10) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= 1e-10) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = THREE.MathUtils.clamp((b * s + f) / e, 0, 1);
      s = THREE.MathUtils.clamp((b * t - c) / a, 0, 1);
    }
  }

  const closest1 = p1.clone().add(d1.multiplyScalar(s));
  const closest2 = p3.clone().add(d2.multiplyScalar(t));
  return closest1.distanceTo(closest2);
}

// ─── Panel styles ───

export const PANEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  background: MEASURE_COLORS.panel,
  border: `1px solid ${MEASURE_COLORS.panelBorder}`,
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 12,
  fontFamily: 'ui-monospace, "SF Mono", Monaco, monospace',
  color: MEASURE_COLORS.panelText,
  minWidth: 200,
  maxWidth: 280,
  pointerEvents: 'none',
  zIndex: 10,
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
};

export const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 0',
};

// ─── Components ───

export function MeasureTool() {
  const measureMode = useForgeStore((s) => s.measureMode);
  const measureSelections = useForgeStore((s) => s.measureSelections);
  const addMeasureSelection = useForgeStore((s) => s.addMeasureSelection);
  const { camera, raycaster, scene, gl } = useThree();
  const [hover, setHover] = useState<HoverPreview | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Stable refs for highlight geometries of selected entities
  const [selectionVisuals, setSelectionVisuals] = useState<{
    geos: (THREE.BufferGeometry | null)[];
    matrices: (THREE.Matrix4 | null)[];
    edgeSegments: ([THREE.Vector3, THREE.Vector3][] | null)[];
    vertexPositions: (THREE.Vector3 | null)[];
  }>({ geos: [], matrices: [], edgeSegments: [], vertexPositions: [] });

  // Build highlight visuals when selections change
  useEffect(() => {
    const geos: (THREE.BufferGeometry | null)[] = [];
    const matrices: (THREE.Matrix4 | null)[] = [];
    const edgeSegs: ([THREE.Vector3, THREE.Vector3][] | null)[] = [];
    const vertexPos: (THREE.Vector3 | null)[] = [];

    for (const sel of measureSelections) {
      if (sel.kind === 'face') {
        // Find the mesh and rebuild highlight
        let mesh: THREE.Mesh | null = null;
        scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh && obj.uuid === sel.meshUuid) mesh = obj as THREE.Mesh;
        });
        if (mesh) {
          const geo = buildFaceHighlightGeometry((mesh as THREE.Mesh).geometry, sel.triangleIndices);
          geos.push(geo);
          matrices.push((mesh as THREE.Mesh).matrixWorld.clone());
        } else {
          geos.push(null);
          matrices.push(null);
        }
        edgeSegs.push(null);
        vertexPos.push(null);
      } else if (sel.kind === 'edge') {
        geos.push(null);
        matrices.push(null);
        const start = new THREE.Vector3(...sel.start);
        const end = new THREE.Vector3(...sel.end);
        edgeSegs.push([[start, end]]);
        vertexPos.push(null);
      } else {
        geos.push(null);
        matrices.push(null);
        edgeSegs.push(null);
        vertexPos.push(new THREE.Vector3(...sel.position));
      }
    }

    setSelectionVisuals({ geos, matrices, edgeSegments: edgeSegs, vertexPositions: vertexPos });
    return () => {
      geos.forEach((g) => g?.dispose());
    };
  }, [measureSelections, scene]);

  useEffect(() => {
    gl.domElement.style.cursor = measureMode ? 'crosshair' : 'default';
    return () => {
      gl.domElement.style.cursor = 'default';
    };
  }, [measureMode, gl]);

  const getMeshes = useCallback((): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !mesh.userData?.measureHelper) meshes.push(mesh);
    });
    return meshes;
  }, [scene]);

  const getPointerNDC = useCallback(
    (event: PointerLike): { x: number; y: number } => {
      const rect = gl.domElement.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
    },
    [gl.domElement],
  );

  const detectEntity = useCallback(
    (
      event: PointerLike,
    ): {
      entity: MeasureEntity;
      preview: HoverPreview;
    } | null => {
      if (!measureMode) return null;
      const pointer = getPointerNDC(event);
      raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);

      const meshes = getMeshes();
      const intersects = raycaster.intersectObjects(meshes, false);
      if (intersects.length === 0) return null;

      const hit = intersects[0];
      const mesh = hit.object as THREE.Mesh;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      if (!hit.face || !geometry) return null;

      const positions = geometry.getAttribute('position');
      const normalsAttr = geometry.getAttribute('normal');
      if (!positions || !normalsAttr) return null;

      const faceIndex = hit.faceIndex ?? Math.floor(hit.face.a / 3);

      // Check proximity to edges/vertices in screen space to decide entity type
      const rect = gl.domElement.getBoundingClientRect();
      const screenX = event.clientX;
      const screenY = event.clientY;
      const SNAP_PX = 14;

      const worldToScreen2D = (pt: THREE.Vector3): { x: number; y: number } => {
        const projected = pt.clone().project(camera);
        return {
          x: (projected.x * 0.5 + 0.5) * rect.width + rect.left,
          y: (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
        };
      };

      // Get hit triangle vertices in world space
      const { a: ia, b: ib, c: ic } = hit.face;
      const vA = new THREE.Vector3().fromBufferAttribute(positions, ia).applyMatrix4(mesh.matrixWorld);
      const vB = new THREE.Vector3().fromBufferAttribute(positions, ib).applyMatrix4(mesh.matrixWorld);
      const vC = new THREE.Vector3().fromBufferAttribute(positions, ic).applyMatrix4(mesh.matrixWorld);

      // Check vertex proximity
      let closestVertexDist = Infinity;
      let closestVertex: THREE.Vector3 | null = null;
      for (const v of [vA, vB, vC]) {
        const s = worldToScreen2D(v);
        const d = Math.hypot(screenX - s.x, screenY - s.y);
        if (d < closestVertexDist && d < SNAP_PX) {
          closestVertexDist = d;
          closestVertex = v;
        }
      }

      if (closestVertex) {
        const entity: MeasureVertexEntity = {
          kind: 'vertex',
          position: [closestVertex.x, closestVertex.y, closestVertex.z],
          meshUuid: mesh.uuid,
        };
        return {
          entity,
          preview: { kind: 'vertex', vertexPosition: closestVertex.clone() },
        };
      }

      // Check edge proximity (only snap to sharp/boundary edges)
      const edgeResult = findEdgeChain(geometry, hit.point, mesh);
      if (edgeResult) {
        // Check if the hit point is close enough to the closest edge in screen space
        const closestOnEdge = (() => {
          const ab = edgeResult.end.clone().sub(edgeResult.start);
          const denom = ab.lengthSq();
          if (denom === 0) return edgeResult.start.clone();
          const t = THREE.MathUtils.clamp(hit.point.clone().sub(edgeResult.start).dot(ab) / denom, 0, 1);
          return edgeResult.start.clone().add(ab.multiplyScalar(t));
        })();
        const edgeScreenPt = worldToScreen2D(closestOnEdge);
        const edgeScreenDist = Math.hypot(screenX - edgeScreenPt.x, screenY - edgeScreenPt.y);

        if (edgeScreenDist < SNAP_PX * 1.5) {
          const dir = edgeResult.end.clone().sub(edgeResult.start).normalize();
          const entity: MeasureEdgeEntity = {
            kind: 'edge',
            start: [edgeResult.start.x, edgeResult.start.y, edgeResult.start.z],
            end: [edgeResult.end.x, edgeResult.end.y, edgeResult.end.z],
            length: edgeResult.start.distanceTo(edgeResult.end),
            direction: [dir.x, dir.y, dir.z],
            meshUuid: mesh.uuid,
          };
          // Transform segments to world space for preview
          const worldSegments = edgeResult.segments.map(
            ([a, b]) =>
              [a.clone().applyMatrix4(mesh.matrixWorld), b.clone().applyMatrix4(mesh.matrixWorld)] as [THREE.Vector3, THREE.Vector3],
          );
          return {
            entity,
            preview: { kind: 'edge', edgeSegments: worldSegments, meshUuid: mesh.uuid },
          };
        }
      }

      // Default: face selection
      const ffResult = floodFillFace(geometry, faceIndex);
      const worldNormal = ffResult.normal.clone().transformDirection(mesh.matrixWorld).normalize();
      const worldCenter = ffResult.center.clone().applyMatrix4(mesh.matrixWorld);
      const highlightGeo = buildFaceHighlightGeometry(geometry, ffResult.triangleIndices);

      // Compute area in world space (account for scale)
      const scale = new THREE.Vector3();
      mesh.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      const areaScale = scale.x * scale.y; // approximate for uniform scale
      const worldArea = ffResult.area * Math.abs(areaScale);

      const entity: MeasureFaceEntity = {
        kind: 'face',
        normal: [worldNormal.x, worldNormal.y, worldNormal.z],
        center: [worldCenter.x, worldCenter.y, worldCenter.z],
        area: worldArea,
        triangleIndices: ffResult.triangleIndices,
        meshUuid: mesh.uuid,
      };

      return {
        entity,
        preview: {
          kind: 'face',
          faceHighlightGeo: highlightGeo,
          meshUuid: mesh.uuid,
          meshMatrix: mesh.matrixWorld.clone(),
        },
      };
    },
    [camera, getMeshes, getPointerNDC, gl.domElement, measureMode, raycaster],
  );

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!measureMode || event.button !== 0) return;
      pointerDownRef.current = { x: event.clientX, y: event.clientY, moved: false };
    },
    [measureMode],
  );

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!measureMode) return;
      if (pointerDownRef.current) {
        const dx = event.clientX - pointerDownRef.current.x;
        const dy = event.clientY - pointerDownRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > 4) {
          pointerDownRef.current.moved = true;
        }
      }
      // Only update hover if not dragging the orbit
      if (!pointerDownRef.current || !pointerDownRef.current.moved) {
        const result = detectEntity(event);
        setHover((prev) => {
          if (prev?.faceHighlightGeo && prev.faceHighlightGeo !== result?.preview.faceHighlightGeo) {
            prev.faceHighlightGeo.dispose();
          }
          return result?.preview ?? null;
        });
      }
    },
    [detectEntity, measureMode],
  );

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!measureMode || event.button !== 0) return;
      const down = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!down || down.moved) return;
      const result = detectEntity(event);
      if (result) {
        addMeasureSelection(result.entity);
        // Clear hover since we just selected
        setHover((prev) => {
          prev?.faceHighlightGeo?.dispose();
          return null;
        });
      }
    },
    [addMeasureSelection, detectEntity, measureMode],
  );

  // Cleanup hover geo on unmount or mode change
  useEffect(() => {
    if (!measureMode) {
      setHover((prev) => {
        prev?.faceHighlightGeo?.dispose();
        return null;
      });
    }
  }, [measureMode]);

  // Compute measurement line between two selected entities (for 3D visualization)
  const measureLinePoints = useMemo((): [THREE.Vector3, THREE.Vector3] | null => {
    if (measureSelections.length !== 2) return null;
    const [a, b] = measureSelections;

    const getPoint = (e: MeasureEntity): THREE.Vector3 => {
      if (e.kind === 'vertex') return new THREE.Vector3(...e.position);
      if (e.kind === 'edge') return new THREE.Vector3(...e.start).add(new THREE.Vector3(...e.end)).multiplyScalar(0.5);
      return new THREE.Vector3(...e.center);
    };

    // For parallel faces, project onto normal for clean perpendicular line
    if (a.kind === 'face' && b.kind === 'face') {
      const nA = new THREE.Vector3(...a.normal);
      const nB = new THREE.Vector3(...b.normal);
      if (Math.abs(nA.dot(nB)) > 0.9995) {
        const cA = new THREE.Vector3(...a.center);
        const cB = new THREE.Vector3(...b.center);
        // Project cB onto cA along the normal
        const projB = cA.clone().add(nA.clone().multiplyScalar(cB.clone().sub(cA).dot(nA)));
        return [cA, projB];
      }
    }

    return [getPoint(a), getPoint(b)];
  }, [measureSelections]);

  return (
    <>
      {/* Invisible click-catcher when in measure mode */}
      {measureMode && (
        <mesh
          visible={false}
          userData={{ measureHelper: true }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerOut={() =>
            setHover((prev) => {
              prev?.faceHighlightGeo?.dispose();
              return null;
            })
          }
        >
          <sphereGeometry args={[10000]} />
          <meshBasicMaterial side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Hover highlights */}
      {measureMode && hover?.kind === 'face' && hover.faceHighlightGeo && hover.meshMatrix && (
        <mesh
          geometry={hover.faceHighlightGeo}
          matrixAutoUpdate={false}
          matrix={hover.meshMatrix}
          userData={{ measureHelper: true }}
          renderOrder={10}
        >
          <meshBasicMaterial
            color={MEASURE_COLORS.face}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            depthTest={false}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
      )}

      {measureMode &&
        hover?.kind === 'edge' &&
        hover.edgeSegments?.map((seg, i) => {
          const geo = new THREE.BufferGeometry().setFromPoints([seg[0], seg[1]]);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: MEASURE_COLORS.edge, linewidth: 2, depthTest: false }));
          line.userData.measureHelper = true;
          line.renderOrder = 10;
          return <primitive key={i} object={line} />;
        })}

      {measureMode && hover?.kind === 'vertex' && hover.vertexPosition && (
        <mesh position={hover.vertexPosition} userData={{ measureHelper: true }} renderOrder={10}>
          <sphereGeometry args={[1.2, 16, 16]} />
          <meshBasicMaterial color={MEASURE_COLORS.vertex} depthTest={false} />
        </mesh>
      )}

      {/* Selection highlights */}
      {selectionVisuals.geos.map((geo, i) => {
        if (!geo || !selectionVisuals.matrices[i]) return null;
        const color = i === 0 ? MEASURE_COLORS.highlight : MEASURE_COLORS.highlightSecondary;
        return (
          <mesh
            key={`sel-face-${i}`}
            geometry={geo}
            matrixAutoUpdate={false}
            matrix={selectionVisuals.matrices[i]!}
            userData={{ measureHelper: true }}
            renderOrder={11}
          >
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.35}
              side={THREE.DoubleSide}
              depthTest={false}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        );
      })}

      {selectionVisuals.edgeSegments.map((segs, i) => {
        if (!segs) return null;
        const color = i === 0 ? MEASURE_COLORS.highlight : MEASURE_COLORS.highlightSecondary;
        return segs.map((seg, j) => {
          const geo = new THREE.BufferGeometry().setFromPoints([seg[0], seg[1]]);
          const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 3, depthTest: false }));
          line.userData.measureHelper = true;
          line.renderOrder = 11;
          return <primitive key={`sel-edge-${i}-${j}`} object={line} />;
        });
      })}

      {selectionVisuals.vertexPositions.map((pos, i) => {
        if (!pos) return null;
        const color = i === 0 ? MEASURE_COLORS.highlight : MEASURE_COLORS.highlightSecondary;
        return (
          <mesh key={`sel-vert-${i}`} position={pos} userData={{ measureHelper: true }} renderOrder={11}>
            <sphereGeometry args={[1.5, 16, 16]} />
            <meshBasicMaterial color={color} depthTest={false} />
          </mesh>
        );
      })}

      {/* Measurement line between two selections */}
      {measureLinePoints && <MeasureDistanceLine a={measureLinePoints[0]} b={measureLinePoints[1]} />}
    </>
  );
}

export function MeasureDistanceLine({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
  const { camera } = useThree();
  const lengthUnit = useForgeStore((s) => s.lengthUnit);
  const measureSelections = useForgeStore((s) => s.measureSelections);
  const measureResult = useMemo(() => {
    if (measureSelections.length !== 2) return null;
    return computeMeasureResult(measureSelections[0], measureSelections[1]);
  }, [measureSelections]);

  const dist = useMemo(() => a.distanceTo(b), [a, b]);
  const mid = useMemo(() => a.clone().add(b).multiplyScalar(0.5), [a, b]);
  const geo = useMemo(() => new THREE.BufferGeometry().setFromPoints([a, b]), [a, b]);

  const labelPos = useMemo(() => {
    const pos = mid.clone();
    const dir = camera.position.clone().sub(mid);
    if (dir.lengthSq() > 0) {
      dir.normalize();
      pos.add(dir.multiplyScalar(2));
    }
    return pos;
  }, [camera.position, mid]);

  const labelTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    return new THREE.CanvasTexture(canvas);
  }, []);

  useEffect(() => {
    const canvas = labelTexture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000cc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = measureResult?.distance != null ? formatLength(measureResult.distance, lengthUnit) : formatLength(dist, lengthUnit);
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    labelTexture.needsUpdate = true;
  }, [dist, labelTexture, lengthUnit, measureResult]);

  if (dist < 0.001) return null;

  return (
    <group>
      <primitive
        object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: MEASURE_COLORS.line, depthTest: false }))}
        userData={{ measureHelper: true }}
        renderOrder={12}
      />
      <sprite position={labelPos} scale={[30, 10, 1]} renderOrder={13}>
        <spriteMaterial map={labelTexture} depthTest={false} />
      </sprite>
    </group>
  );
}

export function MeasureInfoPanel() {
  const measureSelections = useForgeStore((s) => s.measureSelections);
  const lengthUnit = useForgeStore((s) => s.lengthUnit);

  if (measureSelections.length === 0) return null;

  const formatAngle = (deg: number) => `${deg.toFixed(1)}\u00B0`;
  const formatArea = (mm2: number) => {
    if (lengthUnit === 'in') return `${(mm2 / 645.16).toFixed(2)} in\u00B2`;
    if (lengthUnit === 'ft') return `${(mm2 / 92903).toFixed(4)} ft\u00B2`;
    if (mm2 > 100) return `${(mm2 / 100).toFixed(2)} cm\u00B2`;
    return `${mm2.toFixed(2)} mm\u00B2`;
  };
  const formatCoord = (v: number) => formatLength(v, lengthUnit);
  const fmtNormal = (n: [number, number, number]) => `(${n[0].toFixed(3)}, ${n[1].toFixed(3)}, ${n[2].toFixed(3)})`;

  // Single selection
  if (measureSelections.length === 1) {
    const sel = measureSelections[0];

    if (sel.kind === 'face') {
      return (
        <div style={PANEL_STYLE}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: MEASURE_COLORS.highlight }}>Face</div>
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Normal</span>
            <span>{fmtNormal(sel.normal)}</span>
          </div>
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Area</span>
            <span style={{ color: MEASURE_COLORS.panelValue }}>{formatArea(sel.area)}</span>
          </div>
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Center</span>
            <span style={{ fontSize: 10 }}>
              {formatCoord(sel.center[0])}, {formatCoord(sel.center[1])}, {formatCoord(sel.center[2])}
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: MEASURE_COLORS.panelLabel }}>Click another entity to measure</div>
        </div>
      );
    }

    if (sel.kind === 'edge') {
      return (
        <div style={PANEL_STYLE}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: MEASURE_COLORS.highlight }}>Edge</div>
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Length</span>
            <span style={{ color: MEASURE_COLORS.panelValue }}>{formatLength(sel.length, lengthUnit)}</span>
          </div>
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Direction</span>
            <span>{fmtNormal(sel.direction)}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: MEASURE_COLORS.panelLabel }}>Click another entity to measure</div>
        </div>
      );
    }

    if (sel.kind === 'vertex') {
      return (
        <div style={PANEL_STYLE}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: MEASURE_COLORS.highlight }}>Vertex</div>
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>X</span>
            <span style={{ color: MEASURE_COLORS.panelValue }}>{formatCoord(sel.position[0])}</span>
          </div>
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Y</span>
            <span style={{ color: MEASURE_COLORS.panelValue }}>{formatCoord(sel.position[1])}</span>
          </div>
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Z</span>
            <span style={{ color: MEASURE_COLORS.panelValue }}>{formatCoord(sel.position[2])}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: MEASURE_COLORS.panelLabel }}>Click another entity to measure</div>
        </div>
      );
    }
  }

  // Dual selection — show measurement result
  if (measureSelections.length === 2) {
    const result = computeMeasureResult(measureSelections[0], measureSelections[1]);

    return (
      <div style={PANEL_STYLE}>
        <div style={{ fontWeight: 600, marginBottom: 6, color: MEASURE_COLORS.panelValue }}>{result.type}</div>
        {result.distance != null && (
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Distance</span>
            <span style={{ color: MEASURE_COLORS.panelValue, fontWeight: 600, fontSize: 14 }}>
              {formatLength(result.distance, lengthUnit)}
            </span>
          </div>
        )}
        {result.angle != null && (
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Angle</span>
            <span style={{ color: MEASURE_COLORS.panelValue, fontWeight: 600, fontSize: 14 }}>{formatAngle(result.angle)}</span>
          </div>
        )}
        {result.deltaX != null && (
          <>
            <div style={{ borderTop: '1px solid #333', margin: '6px 0' }} />
            <div style={ROW_STYLE}>
              <span style={{ color: MEASURE_COLORS.panelLabel }}>{'\u0394'}X</span>
              <span>{formatLength(result.deltaX, lengthUnit)}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={{ color: MEASURE_COLORS.panelLabel }}>{'\u0394'}Y</span>
              <span>{formatLength(result.deltaY!, lengthUnit)}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={{ color: MEASURE_COLORS.panelLabel }}>{'\u0394'}Z</span>
              <span>{formatLength(result.deltaZ!, lengthUnit)}</span>
            </div>
          </>
        )}
        {result.projectedDistance != null && result.distance != null && Math.abs(result.projectedDistance - result.distance) > 0.01 && (
          <div style={ROW_STYLE}>
            <span style={{ color: MEASURE_COLORS.panelLabel }}>Direct dist</span>
            <span>{formatLength(result.projectedDistance, lengthUnit)}</span>
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 10, color: MEASURE_COLORS.panelLabel }}>Click to start new measurement</div>
      </div>
    );
  }

  return null;
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
      <span style={{ color: 'var(--fc-textMuted)' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{value}</span>
    </div>
  );
}

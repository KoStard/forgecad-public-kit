import { useMemo, useCallback, useRef, useEffect, useState, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, Lightformer, OrthographicCamera, PerspectiveCamera, Html } from '@react-three/drei';
import { useForgeStore, type ObjectSettings, type ProjectionMode, type RenderMode, type ViewCommand, type MeasureEntity, type MeasureFaceEntity, type MeasureEdgeEntity, type MeasureVertexEntity } from '../store/forgeStore';
import { formatLength, formatCoord, convertFromMm, type LengthUnit } from '@forge/units';
import { DEFAULT_VIEW_CONFIG, intersectWithPlane } from '@forge/index';
import type {
  SceneObject,
  RunResult,
  ExplodeViewOptions,
  JointViewDef,
  JointOverlayViewConfig,
} from '@forge/index';
import type { DimensionDef } from '@forge/sketch/dimensions';
import type { SketchConstraintMeta, AnnotationElement } from '@forge/sketch/constraints/types';
import type { CutPlaneDef } from '@forge/cutPlane';
import { shapeToGeometry } from '@forge/meshToGeometry';
import { buildShapeFromCompilePlan } from '@forge/kernel';
import { getSketchWorldMatrix } from '@forge/sketch/placement3d';
import { findJointAnimationClip, resolveJointAnimation } from '@forge/jointAnimation';
import { resolveJointViewValues } from '@forge/jointsView';
import {
  type ExplodeBounds,
  computeExplodeMotion,
  createResolvedExplodeConfig,
  explodeAdd,
  explodeBoundsCenter,
  explodeLeafFanStage,
  explodeMergeBounds,
  explodeMul,
  hasExplodeOverride,
  resolveExplodeDirective,
  resolveExplodeLocalFanDirection,
} from '@forge/explodeCore';
import {
  registerOrbitGifExporter,
  type OrbitGifExportOptions,
  type OrbitGifMode,
} from './exportActions';
import { parseViewportCameraState, type ViewportCameraState } from '../capture/cameraState';
import { getShortcutKey, hasPrimaryModifier } from '../editorShortcuts';
import { themes } from '../theme';
import { evalWorkerClient } from '../workers/evalWorkerClient';
import type { EvalWorkerFaceInfoResult } from '../workers/evalWorkerProtocol';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { MOUSE_BUTTONS_3D, MOUSE_BUTTONS_SKETCH, TOUCH_GESTURES_3D, TOUCH_GESTURES_SKETCH } from '../capture/controlsConfig';

interface ObjectContextMenuState {
  objectId: string;
  x: number;
  y: number;
  hitNormal?: [number, number, number];
}

const VIEWPORT_CAMERA_STORAGE_KEY = 'fc-viewport-camera-v1';
const GIF_DEFAULT_SIZE = 720;
const GIF_DEFAULT_FPS = 18;
const GIF_DEFAULT_FRAMES_PER_TURN = 54;
const GIF_DEFAULT_HOLD_FRAMES = 4;
const GIF_DEFAULT_PITCH_DEG = 18;
const FOCUS_MODE_DIM_OPACITY = 0.1;
const PERFORMANCE_SAMPLE_INTERVAL_SEC = 0.25;
const INTEGER_FORMATTER = new Intl.NumberFormat('en-US');
const SECTION_HATCH_MIN_SPACING = 1.6;
const SECTION_HATCH_MAX_SPACING = 8;
const SECTION_HATCH_SPACING_SCALE = 0.12;
const SECTION_HATCH_MIN_LINE_WIDTH = 0.18;
const SECTION_HATCH_MAX_LINE_WIDTH = 0.9;
const SECTION_SURFACE_LIFT_MIN = 0.0005;
const SECTION_SURFACE_LIFT_MAX = 0.01;
const SECTION_SURFACE_LIFT_SCALE = 5e-5;
const PLANE_TRANSFORM_EPS = 1e-8;

interface ViewportPerformanceInfo {
  fps: number;
  frameTimeMs: number;
  sceneObjects: number;
  modelTriangles: number;
  drawCalls: number;
  renderTriangles: number;
  renderLines: number;
  renderPoints: number;
  memoryGeometries: number;
  memoryTextures: number;
  programCount: number;
  jsHeapMB: number | null;
  jsHeapLimitMB: number | null;
  reactRendersPerSec: number;
}
const OBJECT_CONTEXT_MENU_WIDTH = 144;
const OBJECT_CONTEXT_MENU_HEIGHT = 72;
const OBJECT_CONTEXT_MENU_MARGIN = 8;
const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

interface PlaneTransform {
  center: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

type SketchHoveredEntity =
  | { kind: 'line'; id: string; a: [number, number]; b: [number, number] }
  | { kind: 'circle'; id: string; center: [number, number]; radius: number }
  | { kind: 'arc'; id: string; center: [number, number]; start: [number, number]; end: [number, number]; radius: number; clockwise: boolean }
  | { kind: 'point'; id: string; position: [number, number] };

interface SketchEntityInfoPanel {
  entity: SketchHoveredEntity;
  x: number;
  y: number;
}

function distToSegment2D(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointInPolygon(px: number, py: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function findHoveredSurface(
  x: number,
  y: number,
  meta: SketchConstraintMeta,
): number | null {
  // Check surfaces from smallest to largest so inner regions take priority
  for (let i = meta.surfaces.length - 1; i >= 0; i--) {
    const s = meta.surfaces[i];
    // Quick bounding box check
    if (x < s.bounds.min[0] || x > s.bounds.max[0] || y < s.bounds.min[1] || y > s.bounds.max[1]) continue;
    if (pointInPolygon(x, y, s.polygon)) return s.index;
  }
  return null;
}

function findNearestSketchEntity(
  x: number,
  y: number,
  meta: SketchConstraintMeta,
  threshold: number,
): SketchHoveredEntity | null {
  let bestDist = threshold;
  let best: SketchHoveredEntity | null = null;
  for (const line of meta.edges.lines) {
    const d = distToSegment2D(x, y, line.a[0], line.a[1], line.b[0], line.b[1]);
    if (d < bestDist) { bestDist = d; best = { kind: 'line', id: line.id, a: line.a, b: line.b }; }
  }
  for (const circle of meta.edges.circles) {
    const d = Math.abs(Math.hypot(x - circle.center[0], y - circle.center[1]) - circle.radius);
    if (d < bestDist) { bestDist = d; best = { kind: 'circle', id: circle.id, center: circle.center, radius: circle.radius }; }
  }
  for (const arc of meta.edges.arcs) {
    const d = Math.abs(Math.hypot(x - arc.center[0], y - arc.center[1]) - arc.radius);
    if (d < bestDist) { bestDist = d; best = { kind: 'arc', id: arc.id, center: arc.center, start: arc.start, end: arc.end, radius: arc.radius, clockwise: arc.clockwise }; }
  }
  for (const pt of meta.edges.points) {
    const d = Math.hypot(x - pt.pos[0], y - pt.pos[1]);
    if (d < bestDist) { bestDist = d; best = { kind: 'point', id: pt.id, position: [pt.pos[0], pt.pos[1]] }; }
  }
  return best;
}

interface CutSurfaceDef {
  id: string;
  geometry: THREE.BufferGeometry;
  outlineGeometry: THREE.BufferGeometry | null;
  sourcePlaneIndex: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  hatchAngleRad: number;
  hatchSpacing: number;
  hatchLineWidth: number;
}

const waitForAnimationFrame = (): Promise<void> => (
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  })
);

const formatPerformanceCount = (value: number): string => INTEGER_FORMATTER.format(Math.max(0, Math.round(value)));

const getProgramCount = (gl: THREE.WebGLRenderer): number => {
  const info = gl.info as typeof gl.info & { programs?: unknown[] };
  return Array.isArray(info.programs) ? info.programs.length : 0;
};

const applyOrbitPose = (
  camera: THREE.Camera,
  target: THREE.Vector3,
  radius: number,
  turn: number,
  pitchDeg: number,
): void => {
  const normalizedTurn = ((turn % 1) + 1) % 1;
  const clampedPitch = THREE.MathUtils.clamp(pitchDeg, -80, 80);
  const yaw = normalizedTurn * Math.PI * 2;
  const pitch = THREE.MathUtils.degToRad(clampedPitch);
  const cosPitch = Math.cos(pitch);
  const direction = new THREE.Vector3(
    Math.sin(yaw) * cosPitch,
    -Math.cos(yaw) * cosPitch,
    Math.sin(pitch),
  ).normalize();

  camera.position.copy(target).addScaledVector(direction, radius);
  camera.up.set(0, 0, 1);
  camera.lookAt(target);
  if ('updateProjectionMatrix' in camera && typeof camera.updateProjectionMatrix === 'function') {
    camera.updateProjectionMatrix();
  }
};

interface OrbitGifOverrideSession {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  center: THREE.Vector3;
  distance: number;
  solids: THREE.Object3D[];
  wires: THREE.Object3D[];
}

function parseExportColor(input: string | undefined, fallback: number): THREE.Color {
  if (!input) return new THREE.Color(fallback);
  try {
    return new THREE.Color(input);
  } catch {
    return new THREE.Color(fallback);
  }
}

function addExportLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
  dir1.position.set(100, 150, 80);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dir2.position.set(-60, -40, -80);
  scene.add(dir2);

  scene.add(new THREE.HemisphereLight(0xb1e1ff, 0x444444, 0.4));
}

function hashString(value: string | undefined | null): number {
  const s = String(value || '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildPlaneSpaceRotation(normalLike: [number, number, number]): { normal: THREE.Vector3; rotationToPlane: THREE.Matrix4 } | null {
  const normal = new THREE.Vector3(normalLike[0], normalLike[1], normalLike[2]);
  if (normal.lengthSq() < PLANE_TRANSFORM_EPS) return null;
  normal.normalize();

  const dot = normal.z;
  if (dot > 1 - PLANE_TRANSFORM_EPS) {
    return { normal, rotationToPlane: new THREE.Matrix4() };
  }

  let axis = new THREE.Vector3(1, 0, 0);
  let angle = Math.PI;

  if (dot >= -1 + PLANE_TRANSFORM_EPS) {
    axis = new THREE.Vector3(normal.y, -normal.x, 0);
    const axisLength = axis.length();
    if (axisLength <= PLANE_TRANSFORM_EPS) {
      return { normal, rotationToPlane: new THREE.Matrix4() };
    }
    axis.multiplyScalar(1 / axisLength);
    angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
  }

  return {
    normal,
    rotationToPlane: new THREE.Matrix4().makeRotationAxis(axis, angle),
  };
}

function resolvePlaneTransform(
  normalLike: [number, number, number],
  offset: number,
  normalDisplacement = 0,
): PlaneTransform | null {
  const planeSpace = buildPlaneSpaceRotation(normalLike);
  if (!planeSpace) return null;
  const { normal, rotationToPlane } = planeSpace;
  const center = normal.clone().multiplyScalar(offset + normalDisplacement);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotationToPlane.clone().invert());

  return { center, quaternion };
}

function polygonArea2D(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-fc-editor-surface]')) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
  }

  let current: HTMLElement | null = target;
  while (current) {
    if (current.isContentEditable) return true;
    current = current.parentElement;
  }

  return false;
}

function computeSceneObjectBounds(
  obj: SceneObject,
  objectMatrices: Record<string, THREE.Matrix4>,
): THREE.Box3 | null {
  const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
  if (obj.shape) {
    try {
      const { solid } = shapeToGeometry(obj.shape);
      solid.computeBoundingBox();
      const bounds = solid.boundingBox ?? null;
      if (!bounds) return null;
      const out = new THREE.Box3();
      expandBoundsByTransformedAabb(
        out,
        [bounds.min.x, bounds.min.y, bounds.min.z],
        [bounds.max.x, bounds.max.y, bounds.max.z],
        matrix,
      );
      return out;
    } catch {
      return null;
    }
  }
  if (obj.sketch) {
    try {
      const polys = obj.sketch.toPolygons();
      const box = new THREE.Box3();
      let hasPoint = false;
      polys.forEach((contour) => {
        contour.forEach((p) => {
          box.expandByPoint(new THREE.Vector3(p[0], p[1], 0));
          hasPoint = true;
        });
      });
      if (!hasPoint) return null;
      const out = new THREE.Box3();
      expandBoundsByTransformedAabb(
        out,
        [box.min.x, box.min.y, box.min.z],
        [box.max.x, box.max.y, box.max.z],
        matrix,
      );
      return out;
    } catch {
      return null;
    }
  }
  return null;
}

function pointInPolygon2D(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function buildPathFromPoints(points: THREE.Vector2[]): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    path.lineTo(points[i].x, points[i].y);
  }
  path.closePath();
  return path;
}

function buildShapeFromPoints(points: THREE.Vector2[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

function buildFilledGeometryFromPolygons(polygons: number[][][]): THREE.BufferGeometry | null {
  const loops = polygons
    .filter((polygon) => polygon.length >= 3)
    .map((polygon) => {
      const points = polygon.map((point) => new THREE.Vector2(point[0], point[1]));
      const area = Math.abs(polygonArea2D(points));
      return { points, area };
    })
    .filter((loop) => loop.area > 1e-8)
    .sort((a, b) => b.area - a.area);

  if (loops.length === 0) return null;

  const parents = new Array<number>(loops.length).fill(-1);
  const depths = new Array<number>(loops.length).fill(0);

  for (let i = 0; i < loops.length; i += 1) {
    const probe = loops[i].points[0];
    let bestParent = -1;
    let bestArea = Number.POSITIVE_INFINITY;
    for (let j = 0; j < i; j += 1) {
      if (loops[j].area >= bestArea) continue;
      if (!pointInPolygon2D(probe, loops[j].points)) continue;
      bestParent = j;
      bestArea = loops[j].area;
    }
    parents[i] = bestParent;
    depths[i] = bestParent >= 0 ? depths[bestParent] + 1 : 0;
  }

  const shapesByLoop = new Map<number, THREE.Shape>();
  const shapes: THREE.Shape[] = [];

  loops.forEach((loop, index) => {
    if (depths[index] % 2 === 1) return;
    const shape = buildShapeFromPoints(loop.points);
    shapesByLoop.set(index, shape);
    shapes.push(shape);
  });

  loops.forEach((loop, index) => {
    if (depths[index] % 2 === 0) return;
    const parent = parents[index];
    const outerShape = parent >= 0 ? shapesByLoop.get(parent) : null;
    if (!outerShape) return;
    outerShape.holes.push(buildPathFromPoints(loop.points));
  });

  if (shapes.length === 0) return null;
  return new THREE.ShapeGeometry(shapes);
}

function buildOutlineGeometryFromPolygons(polygons: number[][][]): THREE.BufferGeometry | null {
  const vertices: number[] = [];
  for (const polygon of polygons) {
    if (polygon.length < 2) continue;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      vertices.push(a[0], a[1], 0, b[0], b[1], 0);
    }
  }
  if (vertices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geo;
}

function resolveSectionSurfaceLift(shape: SceneObject['shape'] | undefined): number {
  if (!shape) return SECTION_SURFACE_LIFT_MIN;
  try {
    const bb = shape.boundingBox();
    const dx = bb.max[0] - bb.min[0];
    const dy = bb.max[1] - bb.min[1];
    const dz = bb.max[2] - bb.min[2];
    const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return THREE.MathUtils.clamp(
      diagonal * SECTION_SURFACE_LIFT_SCALE,
      SECTION_SURFACE_LIFT_MIN,
      SECTION_SURFACE_LIFT_MAX,
    );
  } catch {
    return SECTION_SURFACE_LIFT_MIN;
  }
}

function resolveSectionHatchMetrics(geometry: THREE.BufferGeometry): { spacing: number; lineWidth: number } {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    return {
      spacing: SECTION_HATCH_MIN_SPACING,
      lineWidth: SECTION_HATCH_MIN_LINE_WIDTH,
    };
  }
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const span = Math.max(1, size.x, size.y);
  const spacing = THREE.MathUtils.clamp(
    span * SECTION_HATCH_SPACING_SCALE,
    SECTION_HATCH_MIN_SPACING,
    SECTION_HATCH_MAX_SPACING,
  );
  return {
    spacing,
    lineWidth: THREE.MathUtils.clamp(
      spacing * 0.18,
      SECTION_HATCH_MIN_LINE_WIDTH,
      SECTION_HATCH_MAX_LINE_WIDTH,
    ),
  };
}

function setOverrideSessionMode(session: OrbitGifOverrideSession, mode: OrbitGifMode): void {
  const showSolid = mode === 'solid';
  session.solids.forEach((node) => { node.visible = showSolid; });
  session.wires.forEach((node) => { node.visible = true; });
}

function setOverrideOrbitCamera(session: OrbitGifOverrideSession, turn: number, pitchDeg: number): void {
  const normalizedTurn = ((turn % 1) + 1) % 1;
  const clampedPitch = THREE.MathUtils.clamp(pitchDeg, -80, 80);
  const yaw = normalizedTurn * Math.PI * 2;
  const pitch = THREE.MathUtils.degToRad(clampedPitch);
  const cosPitch = Math.cos(pitch);
  const direction = new THREE.Vector3(
    Math.sin(yaw) * cosPitch,
    -Math.cos(yaw) * cosPitch,
    Math.sin(pitch),
  ).normalize();

  session.camera.position.copy(session.center).addScaledVector(direction, session.distance);
  session.camera.lookAt(session.center);
  session.camera.updateProjectionMatrix();
}

function disposeOverrideSession(session: OrbitGifOverrideSession): void {
  session.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((mat) => mat.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function createOverrideSessionFromRunResult(
  runResult: RunResult,
  objectSettings: Record<string, ObjectSettings> | undefined,
  background?: string,
): OrbitGifOverrideSession {
  const scene = new THREE.Scene();
  scene.background = parseExportColor(background, 0x252526);
  addExportLights(scene);

  const solids: THREE.Object3D[] = [];
  const wires: THREE.Object3D[] = [];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  runResult.objects.forEach((obj) => {
    if (!obj.shape) return;

    const color = objectSettings?.[obj.id]?.color || obj.color;
    const geo = shapeToGeometry(obj.shape);
    const solid = new THREE.Mesh(
      geo.solid,
      new THREE.MeshPhysicalMaterial({
        color: parseExportColor(color, 0x5b9bd5),
        metalness: 0.05,
        roughness: 0.35,
        clearcoat: 0.1,
        clearcoatRoughness: 0.4,
        flatShading: true,
        side: THREE.DoubleSide,
      }),
    );
    scene.add(solid);
    solids.push(solid);

    const wire = new THREE.LineSegments(
      geo.edges,
      new THREE.LineBasicMaterial({
        color: parseExportColor(color, 0x1a1a2e),
        transparent: true,
        opacity: 0.9,
      }),
    );
    scene.add(wire);
    wires.push(wire);

    try {
      const bb = obj.shape.boundingBox();
      minX = Math.min(minX, bb.min[0]);
      minY = Math.min(minY, bb.min[1]);
      minZ = Math.min(minZ, bb.min[2]);
      maxX = Math.max(maxX, bb.max[0]);
      maxY = Math.max(maxY, bb.max[1]);
      maxZ = Math.max(maxZ, bb.max[2]);
    } catch {
      // Skip invalid bounds; export still works with remaining objects.
    }
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    throw new Error('No 3D objects available for GIF export.');
  }

  const center = new THREE.Vector3(
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
  );
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDim = Math.max(1, sizeX, sizeY, sizeZ);
  const fov = 45;
  const distance = maxDim / (2 * Math.tan((fov * Math.PI) / 360)) * 1.6;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, Math.max(10, distance * 10));
  camera.up.set(0, 0, 1);
  camera.aspect = 1;
  camera.updateProjectionMatrix();

  const session: OrbitGifOverrideSession = {
    scene,
    camera,
    center,
    distance,
    solids,
    wires,
  };
  setOverrideSessionMode(session, 'solid');
  setOverrideOrbitCamera(session, 0, GIF_DEFAULT_PITCH_DEG);
  return session;
}

const readPersistedViewportCameraState = (): ViewportCameraState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VIEWPORT_CAMERA_STORAGE_KEY);
    if (!raw) return null;
    return parseViewportCameraState(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writePersistedViewportCameraState = (state: ViewportCameraState): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIEWPORT_CAMERA_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
};

const resolveHoverObjectName = (name: string, knownFileNames: Set<string>): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Unnamed returns fall back to source filenames; skip those in hover tooltips.
  if (knownFileNames.has(trimmed)) return null;
  return trimmed;
};

const isObjectExcludedFromCutPlane = (obj: SceneObject, cutPlane: CutPlaneDef): boolean => {
  const excludedNames = cutPlane.excludeObjectNames;
  if (!excludedNames || excludedNames.length === 0) return false;
  const objectName = obj.name.trim();
  if (!objectName) return false;
  return excludedNames.includes(objectName);
};

const toClippingPlane = (cp: CutPlaneDef): THREE.Plane => {
  const n = new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).normalize();
  // THREE.Plane convention: clips geometry on the positive side of the plane.
  // We negate the normal so that geometry on the normal side is removed.
  return new THREE.Plane(n.negate(), cp.offset);
};

const ZERO_OFFSET: [number, number, number] = [0, 0, 0];
const IDENTITY_MATRIX = new THREE.Matrix4();

interface ExplodeTreeNode {
  key: string;
  label: string;
  path: string[];
  objectIds: string[];
  children: ExplodeTreeNode[];
  bounds: ExplodeBounds | null;
}

interface MutableExplodeTreeNode {
  key: string;
  label: string;
  path: string[];
  objectIds: string[];
  bounds: ExplodeBounds | null;
  children: MutableExplodeTreeNode[];
  childrenByLabel: Map<string, MutableExplodeTreeNode>;
}

const cleanExplodeTreeSegments = (segments: string[] | undefined): string[] => (
  (segments ?? [])
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
);

const getExplodeTreePath = (object: SceneObject): string[] => {
  const explicitTreePath = cleanExplodeTreeSegments(object.treePath);
  if (explicitTreePath.length > 0) return explicitTreePath;

  const name = object.name.trim() || object.id;
  const groupName = object.groupName?.trim();
  if (!groupName) return [name];

  const groupPath = groupName
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const prefixedLeaf = `${groupName}.`;
  if (name.startsWith(prefixedLeaf)) {
    const leafName = name.slice(prefixedLeaf.length).trim();
    return [...groupPath, leafName || name];
  }
  return [...groupPath, name];
};

const resolveSceneObjectBounds = (object: SceneObject): ExplodeBounds | null => {
  if (object.shape) {
    try {
      const bb = object.shape.boundingBox();
      return {
        min: [bb.min[0], bb.min[1], bb.min[2]],
        max: [bb.max[0], bb.max[1], bb.max[2]],
      };
    } catch {
      return null;
    }
  }

  if (object.sketch) {
    try {
      const bb = object.sketch.bounds();
      const matrix = new THREE.Matrix4().fromArray(getSketchWorldMatrix(object.sketch));
      const corners = [
        new THREE.Vector3(bb.min[0], bb.min[1], 0),
        new THREE.Vector3(bb.min[0], bb.max[1], 0),
        new THREE.Vector3(bb.max[0], bb.min[1], 0),
        new THREE.Vector3(bb.max[0], bb.max[1], 0),
      ].map((corner) => corner.applyMatrix4(matrix));
      const min = [...corners[0].toArray()] as [number, number, number];
      const max = [...corners[0].toArray()] as [number, number, number];
      corners.slice(1).forEach((corner) => {
        min[0] = Math.min(min[0], corner.x);
        min[1] = Math.min(min[1], corner.y);
        min[2] = Math.min(min[2], corner.z);
        max[0] = Math.max(max[0], corner.x);
        max[1] = Math.max(max[1], corner.y);
        max[2] = Math.max(max[2], corner.z);
      });
      return { min, max };
    } catch {
      return null;
    }
  }

  return null;
};

const createMutableExplodeTreeNode = (path: string[]): MutableExplodeTreeNode => ({
  key: path.join('/') || 'root',
  label: path[path.length - 1] ?? 'root',
  path,
  objectIds: [],
  bounds: null,
  children: [],
  childrenByLabel: new Map(),
});

const finalizeExplodeTree = (node: MutableExplodeTreeNode): ExplodeTreeNode => {
  const children = node.children.map((child) => finalizeExplodeTree(child));
  let bounds = node.bounds;
  children.forEach((child) => {
    bounds = explodeMergeBounds(bounds, child.bounds);
  });
  return {
    key: node.key,
    label: node.label,
    path: node.path,
    objectIds: [...node.objectIds],
    children,
    bounds,
  };
};

const buildExplodeTree = (objects: SceneObject[]): ExplodeTreeNode => {
  const root = createMutableExplodeTreeNode([]);

  objects.forEach((object) => {
    const path = getExplodeTreePath(object);
    let node = root;
    path.forEach((segment, index) => {
      let child = node.childrenByLabel.get(segment);
      if (!child) {
        child = createMutableExplodeTreeNode([...node.path, segment]);
        node.childrenByLabel.set(segment, child);
        node.children.push(child);
      }
      node = child;
      if (index === path.length - 1) {
        node.objectIds.push(object.id);
        node.bounds = explodeMergeBounds(node.bounds, resolveSceneObjectBounds(object));
      }
    });
  });

  return finalizeExplodeTree(root);
};

const computeExplodeTreeOffsets = (
  root: ExplodeTreeNode,
  explodeAmount: number,
  explodeConfig: ExplodeViewOptions | null,
): Record<string, [number, number, number]> => {
  if (explodeAmount <= 1e-8) return {};
  const config = createResolvedExplodeConfig({
    amount: explodeAmount * (explodeConfig?.amountScale ?? 1),
    stages: explodeConfig?.stages,
    mode: explodeConfig?.mode,
    axisLock: explodeConfig?.axisLock,
    byName: explodeConfig?.byName,
    byPath: explodeConfig?.byPath,
  });
  if (Math.abs(config.amount) <= 1e-8) return {};

  const rootCenter = explodeBoundsCenter(root.bounds) ?? [0, 0, 0];
  const offsets: Record<string, [number, number, number]> = {};

  const walk = (
    node: ExplodeTreeNode,
    depth: number,
    inherited: [number, number, number],
    parentCenter: [number, number, number],
    parentDirection: [number, number, number] | undefined,
  ) => {
    const center = explodeBoundsCenter(node.bounds) ?? parentCenter;
    const directive = resolveExplodeDirective([node.path.join('/')], node.label, undefined, config);
    const motion = depth > 1 && node.children.length === 0 && !hasExplodeOverride(directive)
      ? (() => {
          const direction = resolveExplodeLocalFanDirection(center, parentCenter, parentDirection, node.key);
          return {
            direction,
            branchDirection: parentDirection ?? direction,
            offset: explodeMul(direction, config.amount * explodeLeafFanStage(config, depth)),
          };
        })()
      : computeExplodeMotion({
          pathKeys: [node.path.join('/')],
          seed: node.key,
          depth,
          center,
          originCenter: parentCenter,
          inheritedDirection: parentDirection,
          name: node.label,
          config,
        });
    const total = explodeAdd(inherited, motion.offset);
    node.objectIds.forEach((objectId) => {
      offsets[objectId] = total;
    });
    node.children.forEach((child) => walk(child, depth + 1, total, center, motion.branchDirection));
  };

  root.children.forEach((child) => walk(child, 1, [0, 0, 0], rootCenter, undefined));
  return offsets;
};

const clampJointValue = (joint: JointViewDef, value: number): number => {
  let clamped = Number.isFinite(value) ? value : joint.defaultValue;
  if (joint.min !== undefined) clamped = Math.max(joint.min, clamped);
  if (joint.max !== undefined) clamped = Math.min(joint.max, clamped);
  return clamped;
};

const resolveVisualArcAngleDeg = (
  valueDeg: number,
  visualLimitDeg: number,
): number => {
  if (!Number.isFinite(valueDeg)) return 0;
  const limit = THREE.MathUtils.clamp(visualLimitDeg, 0, 360);
  if (limit <= 1e-8) return 0;

  // Preserve exact one-turn visuals; wrap only when value goes beyond +/-360.
  if (Math.abs(valueDeg) <= 360) {
    return THREE.MathUtils.clamp(valueDeg, -limit, limit);
  }

  const wrapped = valueDeg % 360;
  return THREE.MathUtils.clamp(wrapped, -limit, limit);
};

const resolveArcReferenceDirection = (axisWorld: THREE.Vector3): THREE.Vector3 => {
  const candidates = [
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
  ];
  for (const candidate of candidates) {
    const projected = candidate.clone().addScaledVector(axisWorld, -candidate.dot(axisWorld));
    if (projected.lengthSq() > 1e-8) return projected.normalize();
  }

  const fallback = new THREE.Vector3(1, 0, 0).cross(axisWorld);
  if (fallback.lengthSq() <= 1e-8) fallback.set(0, 1, 0).cross(axisWorld);
  if (fallback.lengthSq() <= 1e-8) fallback.set(0, 0, 1);
  return fallback.normalize();
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

interface SegmentMeshTransform {
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
}

const resolveSegmentMeshTransform = (
  start: THREE.Vector3,
  end: THREE.Vector3,
): SegmentMeshTransform | null => {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 1e-6) return null;
  direction.multiplyScalar(1 / length);
  return {
    midpoint: start.clone().add(end).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(WORLD_UP, direction),
    length,
  };
};

const computeJointNodeMatrices = (
  joints: JointViewDef[],
  jointValues: Record<string, number>,
): Map<string, THREE.Matrix4> => {
  const byChild = new Map<string, JointViewDef>();
  joints.forEach((joint) => {
    byChild.set(joint.child, joint);
  });

  const cache = new Map<string, THREE.Matrix4>();
  const resolving = new Set<string>();

  const solveNodeMatrix = (nodeName: string): THREE.Matrix4 => {
    const cached = cache.get(nodeName);
    if (cached) return cached.clone();
    if (resolving.has(nodeName)) return new THREE.Matrix4();
    resolving.add(nodeName);

    const joint = byChild.get(nodeName);
    if (!joint) {
      const identity = new THREE.Matrix4();
      cache.set(nodeName, identity);
      resolving.delete(nodeName);
      return identity.clone();
    }

    let parentMatrix = new THREE.Matrix4();
    if (joint.parent) {
      parentMatrix = solveNodeMatrix(joint.parent);
    }

    const axis = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize();
    const axisWorld = axis.clone().transformDirection(parentMatrix);
    if (axisWorld.lengthSq() <= 1e-8) axisWorld.copy(axis);
    axisWorld.normalize();

    const value = clampJointValue(joint, jointValues[joint.name] ?? joint.defaultValue);
    let motion = new THREE.Matrix4();
    if (joint.type === 'prismatic') {
      motion.makeTranslation(axisWorld.x * value, axisWorld.y * value, axisWorld.z * value);
    } else {
      const pivotWorld = new THREE.Vector3(joint.pivot[0], joint.pivot[1], joint.pivot[2]).applyMatrix4(parentMatrix);
      motion = buildRevoluteMatrix(axisWorld, pivotWorld, value);
    }

    const solved = motion.multiply(parentMatrix);
    cache.set(nodeName, solved.clone());
    resolving.delete(nodeName);
    return solved;
  };

  joints.forEach((joint) => {
    solveNodeMatrix(joint.child);
  });

  return cache;
};

const buildRevoluteMatrix = (
  axisWorld: THREE.Vector3,
  pivotWorld: THREE.Vector3,
  angleDeg: number,
): THREE.Matrix4 => {
  const rotation = new THREE.Matrix4().makeRotationAxis(axisWorld, THREE.MathUtils.degToRad(angleDeg));
  const toPivot = new THREE.Matrix4().makeTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z);
  const fromPivot = new THREE.Matrix4().makeTranslation(-pivotWorld.x, -pivotWorld.y, -pivotWorld.z);
  return toPivot.multiply(rotation).multiply(fromPivot);
};

const expandBoundsByTransformedAabb = (
  target: THREE.Box3,
  min: [number, number, number],
  max: [number, number, number],
  matrix: THREE.Matrix4,
): void => {
  const corners: [number, number, number][] = [
    [min[0], min[1], min[2]],
    [min[0], min[1], max[2]],
    [min[0], max[1], min[2]],
    [min[0], max[1], max[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]],
  ];
  corners.forEach((corner) => {
    target.expandByPoint(new THREE.Vector3(corner[0], corner[1], corner[2]).applyMatrix4(matrix));
  });
};

/** Enable local clipping on the WebGL renderer when any cut planes are active */
function ClippingManager({ active }: { active: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.localClippingEnabled = active;
  }, [gl, active]);
  return null;
}

/** Labeled axes helper — draws X/Y/Z arrows with text labels */
function LabeledAxes({ size = 50 }: { size?: number }) {
  const axesRef = useRef<THREE.AxesHelper>(null);

  useEffect(() => {
    if (!axesRef.current) return;
    // Render axes on top of everything so they're always visible at origin
    axesRef.current.renderOrder = 999;
    axesRef.current.material = (axesRef.current.material as THREE.Material[]).length
      ? (axesRef.current.material as THREE.Material[]).map((m) => {
          m.depthTest = false;
          return m;
        })
      : (() => { (axesRef.current!.material as THREE.Material).depthTest = false; return axesRef.current!.material; })();
  }, []);

  const labelStyle = (color: string): React.CSSProperties => ({
    color,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'monospace',
    userSelect: 'none',
    pointerEvents: 'none',
    textShadow: '0 0 3px #000, 0 0 6px #000',
  });
  return (
    <group>
      <axesHelper ref={axesRef} args={[size]} />
      <Html position={[size + 3, 0, 0]} center style={labelStyle('#ff4444')}>X</Html>
      <Html position={[0, size + 3, 0]} center style={labelStyle('#44ff44')}>Y</Html>
      <Html position={[0, 0, size + 3]} center style={labelStyle('#4488ff')}>Z</Html>
    </group>
  );
}

/** Local studio lights for PBR reflections without remote HDR fetches. */
function LocalStudioEnvironment() {
  return (
    <Environment resolution={128}>
      <Lightformer
        form="rect"
        intensity={4}
        color="#ffffff"
        rotation-x={Math.PI / 2}
        position={[0, 40, 0]}
        scale={[120, 120, 1]}
      />
      <Lightformer
        form="rect"
        intensity={3}
        color="#f8fbff"
        rotation-y={Math.PI / 2}
        position={[40, 10, 20]}
        scale={[80, 80, 1]}
      />
      <Lightformer
        form="rect"
        intensity={2}
        color="#f4f6ff"
        rotation-y={-Math.PI / 2}
        position={[-35, -8, 16]}
        scale={[70, 60, 1]}
      />
      <Lightformer
        form="ring"
        intensity={1.25}
        color="#dbe8ff"
        rotation-x={Math.PI / 2}
        position={[0, -20, 0]}
        scale={[35, 35, 1]}
      />
    </Environment>
  );
}

function PerformanceInfoSampler({
  enabled,
  modelTriangles,
  sceneObjects,
  reactRenderCountRef,
  onStatsChange,
}: {
  enabled: boolean;
  modelTriangles: number;
  sceneObjects: number;
  reactRenderCountRef: React.MutableRefObject<number>;
  onStatsChange: (stats: ViewportPerformanceInfo | null) => void;
}) {
  const gl = useThree((s) => s.gl);
  const sampleRef = useRef({
    frames: 0,
    elapsedSec: 0,
    frameTimeMsTotal: 0,
    sinceEmitSec: 0,
    reactRenderCountAtLastEmit: 0,
  });

  useEffect(() => {
    sampleRef.current = {
      frames: 0,
      elapsedSec: 0,
      frameTimeMsTotal: 0,
      sinceEmitSec: 0,
      reactRenderCountAtLastEmit: reactRenderCountRef.current,
    };
    if (!enabled) onStatsChange(null);
  }, [enabled, modelTriangles, onStatsChange, reactRenderCountRef, sceneObjects]);

  useFrame((_state, delta) => {
    if (!enabled) return;

    const sample = sampleRef.current;
    sample.frames += 1;
    sample.elapsedSec += delta;
    sample.frameTimeMsTotal += delta * 1000;
    sample.sinceEmitSec += delta;

    if (sample.sinceEmitSec < PERFORMANCE_SAMPLE_INTERVAL_SEC) return;

    const frameCount = Math.max(1, sample.frames);
    const reactRendersDelta = reactRenderCountRef.current - sample.reactRenderCountAtLastEmit;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    onStatsChange({
      fps: frameCount / Math.max(sample.elapsedSec, 1e-6),
      frameTimeMs: sample.frameTimeMsTotal / frameCount,
      sceneObjects,
      modelTriangles,
      drawCalls: gl.info.render.calls,
      renderTriangles: gl.info.render.triangles,
      renderLines: gl.info.render.lines,
      renderPoints: gl.info.render.points,
      memoryGeometries: gl.info.memory.geometries,
      memoryTextures: gl.info.memory.textures,
      programCount: getProgramCount(gl),
      jsHeapMB: mem ? mem.usedJSHeapSize / (1024 * 1024) : null,
      jsHeapLimitMB: mem ? mem.jsHeapSizeLimit / (1024 * 1024) : null,
      reactRendersPerSec: reactRendersDelta / Math.max(sample.sinceEmitSec, 1e-6),
    });

    sample.frames = 0;
    sample.elapsedSec = 0;
    sample.frameTimeMsTotal = 0;
    sample.sinceEmitSec = 0;
    sample.reactRenderCountAtLastEmit = reactRenderCountRef.current;
  });

  return null;
}

function PerformanceInfoPanel({
  enabled,
  stats,
}: {
  enabled: boolean;
  stats: ViewportPerformanceInfo | null;
}) {
  if (!enabled) return null;

  const rows = stats
    ? [
      ['FPS', stats.fps.toFixed(1)],
      ['Frame ms', stats.frameTimeMs.toFixed(1)],
      ['React renders/s', stats.reactRendersPerSec.toFixed(1)],
      null,
      ['Objects', formatPerformanceCount(stats.sceneObjects)],
      ['Model tris', formatPerformanceCount(stats.modelTriangles)],
      ['Drawn tris', formatPerformanceCount(stats.renderTriangles)],
      ['Draw calls', formatPerformanceCount(stats.drawCalls)],
      ['Lines', formatPerformanceCount(stats.renderLines)],
      ['Points', formatPerformanceCount(stats.renderPoints)],
      null,
      ['Geometries', formatPerformanceCount(stats.memoryGeometries)],
      ['Textures', formatPerformanceCount(stats.memoryTextures)],
      ['Programs', formatPerformanceCount(stats.programCount)],
      ...(stats.jsHeapMB !== null
        ? [
          null,
          ['JS heap', `${stats.jsHeapMB.toFixed(1)} MB`],
          ['Heap limit', `${stats.jsHeapLimitMB!.toFixed(0)} MB`],
        ]
        : []),
    ]
    : null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        minWidth: 180,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--fc-border)',
        background: 'var(--fc-bgPanel)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22)',
        color: 'var(--fc-text)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.45,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          marginBottom: 6,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: 'var(--fc-textDim)',
        }}
      >
        Performance
      </div>
      {!rows && (
        <div style={{ color: 'var(--fc-textDim)' }}>Measuring...</div>
      )}
      {rows?.map((row, i) =>
        row === null
          ? <div key={`sep-${i}`} style={{ height: 4 }} />
          : (
            <div
              key={row[0]}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span style={{ color: 'var(--fc-textDim)' }}>{row[0]}</span>
              <span>{row[1]}</span>
            </div>
          )
      )}
    </div>
  );
}

/**
 * Renders the solid body with proper CAD-style shading.
 *
 * The key insight for CAD rendering vs game rendering:
 * - CAD needs FLAT shading on planar faces (each triangle keeps its own normal)
 * - CAD needs visible edges to show topology
 * - Games use smooth shading everywhere — that's what makes a box look "blobby"
 *
 * computeVertexNormals() averages normals at shared vertices, which smooths
 * the box corners. For CAD we need non-indexed geometry so each face has
 * independent flat normals.
 */
function ForgeObject({
  obj,
  settings,
  renderMode,
  isInteracting,
  matrix,
  isHovered,
  cutPlanes,
  clippingPlanes,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onClick,
  onDoubleClick,
  onContextMenu,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  renderMode: RenderMode;
  isInteracting?: boolean;
  matrix: THREE.Matrix4;
  isHovered?: boolean;
  cutPlanes?: CutPlaneDef[];
  clippingPlanes?: THREE.Plane[];
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
  onContextMenu?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const hasCutPlanes = (cutPlanes?.length ?? 0) > 0;
  const clippingTransformKey = hasCutPlanes ? matrix : null;
  const { solidGeo, edgesGeo, cutSurfaces, useFallbackClipping } = useMemo(() => {
    if (!obj.shape) {
      return {
        solidGeo: null,
        edgesGeo: null,
        cutSurfaces: [] as CutSurfaceDef[],
        useFallbackClipping: false,
      };
    }
    let shapeForRender = obj.shape;
    const nextCutSurfaces: CutSurfaceDef[] = [];
    let fallbackToGpuClip = false;

    if (hasCutPlanes) {
      try {
        // Cut planes are defined in world space, so convert each plane into this object's
        // local coordinates before sectioning to keep everything aligned with animated transforms.
        const inverseMatrix = matrix.clone().invert();
        const surfaceLift = resolveSectionSurfaceLift(obj.shape);
        cutPlanes?.forEach((cutPlaneDef, planeIndex) => {
          const worldNormal = new THREE.Vector3(
            cutPlaneDef.normal[0],
            cutPlaneDef.normal[1],
            cutPlaneDef.normal[2],
          );
          if (worldNormal.lengthSq() <= 1e-8) return;
          worldNormal.normalize();

          const worldPlane = new THREE.Plane(worldNormal, -cutPlaneDef.offset);
          const localPlane = worldPlane.clone().applyMatrix4(inverseMatrix);
          const normalLength = localPlane.normal.length();
          if (!Number.isFinite(normalLength) || normalLength <= 1e-8) return;

          const invNormalLength = 1 / normalLength;
          const localNormal: [number, number, number] = [
            localPlane.normal.x * invNormalLength,
            localPlane.normal.y * invNormalLength,
            localPlane.normal.z * invNormalLength,
          ];
          const localOffset = -localPlane.constant * invNormalLength;
          const [insideShape, outsideShape] = shapeForRender.splitByPlane(localNormal, localOffset);
          shapeForRender = insideShape;

          if (!outsideShape.isEmpty()) {
            try {
              const sectionSketch = intersectWithPlane(outsideShape, {
                origin: [
                  localNormal[0] * localOffset,
                  localNormal[1] * localOffset,
                  localNormal[2] * localOffset,
                ],
                normal: localNormal,
              });
              const polygons = sectionSketch.toPolygons();
              const geometry = buildFilledGeometryFromPolygons(polygons);
              const transform = resolvePlaneTransform(localNormal, localOffset, surfaceLift);
              if (geometry && transform) {
                const outlineGeometry = buildOutlineGeometryFromPolygons(polygons);
                const hatch = resolveSectionHatchMetrics(geometry);
                const angleSeed = hashString(`${obj.name}:${cutPlaneDef.name}:${planeIndex}`);
                nextCutSurfaces.push({
                  id: `${cutPlaneDef.name}:${planeIndex}`,
                  geometry,
                  outlineGeometry,
                  sourcePlaneIndex: planeIndex,
                  position: transform.center,
                  quaternion: transform.quaternion,
                  hatchAngleRad: THREE.MathUtils.degToRad(35 + (angleSeed % 2) * 55),
                  hatchSpacing: hatch.spacing,
                  hatchLineWidth: hatch.lineWidth,
                });
              } else {
                geometry?.dispose();
              }
            } catch {
              // Ignore cap-only failures; keep the solid trim result if it succeeded.
            }
          }
        });
      } catch {
        // If boolean trimming fails on pathological geometry, fall back to GPU clipping.
        nextCutSurfaces.forEach((surface) => {
          surface.geometry.dispose();
          surface.outlineGeometry?.dispose();
        });
        shapeForRender = obj.shape;
        fallbackToGpuClip = true;
      }
    }

    try {
      const { solid, edges } = shapeToGeometry(shapeForRender);
      return {
        solidGeo: solid,
        edgesGeo: edges,
        cutSurfaces: fallbackToGpuClip ? [] : nextCutSurfaces,
        useFallbackClipping: fallbackToGpuClip,
      };
    } catch {
      if (!fallbackToGpuClip && hasCutPlanes) {
        try {
          const { solid, edges } = shapeToGeometry(obj.shape);
          nextCutSurfaces.forEach((surface) => {
            surface.geometry.dispose();
            surface.outlineGeometry?.dispose();
          });
          return {
            solidGeo: solid,
            edgesGeo: edges,
            cutSurfaces: [] as CutSurfaceDef[],
            useFallbackClipping: true,
          };
        } catch {
          nextCutSurfaces.forEach((surface) => {
            surface.geometry.dispose();
            surface.outlineGeometry?.dispose();
          });
          return {
            solidGeo: null,
            edgesGeo: null,
            cutSurfaces: [] as CutSurfaceDef[],
            useFallbackClipping: false,
          };
        }
      }
      nextCutSurfaces.forEach((surface) => {
        surface.geometry.dispose();
        surface.outlineGeometry?.dispose();
      });
      return {
        solidGeo: null,
        edgesGeo: null,
        cutSurfaces: [] as CutSurfaceDef[],
        useFallbackClipping: false,
      };
    }
  }, [clippingTransformKey, cutPlanes, hasCutPlanes, obj.name, obj.shape]);

  useEffect(() => {
    return () => {
      solidGeo?.dispose();
      edgesGeo?.dispose();
      cutSurfaces.forEach((surface) => {
        surface.geometry.dispose();
        surface.outlineGeometry?.dispose();
      });
    };
  }, [cutSurfaces, edgesGeo, solidGeo]);

  if (!solidGeo || !settings.visible) return null;

  const effectiveRenderMode = isInteracting && renderMode === 'overlay' ? 'solid' : renderMode;
  const meshOpacity = settings.opacity;
  const showSolid = effectiveRenderMode !== 'wireframe';
  const showEdges = effectiveRenderMode === 'overlay';
  const showWire = effectiveRenderMode === 'wireframe';
  const fallbackSolidClippingPlanes = useFallbackClipping ? (clippingPlanes ?? []) : [];

  return (
    <group
      matrixAutoUpdate={false}
      matrix={matrix}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {showSolid && (
        <mesh geometry={solidGeo}>
          <meshPhysicalMaterial
            color={settings.color}
            metalness={0.05}
            roughness={0.35}
            clearcoat={0.1}
            clearcoatRoughness={0.4}
            flatShading
            side={THREE.DoubleSide}
            transparent={meshOpacity < 1}
            opacity={meshOpacity}
            emissive={isHovered ? settings.color : '#000000'}
            emissiveIntensity={isHovered ? 0.3 : 0}
            clippingPlanes={fallbackSolidClippingPlanes}
          />
        </mesh>
      )}
      {showSolid && cutSurfaces.map((surface) => (
        <SectionCutSurface
          key={surface.id}
          surface={surface}
          color={settings.color}
          opacity={meshOpacity}
          clippingPlanes={clippingPlanes ?? []}
        />
      ))}
      {showWire && edgesGeo && (
        // raycast disabled: edge lines are visual only; line raycasting at oblique angles
        // can report a smaller t-value than the frontmost solid mesh, causing wrong hover picks.
        <lineSegments geometry={edgesGeo} raycast={() => null}>
          <lineBasicMaterial color={settings.color} transparent={meshOpacity < 1} opacity={meshOpacity} clippingPlanes={fallbackSolidClippingPlanes} />
        </lineSegments>
      )}
      {showEdges && edgesGeo && (
        <lineSegments geometry={edgesGeo} raycast={() => null}>
          <lineBasicMaterial color="#1a1a2e" linewidth={1} transparent opacity={Math.min(1, meshOpacity + 0.1)} clippingPlanes={fallbackSolidClippingPlanes} />
        </lineSegments>
      )}
    </group>
  );
}

interface SectionPlaneGuideStyle {
  showFill: boolean;
  fillOpacity: number;
  showBorder: boolean;
  showAxis: boolean;
}

const colorFromName = (name: string | undefined | null): string => {
  const hue = hashString(name || 'default') % 360;
  return `hsl(${hue}, 72%, 58%)`;
};

function SectionCutSurface({
  surface,
  color,
  opacity,
  clippingPlanes,
}: {
  surface: CutSurfaceDef;
  color: string;
  opacity: number;
  clippingPlanes: THREE.Plane[];
}) {
  const sectionClippingPlanes = useMemo(
    () => clippingPlanes.filter((_, index) => index !== surface.sourcePlaneIndex),
    [clippingPlanes, surface.sourcePlaneIndex],
  );
  const material = useMemo(() => {
    const baseColor = parseExportColor(color, 0x5b9bd5).lerp(new THREE.Color('#ffffff'), 0.2);
    const lineColor = parseExportColor(color, 0x5b9bd5).lerp(new THREE.Color('#101010'), 0.55);
    const direction = new THREE.Vector2(Math.cos(surface.hatchAngleRad), Math.sin(surface.hatchAngleRad));
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      clippingPlanes: sectionClippingPlanes,
      toneMapped: false,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.hatchBaseColor = { value: baseColor };
      shader.uniforms.hatchLineColor = { value: lineColor };
      shader.uniforms.hatchDirection = { value: direction };
      shader.uniforms.hatchSpacing = { value: surface.hatchSpacing };
      shader.uniforms.hatchLineWidth = { value: surface.hatchLineWidth };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vSectionPlanePosition;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvSectionPlanePosition = position.xy;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec2 vSectionPlanePosition;
uniform vec3 hatchBaseColor;
uniform vec3 hatchLineColor;
uniform vec2 hatchDirection;
uniform float hatchSpacing;
uniform float hatchLineWidth;`,
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `float planeCoord = dot(vSectionPlanePosition, hatchDirection);
float stripeDistance = abs(fract(planeCoord / hatchSpacing + 0.5) - 0.5) * hatchSpacing;
float aa = max(fwidth(planeCoord), 1e-4);
float lineMask = 1.0 - smoothstep(hatchLineWidth - aa, hatchLineWidth + aa, stripeDistance);
vec3 sectionColor = mix(hatchBaseColor, hatchLineColor, lineMask);
vec4 diffuseColor = vec4(sectionColor, opacity);`,
        );
    };
    mat.customProgramCacheKey = () => (
      `section-hatch:${baseColor.getHexString()}:${lineColor.getHexString()}:`
      + `${surface.hatchSpacing.toFixed(3)}:${surface.hatchLineWidth.toFixed(3)}:${surface.hatchAngleRad.toFixed(3)}`
    );
    return mat;
  }, [color, opacity, sectionClippingPlanes, surface.hatchAngleRad, surface.hatchLineWidth, surface.hatchSpacing]);
  const outlineColor = useMemo(
    () => parseExportColor(color, 0x5b9bd5).lerp(new THREE.Color('#050505'), 0.68),
    [color],
  );

  useEffect(() => () => material.dispose(), [material]);

  return (
    <group
      position={[surface.position.x, surface.position.y, surface.position.z]}
      quaternion={surface.quaternion}
    >
      <mesh geometry={surface.geometry} renderOrder={24}>
        <primitive object={material} attach="material" />
      </mesh>
      {surface.outlineGeometry && (
        <lineSegments geometry={surface.outlineGeometry} renderOrder={25}>
          <lineBasicMaterial
            color={outlineColor}
            transparent={opacity < 1}
            opacity={Math.min(1, opacity + 0.18)}
            depthWrite={false}
            clippingPlanes={sectionClippingPlanes}
            toneMapped={false}
          />
        </lineSegments>
      )}
    </group>
  );
}

function SectionPlaneGuide({
  def,
  sectionSize,
  style,
}: {
  def: CutPlaneDef;
  sectionSize: number;
  style: SectionPlaneGuideStyle;
}) {
  const transform = useMemo(
    () => resolvePlaneTransform(def.normal, def.offset),
    [def.normal, def.offset],
  );

  const borderGeometry = useMemo(() => {
    const half = sectionSize / 2;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
    ]);
  }, [sectionSize]);

  const guideColor = useMemo(() => colorFromName(def.name), [def.name]);
  const axisLength = Math.max(8, sectionSize * 0.2);
  const axisRadius = Math.max(0.2, sectionSize * 0.0045);
  const coneRadius = Math.max(0.45, sectionSize * 0.008);
  const coneHeight = Math.max(1.8, sectionSize * 0.03);

  if (!transform) return null;

  return (
    <group position={[transform.center.x, transform.center.y, transform.center.z]} quaternion={transform.quaternion}>
      {style.showFill && (
        <mesh userData={{ measureHelper: true }} renderOrder={20}>
          <planeGeometry args={[sectionSize, sectionSize]} />
          <meshBasicMaterial
            color={guideColor}
            transparent
            opacity={style.fillOpacity}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {style.showBorder && (
        <lineLoop geometry={borderGeometry} renderOrder={21}>
          <lineBasicMaterial color={guideColor} transparent opacity={0.9} depthTest={false} />
        </lineLoop>
      )}
      {style.showAxis && (
        <group renderOrder={22}>
          <mesh userData={{ measureHelper: true }} position={[0, 0, axisLength * 0.5]}>
            <cylinderGeometry args={[axisRadius, axisRadius, axisLength, 12]} />
            <meshBasicMaterial color={guideColor} depthTest={false} />
          </mesh>
          <mesh userData={{ measureHelper: true }} position={[0, 0, axisLength + coneHeight * 0.5]}>
            <coneGeometry args={[coneRadius, coneHeight, 14]} />
            <meshBasicMaterial color={guideColor} depthTest={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function SectionPlaneGuides({
  cutPlanes,
  sectionSize,
  style,
}: {
  cutPlanes: CutPlaneDef[];
  sectionSize: number;
  style: SectionPlaneGuideStyle;
}) {
  if (cutPlanes.length === 0 || sectionSize <= 0) return null;

  return (
    <group>
      {cutPlanes.map((def) => (
        <SectionPlaneGuide key={def.name} def={def} sectionSize={sectionSize} style={style} />
      ))}
    </group>
  );
}

interface HoveredJointOverlayState {
  joint: JointViewDef;
  value: number;
  pivotWorld: THREE.Vector3;
  axisWorld: THREE.Vector3;
  axisLength: number;
}

function HoveredJointOverlay({
  state,
  config,
}: {
  state: HoveredJointOverlayState;
  config: JointOverlayViewConfig;
}) {
  const axisStart = useMemo(
    () => state.pivotWorld.clone().addScaledVector(state.axisWorld, -state.axisLength * 0.5),
    [state.axisLength, state.axisWorld, state.pivotWorld],
  );
  const axisEnd = useMemo(
    () => state.pivotWorld.clone().addScaledVector(state.axisWorld, state.axisLength * 0.5),
    [state.axisLength, state.axisWorld, state.pivotWorld],
  );
  const axisSegment = useMemo(
    () => resolveSegmentMeshTransform(axisStart, axisEnd),
    [axisEnd, axisStart],
  );
  const isRevolute = state.joint.type === 'revolute';
  const visualArcAngleDeg = useMemo(
    () => resolveVisualArcAngleDeg(state.value, config.arcVisualLimitDeg),
    [config.arcVisualLimitDeg, state.value],
  );
  const arcAngleRad = useMemo(() => THREE.MathUtils.degToRad(visualArcAngleDeg), [visualArcAngleDeg]);

  const axisLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.axisLineRadiusScale,
    config.axisLineRadiusMin,
    config.axisLineRadiusMax,
  );
  const spokeLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.spokeLineRadiusScale,
    config.spokeLineRadiusMin,
    config.spokeLineRadiusMax,
  );
  const arcLineRadius = THREE.MathUtils.clamp(
    state.axisLength * config.arcLineRadiusScale,
    config.arcLineRadiusMin,
    config.arcLineRadiusMax,
  );
  const axisDotRadius = Math.max(config.axisDotRadiusMin, state.axisLength * config.axisDotRadiusScale);
  const axisArrowRadius = Math.max(config.axisArrowRadiusMin, state.axisLength * config.axisArrowRadiusScale);
  const axisArrowLength = Math.max(config.axisArrowLengthMin, state.axisLength * config.axisArrowLengthScale);
  const arrowPosition = useMemo(
    () => axisEnd.clone().addScaledVector(state.axisWorld, axisArrowLength * config.axisArrowOffsetFactor),
    [axisArrowLength, axisEnd, config.axisArrowOffsetFactor, state.axisWorld],
  );
  const arrowQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), state.axisWorld),
    [state.axisWorld],
  );

  const arcRadius = Math.max(config.arcRadiusMin, state.axisLength * config.arcRadiusScale);
  const arcDotRadius = Math.max(config.arcDotRadiusMin, state.axisLength * config.arcDotRadiusScale);
  const arcStartDirection = useMemo(
    () => resolveArcReferenceDirection(state.axisWorld),
    [state.axisWorld],
  );
  const arcStartPoint = useMemo(
    () => state.pivotWorld.clone().addScaledVector(arcStartDirection, arcRadius),
    [arcRadius, arcStartDirection, state.pivotWorld],
  );
  const arcEndDirection = useMemo(
    () => arcStartDirection.clone().applyAxisAngle(state.axisWorld, arcAngleRad),
    [arcAngleRad, arcStartDirection, state.axisWorld],
  );
  const arcEndPoint = useMemo(
    () => state.pivotWorld.clone().addScaledVector(arcEndDirection, arcRadius),
    [arcEndDirection, arcRadius, state.pivotWorld],
  );
  const arcStartArmSegment = useMemo(
    () => resolveSegmentMeshTransform(state.pivotWorld, arcStartPoint),
    [arcStartPoint, state.pivotWorld],
  );
  const arcCurrentArmSegment = useMemo(
    () => resolveSegmentMeshTransform(state.pivotWorld, arcEndPoint),
    [arcEndPoint, state.pivotWorld],
  );
  const arcCurvePoints = useMemo(() => {
    if (!isRevolute || Math.abs(arcAngleRad) <= 1e-4) return null;
    const steps = Math.max(config.arcMinSteps, Math.ceil(Math.abs(visualArcAngleDeg) / config.arcStepDeg));
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const theta = arcAngleRad * (i / steps);
      const direction = arcStartDirection.clone().applyAxisAngle(state.axisWorld, theta);
      points.push(state.pivotWorld.clone().addScaledVector(direction, arcRadius));
    }
    return points;
  }, [
    arcAngleRad,
    config.arcMinSteps,
    config.arcStepDeg,
    arcRadius,
    arcStartDirection,
    visualArcAngleDeg,
    isRevolute,
    state.axisWorld,
    state.pivotWorld,
  ]);
  const arcTubeGeometry = useMemo(() => {
    if (!arcCurvePoints || arcCurvePoints.length < 2) return null;
    const segments = Math.max(config.arcTubeSegmentsMin, Math.ceil(arcCurvePoints.length * config.arcTubeSegmentsFactor));
    const curve = new THREE.CatmullRomCurve3(arcCurvePoints, false, 'centripetal');
    return new THREE.TubeGeometry(curve, segments, arcLineRadius, config.arcTubeRadialSegments, false);
  }, [arcCurvePoints, arcLineRadius, config.arcTubeRadialSegments, config.arcTubeSegmentsFactor, config.arcTubeSegmentsMin]);
  const arcArrowLength = Math.max(config.arcArrowLengthMin, state.axisLength * config.arcArrowLengthScale);
  const arcArrowRadius = Math.max(config.arcArrowRadiusMin, state.axisLength * config.arcArrowRadiusScale);
  const arcTangent = useMemo(() => {
    if (!isRevolute || Math.abs(arcAngleRad) <= 1e-4) return null;
    const tangent = state.axisWorld.clone().cross(arcEndDirection);
    if (tangent.lengthSq() <= 1e-8) return null;
    tangent.normalize();
    if (arcAngleRad < 0) tangent.multiplyScalar(-1);
    return tangent;
  }, [arcAngleRad, arcEndDirection, isRevolute, state.axisWorld]);
  const arcArrowPosition = useMemo(() => {
    if (!arcTangent || !arcCurvePoints) return null;
    return arcEndPoint.clone().addScaledVector(arcTangent, arcArrowLength * config.arcArrowOffsetFactor);
  }, [arcArrowLength, arcCurvePoints, arcEndPoint, arcTangent, config.arcArrowOffsetFactor]);
  const arcArrowQuaternion = useMemo(() => {
    if (!arcTangent || !arcCurvePoints) return null;
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), arcTangent);
  }, [arcCurvePoints, arcTangent]);

  useEffect(() => () => {
    arcTubeGeometry?.dispose();
  }, [arcTubeGeometry]);

  return (
    <group>
      {axisSegment && (
        <mesh
          position={[axisSegment.midpoint.x, axisSegment.midpoint.y, axisSegment.midpoint.z]}
          quaternion={axisSegment.quaternion}
          renderOrder={95}
          userData={{ measureHelper: true }}
        >
          <cylinderGeometry args={[axisLineRadius, axisLineRadius, axisSegment.length, 18]} />
          <meshBasicMaterial color={config.axisColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
        </mesh>
      )}
      <mesh
        position={[state.pivotWorld.x, state.pivotWorld.y, state.pivotWorld.z]}
        renderOrder={96}
        userData={{ measureHelper: true }}
      >
        <sphereGeometry args={[axisDotRadius, 18, 18]} />
        <meshBasicMaterial color={config.axisCoreColor} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh
        position={[arrowPosition.x, arrowPosition.y, arrowPosition.z]}
        quaternion={arrowQuaternion}
        renderOrder={96}
        userData={{ measureHelper: true }}
      >
        <coneGeometry args={[axisArrowRadius, axisArrowLength, 18]} />
        <meshBasicMaterial color={config.axisColor} depthTest={false} toneMapped={false} />
      </mesh>
      {isRevolute && (
        <>
          {arcStartArmSegment && (
            <mesh
              position={[arcStartArmSegment.midpoint.x, arcStartArmSegment.midpoint.y, arcStartArmSegment.midpoint.z]}
              quaternion={arcStartArmSegment.quaternion}
              renderOrder={97}
              userData={{ measureHelper: true }}
            >
              <cylinderGeometry args={[spokeLineRadius, spokeLineRadius, arcStartArmSegment.length, 14]} />
              <meshBasicMaterial color={config.zeroColor} depthTest={false} transparent opacity={0.95} toneMapped={false} />
            </mesh>
          )}
          {arcCurrentArmSegment && (
            <mesh
              position={[arcCurrentArmSegment.midpoint.x, arcCurrentArmSegment.midpoint.y, arcCurrentArmSegment.midpoint.z]}
              quaternion={arcCurrentArmSegment.quaternion}
              renderOrder={97}
              userData={{ measureHelper: true }}
            >
              <cylinderGeometry args={[spokeLineRadius, spokeLineRadius, arcCurrentArmSegment.length, 14]} />
              <meshBasicMaterial color={config.arcColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
            </mesh>
          )}
          {arcTubeGeometry && (
            <mesh geometry={arcTubeGeometry} renderOrder={98} userData={{ measureHelper: true }}>
              <meshBasicMaterial color={config.arcColor} depthTest={false} transparent opacity={0.98} toneMapped={false} />
            </mesh>
          )}
          <mesh
            position={[arcStartPoint.x, arcStartPoint.y, arcStartPoint.z]}
            renderOrder={98}
            userData={{ measureHelper: true }}
          >
            <sphereGeometry args={[arcDotRadius, 14, 14]} />
            <meshBasicMaterial color={config.zeroColor} depthTest={false} toneMapped={false} />
          </mesh>
          <mesh
            position={[arcEndPoint.x, arcEndPoint.y, arcEndPoint.z]}
            renderOrder={98}
            userData={{ measureHelper: true }}
          >
            <sphereGeometry args={[arcDotRadius, 14, 14]} />
            <meshBasicMaterial color={config.arcColor} depthTest={false} toneMapped={false} />
          </mesh>
          {arcArrowPosition && arcArrowQuaternion && (
            <mesh
              position={[arcArrowPosition.x, arcArrowPosition.y, arcArrowPosition.z]}
              quaternion={arcArrowQuaternion}
              renderOrder={99}
              userData={{ measureHelper: true }}
            >
              <coneGeometry args={[arcArrowRadius, arcArrowLength, 14]} />
              <meshBasicMaterial color={config.arcColor} depthTest={false} toneMapped={false} />
            </mesh>
          )}
        </>
      )}

    </group>
  );
}

/** Renders a 2D sketch as filled shape + outline on the XY plane */
const formatConstraintValue = (value: number): string => {
  if (Number.isNaN(value)) return '';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
  return rounded.replace(/\\.00$/, '');
};

function SketchObject({
  obj,
  settings,
  renderMode,
  matrix,
  isSketchMode,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onClick,
  onDoubleClick,
  onContextMenu,
  onEntityClick,
  onVertexHover,
}: {
  obj: SceneObject;
  settings: ObjectSettings;
  renderMode: RenderMode;
  matrix: THREE.Matrix4;
  isSketchMode?: boolean;
  onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
  onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
  onContextMenu?: (event: ThreeEvent<MouseEvent>) => void;
  onEntityClick?: (entity: SketchHoveredEntity, clientX: number, clientY: number) => void;
  onVertexHover?: (pointId: string, event: ThreeEvent<PointerEvent>) => void;
}) {
  const sketchTheme = useForgeStore((s) => themes[s.theme]);
  const [hoveredEntity, setHoveredEntity] = useState<SketchHoveredEntity | null>(null);
  const [hoveredSurfIdx, setHoveredSurfIdx] = useState<number | null>(null);
  const worldThresholdRef = useRef(5);
  const selectedConstraintId = useForgeStore((s) => s.selectedConstraintId);
  const setSelectedConstraintId = useForgeStore((s) => s.setSelectedConstraintId);
  const selectedSurfaceIndex = useForgeStore((s) => s.selectedSurfaceIndex);
  const setSelectedSurfaceIndex = useForgeStore((s) => s.setSelectedSurfaceIndex);
  const setHoveredSurfaceIndex = useForgeStore((s) => s.setHoveredSurfaceIndex);
  const selectedSketchEntityId = useForgeStore((s) => s.selectedSketchEntityId);
  const setSelectedSketchEntityId = useForgeStore((s) => s.setSelectedSketchEntityId);

  useFrame(({ camera, size }) => {
    if (!isSketchMode) return;
    const ortho = camera as THREE.OrthographicCamera;
    if (!ortho.isOrthographicCamera) return;
    const worldH = (ortho.top - ortho.bottom) / Math.max(1e-6, ortho.zoom);
    worldThresholdRef.current = (worldH / Math.max(1, size.height)) * 10;
  });
  const { fillGeo, lineGeos, pointGeos } = useMemo(() => {
    if (!obj.sketch) return { fillGeo: null, lineGeos: [] as THREE.BufferGeometry[], pointGeos: [] as THREE.BufferGeometry[] };
    try {
      const polys = obj.sketch.toPolygons();
      const lines: THREE.BufferGeometry[] = [];
      const points: THREE.BufferGeometry[] = [];

      for (const contour of polys) {
        if (contour.length === 1) {
          const pt = new THREE.Vector3(contour[0][0], contour[0][1], 0);
          points.push(new THREE.BufferGeometry().setFromPoints([pt]));
        } else if (contour.length >= 2) {
          const pts = contour.map((p: number[]) => new THREE.Vector3(p[0], p[1], 0));
          pts.push(pts[0]);
          lines.push(new THREE.BufferGeometry().setFromPoints(pts));
        }
      }

      const shapes: THREE.Shape[] = [];
      for (const contour of polys) {
        if (contour.length < 3) continue;
        const shape = new THREE.Shape();
        shape.moveTo(contour[0][0], contour[0][1]);
        for (let i = 1; i < contour.length; i++) {
          shape.lineTo(contour[i][0], contour[i][1]);
        }
        shape.closePath();
        shapes.push(shape);
      }
      const fill = shapes.length > 0 ? new THREE.ShapeGeometry(shapes) : null;

      return { fillGeo: fill, lineGeos: lines, pointGeos: points };
    } catch {
      return { fillGeo: null, lineGeos: [] as THREE.BufferGeometry[], pointGeos: [] as THREE.BufferGeometry[] };
    }
  }, [obj.sketch]);

  // Global status color — used for fill and polygon outlines (sketch geometry without entity IDs).
  const constraintStatusColor = obj.sketchMeta?.status === 'over'
    ? sketchTheme.sketchOverConstrained
    : obj.sketchMeta?.status === 'fully'
      ? sketchTheme.sketchFullyConstrained
      : obj.sketchMeta?.status === 'under'
        ? sketchTheme.sketchUnderConstrained
        : settings.color;

  // Per-entity color map: entity ID → worst constraint status color.
  // Only problematic edges get colored; normal edges stay neutral.
  const entityColorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!obj.sketchMeta) return map;
    for (const c of obj.sketchMeta.constraints) {
      const color = c.isConflicting ? sketchTheme.sketchConflicting : c.isRedundant ? sketchTheme.sketchRedundant : null;
      if (!color) continue;
      for (const eid of c.entityIds) {
        const existing = map.get(eid);
        // conflicting takes priority over redundant
        if (!existing || (color === sketchTheme.sketchConflicting && existing !== sketchTheme.sketchConflicting)) {
          map.set(eid, color);
        }
      }
    }
    return map;
  }, [obj.sketchMeta, sketchTheme]);

  const lengthUnit = useForgeStore((s) => s.lengthUnit);

  // ─── Annotation-based constraint rendering ───
  // Symbol map: ConstraintSymbol → display character for Html overlays.
  const symbolChars: Record<string, string> = {
    parallel: '∥', equal: '=', perpendicular: '⊥', horizontal: 'H', vertical: 'V',
    fixed: '⚓', midpoint: '◆', coincident: '⊙', collinear: '·', tangent: 'T',
    concentric: '◎', ccw: '↺', symmetric: '⟷',
  };

  type AnnotationLabel = {
    key: string; text: string; position: [number, number, number];
    constraintId: string; isConflicting: boolean; isRedundant: boolean; entityIds: string[];
    fontSize?: number;
  };
  type AnnotationLine = { key: string; points: [number, number, number][]; color: string; opacity?: number; lineWidth?: number };
  type AnnotationTriangle = { key: string; points: [number, number][]; color: string };
  type AnnotationArc = { key: string; points: [number, number, number][]; color: string };

  /** Convert a dimension annotation value (mm string) to the user's preferred unit. */
  const convertDimValue = (raw: string): string => {
    // Extract leading prefix like "⌀" or "R" and numeric part
    const match = raw.match(/^([⌀R]?)(.+)$/);
    if (!match) return raw;
    const [, prefix, numStr] = match;
    const num = Number(numStr);
    if (isNaN(num)) return raw;
    const converted = convertFromMm(num, lengthUnit);
    return `${prefix}${formatConstraintValue(converted)} ${lengthUnit}`;
  };

  const constraintAnnotations = useMemo(() => {
    const labels: AnnotationLabel[] = [];
    const lines: AnnotationLine[] = [];
    const triangles: AnnotationTriangle[] = [];
    const arcs: AnnotationArc[] = [];

    if (!obj.sketchMeta) return { labels, lines, triangles, arcs };

    for (const c of obj.sketchMeta.constraints) {
      const color = c.isConflicting ? sketchTheme.sketchConflicting : c.isRedundant ? sketchTheme.sketchRedundant : sketchTheme.sketchConstraint;
      let annIdx = 0;
      for (const ann of c.annotations) {
        const k = `${c.id}-${annIdx++}`;
        if (ann.kind === 'symbol') {
          labels.push({
            key: k, text: symbolChars[ann.symbol] ?? ann.symbol,
            position: [ann.position[0], ann.position[1], 0.1],
            constraintId: c.id, isConflicting: c.isConflicting, isRedundant: c.isRedundant,
            entityIds: c.entityIds, fontSize: 9,
          });
        } else if (ann.kind === 'dimension') {
          // Extension lines (from → dimension line, to → dimension line)
          const dx = ann.to[0] - ann.from[0], dy = ann.to[1] - ann.from[1];
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const nx = -dy / len * ann.offset, ny = dx / len * ann.offset;
          const f: [number, number] = [ann.from[0] + nx, ann.from[1] + ny];
          const t: [number, number] = [ann.to[0] + nx, ann.to[1] + ny];
          // Extension lines
          lines.push({ key: `${k}-ext1`, points: [[ann.from[0], ann.from[1], 0.08], [f[0], f[1], 0.08]], color, opacity: 0.5 });
          lines.push({ key: `${k}-ext2`, points: [[ann.to[0], ann.to[1], 0.08], [t[0], t[1], 0.08]], color, opacity: 0.5 });
          // Dimension line
          lines.push({ key: `${k}-dim`, points: [[f[0], f[1], 0.08], [t[0], t[1], 0.08]], color });
          // Arrowheads
          const adx = t[0] - f[0], ady = t[1] - f[1];
          const alen = Math.sqrt(adx * adx + ady * ady) || 1;
          const ux = adx / alen, uy = ady / alen;
          const arrowLen = Math.min(0.8, alen * 0.15);
          const arrowW = arrowLen * 0.35;
          triangles.push({ key: `${k}-arr1`, points: [f, [f[0] + ux * arrowLen + uy * arrowW, f[1] + uy * arrowLen - ux * arrowW], [f[0] + ux * arrowLen - uy * arrowW, f[1] + uy * arrowLen + ux * arrowW]], color });
          triangles.push({ key: `${k}-arr2`, points: [t, [t[0] - ux * arrowLen + uy * arrowW, t[1] - uy * arrowLen - ux * arrowW], [t[0] - ux * arrowLen - uy * arrowW, t[1] - uy * arrowLen + ux * arrowW]], color });
          // Value label at midpoint of dimension line — convert from mm to user unit
          const mx = (f[0] + t[0]) / 2, my = (f[1] + t[1]) / 2;
          labels.push({
            key: `${k}-val`, text: convertDimValue(ann.value),
            position: [mx, my, 0.12],
            constraintId: c.id, isConflicting: c.isConflicting, isRedundant: c.isRedundant,
            entityIds: c.entityIds, fontSize: 10,
          });
        } else if (ann.kind === 'angle-arc') {
          // Arc geometry
          const segs = 32;
          const pts: [number, number, number][] = [];
          for (let i = 0; i <= segs; i++) {
            const a = ann.startAngle + (ann.endAngle - ann.startAngle) * (i / segs);
            const rad = a * Math.PI / 180;
            pts.push([ann.center[0] + Math.cos(rad) * ann.radius, ann.center[1] + Math.sin(rad) * ann.radius, 0.08]);
          }
          arcs.push({ key: `${k}-arc`, points: pts, color });
          // Value label at arc midpoint
          const midA = ((ann.startAngle + ann.endAngle) / 2) * Math.PI / 180;
          const labelR = ann.radius * 1.3;
          labels.push({
            key: `${k}-val`, text: `${ann.value}°`,
            position: [ann.center[0] + Math.cos(midA) * labelR, ann.center[1] + Math.sin(midA) * labelR, 0.12],
            constraintId: c.id, isConflicting: c.isConflicting, isRedundant: c.isRedundant,
            entityIds: c.entityIds, fontSize: 9,
          });
        } else if (ann.kind === 'text') {
          labels.push({
            key: k, text: ann.text,
            position: [ann.position[0], ann.position[1], 0.1],
            constraintId: c.id, isConflicting: c.isConflicting, isRedundant: c.isRedundant,
            entityIds: c.entityIds,
          });
        }
      }
    }
    return { labels, lines, triangles, arcs };
  }, [obj.sketchMeta, sketchTheme, lengthUnit]);

  // Entity IDs referenced by the selected constraint — used for highlight rendering.
  const highlightedEntityIds = useMemo(() => {
    if (!selectedConstraintId || !obj.sketchMeta) return new Set<string>();
    const constraint = obj.sketchMeta.constraints.find((c) => c.id === selectedConstraintId);
    if (!constraint) return new Set<string>();
    return new Set(constraint.entityIds);
  }, [selectedConstraintId, obj.sketchMeta]);

  // Surface region fill geometries from arrangement detection.
  const surfaceFills = useMemo(() => {
    const surfaces = obj.sketchMeta?.surfaces;
    if (!surfaces || surfaces.length === 0) return [];
    const palette = [0x4488cc, 0x44cc88, 0xcc8844, 0xcc44aa, 0x88cc44, 0x44aacc, 0xaa44cc, 0xcccc44];
    return surfaces.map((s) => {
      const shape = new THREE.Shape();
      shape.moveTo(s.polygon[0][0], s.polygon[0][1]);
      for (let i = 1; i < s.polygon.length; i++) {
        shape.lineTo(s.polygon[i][0], s.polygon[i][1]);
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      return { index: s.index, geo, color: palette[s.index % palette.length], area: s.area };
    });
  }, [obj.sketchMeta]);

  const edgeLines = useMemo(() => {
    const meta = obj.sketchMeta?.edges;
    if (!meta) return {
      lines: [] as { id: string; geo: THREE.BufferGeometry }[],
      circles: [] as { id: string; geo: THREE.BufferGeometry }[],
      points: [] as { id: string; pos: [number, number] }[],
    };
    const lines = meta.lines.map((line) => ({
      id: line.id,
      geo: new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(line.a[0], line.a[1], 0.01),
        new THREE.Vector3(line.b[0], line.b[1], 0.01),
      ]),
    }));
    const segments = 64;
    const circles = meta.circles.map((circle) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          circle.center[0] + Math.cos(angle) * circle.radius,
          circle.center[1] + Math.sin(angle) * circle.radius,
          0.01,
        ));
      }
      return { id: circle.id, geo: new THREE.BufferGeometry().setFromPoints(pts) };
    });
    return { lines, circles, points: meta.points };
  }, [obj.sketchMeta]);

  const constructionLines = useMemo(() => {
    const meta = obj.sketchMeta?.construction;
    if (!meta) return [] as THREE.Line[];
    return meta.lines.map((line) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(line.a[0], line.a[1], 0),
        new THREE.Vector3(line.b[0], line.b[1], 0),
      ]);
      const mat = new THREE.LineDashedMaterial({ color: sketchTheme.sketchConstruction, dashSize: 2, gapSize: 1, transparent: true, opacity: 0.6 });
      const dashed = new THREE.Line(geo, mat);
      dashed.computeLineDistances();
      return dashed;
    });
  }, [obj.sketchMeta, sketchTheme]);

  const constructionCircles = useMemo(() => {
    const meta = obj.sketchMeta?.construction;
    if (!meta) return [] as THREE.Line[];
    const segments = 64;
    return meta.circles.map((circle) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(
          circle.center[0] + Math.cos(angle) * circle.radius,
          circle.center[1] + Math.sin(angle) * circle.radius,
          0,
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({ color: sketchTheme.sketchConstruction, dashSize: 2, gapSize: 1, transparent: true, opacity: 0.6 });
      const dashed = new THREE.Line(geo, mat);
      dashed.computeLineDistances();
      return dashed;
    });
  }, [obj.sketchMeta, sketchTheme]);

  // Bounding box covering all sketch geometry — used as a transparent hit plane so
  // pointer events fire even when the cursor is over edges/vertices outside the fill.
  const hitPlaneBounds = useMemo(() => {
    let minX = Infinity; let maxX = -Infinity;
    let minY = Infinity; let maxY = -Infinity;
    const expand = (x: number, y: number) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    for (const edge of edgeLines.lines) {
      const pos = edge.geo.attributes.position;
      if (pos) {
        for (let i = 0; i < pos.count; i++) expand(pos.getX(i), pos.getY(i));
      }
    }
    for (const pt of edgeLines.points) { expand(pt.pos[0], pt.pos[1]); }
    if (!isFinite(minX)) return null;
    const pad = 5;
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      w: Math.max(maxX - minX + pad * 2, pad * 2),
      h: Math.max(maxY - minY + pad * 2, pad * 2),
    };
  }, [edgeLines]);

  // Inverted matrix for transforming world-space hit points to sketch-local 2D coords.
  const matrixInverse = useMemo(() => new THREE.Matrix4().copy(matrix).invert(), [matrix]);

  // Intercept pointer move to detect vertex proximity and call onVertexHover when close.
  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    onPointerMove?.(event);
    if (!onVertexHover || edgeLines.points.length === 0) return;
    const localPt = event.point.clone().applyMatrix4(matrixInverse);
    const THRESH = 5;
    let nearest: { id: string; dist: number } | null = null;
    for (const pt of edgeLines.points) {
      const d = Math.hypot(localPt.x - pt.pos[0], localPt.y - pt.pos[1]);
      if (d < THRESH && (!nearest || d < nearest.dist)) nearest = { id: pt.id, dist: d };
    }
    if (nearest) onVertexHover(nearest.id, event);
  }, [edgeLines.points, matrixInverse, onPointerMove, onVertexHover]);

  if (!settings.visible) return null;

  const showFill = renderMode !== 'wireframe';

  return (
    <group
      matrixAutoUpdate={false}
      matrix={matrix}
      onPointerEnter={onPointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={(event) => { setHoveredEntity(null); setHoveredSurfIdx(null); setHoveredSurfaceIndex(null); onPointerLeave?.(event); }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {fillGeo && showFill && (
        <mesh
          geometry={fillGeo}
          onPointerMove={isSketchMode && obj.sketchMeta ? (e) => {
            const entity = findNearestSketchEntity(e.point.x, e.point.y, obj.sketchMeta!, worldThresholdRef.current);
            setHoveredEntity(entity);
            // Surface detection — only when no entity is near
            const surfIdx = !entity ? findHoveredSurface(e.point.x, e.point.y, obj.sketchMeta!) : null;
            setHoveredSurfIdx(surfIdx);
            setHoveredSurfaceIndex(surfIdx);
          } : undefined}
          onClick={isSketchMode && obj.sketchMeta ? (e) => {
            const entity = findNearestSketchEntity(e.point.x, e.point.y, obj.sketchMeta!, worldThresholdRef.current);
            if (entity) {
              setSelectedSketchEntityId(entity.id);
              onEntityClick?.(entity, e.clientX, e.clientY);
            } else {
              // Check for surface click
              const surfIdx = findHoveredSurface(e.point.x, e.point.y, obj.sketchMeta!);
              if (surfIdx !== null) {
                setSelectedSurfaceIndex(surfIdx);
                setSelectedSketchEntityId(null);
              }
            }
          } : undefined}
        >
          <meshBasicMaterial color={constraintStatusColor} transparent opacity={Math.min(0.6, settings.opacity)} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Surface region fills from arrangement detection */}
      {surfaceFills.length > 0 && surfaceFills.map((sf) => {
        const isHovered = hoveredSurfIdx === sf.index;
        const isSelected = selectedSurfaceIndex === sf.index;
        const opacity = isSelected ? 0.45 : isHovered ? 0.35 : 0.15;
        return (
          <mesh key={`sf-${sf.index}`} geometry={sf.geo} position={[0, 0, -0.01]} raycast={() => null}>
            <meshBasicMaterial color={sf.color} transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        );
      })}
      {/* Transparent hit plane for detecting hovers near edges when no fill is present */}
      {isSketchMode && obj.sketchMeta && !fillGeo && (
        <mesh
          position={[0, 0, -0.5]}
          onPointerMove={(e) => {
            const entity = findNearestSketchEntity(e.point.x, e.point.y, obj.sketchMeta!, worldThresholdRef.current);
            setHoveredEntity(entity);
            const surfIdx = !entity ? findHoveredSurface(e.point.x, e.point.y, obj.sketchMeta!) : null;
            setHoveredSurfIdx(surfIdx);
            setHoveredSurfaceIndex(surfIdx);
          }}
          onClick={(e) => {
            const entity = findNearestSketchEntity(e.point.x, e.point.y, obj.sketchMeta!, worldThresholdRef.current);
            if (entity) {
              setSelectedSketchEntityId(entity.id);
              onEntityClick?.(entity, e.clientX, e.clientY);
            } else {
              const surfIdx = findHoveredSurface(e.point.x, e.point.y, obj.sketchMeta!);
              if (surfIdx !== null) {
                setSelectedSurfaceIndex(surfIdx);
                setSelectedSketchEntityId(null);
              }
            }
          }}
        >
          <planeGeometry args={[2000, 2000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {lineGeos.map((geo, i) => (
        <primitive
          key={i}
          object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: constraintStatusColor, linewidth: 1, transparent: true, opacity: settings.opacity }))}
          raycast={() => null}
        />
      ))}
      {pointGeos.map((geo, i) => (
        <primitive
          key={`pt-${i}`}
          object={new THREE.Points(geo, new THREE.PointsMaterial({ color: constraintStatusColor, size: 5 }))}
          raycast={() => null}
        />
      ))}
      {edgeLines.lines.map((edge) => {
        const isEntitySelected = selectedSketchEntityId === edge.id;
        const isEntityHovered = hoveredEntity?.id === edge.id;
        const color = isEntitySelected ? '#4aa3ff' : isEntityHovered ? '#7ec8ff' : entityColorMap.get(edge.id) ?? sketchTheme.sketchEdge;
        return (
          <primitive
            key={`el-${edge.id}`}
            object={new THREE.Line(edge.geo, new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: settings.opacity }))}
            raycast={() => null}
          />
        );
      })}
      {edgeLines.circles.map((edge) => {
        const isEntitySelected = selectedSketchEntityId === edge.id;
        const isEntityHovered = hoveredEntity?.id === edge.id;
        const color = isEntitySelected ? '#4aa3ff' : isEntityHovered ? '#7ec8ff' : entityColorMap.get(edge.id) ?? sketchTheme.sketchEdge;
        return (
          <primitive
            key={`ec-${edge.id}`}
            object={new THREE.Line(edge.geo, new THREE.LineBasicMaterial({ color, linewidth: 2, transparent: true, opacity: settings.opacity }))}
            raycast={() => null}
          />
        );
      })}
      {edgeLines.points.map((pt) => {
        const isEntitySelected = selectedSketchEntityId === pt.id;
        const isEntityHovered = hoveredEntity?.id === pt.id;
        const bg = isEntitySelected ? '#4aa3ff' : isEntityHovered ? '#7ec8ff' : entityColorMap.get(pt.id) ?? sketchTheme.sketchPoint;
        const size = isEntitySelected || isEntityHovered ? 8 : 5;
        return (
          <Html
            key={`ep-${pt.id}`}
            position={[pt.pos[0], pt.pos[1], 0.05]}
            center
            zIndexRange={[0, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              width: size,
              height: size,
              borderRadius: '50%',
              background: bg,
              boxShadow: isEntitySelected ? '0 0 6px #4aa3ff' : '0 0 2px #000',
              transition: 'all 0.1s',
            }} />
          </Html>
        );
      })}
      {hitPlaneBounds && (
        <mesh position={[hitPlaneBounds.cx, hitPlaneBounds.cy, -0.02]}>
          <planeGeometry args={[hitPlaneBounds.w, hitPlaneBounds.h]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {constructionLines.map((line, i) => (
        <primitive key={`cl-${i}`} object={line} raycast={() => null} />
      ))}
      {constructionCircles.map((circle, i) => (
        <primitive key={`cc-${i}`} object={circle} raycast={() => null} />
      ))}
      {/* Annotation geometry: dimension lines, arrowheads, angle arcs */}
      {constraintAnnotations.lines.map((line) => {
        const geo = new THREE.BufferGeometry().setFromPoints(
          line.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
        );
        return (
          <primitive key={line.key} object={new THREE.Line(geo,
            new THREE.LineBasicMaterial({ color: line.color, transparent: true, opacity: line.opacity ?? 1, depthWrite: false })
          )} raycast={() => null} />
        );
      })}
      {constraintAnnotations.arcs.map((arc) => {
        const geo = new THREE.BufferGeometry().setFromPoints(
          arc.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
        );
        return (
          <primitive key={arc.key} object={new THREE.Line(geo,
            new THREE.LineBasicMaterial({ color: arc.color, depthWrite: false })
          )} raycast={() => null} />
        );
      })}
      {constraintAnnotations.triangles.map((tri) => {
        const shape = new THREE.Shape();
        shape.moveTo(tri.points[0][0], tri.points[0][1]);
        shape.lineTo(tri.points[1][0], tri.points[1][1]);
        shape.lineTo(tri.points[2][0], tri.points[2][1]);
        shape.closePath();
        const geo = new THREE.ShapeGeometry(shape);
        return (
          <mesh key={tri.key} position={[0, 0, 0.08]}>
            <primitive object={geo} attach="geometry" />
            <meshBasicMaterial color={tri.color} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      {/* Surface centroid labels — only shown for hovered/selected to avoid clutter */}
      {isSketchMode && obj.sketchMeta?.surfaces.map((s) => {
        const isHovered = hoveredSurfIdx === s.index;
        const isSelected = selectedSurfaceIndex === s.index;
        if (!isHovered && !isSelected) return null;
        const palette = ['#4488cc', '#44cc88', '#cc8844', '#cc44aa', '#88cc44', '#44aacc', '#aa44cc', '#cccc44'];
        const color = palette[s.index % palette.length];
        return (
          <Html
            key={`sl-${s.index}`}
            position={[s.centroid[0], s.centroid[1], 0.08]}
            center
            zIndexRange={[0, 0]}
            style={{ pointerEvents: 'auto' }}
          >
            <span
              onClick={(e) => { e.stopPropagation(); setSelectedSurfaceIndex(s.index); }}
              style={{
                fontSize: 10,
                fontFamily: 'system-ui, sans-serif',
                fontWeight: 600,
                color: '#fff',
                background: isSelected ? color : `${color}88`,
                borderRadius: 3,
                padding: '1px 4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                textShadow: '0 0 2px #000',
                border: isSelected ? `1px solid ${color}` : '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              S{s.index} {s.area.toFixed(0)}mm²
            </span>
          </Html>
        );
      })}
      {/* Entity hover tooltip */}
      {hoveredEntity && isSketchMode && (() => {
        let label = '';
        if (hoveredEntity.kind === 'line') {
          const len = Math.hypot(hoveredEntity.b[0] - hoveredEntity.a[0], hoveredEntity.b[1] - hoveredEntity.a[1]);
          label = `${hoveredEntity.id} — ${len.toFixed(1)}mm`;
        } else if (hoveredEntity.kind === 'circle') {
          label = `${hoveredEntity.id} — r=${hoveredEntity.radius.toFixed(1)}mm`;
        } else if (hoveredEntity.kind === 'arc') {
          label = `${hoveredEntity.id} — r=${hoveredEntity.radius.toFixed(1)}mm`;
        } else {
          label = hoveredEntity.id;
        }
        const pos: [number, number] = hoveredEntity.kind === 'point'
          ? hoveredEntity.position
          : hoveredEntity.kind === 'line'
            ? [(hoveredEntity.a[0] + hoveredEntity.b[0]) / 2, (hoveredEntity.a[1] + hoveredEntity.b[1]) / 2]
            : [hoveredEntity.center[0], hoveredEntity.center[1]];
        return (
          <Html
            position={[pos[0], pos[1], 0.12]}
            center
            zIndexRange={[0, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              fontSize: 10,
              fontFamily: 'system-ui, sans-serif',
              fontWeight: 500,
              color: '#fff',
              background: 'rgba(30,30,30,0.9)',
              borderRadius: 4,
              padding: '2px 6px',
              whiteSpace: 'nowrap',
              border: '1px solid rgba(74,163,255,0.5)',
              transform: 'translateY(-14px)',
            }}>
              {label}
            </div>
          </Html>
        );
      })()}
      {/* Annotation labels: symbols, dimension values, angle values, fallback text */}
      {constraintAnnotations.labels.map((lbl) => (
        <Html
          key={lbl.key}
          position={lbl.position}
          center
          zIndexRange={[0, 0]}
          style={{ pointerEvents: 'auto' }}
        >
          <span
            onClick={(e) => { e.stopPropagation(); setSelectedConstraintId(lbl.constraintId); }}
            style={{
              fontSize: lbl.fontSize ?? 10,
              fontFamily: 'system-ui, sans-serif',
              fontWeight: 600,
              color: selectedConstraintId === lbl.constraintId ? sketchTheme.sketchSelected
                : lbl.isConflicting ? sketchTheme.sketchConflicting : lbl.isRedundant ? sketchTheme.sketchRedundant : 'var(--fc-text)',
              textShadow: `0 0 3px var(--fc-viewportBg), 0 0 3px var(--fc-viewportBg)`,
              whiteSpace: 'nowrap',
              userSelect: 'none',
              cursor: 'pointer',
              background: selectedConstraintId === lbl.constraintId ? `${sketchTheme.sketchSelected}33` : 'transparent',
              borderRadius: 3,
              padding: '1px 3px',
            }}>
            {lbl.text}
          </span>
        </Html>
      ))}
      {hoveredEntity && isSketchMode && (() => {
        const z = 0.05;
        if (hoveredEntity.kind === 'line') {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(hoveredEntity.a[0], hoveredEntity.a[1], z),
            new THREE.Vector3(hoveredEntity.b[0], hoveredEntity.b[1], z),
          ]);
          return <primitive object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: sketchTheme.sketchSelected }))} raycast={() => null} />;
        }
        if (hoveredEntity.kind === 'circle') {
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(hoveredEntity.center[0] + Math.cos(a) * hoveredEntity.radius, hoveredEntity.center[1] + Math.sin(a) * hoveredEntity.radius, z));
          }
          return <primitive object={new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: sketchTheme.sketchSelected }))} raycast={() => null} />;
        }
        if (hoveredEntity.kind === 'arc') {
          const sa = Math.atan2(hoveredEntity.start[1] - hoveredEntity.center[1], hoveredEntity.start[0] - hoveredEntity.center[0]);
          const ea = Math.atan2(hoveredEntity.end[1] - hoveredEntity.center[1], hoveredEntity.end[0] - hoveredEntity.center[0]);
          let span = ea - sa;
          if (hoveredEntity.clockwise && span > 0) span -= Math.PI * 2;
          if (!hoveredEntity.clockwise && span < 0) span += Math.PI * 2;
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 64; i++) {
            const a = sa + (span * i) / 64;
            pts.push(new THREE.Vector3(hoveredEntity.center[0] + Math.cos(a) * hoveredEntity.radius, hoveredEntity.center[1] + Math.sin(a) * hoveredEntity.radius, z));
          }
          return <primitive object={new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: sketchTheme.sketchSelected }))} raycast={() => null} />;
        }
        if (hoveredEntity.kind === 'point') {
          const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(hoveredEntity.position[0], hoveredEntity.position[1], z)]);
          return <primitive object={new THREE.Points(geo, new THREE.PointsMaterial({ color: sketchTheme.sketchSelected, size: 12 }))} raycast={() => null} />;
        }
        return null;
      })()}
      {highlightedEntityIds.size > 0 && (() => {
        const z = 0.06;
        const highlightColor = sketchTheme.sketchSelected;
        const elements: React.ReactNode[] = [];
        const meta = obj.sketchMeta;
        if (!meta) return null;
        // Highlight matching edge lines
        for (const line of meta.edges.lines) {
          if (!highlightedEntityIds.has(line.id)) continue;
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(line.a[0], line.a[1], z),
            new THREE.Vector3(line.b[0], line.b[1], z),
          ]);
          elements.push(<primitive key={`hl-ln-${line.id}`} object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: highlightColor, linewidth: 2 }))} raycast={() => null} />);
        }
        // Highlight matching construction lines
        for (const line of meta.construction.lines) {
          if (!highlightedEntityIds.has(line.id)) continue;
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(line.a[0], line.a[1], z),
            new THREE.Vector3(line.b[0], line.b[1], z),
          ]);
          elements.push(<primitive key={`hl-cl-${line.id}`} object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: highlightColor, linewidth: 2 }))} raycast={() => null} />);
        }
        // Highlight matching edge circles
        for (const circle of meta.edges.circles) {
          if (!highlightedEntityIds.has(circle.id)) continue;
          const pts: THREE.Vector3[] = [];
          for (let i = 0; i <= 64; i++) {
            const a = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(circle.center[0] + Math.cos(a) * circle.radius, circle.center[1] + Math.sin(a) * circle.radius, z));
          }
          elements.push(<primitive key={`hl-ci-${circle.id}`} object={new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: highlightColor }))} raycast={() => null} />);
        }
        // Highlight matching edge points
        for (const pt of meta.edges.points) {
          if (!highlightedEntityIds.has(pt.id)) continue;
          const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(pt.pos[0], pt.pos[1], z)]);
          elements.push(<primitive key={`hl-pt-${pt.id}`} object={new THREE.Points(geo, new THREE.PointsMaterial({ color: highlightColor, size: 14 }))} raycast={() => null} />);
        }
        return <>{elements}</>;
      })()}
    </group>
  );
}

/** Renders a single dimension annotation — Fusion360-style with extension lines, arrows, and label */
function DimensionAnnotation({ def, lengthUnit: dimUnit }: { def: DimensionDef; lengthUnit: LengthUnit }) {
  const from = useMemo(() => new THREE.Vector3(...def.from), [def.from]);
  const to = useMemo(() => new THREE.Vector3(...def.to), [def.to]);
  const color = def.color ?? '#e0e0e0';
  const labelSpriteRef = useRef<THREE.Sprite>(null);
  const arrowStartRef = useRef<THREE.Mesh>(null);
  const arrowEndRef = useRef<THREE.Mesh>(null);

  // Stable perpendicular offset (camera-independent).
  // Convention: positive offset pushes "outward" (−Y for X/Z lines, −X for Y lines).
  const { dimStart, dimEnd, mid, dist } = useMemo(() => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 1e-6) return { dimStart: from, dimEnd: to, mid: from, dist: 0 };
    const dirN = dir.clone().normalize();
    const ax = Math.abs(dirN.x), ay = Math.abs(dirN.y), az = Math.abs(dirN.z);

    // Pick a perpendicular axis that pushes "outward" for typical geometry at origin:
    // X-aligned → −Y, Y-aligned → −X, Z-aligned → −Y, diagonal → cross with Z then fallback
    let perp: THREE.Vector3;
    if (az > ax && az > ay) {
      // Mostly Z-aligned → offset in −Y
      perp = new THREE.Vector3(0, -1, 0);
    } else if (ay > ax) {
      // Mostly Y-aligned → offset in −X
      perp = new THREE.Vector3(-1, 0, 0);
    } else {
      // Mostly X-aligned → offset in −Y
      perp = new THREE.Vector3(0, -1, 0);
    }
    perp.multiplyScalar(def.offset);

    const dS = from.clone().add(perp);
    const dE = to.clone().add(perp);
    return { dimStart: dS, dimEnd: dE, mid: dS.clone().add(dE).multiplyScalar(0.5), dist: len };
  }, [from, to, def.offset]);

  const label = def.label ? `${def.label}: ${formatLength(dist, dimUnit, 1)}` : formatLength(dist, dimUnit, 1);

  // Extension lines with gap near geometry and overshoot past dimension line
  const extDir = useMemo(() => dimStart.clone().sub(from).normalize(), [dimStart, from]);
  const extGap = Math.max(Math.abs(def.offset) * 0.15, 0.8);
  const extOver = Math.max(Math.abs(def.offset) * 0.15, 0.8);
  const extAGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    from.clone().add(extDir.clone().multiplyScalar(extGap)),
    dimStart.clone().add(extDir.clone().multiplyScalar(extOver)),
  ]), [from, dimStart, extDir, extGap, extOver]);
  const extBGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    to.clone().add(extDir.clone().multiplyScalar(extGap)),
    dimEnd.clone().add(extDir.clone().multiplyScalar(extOver)),
  ]), [to, dimEnd, extDir, extGap, extOver]);
  const dimLineGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([dimStart, dimEnd]), [dimStart, dimEnd]);

  const dimDir = useMemo(() => dimEnd.clone().sub(dimStart).normalize(), [dimStart, dimEnd]);
  const labelTextureData = useMemo(() => {
    const fontPx = 36;
    const padX = 28;
    const logicalHeight = 80;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3);

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d')!;
    measureCtx.font = `bold ${fontPx}px -apple-system, "Segoe UI", sans-serif`;
    const textWidth = measureCtx.measureText(label).width;
    const logicalWidth = THREE.MathUtils.clamp(Math.ceil(textWidth + padX * 2), 220, 720);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(logicalWidth * dpr));
    canvas.height = Math.max(1, Math.round(logicalHeight * dpr));
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    ctx.fillStyle = '#1a1a1acc';
    ctx.beginPath();
    ctx.roundRect(8, 8, logicalWidth - 16, logicalHeight - 16, 12);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = `bold ${fontPx}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, logicalWidth / 2, logicalHeight / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return {
      texture,
      aspect: logicalWidth / logicalHeight,
    };
  }, [label, color]);

  useEffect(() => {
    return () => {
      labelTextureData.texture.dispose();
    };
  }, [labelTextureData]);

  useFrame(({ camera, size }) => {
    if (dist < 1e-6 || size.height <= 0) return;

    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    const worldUnitsPerPixel = isOrtho
      ? (
          (((camera as THREE.OrthographicCamera).top - (camera as THREE.OrthographicCamera).bottom)
            / Math.max(1e-6, (camera as THREE.OrthographicCamera).zoom))
          / size.height
        )
      : (
          (2
            * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov * 0.5))
            * camera.position.distanceTo(mid))
          / (size.height * Math.max(1e-6, (camera as THREE.PerspectiveCamera).zoom))
        );

    // Camera-aware on-screen sizing: stable across tiny/huge models and zoom levels.
    const labelHeightPx = 28;
    const labelWidthPx = labelHeightPx * labelTextureData.aspect;
    labelSpriteRef.current?.scale.set(
      labelWidthPx * worldUnitsPerPixel,
      labelHeightPx * worldUnitsPerPixel,
      1,
    );

    const arrowHeightPx = 12;
    const desiredArrowHeight = arrowHeightPx * worldUnitsPerPixel;
    const maxArrowHeight = Math.max(dist * 0.3, worldUnitsPerPixel * 2);
    const arrowHeight = Math.min(desiredArrowHeight, maxArrowHeight);
    arrowStartRef.current?.scale.set(arrowHeight, arrowHeight, arrowHeight);
    arrowEndRef.current?.scale.set(arrowHeight, arrowHeight, arrowHeight);
  });

  if (dist < 1e-6) return null;

  return (
    <group>
      <lineSegments geometry={extAGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.4} />
      </lineSegments>
      <lineSegments geometry={extBGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.4} />
      </lineSegments>
      <lineSegments geometry={dimLineGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.8} />
      </lineSegments>
      <mesh ref={arrowStartRef} position={dimStart} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dimDir)}>
        <coneGeometry args={[0.5, 1, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={arrowEndRef} position={dimEnd} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dimDir.clone().negate())}>
        <coneGeometry args={[0.5, 1, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <sprite ref={labelSpriteRef} position={mid}>
        <spriteMaterial map={labelTextureData.texture} depthTest={false} transparent />
      </sprite>
    </group>
  );
}

/** Measurement tool — click faces, edges, or vertices to measure */
type PointerLike = { clientX: number; clientY: number };

const MEASURE_COLORS = {
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
const vertKey = (pos: THREE.BufferAttribute, i: number) =>
  `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`;
const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;

interface FloodFillResult {
  triangleIndices: number[];
  normal: THREE.Vector3;
  center: THREE.Vector3;
  area: number;
}

function floodFillFace(
  geometry: THREE.BufferGeometry,
  startTriIndex: number,
  normalTolerance = 0.9995,
): FloodFillResult {
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
      if (!list) { list = []; edgeToTris.set(ek, list); }
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
    const triCenter = tmpA.clone().add(tmpB).add(tmpC).multiplyScalar(1 / 3);
    centroid.add(triCenter.multiplyScalar(triArea));
  }
  if (totalArea > 0) centroid.multiplyScalar(1 / totalArea);

  return { triangleIndices: indices, normal: startNormal.clone(), center: centroid, area: totalArea };
}

// ─── Build a highlight geometry from selected triangle indices ───

function buildFaceHighlightGeometry(
  sourceGeometry: THREE.BufferGeometry,
  triangleIndices: number[],
): THREE.BufferGeometry {
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
      const i1 = base + (e + 1) % 3;
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
      if (!list) { list = []; vertToEdges.set(vk, list); }
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
  let minT = Infinity, maxT = -Infinity;
  let startPt = closestEdge.a.clone(), endPt = closestEdge.b.clone();
  const origin = closestEdge.a;

  for (const [a, b] of segments) {
    for (const pt of [a, b]) {
      const t = pt.clone().sub(origin).dot(dir);
      if (t < minT) { minT = t; startPt = pt.clone(); }
      if (t > maxT) { maxT = t; endPt = pt.clone(); }
    }
  }

  return {
    start: startPt.applyMatrix4(mesh.matrixWorld),
    end: endPt.applyMatrix4(mesh.matrixWorld),
    segments,
  };
}

// ─── Measurement computation between two entities ───

interface MeasureResultData {
  type: string;
  distance?: number;
  angle?: number;
  deltaX?: number;
  deltaY?: number;
  deltaZ?: number;
  projectedDistance?: number;
}

function computeMeasureResult(
  a: MeasureEntity,
  b: MeasureEntity,
): MeasureResultData {
  const v3 = (xyz: [number, number, number]) => new THREE.Vector3(...xyz);

  if (a.kind === 'vertex' && b.kind === 'vertex') {
    const pa = v3(a.position), pb = v3(b.position);
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
    const nA = v3(a.normal), nB = v3(b.normal);
    const dot = Math.abs(nA.dot(nB));
    const angle = Math.acos(THREE.MathUtils.clamp(dot, 0, 1)) * (180 / Math.PI);

    if (dot > 0.9995) {
      // Parallel faces — compute distance between planes
      const cA = v3(a.center), cB = v3(b.center);
      const dist = Math.abs(cB.clone().sub(cA).dot(nA));
      return { type: 'Parallel Faces', distance: dist, angle: 0 };
    }
    // Non-parallel: show angle
    return { type: 'Face to Face', angle };
  }

  if (a.kind === 'edge' && b.kind === 'edge') {
    const dA = v3(a.direction), dB = v3(b.direction);
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
    const vertex = a.kind === 'vertex' ? a : b as MeasureVertexEntity;
    const face = a.kind === 'face' ? a : b as MeasureFaceEntity;
    const pt = v3(vertex.position);
    const center = v3(face.center);
    const normal = v3(face.normal);
    const perpDist = Math.abs(pt.clone().sub(center).dot(normal));
    const totalDist = pt.distanceTo(center);
    return { type: 'Point to Face', distance: perpDist, projectedDistance: totalDist };
  }

  // Mixed: vertex-edge
  if ((a.kind === 'vertex' && b.kind === 'edge') || (a.kind === 'edge' && b.kind === 'vertex')) {
    const vertex = a.kind === 'vertex' ? a : b as MeasureVertexEntity;
    const edge = a.kind === 'edge' ? a : b as MeasureEdgeEntity;
    const pt = v3(vertex.position);
    const eStart = v3(edge.start), eEnd = v3(edge.end);
    const ab = eEnd.clone().sub(eStart);
    const denom = ab.lengthSq();
    const t = denom > 0 ? THREE.MathUtils.clamp(pt.clone().sub(eStart).dot(ab) / denom, 0, 1) : 0;
    const closest = eStart.clone().add(ab.multiplyScalar(t));
    return { type: 'Point to Edge', distance: pt.distanceTo(closest) };
  }

  // Mixed: edge-face
  if ((a.kind === 'edge' && b.kind === 'face') || (a.kind === 'face' && b.kind === 'edge')) {
    const edge = a.kind === 'edge' ? a : b as MeasureEdgeEntity;
    const face = a.kind === 'face' ? a : b as MeasureFaceEntity;
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

function minDistBetweenSegments(
  p1: THREE.Vector3, p2: THREE.Vector3,
  p3: THREE.Vector3, p4: THREE.Vector3,
): number {
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

type HoverPreview = {
  kind: 'face' | 'edge' | 'vertex';
  faceHighlightGeo?: THREE.BufferGeometry;
  meshUuid?: string;
  meshMatrix?: THREE.Matrix4;
  edgeSegments?: [THREE.Vector3, THREE.Vector3][];
  vertexPosition?: THREE.Vector3;
};

function MeasureTool() {
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
    return () => { geos.forEach((g) => g?.dispose()); };
  }, [measureSelections, scene]);

  useEffect(() => {
    gl.domElement.style.cursor = measureMode ? 'crosshair' : 'default';
    return () => { gl.domElement.style.cursor = 'default'; };
  }, [measureMode, gl]);

  const getMeshes = useCallback((): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !mesh.userData?.measureHelper) meshes.push(mesh);
    });
    return meshes;
  }, [scene]);

  const getPointerNDC = useCallback((event: PointerLike): { x: number; y: number } => {
    const rect = gl.domElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }, [gl.domElement]);

  const detectEntity = useCallback((event: PointerLike): {
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
      const edgeMid = edgeResult.start.clone().add(edgeResult.end).multiplyScalar(0.5);
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
        const worldSegments = edgeResult.segments.map(([a, b]) => [
          a.clone().applyMatrix4(mesh.matrixWorld),
          b.clone().applyMatrix4(mesh.matrixWorld),
        ] as [THREE.Vector3, THREE.Vector3]);
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
  }, [camera, getMeshes, getPointerNDC, gl.domElement, measureMode, raycaster]);

  const handlePointerDown = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (!measureMode || event.button !== 0) return;
    pointerDownRef.current = { x: event.clientX, y: event.clientY, moved: false };
  }, [measureMode]);

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
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
  }, [detectEntity, measureMode]);

  const handlePointerUp = useCallback((event: ThreeEvent<PointerEvent>) => {
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
  }, [addMeasureSelection, detectEntity, measureMode]);

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
          onPointerOut={() => setHover((prev) => { prev?.faceHighlightGeo?.dispose(); return null; })}
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

      {measureMode && hover?.kind === 'edge' && hover.edgeSegments && hover.edgeSegments.map((seg, i) => {
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
      {measureLinePoints && (
        <MeasureDistanceLine a={measureLinePoints[0]} b={measureLinePoints[1]} />
      )}
    </>
  );
}

function MeasureDistanceLine({ a, b }: { a: THREE.Vector3; b: THREE.Vector3 }) {
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
    const label = measureResult?.distance != null
      ? formatLength(measureResult.distance, lengthUnit)
      : formatLength(dist, lengthUnit);
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    labelTexture.needsUpdate = true;
  }, [dist, labelTexture, lengthUnit, measureResult]);

  if (dist < 0.001) return null;

  return (
    <group>
      <primitive object={new THREE.Line(geo, new THREE.LineBasicMaterial({ color: MEASURE_COLORS.line, depthTest: false }))} userData={{ measureHelper: true }} renderOrder={12} />
      <sprite position={labelPos} scale={[30, 10, 1]} renderOrder={13}>
        <spriteMaterial map={labelTexture} depthTest={false} />
      </sprite>
    </group>
  );
}

// ─── Measure Info Panel (HTML overlay) ───

const PANEL_STYLE: React.CSSProperties = {
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

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 0',
};

function MeasureInfoPanel() {
  const measureSelections = useForgeStore((s) => s.measureSelections);
  const lengthUnit = useForgeStore((s) => s.lengthUnit);

  if (measureSelections.length === 0) return null;

  const formatAngle = (deg: number) => `${deg.toFixed(1)}°`;
  const formatArea = (mm2: number) => {
    if (lengthUnit === 'in') return `${(mm2 / 645.16).toFixed(2)} in²`;
    if (lengthUnit === 'ft') return `${(mm2 / 92903).toFixed(4)} ft²`;
    if (mm2 > 100) return `${(mm2 / 100).toFixed(2)} cm²`;
    return `${mm2.toFixed(2)} mm²`;
  };
  const formatCoord = (v: number) => formatLength(v, lengthUnit);
  const fmtNormal = (n: [number, number, number]) =>
    `(${n[0].toFixed(3)}, ${n[1].toFixed(3)}, ${n[2].toFixed(3)})`;

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
            <span style={{ fontSize: 10 }}>{formatCoord(sel.center[0])}, {formatCoord(sel.center[1])}, {formatCoord(sel.center[2])}</span>
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: MEASURE_COLORS.panelLabel }}>
            Click another entity to measure
          </div>
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
          <div style={{ marginTop: 6, fontSize: 10, color: MEASURE_COLORS.panelLabel }}>
            Click another entity to measure
          </div>
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
          <div style={{ marginTop: 6, fontSize: 10, color: MEASURE_COLORS.panelLabel }}>
            Click another entity to measure
          </div>
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
            <span style={{ color: MEASURE_COLORS.panelValue, fontWeight: 600, fontSize: 14 }}>{formatLength(result.distance, lengthUnit)}</span>
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
              <span style={{ color: MEASURE_COLORS.panelLabel }}>ΔX</span>
              <span>{formatLength(result.deltaX, lengthUnit)}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={{ color: MEASURE_COLORS.panelLabel }}>ΔY</span>
              <span>{formatLength(result.deltaY!, lengthUnit)}</span>
            </div>
            <div style={ROW_STYLE}>
              <span style={{ color: MEASURE_COLORS.panelLabel }}>ΔZ</span>
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
        <div style={{ marginTop: 6, fontSize: 10, color: MEASURE_COLORS.panelLabel }}>
          Click to start new measurement
        </div>
      </div>
    );
  }

  return null;
}

function ViewController({
  controlsRef,
  command,
  objects,
  objectMatrices,
  settings,
  focusedObjectIds,
  clearCommand,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  command: ViewCommand | null;
  objects: SceneObject[];
  objectMatrices: Record<string, THREE.Matrix4>;
  settings: Record<string, ObjectSettings>;
  focusedObjectIds: string[];
  clearCommand: () => void;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!command) return;
    const visibleObjects = objects.filter((obj) => settings[obj.id]?.visible);
    const focusedIdSet = new Set(focusedObjectIds);
    const focusedVisibleObjects = focusedIdSet.size > 0
      ? visibleObjects.filter((obj) => focusedIdSet.has(obj.id))
      : [];
    const useFocusedScope = !command.targetId && focusedVisibleObjects.length > 0;
    const targetObjects = command.targetId
      ? visibleObjects.filter((obj) => obj.id === command.targetId)
      : (useFocusedScope ? focusedVisibleObjects : visibleObjects);

    const bounds = new THREE.Box3();
    let hasBounds = false;
    targetObjects.forEach((obj) => {
      const box = computeSceneObjectBounds(obj, objectMatrices);
      if (box) {
        if (!hasBounds) bounds.copy(box);
        else bounds.union(box);
        hasBounds = true;
      }
    });

    if (!hasBounds) {
      clearCommand();
      return;
    }

    const center = new THREE.Vector3();
    bounds.getCenter(center);
    const sizeVec = new THREE.Vector3();
    bounds.getSize(sizeVec);
    const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 1);

    const snapUsesScopedCenter = command.type === 'snap' && useFocusedScope;

    // "snap" (Home / standard views) targets origin unless focus mode scopes it to a subset.
    const target = command.type === 'snap' && !snapUsesScopedCenter ? new THREE.Vector3(0, 0, 0) : center;
    // Distance must cover model extent + offset from target.
    const maxReach = command.type === 'snap' && !snapUsesScopedCenter
      ? Math.max(
          sizeVec.x / 2 + Math.abs(center.x),
          sizeVec.y / 2 + Math.abs(center.y),
          sizeVec.z / 2 + Math.abs(center.z),
        ) * 2
      : maxDim;

    const controls = controlsRef.current;
    const camDir = new THREE.Vector3();
    if (command.type === 'snap') {
      // Camera position direction (Z-up convention, see coordinate-system.md)
      const viewMap: Record<string, THREE.Vector3> = {
        front: new THREE.Vector3(0, -1, 0),
        back: new THREE.Vector3(0, 1, 0),
        right: new THREE.Vector3(1, 0, 0),
        left: new THREE.Vector3(-1, 0, 0),
        top: new THREE.Vector3(0, 0, 1),
        bottom: new THREE.Vector3(0, 0, -1),
        iso: new THREE.Vector3(1, -1, 1),
      };
      // Camera up vector — top/bottom views need special up to avoid gimbal lock
      // Top: up=(0,1,0) so screen-right=X, screen-up=Y
      // Bottom: up=(0,-1,0) so screen-right=X, screen-up=-Y
      const upMap: Record<string, THREE.Vector3> = {
        top: new THREE.Vector3(0, 1, 0),
        bottom: new THREE.Vector3(0, -1, 0),
      };
      camDir.copy(viewMap[command.view ?? 'iso']).normalize();
      const up = upMap[command.view ?? ''] ?? new THREE.Vector3(0, 0, 1);
      camera.up.copy(up);
    } else if (controls) {
      camDir.subVectors(camera.position, controls.target).normalize();
      if (camDir.lengthSq() === 0) camDir.set(1, 1, 1).normalize();
    } else {
      camDir.set(1, 1, 1).normalize();
    }

    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    if (isOrtho) {
      const ortho = camera as THREE.OrthographicCamera;
      const zoom = Math.min(size.width, size.height) / maxReach / 2.2;
      ortho.zoom = Math.max(0.1, zoom);
      ortho.position.copy(target.clone().add(camDir.multiplyScalar(maxReach * 2)));
      ortho.updateProjectionMatrix();
    } else {
      const persp = camera as THREE.PerspectiveCamera;
      const dist = maxReach / (2 * Math.tan((persp.fov * Math.PI) / 360)) * 1.4;
      persp.position.copy(target.clone().add(camDir.multiplyScalar(dist)));
      persp.updateProjectionMatrix();
    }

    if (controls) {
      controls.target.copy(target);
      controls.update();
    } else {
      camera.lookAt(target);
    }

    clearCommand();
  }, [camera, clearCommand, command, controlsRef, focusedObjectIds, objectMatrices, objects, settings, size.height, size.width]);

  return null;
}

function ViewManager({
  isSketchOnly,
  controlsRef,
}: {
  isSketchOnly: boolean;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const wasSketchOnlyRef = useRef(false);
  const savedProjectionRef = useRef<ProjectionMode>('perspective');

  useEffect(() => {
    if (isSketchOnly && !wasSketchOnlyRef.current) {
      savedProjectionRef.current = projectionMode;
    }

    if (isSketchOnly) {
      // Switch to straight-on 2D view
      camera.position.set(0, 0, 200);
      camera.lookAt(0, 0, 0);
      camera.up.set(0, 0, 1);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
      if (projectionMode !== 'orthographic') {
        setProjectionMode('orthographic');
      }
    } else if (wasSketchOnlyRef.current) {
      const restoreMode = savedProjectionRef.current ?? 'perspective';
      if (projectionMode !== restoreMode) {
        setProjectionMode(restoreMode);
      }
    }

    wasSketchOnlyRef.current = isSketchOnly;
  }, [camera, controlsRef, isSketchOnly, projectionMode, setProjectionMode]);

  return null;
}

function ViewPersistence({
  controlsRef,
  isSketchOnly,
  onResolved,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  isSketchOnly: boolean;
  onResolved: (restored: boolean) => void;
}) {
  const { camera } = useThree();
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const setViewportCameraState = useForgeStore((s) => s.setViewportCameraState);
  const restoreStatusRef = useRef<'pending' | 'done'>('pending');
  const didResolveRef = useRef(false);
  const savedStateRef = useRef<ViewportCameraState | null>(readPersistedViewportCameraState());
  const persistTimeoutRef = useRef<number | null>(null);

  const resolve = useCallback((restored: boolean) => {
    if (didResolveRef.current) return;
    didResolveRef.current = true;
    onResolved(restored);
  }, [onResolved]);

  useEffect(() => {
    if (isSketchOnly) {
      restoreStatusRef.current = 'done';
      resolve(false);
    }
  }, [isSketchOnly, resolve]);

  useEffect(() => {
    if (isSketchOnly) return;
    if (restoreStatusRef.current === 'done') return;

    const saved = savedStateRef.current;
    if (!saved) {
      restoreStatusRef.current = 'done';
      resolve(false);
      return;
    }

    if (saved.projectionMode !== projectionMode) {
      setProjectionMode(saved.projectionMode);
      return;
    }

    const controls = controlsRef.current;
    if (!controls) return;

    camera.position.set(saved.position[0], saved.position[1], saved.position[2]);
    camera.up.set(saved.up[0], saved.up[1], saved.up[2]);

    if ((camera as THREE.OrthographicCamera).isOrthographicCamera && saved.orthoZoom !== undefined) {
      const ortho = camera as THREE.OrthographicCamera;
      ortho.zoom = Math.max(0.1, saved.orthoZoom);
      ortho.updateProjectionMatrix();
    } else {
      camera.updateProjectionMatrix();
    }

    controls.target.set(saved.target[0], saved.target[1], saved.target[2]);
    controls.update();

    restoreStatusRef.current = 'done';
    resolve(true);
  }, [camera, controlsRef, isSketchOnly, projectionMode, resolve, setProjectionMode]);

  useEffect(() => {
    if (restoreStatusRef.current !== 'done') return;
    if (isSketchOnly) return;

    const controls = controlsRef.current;
    if (!controls) return;

    const persistCamera = () => {
      const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
      const nextState: ViewportCameraState = {
        projectionMode,
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        up: [camera.up.x, camera.up.y, camera.up.z],
        orthoZoom: isOrtho ? Math.max(0.1, (camera as THREE.OrthographicCamera).zoom) : undefined,
      };
      writePersistedViewportCameraState(nextState);
      setViewportCameraState(nextState);
    };

    const schedulePersistCamera = () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
      }
      persistTimeoutRef.current = window.setTimeout(() => {
        persistTimeoutRef.current = null;
        persistCamera();
      }, 140);
    };

    persistCamera();
    controls.addEventListener('change', schedulePersistCamera);
    return () => {
      controls.removeEventListener('change', schedulePersistCamera);
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
        persistCamera();
      }
    };
  }, [camera, controlsRef, isSketchOnly, projectionMode, setViewportCameraState]);

  return null;
}

function ControlsInteractionBridge({
  controlsRef,
  onInteractionChange,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  onInteractionChange: (active: boolean) => void;
}) {
  const idleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const markActive = () => {
      onInteractionChange(true);
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      idleTimeoutRef.current = window.setTimeout(() => {
        idleTimeoutRef.current = null;
        onInteractionChange(false);
      }, 140);
    };

    controls.addEventListener('start', markActive);
    controls.addEventListener('change', markActive);
    controls.addEventListener('end', markActive);

    return () => {
      controls.removeEventListener('start', markActive);
      controls.removeEventListener('change', markActive);
      controls.removeEventListener('end', markActive);
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      onInteractionChange(false);
    };
  }, [controlsRef, onInteractionChange]);

  return null;
}

function OrbitGifExporterBridge({
  controlsRef,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera, gl, scene } = useThree();
  const setRenderMode = useForgeStore((s) => s.setRenderMode);

  const exportOrbitGif = useCallback(async (options?: OrbitGifExportOptions): Promise<Blob> => {
    const size = Math.max(64, Math.min(2048, Math.round(options?.size ?? GIF_DEFAULT_SIZE)));
    const fps = Math.max(1, Math.round(options?.fps ?? GIF_DEFAULT_FPS));
    const framesPerTurn = Math.max(1, Math.round(options?.framesPerTurn ?? GIF_DEFAULT_FRAMES_PER_TURN));
    const holdFrames = Math.max(0, Math.round(options?.holdFrames ?? GIF_DEFAULT_HOLD_FRAMES));
    const pitchDeg = options?.pitchDeg ?? GIF_DEFAULT_PITCH_DEG;
    const includeWireframePass = options?.includeWireframePass ?? true;
    const delayMs = Math.max(20, Math.round(1000 / fps));
    const modePlan: OrbitGifMode[] = includeWireframePass ? ['solid', 'wireframe'] : ['solid'];
    const encoder = GIFEncoder();

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = size;
    captureCanvas.height = size;
    const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });
    if (!captureCtx) {
      throw new Error('Could not create GIF capture context.');
    }

    const overrideSession = options?.runResult
      ? createOverrideSessionFromRunResult(options.runResult, options.objectSettings, options.background)
      : null;

    const controls = controlsRef.current;
    const orbitTarget = overrideSession
      ? overrideSession.center.clone()
      : (controls?.target.clone() ?? new THREE.Vector3(0, 0, 0));
    let orbitRadius = overrideSession
      ? overrideSession.distance
      : camera.position.distanceTo(orbitTarget);
    if (!Number.isFinite(orbitRadius) || orbitRadius <= 1e-3) orbitRadius = 160;

    const prevCameraPos = camera.position.clone();
    const prevCameraQuat = camera.quaternion.clone();
    const prevCameraUp = camera.up.clone();
    const prevRenderMode = useForgeStore.getState().renderMode;
    const prevControlsTarget = controls?.target.clone() ?? null;
    const prevDamping = controls?.enableDamping ?? null;
    const prevSize = gl.getSize(new THREE.Vector2());
    const prevPixelRatio = gl.getPixelRatio();

    let frameIndex = 0;
    const writeFrame = async (mode: OrbitGifMode, turn: number): Promise<void> => {
      await waitForAnimationFrame();

      if (overrideSession) {
        setOverrideSessionMode(overrideSession, mode);
        setOverrideOrbitCamera(overrideSession, turn, pitchDeg);
        gl.render(overrideSession.scene, overrideSession.camera);
      } else {
        setRenderMode(mode);
        applyOrbitPose(camera, orbitTarget, orbitRadius, turn, pitchDeg);
        if (controls) {
          controls.target.copy(orbitTarget);
          controls.update();
        }
        gl.render(scene, camera);
      }

      captureCtx.clearRect(0, 0, size, size);
      captureCtx.drawImage(gl.domElement, 0, 0, size, size);
      const image = captureCtx.getImageData(0, 0, size, size);
      const palette = quantize(image.data, 256);
      const indexed = applyPalette(image.data, palette);

      if (frameIndex === 0) {
        encoder.writeFrame(indexed, size, size, {
          palette,
          delay: delayMs,
          repeat: 0,
        });
      } else {
        encoder.writeFrame(indexed, size, size, {
          palette,
          delay: delayMs,
        });
      }

      frameIndex += 1;
    };

    try {
      if (controls && !overrideSession) controls.enableDamping = false;
      gl.setPixelRatio(1);
      gl.setSize(size, size, false);

      for (const mode of modePlan) {
        for (let i = 0; i < holdFrames; i += 1) {
          await writeFrame(mode, 0);
        }
        for (let i = 0; i < framesPerTurn; i += 1) {
          await writeFrame(mode, i / framesPerTurn);
        }
      }

      encoder.finish();
      const bytes = new Uint8Array(encoder.bytes());
      return new Blob([bytes], { type: 'image/gif' });
    } finally {
      if (overrideSession) {
        disposeOverrideSession(overrideSession);
      } else {
        setRenderMode(prevRenderMode);
        await waitForAnimationFrame();

        camera.position.copy(prevCameraPos);
        camera.quaternion.copy(prevCameraQuat);
        camera.up.copy(prevCameraUp);
        if (controls && prevControlsTarget) {
          controls.target.copy(prevControlsTarget);
        }
        if (controls && prevDamping !== null) {
          controls.enableDamping = prevDamping;
          controls.update();
        } else if (!controls && prevControlsTarget) {
          camera.lookAt(prevControlsTarget);
        }
      }

      gl.setPixelRatio(prevPixelRatio);
      gl.setSize(prevSize.x, prevSize.y, false);
      gl.render(scene, camera);
    }
  }, [camera, controlsRef, gl, scene, setRenderMode]);

  useEffect(() => {
    registerOrbitGifExporter(exportOrbitGif);
    return () => {
      registerOrbitGifExporter(null);
    };
  }, [exportOrbitGif]);

  return null;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
      <span style={{ color: 'var(--fc-textMuted)' }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{value}</span>
    </div>
  );
}

/** Ghost overlay for construction tree node preview.
 *  Two-pass X-ray: visible portions render as a solid+edges; occluded portions
 *  show as faint edge lines drawn through the parent object (depthTest off). */
function ConstructionGhostOverlay({ matrix }: { matrix: THREE.Matrix4 }) {
  const ghost = useForgeStore((s) => s.constructionGhost);

  const { solidGeo, edgesGeo } = useMemo(() => {
    if (!ghost) return { solidGeo: null, edgesGeo: null };
    try {
      const shape = buildShapeFromCompilePlan(ghost.plan);
      const { solid, edges } = shapeToGeometry(shape);
      return { solidGeo: solid, edgesGeo: edges };
    } catch {
      return { solidGeo: null, edgesGeo: null };
    }
  }, [ghost]);

  if (!solidGeo || !edgesGeo) return null;

  return (
    <group matrixAutoUpdate={false} matrix={matrix}>
      {/* Pass 1 — depth-tested: solid fill + crisp edges for the visible portion */}
      <mesh geometry={solidGeo} renderOrder={1}>
        <meshStandardMaterial
          color="#4a9eff"
          transparent
          opacity={0.25}
          depthTest={false}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edgesGeo} renderOrder={2}>
        <lineBasicMaterial color="#4a9eff" transparent opacity={1.0} depthWrite={false} />
      </lineSegments>
      {/* Pass 2 — no depth test: faint edges visible through the parent solid */}
      <lineSegments geometry={edgesGeo} renderOrder={3}>
        <lineBasicMaterial color="#4a9eff" transparent opacity={0.55} depthTest={false} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

/* ── Evaluation progress indicator ────────────────────────────────── */

const BRAILLE_SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const EVAL_PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  'kernel-init':  { label: 'Loading geometry kernel',  color: '#f5a623' },
  'evaluating':   { label: 'Evaluating model',         color: '#4a9eff' },
  'serializing':  { label: 'Preparing display',        color: '#7c4dff' },
};

function EvaluationIndicator({ phase }: { phase: string }) {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  // Reset timer when phase changes
  useEffect(() => { startRef.current = Date.now(); setElapsed(0); }, [phase]);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % BRAILLE_SPINNER.length);
      setElapsed(Date.now() - startRef.current);
    }, 80);
    return () => clearInterval(id);
  }, []);

  const cfg = EVAL_PHASE_CONFIG[phase] ?? EVAL_PHASE_CONFIG['evaluating'];
  const spinner = BRAILLE_SPINNER[frame];
  const secs = (elapsed / 1000).toFixed(1);

  // Progress dots animation: phase index determines filled dots
  const phaseIdx = phase === 'kernel-init' ? 0 : phase === 'evaluating' ? 1 : 2;
  const dots = [0, 1, 2].map((i) =>
    i <= phaseIdx ? cfg.color : 'var(--fc-border)',
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        background: 'var(--fc-bgPanel)',
        color: 'var(--fc-text, #e0e0e0)',
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        border: '1px solid var(--fc-border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: 'inherit',
        animation: 'fc-eval-fadein 0.2s ease-out',
      }}
    >
      {/* Inject keyframes once */}
      <style>{`
        @keyframes fc-eval-fadein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fc-eval-pulse {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
      `}</style>

      {/* Braille spinner */}
      <span style={{ fontSize: 16, color: cfg.color, width: 16, textAlign: 'center' }}>
        {spinner}
      </span>

      {/* Label */}
      <span>{cfg.label}</span>

      {/* Phase dots */}
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {dots.map((color, i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: color,
              animation: i === phaseIdx ? 'fc-eval-pulse 1.2s ease-in-out infinite' : 'none',
            }}
          />
        ))}
      </span>

      {/* Elapsed time */}
      <span style={{ fontSize: 11, color: 'var(--fc-textDim)', fontVariantNumeric: 'tabular-nums' }}>
        {secs}s
      </span>
    </div>
  );
}

export function Viewport() {
  const measureMode = useForgeStore((s) => s.measureMode);
  const isEvaluating = useForgeStore((s) => s.isEvaluating);
  const evaluationPhase = useForgeStore((s) => s.evaluationPhase);
  const result = useForgeStore((s) => s.lastValidResult);
  const previewFile = useForgeStore((s) => s.previewFile);
  const files = useForgeStore((s) => s.files);
  const renderMode = useForgeStore((s) => s.renderMode);
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const gridEnabled = useForgeStore((s) => s.gridEnabled);
  const gridSize = useForgeStore((s) => s.gridSize);
  const showPerformanceInfo = useForgeStore((s) => s.showPerformanceInfo);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const setObjectVisibility = useForgeStore((s) => s.setObjectVisibility);
  const hoveredObjectId = useForgeStore((s) => s.hoveredObjectId);
  const setHoveredObjectId = useForgeStore((s) => s.setHoveredObjectId);
  const selectObject = useForgeStore((s) => s.selectObject);
  const focusedObjectIds = useForgeStore((s) => s.focusedObjectIds);
  const focusObject = useForgeStore((s) => s.focusObject);
  const clearFocusedObject = useForgeStore((s) => s.clearFocusedObject);
  const objectPickSyncEnabled = useForgeStore((s) => s.objectPickSyncEnabled);
  const explodeAmount = useForgeStore((s) => s.explodeAmount);
  const viewCommand = useForgeStore((s) => s.viewCommand);
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const clearViewCommand = useForgeStore((s) => s.clearViewCommand);
  const jointValues = useForgeStore((s) => s.jointValues);
  const jointAnimationClip = useForgeStore((s) => s.jointAnimationClip);
  const jointAnimationProgress = useForgeStore((s) => s.jointAnimationProgress);
  const jointAnimationPlaying = useForgeStore((s) => s.jointAnimationPlaying);
  const jointAnimationSpeed = useForgeStore((s) => s.jointAnimationSpeed);
  const hoveredJointName = useForgeStore((s) => s.hoveredJointName);
  const setJointAnimationProgress = useForgeStore((s) => s.setJointAnimationProgress);
  const setJointAnimationPlaying = useForgeStore((s) => s.setJointAnimationPlaying);
  const lengthUnit = useForgeStore((s) => s.lengthUnit);
  const constructionGhost = useForgeStore((s) => s.constructionGhost);
  const objects = result?.objects ?? [];
  const dimensions = result?.dimensions ?? [];
  const dimensionsVisible = useForgeStore((s) => s.dimensionsVisible);
  const cutPlaneEnabled = useForgeStore((s) => s.cutPlaneEnabled);
  const sectionPlaneGuidesEnabled = useForgeStore((s) => s.sectionPlaneGuidesEnabled);
  const sectionPlaneFillEnabled = useForgeStore((s) => s.sectionPlaneFillEnabled);
  const sectionPlaneFillOpacity = useForgeStore((s) => s.sectionPlaneFillOpacity);
  const sectionPlaneBorderEnabled = useForgeStore((s) => s.sectionPlaneBorderEnabled);
  const sectionPlaneAxisEnabled = useForgeStore((s) => s.sectionPlaneAxisEnabled);
  const [performanceInfo, setPerformanceInfo] = useState<ViewportPerformanceInfo | null>(null);
  const reactRenderCountRef = useRef(0);
  reactRenderCountRef.current += 1;
  const cutPlaneDefs: CutPlaneDef[] = result?.cutPlanes ?? [];
  const explodeConfig: ExplodeViewOptions | null = result?.explodeView ?? null;
  const jointsConfig = result?.jointsView ?? null;
  const jointOverlayConfig = result?.viewConfig?.jointOverlay ?? DEFAULT_VIEW_CONFIG.jointOverlay;
  const joints = useMemo(
    () => jointsConfig?.enabled === false ? [] : (jointsConfig?.joints ?? []),
    [jointsConfig],
  );
  const jointCouplings = useMemo(
    () => jointsConfig?.enabled === false ? [] : (jointsConfig?.couplings ?? []),
    [jointsConfig],
  );
  const jointAnimations = useMemo(
    () => jointsConfig?.enabled === false ? [] : (jointsConfig?.animations ?? []),
    [jointsConfig],
  );
  const activeJointAnimation = useMemo(
    () => findJointAnimationClip(jointAnimations, jointAnimationClip),
    [jointAnimationClip, jointAnimations],
  );
  const animatedJointValues = useMemo(
    () => resolveJointAnimation(activeJointAnimation, jointAnimationProgress, jointValues),
    [activeJointAnimation, jointAnimationProgress, jointValues],
  );
  const effectiveJointValues = useMemo(
    () => resolveJointViewValues(
      joints,
      jointCouplings,
      animatedJointValues,
      { clamp: !(activeJointAnimation?.continuous ?? false) },
    ),
    [activeJointAnimation?.continuous, animatedJointValues, jointCouplings, joints],
  );

  const activeCutPlaneDefs = useMemo(() => {
    return cutPlaneDefs
      .filter((cp) => cutPlaneEnabled[cp.name])
      .filter((cp) => new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).lengthSq() > 1e-8);
  }, [cutPlaneDefs, cutPlaneEnabled]);

  const {
    objectCutPlanesById,
    objectClippingPlanesById,
    hasAnyObjectCutPlanes,
  } = useMemo(() => {
    const cutPlanesById: Record<string, CutPlaneDef[]> = {};
    const clippingPlanesById: Record<string, THREE.Plane[]> = {};
    let hasAnyCutPlanes = false;

    objects.forEach((obj) => {
      const applicable = activeCutPlaneDefs.filter((cp) => !isObjectExcludedFromCutPlane(obj, cp));
      cutPlanesById[obj.id] = applicable;
      clippingPlanesById[obj.id] = applicable.map(toClippingPlane);
      if (applicable.length > 0) hasAnyCutPlanes = true;
    });

    return {
      objectCutPlanesById: cutPlanesById,
      objectClippingPlanesById: clippingPlanesById,
      hasAnyObjectCutPlanes: hasAnyCutPlanes,
    };
  }, [activeCutPlaneDefs, objects]);

  const explodeOffsets = useMemo(() => {
    if (explodeAmount <= 1e-8) return {} as Record<string, [number, number, number]>;
    if (explodeConfig?.enabled === false) return {} as Record<string, [number, number, number]>;
    if (objects.length === 0) return {} as Record<string, [number, number, number]>;
    return computeExplodeTreeOffsets(buildExplodeTree(objects), explodeAmount, explodeConfig);
  }, [explodeAmount, explodeConfig, objects]);

  const jointNodeMatrices = useMemo(
    () => computeJointNodeMatrices(joints, effectiveJointValues),
    [effectiveJointValues, joints],
  );

  const jointMatrices = useMemo(() => {
    const out: Record<string, THREE.Matrix4> = {};
    objects.forEach((obj) => {
      out[obj.id] = new THREE.Matrix4();
    });

    if (joints.length === 0 || objects.length === 0) return out;

    const jointByChild = new Map<string, JointViewDef>();
    joints.forEach((joint) => {
      jointByChild.set(joint.child, joint);
    });

    objects.forEach((obj) => {
      let nodeName: string | null = null;
      if (jointByChild.has(obj.name)) {
        nodeName = obj.name;
      } else if (obj.groupName && jointByChild.has(obj.groupName)) {
        // ShapeGroup returns are flattened as "Group.Lid" or the fallback "Group.1".
        // Resolve joints against the parent group name when exact object name is absent.
        nodeName = obj.groupName;
      }
      if (!nodeName) return;
      out[obj.id] = jointNodeMatrices.get(nodeName)?.clone() ?? new THREE.Matrix4();
    });

    return out;
  }, [jointNodeMatrices, joints, objects]);

  const objectMatrices = useMemo(() => {
    const out: Record<string, THREE.Matrix4> = {};
    objects.forEach((obj) => {
      const baseMatrix = obj.sketch
        ? new THREE.Matrix4().fromArray(getSketchWorldMatrix(obj.sketch))
        : new THREE.Matrix4();
      const jointMatrix = jointMatrices[obj.id] ?? new THREE.Matrix4();
      const offset = explodeOffsets[obj.id] ?? ZERO_OFFSET;
      const explodeMatrix = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);
      out[obj.id] = explodeMatrix.multiply(jointMatrix).multiply(baseMatrix);
    });
    return out;
  }, [explodeOffsets, jointMatrices, objects]);

  const constructionGhostMatrix = useMemo(
    () => constructionGhost
      ? (objectMatrices[constructionGhost.objectId] ?? new THREE.Matrix4())
      : new THREE.Matrix4(),
    [constructionGhost, objectMatrices],
  );

  useEffect(() => {
    if (!jointAnimationPlaying || !activeJointAnimation) return;

    let raf = 0;
    let lastTs = performance.now();
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const dtSec = Math.max(0, (now - lastTs) / 1000);
      lastTs = now;

      const step = (dtSec * jointAnimationSpeed) / Math.max(1e-6, activeJointAnimation.duration);
      let next = useForgeStore.getState().jointAnimationProgress + step;
      if (next >= 1) {
        if (!activeJointAnimation.loop) {
          next = 1;
          setJointAnimationPlaying(false);
        } else if (!activeJointAnimation.continuous) {
          next = next % 1;
        }
      }
      setJointAnimationProgress(next);

      if (useForgeStore.getState().jointAnimationPlaying) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [activeJointAnimation, jointAnimationPlaying, jointAnimationSpeed, setJointAnimationPlaying, setJointAnimationProgress]);

  const sectionGuideBoundsKey = sectionPlaneGuidesEnabled && activeCutPlaneDefs.length > 0
    ? objectMatrices
    : null;

  const sectionGuideSize = useMemo(() => {
    if (!sectionPlaneGuidesEnabled || activeCutPlaneDefs.length === 0) {
      return Math.max(60, gridSize * 8);
    }

    const bounds = new THREE.Box3();
    let hasBounds = false;

    objects.forEach((obj) => {
      const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
      if (obj.shape) {
        try {
          const bb = obj.shape.boundingBox();
          expandBoundsByTransformedAabb(bounds, bb.min, bb.max, matrix);
          hasBounds = true;
        } catch {
          // Ignore bad shape bounds from partial execution failures.
        }
        return;
      }
      if (obj.sketch) {
        try {
          const bb = obj.sketch.bounds();
          expandBoundsByTransformedAabb(
            bounds,
            [bb.min[0], bb.min[1], 0],
            [bb.max[0], bb.max[1], 0],
            matrix,
          );
          hasBounds = true;
        } catch {
          // Ignore bad sketch bounds from partial execution failures.
        }
      }
    });

    if (!hasBounds) return Math.max(60, gridSize * 8);

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const diagonal = Math.max(1, size.length());
    return Math.max(60, diagonal * 1.35, gridSize * 6);
  }, [activeCutPlaneDefs.length, gridSize, objects, sectionGuideBoundsKey, sectionPlaneGuidesEnabled]);

  const jointOverlayBaseSize = useMemo(() => {
    const bounds = new THREE.Box3();
    let hasBounds = false;

    objects.forEach((obj) => {
      if (obj.shape) {
        try {
          const bb = obj.shape.boundingBox();
          expandBoundsByTransformedAabb(bounds, bb.min, bb.max, IDENTITY_MATRIX);
          hasBounds = true;
        } catch {
          // Ignore bad shape bounds from partial execution failures.
        }
        return;
      }
      if (obj.sketch) {
        try {
          const bb = obj.sketch.bounds();
          expandBoundsByTransformedAabb(
            bounds,
            [bb.min[0], bb.min[1], 0],
            [bb.max[0], bb.max[1], 0],
            new THREE.Matrix4().fromArray(getSketchWorldMatrix(obj.sketch)),
          );
          hasBounds = true;
        } catch {
          // Ignore bad sketch bounds from partial execution failures.
        }
      }
    });

    if (!hasBounds) return Math.max(60, gridSize * 8);

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const diagonal = Math.max(1, size.length());
    return Math.max(60, diagonal * 1.35, gridSize * 6);
  }, [gridSize, objects]);

  const hoveredJointOverlay = useMemo((): HoveredJointOverlayState | null => {
    if (!jointOverlayConfig.enabled) return null;
    if (!hoveredJointName) return null;
    const joint = joints.find((entry) => entry.name === hoveredJointName);
    if (!joint) return null;

    const parentMatrix = joint.parent
      ? (jointNodeMatrices.get(joint.parent)?.clone() ?? new THREE.Matrix4())
      : new THREE.Matrix4();
    const axisLocal = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize();
    const axisWorld = axisLocal.clone().transformDirection(parentMatrix);
    if (axisWorld.lengthSq() <= 1e-8) axisWorld.copy(axisLocal);
    axisWorld.normalize();

    const pivotWorld = new THREE.Vector3(joint.pivot[0], joint.pivot[1], joint.pivot[2]).applyMatrix4(parentMatrix);
    const childObject = objects.find((obj) => obj.name === joint.child || obj.groupName === joint.child);
    if (childObject) {
      const offset = explodeOffsets[childObject.id] ?? ZERO_OFFSET;
      pivotWorld.add(new THREE.Vector3(offset[0], offset[1], offset[2]));
    }

    const value = clampJointValue(joint, effectiveJointValues[joint.name] ?? joint.defaultValue);
    const axisLength = Math.max(jointOverlayConfig.axisLengthMin, jointOverlayBaseSize * jointOverlayConfig.axisLengthScale);
    return {
      joint,
      value,
      pivotWorld,
      axisWorld,
      axisLength,
    };
  }, [
    effectiveJointValues,
    explodeOffsets,
    hoveredJointName,
    jointNodeMatrices,
    jointOverlayConfig,
    jointOverlayBaseSize,
    joints,
    objects,
  ]);

  const hasShape = objects.some((obj) => obj.shape);
  const isSketchOnly = !hasShape && objects.some((obj) => obj.sketch);
  const knownFileNames = useMemo(() => new Set(Object.keys(files)), [files]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const initialFitRequestedRef = useRef(false);
  const prevPreviewFileRef = useRef<string | null | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverTooltipIdRef = useRef<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [viewPersistenceResolved, setViewPersistenceResolved] = useState(false);
  const [isViewportInteracting, setIsViewportInteracting] = useState(false);
  const [objectContextMenu, setObjectContextMenu] = useState<ObjectContextMenuState | null>(null);
  const [faceInfoPanel, setFaceInfoPanel] = useState<{ objectId: string; faceName: string | null; hitNormal: [number, number, number] | null; x: number; y: number } | null>(null);
  const [faceInfoData, setFaceInfoData] = useState<EvalWorkerFaceInfoResult | null>(null);
  const [faceInfoLoading, setFaceInfoLoading] = useState(false);
  const [sketchEntityInfo, setSketchEntityInfo] = useState<SketchEntityInfoPanel | null>(null);
  const themeName = useForgeStore((s) => s.theme);
  const t = themes[themeName];
  const focusedObjectIdSet = useMemo(() => new Set(focusedObjectIds), [focusedObjectIds]);
  const canvasDpr: number | [number, number] = isViewportInteracting ? 1 : [1, 2];
  const { visibleSceneObjectCount, visibleModelTriangles } = useMemo(() => {
    let nextVisibleSceneObjectCount = 0;
    let nextVisibleModelTriangles = 0;

    objects.forEach((obj) => {
      if (objectSettings[obj.id]?.visible === false) return;
      nextVisibleSceneObjectCount += 1;
      if (!obj.shape) return;
      try {
        nextVisibleModelTriangles += obj.shape.numTri();
      } catch {
        // Ignore broken triangle counts from partial/invalid geometry.
      }
    });

    return {
      visibleSceneObjectCount: nextVisibleSceneObjectCount,
      visibleModelTriangles: nextVisibleModelTriangles,
    };
  }, [objectSettings, objects]);

  const closeObjectContextMenu = useCallback(() => {
    setObjectContextMenu(null);
  }, []);

  const hideHoverTooltip = useCallback((id?: string | null) => {
    if (id !== undefined && hoverTooltipIdRef.current !== id) return;
    hoverTooltipIdRef.current = null;
    const tooltip = hoverTooltipRef.current;
    if (!tooltip) return;
    tooltip.style.visibility = 'hidden';
    tooltip.style.opacity = '0';
  }, []);

  const showHoverTooltip = useCallback((label: { id: string; name: string; x: number; y: number }) => {
    hoverTooltipIdRef.current = label.id;
    const tooltip = hoverTooltipRef.current;
    if (!tooltip) return;
    if (tooltip.textContent !== label.name) tooltip.textContent = label.name;
    tooltip.style.left = `${label.x}px`;
    tooltip.style.top = `${label.y}px`;
    tooltip.style.visibility = 'visible';
    tooltip.style.opacity = '1';
  }, []);

  const handleViewPersistenceResolved = useCallback((restored: boolean) => {
    if (restored) {
      initialFitRequestedRef.current = true;
    }
    setViewPersistenceResolved(true);
  }, []);

  useEffect(() => {
    if (!viewPersistenceResolved) return;
    if (initialFitRequestedRef.current) return;
    if (viewCommand) return;
    if (objects.length === 0) return;
    initialFitRequestedRef.current = true;
    requestViewCommand({ type: 'fit' });
  }, [objects.length, requestViewCommand, viewCommand, viewPersistenceResolved]);

  // Auto-fit whenever a different model finishes loading
  useEffect(() => {
    const prev = prevPreviewFileRef.current;
    prevPreviewFileRef.current = previewFile;
    if (prev === undefined) return; // skip initial mount — handled by the effect above
    if (prev === previewFile) return;
    if (objects.length === 0) return;
    requestViewCommand({ type: 'fit' });
  }, [previewFile, objects.length, requestViewCommand]);

  useEffect(() => {
    if (objectPickSyncEnabled) return;
    hideHoverTooltip();
    setHoveredObjectId(null);
  }, [hideHoverTooltip, objectPickSyncEnabled, setHoveredObjectId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (objectContextMenu) {
        closeObjectContextMenu();
        return;
      }
      // Escape in measure mode: clear selections first, then deactivate
      const store = useForgeStore.getState();
      if (store.measureMode) {
        if (store.measureSelections.length > 0) {
          store.clearMeasureSelections();
        } else {
          store.toggleMeasure();
        }
        return;
      }
      if (store.constructionGhost !== null) {
        store.setConstructionGhost(null);
        return;
      }
      if (store.focusedObjectIds.length === 0) return;
      clearFocusedObject();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [clearFocusedObject, closeObjectContextMenu, objectContextMenu]);

  useEffect(() => {
    const handleViewShortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (event.altKey || !event.shiftKey || !hasPrimaryModifier(event)) return;
      if (isTextEntryTarget(event.target)) return;

      const key = getShortcutKey(event);
      if (key === 'f') {
        event.preventDefault();
        requestViewCommand({ type: 'fit' });
        return;
      }
      if (key === 'h') {
        event.preventDefault();
        requestViewCommand({ type: 'snap', view: 'iso' });
      }
    };

    window.addEventListener('keydown', handleViewShortcut, true);
    return () => window.removeEventListener('keydown', handleViewShortcut, true);
  }, [requestViewCommand]);

  useEffect(() => {
    if (!objectContextMenu) return;

    const handleWindowPointerDown = (event: PointerEvent) => {
      const menu = contextMenuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) return;
      closeObjectContextMenu();
    };
    const handleWindowResize = () => closeObjectContextMenu();

    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [closeObjectContextMenu, objectContextMenu]);

  useEffect(() => {
    if (!objectContextMenu) return;
    if (measureMode || isViewportInteracting) {
      closeObjectContextMenu();
      return;
    }
    if (!objects.some((obj) => obj.id === objectContextMenu.objectId)) {
      closeObjectContextMenu();
    }
  }, [closeObjectContextMenu, isViewportInteracting, measureMode, objectContextMenu, objects]);

  const updateHoverLabel = useCallback((obj: SceneObject, event: ThreeEvent<PointerEvent>) => {
    if (!objectPickSyncEnabled || measureMode || isViewportInteracting || event.buttons !== 0) return;
    event.stopPropagation();
    setHoveredObjectId(obj.id);
    const hoverName = resolveHoverObjectName(obj.name, knownFileNames);
    if (!hoverName) {
      // Pass no ID so the guard in hideHoverTooltip doesn't block clearing a stale tooltip
      // that belongs to a different (now-occluded) object.
      hideHoverTooltip();
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    showHoverTooltip({
      id: obj.id,
      name: hoverName,
      x: event.clientX - rect.left + 10,
      y: event.clientY - rect.top + 12,
    });
  }, [
    hideHoverTooltip,
    isViewportInteracting,
    knownFileNames,
    measureMode,
    objectPickSyncEnabled,
    setHoveredObjectId,
    showHoverTooltip,
  ]);

  const clearHoverLabel = useCallback((obj: SceneObject, event: ThreeEvent<PointerEvent>) => {
    if (!objectPickSyncEnabled || measureMode || isViewportInteracting || event.buttons !== 0) return;
    event.stopPropagation();
    if (hoveredObjectId === obj.id) setHoveredObjectId(null);
    hideHoverTooltip(obj.id);
  }, [
    hideHoverTooltip,
    hoveredObjectId,
    isViewportInteracting,
    measureMode,
    objectPickSyncEnabled,
    setHoveredObjectId,
  ]);

  const handleObjectClick = useCallback((obj: SceneObject, event: ThreeEvent<MouseEvent>) => {
    if (!objectPickSyncEnabled || measureMode || isViewportInteracting) return;
    event.stopPropagation();
    selectObject(obj.id);
  }, [isViewportInteracting, measureMode, objectPickSyncEnabled, selectObject]);

  const handleObjectDoubleClick = useCallback((obj: SceneObject, event: ThreeEvent<MouseEvent>) => {
    if (measureMode || isViewportInteracting) return;
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    focusObject(obj.id, { additive });
  }, [focusObject, isViewportInteracting, measureMode]);

  const handleObjectContextMenu = useCallback((obj: SceneObject, event: ThreeEvent<MouseEvent>) => {
    if (measureMode || isViewportInteracting) return;
    event.stopPropagation();
    event.nativeEvent.preventDefault();
    selectObject(obj.id);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(
      Math.max(event.clientX - rect.left, OBJECT_CONTEXT_MENU_MARGIN),
      Math.max(OBJECT_CONTEXT_MENU_MARGIN, rect.width - OBJECT_CONTEXT_MENU_WIDTH - OBJECT_CONTEXT_MENU_MARGIN),
    );
    const y = Math.min(
      Math.max(event.clientY - rect.top, OBJECT_CONTEXT_MENU_MARGIN),
      Math.max(OBJECT_CONTEXT_MENU_MARGIN, rect.height - OBJECT_CONTEXT_MENU_HEIGHT - OBJECT_CONTEXT_MENU_MARGIN),
    );
    // Capture the face normal in world space for face identification
    let hitNormal: [number, number, number] | undefined;
    if (event.face) {
      const n = event.face.normal.clone().transformDirection(event.object.matrixWorld);
      hitNormal = [n.x, n.y, n.z];
    }
    setObjectContextMenu({ objectId: obj.id, x, y, hitNormal });
  }, [isViewportInteracting, measureMode, selectObject]);

  const handleHideObject = useCallback(() => {
    if (!objectContextMenu) return;
    setObjectVisibility(objectContextMenu.objectId, false);
    closeObjectContextMenu();
  }, [closeObjectContextMenu, objectContextMenu, setObjectVisibility]);

  // Fetch face info asynchronously when the panel opens or switches object.
  useEffect(() => {
    if (!faceInfoPanel) { setFaceInfoData(null); return; }
    let cancelled = false;
    setFaceInfoLoading(true);
    evalWorkerClient.fetchFaceInfo(faceInfoPanel.objectId).then((data) => {
      if (cancelled) return;
      setFaceInfoData(data);
      setFaceInfoLoading(false);
      // If we don't have a faceName yet, pick the best one now that we have the data.
      if (!faceInfoPanel.faceName) {
        let bestName: string | null = data.faceNames[0] ?? null;
        if (faceInfoPanel.hitNormal && data.faceNames.length > 0) {
          let bestDot = -Infinity;
          for (const name of data.faceNames) {
            try {
              const n = data.faces[name]?.normal;
              if (!n) continue;
              const dot = n[0] * faceInfoPanel.hitNormal[0] + n[1] * faceInfoPanel.hitNormal[1] + n[2] * faceInfoPanel.hitNormal[2];
              if (dot > bestDot) { bestDot = dot; bestName = name; }
            } catch { /* skip */ }
          }
        }
        if (bestName) setFaceInfoPanel((prev) => prev ? { ...prev, faceName: bestName } : prev);
      }
    }).catch(() => {
      if (cancelled) return;
      setFaceInfoLoading(false);
    });
    return () => { cancelled = true; };
  }, [faceInfoPanel?.objectId]);

  const handleGetFaceInfo = useCallback(() => {
    if (!objectContextMenu) return;
    const obj = objects.find((o) => o.id === objectContextMenu.objectId);
    if (!obj?.shape) { closeObjectContextMenu(); return; }
    setFaceInfoData(null);
    setFaceInfoPanel({ objectId: objectContextMenu.objectId, faceName: null, hitNormal: objectContextMenu.hitNormal ?? null, x: objectContextMenu.x, y: objectContextMenu.y });
    closeObjectContextMenu();
  }, [closeObjectContextMenu, objectContextMenu, objects]);

  const handleSketchEntityClick = useCallback((entity: SketchHoveredEntity, clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = 248;
    const panelHeight = 160;
    const x = Math.min(
      Math.max(clientX - rect.left, OBJECT_CONTEXT_MENU_MARGIN),
      Math.max(OBJECT_CONTEXT_MENU_MARGIN, rect.width - panelWidth - OBJECT_CONTEXT_MENU_MARGIN),
    );
    const y = Math.min(
      Math.max(clientY - rect.top, OBJECT_CONTEXT_MENU_MARGIN),
      Math.max(OBJECT_CONTEXT_MENU_MARGIN, rect.height - panelHeight - OBJECT_CONTEXT_MENU_MARGIN),
    );
    setSketchEntityInfo({ entity, x, y });
  }, []);

  const handleViewportPointerMissed = useCallback((event: MouseEvent) => {
    if (measureMode) return;
    if (useForgeStore.getState().constructionGhost !== null) {
      useForgeStore.getState().setConstructionGhost(null);
      return;
    }
    if (event.detail !== 2) return;
    clearFocusedObject();
  }, [clearFocusedObject, measureMode]);

  const handlePerformanceInfoChange = useCallback((stats: ViewportPerformanceInfo | null) => {
    setPerformanceInfo(stats);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Canvas
        style={{ background: t.viewportBg, cursor: measureMode ? 'crosshair' : 'default' }}
        dpr={canvasDpr}
        gl={{
          antialias: true,
          logarithmicDepthBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        raycaster={{ params: { Line: { threshold: 0.5 } } } as any}
        camera={{ up: [0, 0, 1] }}
        onPointerMissed={handleViewportPointerMissed}
      >
        {projectionMode === 'orthographic' ? (
          <OrthographicCamera makeDefault position={[120, 80, 120]} zoom={2} near={-50000} far={50000} up={[0, 0, 1]} />
        ) : (
          <PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={100000} up={[0, 0, 1]} />
        )}

        {/* Local environment map (offline-safe) */}
        <LocalStudioEnvironment />
        <ambientLight intensity={0.3} />
        <directionalLight position={[100, 150, 80]} intensity={1.2} castShadow />
        <directionalLight position={[-60, -40, -80]} intensity={0.3} />
        <hemisphereLight args={['#b1e1ff', '#444444', 0.4]} />

        <ClippingManager active={hasAnyObjectCutPlanes} />
        {sectionPlaneGuidesEnabled && activeCutPlaneDefs.length > 0 && (
          <SectionPlaneGuides
            cutPlanes={activeCutPlaneDefs}
            sectionSize={sectionGuideSize}
            style={{
              showFill: sectionPlaneFillEnabled,
              fillOpacity: sectionPlaneFillOpacity,
              showBorder: sectionPlaneBorderEnabled,
              showAxis: sectionPlaneAxisEnabled,
            }}
          />
        )}

        {objects.map((obj) => {
          const settings = objectSettings[obj.id] ?? { visible: true, opacity: 1, color: '#5b9bd5' };
          const isDimmedByFocus = focusedObjectIdSet.size > 0 && !focusedObjectIdSet.has(obj.id);
          const isDimmedByGhost = constructionGhost !== null && obj.id !== constructionGhost.objectId;
          const effectiveSettings = isDimmedByFocus || isDimmedByGhost
            ? { ...settings, opacity: Math.min(settings.opacity, FOCUS_MODE_DIM_OPACITY) }
            : settings;
          const isHovered = hoveredObjectId === obj.id;
          const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
          const objectCutPlanes = objectCutPlanesById[obj.id] ?? [];
          const objectClippingPlanes = objectClippingPlanesById[obj.id] ?? [];
          if (obj.shape) {
            return (
              <ForgeObject
                key={obj.id}
                obj={obj}
                settings={effectiveSettings}
                renderMode={renderMode}
                isInteracting={isViewportInteracting}
                matrix={matrix}
                isHovered={isHovered}
                cutPlanes={objectCutPlanes}
                clippingPlanes={objectClippingPlanes}
                onPointerEnter={(event) => updateHoverLabel(obj, event)}
                onPointerMove={(event) => updateHoverLabel(obj, event)}
                onPointerLeave={(event) => clearHoverLabel(obj, event)}
                onClick={(event) => handleObjectClick(obj, event)}
                onDoubleClick={(event) => handleObjectDoubleClick(obj, event)}
                onContextMenu={(event) => handleObjectContextMenu(obj, event)}
              />
            );
          }
          if (obj.sketch) {
            return (
              <SketchObject
                key={obj.id}
                obj={obj}
                settings={effectiveSettings}
                renderMode={renderMode}
                matrix={matrix}
                isSketchMode={isSketchOnly}
                onPointerEnter={(event) => updateHoverLabel(obj, event)}
                onPointerMove={(event) => updateHoverLabel(obj, event)}
                onPointerLeave={(event) => clearHoverLabel(obj, event)}
                onClick={(event) => handleObjectClick(obj, event)}
                onDoubleClick={(event) => handleObjectDoubleClick(obj, event)}
                onContextMenu={(event) => handleObjectContextMenu(obj, event)}
                onEntityClick={handleSketchEntityClick}
                onVertexHover={(pointId, event) => {
                  if (!objectPickSyncEnabled || measureMode || isViewportInteracting || event.buttons !== 0) return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  showHoverTooltip({
                    id: `${obj.id}:${pointId}`,
                    name: pointId,
                    x: event.clientX - rect.left + 10,
                    y: event.clientY - rect.top + 12,
                  });
                }}
              />
            );
          }
          return null;
        })}
        {constructionGhost && (
          <ConstructionGhostOverlay matrix={constructionGhostMatrix} />
        )}
        {hoveredJointOverlay && <HoveredJointOverlay state={hoveredJointOverlay} config={jointOverlayConfig} />}
        {dimensionsVisible && dimensions.map((d) => (
          <DimensionAnnotation key={d.id} def={d} lengthUnit={lengthUnit} />
        ))}
        <MeasureTool />
        <PerformanceInfoSampler
          enabled={showPerformanceInfo}
          sceneObjects={visibleSceneObjectCount}
          modelTriangles={visibleModelTriangles}
          reactRenderCountRef={reactRenderCountRef}
          onStatsChange={handlePerformanceInfoChange}
        />

        {gridEnabled && !isSketchOnly && (
          <Grid
            args={[500, 500]}
            rotation-x={Math.PI / 2}
            cellSize={gridSize}
            cellThickness={0.5}
            cellColor={t.gridCell}
            sectionSize={gridSize * 5}
            sectionThickness={1}
            sectionColor={t.gridSection}
            fadeDistance={400}
            infiniteGrid
          />
        )}
        {!isSketchOnly && <LabeledAxes />}
        {gridEnabled && isSketchOnly && (
          <Grid
            args={[500, 500]}
            cellSize={gridSize}
            cellThickness={0.5}
            cellColor={t.gridCell}
            sectionSize={gridSize * 5}
            sectionThickness={1}
            sectionColor={t.gridSection}
            fadeDistance={400}
            infiniteGrid
            rotation={[Math.PI / 2, 0, 0]}
            side={THREE.DoubleSide}
          />
        )}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          enableRotate={!isSketchOnly}
          mouseButtons={isSketchOnly ? MOUSE_BUTTONS_SKETCH : MOUSE_BUTTONS_3D}
          touches={isSketchOnly ? TOUCH_GESTURES_SKETCH : TOUCH_GESTURES_3D}
        />

        <ControlsInteractionBridge
          controlsRef={controlsRef}
          onInteractionChange={setIsViewportInteracting}
        />

        <ViewManager
          isSketchOnly={isSketchOnly}
          controlsRef={controlsRef}
        />

        <ViewPersistence
          controlsRef={controlsRef}
          isSketchOnly={isSketchOnly}
          onResolved={handleViewPersistenceResolved}
        />

        <OrbitGifExporterBridge controlsRef={controlsRef} />

        <ViewController
          controlsRef={controlsRef}
          command={viewCommand}
          objects={objects}
          objectMatrices={objectMatrices}
          settings={objectSettings}
          focusedObjectIds={focusedObjectIds}
          clearCommand={clearViewCommand}
        />
      </Canvas>

      <PerformanceInfoPanel
        enabled={showPerformanceInfo}
        stats={performanceInfo}
      />

      {/* Measure mode indicator */}
      {measureMode && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--fc-warning)',
            color: '#000',
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          📏 Click surfaces, edges, or vertices to measure
        </div>
      )}

      {/* Measure info panel */}
      {measureMode && <MeasureInfoPanel />}

      {isEvaluating && (
        <EvaluationIndicator phase={evaluationPhase} />
      )}

      {objectPickSyncEnabled && !measureMode && (
        <div
          ref={hoverTooltipRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            background: '#111111d9',
            color: '#f2f2f2',
            padding: '3px 7px',
            borderRadius: 4,
            border: '1px solid #2a2a2a',
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            transform: 'translate(0, -100%)',
            visibility: 'hidden',
            opacity: 0,
          }}
        >
        </div>
      )}

      {objectContextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'absolute',
            left: objectContextMenu.x,
            top: objectContextMenu.y,
            width: OBJECT_CONTEXT_MENU_WIDTH,
            background: 'var(--fc-bgPanel)',
            border: '1px solid var(--fc-border)',
            borderRadius: 8,
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
            padding: 6,
            zIndex: 20,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={handleGetFaceInfo}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 6,
              padding: '8px 10px',
              background: 'transparent',
              color: 'var(--fc-text)',
              textAlign: 'left',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Get Info
          </button>
          <button
            type="button"
            onClick={handleHideObject}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 6,
              padding: '8px 10px',
              background: 'transparent',
              color: 'var(--fc-text)',
              textAlign: 'left',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Hide
          </button>
        </div>
      )}

      {faceInfoPanel && (() => {
        const obj = objects.find((o) => o.id === faceInfoPanel.objectId);
        if (!obj) return null;
        const activeFaceName = faceInfoPanel.faceName;
        const history = activeFaceName ? (faceInfoData?.faceHistories[activeFaceName] ?? null) : null;
        const faceNames = faceInfoData?.faceNames ?? [];
        return (
          <div
            style={{
              position: 'absolute',
              left: Math.min(faceInfoPanel.x, (containerRef.current?.clientWidth ?? 600) - 280 - OBJECT_CONTEXT_MENU_MARGIN),
              top: faceInfoPanel.y,
              width: 272,
              background: 'var(--fc-bgPanel)',
              border: '1px solid var(--fc-border)',
              borderRadius: 8,
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
              padding: 12,
              zIndex: 20,
              fontSize: 12,
              color: 'var(--fc-text)',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Surface History</span>
              <button
                type="button"
                onClick={() => setFaceInfoPanel(null)}
                style={{ border: 'none', background: 'transparent', color: 'var(--fc-textMuted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>

            {/* Object name / breadcrumb */}
            <div style={{ fontSize: 11, color: 'var(--fc-textMuted)', marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {obj.treePath && obj.treePath.length > 0
                ? obj.treePath.join(' / ')
                : obj.name}
            </div>

            {faceInfoLoading ? (
              <div style={{ fontSize: 11, color: 'var(--fc-textMuted)' }}>Loading…</div>
            ) : (
              <>
                {/* Face selector */}
                {faceNames.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 11, color: 'var(--fc-textMuted)', display: 'block', marginBottom: 3 }}>Face</label>
                    <select
                      value={activeFaceName ?? ''}
                      onChange={(e) => setFaceInfoPanel({ ...faceInfoPanel, faceName: e.target.value })}
                      style={{
                        width: '100%',
                        background: 'var(--fc-bgInput)',
                        border: '1px solid var(--fc-border)',
                        borderRadius: 4,
                        color: 'var(--fc-text)',
                        fontSize: 12,
                        padding: '4px 6px',
                      }}
                    >
                      {faceNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
                {history && history.timeline.length > 0 ? (
                  <div>
                    {history.timeline.map((entry, i) => {
                      const isFirst = i === 0;
                      const isLast = i === history.timeline.length - 1;
                      const color =
                        entry.category === 'primitive' ? '#4ade80' :
                        entry.category === 'sketch' ? '#60a5fa' :
                        entry.category === 'modifier' ? '#fb923c' :
                        entry.category === 'boolean' ? '#c084fc' :
                        'var(--fc-textMuted)';
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, paddingBottom: isLast ? 0 : 6 }}>
                          {/* Timeline spine */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 14 }}>
                            <div style={{
                              width: isFirst ? 10 : 8,
                              height: isFirst ? 10 : 8,
                              borderRadius: '50%',
                              background: color,
                              flexShrink: 0,
                              marginTop: isFirst ? 1 : 2,
                              boxShadow: isFirst ? `0 0 0 2px color-mix(in srgb, ${color} 30%, transparent)` : undefined,
                            }} />
                            {!isLast && (
                              <div style={{ width: 2, flex: 1, background: 'var(--fc-border)', marginTop: 3 }} />
                            )}
                          </div>
                          {/* Entry content */}
                          <div style={{ paddingBottom: isLast ? 0 : 4, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fc-text)', lineHeight: 1.3 }}>
                              {entry.label}
                              <span style={{
                                marginLeft: 5,
                                fontSize: 9,
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color,
                                opacity: 0.85,
                              }}>
                                {entry.category}
                              </span>
                            </div>
                            {entry.summary && (
                              <div style={{ fontSize: 10, color: 'var(--fc-textMuted)', marginTop: 1, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {entry.summary}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--fc-textMuted)' }}>No history available for this face</div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {sketchEntityInfo && (() => {
        const ent = sketchEntityInfo.entity;
        let title = '';
        let rows: [string, string][] = [];
        if (ent.kind === 'line') {
          const len = Math.hypot(ent.b[0] - ent.a[0], ent.b[1] - ent.a[1]);
          title = `Line — ${ent.id}`;
          rows = [
            ['Length', formatLength(len, lengthUnit, 3)],
            ['Start', formatCoord(ent.a, lengthUnit)],
            ['End', formatCoord(ent.b, lengthUnit)],
          ];
        } else if (ent.kind === 'circle') {
          title = `Circle — ${ent.id}`;
          rows = [
            ['Radius', formatLength(ent.radius, lengthUnit, 3)],
            ['Diameter', formatLength(ent.radius * 2, lengthUnit, 3)],
            ['Center', formatCoord(ent.center, lengthUnit)],
          ];
        } else if (ent.kind === 'arc') {
          const sa = Math.atan2(ent.start[1] - ent.center[1], ent.start[0] - ent.center[0]);
          const ea = Math.atan2(ent.end[1] - ent.center[1], ent.end[0] - ent.center[0]);
          let span = ea - sa;
          if (ent.clockwise && span > 0) span -= Math.PI * 2;
          if (!ent.clockwise && span < 0) span += Math.PI * 2;
          title = `Arc — ${ent.id}`;
          rows = [
            ['Radius', formatLength(ent.radius, lengthUnit, 3)],
            ['Span', `${(Math.abs(span) * (180 / Math.PI)).toFixed(2)}°`],
            ['Length', formatLength(Math.abs(span) * ent.radius, lengthUnit, 3)],
          ];
        } else {
          title = `Point — ${ent.id}`;
          rows = [
            ['X', formatLength(ent.position[0], lengthUnit, 3)],
            ['Y', formatLength(ent.position[1], lengthUnit, 3)],
          ];
        }
        // Find constraints referencing this entity
        const sketchObj = objects.find((o) => o.sketchMeta);
        const relatedConstraints = sketchObj?.sketchMeta?.constraints.filter(
          (c) => c.entityIds.includes(ent.id)
        ) ?? [];
        return (
          <div
            style={{
              position: 'absolute',
              left: sketchEntityInfo.x,
              top: sketchEntityInfo.y,
              width: 248,
              background: 'var(--fc-bgPanel)',
              border: '1px solid var(--fc-border)',
              borderRadius: 8,
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
              padding: 12,
              zIndex: 20,
              fontSize: 12,
              color: 'var(--fc-text)',
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
              <button
                type="button"
                onClick={() => setSketchEntityInfo(null)}
                style={{ border: 'none', background: 'transparent', color: 'var(--fc-textMuted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
              >×</button>
            </div>
            {rows.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span style={{ color: 'var(--fc-textMuted)', fontSize: 11 }}>{label}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{value}</span>
              </div>
            ))}
            {relatedConstraints.length > 0 && (
              <div style={{ marginTop: 6, borderTop: '1px solid var(--fc-border)', paddingTop: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--fc-textMuted)', marginBottom: 4 }}>
                  Constraints ({relatedConstraints.length})
                </div>
                {relatedConstraints.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => useForgeStore.getState().setSelectedConstraintId(c.id)}
                    style={{
                      fontSize: 10,
                      padding: '2px 4px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      color: c.isConflicting ? '#ff6b6b' : c.isRedundant ? '#faad14' : 'var(--fc-text)',
                    }}
                  >
                    {c.label} {c.isDimension && c.value !== undefined ? `= ${c.value}` : c.type}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

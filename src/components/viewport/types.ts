import type { ExplodeBounds } from '@forge/explodeCore';
import type { JointViewDef } from '@forge/index';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Interfaces & types
// ---------------------------------------------------------------------------

export interface ObjectContextMenuState {
  objectId: string;
  x: number;
  y: number;
  hitNormal?: [number, number, number];
}

export interface ViewportPerformanceInfo {
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

export interface PlaneTransform {
  center: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export type SketchHoveredEntity =
  | { kind: 'line'; id: string; a: [number, number]; b: [number, number] }
  | { kind: 'circle'; id: string; center: [number, number]; radius: number }
  | {
      kind: 'arc';
      id: string;
      center: [number, number];
      start: [number, number];
      end: [number, number];
      radius: number;
      clockwise: boolean;
    }
  | { kind: 'point'; id: string; position: [number, number] };

export interface SketchEntityInfoPanel {
  entity: SketchHoveredEntity;
  x: number;
  y: number;
}

export interface CutSurfaceDef {
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

export interface ExplodeTreeNode {
  key: string;
  label: string;
  path: string[];
  objectIds: string[];
  children: ExplodeTreeNode[];
  bounds: ExplodeBounds | null;
}

export interface MutableExplodeTreeNode {
  key: string;
  label: string;
  path: string[];
  objectIds: string[];
  bounds: ExplodeBounds | null;
  children: MutableExplodeTreeNode[];
  childrenByLabel: Map<string, MutableExplodeTreeNode>;
}

export interface SegmentMeshTransform {
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
}

export interface HoveredJointOverlayState {
  joint: JointViewDef;
  value: number;
  pivotWorld: THREE.Vector3;
  axisWorld: THREE.Vector3;
  axisLength: number;
}

export interface SectionPlaneGuideStyle {
  showFill: boolean;
  fillOpacity: number;
  showBorder: boolean;
  showAxis: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VIEWPORT_CAMERA_STORAGE_KEY = 'fc-viewport-camera-v1';
export const GIF_DEFAULT_SIZE = 960;
export const GIF_DEFAULT_FPS = 24;
export const GIF_DEFAULT_FRAMES_PER_TURN = 72;
export const GIF_DEFAULT_HOLD_FRAMES = 6;
export const GIF_DEFAULT_PITCH_DEG = 18;
export const FOCUS_MODE_DIM_OPACITY = 0.1;
export const PERFORMANCE_SAMPLE_INTERVAL_SEC = 0.25;
export const SECTION_HATCH_MIN_SPACING = 1.6;
export const SECTION_HATCH_MAX_SPACING = 8;
export const SECTION_HATCH_SPACING_SCALE = 0.12;
export const SECTION_HATCH_MIN_LINE_WIDTH = 0.18;
export const SECTION_HATCH_MAX_LINE_WIDTH = 0.9;
export const SECTION_SURFACE_LIFT_MIN = 0.0005;
export const SECTION_SURFACE_LIFT_MAX = 0.01;
export const SECTION_SURFACE_LIFT_SCALE = 5e-5;
export const PLANE_TRANSFORM_EPS = 1e-8;

export const OBJECT_CONTEXT_MENU_WIDTH = 144;
export const OBJECT_CONTEXT_MENU_HEIGHT = 72;
export const OBJECT_CONTEXT_MENU_MARGIN = 8;

export const NON_TEXT_INPUT_TYPES = new Set([
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

export const ZERO_OFFSET: [number, number, number] = [0, 0, 0];
export const IDENTITY_MATRIX = new THREE.Matrix4();
export const WORLD_UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Pure formatting helpers
// ---------------------------------------------------------------------------

export const INTEGER_FORMATTER = new Intl.NumberFormat('en-US');

export const formatPerformanceCount = (value: number): string => INTEGER_FORMATTER.format(Math.max(0, Math.round(value)));

export const waitForAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

import { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useForgeStore } from '../store/forgeStore';
import forgeTypes from '../forge/forge-api.d.ts?raw';

// Legacy inline types kept only as a fallback while forge-api.d.ts is being regenerated.
// Run `npm run gen:types` to update the generated file.
const FORGE_TYPES_LEGACY = `
declare function box(x: number, y: number, z: number, center?: boolean): TrackedShape;
declare function cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): TrackedShape;
declare function sphere(radius: number, segments?: number): Shape;
type ShapeBooleanOperand = Shape | TrackedShape;
type ShapeBooleanOperandInput = ShapeBooleanOperand | ShapeBooleanOperand[];
type SketchBooleanOperandInput = Sketch | Sketch[];
declare function union(...shapes: ShapeBooleanOperandInput[]): Shape;
declare function difference(...shapes: ShapeBooleanOperandInput[]): Shape;
declare function intersection(...shapes: ShapeBooleanOperandInput[]): Shape;
declare function param(name: string, defaultValue: number, opts?: { min?: number; max?: number; step?: number; unit?: string; integer?: boolean; reverse?: boolean }): number;
type PlaneSpec = { origin: [number, number, number]; normal: [number, number, number] } | { plane: 'XY' | 'XZ' | 'YZ'; offset?: number };
declare function intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch;
declare function projectToPlane(shape: Shape, plane: PlaneSpec): Sketch;

declare class Transform {
  static identity(): Transform;
  static translation(x: number, y: number, z: number): Transform;
  static rotationAxis(axis: [number, number, number], angleDeg: number, pivot?: [number, number, number]): Transform;
  static rotateAroundTo(
    axis: [number, number, number],
    pivot: [number, number, number],
    movingPoint: [number, number, number],
    targetPoint: [number, number, number],
    options?: RotateAroundToOptions,
  ): Transform;
  static scale(v: number | [number, number, number]): Transform;
  translate(x: number, y: number, z: number): Transform;
  rotateAxis(axis: [number, number, number], angleDeg: number, pivot?: [number, number, number]): Transform;
  scale(v: number | [number, number, number]): Transform;
  mul(other: Transform): Transform;
  inverse(): Transform;
  point(p: [number, number, number]): [number, number, number];
  vector(v: [number, number, number]): [number, number, number];
  toArray(): number[];
}

declare function composeChain(...parts: Transform[]): Transform;

// --- Cross-file imports ---
type SvgImportOptions = {
  include?: 'auto' | 'fill' | 'stroke' | 'fill-and-stroke';
  regionSelection?: 'all' | 'largest';
  maxRegions?: number;
  minRegionArea?: number;
  minRegionAreaRatio?: number;
  flattenTolerance?: number;
  arcSegments?: number;
  scale?: number;
  maxWidth?: number;
  maxHeight?: number;
  centerOnOrigin?: boolean;
  simplify?: number;
  invertY?: boolean;
};
type PlacementReferenceInput = {
  points?: Record<string, [number, number, number]>;
  edges?: Record<string, { start: [number, number, number]; end: [number, number, number] }>;
  surfaces?: Record<string, { center: [number, number, number]; normal: [number, number, number] }>;
  objects?: Record<string, Shape | TrackedShape | ShapeGroup | { min: [number, number, number]; max: [number, number, number] }>;
};
type FaceDescendantMetadata = {
  kind: 'single' | 'face-set';
  semantic: 'face' | 'region' | 'set';
  memberCount: number;
  memberNames: string[];
  coplanar: boolean;
};
type FaceRef = {
  name: string;
  normal: [number, number, number];
  center: [number, number, number];
  planar?: boolean;
  uAxis?: [number, number, number];
  vAxis?: [number, number, number];
  descendant?: FaceDescendantMetadata;
};
/** Import a 2D sketch from another file. Supports ".forge.js" and ".svg". */
declare function importSketch(fileName: string, paramOverrides?: Record<string, number> | SvgImportOptions): Sketch;
/** Import a 3D part from another file. The file must return a Shape or TrackedShape. */
declare function importPart(fileName: string, paramOverrides?: Record<string, number>): Shape;
/** Import a multipart group from another file. The file must return a ShapeGroup (via group(...)). Use .child(name) to access named parts. */
declare function importGroup(fileName: string, paramOverrides?: Record<string, number>): ShapeGroup;
/** Import and parse an SVG file directly as a sketch. */
declare function importSvgSketch(fileName: string, options?: SvgImportOptions): Sketch;

// --- 2D Sketch Primitives ---
declare function rect(width: number, height: number, center?: boolean): Sketch;
declare function circle2d(radius: number, segments?: number): Sketch;
declare function roundedRect(width: number, height: number, radius: number, center?: boolean): Sketch;
declare function polygon(points: ([number, number] | Point2D)[]): Sketch;
declare function ngon(sides: number, radius: number): Sketch;
declare function ellipse(rx: number, ry: number, segments?: number): Sketch;
declare function slot(length: number, width: number): Sketch;
declare function star(points: number, outerR: number, innerR: number): Sketch;
declare function union2d(...sketches: SketchBooleanOperandInput[]): Sketch;
declare function difference2d(...sketches: SketchBooleanOperandInput[]): Sketch;
declare function intersection2d(...sketches: SketchBooleanOperandInput[]): Sketch;
declare function hull2d(...sketches: SketchBooleanOperandInput[]): Sketch;
declare function constrainedSketch(): ConstrainedSketchBuilder;
declare function spline2d(
  points: [number, number][],
  options?: {
    closed?: boolean;
    tension?: number;
    samplesPerSegment?: number;
    strokeWidth?: number;
    join?: 'Round' | 'Square';
  }
): Sketch;

declare class Curve3D {
  readonly points: [number, number, number][];
  readonly closed: boolean;
  readonly tension: number;
  sample(count?: number): [number, number, number][];
  sampleBySegment(samplesPerSegment?: number): [number, number, number][];
  pointAt(t: number): [number, number, number];
  tangentAt(t: number): [number, number, number];
  length(samples?: number): number;
}

declare function spline3d(
  points: [number, number, number][],
  options?: { closed?: boolean; tension?: number }
): Curve3D;
declare function loft(profiles: Sketch[], heights: number[], options?: { edgeLength?: number; boundsPadding?: number }): Shape;
declare function sweep(
  profile: Sketch,
  path: Curve3D | [number, number, number][],
  options?: { samples?: number; edgeLength?: number; boundsPadding?: number; up?: [number, number, number] }
): Shape;

type GeometryBackend = 'manifold' | 'occt' | 'hybrid' | 'unknown';
type GeometryRepresentation = 'mesh-solid' | 'brep-solid' | 'surface' | 'mixed';
type GeometryFidelity = 'kernel-native' | 'sampled' | 'deformed' | 'mixed' | 'unknown';
type GeometryTopology = 'none' | 'synthetic' | 'kernel';
type GeometrySource =
  | 'primitive'
  | 'extrude'
  | 'revolve'
  | 'boolean'
  | 'sheet-metal'
  | 'hull'
  | 'level-set'
  | 'loft'
  | 'sweep'
  | 'deform'
  | 'unknown';
type GeometryInfo = {
  backend: GeometryBackend;
  representation: GeometryRepresentation;
  fidelity: GeometryFidelity;
  topology: GeometryTopology;
  sources: GeometrySource[];
};
type RotateTarget3D = AnchorTarget3D | [number, number, number];
type RotateAroundToOptions = { mode?: 'plane' | 'line' };
type SheetMetalEdge = 'top' | 'right' | 'bottom' | 'left';
type SheetMetalPlanarRegionName = 'panel' | 'flange-top' | 'flange-right' | 'flange-bottom' | 'flange-left';
type SheetMetalRegionName = SheetMetalPlanarRegionName | 'bend-top' | 'bend-right' | 'bend-bottom' | 'bend-left';

declare class SheetMetalPart {
  flange(edge: SheetMetalEdge, options: { length: number; angleDeg?: number }): SheetMetalPart;
  cutout(region: SheetMetalPlanarRegionName, sketch: Sketch, options?: { u?: number; v?: number; selfAnchor?: Anchor }): SheetMetalPart;
  regionNames(): SheetMetalRegionName[];
  folded(): Shape;
  flatPattern(): Shape;
}

declare function sheetMetal(options: {
  panel: { width: number; height: number };
  thickness: number;
  bendRadius: number;
  bendAllowance: { kFactor: number };
  cornerRelief?: { kind?: 'rect'; size: number };
}): SheetMetalPart;

declare class Shape {
  clone(): Shape;
  duplicate(): Shape;
  // Transforms
  translate(x: number, y: number, z: number): Shape;
  /** Move so bounding box min corner is at the given global coordinate */
  moveTo(x: number, y: number, z: number): Shape;
  /** Move so bounding box min corner is at target's bounding box min + (x, y, z) offset */
  moveToLocal(target: Shape, x: number, y: number, z: number): Shape;
  rotate(x: number, y: number, z: number): Shape;
  scale(v: number | [number, number, number]): Shape;
  mirror(normal: [number, number, number]): Shape;
  transform(m: number[] | Transform): Shape;  // 4x4 column-major matrix or Transform
  /** Rotate around an arbitrary axis through a pivot point */
  rotateAround(axis: [number, number, number], angleDeg: number, pivot?: [number, number, number]): Shape;
  /** Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point */
  rotateAroundTo(
    axis: [number, number, number],
    pivot: [number, number, number],
    movingPoint: RotateTarget3D,
    targetPoint: RotateTarget3D,
    options?: RotateAroundToOptions,
  ): Shape;
  /** Reorient so primary axis (Z) points along given direction. E.g. cylinder(h,r).pointAlong([1,0,0]) lays it along X */
  pointAlong(direction: [number, number, number]): Shape;
  /** Attach named placement references that survive transforms and imports. */
  withReferences(refs: PlacementReferenceInput): Shape;
  /** List placement references. Pass a kind to get raw names, or omit it for prefixed names like "points.mount". */
  referenceNames(kind?: 'points' | 'edges' | 'surfaces' | 'objects'): string[];
  /** Resolve a built-in anchor or named placement reference to a world-space point. */
  referencePoint(ref: AnchorTarget3D): [number, number, number];
  /** Resolve a defended semantic face by name on compile-covered shapes. */
  face(name: string): FaceRef;
  /** List defended semantic face names currently available on this shape. */
  faceNames(): string[];
  /** Translate this shape so the given anchor/reference lands on the target coordinate. */
  placeReference(ref: AnchorTarget3D, target: [number, number, number], offset?: [number, number, number]): Shape;

  // Booleans
  add(...others: ShapeBooleanOperandInput[]): Shape;
  subtract(...others: ShapeBooleanOperandInput[]): Shape;
  intersect(...others: ShapeBooleanOperandInput[]): Shape;

  // Smoothing
  smoothOut(minSharpAngle?: number, minSmoothness?: number): Shape;
  refine(n: number): Shape;
  refineToLength(length: number): Shape;
  refineToTolerance(tolerance: number): Shape;

  // Cutting
  split(cutter: Shape): [Shape, Shape];
  splitByPlane(normal: [number, number, number], offset?: number): [Shape, Shape];
  trimByPlane(normal: [number, number, number], offset?: number): Shape;
  shell(thickness: number, opts?: { openFaces?: Array<'top' | 'bottom'> }): Shape;
  hole(
    faceOrRef: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef,
    opts: {
      diameter: number;
      depth?: number;
      upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
      extent?: {
        forward: {
          depth?: number;
          upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
          through?: boolean;
        };
        reverse?: {
          depth?: number;
          upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
          through?: boolean;
        };
      };
      u?: number;
      v?: number;
      counterbore?: { diameter: number; depth: number };
      countersink?: { diameter: number; angleDeg?: number };
      thread?: {
        designation?: string;
        pitch?: number;
        class?: string;
        handedness?: 'right' | 'left';
        depth?: number;
        modeled?: boolean;
      };
    },
  ): Shape;
  cutout(
    sketch: Sketch,
    opts?: {
      depth?: number;
      upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
      extent?: {
        forward: {
          depth?: number;
          upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
          through?: boolean;
        };
        reverse?: {
          depth?: number;
          upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
          through?: boolean;
        };
      };
      taperScale?: number | [number, number];
    },
  ): Shape;
  hull(): Shape;

  // Deformation
  warp(fn: (vert: [number, number, number]) => void): Shape;
  simplify(tolerance?: number): Shape;

  // Color
  color(hex: string): Shape;

  // 3D Anchor positioning
  /** Position this shape relative to another using built-in anchors or named placement references */
  attachTo(target: Shape | TrackedShape, targetAnchor: AnchorTarget3D, selfAnchor?: AnchorTarget3D, offset?: [number, number, number]): Shape;
  /** Place on a face of a parent shape. u/v = position within face, protrude = outward distance */
  onFace(parent: Shape | TrackedShape, face: 'front'|'back'|'left'|'right'|'top'|'bottom', opts?: { u?: number; v?: number; protrude?: number }): Shape;

  // Query
  volume(): number;
  surfaceArea(): number;
  boundingBox(): { min: number[]; max: number[] };
  isEmpty(): boolean;
  numTri(): number;
  minGap(other: Shape, searchLength: number): number;
  geometryInfo(): GeometryInfo;
}

declare class Sketch {
  clone(): Sketch;
  duplicate(): Sketch;
  translate(x: number, y?: number): Sketch;
  rotate(degrees: number): Sketch;
  scale(v: number | [number, number]): Sketch;
  mirror(ax: [number, number]): Sketch;
  add(...others: SketchBooleanOperandInput[]): Sketch;
  subtract(...others: SketchBooleanOperandInput[]): Sketch;
  intersect(...others: SketchBooleanOperandInput[]): Sketch;
  offset(delta: number, join?: 'Square' | 'Round' | 'Miter'): Sketch;
  hull(): Sketch;
  simplify(epsilon?: number): Sketch;
  warp(fn: (vert: [number, number]) => void): Sketch;
  attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor, offset?: [number, number]): Sketch;
  onFace(parent: Shape | TrackedShape, face: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef, opts?: { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor }): Sketch;
  onFace(face: FaceRef, opts?: { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor }): Sketch;
  rotateAround(degrees: number, pivot: [number, number]): Sketch;
  color(hex: string): Sketch;
  extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: number | [number, number]; center?: boolean }): TrackedShape;
  revolve(degrees?: number, segments?: number): Shape;
  area(): number;
  bounds(): { min: [number, number]; max: [number, number] };
  isEmpty(): boolean;
  numVert(): number;
}

declare class ConstraintSketch extends Sketch {
  constraintMeta: {
    status: 'under' | 'fully' | 'over';
  };
}

declare class ConstrainedSketchBuilder {
  moveTo(x: number, y: number): ConstrainedSketchBuilder;
  lineTo(x: number, y: number): ConstrainedSketchBuilder;
  lineH(dx: number): ConstrainedSketchBuilder;
  lineV(dy: number): ConstrainedSketchBuilder;
  lineAngled(length: number, degrees: number): ConstrainedSketchBuilder;
  close(): ConstrainedSketchBuilder;
  point(x: number, y: number, fixed?: boolean): string;
  pointAt(index: number): string;
  line(a: string, b: string, construction?: boolean): string;
  lineAt(index: number): string;
  circle(center: string, radius: number, construction?: boolean, segments?: number): string;
  circleAt(index: number): string;
  addLoopCircle(center: string, radius: number, segments?: number): ConstrainedSketchBuilder;
  constrain(constraint: { type: string; [key: string]: unknown }): ConstrainedSketchBuilder;
  solve(options?: { iterations?: number; tolerance?: number }): ConstraintSketch;
}

// --- 2D Entities ---
declare function point(x: number, y: number): Point2D;
declare function line(x1: number, y1: number, x2: number, y2: number): Line2D;
declare function circle(cx: number, cy: number, radius: number): Circle2D;
declare function rectangle(x: number, y: number, width: number, height: number): Rectangle2D;
declare function degrees(deg: number): number;
declare function radians(rad: number): number;

declare class Point2D {
  readonly x: number;
  readonly y: number;
  constructor(x: number, y: number);
  distanceTo(other: Point2D): number;
  midpointTo(other: Point2D): Point2D;
  translate(dx: number, dy: number): Point2D;
  toTuple(): [number, number];
}

declare class Line2D {
  readonly start: Point2D;
  readonly end: Point2D;
  constructor(start: Point2D, end: Point2D);
  readonly length: number;
  readonly midpoint: Point2D;
  readonly angle: number;
  readonly direction: [number, number];
  parallel(distance: number): Line2D;
  /** Intersection point treating both as infinite lines. null if parallel. */
  intersect(other: Line2D): Point2D | null;
  /** Intersection point within both segments only. null if no crossing. */
  intersectSegment(other: Line2D): Point2D | null;
  static fromCoordinates(x1: number, y1: number, x2: number, y2: number): Line2D;
  static fromPointAndAngle(origin: Point2D, angleDeg: number, length: number): Line2D;
  static fromPointAndDirection(origin: Point2D, dir: [number, number], length: number): Line2D;
}

declare class Circle2D {
  readonly center: Point2D;
  readonly radius: number;
  readonly diameter: number;
  readonly circumference: number;
  readonly area: number;
  pointAtAngle(angleDeg: number): Point2D;
  translate(dx: number, dy: number): Circle2D;
  toSketch(segments?: number): Sketch;
  extrude(height: number, segments?: number): TrackedShape;
  static fromCenterAndRadius(center: Point2D, radius: number): Circle2D;
  static fromDiameter(center: Point2D, diameter: number): Circle2D;
}

type RectSide = 'top' | 'bottom' | 'left' | 'right';
type RectVertex = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

declare class Rectangle2D {
  readonly vertices: [Point2D, Point2D, Point2D, Point2D];
  readonly width: number;
  readonly height: number;
  readonly center: Point2D;
  side(name: RectSide): Line2D;
  sideAt(index: number): Line2D;
  vertex(name: RectVertex): Point2D;
  /** Get the two diagonals: [bl-tr, br-tl] */
  diagonals(): [Line2D, Line2D];
  toSketch(): Sketch;
  translate(dx: number, dy: number): Rectangle2D;
  extrude(height: number, up?: boolean): TrackedShape;
  static fromDimensions(x: number, y: number, width: number, height: number): Rectangle2D;
  static fromCenterAndDimensions(center: Point2D, width: number, height: number): Rectangle2D;
  static from2Corners(p1: Point2D, p2: Point2D): Rectangle2D;
  static from3Points(p1: Point2D, p2: Point2D, p3: Point2D): Rectangle2D;
}

declare class TrackedShape {
  clone(): TrackedShape;
  duplicate(): TrackedShape;
  face(name: string): FaceRef;
  edge(name: string): { start: [number, number, number]; end: [number, number, number] };
  faceNames(): string[];
  edgeNames(): string[];
  translate(dx: number, dy: number, dz: number): TrackedShape;
  withReferences(refs: PlacementReferenceInput): TrackedShape;
  referenceNames(kind?: 'points' | 'edges' | 'surfaces' | 'objects'): string[];
  referencePoint(ref: AnchorTarget3D): [number, number, number];
  placeReference(ref: AnchorTarget3D, target: [number, number, number], offset?: [number, number, number]): TrackedShape;
  /** Alias for translate */
  moveBy(dx: number, dy: number, dz: number): TrackedShape;
  /** Move so bounding box min corner is at the given global coordinate */
  moveTo(x: number, y: number, z: number): TrackedShape;
  /** Move so bounding box min corner is at target's bounding box min + (x, y, z) offset */
  moveToLocal(target: Shape | TrackedShape, x: number, y: number, z: number): TrackedShape;
  rotate(x: number, y: number, z: number): TrackedShape;
  transform(m: number[] | Transform): TrackedShape;
  /** Rotate around an arbitrary axis through a pivot point */
  rotateAround(axis: [number, number, number], angleDeg: number, pivot?: [number, number, number]): TrackedShape;
  /** Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point */
  rotateAroundTo(
    axis: [number, number, number],
    pivot: [number, number, number],
    movingPoint: RotateTarget3D,
    targetPoint: RotateTarget3D,
    options?: RotateAroundToOptions,
  ): TrackedShape;
  /** Reorient so primary axis (Z) points along given direction */
  pointAlong(direction: [number, number, number]): TrackedShape;
  scale(v: number | [number, number, number]): TrackedShape;
  mirror(normal: [number, number, number]): TrackedShape;
  rotateAroundEdge(edgeName: string, angleDeg: number): TrackedShape;
  /** Position this shape relative to another using built-in anchors or named placement references */
  attachTo(target: Shape | TrackedShape, targetAnchor: AnchorTarget3D, selfAnchor?: AnchorTarget3D, offset?: [number, number, number]): TrackedShape;
  /** Place on a face of a parent shape. u/v = position within face, protrude = outward distance */
  onFace(parent: Shape | TrackedShape, face: 'front'|'back'|'left'|'right'|'top'|'bottom', opts?: { u?: number; v?: number; protrude?: number }): TrackedShape;
  color(hex: string): TrackedShape;
  geometryInfo(): GeometryInfo;
  add(...others: ShapeBooleanOperandInput[]): Shape;
  subtract(...others: ShapeBooleanOperandInput[]): Shape;
  intersect(...others: ShapeBooleanOperandInput[]): Shape;
  shell(thickness: number, opts?: { openFaces?: Array<'top' | 'bottom'> }): Shape;
  hole(
    faceOrRef: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef,
    opts: {
      diameter: number;
      depth?: number;
      upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
      extent?: {
        forward: {
          depth?: number;
          upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
          through?: boolean;
        };
        reverse?: {
          depth?: number;
          upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
          through?: boolean;
        };
      };
      u?: number;
      v?: number;
      counterbore?: { diameter: number; depth: number };
      countersink?: { diameter: number; angleDeg?: number };
      thread?: {
        designation?: string;
        pitch?: number;
        class?: string;
        handedness?: 'right' | 'left';
        depth?: number;
        modeled?: boolean;
      };
    },
  ): Shape;
  cutout(
    sketch: Sketch,
    opts?: {
      depth?: number;
      upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
      extent?: {
        forward: {
          depth?: number;
          upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
          through?: boolean;
        };
        reverse?: {
          depth?: number;
          upToFace?: 'front'|'back'|'left'|'right'|'top'|'bottom' | string | FaceRef;
          through?: boolean;
        };
      };
      taperScale?: number | [number, number];
    },
  ): Shape;
  toShape(): Shape;
}

// --- Patterns ---
declare function linearPattern(shape: Shape, count: number, dx: number, dy: number, dz?: number): Shape;
declare function circularPattern(shape: Shape, count: number, centerX?: number, centerY?: number): Shape;
declare function mirrorCopy(shape: Shape, normal: [number, number, number]): Shape;

// --- Fillets & Chamfers ---
type FilletCornerSpec = { index: number; radius: number; segments?: number };
declare function filletCorners(points: ([number, number] | Point2D)[], corners: FilletCornerSpec[]): Sketch;
declare function filletEdge(shape: Shape | TrackedShape, edge: any, radius: number, quadrant?: [number, number], segments?: number): Shape;
declare function chamferEdge(shape: Shape | TrackedShape, edge: any, size: number, quadrant?: [number, number]): Shape;

// --- Arc Bridge ---
declare function arcBridgeBetweenRects(rectA: any, rectB: any, segments?: number): Shape;

// --- Joints ---
/** Create a revolute (hinge) joint. Auto-creates a param slider and rotates the shape around the pivot. */
declare function joint(name: string, shape: Shape, pivot: [number, number, number], opts?: {
  axis?: [number, number, number];
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
  reverse?: boolean;
}): Shape;

// --- Assembly Graph (Mechanisms) ---
type AssemblyPart = Shape | TrackedShape | ShapeGroup;
type AssemblyJointType = 'fixed' | 'revolute' | 'prismatic';
type AssemblyJointState = Record<string, number | undefined>;
type AssemblyPartMetadata = {
  material?: string;
  process?: string;
  tolerance?: string;
  qty?: number;
  notes?: string;
  densityKgM3?: number;
  massKg?: number;
  [key: string]: unknown;
};
type AssemblyPartOptions = {
  transform?: Transform | number[];
  metadata?: AssemblyPartMetadata;
};
type AssemblyJointOptions = {
  frame?: Transform | number[];
  axis?: [number, number, number];
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
};
type AssemblyJointCouplingOptions = {
  terms: JointCouplingTerm[];
  offset?: number;
};
type GearRatioLike = { jointRatio: number };
type GearCouplingOptions = {
  ratio?: number;
  pair?: GearRatioLike;
  driverTeeth?: number;
  drivenTeeth?: number;
  mesh?: 'external' | 'internal' | 'bevel' | 'face';
  offset?: number;
};
type BomRow = {
  part: string;
  qty: number;
  material?: string;
  process?: string;
  tolerance?: string;
  notes?: string;
  metadata?: AssemblyPartMetadata;
};
type CollisionOptions = {
  parts?: string[];
  ignorePairs?: Array<[string, string]>;
  minOverlapVolume?: number;
};
type CollisionFinding = {
  partA: string;
  partB: string;
  overlapVolume: number;
};
type JointSweepFrame = {
  value: number;
  collisions: CollisionFinding[];
  warnings: string[];
};
type AssemblySceneItem = {
  name: string;
  shape?: Shape;
  group?: Array<{ name: string; shape: Shape }>;
  metadata?: AssemblyPartMetadata;
};
type RobotLinkExportOptions = {
  massKg?: number;
  densityKgM3?: number;
  collision?: 'visual' | 'none';
};
type RobotJointExportOptions = {
  effort?: number;
  velocity?: number;
  damping?: number;
  friction?: number;
};
type RobotDiffDrivePluginOptions = {
  leftJoints: string[];
  rightJoints: string[];
  wheelSeparationMm: number;
  wheelRadiusMm: number;
  topic?: string;
  odomTopic?: string;
  tfTopic?: string;
  frameId?: string;
  odomFrameId?: string;
  maxLinearVelocity?: number;
  maxAngularVelocity?: number;
  linearAcceleration?: number;
  angularAcceleration?: number;
};
type RobotJointStatePublisherOptions = {
  enabled?: boolean;
  joints?: string[];
  topic?: string;
  updateRate?: number;
};
type RobotPose6 = [number, number, number, number, number, number];
type RobotWorldKeyboardTeleopOptions = {
  enabled?: boolean;
  linearStep?: number;
  angularStep?: number;
};
type RobotWorldOptions = {
  name?: string;
  generateDemoWorld?: boolean;
  spawnPose?: RobotPose6;
  keyboardTeleop?: RobotWorldKeyboardTeleopOptions;
};
type RobotExportOptions = {
  assembly: Assembly;
  modelName?: string;
  state?: AssemblyJointState;
  static?: boolean;
  selfCollide?: boolean;
  allowAutoDisable?: boolean;
  links?: Record<string, RobotLinkExportOptions>;
  joints?: Record<string, RobotJointExportOptions>;
  plugins?: {
    diffDrive?: RobotDiffDrivePluginOptions;
    jointStatePublisher?: RobotJointStatePublisherOptions;
  };
  world?: RobotWorldOptions;
};
declare function bomToCsv(rows: BomRow[]): string;
declare function robotExport(options: RobotExportOptions): void;
declare class SolvedAssembly {
  readonly name: string;
  warnings(): string[];
  getJointState(): AssemblyJointState;
  getTransform(partName: string): Transform;
  getPart(partName: string): AssemblyPart;
  toScene(): AssemblySceneItem[];
  bom(): BomRow[];
  bomCsv(): string;
  collisionReport(options?: CollisionOptions): CollisionFinding[];
  minClearance(partA: string, partB: string, searchLength?: number): number;
}
declare class Assembly {
  readonly name: string;
  constructor(name?: string);
  addFrame(name: string, options?: AssemblyPartOptions): Assembly;
  addPart(name: string, part: AssemblyPart, options?: AssemblyPartOptions): Assembly;
  addJoint(
    name: string,
    type: AssemblyJointType,
    parent: string,
    child: string,
    options?: AssemblyJointOptions,
  ): Assembly;
  addRevolute(name: string, parent: string, child: string, options?: AssemblyJointOptions): Assembly;
  addPrismatic(name: string, parent: string, child: string, options?: AssemblyJointOptions): Assembly;
  addFixed(name: string, parent: string, child: string, options?: AssemblyJointOptions): Assembly;
  addJointCoupling(jointName: string, options: AssemblyJointCouplingOptions): Assembly;
  addGearCoupling(drivenJointName: string, driverJointName: string, options?: GearCouplingOptions): Assembly;
  /** Attach named mounting reference points. Surfaced automatically on ImportedAssembly when this file is imported. */
  withReferences(refs: { points?: Record<string, [number, number, number]> }): Assembly;
  solve(state?: AssemblyJointState): SolvedAssembly;
  sweepJoint(
    jointName: string,
    from: number,
    to: number,
    steps: number,
    baseState?: AssemblyJointState,
    collisionOptions?: CollisionOptions,
  ): JointSweepFrame[];
}
declare function assembly(name?: string): Assembly;
/** Import an assembly from another file. The file must return an Assembly instance (before calling .solve()). */
declare function importAssembly(fileName: string, paramOverrides?: Record<string, number>): ImportedAssembly;
type MergeIntoOptions = {
  /** Prefix for all part/joint names from the sub-assembly. E.g. "Left Arm" turns "Base" into "Left Arm.Base". */
  prefix?: string;
  /** Part name in the parent assembly to attach the sub-assembly root to. */
  mountParent: string;
  /** Name for the new mount joint in the parent graph. */
  mountJoint: string;
  /** Joint type for the mount connection (default: 'fixed'). */
  mountType?: AssemblyJointType;
  /** Frame, axis, limits, and other options for the mount joint. */
  mountOptions?: AssemblyJointOptions;
};
declare class ImportedAssembly {
  /** The underlying Assembly — use for sweepJoint, describe, etc. */
  readonly assembly: Assembly;
  /** Solve at the given joint state (defaults to each joint's default value). */
  solve(state?: AssemblyJointState): SolvedAssembly;
  /** Get a named part positioned at the given joint state. */
  part(name: string, state?: AssemblyJointState): AssemblyPart;
  /** Convert all parts to a ShapeGroup with named children matching assembly part names. */
  toGroup(state?: AssemblyJointState): ShapeGroup;
  /** Attach named point placement references. Returns a new ImportedAssembly. */
  withReferences(refs: { points?: Record<string, [number, number, number]> }): ImportedAssembly;
  /** List all attached placement reference names. */
  referenceNames(): string[];
  /** Translate so the named reference point lands on target. Returns a new ImportedAssembly. */
  placeReference(ref: string, target: [number, number, number], offset?: [number, number, number]): ImportedAssembly;
  /**
   * Flatten this sub-assembly's parts and joints into parent, then wire a mount joint
   * from mountParent to the sub-assembly root. All names are prefixed with options.prefix.
   * After merging you can drive sub-assembly joints from the parent:
   * parent.solve({ "Left Arm.shoulder": 45 })
   */
  mergeInto(parent: Assembly, options: MergeIntoOptions): Assembly;
}

// --- 3D Advanced ---
declare function hull3d(...args: (Shape | TrackedShape | [number, number, number])[]): Shape;
declare function levelSet(sdf: (p: [number, number, number]) => number, bounds: { min: [number, number, number]; max: [number, number, number] }, edgeLength: number, level?: number): Shape;

type ExplodeAxis = 'x' | 'y' | 'z';
type ExplodeDirection = 'radial' | ExplodeAxis | [number, number, number];
type ExplodeDirective = {
  stage?: number;
  direction?: ExplodeDirection;
  axisLock?: ExplodeAxis;
};
type ExplodeNamedItem = {
  name: string;
  shape?: Shape | TrackedShape | ShapeGroup;
  sketch?: Sketch;
  color?: string;
  group?: ExplodeItem[];
  explode?: ExplodeDirective;
};
type ExplodeItem = Shape | Sketch | TrackedShape | ShapeGroup | ExplodeNamedItem;
type ExplodeViewOptions = {
  enabled?: boolean;
  amountScale?: number;
  stages?: number[];
  mode?: ExplodeDirection;
  axisLock?: ExplodeAxis;
  byName?: Record<string, ExplodeDirective>;
  byPath?: Record<string, ExplodeDirective>;
};
type JointViewType = 'revolute' | 'prismatic';
type JointViewDef = {
  name: string;
  child: string;
  parent?: string;
  type?: JointViewType;
  axis?: [number, number, number];
  pivot?: [number, number, number];
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
};
type JointAnimationKeyframe = {
  at: number;
  values: Record<string, number>;
};
type JointAnimationClip = {
  name: string;
  duration?: number;
  loop?: boolean;
  continuous?: boolean;
  keyframes: JointAnimationKeyframe[];
};
type JointCouplingTerm = {
  joint: string;
  ratio?: number;
};
type JointCoupling = {
  joint: string;
  terms: JointCouplingTerm[];
  offset?: number;
};
type JointsViewOptions = {
  enabled?: boolean;
  joints?: JointViewDef[];
  couplings?: JointCoupling[];
  animations?: JointAnimationClip[];
  defaultAnimation?: string;
};
type JointOverlayViewConfigOptions = {
  enabled?: boolean;
  axisColor?: string;
  axisCoreColor?: string;
  arcColor?: string;
  zeroColor?: string;
  arcVisualLimitDeg?: number;
  axisLengthScale?: number;
  axisLengthMin?: number;
  axisLineRadiusScale?: number;
  axisLineRadiusMin?: number;
  axisLineRadiusMax?: number;
  spokeLineRadiusScale?: number;
  spokeLineRadiusMin?: number;
  spokeLineRadiusMax?: number;
  arcLineRadiusScale?: number;
  arcLineRadiusMin?: number;
  arcLineRadiusMax?: number;
  axisDotRadiusScale?: number;
  axisDotRadiusMin?: number;
  axisArrowRadiusScale?: number;
  axisArrowRadiusMin?: number;
  axisArrowLengthScale?: number;
  axisArrowLengthMin?: number;
  axisArrowOffsetFactor?: number;
  arcRadiusScale?: number;
  arcRadiusMin?: number;
  arcDotRadiusScale?: number;
  arcDotRadiusMin?: number;
  arcArrowRadiusScale?: number;
  arcArrowRadiusMin?: number;
  arcArrowLengthScale?: number;
  arcArrowLengthMin?: number;
  arcArrowOffsetFactor?: number;
  arcStepDeg?: number;
  arcMinSteps?: number;
  arcTubeSegmentsMin?: number;
  arcTubeSegmentsFactor?: number;
  arcTubeRadialSegments?: number;
};
type ViewConfigOptions = {
  jointOverlay?: JointOverlayViewConfigOptions;
};

type SpurGearOptions = {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  center?: boolean;
  segmentsPerTooth?: number;
};
type SideGearOptions = SpurGearOptions & {
  side?: 'top' | 'bottom';
  toothHeight?: number;
};
type FaceGearOptions = SideGearOptions;
type RingGearOptions = {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  rimWidth?: number;
  outerDiameter?: number;
  center?: boolean;
  segmentsPerTooth?: number;
};
type RackGearOptions = {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  baseHeight?: number;
  center?: boolean;
};
type BevelGearOptions = {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  pitchAngleDeg?: number;
  mateTeeth?: number;
  shaftAngleDeg?: number;
  center?: boolean;
  segmentsPerTooth?: number;
};
type GearPairSpec = {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth?: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  segmentsPerTooth?: number;
};
type SideGearSpec = GearPairSpec & {
  side?: 'top' | 'bottom';
  toothHeight?: number;
};
type FaceGearSpec = SideGearSpec;
type GearPairDiagnostic = {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
};
type GearPairResult = {
  pinion: Shape;
  gear: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  workingPressureAngleDeg: number;
  contactRatio: number;
  jointRatio: number;
  speedReduction: number;
  diagnostics: GearPairDiagnostic[];
  status: 'ok' | 'warn' | 'error';
};
type GearMeshPlacement = {
  pinionAxis: [number, number, number];
  gearAxis: [number, number, number];
  pinionCenter: [number, number, number];
  gearCenter: [number, number, number];
};
type BevelGearPairResult = GearMeshPlacement & {
  pinion: Shape;
  gear: Shape;
  shaftAngleDeg: number;
  pinionPitchAngleDeg: number;
  gearPitchAngleDeg: number;
  coneDistance: number;
  backlash: number;
  jointRatio: number;
  speedReduction: number;
  diagnostics: GearPairDiagnostic[];
  status: 'ok' | 'warn' | 'error';
};
type SideGearPairResult = {
  side: Shape;
  vertical: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  meshPlaneZ: number;
  radialOverlap: number;
  jointRatio: number;
  speedReduction: number;
  diagnostics: GearPairDiagnostic[];
  status: 'ok' | 'warn' | 'error';
};
type FaceGearPairResult = {
  face: Shape;
  vertical: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  meshPlaneZ: number;
  radialOverlap: number;
  jointRatio: number;
  speedReduction: number;
  diagnostics: GearPairDiagnostic[];
  status: 'ok' | 'warn' | 'error';
};

type TSlotProfileOptions = {
  size?: number;
  slotWidth?: number;
  slotInnerWidth?: number;
  slotDepth?: number;
  slotNeckDepth?: number;
  wall?: number;
  web?: number;
  centerBossDia?: number;
  centerBoreDia?: number;
  outerCornerRadius?: number;
  segments?: number;
};
type TSlotExtrusionOptions = TSlotProfileOptions & { center?: boolean };
type Profile2020BSlot6ProfileOptions = {
  slotWidth?: number;
  slotInnerWidth?: number;
  slotDepth?: number;
  slotNeckDepth?: number;
  centerBoreDia?: number;
  centerBossDia?: number;
  diagonalWebWidth?: number;
  outerCornerRadius?: number;
  segments?: number;
};
type Profile2020BSlot6Options = Profile2020BSlot6ProfileOptions & { center?: boolean };

declare const lib: {
  boltHole(diameter: number, depth: number): Shape;
  counterbore(holeDia: number, boreDia: number, boreDepth: number, totalDepth: number): Shape;
  tube(outerX: number, outerY: number, outerZ: number, wall: number): Shape;
  pipe(height: number, outerRadius: number, wall: number, segments?: number): Shape;
  explode<T extends ExplodeItem[] | ShapeGroup>(
    items: T,
    options?: {
      amount?: number;
      stages?: number[];
      mode?: ExplodeDirection;
      axisLock?: ExplodeAxis;
      byName?: Record<string, ExplodeDirective>;
      byPath?: Record<string, ExplodeDirective>;
    },
  ): T;
  hexNut(acrossFlats: number, height: number, holeDia: number): Shape;
  roundedBox(x: number, y: number, z: number, radius: number): Shape;
  bracket(width: number, height: number, depth: number, thick: number, holeDia?: number): Shape;
  holePattern(rows: number, cols: number, spacingX: number, spacingY: number, holeDia: number, depth: number): Shape;
  tSlotProfile(options?: TSlotProfileOptions): Sketch;
  tSlotExtrusion(length: number, options?: TSlotExtrusionOptions): Shape;
  profile2020BSlot6Profile(options?: Profile2020BSlot6ProfileOptions): Sketch;
  profile2020BSlot6(length: number, options?: Profile2020BSlot6Options): Shape;
  /** Route a pipe through 3D waypoints with smooth bends */
  pipeRoute(points: [number, number, number][], radius: number, options?: { bendRadius?: number; wall?: number; segments?: number }): Shape;
  /** Curved pipe section (torus arc) for connecting two pipe directions */
  elbow(pipeRadius: number, bendRadius: number, angle?: number, options?: { wall?: number; segments?: number; from?: [number, number, number]; to?: [number, number, number] }): Shape;
  elbow(pipeRadius: number, bendRadius: number, options: { from?: [number, number, number]; to?: [number, number, number]; wall?: number; segments?: number }): Shape;
  /** Involute external spur gear (2D involute profile + extrusion). */
  spurGear(options: SpurGearOptions): Shape;
  /** Face gear (crown style): teeth project from the top or bottom face. */
  faceGear(options: FaceGearOptions): Shape;
  /** Side/crown gear: teeth project from the top or bottom face. */
  sideGear(options: SideGearOptions): Shape;
  /** Internal ring gear with involute-derived tooth spaces. */
  ringGear(options: RingGearOptions): Shape;
  /** Linear rack gear with parametric pressure-angle flanks. */
  rackGear(options: RackGearOptions): Shape;
  /** Bevel gear from a tapered involute extrusion (conical approximation). */
  bevelGear(options: BevelGearOptions): Shape;
  /** Pair-level ratio/backlash/contact diagnostics with optional auto-placement. */
  gearPair(options: { pinion: Shape | GearPairSpec; gear: Shape | GearPairSpec; backlash?: number; centerDistance?: number; place?: boolean; phaseDeg?: number }): GearPairResult;
  /** Bevel gear pair helper with ratio diagnostics and recommended joint placement axes/centers. */
  bevelGearPair(options: { pinion: Shape | GearPairSpec; gear: Shape | GearPairSpec; shaftAngleDeg?: number; backlash?: number; place?: boolean; phaseDeg?: number }): BevelGearPairResult;
  /** Perpendicular pair helper for faceGear + vertical spur gear. */
  faceGearPair(options: { face: Shape | FaceGearSpec; vertical: Shape | GearPairSpec; backlash?: number; centerDistance?: number; meshPlaneZ?: number; place?: boolean; phaseDeg?: number }): FaceGearPairResult;
  /** Perpendicular pair helper for sideGear + vertical spur gear. */
  sideGearPair(options: { side: Shape | SideGearSpec; vertical: Shape | GearPairSpec; backlash?: number; centerDistance?: number; meshPlaneZ?: number; place?: boolean; phaseDeg?: number }): SideGearPairResult;
};

// --- Dimensions (visual annotations) ---
/** Add a dimension annotation between two points. Purely visual, not a constraint. */
declare function dim(from: [number, number] | [number, number, number] | Point2D, to: [number, number] | [number, number, number] | Point2D, opts?: { offset?: number; label?: string; color?: string; component?: string | string[]; currentComponent?: boolean }): void;
/** Add a dimension annotation along a Line2D. */
declare function dimLine(line: Line2D, opts?: { offset?: number; label?: string; color?: string; component?: string | string[]; currentComponent?: boolean }): void;
/** Add a bill-of-materials entry for report generation. */
declare function bom(quantity: number, description: string, opts?: { unit?: string; key?: string }): void;

// --- 2D Anchor Types ---
type Anchor = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';

// --- 3D Anchor Types ---
type Anchor3D = 'center' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
  | 'front-left' | 'front-right' | 'back-left' | 'back-right'
  | 'top-front' | 'top-back' | 'top-left' | 'top-right'
  | 'bottom-front' | 'bottom-back' | 'bottom-left' | 'bottom-right'
  | 'top-front-left' | 'top-front-right' | 'top-back-left' | 'top-back-right'
  | 'bottom-front-left' | 'bottom-front-right' | 'bottom-back-left' | 'bottom-back-right';
type AnchorTarget3D = Anchor3D | (string & {});

// --- Group ---
/** Group multiple shapes/sketches for joint transforms without merging meshes. Colors preserved. */
type NamedGroupItem = {
  name: string;
  shape?: Shape | TrackedShape | ShapeGroup;
  sketch?: Sketch;
  group?: GroupItem[];
};
type GroupItem = Shape | Sketch | TrackedShape | ShapeGroup | NamedGroupItem;
declare function group(...items: GroupItem[]): ShapeGroup;

declare class ShapeGroup {
  readonly children: (Shape | Sketch | TrackedShape | ShapeGroup)[];
  readonly childNames: (string | undefined)[];
  childName(index: number): string | undefined;
  /** Return the named child by name. Throws if not found. */
  child(name: string): Shape | Sketch | TrackedShape | ShapeGroup;
  clone(): ShapeGroup;
  duplicate(): ShapeGroup;
  translate(x: number, y: number, z: number): ShapeGroup;
  /** Move so combined bounding box min corner is at the given global coordinate */
  moveTo(x: number, y: number, z: number): ShapeGroup;
  /** Move so combined bounding box min corner is at target's bounding box min + (x, y, z) offset */
  moveToLocal(target: Shape | TrackedShape | ShapeGroup, x: number, y: number, z: number): ShapeGroup;
  rotate(x: number, y: number, z: number): ShapeGroup;
  /** Rotate around an arbitrary axis through a pivot point */
  rotateAround(axis: [number, number, number], angleDeg: number, pivot?: [number, number, number]): ShapeGroup;
  /** Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point */
  rotateAroundTo(
    axis: [number, number, number],
    pivot: [number, number, number],
    movingPoint: Anchor3D | [number, number, number],
    targetPoint: Anchor3D | [number, number, number],
    options?: RotateAroundToOptions,
  ): ShapeGroup;
  /** Reorient all 3D children so primary axis (Z) points along given direction */
  pointAlong(direction: [number, number, number]): ShapeGroup;
  /** Apply a 4x4 transform matrix or Transform to all 3D children */
  transform(m: number[] | Transform): ShapeGroup;
  scale(v: number | [number, number, number]): ShapeGroup;
  mirror(normal: [number, number, number]): ShapeGroup;
  color(hex: string): ShapeGroup;
  /** Attach named placement references. Refs survive transforms and importGroup(). */
  withReferences(refs: PlacementReferenceInput): ShapeGroup;
  /** List named placement references carried by this group. */
  referenceNames(kind?: 'points' | 'edges' | 'surfaces' | 'objects'): string[];
  /** Resolve a named placement reference or built-in anchor to a 3D point. */
  referencePoint(ref: AnchorTarget3D): [number, number, number];
  /** Translate the group so the given reference lands on the target coordinate. */
  placeReference(ref: AnchorTarget3D, target: [number, number, number], offset?: [number, number, number]): ShapeGroup;
  /** Attach this group to a named anchor on another shape or group. */
  attachTo(target: Shape | TrackedShape | ShapeGroup, targetAnchor: AnchorTarget3D, selfAnchor?: Anchor3D, offset?: [number, number, number]): ShapeGroup;
  /** Bounding box of all 3D children combined. */
  boundingBox(): { min: [number, number, number]; max: [number, number, number] };
}

type CutPlaneOptions = { offset?: number; exclude?: string | string[] };
/** Define a named section/cut plane. Appears as a toggle in the View Panel. When enabled, geometry on the normal side is clipped away. */
declare function cutPlane(name: string, normal: [number, number, number], offset?: number, options?: CutPlaneOptions): void;
/** Overload: pass an options object as third arg (for example with offset and exclude). */
declare function cutPlane(name: string, normal: [number, number, number], options?: CutPlaneOptions): void;
/** Override default viewport explode behavior (global slider still controls amount). */
declare function explodeView(options?: ExplodeViewOptions): void;
/** Register viewport-only runtime joint sliders (no script rerun). */
declare function jointsView(options?: JointsViewOptions): void;
/** Configure viewport helper visuals (hovered joint axis/arc, stroke sizes, colors). */
declare function viewConfig(options?: ViewConfigOptions): void;

// --- Verification API ---
type VerifyShapeLike = { boundingBox(): { min: number[]; max: number[] }; isEmpty(): boolean; volume(): number; surfaceArea(): number; minGap(other: VerifyShapeLike, searchLength: number): number };
type VerifyFaceRef = { normal: [number, number, number]; center: [number, number, number] };
declare const verify: {
  /** Custom predicate check. Fails if the function returns false or throws. */
  that(label: string, check: () => boolean, message?: string): void;
  /** Check that two numbers are approximately equal within tolerance. */
  equal(label: string, actual: number, expected: number, tolerance?: number, message?: string): void;
  /** Check that two numbers differ by more than tolerance. */
  notEqual(label: string, actual: number, unexpected: number, tolerance?: number, message?: string): void;
  /** Check that actual > min. */
  greaterThan(label: string, actual: number, min: number, message?: string): void;
  /** Check that actual < max. */
  lessThan(label: string, actual: number, max: number, message?: string): void;
  /** Check that min <= actual <= max. */
  inRange(label: string, actual: number, min: number, max: number, message?: string): void;
  /** Check that bounding-box centers of two shapes coincide within tolerance (mm). */
  centersCoincide(label: string, a: VerifyShapeLike, b: VerifyShapeLike, tolerance?: number): void;
  /** Check that two shapes do not overlap (minGap > 0). */
  notColliding(label: string, a: VerifyShapeLike, b: VerifyShapeLike, searchLength?: number): void;
  /** Check that minimum gap between shapes is at least minGap mm. */
  minClearance(label: string, a: VerifyShapeLike, b: VerifyShapeLike, minGap: number, searchLength?: number): void;
  /** Check that two face normals are parallel within toleranceDeg degrees. */
  parallel(label: string, faceA: VerifyFaceRef, faceB: VerifyFaceRef, toleranceDeg?: number): void;
  /** Check that two face normals are perpendicular within toleranceDeg degrees. */
  perpendicular(label: string, faceA: VerifyFaceRef, faceB: VerifyFaceRef, toleranceDeg?: number): void;
  /** Check that two faces are coplanar (parallel + same offset plane). */
  coplanar(label: string, faceA: VerifyFaceRef, faceB: VerifyFaceRef, toleranceDeg?: number, toleranceMm?: number): void;
  /** Check that a face center is at the expected position within toleranceMm. */
  faceAt(label: string, face: VerifyFaceRef, expectedPos: [number, number, number], toleranceMm?: number): void;
  /** Check that two face normals point in the same direction (not antiparallel). */
  sameDirection(label: string, faceA: VerifyFaceRef, faceB: VerifyFaceRef, toleranceDeg?: number): void;
  /** Check that a shape isEmpty() returns true. */
  isEmpty(label: string, shape: VerifyShapeLike, message?: string): void;
  /** Check that a shape is not empty. */
  notEmpty(label: string, shape: VerifyShapeLike, message?: string): void;
  /** Check that shape volume ≈ expected mm³ within tolerance. */
  volumeApprox(label: string, shape: VerifyShapeLike, expected: number, tolerance?: number): void;
  /** Check that shape surface area ≈ expected mm² within tolerance. */
  areaApprox(label: string, shape: VerifyShapeLike, expected: number, tolerance?: number): void;
  /** Check that bounding box dimensions ≈ [sizeX, sizeY, sizeZ] within tolerance mm. */
  boundingBoxSize(label: string, shape: VerifyShapeLike, expectedSize: [number, number, number], tolerance?: number): void;
};
`;

// Use the generated types file; fall back to legacy inline string if somehow absent.
const FORGE_TYPES = forgeTypes || FORGE_TYPES_LEGACY;

export function CodeEditor() {
  const files = useForgeStore((s) => s.files);
  const activeFile = useForgeStore((s) => s.activeFile);
  const updateFileCode = useForgeStore((s) => s.updateFileCode);
  const execute = useForgeStore((s) => s.execute);
  const result = useForgeStore((s) => s.result);
  const isEvaluating = useForgeStore((s) => s.isEvaluating);
  const loadFromText = useForgeStore((s) => s.loadFromText);
  const theme = useForgeStore((s) => s.theme);
  const saveFile = useForgeStore((s) => s.saveFile);
  const pauseAutoEval = useForgeStore((s) => s.pauseAutoEval);
  const editorNavigate = useForgeStore((s) => s.editorNavigate);
  const clearEditorNavigate = useForgeStore((s) => s.clearEditorNavigate);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const code = files[activeFile] ?? '';

  // Clear pending save timer when switching files so we don't auto-save stale content
  useEffect(() => () => clearTimeout(saveTimerRef.current), [activeFile]);

  // Navigate to a source line when requested (e.g. clicking a failing verify check)
  useEffect(() => {
    if (!editorNavigate || !editorRef.current) return;
    const editor = editorRef.current;
    const { line } = editorNavigate;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    clearEditorNavigate();
  }, [editorNavigate, clearEditorNavigate]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.languages.typescript.javascriptDefaults.addExtraLib(FORGE_TYPES, 'forge.d.ts');
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    // Register custom themes so editor colors match the app theme
    monaco.editor.defineTheme('forge-gruvbox', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '928374', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'fb4934' },
        { token: 'string', foreground: 'b8bb26' },
        { token: 'number', foreground: 'd3869b' },
        { token: 'type', foreground: '83a598' },
        { token: 'identifier', foreground: 'ebdbb2' },
      ],
      colors: {
        'editor.background': '#282828',
        'editor.foreground': '#ebdbb2',
        'editor.lineHighlightBackground': '#32302f',
        'editorCursor.foreground': '#fe8019',
        'editor.selectionBackground': '#504945',
        'editor.inactiveSelectionBackground': '#3c3836',
        'editorLineNumber.foreground': '#665c54',
        'editorLineNumber.activeForeground': '#a89984',
        'editorIndentGuide.background1': '#3c3836',
        'editorWidget.background': '#1d2021',
        'editorWidget.border': '#504945',
        'input.background': '#1d2021',
        'input.foreground': '#ebdbb2',
        'input.border': '#504945',
        'scrollbarSlider.background': '#504945aa',
        'scrollbarSlider.hoverBackground': '#665c54aa',
      },
    });

    monaco.editor.defineTheme('forge-tokyo-night', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'bb9af7' },
        { token: 'string', foreground: '9ece6a' },
        { token: 'number', foreground: 'ff9e64' },
        { token: 'type', foreground: '7aa2f7' },
        { token: 'identifier', foreground: 'c0caf5' },
      ],
      colors: {
        'editor.background': '#1a1b26',
        'editor.foreground': '#c0caf5',
        'editor.lineHighlightBackground': '#1f2335',
        'editorCursor.foreground': '#7aa2f7',
        'editor.selectionBackground': '#33467c',
        'editor.inactiveSelectionBackground': '#292e42',
        'editorLineNumber.foreground': '#3b4261',
        'editorLineNumber.activeForeground': '#737aa2',
        'editorIndentGuide.background1': '#292e42',
        'editorWidget.background': '#16161e',
        'editorWidget.border': '#292e42',
        'input.background': '#16161e',
        'input.foreground': '#c0caf5',
        'input.border': '#292e42',
        'scrollbarSlider.background': '#292e42aa',
        'scrollbarSlider.hoverBackground': '#33467caa',
      },
    });

    monaco.editor.defineTheme('forge-kanagawa-lotus', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '8a8980', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c84053' },
        { token: 'string', foreground: '6f894e' },
        { token: 'number', foreground: 'd27e99' },
        { token: 'type', foreground: '4d699b' },
        { token: 'identifier', foreground: '545464' },
      ],
      colors: {
        'editor.background': '#f2ecbc',
        'editor.foreground': '#545464',
        'editor.lineHighlightBackground': '#e7dba0',
        'editorCursor.foreground': '#c84053',
        'editor.selectionBackground': '#c9b97a',
        'editor.inactiveSelectionBackground': '#d9d08e',
        'editorLineNumber.foreground': '#a8a070',
        'editorLineNumber.activeForeground': '#766b6b',
        'editorIndentGuide.background1': '#e0daa0',
        'editorWidget.background': '#f7f3d7',
        'editorWidget.border': '#d7d194',
        'input.background': '#f7f3d7',
        'input.foreground': '#545464',
        'input.border': '#d7d194',
        'scrollbarSlider.background': '#d7d194aa',
        'scrollbarSlider.hoverBackground': '#c9b97aaa',
      },
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      useForgeStore.getState().saveFile();
    });

    // Free Cmd+K so it reaches the window-level FileSwitcher handler
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      useForgeStore.getState().openFileSwitcher();
    });

    // Cmd+Enter — always trigger a build (useful in manual mode)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      useForgeStore.getState().execute();
    });
  };

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!value) return;
      updateFileCode(activeFile, value);
      clearTimeout(timerRef.current);
      if (!pauseAutoEval) {
        timerRef.current = setTimeout(() => execute(), 400);
      }
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveFile(), 1500);
    },
    [activeFile, updateFileCode, execute, saveFile, pauseAutoEval],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      droppedFiles.forEach((file) => {
        file.text().then((text) => loadFromText(text, file.name));
      });
    },
    [loadFromText],
  );

  return (
    <div
      data-fc-editor-surface="monaco"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          key={activeFile}
          defaultLanguage="javascript"
          theme={
            theme === 'gruvbox' ? 'forge-gruvbox'
            : theme === 'tokyo-night' ? 'forge-tokyo-night'
            : theme === 'kanagawa-lotus' ? 'forge-kanagawa-lotus'
            : theme === 'light' ? 'light'
            : 'vs-dark'
          }
          value={code}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
          }}
        />
      </div>
      {result?.error && (
        <div style={{ padding: '8px 12px', background: 'var(--fc-errorBg)', color: 'var(--fc-error)', fontSize: 13, fontFamily: 'monospace', maxHeight: 80, overflow: 'auto' }}>
          {result.error}
        </div>
      )}
      {result && !result.error && !isEvaluating && (() => {
        const failCount = result.verifications?.filter((v) => v.status === 'fail').length ?? 0;
        return (
          <div style={{
            padding: '4px 12px',
            background: failCount > 0 ? 'var(--fc-warningBg, rgba(230,168,23,0.12))' : 'var(--fc-successBg)',
            color: failCount > 0 ? 'var(--fc-warning, #e6a817)' : 'var(--fc-success)',
            fontSize: 12,
            fontFamily: 'monospace',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}>
            <span>✓ {result.timeMs.toFixed(1)}ms</span>
            {failCount > 0 && (
              <span>⚠ {failCount} check{failCount !== 1 ? 's' : ''} failed</span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

import { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useForgeStore } from '../store/forgeStore';

const FORGE_TYPES = `
declare function box(x: number, y: number, z: number, center?: boolean): TrackedShape;
declare function cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): TrackedShape;
declare function sphere(radius: number, segments?: number): Shape;
declare function union(...shapes: Shape[]): Shape;
declare function difference(...shapes: Shape[]): Shape;
declare function intersection(...shapes: Shape[]): Shape;
declare function param(name: string, defaultValue: number, opts?: { min?: number; max?: number; step?: number; unit?: string; integer?: boolean; reverse?: boolean }): number;
type PlaneSpec = { origin: [number, number, number]; normal: [number, number, number] } | { plane: 'XY' | 'XZ' | 'YZ'; offset?: number };
declare function intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch;
declare function projectToPlane(shape: Shape, plane: PlaneSpec): Sketch;

declare class Transform {
  static identity(): Transform;
  static translation(x: number, y: number, z: number): Transform;
  static rotationAxis(axis: [number, number, number], angleDeg: number, pivot?: [number, number, number]): Transform;
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
/** Import a 2D sketch from another file. Supports ".sketch.js" and ".svg". */
declare function importSketch(fileName: string, paramOverrides?: Record<string, number> | SvgImportOptions): Sketch;
/** Import a 3D part from another file. The file must return a Shape. */
declare function importPart(fileName: string, paramOverrides?: Record<string, number>): Shape;
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
declare function union2d(...sketches: Sketch[]): Sketch;
declare function difference2d(...sketches: Sketch[]): Sketch;
declare function intersection2d(...sketches: Sketch[]): Sketch;
declare function hull2d(...sketches: Sketch[]): Sketch;
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
  /** Reorient so primary axis (Z) points along given direction. E.g. cylinder(h,r).pointAlong([1,0,0]) lays it along X */
  pointAlong(direction: [number, number, number]): Shape;

  // Booleans
  add(other: Shape): Shape;
  subtract(other: Shape): Shape;
  intersect(other: Shape): Shape;

  // Smoothing
  smoothOut(minSharpAngle?: number, minSmoothness?: number): Shape;
  refine(n: number): Shape;
  refineToLength(length: number): Shape;
  refineToTolerance(tolerance: number): Shape;

  // Cutting
  split(cutter: Shape): [Shape, Shape];
  splitByPlane(normal: [number, number, number], offset?: number): [Shape, Shape];
  trimByPlane(normal: [number, number, number], offset?: number): Shape;
  hull(): Shape;

  // Deformation
  warp(fn: (vert: [number, number, number]) => void): Shape;
  simplify(tolerance?: number): Shape;

  // Color
  color(hex: string): Shape;

  // 3D Anchor positioning
  /** Position this shape relative to another using named 3D anchor points */
  attachTo(target: Shape, targetAnchor: Anchor3D, selfAnchor?: Anchor3D, offset?: [number, number, number]): Shape;
  /** Place on a face of a parent shape. u/v = position within face, protrude = outward distance */
  onFace(parent: Shape, face: 'front'|'back'|'left'|'right'|'top'|'bottom', opts?: { u?: number; v?: number; protrude?: number }): Shape;

  // Query
  volume(): number;
  surfaceArea(): number;
  boundingBox(): { min: number[]; max: number[] };
  isEmpty(): boolean;
  numTri(): number;
  minGap(other: Shape, searchLength: number): number;
}

declare class Sketch {
  clone(): Sketch;
  duplicate(): Sketch;
  translate(x: number, y?: number): Sketch;
  rotate(degrees: number): Sketch;
  scale(v: number | [number, number]): Sketch;
  mirror(ax: [number, number]): Sketch;
  add(other: Sketch): Sketch;
  subtract(other: Sketch): Sketch;
  intersect(other: Sketch): Sketch;
  offset(delta: number, join?: 'Square' | 'Round' | 'Miter'): Sketch;
  hull(): Sketch;
  simplify(epsilon?: number): Sketch;
  warp(fn: (vert: [number, number]) => void): Sketch;
  attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor, offset?: [number, number]): Sketch;
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
  face(name: string): { normal: [number, number, number]; center: [number, number, number] };
  edge(name: string): { start: [number, number, number]; end: [number, number, number] };
  faceNames(): string[];
  edgeNames(): string[];
  translate(dx: number, dy: number, dz: number): TrackedShape;
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
  /** Reorient so primary axis (Z) points along given direction */
  pointAlong(direction: [number, number, number]): TrackedShape;
  scale(v: number | [number, number, number]): TrackedShape;
  mirror(normal: [number, number, number]): TrackedShape;
  rotateAroundEdge(edgeName: string, angleDeg: number): TrackedShape;
  /** Position this shape relative to another using named 3D anchor points */
  attachTo(target: Shape | TrackedShape, targetAnchor: Anchor3D, selfAnchor?: Anchor3D, offset?: [number, number, number]): TrackedShape;
  /** Place on a face of a parent shape. u/v = position within face, protrude = outward distance */
  onFace(parent: Shape | TrackedShape, face: 'front'|'back'|'left'|'right'|'top'|'bottom', opts?: { u?: number; v?: number; protrude?: number }): TrackedShape;
  color(hex: string): TrackedShape;
  toShape(): Shape;
}

// --- Patterns ---
declare function linearPattern(shape: Shape, count: number, dx: number, dy: number, dz?: number): Shape;
declare function circularPattern(shape: Shape, count: number, centerX?: number, centerY?: number): Shape;
declare function mirrorCopy(shape: Shape, normal: [number, number, number]): Shape;

// --- Fillets & Chamfers ---
declare function filletEdge(shape: TrackedShape, edge: any, radius: number, quadrant?: [number, number], segments?: number): TrackedShape;
declare function chamferEdge(shape: TrackedShape, edge: any, size: number, quadrant?: [number, number]): TrackedShape;

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

// --- 3D Advanced ---
declare function hull3d(...args: (Shape | [number, number, number])[]): Shape;
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
  mode?: ExplodeDirection;
  axisLock?: ExplodeAxis;
  byName?: Record<string, ExplodeDirective>;
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
  keyframes: JointAnimationKeyframe[];
};
type JointsViewOptions = {
  enabled?: boolean;
  joints?: JointViewDef[];
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
  /** Internal ring gear with involute-derived tooth spaces. */
  ringGear(options: RingGearOptions): Shape;
  /** Linear rack gear with parametric pressure-angle flanks. */
  rackGear(options: RackGearOptions): Shape;
  /** Pair-level ratio/backlash/contact diagnostics with optional auto-placement. */
  gearPair(options: { pinion: Shape | GearPairSpec; gear: Shape | GearPairSpec; backlash?: number; centerDistance?: number; place?: boolean; phaseDeg?: number }): GearPairResult;
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

// --- Group ---
/** Group multiple shapes/sketches for joint transforms without merging meshes. Colors preserved. */
declare function group(...items: (Shape | Sketch | TrackedShape | ShapeGroup)[]): ShapeGroup;

declare class ShapeGroup {
  readonly children: (Shape | Sketch | TrackedShape | ShapeGroup)[];
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
  /** Reorient all 3D children so primary axis (Z) points along given direction */
  pointAlong(direction: [number, number, number]): ShapeGroup;
  /** Apply a 4x4 transform matrix or Transform to all 3D children */
  transform(m: number[] | Transform): ShapeGroup;
  scale(v: number | [number, number, number]): ShapeGroup;
  mirror(normal: [number, number, number]): ShapeGroup;
  color(hex: string): ShapeGroup;
}

/** Define a named section/cut plane. Appears as a toggle in the View Panel. When enabled, geometry on the normal side is clipped away. */
declare function cutPlane(name: string, normal: [number, number, number], offset?: number): void;
/** Override default viewport explode behavior (global slider still controls amount). */
declare function explodeView(options?: ExplodeViewOptions): void;
/** Register viewport-only runtime joint sliders (no script rerun). */
declare function jointsView(options?: JointsViewOptions): void;
/** Configure viewport helper visuals (hovered joint axis/arc, stroke sizes, colors). */
declare function viewConfig(options?: ViewConfigOptions): void;
`;

export function CodeEditor() {
  const files = useForgeStore((s) => s.files);
  const activeFile = useForgeStore((s) => s.activeFile);
  const updateFileCode = useForgeStore((s) => s.updateFileCode);
  const execute = useForgeStore((s) => s.execute);
  const result = useForgeStore((s) => s.result);
  const loadFromText = useForgeStore((s) => s.loadFromText);
  const theme = useForgeStore((s) => s.theme);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const code = files[activeFile] ?? '';

  const handleMount: OnMount = (editor, monaco) => {
    monaco.languages.typescript.javascriptDefaults.addExtraLib(FORGE_TYPES, 'forge.d.ts');
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      useForgeStore.getState().saveFile();
    });

    // Free Cmd+K so it reaches the window-level FileSwitcher handler
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      useForgeStore.getState().openFileSwitcher();
    });
  };

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!value) return;
      updateFileCode(activeFile, value);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => execute(), 400);
    },
    [activeFile, updateFileCode, execute],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      file.text().then((text) => loadFromText(text, file.name));
    },
    [loadFromText],
  );

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          key={activeFile}
          defaultLanguage="javascript"
          theme={theme === 'light' || theme === 'kanagawa-lotus' ? 'light' : 'vs-dark'}
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
      {result && !result.error && (
        <div style={{ padding: '4px 12px', background: 'var(--fc-successBg)', color: 'var(--fc-success)', fontSize: 12, fontFamily: 'monospace' }}>
          ✓ {result.timeMs.toFixed(1)}ms
        </div>
      )}
    </div>
  );
}

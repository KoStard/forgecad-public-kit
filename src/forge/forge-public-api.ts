/**
 * ForgeCAD Public API — entry point for Monaco type generation.
 *
 * This file is NOT imported at runtime. It is the input to `dts-bundle-generator`
 * which produces `forge-api.d.ts`, loaded by CodeEditor as an ambient type
 * string for Monaco intellisense.
 *
 * Rules:
 *  - Re-export classes and types directly from their source modules so the
 *    generator inlines all method signatures automatically.
 *  - For runtime-wrapper functions (box, cylinder, union, etc.) whose public
 *    signature differs from the underlying kernel implementation, declare them
 *    here with the correct public types using typed `const` re-exports.
 *  - `lib` (partLibrary) is re-exported directly so its inferred object type
 *    is always in sync with library.ts.
 */

// ─── Re-exports: classes whose types come entirely from source ────────────────

export type {
  AssemblyPart,
  BomRow,
  ConnectOptions,
  GearCouplingOptions,
  GearRatioLike,
  JointCouplingOptions as AssemblyJointCouplingOptions,
  JointCouplingTerm,
  JointOptions as AssemblyJointOptions,
  JointState as AssemblyJointState,
  JointType as AssemblyJointType,
  PartMetadata as AssemblyPartMetadata,
  PartOptions as AssemblyPartOptions,
  ToJointsViewOptions,
} from './assembly/assembly';
export { Assembly, assembly, bomToCsv, ImportedAssembly, SolvedAssembly } from './assembly/assembly';
export { explodeView } from './assembly/explodeView';
export { joint } from './assembly/joint';
export { jointsView } from './assembly/jointsView';
export { bom } from './bom';
export { cutPlane } from './cutPlane';
export { chamferEdgeSegment, filletEdgeSegment } from './edge-features/edgeSegmentFeatures';
export { robotExport } from './export/robotExport';
export type { FaceQuery, FaceSelector } from './face-tracking/faceQuery';
export type { BossOptions, PocketOptions } from './faceOps';
export type { EdgeSelector } from './fillet';
export { chamfer, draft, fillet, offsetSolid } from './fillet';
export { group, ShapeGroup } from './group';
export type { GeometryBackend, GeometryFidelity, GeometryInfo, GeometryRepresentation, GeometrySource, GeometryTopology } from './kernel';
export { Shape } from './kernel';
// `lib` — re-export the partLibrary object as `lib` so its full inferred type
// (all the gear/pipe/extrusion helpers) is always in sync with library.ts.
export { partLibrary as lib } from './library';
export { boolParam, param } from './params';
export type { PortAlign, PortDef, PortInput, PortMap } from './port';
export { port } from './port';
export type { BoundingRegion, EdgeQuery, EdgeSegment } from './query/edgeQuery';
export { coalesceEdges, selectEdge, selectEdges } from './query/edgeQuery';
export type {
  SceneBackgroundGradient,
  SceneBloomConfig,
  SceneCameraConfig,
  SceneEnvironmentConfig,
  SceneFogConfig,
  SceneGrainConfig,
  SceneGroundConfig,
  SceneLightConfig,
  SceneLightType,
  SceneOptions,
  ScenePostProcessingConfig,
  SceneVignetteConfig,
} from './scene';
export { scene } from './scene';
export { viewConfig } from './scene/viewConfig';
export { faceProfile, intersectWithPlane, projectToPlane } from './section';
export { SheetMetalPart, sheetMetal } from './sheetMetal';
export type {
  Anchor,
  ConstrainedPolygon,
  ConstrainedRect,
  ConstrainedRegularPolygon,
  PolygonOptions,
  RectOptions,
  RectSideName,
  RectVertexName,
  RegularPolygonOptions,
  SketchDxfOptions,
  SketchSvgOptions,
  SvgImportOptions,
} from './sketch';
export {
  addPolygon,
  addRect,
  addRegularPolygon,
  arcBridgeBetweenRects,
  Circle2D,
  Constraint,
  ConstraintSketch,
  Curve3D,
  chamferEdge,
  circle,
  circle2d,
  circularPattern,
  circularPattern2d,
  connectEdges,
  constrainedSketch,
  degrees,
  difference2d,
  dim,
  dimLine,
  ellipse,
  filletCorners,
  filletEdge,
  HermiteCurve3D,
  hermiteTransition,
  hermiteTransitionG2,
  intersection2d,
  Line2D,
  line,
  linearPattern,
  linearPattern2d,
  loadFont,
  loft,
  mirrorCopy,
  ngon,
  Point2D,
  path,
  pickEdge,
  pickEdgeSegment,
  point,
  polygon,
  QuinticHermiteCurve3D,
  Rectangle2D,
  radians,
  rect,
  rectangle,
  roundedRect,
  Sketch,
  sketchToDxf,
  sketchToSvg,
  slot,
  spline2d,
  spline3d,
  star,
  stroke,
  sweep,
  TrackedShape,
  text2d,
  textWidth,
  transitionCurve,
  transitionCurveFromPoints,
  transitionSurface,
  union2d,
} from './sketch';
export type { CircleId, LineDistanceConstraint, LineId, PointId } from './sketch/constraints';
// ConstrainedSketchBuilder is the main win: all constraint methods are inlined
// automatically from the source class — addLoop, fix, horizontal, etc.
export { ConstrainedSketchBuilder } from './sketch/constraints';
export type { HighlightOptions } from './sketch/highlights';
export { composeChain, Transform } from './transform';
export { verify } from './verification';

// ─── Wrapper functions: differ from their kernel/sketch source signatures ─────
//
// The runner wraps these to accept/return TrackedShape.  We declare them here
// with the PUBLIC signatures users actually see.

import type { ImportedAssembly as _ImportedAssembly } from './assembly/assembly';
import type { ShapeGroup as _ShapeGroup } from './group';
import type { Shape as _Shape } from './kernel';
import type { Sketch as _Sketch, SvgImportOptions as _SvgImportOptions, TrackedShape } from './sketch';

type _ShapeOperand = _Shape | TrackedShape;

/**
 * Create a rectangular box with named faces and edges.
 * When center is false (default), one corner sits at the origin.
 * Returns a TrackedShape with faces (top, bottom, side-left, side-right, side-top, side-bottom)
 * and edges (vert-bl, vert-br, vert-tr, vert-tl, etc.).
 */
export declare function box(x: number, y: number, z: number, center?: boolean): TrackedShape;
/**
 * Create a cylinder or cone with named faces and edges.
 * When radiusTop differs from radius, creates a tapered cone. Use segments for regular prisms.
 * Returns a TrackedShape with faces (top, bottom, side) and edges (top-rim, bottom-rim).
 */
export declare function cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): TrackedShape;
/** Create a sphere centered at the origin. Use segments for lower-poly approximations. */
export declare function sphere(radius: number, segments?: number): _Shape;
/** Create a torus (donut shape) centered at the origin, lying in the XY plane. */
export declare function torus(majorRadius: number, minorRadius: number, segments?: number): _Shape;
/** Combine shapes into a single solid (additive boolean). Accepts individual shapes or arrays. */
export declare function union(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
/** Subtract shapes from a base shape. The first shape is the base; all subsequent shapes are subtracted. */
export declare function difference(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
/** Keep only the overlapping volume of the input shapes (intersection boolean). */
export declare function intersection(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
// Cross-file imports (runtime-provided; types declared here for completeness)
/** Import a sketch from another ForgeCAD file or SVG. For .forge.js files, pass param overrides; for .svg files, pass SVG import options. */
export declare function importSketch(fileName: string, paramOverrides?: Record<string, number> | _SvgImportOptions): _Sketch;
/** Import a part from another ForgeCAD file. Returns a chainable Shape. The target file must return a Shape or TrackedShape. */
export declare function importPart(fileName: string, paramOverrides?: Record<string, number>): _Shape;
/** Import a group from another ForgeCAD file. The target file must return a ShapeGroup via group(). */
export declare function importGroup(fileName: string, paramOverrides?: Record<string, number>): _ShapeGroup;
/** Import an assembly from another ForgeCAD file. The target file must return an unsolved Assembly instance. */
export declare function importAssembly(fileName: string, paramOverrides?: Record<string, number>): _ImportedAssembly;
/** Parse an SVG file and return it as a Sketch with options for region filtering, scaling, and simplification. */
export declare function importSvgSketch(fileName: string, options?: _SvgImportOptions): _Sketch;
/** Import an external mesh file (STL, OBJ, 3MF) as a Shape. */
export declare function importMesh(fileName: string, options?: { scale?: number; center?: boolean }): _Shape;

import type { HighlightOptions as _HighlightOptions } from './sketch/highlights';
import type { EdgeRef as _EdgeRef, FaceRef as _FaceRef } from './sketch/topology';

/**
 * Highlight any geometry for visual debugging in the viewport.
 *
 * Supported inputs:
 * - `string` — sketch entity ID (e.g. `'L0'`, `'P0'`, `'C0'`)
 * - `[x, y, z]` — 3D point
 * - `[[x1,y1,z1], [x2,y2,z2]]` — edge (line segment)
 * - `{ normal: [x,y,z], offset: number }` — plane by normal + distance from origin
 * - `{ normal: [x,y,z], point: [x,y,z] }` — plane by normal + point on plane
 * - `Shape` or `TrackedShape` — highlight entire 3D shape
 * - `FaceRef` (from `shape.face('top')`) — highlight as plane at face center
 * - `EdgeRef` (from `shape.edge('left')`) — highlight as edge segment
 */
export declare function highlight(entityId: string, opts?: _HighlightOptions): void;
export declare function highlight(point: [number, number, number], opts?: _HighlightOptions): void;
export declare function highlight(edge: [[number, number, number], [number, number, number]], opts?: _HighlightOptions): void;
export declare function highlight(plane: { normal: [number, number, number]; offset: number }, opts?: _HighlightOptions): void;
export declare function highlight(
  plane: { normal: [number, number, number]; point: [number, number, number] },
  opts?: _HighlightOptions,
): void;
export declare function highlight(shape: _Shape | TrackedShape, opts?: _HighlightOptions): void;
export declare function highlight(face: _FaceRef, opts?: _HighlightOptions): void;
export declare function highlight(edge: _EdgeRef, opts?: _HighlightOptions): void;

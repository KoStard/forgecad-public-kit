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
  GearCouplingOptions,
  GearRatioLike,
  JointCouplingOptions as AssemblyJointCouplingOptions,
  JointCouplingTerm,
  JointOptions as AssemblyJointOptions,
  JointState as AssemblyJointState,
  JointType as AssemblyJointType,
  PartMetadata as AssemblyPartMetadata,
  PartOptions as AssemblyPartOptions,
} from './assembly/assembly';
export { Assembly, assembly, bomToCsv, ImportedAssembly, SolvedAssembly } from './assembly/assembly';
export { bom } from './bom';
export { cutPlane } from './cutPlane';
export type { BoundingRegion, EdgeQuery, EdgeSegment } from './edgeQuery';
export { coalesceEdges, selectEdge, selectEdges } from './edgeQuery';
export { chamferEdgeSegment, filletEdgeSegment } from './edge-features/edgeSegmentFeatures';
export { explodeView } from './assembly/explodeView';
export type { EdgeSelector } from './fillet';
export { chamfer, draft, fillet, offsetSolid } from './fillet';
export { group, ShapeGroup } from './group';
export { joint } from './assembly/joint';
export { jointsView } from './assembly/jointsView';
export type { GeometryBackend, GeometryFidelity, GeometryInfo, GeometryRepresentation, GeometrySource, GeometryTopology } from './kernel';
export { Shape } from './kernel';
// `lib` — re-export the partLibrary object as `lib` so its full inferred type
// (all the gear/pipe/extrusion helpers) is always in sync with library.ts.
export { partLibrary as lib } from './library';
export { boolParam, param } from './params';
export { robotExport } from './export/robotExport';
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
export { intersectWithPlane, projectToPlane } from './section';
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
  constrainedSketch,
  degrees,
  difference2d,
  dim,
  dimLine,
  ellipse,
  filletCorners,
  filletEdge,
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
  point,
  polygon,
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
  union2d,
} from './sketch';
export type { CircleId, LineDistanceConstraint, LineId, PointId } from './sketch/constraints';
// ConstrainedSketchBuilder is the main win: all constraint methods are inlined
// automatically from the source class — addLoop, fix, horizontal, etc.
export { ConstrainedSketchBuilder } from './sketch/constraints';
export type { HighlightOptions } from './sketch/highlights';
export { composeChain, Transform } from './transform';
export { verify } from './verification';
export { viewConfig } from './scene/viewConfig';

// ─── Wrapper functions: differ from their kernel/sketch source signatures ─────
//
// The runner wraps these to accept/return TrackedShape.  We declare them here
// with the PUBLIC signatures users actually see.

import type { ImportedAssembly as _ImportedAssembly } from './assembly/assembly';
import type { ShapeGroup as _ShapeGroup } from './group';
import type { Shape as _Shape } from './kernel';
import type { Sketch as _Sketch, SvgImportOptions as _SvgImportOptions, TrackedShape } from './sketch';

type _ShapeOperand = _Shape | TrackedShape;

export declare function box(x: number, y: number, z: number, center?: boolean): TrackedShape;
export declare function cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): TrackedShape;
export declare function sphere(radius: number, segments?: number): _Shape;
export declare function torus(majorRadius: number, minorRadius: number, segments?: number): _Shape;
export declare function union(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
export declare function difference(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
export declare function intersection(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
// Cross-file imports (runtime-provided; types declared here for completeness)
export declare function importSketch(fileName: string, paramOverrides?: Record<string, number> | _SvgImportOptions): _Sketch;
export declare function importPart(fileName: string, paramOverrides?: Record<string, number>): _Shape;
export declare function importGroup(fileName: string, paramOverrides?: Record<string, number>): _ShapeGroup;
export declare function importAssembly(fileName: string, paramOverrides?: Record<string, number>): _ImportedAssembly;
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

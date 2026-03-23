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

export { Shape } from './kernel';
export type { GeometryInfo, GeometryBackend, GeometryRepresentation, GeometryFidelity, GeometryTopology, GeometrySource } from './kernel';

export {
  Sketch,
  TrackedShape,
  Point2D,
  Line2D,
  Circle2D,
  Rectangle2D,
  Constraint,
  rect,
  circle2d,
  roundedRect,
  polygon,
  ngon,
  ellipse,
  slot,
  star,
  union2d,
  difference2d,
  intersection2d,
  hull2d,
  path,
  stroke,
  constrainedSketch,
  ConstraintSketch,
  point,
  line,
  circle,
  rectangle,
  degrees,
  radians,
  linearPattern,
  circularPattern,
  mirrorCopy,
  filletCorners,
  filletEdge,
  chamferEdge,
  arcBridgeBetweenRects,
  Curve3D,
  spline2d,
  spline3d,
  loft,
  sweep,
  text2d,
  textWidth,
  loadFont,
  dim,
  dimLine,
  addRect,
  addPolygon,
  addRegularPolygon,
  sketchToSvg,
  sketchToDxf,
} from './sketch';

export type {
  Anchor,
  SvgImportOptions,
  SketchSvgOptions,
  SketchDxfOptions,
  RectOptions,
  RectVertexName,
  RectSideName,
  ConstrainedRect,
  PolygonOptions,
  ConstrainedPolygon,
  RegularPolygonOptions,
  ConstrainedRegularPolygon,
} from './sketch';

// ConstrainedSketchBuilder is the main win: all constraint methods are inlined
// automatically from the source class — addLoop, fix, horizontal, etc.
export { ConstrainedSketchBuilder } from './sketch/constraints';
export type { PointId, LineId, CircleId, LineDistanceConstraint } from './sketch/constraints';

export { param, boolParam } from './params';
export { Transform, composeChain } from './transform';
export { Assembly, SolvedAssembly, ImportedAssembly, assembly, bomToCsv } from './assembly';
export type {
  AssemblyPart,
  JointType as AssemblyJointType,
  JointState as AssemblyJointState,
  PartMetadata as AssemblyPartMetadata,
  PartOptions as AssemblyPartOptions,
  JointOptions as AssemblyJointOptions,
  JointCouplingTerm,
  JointCouplingOptions as AssemblyJointCouplingOptions,
  GearRatioLike,
  GearCouplingOptions,
  BomRow,
} from './assembly';
export { joint } from './joint';
export { ShapeGroup, group } from './group';
export { cutPlane } from './cutPlane';
export { bom } from './bom';
export { robotExport } from './robotExport';
export { verify } from './verification';
export { explodeView } from './explodeView';
export { jointsView } from './jointsView';
export { viewConfig } from './viewConfig';
export { scene } from './scene';
export type {
  SceneOptions,
  SceneCameraConfig,
  SceneLightConfig,
  SceneLightType,
  SceneEnvironmentConfig,
  SceneBackgroundGradient,
  SceneFogConfig,
  SceneBloomConfig,
  SceneVignetteConfig,
  SceneGrainConfig,
  ScenePostProcessingConfig,
  SceneGroundConfig,
} from './scene';
export { sheetMetal, SheetMetalPart } from './sheetMetal';
export { intersectWithPlane, projectToPlane } from './section';
export { selectEdge, selectEdges, coalesceEdges } from './edgeQuery';
export type { EdgeSegment, EdgeQuery, BoundingRegion } from './edgeQuery';
export { filletEdgeSegment, chamferEdgeSegment } from './edgeSegmentFeatures';

export type { HighlightOptions } from './sketch/highlights';

// `lib` — re-export the partLibrary object as `lib` so its full inferred type
// (all the gear/pipe/extrusion helpers) is always in sync with library.ts.
export { partLibrary as lib } from './library';

// ─── Wrapper functions: differ from their kernel/sketch source signatures ─────
//
// The runner wraps these to accept/return TrackedShape.  We declare them here
// with the PUBLIC signatures users actually see.

import type { Shape as _Shape } from './kernel';
import type { TrackedShape, Sketch as _Sketch, SvgImportOptions as _SvgImportOptions } from './sketch';
import type { ShapeGroup as _ShapeGroup } from './group';
import type { ImportedAssembly as _ImportedAssembly } from './assembly';

type _ShapeOperand = _Shape | TrackedShape;

export declare function box(x: number, y: number, z: number, center?: boolean): TrackedShape;
export declare function cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): TrackedShape;
export declare function sphere(radius: number, segments?: number): _Shape;
export declare function union(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
export declare function difference(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
export declare function intersection(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
export declare function hull3d(...args: (_Shape | TrackedShape | [number, number, number])[]): _Shape;
// Cross-file imports (runtime-provided; types declared here for completeness)
export declare function importSketch(fileName: string, paramOverrides?: Record<string, number> | _SvgImportOptions): _Sketch;
export declare function importPart(fileName: string, paramOverrides?: Record<string, number>): _Shape;
export declare function importGroup(fileName: string, paramOverrides?: Record<string, number>): _ShapeGroup;
export declare function importAssembly(fileName: string, paramOverrides?: Record<string, number>): _ImportedAssembly;
export declare function importSvgSketch(fileName: string, options?: _SvgImportOptions): _Sketch;
/** Import an external mesh file (STL, OBJ, 3MF) as a Shape. */
export declare function importMesh(fileName: string, options?: { scale?: number; center?: boolean }): _Shape;

import type { HighlightOptions as _HighlightOptions } from './sketch/highlights';
import type { FaceRef as _FaceRef, EdgeRef as _EdgeRef } from './sketch/topology';

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
export declare function highlight(plane: { normal: [number, number, number]; point: [number, number, number] }, opts?: _HighlightOptions): void;
export declare function highlight(shape: _Shape | TrackedShape, opts?: _HighlightOptions): void;
export declare function highlight(face: _FaceRef, opts?: _HighlightOptions): void;
export declare function highlight(edge: _EdgeRef, opts?: _HighlightOptions): void;

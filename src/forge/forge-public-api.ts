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
  dim,
  dimLine,
  addRect,
  addPolygon,
  addRegularPolygon,
} from './sketch';

export type {
  Anchor,
  SvgImportOptions,
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
export { sheetMetal, SheetMetalPart } from './sheetMetal';
export { intersectWithPlane, projectToPlane } from './section';

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
export declare function levelSet(
  sdf: (p: [number, number, number]) => number,
  bounds: { min: [number, number, number]; max: [number, number, number] },
  edgeLength: number,
  level?: number,
): _Shape;

// Cross-file imports (runtime-provided; types declared here for completeness)
export declare function importSketch(fileName: string, paramOverrides?: Record<string, number> | _SvgImportOptions): _Sketch;
export declare function importPart(fileName: string, paramOverrides?: Record<string, number>): _Shape;
export declare function importGroup(fileName: string, paramOverrides?: Record<string, number>): _ShapeGroup;
export declare function importAssembly(fileName: string, paramOverrides?: Record<string, number>): _ImportedAssembly;
export declare function importSvgSketch(fileName: string, options?: _SvgImportOptions): _Sketch;

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
//
// Each export is tagged with @concept for the API taxonomy system.
// See docs/temporary/projects/2026/03/31/api-taxonomy/PLAN.md for concept definitions.
//
// Concept tags:
//   primitive    — C1: create geometry from parameters
//   boolean      — C2: CSG set operations
//   transform    — C3: rigid repositioning
//   promotion    — C4: 2D → 3D (extrude, revolve, loft, sweep)
//   topology     — C5: face/edge queries on shapes
//   edge-feature — C6: fillets, chamfers, draft, offset
//   pattern      — C7: linear/circular/mirror replication
//   constraint   — C8: constraint solver
//   placement    — C9: attachTo, onFace, ports, references
//   assembly     — C10: parts + joints + kinematics
//   param        — C11: UI parameters + dimensions
//   demotion     — C12: 3D → 2D (section, projection)
//   export       — C13: STL, 3MF, SVG, DXF, SDF, PDF, G-code
//   visual       — C14: highlight, scene, viewConfig, color, material
//   import       — C15: require, importSvg, importMesh, group
//   library      — C16: pre-built parametric parts (lib.*)

// ── assembly (C10) ──────────────────────────────────────────────────────────────
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
/** @concept assembly */ export { Assembly, assembly, bomToCsv, ImportedAssembly, SolvedAssembly } from './assembly/assembly';
/** @concept visual */ export { explodeView } from './assembly/explodeView';
/** @concept assembly */ export { joint } from './assembly/joint';
/** @concept assembly */ export { jointsView } from './assembly/jointsView';

// ── export (C13) ────────────────────────────────────────────────────────────────
/** @concept export */ export { bom } from './bom';
/** @concept export */ export { robotExport } from './export/robotExport';

// ── visual (C14) ────────────────────────────────────────────────────────────────
/** @concept visual */ export { cutPlane } from './cutPlane';

// ── edge-feature (C6) ───────────────────────────────────────────────────────────
/** @concept edge-feature */ export { chamferEdgeSegment, filletEdgeSegment } from './edge-features/edgeSegmentFeatures';

// ── topology (C5) ───────────────────────────────────────────────────────────────
export type { FaceQuery, FaceSelector } from './face-tracking/faceQuery';
export type { BossOptions, PocketOptions } from './faceOps';
export type { EdgeSelector } from './fillet';

// ── edge-feature (C6) ───────────────────────────────────────────────────────────
/** @concept edge-feature */ export { chamfer, draft, fillet, offsetSolid } from './fillet';

// ── import (C15) ────────────────────────────────────────────────────────────────
/** @concept import */ export { group, ShapeGroup } from './group';

// ── primitive (C1) / core types ─────────────────────────────────────────────────
export type { GeometryBackend, GeometryFidelity, GeometryInfo, GeometryRepresentation, GeometrySource, GeometryTopology } from './kernel';
/** @concept primitive */ export { Shape, sdf } from './kernel';

// ── library (C16) ───────────────────────────────────────────────────────────────
// Re-export the partLibrary object as `lib` so its full inferred type
// (all the gear/pipe/extrusion helpers) is always in sync with library.ts.
/** @concept library */ export { partLibrary as lib } from './library';

// ── param (C11) ─────────────────────────────────────────────────────────────────
/** @concept param */ export { boolParam, param } from './params';

// ── placement (C9) ──────────────────────────────────────────────────────────────
export type { PortAlign, PortDef, PortInput, PortMap } from './port';
/** @concept placement */ export { port } from './port';

// ── topology (C5) ───────────────────────────────────────────────────────────────
export type { BoundingRegion, EdgeQuery, EdgeSegment } from './query/edgeQuery';
/** @concept topology */ export { coalesceEdges, selectEdge, selectEdges } from './query/edgeQuery';

// ── visual (C14) ────────────────────────────────────────────────────────────────
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
/** @concept visual */ export { scene } from './scene';
/** @concept visual */ export { viewConfig } from './scene/viewConfig';

// ── demotion (C12) ──────────────────────────────────────────────────────────────
/** @concept demotion */ export { faceProfile, intersectWithPlane, projectToPlane } from './section';

// ── export (C13) / sheet metal ──────────────────────────────────────────────────
/** @concept export */ export { SheetMetalPart, sheetMetal } from './sheetMetal';

// ── sketch types ────────────────────────────────────────────────────────────────
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
  CircularLayoutOptions,
  CircularPatternOptions,
  LayoutPoint,
  PolygonVerticesOptions,
} from './sketch';

// ── sketch: mixed concepts ──────────────────────────────────────────────────────
// Each function is tagged individually; they span multiple concepts.
export {
  /** @concept constraint */ addPolygon,
  /** @concept constraint */ addRect,
  /** @concept constraint */ addRegularPolygon,
  /** @concept primitive */ arcBridgeBetweenRects,
  /** @concept primitive */ Circle2D,
  /** @concept constraint */ Constraint,
  /** @concept constraint */ ConstraintSketch,
  /** @concept promotion */ Curve3D,
  /** @concept edge-feature */ chamferEdge,
  /** @concept constraint */ circle,
  /** @concept primitive */ circle2d,
  /** @concept pattern */ circularLayout,
  /** @concept pattern */ circularPattern,
  /** @concept pattern */ circularPattern2d,
  /** @concept promotion */ connectEdges,
  /** @concept constraint */ constrainedSketch,
  /** @concept transform */ degrees,
  /** @concept boolean */ difference2d,
  /** @concept param */ dim,
  /** @concept param */ dimLine,
  /** @concept primitive */ ellipse,
  /** @concept edge-feature */ filletCorners,
  /** @concept edge-feature */ filletEdge,
  /** @concept promotion */ HermiteCurve3D,
  /** @concept promotion */ hermiteTransition,
  /** @concept promotion */ hermiteTransitionG2,
  /** @concept boolean */ intersection2d,
  /** @concept primitive */ Line2D,
  /** @concept constraint */ line,
  /** @concept pattern */ linearPattern,
  /** @concept pattern */ linearPattern2d,
  /** @concept primitive */ loadFont,
  /** @concept promotion */ loft,
  /** @concept promotion */ loftAlongSpine,
  /** @concept pattern */ mirrorCopy,
  /** @concept primitive */ ngon,
  /** @concept primitive */ Point2D,
  /** @concept primitive */ path,
  /** @concept topology */ pickEdge,
  /** @concept topology */ pickEdgeSegment,
  /** @concept constraint */ point,
  /** @concept primitive */ polar,
  /** @concept primitive */ polygon,
  /** @concept primitive */ polygonVertices,
  /** @concept promotion */ QuinticHermiteCurve3D,
  /** @concept primitive */ Rectangle2D,
  /** @concept transform */ radians,
  /** @concept primitive */ rect,
  /** @concept primitive */ rectangle,
  /** @concept primitive */ arcSlot,
  type PerimeterCircle,
  type PerimeterFillet,
  type PerimeterStep,
  /** @concept primitive */ routePerimeter,
  /** @concept primitive */ roundedRect,
  /** @concept primitive */ Sketch,
  /** @concept export */ sketchToDxf,
  /** @concept export */ sketchToSvg,
  /** @concept primitive */ slot,
  /** @concept primitive */ spline2d,
  /** @concept promotion */ spline3d,
  /** @concept primitive */ star,
  /** @concept primitive */ stroke,
  /** @concept promotion */ surfacePatch,
  /** @concept promotion */ sweep,
  /** @concept topology */ TrackedShape,
  /** @concept promotion */ variableSweep,
  /** @concept primitive */ text2d,
  /** @concept primitive */ textWidth,
  /** @concept promotion */ transitionCurve,
  /** @concept promotion */ transitionCurveFromPoints,
  /** @concept promotion */ transitionSurface,
  /** @concept boolean */ union2d,
} from './sketch';

// ── constraint (C8) ─────────────────────────────────────────────────────────────
export type { CircleId, LineDistanceConstraint, LineId, PointId } from './sketch/constraints';
// ConstrainedSketchBuilder is the main win: all constraint methods are inlined
// automatically from the source class — addLoop, fix, horizontal, etc.
/** @concept constraint */ export { ConstrainedSketchBuilder, routeStepFactories } from './sketch/constraints';

// ── visual (C14) ────────────────────────────────────────────────────────────────
export type { HighlightOptions } from './sketch/highlights';

// ── topology (C5) ───────────────────────────────────────────────────────────────
export type { EdgeRef, FaceRef } from './sketch/topology';

// ── transform (C3) ──────────────────────────────────────────────────────────────
/** @concept transform */ export { composeChain, Transform } from './transform';

// ── visual (C14) ────────────────────────────────────────────────────────────────
export type { Spec, SpecResult } from './verification';
/** @concept visual */ export { spec, verify } from './verification';

// ─── Wrapper functions: differ from their kernel/sketch source signatures ─────
//
// The runner wraps these to accept/return TrackedShape.  We declare them here
// with the PUBLIC signatures users actually see.

import type { Shape as _Shape } from './kernel';
import type { Sketch as _Sketch, SvgImportOptions as _SvgImportOptions, TrackedShape } from './sketch';

type _ShapeOperand = _Shape | TrackedShape;

/**
 * Create a rectangular box with named faces and edges.
 * When center is false (default), one corner sits at the origin.
 * Returns a TrackedShape with faces (top, bottom, side-left, side-right, side-top, side-bottom)
 * and edges (vert-bl, vert-br, vert-tr, vert-tl, etc.).
 * @concept primitive
 */
export declare function box(x: number, y: number, z: number, center?: boolean): TrackedShape;
/**
 * Create a cylinder or cone with named faces and edges.
 * When radiusTop differs from radius, creates a tapered cone. Use segments for regular prisms.
 * Returns a TrackedShape with faces (top, bottom, side) and edges (top-rim, bottom-rim).
 * @concept primitive
 */
export declare function cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): TrackedShape;
/** Create a sphere centered at the origin. Use segments for lower-poly approximations. @concept primitive */
export declare function sphere(radius: number, segments?: number): _Shape;
/** Create a torus (donut shape) centered at the origin, lying in the XY plane. @concept primitive */
export declare function torus(majorRadius: number, minorRadius: number, segments?: number): _Shape;
/** Combine shapes into a single solid (additive boolean). Accepts individual shapes or arrays. @concept boolean */
export declare function union(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
/** Subtract shapes from a base shape. The first shape is the base; all subsequent shapes are subtracted. @concept boolean */
export declare function difference(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
/** Keep only the overlapping volume of the input shapes (intersection boolean). @concept boolean */
export declare function intersection(...shapes: (_ShapeOperand | _ShapeOperand[])[]): _Shape;
// Cross-file imports (runtime-provided; types declared here for completeness)
/** Import a module with optional ForgeCAD parameter overrides. Returns the module's exports. @concept import */
export declare function require(path: string, paramOverrides?: Record<string, number>): any;
/** Parse an SVG file and return it as a Sketch with options for region filtering, scaling, and simplification. @concept import */
export declare function importSvgSketch(fileName: string, options?: _SvgImportOptions): _Sketch;
/** Import an external mesh file (STL, OBJ, 3MF) as a Shape. @concept import */
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

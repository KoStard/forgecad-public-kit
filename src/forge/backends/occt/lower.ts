/**
 * ForgeCAD — Compile Plan → OCCT Lowering
 *
 * Lowers the backend-agnostic CompilePlan IR into OCCT TopoDS_Shape operations.
 * Handles: primitives, booleans, extrude, revolve, loft, sweep, fillet, chamfer, transforms.
 * Pure OCCT — no Manifold dependencies.
 */

import {
  assertExhaustive,
  type ProfileCompilePlan,
  type ProfileCompileTransformStep,
  type ShapeCompilePlan,
  type ShapeCompileTransformStep,
} from '../../compilePlan';
import { resolveSupportedEdgeFeatureSelection } from '../../edge-features/edgeFeatureResolution';
import { lowerCutShapeCompilePlanToConcretePlan, lowerHoleShapeCompilePlanToConcretePlan } from '../../holeCutCompilePlan';
import type { ProfileBackend } from '../../profileBackend';
import type { ShapeBackend } from '../../shapeBackend';
import { lowerSheetMetalBasePlan } from '../../sheetMetalModel';
import { lowerShellShapeCompilePlanToConcretePlan } from '../../shellCompilePlan';
import { Transform } from '../../transform';
import { getOCCT, type OCCTModule } from './init';
import { wrapOCCTProfileBackend } from './profileBackend';
import { wrapOCCTShapeBackend } from './shapeBackend';

// ─── Wire Utilities ──────────────────────────────────────────────────

/** Edge count threshold above which polygon wires are converted to B-spline wires for loft/sweep. */
const BSPLINE_WIRE_THRESHOLD = 20;

/**
 * Extract ordered 3D vertices from a wire's edges.
 * Returns the points along the wire, in order.
 */
function extractWirePoints(oc: OCCTModule, wire: any): [number, number, number][] {
  const points: [number, number, number][] = [];
  const edgeExpl = new oc.TopExp_Explorer_2(wire, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  while (edgeExpl.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExpl.Current());
    const first = { current: 0 };
    const last = { current: 0 };
    const curve = oc.BRep_Tool.Curve_2(edge, first, last);
    if (!curve.IsNull()) {
      const isReversed = edge.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
      const pt = curve.get().Value(isReversed ? last.current : first.current);
      points.push([pt.X(), pt.Y(), pt.Z()]);
    }
    edgeExpl.Next();
  }
  return points;
}

/**
 * Count the number of edges in a wire.
 */
function countWireEdges(oc: OCCTModule, wire: any): number {
  let count = 0;
  const edgeExpl = new oc.TopExp_Explorer_2(wire, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (edgeExpl.More()) {
    count++;
    edgeExpl.Next();
  }
  return count;
}

/**
 * Build a B-spline wire from 3D points.
 *
 * For polygon wires with many edges (>BSPLINE_WIRE_THRESHOLD), fitting a B-spline
 * through the vertices produces a single-edge wire. This is critical for
 * BRepOffsetAPI_ThruSections performance: loft with 5 × 120-edge polygon wires
 * hangs (>60s), while 5 × 1-edge B-spline wires completes in ~30ms.
 */
function buildBSplineWireFromPoints(oc: OCCTModule, points: [number, number, number][], closed: boolean): any {
  const n = points.length;
  // For closed curves, duplicate the first point to ensure closure
  const count = closed ? n + 1 : n;
  const pts = new oc.TColgp_Array1OfPnt_2(1, count);
  for (let i = 0; i < n; i++) {
    pts.SetValue(i + 1, new oc.gp_Pnt_3(points[i][0], points[i][1], points[i][2]));
  }
  if (closed) {
    pts.SetValue(count, new oc.gp_Pnt_3(points[0][0], points[0][1], points[0][2]));
  }

  const bspline = new oc.GeomAPI_PointsToBSpline_2(
    pts,
    3, // DegMin
    8, // DegMax
    oc.GeomAbs_Shape.GeomAbs_C2,
    1e-3, // Tol3D
  );
  if (!bspline.IsDone()) {
    throw new Error('B-spline fit failed for wire with ' + n + ' points');
  }
  // Upcast Handle_Geom_BSplineCurve → Handle_Geom_Curve for MakeEdge
  const curveHandle = new oc.Handle_Geom_Curve_2(bspline.Curve().get());
  const edge = new oc.BRepBuilderAPI_MakeEdge_24(curveHandle);
  return new oc.BRepBuilderAPI_MakeWire_2(edge.Edge()).Wire();
}

/**
 * Convert a multi-edge polygon wire to a B-spline wire if it has many edges.
 * Returns the original wire if edge count is below threshold.
 *
 * Using all extracted points (no subsampling) produces smoother B-spline
 * surfaces, which dramatically speeds up downstream boolean operations
 * (5s vs 22s with subsampled points).
 */
function toBSplineWireIfNeeded(oc: OCCTModule, wire: any): any {
  const edgeCount = countWireEdges(oc, wire);
  if (edgeCount < BSPLINE_WIRE_THRESHOLD) return wire;

  const points = extractWirePoints(oc, wire);
  if (points.length < 3) return wire;

  // Polygon wires from profiles are always closed (polygon loop → face → outerWire).
  const isClosed = edgeCount >= BSPLINE_WIRE_THRESHOLD;
  return buildBSplineWireFromPoints(oc, points, isClosed);
}

// ─── Profile → OCCT Wire/Face ──────────────────────────────────────

/**
 * Build an OCCT TopoDS_Wire from a list of 2D points (closed polygon).
 */
function buildWireFromPoints(oc: OCCTModule, points: [number, number][]): any {
  if (points.length < 3) throw new Error('Need at least 3 points for a wire');

  const edges: any[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    // Skip degenerate (zero-length) edges from duplicate consecutive vertices
    if (Math.abs(x1 - x2) < 1e-10 && Math.abs(y1 - y2) < 1e-10) continue;
    const edge = new oc.BRepBuilderAPI_MakeEdge_3(new oc.gp_Pnt_3(x1, y1, 0), new oc.gp_Pnt_3(x2, y2, 0)).Edge();
    edges.push(edge);
  }

  const mkWire = new oc.BRepBuilderAPI_MakeWire_2(edges[0]);
  for (let i = 1; i < edges.length; i++) {
    mkWire.Add_1(edges[i]);
  }
  return mkWire.Wire();
}

/**
 * Build an OCCT TopoDS_Face from a wire on the XY plane.
 */
function buildFaceFromWire(oc: OCCTModule, wire: any): any {
  const face = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
  return face.Face();
}

/**
 * Convert an arbitrary TopoDS_Shape to a TopoDS_Face.
 * Handles compounds (from offset/boolean ops) by extracting the first wire
 * and building a face from it. If the shape is already a face, returns it as-is.
 */
function shapeToFace(oc: OCCTModule, shape: any): any {
  const shapeType = shape.ShapeType();
  // Already a face
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
    return shape;
  }
  // It's a wire — make a face from it
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
    return buildFaceFromWire(oc, oc.TopoDS.Wire_1(shape));
  }
  // Compound or other — extract wires and build a face.
  // If there are multiple wires, the first is the outer boundary and the rest are holes.
  const wires: any[] = [];
  const wireExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (wireExpl.More()) {
    wires.push(oc.TopoDS.Wire_1(wireExpl.Current()));
    wireExpl.Next();
  }
  if (wires.length === 0) {
    // Try to find faces directly
    const faceExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    if (faceExpl.More()) {
      return oc.TopoDS.Face_1(faceExpl.Current());
    }
    throw new Error('Cannot convert shape to face — no wires or faces found');
  }
  // Build face from the outer wire (largest area)
  if (wires.length === 1) {
    return buildFaceFromWire(oc, wires[0]);
  }
  // Multiple wires: outer boundary + holes
  const mkFace = new oc.BRepBuilderAPI_MakeFace_15(wires[0], true);
  for (let i = 1; i < wires.length; i++) {
    mkFace.Add(wires[i]);
  }
  return mkFace.Face();
}

/**
 * Merge coplanar face fragments from a boolean result into a single face.
 *
 * Profile boolean operations (fuse, cut, common) produce compounds of
 * face fragments. These compounds work fine as inputs to further booleans
 * and extrude/revolve, but some operations (offset, polygon extraction)
 * need a single coherent face. This function uses ShapeUpgrade_UnifySameDomain
 * to merge the fragments.
 */
function unifyProfileShape(oc: OCCTModule, shape: any): any {
  // Already a single face — nothing to unify
  if (shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE) return shape;
  const unify = new oc.ShapeUpgrade_UnifySameDomain_2(shape, true, true, false);
  unify.Build();
  return shapeToFace(oc, unify.Shape());
}

/**
 * Lower a ProfileCompilePlan to an OCCT shape on the XY plane (z=0).
 *
 * May return a single TopoDS_Face or a compound of faces (for boolean
 * operations that produce disconnected regions). Consumers that need
 * a single face should call unifyProfileShape() on the result.
 */
function lowerProfileToFace(oc: OCCTModule, plan: ProfileCompilePlan): any {
  let face: any;

  switch (plan.kind) {
    case 'rect': {
      const x0 = plan.center ? -plan.width / 2 : 0;
      const y0 = plan.center ? -plan.height / 2 : 0;
      const points: [number, number][] = [
        [x0, y0],
        [x0 + plan.width, y0],
        [x0 + plan.width, y0 + plan.height],
        [x0, y0 + plan.height],
      ];
      const wire = buildWireFromPoints(oc, points);
      face = buildFaceFromWire(oc, wire);
      break;
    }

    case 'roundedRect': {
      // Build rounded rect directly with line segments and arc corners.
      const r = Math.min(plan.radius, plan.width / 2, plan.height / 2);
      const w = plan.width;
      const h = plan.height;
      const cx = plan.center ? 0 : w / 2;
      const cy = plan.center ? 0 : h / 2;
      const hw = w / 2;
      const hh = h / 2;

      if (r < 1e-10) {
        // No rounding — plain rect
        const pts: [number, number][] = [
          [cx - hw, cy - hh],
          [cx + hw, cy - hh],
          [cx + hw, cy + hh],
          [cx - hw, cy + hh],
        ];
        face = buildFaceFromWire(oc, buildWireFromPoints(oc, pts));
      } else {
        // Rounded rect: 4 line edges + 4 arc edges (90° each).
        // Walk counter-clockwise starting from bottom-right corner.
        const mkWire = new oc.BRepBuilderAPI_MakeWire_1();

        // Corner arc centers and their start angle (radians, CCW from +X)
        const arcs: { acx: number; acy: number; startRad: number }[] = [
          { acx: cx + hw - r, acy: cy - hh + r, startRad: -Math.PI / 2 }, // bottom-right
          { acx: cx + hw - r, acy: cy + hh - r, startRad: 0 }, // top-right
          { acx: cx - hw + r, acy: cy + hh - r, startRad: Math.PI / 2 }, // top-left
          { acx: cx - hw + r, acy: cy - hh + r, startRad: Math.PI }, // bottom-left
        ];

        // Each segment: line from prev arc end → this arc start, then 90° arc.
        for (let i = 0; i < 4; i++) {
          const arc = arcs[i];
          const prevArc = arcs[(i + 3) % 4];
          // Previous arc end point
          const prevEndAngle = prevArc.startRad + Math.PI / 2;
          const lx1 = prevArc.acx + r * Math.cos(prevEndAngle);
          const ly1 = prevArc.acy + r * Math.sin(prevEndAngle);
          // This arc start point
          const lx2 = arc.acx + r * Math.cos(arc.startRad);
          const ly2 = arc.acy + r * Math.sin(arc.startRad);

          // Line segment (skip if degenerate)
          if (Math.abs(lx1 - lx2) > 1e-10 || Math.abs(ly1 - ly2) > 1e-10) {
            mkWire.Add_1(new oc.BRepBuilderAPI_MakeEdge_3(new oc.gp_Pnt_3(lx1, ly1, 0), new oc.gp_Pnt_3(lx2, ly2, 0)).Edge());
          }

          // 90° arc
          const axis = new oc.gp_Ax2_3(new oc.gp_Pnt_3(arc.acx, arc.acy, 0), new oc.gp_Dir_4(0, 0, 1));
          const circ = new oc.gp_Circ_2(axis, r);
          const arcEdge = new oc.BRepBuilderAPI_MakeEdge_9(circ, arc.startRad, arc.startRad + Math.PI / 2).Edge();
          mkWire.Add_1(arcEdge);
        }

        face = buildFaceFromWire(oc, mkWire.Wire());
      }
      break;
    }

    case 'circle': {
      const axis = new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 0, 1));
      const circle = new oc.gp_Circ_2(axis, plan.radius);
      const edge = new oc.BRepBuilderAPI_MakeEdge_8(circle).Edge();
      const wire = new oc.BRepBuilderAPI_MakeWire_2(edge).Wire();
      face = buildFaceFromWire(oc, wire);
      break;
    }

    case 'polygon': {
      const wire = buildWireFromPoints(oc, plan.points);
      face = buildFaceFromWire(oc, wire);
      break;
    }

    case 'boolean': {
      const shapes = plan.profiles.map((p) => lowerProfileToFace(oc, p));
      if (shapes.length === 0) throw new Error('Cannot lower empty profile boolean');
      if (shapes.length === 1) {
        face = shapes[0];
        break;
      }

      // Use list-based boolean API for all operations.
      // Pairwise chaining via shapeToFace creates faces with internal partition
      // edges that corrupt subsequent boolean operations (double-counted overlap).
      const args = new oc.TopTools_ListOfShape_1();
      args.Append_1(shapes[0]);
      const tools = new oc.TopTools_ListOfShape_1();
      for (let i = 1; i < shapes.length; i++) tools.Append_1(shapes[i]);

      let op: any;
      switch (plan.op) {
        case 'union':
          op = new oc.BRepAlgoAPI_Fuse_1();
          break;
        case 'difference':
          op = new oc.BRepAlgoAPI_Cut_1();
          break;
        case 'intersection':
          op = new oc.BRepAlgoAPI_Common_1();
          break;
      }
      op.SetArguments(args);
      op.SetTools(tools);
      op.Build(new oc.Message_ProgressRange_1());
      let result = op.Shape();

      // Merge coplanar face fragments. The boolean produces a compound
      // of face fragments; UnifySameDomain merges adjacent coplanar faces
      // while preserving disconnected regions as separate faces.
      const unify = new oc.ShapeUpgrade_UnifySameDomain_2(result, true, true, false);
      unify.Build();

      // Return the shape directly — may be a single face or a compound
      // of faces (disconnected regions). Do NOT force into a single face
      // via shapeToFace — that would merge wires from disconnected faces
      // into a broken topology.
      face = unify.Shape();
      break;
    }

    case 'offset': {
      const baseShape = lowerProfileToFace(oc, plan.base);
      // Offset requires a single face, not a compound of fragments
      const baseFace = unifyProfileShape(oc, baseShape);
      const offsetMaker = new oc.BRepOffsetAPI_MakeOffset_2(baseFace, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
      offsetMaker.Perform(plan.delta, 0);
      if (offsetMaker.IsDone()) {
        // MakeOffset returns a compound of wires, not a face.
        // Extract the outermost wire and rebuild a face.
        face = shapeToFace(oc, offsetMaker.Shape());
      } else {
        face = baseFace; // Fallback
      }
      break;
    }

    case 'project':
      throw new OCCTUnsupportedError('profile project');

    default:
      assertExhaustive(plan);
  }

  // Apply 2D transforms
  face = applyProfileTransforms(oc, face, plan.transforms);
  return face;
}

function applyProfileTransforms(oc: OCCTModule, shape: any, transforms: ProfileCompileTransformStep[]): any {
  let result = shape;
  for (const step of transforms) {
    const trsf = new oc.gp_Trsf_1();
    switch (step.kind) {
      case 'translate':
        trsf.SetTranslation_1(new oc.gp_Vec_4(step.x, step.y, 0));
        break;
      case 'rotate':
        trsf.SetRotation_1(new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 0, 1)), (step.degrees * Math.PI) / 180);
        break;
      case 'scale': {
        // Non-uniform 2D scale via GTrsf
        const gtrsf = new oc.gp_GTrsf_1();
        gtrsf.SetValue(1, 1, step.x);
        gtrsf.SetValue(2, 2, step.y);
        gtrsf.SetValue(3, 3, 1);
        const transformed = new oc.BRepBuilderAPI_GTransform_2(result, gtrsf, true);
        result = transformed.Shape();
        continue;
      }
      case 'mirror':
        trsf.SetMirror_3(new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(step.normalX, step.normalY, 0)));
        break;
    }
    const transformed = new oc.BRepBuilderAPI_Transform_2(result, trsf, true);
    result = transformed.Shape();
  }
  return result;
}

// ─── Shape → OCCT TopoDS_Shape ─────────────────────────────────────

function applyShapeTransform(oc: OCCTModule, shape: any, step: ShapeCompileTransformStep): any {
  const trsf = new oc.gp_Trsf_1();
  switch (step.kind) {
    case 'translate':
      trsf.SetTranslation_1(new oc.gp_Vec_4(step.x, step.y, step.z));
      break;
    case 'rotate': {
      // Euler angles — apply Z, Y, X in sequence
      const mat = Transform.rotationAxis([1, 0, 0], step.xDeg).rotateAxis([0, 1, 0], step.yDeg).rotateAxis([0, 0, 1], step.zDeg).toArray();
      trsf.SetValues(mat[0], mat[4], mat[8], mat[12], mat[1], mat[5], mat[9], mat[13], mat[2], mat[6], mat[10], mat[14]);
      break;
    }
    case 'scale': {
      if (step.x === step.y && step.y === step.z) {
        trsf.SetScaleFactor(step.x);
        break;
      }
      // Non-uniform scale
      const gtrsf = new oc.gp_GTrsf_1();
      gtrsf.SetValue(1, 1, step.x);
      gtrsf.SetValue(2, 2, step.y);
      gtrsf.SetValue(3, 3, step.z);
      const transformed = new oc.BRepBuilderAPI_GTransform_2(shape, gtrsf, true);
      return transformed.Shape();
    }
    case 'rotateAround': {
      const mat = Transform.rotationAxis([step.axisX, step.axisY, step.axisZ], step.degrees, [
        step.pivotX,
        step.pivotY,
        step.pivotZ,
      ]).toArray();
      trsf.SetValues(mat[0], mat[4], mat[8], mat[12], mat[1], mat[5], mat[9], mat[13], mat[2], mat[6], mat[10], mat[14]);
      break;
    }
    case 'mirror':
      trsf.SetMirror_3(new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(step.normalX, step.normalY, step.normalZ)));
      break;
    case 'workplanePlacement': {
      const m = step.matrix;
      trsf.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14]);
      break;
    }
  }
  const transformed = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  return transformed.Shape();
}

function applyShapeTransforms(oc: OCCTModule, shape: any, steps: ShapeCompileTransformStep[]): any {
  let result = shape;
  for (const step of steps) {
    result = applyShapeTransform(oc, result, step);
  }
  return result;
}

function lowerBooleanPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'boolean' }>): any {
  const shapes = plan.shapes.map((s) => lowerShapeCompilePlanToOCCT(s, oc));
  if (shapes.length === 0) throw new Error('Cannot lower empty boolean');
  if (shapes.length === 1) return shapes[0];

  return occtNativeBoolean(oc, plan.op, shapes);
}

/**
 * OCCT native boolean via BRepAlgoAPI.
 */
function occtNativeBoolean(oc: OCCTModule, boolOp: string, shapes: any[]): any {
  if (shapes.length === 2) {
    const op =
      boolOp === 'union'
        ? new oc.BRepAlgoAPI_Fuse_3(shapes[0], shapes[1], new oc.Message_ProgressRange_1())
        : boolOp === 'difference'
          ? new oc.BRepAlgoAPI_Cut_3(shapes[0], shapes[1], new oc.Message_ProgressRange_1())
          : new oc.BRepAlgoAPI_Common_3(shapes[0], shapes[1], new oc.Message_ProgressRange_1());
    op.Build(new oc.Message_ProgressRange_1());
    return op.Shape();
  }

  // Intersection must be applied pairwise: A ∩ B ∩ C.
  // The N-shape BRepAlgoAPI_Common computes A ∩ (B ∪ C), which is wrong for 3+ shapes.
  if (boolOp === 'intersection') {
    let result = shapes[0];
    for (let i = 1; i < shapes.length; i++) {
      const op = new oc.BRepAlgoAPI_Common_3(result, shapes[i], new oc.Message_ProgressRange_1());
      op.Build(new oc.Message_ProgressRange_1());
      result = op.Shape();
    }
    return result;
  }

  // Union and difference: N-shape API.
  // A ∪ B ∪ C via single call. A - (B ∪ C) = A - B - C.
  const args = new oc.TopTools_ListOfShape_1();
  args.Append_1(shapes[0]);
  const tools = new oc.TopTools_ListOfShape_1();
  for (let i = 1; i < shapes.length; i++) tools.Append_1(shapes[i]);

  const op = boolOp === 'union' ? new oc.BRepAlgoAPI_Fuse_1() : new oc.BRepAlgoAPI_Cut_1();
  op.SetArguments(args);
  op.SetTools(tools);
  op.Build(new oc.Message_ProgressRange_1());
  return op.Shape();
}

function lowerFilletPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'fillet' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);

  const selection = resolveSupportedEdgeFeatureSelection(plan.base, plan.edge);
  if (!selection.ok) throw new Error(selection.issue.reason);
  if (selection.selection.quadrant[0] !== plan.quadrant[0] || selection.selection.quadrant[1] !== plan.quadrant[1]) {
    throw new Error(
      `filletEdge() currently supports ${selection.selection.edgeName} only with quadrant [${selection.selection.quadrant[0]}, ${selection.selection.quadrant[1]}].`,
    );
  }

  // Find the matching edge in the OCCT shape
  // Use the edge selection data to identify which edge to fillet
  const mkFillet = new oc.BRepFilletAPI_MakeFillet(base, oc.ChFi3d_FilletShape.ChFi3d_Rational);

  // Find the edge closest to the selection's start/end points
  const sel = selection.selection;
  const midX = (sel.start[0] + sel.end[0]) / 2;
  const midY = (sel.start[1] + sel.end[1]) / 2;
  const midZ = (sel.start[2] + sel.end[2]) / 2;

  let bestEdge: any = null;
  let bestDist = Infinity;

  const edgeExpl = new oc.TopExp_Explorer_2(base, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (edgeExpl.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExpl.Current());
    // Get edge midpoint via BRep_Tool
    const first = { current: 0 };
    const last = { current: 0 };
    const curve = oc.BRep_Tool.Curve_2(edge, first, last);
    if (!curve.IsNull()) {
      const midParam = (first.current + last.current) / 2;
      const pt = curve.get().Value(midParam);
      const dx = pt.X() - midX;
      const dy = pt.Y() - midY;
      const dz = pt.Z() - midZ;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = edge;
      }
    }
    edgeExpl.Next();
  }

  if (!bestEdge) throw new Error('Could not find matching edge for fillet');

  mkFillet.Add_2(plan.radius, bestEdge);
  mkFillet.Build(new oc.Message_ProgressRange_1());

  if (!mkFillet.IsDone()) {
    throw new Error('OCCT fillet operation failed');
  }

  return mkFillet.Shape();
}

function lowerChamferPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'chamfer' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);

  const selection = resolveSupportedEdgeFeatureSelection(plan.base, plan.edge);
  if (!selection.ok) throw new Error(selection.issue.reason);

  const mkChamfer = new oc.BRepFilletAPI_MakeChamfer(base);

  const sel = selection.selection;
  const midX = (sel.start[0] + sel.end[0]) / 2;
  const midY = (sel.start[1] + sel.end[1]) / 2;
  const midZ = (sel.start[2] + sel.end[2]) / 2;

  let bestEdge: any = null;
  let bestDist = Infinity;

  const edgeExpl = new oc.TopExp_Explorer_2(base, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (edgeExpl.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExpl.Current());
    const first = { current: 0 };
    const last = { current: 0 };
    const curve = oc.BRep_Tool.Curve_2(edge, first, last);
    if (!curve.IsNull()) {
      const midParam = (first.current + last.current) / 2;
      const pt = curve.get().Value(midParam);
      const dx = pt.X() - midX;
      const dy = pt.Y() - midY;
      const dz = pt.Z() - midZ;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = edge;
      }
    }
    edgeExpl.Next();
  }

  if (!bestEdge) throw new Error('Could not find matching edge for chamfer');

  mkChamfer.Add_2(plan.size, bestEdge);
  mkChamfer.Build(new oc.Message_ProgressRange_1());

  if (!mkChamfer.IsDone()) {
    throw new Error('OCCT chamfer operation failed');
  }

  return mkChamfer.Shape();
}

function findOCCTEdgeByMidpoint(oc: OCCTModule, shape: any, midpoint: [number, number, number]): any {
  let bestEdge: any = null;
  let bestDist = Infinity;
  const edgeExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (edgeExpl.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExpl.Current());
    const first = { current: 0 };
    const last = { current: 0 };
    const curve = oc.BRep_Tool.Curve_2(edge, first, last);
    if (!curve.IsNull()) {
      const midParam = (first.current + last.current) / 2;
      const pt = curve.get().Value(midParam);
      const dx = pt.X() - midpoint[0];
      const dy = pt.Y() - midpoint[1];
      const dz = pt.Z() - midpoint[2];
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = edge;
      }
    }
    edgeExpl.Next();
  }
  return bestEdge;
}

function lowerFilletEdgesPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'filletEdges' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
  const mkFillet = new oc.BRepFilletAPI_MakeFillet(base, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  let addedCount = 0;
  for (const target of plan.edgeTargets) {
    const matchedEdge = findOCCTEdgeByMidpoint(oc, base, target.midpoint);
    if (matchedEdge) {
      mkFillet.Add_2(plan.radius, matchedEdge);
      addedCount++;
    }
  }
  if (addedCount === 0) {
    throw new Error('filletEdges(): no matching OCCT edges found for the given selection.');
  }
  mkFillet.Build(new oc.Message_ProgressRange_1());
  if (!mkFillet.IsDone()) {
    throw new Error(`filletEdges(): OCCT fillet operation failed (radius=${plan.radius}, ${addedCount} edges).`);
  }
  return mkFillet.Shape();
}

function lowerChamferEdgesPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'chamferEdges' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
  const mkChamfer = new oc.BRepFilletAPI_MakeChamfer(base);
  let addedCount = 0;
  for (const target of plan.edgeTargets) {
    const matchedEdge = findOCCTEdgeByMidpoint(oc, base, target.midpoint);
    if (matchedEdge) {
      mkChamfer.Add_2(plan.size, matchedEdge);
      addedCount++;
    }
  }
  if (addedCount === 0) {
    throw new Error('chamferEdges(): no matching OCCT edges found for the given selection.');
  }
  mkChamfer.Build(new oc.Message_ProgressRange_1());
  if (!mkChamfer.IsDone()) {
    throw new Error(`chamferEdges(): OCCT chamfer operation failed (size=${plan.size}, ${addedCount} edges).`);
  }
  return mkChamfer.Shape();
}

function lowerDraftPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'draft' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
  const angleRad = (plan.angleDeg * Math.PI) / 180;
  const dir = new oc.gp_Dir_4(plan.pullDirection[0], plan.pullDirection[1], plan.pullDirection[2]);
  const neutralPln = new oc.gp_Pln_3(
    new oc.gp_Pnt_3(
      plan.pullDirection[0] * plan.neutralPlaneOffset,
      plan.pullDirection[1] * plan.neutralPlaneOffset,
      plan.pullDirection[2] * plan.neutralPlaneOffset,
    ),
    dir,
  );

  // Check if BRepOffsetAPI_DraftAngle is available in the bindings
  if (typeof (oc as any).BRepOffsetAPI_DraftAngle_2 !== 'function' && typeof (oc as any).BRepOffsetAPI_DraftAngle_1 !== 'function') {
    throw new Error(
      'draft() is not available — the OCCT WASM build does not include BRepOffsetAPI_DraftAngle. ' +
        'This operation requires a full OCCT build with the BRepOffsetAPI module.',
    );
  }

  // Try _2 (shape constructor) first, fall back to _1
  let draftMaker: any;
  if (typeof (oc as any).BRepOffsetAPI_DraftAngle_2 === 'function') {
    draftMaker = new (oc as any).BRepOffsetAPI_DraftAngle_2(base);
  } else {
    draftMaker = new (oc as any).BRepOffsetAPI_DraftAngle_1();
    draftMaker.Init(base);
  }

  // Add draft to all faces
  const explorer = new oc.TopExp_Explorer_2(base, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let addedCount = 0;
  while (explorer.More()) {
    const face = oc.TopoDS.Face_1(explorer.Current());
    try {
      draftMaker.Add(face, dir, angleRad, neutralPln);
      addedCount++;
    } catch {
      // Skip faces that can't be drafted (e.g. perpendicular to pull direction)
    }
    explorer.Next();
  }
  if (addedCount === 0) {
    throw new Error('draft(): no faces could be drafted — check pull direction relative to shape geometry.');
  }

  draftMaker.Build(new oc.Message_ProgressRange_1());
  if (!draftMaker.IsDone()) {
    throw new Error(`draft(): OCCT draft operation failed (angle=${plan.angleDeg}°, ${addedCount} faces).`);
  }
  return draftMaker.Shape();
}

function lowerOffsetSolidPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'offsetSolid' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
  try {
    // Check if BRepOffsetAPI_MakeOffsetShape is available
    if (
      typeof (oc as any).BRepOffsetAPI_MakeOffsetShape !== 'function' &&
      typeof (oc as any).BRepOffsetAPI_MakeOffsetShape_1 !== 'function'
    ) {
      throw new Error(
        'offsetSolid() is not available — the OCCT WASM build does not include BRepOffsetAPI_MakeOffsetShape. ' +
          'This operation requires a full OCCT build with the BRepOffsetAPI module.',
      );
    }

    let offsetMaker: any;
    if (typeof (oc as any).BRepOffsetAPI_MakeOffsetShape_1 === 'function') {
      offsetMaker = new (oc as any).BRepOffsetAPI_MakeOffsetShape_1();
    } else {
      offsetMaker = new (oc as any).BRepOffsetAPI_MakeOffsetShape();
    }

    offsetMaker.PerformByJoin(
      base,
      plan.thickness,
      1e-3, // tolerance
      (oc as any).BRepOffset_Mode.BRepOffset_Skin,
      false, // intersection
      false, // selfInter
      (oc as any).GeomAbs_JoinType.GeomAbs_Arc,
      false, // thickenSolid
      new oc.Message_ProgressRange_1(),
    );

    if (!offsetMaker.IsDone()) {
      throw new Error('Offset solid operation failed');
    }
    return offsetMaker.Shape();
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('offsetSolid()')) throw e;
    throw new Error(`offsetSolid() failed: ${e instanceof Error ? e.message : e}. Try a smaller thickness value.`);
  }
}

/**
 * Lower a ShapeCompilePlan into an OCCT TopoDS_Shape.
 *
 * Throws for operations that require Manifold (levelSet, etc.)
 * — the caller should catch and fall back to the Manifold lowerer.
 */
export function lowerShapeCompilePlanToOCCT(plan: ShapeCompilePlan, oc?: OCCTModule): any {
  // Return cached OCCT shape if this plan node was already lowered.
  // The cache is set on plan objects by this function and preserved
  // across clones by cloneShapeCompilePlan(). This avoids re-lowering
  // the entire plan tree on every chained Shape operation.
  const cached = (plan as any)._occtCache;
  if (cached) return cached;

  const shape = _lowerShapeCompilePlanToOCCTInner(plan, oc);
  (plan as any)._occtCache = shape;
  return shape;
}

function _lowerShapeCompilePlanToOCCTInner(plan: ShapeCompilePlan, oc?: OCCTModule): any {
  if (!oc) oc = getOCCT();

  let _result: any;
  switch (plan.kind) {
    case 'box':
      if (plan.center) {
        const box = new oc.BRepPrimAPI_MakeBox_2(plan.x, plan.y, plan.z);
        const trsf = new oc.gp_Trsf_1();
        trsf.SetTranslation_1(new oc.gp_Vec_4(-plan.x / 2, -plan.y / 2, -plan.z / 2));
        const transformed = new oc.BRepBuilderAPI_Transform_2(box.Shape(), trsf, true);
        return transformed.Shape();
      }
      return new oc.BRepPrimAPI_MakeBox_2(plan.x, plan.y, plan.z).Shape();

    case 'cylinder': {
      const radiusTop = plan.radiusTop != null && plan.radiusTop >= 0 ? plan.radiusTop : plan.radius;
      let shape: any;
      if (Math.abs(radiusTop - plan.radius) < 1e-10) {
        shape = new oc.BRepPrimAPI_MakeCylinder_1(plan.radius, plan.height).Shape();
      } else {
        // Cone/frustum
        shape = new oc.BRepPrimAPI_MakeCone_1(plan.radius, radiusTop, plan.height).Shape();
      }
      if (plan.center) {
        const trsf = new oc.gp_Trsf_1();
        trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, -plan.height / 2));
        const transformed = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
        return transformed.Shape();
      }
      return shape;
    }

    case 'sphere':
      return new oc.BRepPrimAPI_MakeSphere_1(plan.radius).Shape();

    case 'torus':
      return new oc.BRepPrimAPI_MakeTorus_1(plan.majorRadius, plan.minorRadius).Shape();

    case 'extrude': {
      const rawFace = lowerProfileToFace(oc, plan.profile);
      const height = plan.height;

      if (plan.scaleTop && (plan.scaleTop[0] !== 1 || plan.scaleTop[1] !== 1)) {
        return lowerExtrudeWithScaleTop(oc, plan);
      }

      if (plan.twist && Math.abs(plan.twist) > 1e-6) {
        // Twist needs a single face for extractOuterWire
        return lowerExtrudeWithTwist(oc, plan, unifyProfileShape(oc, rawFace));
      }

      // Simple extrude works with compounds (face fragments from booleans)
      const vec = new oc.gp_Vec_4(0, 0, height);
      const prism = new oc.BRepPrimAPI_MakePrism_1(rawFace, vec, false, true);
      prism.Build(new oc.Message_ProgressRange_1());
      let result = prism.Shape();

      if (plan.center) {
        const trsf = new oc.gp_Trsf_1();
        trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, -height / 2));
        const transformed = new oc.BRepBuilderAPI_Transform_2(result, trsf, true);
        result = transformed.Shape();
      }

      return result;
    }

    case 'revolve': {
      const face = lowerProfileToFace(oc, plan.profile);
      // Manifold revolve maps 2D-X → radial distance, 2D-Y → 3D-Z height,
      // revolving around Z. The OCCT face lives in XY (z=0), so rotate it
      // 90° around X to move it into the XZ plane before revolving around Z.
      const rot = new oc.gp_Trsf_1();
      rot.SetRotation_1(new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(1, 0, 0)), Math.PI / 2);
      const rotated = new oc.BRepBuilderAPI_Transform_2(face, rot, true);
      const rotatedFace = rotated.Shape();

      const axis = new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 0, 1));
      const degrees = plan.degrees ?? 360;
      const radians = (degrees * Math.PI) / 180;
      const revol = new oc.BRepPrimAPI_MakeRevol_1(rotatedFace, axis, radians, true);
      revol.Build(new oc.Message_ProgressRange_1());
      if (!revol.IsDone()) {
        throw new Error('OCCT revolve failed — profile may be too complex or self-intersecting');
      }
      return revol.Shape();
    }

    case 'boolean':
      return lowerBooleanPlan(oc, plan);

    case 'transform': {
      const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
      return applyShapeTransforms(oc, base, plan.steps);
    }

    case 'queryOwner':
      return lowerShapeCompilePlanToOCCT(plan.base, oc);

    case 'fillet':
      return lowerFilletPlan(oc, plan);

    case 'chamfer':
      return lowerChamferPlan(oc, plan);

    case 'filletEdges':
      return lowerFilletEdgesPlan(oc, plan);

    case 'chamferEdges':
      return lowerChamferEdgesPlan(oc, plan);

    case 'draft':
      return lowerDraftPlan(oc, plan);

    case 'offsetSolid':
      return lowerOffsetSolidPlan(oc, plan);

    case 'trimByPlane': {
      const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
      const normal = [plan.normalX, plan.normalY, plan.normalZ] as [number, number, number];
      const pnt = new oc.gp_Pnt_3(normal[0] * plan.originOffset, normal[1] * plan.originOffset, normal[2] * plan.originOffset);
      const pln = new oc.gp_Pln_3(pnt, new oc.gp_Dir_4(normal[0], normal[1], normal[2]));
      const halfSpaceFace = new oc.BRepBuilderAPI_MakeFace_9(pln, -1e6, 1e6, -1e6, 1e6).Face();
      const halfSpace = new oc.BRepPrimAPI_MakeHalfSpace_1(
        halfSpaceFace,
        new oc.gp_Pnt_3(normal[0] * (plan.originOffset - 1), normal[1] * (plan.originOffset - 1), normal[2] * (plan.originOffset - 1)),
      );
      const cut = new oc.BRepAlgoAPI_Cut_3(base, halfSpace.Solid(), new oc.Message_ProgressRange_1());
      cut.Build(new oc.Message_ProgressRange_1());
      return cut.Shape();
    }

    case 'shell': {
      const lowered = lowerShellShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToOCCT(lowered.plan, oc);
    }

    case 'hole': {
      const lowered = lowerHoleShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToOCCT(lowered.plan, oc);
    }

    case 'cut': {
      const lowered = lowerCutShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToOCCT(lowered.plan, oc);
    }

    case 'sheetMetal':
      return lowerShapeCompilePlanToOCCT(lowerSheetMetalBasePlan(plan.model, plan.output), oc);

    case 'loft':
      return lowerLoftPlan(oc, plan);
    case 'sweep':
      return lowerSweepPlan(oc, plan);
    case 'importedMesh':
      throw new Error(
        `importMesh("${plan.filePath}") is not supported with the OCCT backend. ` +
          'Switch to the Manifold backend or use the default backend.',
      );
  }
}

// ─── Loft via BRepOffsetAPI_ThruSections ──────────────────────────────

/**
 * Extract the outer wire from a profile face.
 */
function extractOuterWire(oc: OCCTModule, face: any): any {
  const faceCast = oc.TopoDS.Face_1(face);
  return oc.BRepTools.OuterWire(faceCast);
}

/**
 * Loft between multiple 2D profiles at given heights.
 * Each profile is lowered to an OCCT face, then its outer wire is
 * translated to z = heights[i] and added to ThruSections.
 */
function lowerLoftPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'loft' }>): any {
  if (plan.profiles.length < 2) throw new Error('Loft requires at least 2 profiles');

  const ts = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);

  for (let i = 0; i < plan.profiles.length; i++) {
    const rawFace = lowerProfileToFace(oc, plan.profiles[i]);
    const face = unifyProfileShape(oc, rawFace);
    let wire = extractOuterWire(oc, face);
    // Convert high-edge-count polygon wires to B-spline wires.
    // ThruSections with 120+ line-segment edges per profile hangs;
    // a single B-spline edge per profile completes in milliseconds.
    wire = toBSplineWireIfNeeded(oc, wire);
    const z = plan.heights[i];
    if (Math.abs(z) > 1e-10) {
      const trsf = new oc.gp_Trsf_1();
      trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, z));
      const transformed = new oc.BRepBuilderAPI_Transform_2(wire, trsf, true);
      ts.AddWire(oc.TopoDS.Wire_1(transformed.Shape()));
    } else {
      ts.AddWire(wire);
    }
  }

  ts.CheckCompatibility(true);
  ts.Build(new oc.Message_ProgressRange_1());

  if (!ts.IsDone()) {
    throw new Error('OCCT loft (ThruSections) failed — profiles may be incompatible');
  }

  return ts.Shape();
}

// ─── Sweep via BRepOffsetAPI_MakePipe ─────────────────────────────────

/**
 * Build an OCCT wire from a polyline of 3D points.
 */
function buildSpineWire(oc: OCCTModule, points: [number, number, number][]): any {
  if (points.length < 2) throw new Error('Sweep path needs at least 2 points');

  const mkWire = new oc.BRepBuilderAPI_MakeWire_1();
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1, z1] = points[i];
    const [x2, y2, z2] = points[i + 1];
    const dx = x2 - x1,
      dy = y2 - y1,
      dz = z2 - z1;
    if (dx * dx + dy * dy + dz * dz < 1e-20) continue;
    const edge = new oc.BRepBuilderAPI_MakeEdge_3(new oc.gp_Pnt_3(x1, y1, z1), new oc.gp_Pnt_3(x2, y2, z2)).Edge();
    mkWire.Add_1(edge);
  }
  return mkWire.Wire();
}

/**
 * Sweep a 2D profile along a 3D polyline path.
 */
function lowerSweepPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'sweep' }>): any {
  const pathPoints = plan.path.points;
  if (pathPoints.length < 2) throw new Error('Sweep path needs at least 2 points');

  const spineWire = buildSpineWire(oc, pathPoints);
  const profileFace = unifyProfileShape(oc, lowerProfileToFace(oc, plan.profile));

  // Orient the profile at the start of the path, perpendicular to the
  // first segment. The profile is built on the XY plane (normal = Z).
  const [sx, sy, sz] = pathPoints[0];
  const [nx, ny, nz] = pathPoints[1];
  const tx = nx - sx,
    ty = ny - sy,
    tz = nz - sz;
  const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);

  let orientedProfile: any;
  if (tLen > 1e-10) {
    const tangentX = tx / tLen,
      tangentY = ty / tLen,
      tangentZ = tz / tLen;
    // Cross product: Z × tangent = rotation axis
    const crossX = -tangentY,
      crossY = tangentX,
      crossZ = 0;
    const crossLen = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);

    const trsf = new oc.gp_Trsf_1();
    if (crossLen > 1e-10) {
      const dot = tangentZ;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      trsf.SetRotation_1(
        new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(crossX / crossLen, crossY / crossLen, crossZ / crossLen)),
        angle,
      );
    } else if (tangentZ < 0) {
      trsf.SetRotation_1(new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(1, 0, 0)), Math.PI);
    }

    const rotated = new oc.BRepBuilderAPI_Transform_2(profileFace, trsf, true);
    const trsfT = new oc.gp_Trsf_1();
    trsfT.SetTranslation_1(new oc.gp_Vec_4(sx, sy, sz));
    const translated = new oc.BRepBuilderAPI_Transform_2(rotated.Shape(), trsfT, true);
    orientedProfile = translated.Shape();
  } else {
    orientedProfile = profileFace;
  }

  const pipe = new oc.BRepOffsetAPI_MakePipe_1(spineWire, orientedProfile);
  pipe.Build(new oc.Message_ProgressRange_1());

  if (!pipe.IsDone()) {
    throw new Error('OCCT sweep (MakePipe) failed — path or profile may be incompatible');
  }

  return pipe.Shape();
}

// ─── Extrude with twist via ThruSections ──────────────────────────────

function lowerExtrudeWithTwist(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'extrude' }>, bottomFace: any): any {
  const height = plan.height;
  const totalTwistDeg = plan.twist ?? 0;
  const nSections = Math.max(2, (plan.twistSegments ?? 12) + 1);
  const bottomWire = toBSplineWireIfNeeded(oc, extractOuterWire(oc, bottomFace));

  const thruSections = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
  for (let i = 0; i < nSections; i++) {
    const t = i / (nSections - 1);
    const z = height * t;
    const angleDeg = totalTwistDeg * t;

    const trsf = new oc.gp_Trsf_1();
    const angleRad = (angleDeg * Math.PI) / 180;
    trsf.SetRotation_1(new oc.gp_Ax1_2(new oc.gp_Pnt_1(), new oc.gp_Dir_4(0, 0, 1)), angleRad);
    const trsf2 = new oc.gp_Trsf_1();
    trsf2.SetTranslation_1(new oc.gp_Vec_4(0, 0, z));
    trsf.Multiply(trsf2);

    const transformed = new oc.BRepBuilderAPI_Transform_2(bottomWire, trsf, true);
    thruSections.AddWire(oc.TopoDS.Wire_1(transformed.Shape()));
  }
  thruSections.Build(new oc.Message_ProgressRange_1());
  let result = thruSections.Shape();

  if (plan.center) {
    const trsf = new oc.gp_Trsf_1();
    trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, -height / 2));
    const transformed = new oc.BRepBuilderAPI_Transform_2(result, trsf, true);
    result = transformed.Shape();
  }
  return result;
}

// ─── Extrude with scaleTop via ThruSections ───────────────────────────

/**
 * Extrude with non-uniform top scaling: 2-section loft from bottom wire
 * (original profile) to top wire (scaled profile at z=height).
 */
function lowerExtrudeWithScaleTop(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'extrude' }>): any {
  const bottomFace = unifyProfileShape(oc, lowerProfileToFace(oc, plan.profile));
  const bottomWire = toBSplineWireIfNeeded(oc, extractOuterWire(oc, bottomFace));

  const scaleX = plan.scaleTop![0];
  const scaleY = plan.scaleTop![1];
  const height = plan.height;

  const gtrsf = new oc.gp_GTrsf_1();
  gtrsf.SetValue(1, 1, scaleX);
  gtrsf.SetValue(2, 2, scaleY);
  gtrsf.SetValue(3, 3, 1);
  gtrsf.SetValue(3, 4, height);
  const scaledShape = new oc.BRepBuilderAPI_GTransform_2(bottomWire, gtrsf, true);
  const topWire = oc.TopoDS.Wire_1(scaledShape.Shape());

  const ts = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
  ts.AddWire(bottomWire);
  ts.AddWire(topWire);
  ts.CheckCompatibility(true);
  ts.Build(new oc.Message_ProgressRange_1());

  if (!ts.IsDone()) {
    throw new Error('OCCT extrude-with-scaleTop (ThruSections) failed');
  }

  let result = ts.Shape();

  if (plan.center) {
    const trsf = new oc.gp_Trsf_1();
    trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, -height / 2));
    const transformed = new oc.BRepBuilderAPI_Transform_2(result, trsf, true);
    result = transformed.Shape();
  }

  return result;
}

/**
 * Sentinel error for operations OCCT doesn't support.
 * The caller catches this to fall back to Manifold.
 */
export class OCCTUnsupportedError extends Error {
  constructor(public readonly operation: string) {
    super(`OCCT does not support ${operation} — falling back to Manifold`);
    this.name = 'OCCTUnsupportedError';
  }
}

/**
 * Lower a ShapeCompilePlan to an OCCTShapeBackend.
 */
export function lowerShapeCompilePlanToOCCTBackend(plan: ShapeCompilePlan): ShapeBackend {
  const oc = getOCCT();
  const shape = lowerShapeCompilePlanToOCCT(plan, oc);
  return wrapOCCTShapeBackend(shape);
}

/**
 * Lower a ProfileCompilePlan to a ProfileBackend (OCCT TopoDS_Face).
 */
export function lowerProfileCompilePlanToOCCTProfileBackend(plan: ProfileCompilePlan): ProfileBackend {
  const oc = getOCCT();
  // ProfileBackend needs a single face for area/bounds/polygon queries
  return wrapOCCTProfileBackend(unifyProfileShape(oc, lowerProfileToFace(oc, plan)));
}

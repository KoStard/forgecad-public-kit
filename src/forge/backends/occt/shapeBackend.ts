/**
 * ForgeCAD — OCCT Shape Backend
 *
 * Implements ShapeBackend by wrapping an OCCT TopoDS_Shape.
 * Provides mesh extraction via BRepMesh_IncrementalMesh,
 * producing data compatible with Manifold's getMesh() format.
 */

import type { Mat4 } from '../../transform';
import { Transform } from '../../transform';
import {
  SHAPE_BACKEND_MARKER,
  type ShapeBackend,
  type ShapeRuntimeBounds,
  type ShapeRuntimeMesh,
  type ShapeRuntimeCrossSection,
  type EdgeFeatureTarget,
} from '../../shapeBackend';
import { getOCCT, type OCCTModule } from './init';

/** Default tessellation linear deflection. Lower = finer mesh. */
const DEFAULT_LINEAR_DEFLECTION = 0.1;
/** Default tessellation angular deflection (radians). */
const DEFAULT_ANGULAR_DEFLECTION = 0.5;

/**
 * Extract triangle mesh from a TopoDS_Shape, producing data in
 * Manifold-compatible format: { numProp, numTri, triVerts, vertProperties }.
 */
function extractMeshFromShape(
  oc: OCCTModule,
  shape: any,
  linearDeflection = DEFAULT_LINEAR_DEFLECTION,
  angularDeflection = DEFAULT_ANGULAR_DEFLECTION,
): ShapeRuntimeMesh {
  // Tessellate
  new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, angularDeflection, false);

  let totalVerts = 0;
  let totalTris = 0;
  const allPositions: number[] = [];
  const allIndices: number[] = [];

  const expl = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );

  while (expl.More()) {
    const face = oc.TopoDS.Face_1(expl.Current());
    const loc = new oc.TopLoc_Location_1();
    const triangulation = oc.BRep_Tool.Triangulation(face, loc, 0);

    if (!triangulation.IsNull()) {
      const tri = triangulation.get();
      const nVerts = tri.NbNodes();
      const nTris = tri.NbTriangles();
      const baseIndex = totalVerts;

      // Check face orientation for correct winding
      const orientation = face.Orientation_1();
      const reversed = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED;

      // Extract vertices (apply location transform if present)
      const trsf = loc.Transformation();
      for (let i = 1; i <= nVerts; i++) {
        const pt = tri.Node(i).Transformed(trsf);
        allPositions.push(pt.X(), pt.Y(), pt.Z());
      }

      // Extract triangles with correct winding
      for (let i = 1; i <= nTris; i++) {
        const triangle = tri.Triangle(i);
        const i1 = triangle.Value(1) - 1 + baseIndex;
        const i2 = triangle.Value(2) - 1 + baseIndex;
        const i3 = triangle.Value(3) - 1 + baseIndex;
        if (reversed) {
          allIndices.push(i1, i3, i2);
        } else {
          allIndices.push(i1, i2, i3);
        }
      }

      totalVerts += nVerts;
      totalTris += nTris;
    }

    expl.Next();
  }

  // OCCT tessellates each face independently — shared edges produce
  // duplicate vertices. Manifold requires a watertight mesh, so we must
  // weld coincident vertices via mergeFromVert / mergeToVert.
  const EPS = 1e-8;
  const vertProperties = new Float32Array(allPositions);
  const triVerts = new Uint32Array(allIndices);

  // Build a spatial hash to find coincident vertices
  const mergeFrom: number[] = [];
  const mergeTo: number[] = [];
  const vertMap = new Map<string, number>();
  for (let i = 0; i < totalVerts; i++) {
    const x = allPositions[i * 3];
    const y = allPositions[i * 3 + 1];
    const z = allPositions[i * 3 + 2];
    // Quantize to EPS grid for hash-based welding
    const key = `${Math.round(x / EPS)}:${Math.round(y / EPS)}:${Math.round(z / EPS)}`;
    const existing = vertMap.get(key);
    if (existing !== undefined && existing !== i) {
      mergeFrom.push(i);
      mergeTo.push(existing);
    } else {
      vertMap.set(key, i);
    }
  }

  return {
    numProp: 3,
    numTri: totalTris,
    triVerts,
    vertProperties,
    numVert: totalVerts,
    mergeFromVert: new Uint32Array(mergeFrom),
    mergeToVert: new Uint32Array(mergeTo),
    runIndex: new Uint32Array([0, totalTris]),
    runOriginalID: new Uint32Array([0]),
    runTransform: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]),
    faceID: new Uint32Array(0),
    halfedgeTangent: new Float32Array(0),
  } as unknown as ShapeRuntimeMesh;
}

/**
 * Extract bounding box from a TopoDS_Shape.
 */
function extractBoundingBox(oc: OCCTModule, shape: any): ShapeRuntimeBounds {
  const bndBox = new oc.Bnd_Box_1();
  oc.BRepBndLib.Add(shape, bndBox, false);

  if (bndBox.IsVoid()) {
    return { min: [0, 0, 0], max: [0, 0, 0] } as unknown as ShapeRuntimeBounds;
  }

  const xMin = { current: 0 };
  const yMin = { current: 0 };
  const zMin = { current: 0 };
  const xMax = { current: 0 };
  const yMax = { current: 0 };
  const zMax = { current: 0 };
  bndBox.Get(xMin, yMin, zMin, xMax, yMax, zMax);

  return {
    min: [xMin.current, yMin.current, zMin.current],
    max: [xMax.current, yMax.current, zMax.current],
  } as unknown as ShapeRuntimeBounds;
}

/**
 * Apply a 4x4 transform matrix to a TopoDS_Shape.
 */
function applyTransform(oc: OCCTModule, shape: any, m: Mat4): any {
  const trsf = new oc.gp_Trsf_1();
  // Mat4 is column-major [m00, m10, m20, m30, m01, m11, m21, m31, ...]
  // gp_Trsf.SetValues takes row-major 3x4
  trsf.SetValues(
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
  );
  const transformed = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  return transformed.Shape();
}

/**
 * Find the OCCT edge whose midpoint is closest to the target midpoint.
 */
function findEdgeByMidpoint(oc: OCCTModule, shape: any, midpoint: [number, number, number]): any {
  let bestEdge: any = null;
  let bestDist = Infinity;

  const edgeExpl = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
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

export class OCCTShapeBackend implements ShapeBackend {
  readonly [SHAPE_BACKEND_MARKER] = true as const;

  constructor(private readonly _shape: any) {}

  /** Access the underlying TopoDS_Shape. */
  get shape(): any {
    return this._shape;
  }

  clone(): ShapeBackend {
    return new OCCTShapeBackend(this._shape);
  }

  translate(x: number, y: number, z: number): ShapeBackend {
    const oc = getOCCT();
    const trsf = new oc.gp_Trsf_1();
    trsf.SetTranslation_1(new oc.gp_Vec_4(x, y, z));
    const transformed = new oc.BRepBuilderAPI_Transform_2(this._shape, trsf, true);
    return new OCCTShapeBackend(transformed.Shape());
  }

  rotate(x: number, y: number, z: number): ShapeBackend {
    return this.transform(Transform.rotationAxis([1, 0, 0], x)
      .rotateAxis([0, 1, 0], y)
      .rotateAxis([0, 0, 1], z)
      .toArray());
  }

  transform(m: Mat4): ShapeBackend {
    const oc = getOCCT();
    return new OCCTShapeBackend(applyTransform(oc, this._shape, m));
  }

  scale(v: number | [number, number, number]): ShapeBackend {
    const oc = getOCCT();
    if (typeof v === 'number') {
      const trsf = new oc.gp_Trsf_1();
      trsf.SetScaleFactor(v);
      const transformed = new oc.BRepBuilderAPI_Transform_2(this._shape, trsf, true);
      return new OCCTShapeBackend(transformed.Shape());
    }
    // Non-uniform scale — use gp_GTrsf
    const gtrsf = new oc.gp_GTrsf_1();
    gtrsf.SetValue(1, 1, v[0]);
    gtrsf.SetValue(2, 2, v[1]);
    gtrsf.SetValue(3, 3, v[2]);
    const transformed = new oc.BRepBuilderAPI_GTransform_2(this._shape, gtrsf, true);
    return new OCCTShapeBackend(transformed.Shape());
  }

  mirror(normal: [number, number, number]): ShapeBackend {
    const oc = getOCCT();
    const ax2 = new oc.gp_Ax2_3(
      new oc.gp_Pnt_3(0, 0, 0),
      new oc.gp_Dir_4(normal[0], normal[1], normal[2]),
    );
    const trsf = new oc.gp_Trsf_1();
    trsf.SetMirror_3(ax2);
    const transformed = new oc.BRepBuilderAPI_Transform_2(this._shape, trsf, true);
    return new OCCTShapeBackend(transformed.Shape());
  }

  split(other: ShapeBackend): [ShapeBackend, ShapeBackend] {
    const oc = getOCCT();
    const otherShape = requireOCCTShape(other, 'split()');

    // Inside = intersection, Outside = difference
    const inside = new oc.BRepAlgoAPI_Common_3(
      this._shape, otherShape, new oc.Message_ProgressRange_1(),
    );
    inside.Build(new oc.Message_ProgressRange_1());

    const outside = new oc.BRepAlgoAPI_Cut_3(
      this._shape, otherShape, new oc.Message_ProgressRange_1(),
    );
    outside.Build(new oc.Message_ProgressRange_1());

    return [
      new OCCTShapeBackend(inside.Shape()),
      new OCCTShapeBackend(outside.Shape()),
    ];
  }

  splitByPlane(normal: [number, number, number], originOffset: number): [ShapeBackend, ShapeBackend] {
    const oc = getOCCT();
    // Create a large half-space box to cut with
    const dir = new oc.gp_Dir_4(normal[0], normal[1], normal[2]);
    const pln = new oc.gp_Pln_3(new oc.gp_Pnt_3(
      normal[0] * originOffset,
      normal[1] * originOffset,
      normal[2] * originOffset,
    ), dir);
    const halfSpace = new oc.BRepPrimAPI_MakeHalfSpace_1(
      new oc.BRepBuilderAPI_MakeFace_9(pln, -1e6, 1e6, -1e6, 1e6).Face(),
      new oc.gp_Pnt_3(
        normal[0] * (originOffset + 1),
        normal[1] * (originOffset + 1),
        normal[2] * (originOffset + 1),
      ),
    );

    const inside = new oc.BRepAlgoAPI_Common_3(
      this._shape, halfSpace.Solid(), new oc.Message_ProgressRange_1(),
    );
    inside.Build(new oc.Message_ProgressRange_1());

    const outside = new oc.BRepAlgoAPI_Cut_3(
      this._shape, halfSpace.Solid(), new oc.Message_ProgressRange_1(),
    );
    outside.Build(new oc.Message_ProgressRange_1());

    return [
      new OCCTShapeBackend(inside.Shape()),
      new OCCTShapeBackend(outside.Shape()),
    ];
  }

  trimByPlane(normal: [number, number, number], originOffset: number): ShapeBackend {
    const [inside] = this.splitByPlane(normal, originOffset);
    return inside;
  }

  hull(): ShapeBackend {
    // OCCT doesn't have a direct convex hull of shapes.
    throw new Error('hull() is not supported on OCCT B-rep shapes. Use Manifold backend for convex hull.');
  }

  boundingBox(): ShapeRuntimeBounds {
    return extractBoundingBox(getOCCT(), this._shape);
  }

  volume(): number {
    const oc = getOCCT();
    const props = new oc.GProp_GProps_1();
    oc.BRepGProp.VolumeProperties_1(this._shape, props, false, false, false);
    return props.Mass();
  }

  surfaceArea(): number {
    const oc = getOCCT();
    const props = new oc.GProp_GProps_1();
    oc.BRepGProp.SurfaceProperties_1(this._shape, props, false, false);
    return props.Mass();
  }

  isEmpty(): boolean {
    const oc = getOCCT();
    return this._shape.IsNull() || this._shape.NbChildren() === 0;
  }

  numTri(): number {
    return this.getMesh().numTri;
  }

  getMesh(): ShapeRuntimeMesh {
    return extractMeshFromShape(getOCCT(), this._shape);
  }

  slice(_offset: number): ShapeRuntimeCrossSection {
    // Slicing a B-rep at a plane to get a 2D cross-section.
    // For now, throw — most code paths use CompilePlan which handles this differently.
    throw new Error('slice() not yet implemented for OCCT backend');
  }

  project(): ShapeRuntimeCrossSection {
    throw new Error('project() not yet implemented for OCCT backend');
  }

  filletEdgeByMidpoint(edge: EdgeFeatureTarget, radius: number): OCCTShapeBackend {
    const oc = getOCCT();
    const matchedEdge = findEdgeByMidpoint(oc, this._shape, edge.midpoint);
    if (!matchedEdge) throw new Error('OCCT filletEdgeByMidpoint: could not find matching edge');

    const mkFillet = new oc.BRepFilletAPI_MakeFillet(
      this._shape,
      oc.ChFi3d_FilletShape.ChFi3d_Rational,
    );
    mkFillet.Add_2(radius, matchedEdge);
    mkFillet.Build(new oc.Message_ProgressRange_1());
    if (!mkFillet.IsDone()) {
      throw new Error(
        `OCCT fillet operation failed (radius=${radius}, ` +
        `midpoint=[${edge.midpoint.map(v => v.toFixed(3))}])`,
      );
    }
    return new OCCTShapeBackend(mkFillet.Shape());
  }

  chamferEdgeByMidpoint(edge: EdgeFeatureTarget, size: number): OCCTShapeBackend {
    const oc = getOCCT();
    const matchedEdge = findEdgeByMidpoint(oc, this._shape, edge.midpoint);
    if (!matchedEdge) throw new Error('OCCT chamferEdgeByMidpoint: could not find matching edge');

    const mkChamfer = new oc.BRepFilletAPI_MakeChamfer(this._shape);
    mkChamfer.Add_2(size, matchedEdge);
    mkChamfer.Build(new oc.Message_ProgressRange_1());
    if (!mkChamfer.IsDone()) throw new Error('OCCT chamfer operation failed');
    return new OCCTShapeBackend(mkChamfer.Shape());
  }

}

export function wrapOCCTShapeBackend(shape: any): ShapeBackend {
  return new OCCTShapeBackend(shape);
}

export function isOCCTShapeBackend(backend: ShapeBackend): backend is OCCTShapeBackend {
  return backend instanceof OCCTShapeBackend;
}

export function requireOCCTShape(backend: ShapeBackend, apiName = 'requireOCCTShape()'): any {
  if (backend instanceof OCCTShapeBackend) {
    return backend.shape;
  }
  throw new Error(`${apiName} requires an OCCT-backed shape.`);
}

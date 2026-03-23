/**
 * OCCT implementation of ProfileBackend.
 *
 * Wraps a TopoDS_Face (planar, in the XY plane at z=0) and delegates
 * all 2D operations to OCCT's BRep API.
 */

import {
  PROFILE_BACKEND_MARKER,
  type ProfileBackend,
  type ProfileBounds,
} from '../../profileBackend';
import type { ShapeBackend } from '../../shapeBackend';
import { getOCCT, type OCCTModule } from './init';
import { wrapOCCTShapeBackend } from './shapeBackend';

// ── Helpers ────────────────────────────────────────────────────────

/** Extract 2D bounding box from a planar face. */
function extractFaceBounds(oc: OCCTModule, face: any): ProfileBounds {
  const bndBox = new oc.Bnd_Box_1();
  oc.BRepBndLib.Add(face, bndBox, false);
  if (bndBox.IsVoid()) {
    return { min: [0, 0], max: [0, 0] };
  }
  const xMin = { current: 0 };
  const yMin = { current: 0 };
  const zMin = { current: 0 };
  const xMax = { current: 0 };
  const yMax = { current: 0 };
  const zMax = { current: 0 };
  bndBox.Get(xMin, yMin, zMin, xMax, yMax, zMax);
  return {
    min: [xMin.current, yMin.current],
    max: [xMax.current, yMax.current],
  };
}

/** Compute signed area of a planar face via GProp. */
function computeFaceArea(oc: OCCTModule, face: any): number {
  const props = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(face, props, false, false);
  return props.Mass();
}

/**
 * Extract polygon loops from a planar face by tessellating edges.
 *
 * Returns an array of loops (outer boundary + holes), each loop being
 * an array of [x, y] points — matching Manifold's CrossSection.toPolygons() format.
 */
function extractPolygonsFromFace(oc: OCCTModule, face: any): number[][][] {
  // Tessellate the face so edge curves are discretized
  new oc.BRepMesh_IncrementalMesh_2(face, 0.01, false, 0.1, false);

  const loops: number[][][] = [];
  const wireExpl = new oc.TopExp_Explorer_2(
    face,
    oc.TopAbs_ShapeEnum.TopAbs_WIRE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );

  while (wireExpl.More()) {
    const wire = oc.TopoDS.Wire_1(wireExpl.Current());
    const points: number[][] = [];

    const edgeExpl = new oc.TopExp_Explorer_2(
      wire,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );

    while (edgeExpl.More()) {
      const edge = oc.TopoDS.Edge_1(edgeExpl.Current());
      const loc = new oc.TopLoc_Location_1();
      const poly = oc.BRep_Tool.Polygon3D(edge, loc);

      if (!poly.IsNull()) {
        const polyObj = poly.get();
        const n = polyObj.NbNodes();
        // Skip last point to avoid duplicating the next edge's start
        for (let i = 1; i <= (edgeExpl.More() ? n - 1 : n); i++) {
          const pt = polyObj.Nodes().Value(i);
          points.push([pt.X(), pt.Y()]);
        }
      } else {
        // Fall back to adaptor curve sampling
        const first = { current: 0 };
        const last = { current: 0 };
        const curve = oc.BRep_Tool.Curve_2(edge, first, last);
        if (!curve.IsNull()) {
          const curveObj = curve.get();
          const steps = 16;
          const t0 = first.current;
          const t1 = last.current;
          // Check edge orientation: if reversed, swap parameter direction
          const isReversed = edge.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
          for (let i = 0; i < steps; i++) {
            const t = isReversed
              ? t1 - (i / steps) * (t1 - t0)
              : t0 + (i / steps) * (t1 - t0);
            const pt = curveObj.Value(t);
            points.push([pt.X(), pt.Y()]);
          }
        }
      }
      edgeExpl.Next();
    }

    if (points.length >= 3) {
      // Deduplicate close consecutive points
      const clean: number[][] = [points[0]];
      for (let i = 1; i < points.length; i++) {
        const prev = clean[clean.length - 1];
        if (Math.abs(points[i][0] - prev[0]) > 1e-8 || Math.abs(points[i][1] - prev[1]) > 1e-8) {
          clean.push(points[i]);
        }
      }
      // Also check first/last
      if (clean.length > 1) {
        const first = clean[0];
        const last = clean[clean.length - 1];
        if (Math.abs(first[0] - last[0]) < 1e-8 && Math.abs(first[1] - last[1]) < 1e-8) {
          clean.pop();
        }
      }
      if (clean.length >= 3) {
        loops.push(clean);
      }
    }
    wireExpl.Next();
  }

  return loops;
}

/** Apply a gp_Trsf to a shape and return the transformed shape. */
function applyTrsf(oc: OCCTModule, shape: any, trsf: any): any {
  return new oc.BRepBuilderAPI_Transform_2(shape, trsf, true).Shape();
}

/** Convert shape to a face (handles compounds from boolean ops). */
function shapeToFace(oc: OCCTModule, shape: any): any {
  const shapeType = shape.ShapeType();
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_FACE) return shape;
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
    return new oc.BRepBuilderAPI_MakeFace_15(oc.TopoDS.Wire_1(shape), true).Face();
  }
  // Compound — extract wires
  const wires: any[] = [];
  const wireExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (wireExpl.More()) {
    wires.push(oc.TopoDS.Wire_1(wireExpl.Current()));
    wireExpl.Next();
  }
  if (wires.length === 0) {
    const faceExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    if (faceExpl.More()) return oc.TopoDS.Face_1(faceExpl.Current());
    throw new Error('Cannot convert shape to face');
  }
  const mkFace = new oc.BRepBuilderAPI_MakeFace_15(wires[0], true);
  for (let i = 1; i < wires.length; i++) mkFace.Add(wires[i]);
  return mkFace.Face();
}

// ── OCCTProfileBackend ─────────────────────────────────────────────

export class OCCTProfileBackend implements ProfileBackend {
  readonly [PROFILE_BACKEND_MARKER] = true as const;

  constructor(private readonly face: any) {}

  // ── Queries ────────────────────────────────────────────────────

  area(): number {
    return computeFaceArea(getOCCT(), this.face);
  }

  bounds(): ProfileBounds {
    return extractFaceBounds(getOCCT(), this.face);
  }

  isEmpty(): boolean {
    try {
      const oc = getOCCT();
      if (this.face.IsNull()) return true;
      // Check if face has any wires
      const wireExpl = new oc.TopExp_Explorer_2(
        this.face,
        oc.TopAbs_ShapeEnum.TopAbs_WIRE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
      );
      return !wireExpl.More();
    } catch {
      return true;
    }
  }

  numVert(): number {
    const polys = this.toPolygons();
    return polys.reduce((sum, loop) => sum + loop.length, 0);
  }

  toPolygons(): number[][][] {
    return extractPolygonsFromFace(getOCCT(), this.face);
  }

  // ── Transforms ─────────────────────────────────────────────────

  translate(x: number, y: number): ProfileBackend {
    const oc = getOCCT();
    const trsf = new oc.gp_Trsf_1();
    trsf.SetTranslation_1(new oc.gp_Vec_4(x, y, 0));
    return new OCCTProfileBackend(applyTrsf(oc, this.face, trsf));
  }

  rotate(degrees: number): ProfileBackend {
    const oc = getOCCT();
    const trsf = new oc.gp_Trsf_1();
    trsf.SetRotation_1(
      new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 0, 1)),
      degrees * Math.PI / 180,
    );
    return new OCCTProfileBackend(applyTrsf(oc, this.face, trsf));
  }

  scale(v: number | [number, number]): ProfileBackend {
    const oc = getOCCT();
    const [sx, sy] = typeof v === 'number' ? [v, v] : v;

    if (Math.abs(sx - sy) < 1e-10) {
      // Uniform scale via gp_Trsf
      const trsf = new oc.gp_Trsf_1();
      trsf.SetScale(new oc.gp_Pnt_3(0, 0, 0), sx);
      return new OCCTProfileBackend(applyTrsf(oc, this.face, trsf));
    }

    // Non-uniform scale via GTrsf
    const gtrsf = new oc.gp_GTrsf_1();
    gtrsf.SetValue(1, 1, sx);
    gtrsf.SetValue(2, 2, sy);
    gtrsf.SetValue(3, 3, 1);
    const transformed = new oc.BRepBuilderAPI_GTransform_2(this.face, gtrsf, true);
    return new OCCTProfileBackend(transformed.Shape());
  }

  mirror(ax: [number, number]): ProfileBackend {
    const oc = getOCCT();
    const trsf = new oc.gp_Trsf_1();
    trsf.SetMirror_3(new oc.gp_Ax2_3(
      new oc.gp_Pnt_3(0, 0, 0),
      new oc.gp_Dir_4(ax[0], ax[1], 0),
    ));
    return new OCCTProfileBackend(applyTrsf(oc, this.face, trsf));
  }

  // ── 2D Operations ──────────────────────────────────────────────

  offset(delta: number, join: 'Square' | 'Round' | 'Miter'): ProfileBackend {
    const oc = getOCCT();
    // OCCT offset only supports Arc join; map all join types to it
    const offsetMaker = new oc.BRepOffsetAPI_MakeOffset_2(
      this.face,
      oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
    );
    offsetMaker.Perform(delta, 0);
    if (offsetMaker.IsDone()) {
      return new OCCTProfileBackend(shapeToFace(oc, offsetMaker.Shape()));
    }
    return this; // Fallback: return unchanged
  }

  simplify(_epsilon: number): ProfileBackend {
    // OCCT works with exact geometry; simplify is a no-op
    return this;
  }

  warp(_fn: (vert: [number, number]) => void): ProfileBackend {
    throw new Error('OCCTProfileBackend.warp() is not supported — use Manifold backend for warp operations');
  }

  subtract(other: ProfileBackend): ProfileBackend {
    const oc = getOCCT();
    const otherFace = requireOCCTFace(other);

    // Use wire-insertion subtraction (idiomatic for coplanar OCCT faces)
    const baseFaceCast = oc.TopoDS.Face_1(this.face);
    const outerWire = oc.BRepTools.OuterWire(baseFaceCast);
    const mkFace = new oc.BRepBuilderAPI_MakeFace_15(outerWire, true);

    // Re-add existing holes
    const wireExpl = new oc.TopExp_Explorer_2(
      this.face,
      oc.TopAbs_ShapeEnum.TopAbs_WIRE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    while (wireExpl.More()) {
      const wire = oc.TopoDS.Wire_1(wireExpl.Current());
      if (!wire.IsSame(outerWire)) mkFace.Add(wire);
      wireExpl.Next();
    }

    // Add the other face's outer wire as a hole (reversed)
    const otherFaceCast = oc.TopoDS.Face_1(otherFace);
    const otherOuterWire = oc.BRepTools.OuterWire(otherFaceCast);
    mkFace.Add(oc.TopoDS.Wire_1(otherOuterWire.Reversed()));
    return new OCCTProfileBackend(mkFace.Face());
  }

  // ── 3D Conversions ─────────────────────────────────────────────

  extrude(
    height: number,
    _divisions: number,
    _twist: number,
    _scaleTop?: [number, number],
    center?: boolean,
  ): ShapeBackend {
    const oc = getOCCT();
    const vec = new oc.gp_Vec_4(0, 0, height);
    const prism = new oc.BRepPrimAPI_MakePrism_1(this.face, vec, false, true);
    prism.Build(new oc.Message_ProgressRange_1());
    let result = prism.Shape();

    if (center) {
      const trsf = new oc.gp_Trsf_1();
      trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, -height / 2));
      result = applyTrsf(oc, result, trsf);
    }

    return wrapOCCTShapeBackend(result);
  }

  revolve(segments: number, degrees: number): ShapeBackend {
    const oc = getOCCT();

    // Rotate face from XY to XZ plane (Manifold convention: 2D-X → radial, 2D-Y → Z)
    const rot = new oc.gp_Trsf_1();
    rot.SetRotation_1(
      new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(1, 0, 0)),
      Math.PI / 2,
    );
    const rotatedFace = applyTrsf(oc, this.face, rot);

    const axis = new oc.gp_Ax1_2(
      new oc.gp_Pnt_3(0, 0, 0),
      new oc.gp_Dir_4(0, 0, 1),
    );
    const radians = degrees * Math.PI / 180;
    const revol = new oc.BRepPrimAPI_MakeRevol_1(rotatedFace, axis, radians, true);
    revol.Build(new oc.Message_ProgressRange_1());
    if (!revol.IsDone()) {
      throw new Error('OCCT revolve failed — profile may be too complex or self-intersecting');
    }
    return wrapOCCTShapeBackend(revol.Shape());
  }

  /** Access the underlying TopoDS_Face for OCCT-specific code. */
  requireFace(): any {
    return this.face;
  }
}

/** Wrap a TopoDS_Face as a ProfileBackend. */
export function wrapOCCTProfileBackend(face: any): ProfileBackend {
  return new OCCTProfileBackend(face);
}

/** Unwrap a ProfileBackend to a TopoDS_Face, asserting it's OCCT-backed. */
export function requireOCCTFace(profile: ProfileBackend): any {
  if (profile instanceof OCCTProfileBackend) {
    return profile.requireFace();
  }
  throw new Error('requireOCCTFace(): expected an OCCTProfileBackend');
}

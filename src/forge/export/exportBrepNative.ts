/**
 * ForgeCAD — Native BREP Export via OCCT WASM
 *
 * Exports shapes in OCCT's native boundary representation format (BREP).
 * BREP preserves exact geometry (NURBS surfaces, analytic curves) with
 * no tessellation loss. Only works when shapes are OCCT-backed.
 *
 * Uses BRepTools.Write() to serialize TopoDS_Shape to the Emscripten
 * virtual filesystem, then reads the result back as a Blob.
 */

import { initOCCT } from '../backends/occt/init';

export interface BrepNativeExportObject {
  name: string;
  shape: any; // OCCTShapeBackend instance — access TopoDS_Shape via .shape
}

/**
 * Build a BREP file blob using OCCT WASM's BRepTools.Write().
 * BREP is OCCT's native boundary representation format — exact geometry, no tessellation.
 * Only works when shapes are OCCT-backed.
 */
export async function buildBrepBlob(objects: BrepNativeExportObject[]): Promise<Blob> {
  if (objects.length === 0) {
    throw new Error('No shapes available for BREP export.');
  }

  const oc = await initOCCT();

  // Resolve the TopoDS_Shape to write.
  // If multiple objects, merge into a TopoDS_Compound.
  let topoShape: any;

  if (objects.length === 1) {
    topoShape = objects[0].shape.shape;
    if (!topoShape) {
      throw new Error(`BREP export: object "${objects[0].name}" has no underlying TopoDS_Shape. Is it OCCT-backed?`);
    }
  } else {
    const builder = new oc.BRep_Builder();
    const compound = new oc.TopoDS_Compound();
    builder.MakeCompound(compound);
    for (const obj of objects) {
      const s = obj.shape.shape;
      if (!s) {
        throw new Error(`BREP export: object "${obj.name}" has no underlying TopoDS_Shape. Is it OCCT-backed?`);
      }
      builder.Add(compound, s);
    }
    topoShape = compound;
  }

  // Write BREP to the Emscripten virtual filesystem.
  const path = '/tmp/forgecad-export.brep';

  // BRepTools.Write overloads in opencascade.js:
  //   Write_1(shape, ostream, progress)                                  — unbound ostream
  //   Write_2(shape, ostream, withTriangles, withNormals, ver, progress) — unbound ostream
  //   Write_3(shape, filePath, progress)                                 — file-path ✓
  //   Write_4(shape, filePath, withTriangles, withNormals, ver, progress)— file-path ✓
  const pr = new oc.Message_ProgressRange_1();
  const writeSuccess = oc.BRepTools.Write_3(topoShape, path, pr);

  if (!writeSuccess) {
    throw new Error('BREP export: BRepTools.Write_3 returned failure.');
  }

  // Read the file back from the virtual FS.
  let data: Uint8Array;
  try {
    data = oc.FS.readFile(path) as Uint8Array;
  } catch (err: any) {
    throw new Error(`BREP export: failed to read written file from virtual FS — ${err.message || err}`);
  }

  // Clean up the virtual FS.
  try {
    oc.FS.unlink(path);
  } catch {
    // Best-effort cleanup — not critical.
  }

  return new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}

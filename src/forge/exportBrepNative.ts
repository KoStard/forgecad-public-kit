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

import { initOCCT } from './backends/occt/init';

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

  // BRepTools has several Write overloads in opencascade.js.
  // Try Write_2(shape, path, progressRange) first, fall back to Write_1(shape, path).
  let writeSuccess = false;
  try {
    if (typeof oc.BRepTools.Write_2 === 'function') {
      writeSuccess = oc.BRepTools.Write_2(topoShape, path, new oc.Message_ProgressRange_1());
    } else if (typeof oc.BRepTools.Write_1 === 'function') {
      writeSuccess = oc.BRepTools.Write_1(topoShape, path);
    } else if (typeof oc.BRepTools.Write === 'function') {
      writeSuccess = oc.BRepTools.Write(topoShape, path);
    } else {
      throw new Error('BREP export: BRepTools.Write is not available in this opencascade.js build.');
    }
  } catch (err: any) {
    throw new Error(`BREP export: BRepTools.Write failed — ${err.message || err}`);
  }

  if (writeSuccess === false) {
    throw new Error('BREP export: BRepTools.Write returned failure.');
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

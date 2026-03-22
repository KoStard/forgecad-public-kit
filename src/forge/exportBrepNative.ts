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

  // BRepTools.Write has multiple overloads in opencascade.js:
  //   Write_1(shape, ostream)            — unbound ostream, unusable
  //   Write_2(shape, ostream, progress)  — unbound ostream, unusable
  //   Write_3(shape, filePath)           — file-path variant ✓
  //   Write_4(shape, filePath, progress) — file-path with progress ✓
  // Try all numbered overloads that accept a file path, then the base name.
  const overloads: Array<{ name: string; call: () => boolean }> = [
    { name: 'Write_3', call: () => oc.BRepTools.Write_3?.(topoShape, path) },
    { name: 'Write_4', call: () => oc.BRepTools.Write_4?.(topoShape, path, new oc.Message_ProgressRange_1()) },
    { name: 'Write_1', call: () => oc.BRepTools.Write_1?.(topoShape, path) },
    { name: 'Write_2', call: () => oc.BRepTools.Write_2?.(topoShape, path, new oc.Message_ProgressRange_1()) },
    { name: 'Write',   call: () => oc.BRepTools.Write?.(topoShape, path) },
  ];

  let writeSuccess = false;
  let lastError: string | null = null;

  for (const overload of overloads) {
    try {
      const result = overload.call();
      if (result !== undefined && result !== false) {
        writeSuccess = true;
        break;
      }
    } catch (err: any) {
      lastError = err.message || String(err);
    }
  }

  if (!writeSuccess) {
    throw new Error(`BREP export: BRepTools.Write failed${lastError ? ` — ${lastError}` : '. No compatible overload found.'}`);
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

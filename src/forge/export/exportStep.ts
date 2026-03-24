/**
 * ForgeCAD — STEP File Export via OCCT WASM
 *
 * Builds an ISO 10303 STEP file blob using OpenCascade.js's STEPControl_Writer,
 * running entirely in the browser (or Node) via WASM.
 *
 * Only works when shapes are OCCT-backed (have a TopoDS_Shape).
 */

import { initOCCT } from '../backends/occt/init';

export interface StepExportObject {
  name: string;
  shape: any; // OCCTShapeBackend — we access .shape for TopoDS_Shape
  color?: string;
}

/**
 * Check if a shape object is an OCCT-backed shape backend.
 * Useful for filtering objects before passing them to buildStepBlob.
 */
export function isOCCTShape(shape: any): boolean {
  return shape && typeof shape.shape === 'object' && shape.constructor?.name === 'OCCTShapeBackend';
}

/**
 * Build a STEP file blob using OCCT WASM's STEPControl_Writer.
 * Only works when shapes are OCCT-backed (have a TopoDS_Shape).
 *
 * @param objects - Array of named shapes to include in the STEP file.
 *   Each object's `.shape` must be an OCCTShapeBackend instance whose
 *   `.shape` property yields the underlying TopoDS_Shape.
 * @returns A Blob containing the STEP file data.
 */
export async function buildStepBlob(objects: StepExportObject[]): Promise<Blob> {
  if (objects.length === 0) {
    throw new Error('No shapes provided for STEP export.');
  }

  const oc = await initOCCT();

  // Determine the shape to export: single shape or compound of all shapes.
  let exportShape: any;

  if (objects.length === 1) {
    const topoShape = objects[0].shape?.shape;
    if (!topoShape) {
      throw new Error(
        `STEP export: object "${objects[0].name}" does not have an OCCT TopoDS_Shape. ` +
          'Only OCCT-backed shapes can be exported to STEP.',
      );
    }
    exportShape = topoShape;
  } else {
    // Multiple objects — build a compound
    const builder = new oc.BRep_Builder();
    const compound = new oc.TopoDS_Compound();
    builder.MakeCompound(compound);

    for (const obj of objects) {
      const topoShape = obj.shape?.shape;
      if (!topoShape) {
        throw new Error(
          `STEP export: object "${obj.name}" does not have an OCCT TopoDS_Shape. ` + 'Only OCCT-backed shapes can be exported to STEP.',
        );
      }
      builder.Add(compound, topoShape);
    }

    exportShape = compound;
  }

  // Create STEP writer and transfer the shape
  const writer = new oc.STEPControl_Writer_1();
  const transferStatus = writer.Transfer(
    exportShape,
    oc.STEPControl_StepModelType.STEPControl_AsIs,
    true,
    new oc.Message_ProgressRange_1(),
  );

  if (transferStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error(`STEP export: Transfer failed with status ${transferStatus}. ` + 'The shape may be invalid or empty.');
  }

  // Write to a virtual filesystem path
  const virtualPath = '/tmp/forgecad-export.step';
  const writeStatus = writer.Write(virtualPath);

  if (writeStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error(`STEP export: Write failed with status ${writeStatus}. ` + 'The STEP writer could not serialize the model.');
  }

  // Read the file back from Emscripten's virtual FS
  let data: Uint8Array;
  try {
    data = oc.FS.readFile(virtualPath);
  } catch (e) {
    throw new Error(
      'STEP export: Failed to read exported file from virtual filesystem. ' + `${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Clean up the virtual file
  try {
    oc.FS.unlink(virtualPath);
  } catch {
    // Non-critical — virtual FS cleanup failure is acceptable
  }

  return new Blob([data.buffer as ArrayBuffer], { type: 'application/step' });
}

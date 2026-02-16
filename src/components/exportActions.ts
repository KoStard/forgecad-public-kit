import { build3mfBlob, buildBinaryStl, type MeshExportObject } from '@forge/exportMesh';
import { useForgeStore } from '../store/forgeStore';
import { generateReportInWorker } from '../workers/reportWorkerClient';

export type MeshExportFormat = '3mf' | 'stl';

export function deriveExportStem(path: string): string {
  const fromPath = path
    .replace(/^.*[\\/]/, '')
    .replace(/\.(forge|sketch)\.js$/i, '')
    .replace(/\.js$/i, '')
    .trim();
  return fromPath || 'forge-export';
}

export function sanitizeExportStem(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\.+$/, '')
    .slice(0, 96);
  return sanitized || 'forge-export';
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getMeshExportObjectsFromStore(): MeshExportObject[] {
  const { result, objectSettings } = useForgeStore.getState();
  const shapeObjects = result?.objects?.filter((obj) => obj.shape) ?? [];
  return shapeObjects.map((obj) => ({
    name: obj.name,
    shape: obj.shape!,
    color: objectSettings[obj.id]?.color || obj.color,
  }));
}

export async function exportMeshFromStore(format: MeshExportFormat, preferredStem?: string): Promise<void> {
  const { activeFile } = useForgeStore.getState();
  const meshObjects = getMeshExportObjectsFromStore();
  if (meshObjects.length === 0) {
    throw new Error('No 3D objects available for mesh export.');
  }

  const stem = sanitizeExportStem(preferredStem ?? deriveExportStem(activeFile));
  if (format === '3mf') {
    const blob = await build3mfBlob(meshObjects, {
      title: stem,
      application: 'ForgeCAD',
      description: 'ForgeCAD manifold 3MF export',
    });
    triggerDownload(blob, `${stem}.3mf`);
    return;
  }

  const stlBuffer = buildBinaryStl(meshObjects);
  const stlBlob = new Blob([stlBuffer], { type: 'model/stl' });
  triggerDownload(stlBlob, `${stem}.stl`);
}

export async function exportReportFromStore(preferredStem?: string): Promise<void> {
  const { result, files, activeFile, paramOverrides, objectSettings } = useForgeStore.getState();
  const hasShapes = (result?.objects?.some((obj) => Boolean(obj.shape)) ?? false);
  if (!hasShapes) {
    throw new Error('No 3D objects available for report export.');
  }

  const title = sanitizeExportStem(preferredStem ?? deriveExportStem(activeFile));
  const report = await generateReportInWorker({
    files,
    activeFile,
    paramOverrides,
    title,
    includeDisassembled: true,
    objectVisuals: objectSettings,
  });
  const bytes = new Uint8Array(report.pdf);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  triggerDownload(blob, `${title}.report.pdf`);
}

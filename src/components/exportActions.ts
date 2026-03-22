import { build3mfBlob, buildBinaryStl, buildObjBlob, type MeshExportObject } from '@forge/exportMesh';
import { runScript, type ForgeQualityPreset, type RunResult } from '@forge/index';
import { sketchToSvg } from '@forge/sketch/exportSvg';
import { sketchToDxf } from '@forge/sketch/exportDxf';
import { generateSketchPdf } from '@forge/sketch/exportSketchPdf';
import { setParamOverrides } from '@forge/params';
import { useForgeStore, type ObjectSettings } from '../store/forgeStore';
import { generateReportInWorker } from '../workers/reportWorkerClient';
import { evalWorkerClient } from '../workers/evalWorkerClient';
import { isNotebookFile } from '../notebook/model';

export type MeshExportFormat = '3mf' | 'stl' | 'obj';
export type ExactExportFormat = 'step' | 'brep';
export type SketchExportFormat = 'svg' | 'dxf' | 'pdf';
export type OrbitGifMode = 'solid' | 'wireframe';
export type ExportQualityChoice = 'default' | 'live' | 'high';

export interface OrbitGifExportOptions {
  size?: number;
  fps?: number;
  framesPerTurn?: number;
  holdFrames?: number;
  pitchDeg?: number;
  includeWireframePass?: boolean;
  quality?: ExportQualityChoice;
  /**
   * Optional regenerated result for quality-specific export.
   * This is injected by exportActions when quality !== "default".
   */
  runResult?: RunResult;
  objectSettings?: Record<string, ObjectSettings>;
  background?: string;
}

type OrbitGifExporter = (options?: OrbitGifExportOptions) => Promise<Blob>;
interface ExportQualityOptions {
  quality?: ExportQualityChoice;
}

let orbitGifExporter: OrbitGifExporter | null = null;

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

export function registerOrbitGifExporter(exporter: OrbitGifExporter | null): void {
  orbitGifExporter = exporter;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeExportQuality(quality?: ExportQualityChoice): ExportQualityChoice {
  if (quality === 'live' || quality === 'high') return quality;
  return 'default';
}

function shouldRegenerateForQuality(
  quality: ExportQualityChoice,
): quality is Exclude<ForgeQualityPreset, 'default'> {
  return quality === 'live' || quality === 'high';
}

function requireSuccessfulRunResult(result: RunResult | null | undefined): RunResult {
  if (!result) throw new Error('Script has not been executed yet.');
  if (result.error) throw new Error(`Current script has errors: ${result.error}`);
  return result;
}

function rerunActiveScriptForQuality(quality: Exclude<ForgeQualityPreset, 'default'>): RunResult {
  const { files, activeFile, paramOverrides } = useForgeStore.getState();
  const code = files[activeFile];
  if (!code) throw new Error(`Active file "${activeFile}" is missing.`);

  setParamOverrides(paramOverrides);
  const rerun = runScript(code, activeFile, files, { quality });
  if (rerun.error) throw new Error(rerun.error);
  return rerun;
}

function resolveRunResultForExport(qualityChoice: ExportQualityChoice): RunResult {
  const { result } = useForgeStore.getState();
  const current = requireSuccessfulRunResult(result);
  if (!shouldRegenerateForQuality(qualityChoice)) return current;
  return rerunActiveScriptForQuality(qualityChoice);
}

function toMeshExportObjects(
  runResult: RunResult,
  objectSettings: Record<string, ObjectSettings>,
): MeshExportObject[] {
  const shapeObjects = runResult.objects.filter((obj) => obj.shape);
  return shapeObjects.map((obj) => ({
    name: obj.name,
    shape: obj.shape!,
    color: objectSettings[obj.id]?.color || obj.color,
  }));
}

export function getMeshExportObjectsFromStore(options: ExportQualityOptions = {}): MeshExportObject[] {
  const quality = normalizeExportQuality(options.quality);
  const { objectSettings } = useForgeStore.getState();
  const runResult = resolveRunResultForExport(quality);
  return toMeshExportObjects(runResult, objectSettings);
}

export async function exportMeshFromStore(
  format: MeshExportFormat,
  preferredStem?: string,
  options: ExportQualityOptions = {},
): Promise<void> {
  const { activeFile } = useForgeStore.getState();
  const meshObjects = getMeshExportObjectsFromStore(options);
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

  if (format === 'obj') {
    const blob = buildObjBlob(meshObjects);
    triggerDownload(blob, `${stem}.obj`);
    return;
  }

  const stlBuffer = buildBinaryStl(meshObjects);
  const stlBlob = new Blob([stlBuffer], { type: 'model/stl' });
  triggerDownload(stlBlob, `${stem}.stl`);
}

export async function exportExactFromStore(
  format: ExactExportFormat,
  preferredStem?: string,
): Promise<void> {
  const { result, activeFile, files, paramOverrides, runQuality } = useForgeStore.getState();
  requireSuccessfulRunResult(result);

  const stem = sanitizeExportStem(preferredStem ?? deriveExportStem(activeFile));
  const code = files[activeFile];
  if (!code) throw new Error(`Active file "${activeFile}" is missing.`);

  // Export runs in the eval worker where live OCCT TopoDS_Shape objects exist.
  // The main thread only has FrozenShapes (Manifold-backed mesh reconstructions)
  // which lack the B-rep topology needed for STEP/BREP export.
  // Script context is passed so the worker can re-evaluate if needed (e.g. cache hit).
  try {
    const blob = await evalWorkerClient.exportExact(format, {
      code,
      file: activeFile,
      files,
      quality: runQuality,
      paramOverrides,
      isNotebook: isNotebookFile(activeFile),
    });
    triggerDownload(blob, `${stem}.${format}`);
  } finally {
    useForgeStore.setState({ evaluationPhase: 'idle' });
  }
}

export async function exportReportFromStore(
  preferredStem?: string,
  options: ExportQualityOptions = {},
): Promise<void> {
  const { result, files, activeFile, paramOverrides, objectSettings } = useForgeStore.getState();
  const hasShapes = (result?.objects?.some((obj) => Boolean(obj.shape)) ?? false);
  if (!hasShapes) {
    throw new Error('No 3D objects available for report export.');
  }

  const quality = normalizeExportQuality(options.quality);
  const lengthUnit = useForgeStore.getState().lengthUnit;
  const title = sanitizeExportStem(preferredStem ?? deriveExportStem(activeFile));
  const report = await generateReportInWorker({
    files,
    activeFile,
    paramOverrides,
    quality: quality === 'default' ? undefined : quality,
    title,
    includeDisassembled: true,
    objectVisuals: objectSettings,
    lengthUnit,
  });
  const bytes = new Uint8Array(report.pdf);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  triggerDownload(blob, `${title}.report.pdf`);
}

export async function exportOrbitGifFromStore(
  preferredStem?: string,
  options?: OrbitGifExportOptions,
): Promise<void> {
  if (!orbitGifExporter) {
    throw new Error('Viewport is not ready for GIF export. Try again in a moment.');
  }

  const quality = normalizeExportQuality(options?.quality);
  const { activeFile, objectSettings } = useForgeStore.getState();
  const runResult = resolveRunResultForExport(quality);
  const hasShapes = runResult.objects.some((obj) => Boolean(obj.shape));
  if (!hasShapes) {
    throw new Error('No 3D objects available for GIF export.');
  }

  const stem = sanitizeExportStem(preferredStem ?? deriveExportStem(activeFile));
  const exporterOptions = shouldRegenerateForQuality(quality)
    ? {
      ...(options ?? {}),
      runResult,
      objectSettings,
    }
    : options;
  const blob = await orbitGifExporter(exporterOptions);
  triggerDownload(blob, `${stem}.orbit.gif`);
}

export function exportSketchFromStore(
  format: SketchExportFormat,
  preferredStem?: string,
): void {
  const { result, activeFile } = useForgeStore.getState();
  const current = requireSuccessfulRunResult(result);
  const sketchObjects = current.objects.filter((obj) => obj.sketch);
  if (sketchObjects.length === 0) {
    throw new Error('No 2D sketch objects available for export.');
  }

  const stem = sanitizeExportStem(preferredStem ?? deriveExportStem(activeFile));

  for (const obj of sketchObjects) {
    const sketch = obj.sketch!;
    const name = sketchObjects.length === 1 ? stem : `${stem}-${obj.name}`;

    if (format === 'svg') {
      const svg = sketchToSvg(sketch);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      triggerDownload(blob, `${name}.svg`);
    } else if (format === 'pdf') {
      const meta = obj.sketchMeta;
      if (!meta) {
        throw new Error('Sketch PDF export requires a constrained sketch (with sketchMeta). Use constrainedSketch() API.');
      }
      const { pdf } = generateSketchPdf(meta);
      const blob = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' });
      triggerDownload(blob, `${name}.sketch.pdf`);
    } else {
      const dxf = sketchToDxf(sketch);
      const blob = new Blob([dxf], { type: 'application/dxf' });
      triggerDownload(blob, `${name}.dxf`);
    }
  }
}

/**
 * ForgeCAD Script Runner
 *
 * Takes user code, wraps it so that forge API is available,
 * executes it in a Function() sandbox, and returns the resulting Shape.
 *
 * Supports cross-file imports via importSketch() and importPart().
 */

import * as ts from 'typescript';
import './holeCut';
import {
  Shape,
  box,
  cylinder,
  sphere,
  union,
  difference,
  intersection,
  hull3d,
  levelSet,
  setShapeDimensions,
  getShapeDimensions,
  type ShapeDimension,
  type GeometryInfo,
} from './kernel';
import type { Anchor3D } from './kernel';
import { resetShapeQueryOwnerIds } from './compilePlan';
import { intersectWithPlane, projectToPlane } from './section';
import { selectEdge, selectEdges, coalesceEdges } from './edgeQuery';
import { filletEdgeSegment, chamferEdgeSegment } from './edgeSegmentFeatures';
import {
  Sketch,
  rect,
  circle2d,
  roundedRect,
  polygon,
  ngon,
  ellipse,
  slot,
  star,
  union2d,
  difference2d,
  intersection2d,
  hull2d,
  path,
  stroke,
  constrainedSketch,
  ConstraintSketch,
  type SketchConstraintMeta,
  Point2D,
  Line2D,
  Circle2D,
  Rectangle2D,
  TrackedShape,
  buildRectExtrusionTopology,
  buildCircleExtrusionTopology,
  point,
  line,
  circle,
  rectangle,
  Constraint,
  degrees,
  radians,
  linearPattern,
  circularPattern,
  mirrorCopy,
  filletCorners,
  filletEdge,
  chamferEdge,
  arcBridgeBetweenRects,
  Curve3D,
  spline2d,
  spline3d,
  loft,
  sweep,
  sketchFromSvg,
  text2d,
  textWidth,
  dim,
  dimLine,
  resetDimensions,
  getCollectedDimensions,
  takeCollectedDimensions,
  sketchToSvg,
  sketchToDxf,
  type DimensionDef,
  type SvgImportOptions,
  type TextOptions,
} from './sketch';
import { param, boolParam, resetParams, getCollectedParams, runWithParamScope, setParamOverrides, type ParamDef } from './params';
import { joint } from './joint';
import { Assembly, ImportedAssembly, SolvedAssembly, assembly, bomToCsv } from './assembly';
import { Transform, composeChain } from './transform';
import { partLibrary } from './library';
import { ShapeGroup, group } from './group';
import { cutPlane, resetCutPlanes, getCollectedCutPlanes, type CutPlaneDef } from './cutPlane';
import { bom, resetBom, getCollectedBom, type BomDef } from './bom';
import {
  robotExport,
  resetRobotExport,
  getCollectedRobotExport,
  type CollectedRobotExport,
} from './robotExport';
import {
  verify,
  resetVerifications,
  getCollectedVerifications,
  type VerificationResult,
} from './verification';
import {
  explodeView,
  resetExplodeView,
  getCollectedExplodeView,
  type ExplodeViewOptions,
} from './explodeView';
import {
  jointsView,
  resetJointsView,
  getCollectedJointsView,
  type CollectedJointsView,
} from './jointsView';
import {
  viewConfig,
  resetViewConfig,
  getCollectedViewConfig,
  type ViewConfig,
} from './viewConfig';
import type { SolverWasmRunDebugSnapshot } from './sketch/constraints/solver-wasm';
import {
  resolveForgeQualityPreset,
  runWithForgeQuality,
  type ForgeQualityPreset,
} from './quality';
import { sheetMetal, SheetMetalPart } from './sheetMetal';

export interface SceneObject {
  id: string;
  name: string;
  shape: Shape | null;
  sketch: Sketch | null;
  color?: string;
  geometryInfo?: GeometryInfo | null;
  sketchMeta?: SketchConstraintMeta;
  /** If this object belongs to a named group (assembly), the group name */
  groupName?: string;
  /** Full object-tree path including ancestor groups and this object's local label. */
  treePath?: string[];
}

export interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  args: string[];
  timestamp: number;
}

export interface RunResult {
  shape: Shape | null;
  sketch: Sketch | null;
  objects: SceneObject[];
  params: ParamDef[];
  dimensions: DimensionDef[];
  bom: BomDef[];
  cutPlanes: CutPlaneDef[];
  explodeView: ExplodeViewOptions | null;
  jointsView: CollectedJointsView | null;
  viewConfig: ViewConfig | null;
  robotExport: CollectedRobotExport | null;
  quality: ForgeQualityPreset;
  error: string | null;
  timeMs: number;
  logs: LogEntry[];
  verifications: VerificationResult[];
  solverDebug?: SolverWasmRunDebugSnapshot | null;
}

export interface RunScriptOptions {
  /** Emit structured import trace logs into result.logs (CLI-friendly debugging). */
  debugImports?: boolean;
  /** Geometry quality profile for this execution. */
  quality?: ForgeQualityPreset;
  /** Allow successful runs that intentionally do not return renderable objects. */
  allowEmptyResult?: boolean;
}

// Collected logs from the current script execution
let _collectedLogs: LogEntry[] = [];

interface ImportScope {
  namePrefix?: string;
  localOverrides?: Record<string, number>;
}

interface RunnerExecutionOptions {
  debugImports: boolean;
  fileIndex: Map<string, string>;
  compiledFiles: Map<string, CompiledScript>;
  moduleCache: Map<string, ModuleCacheEntry>;
}

const LOG_MAX_DEPTH = 4;
const LOG_MAX_ARRAY_ITEMS = 24;
const LOG_MAX_OBJECT_KEYS = 32;
const LOG_NUMBER_PRECISION = 4;
const FORGE_RUNTIME_MODULE_SPECIFIERS = new Set([
  'forgecad',
  '@forge/runtime',
  '@forgecad/runtime',
]);

interface SourceMapSegment {
  generatedColumn: number;
  sourceLine: number;
  sourceColumn: number;
}

interface CompiledScript {
  source: string;
  code: string;
  sourceMapSegments: SourceMapSegment[][];
}

interface ModuleCacheEntry {
  exports: unknown;
  loaded: boolean;
}

interface ResolvedImportSource {
  source: string;
  lookupKey: string;
  resolvedPath: string;
}

function formatLogError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function roundLogNumber(value: number): number {
  return Number(value.toFixed(LOG_NUMBER_PRECISION));
}

function toRoundedNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
      .map(roundLogNumber);
  }
  if (
    ArrayBuffer.isView(value) &&
    'length' in value &&
    typeof (value as { length: unknown }).length === 'number'
  ) {
    return Array.from(value as unknown as ArrayLike<number>)
      .filter((entry) => Number.isFinite(entry))
      .map(roundLogNumber);
  }
  return [];
}

function summarizeShapeForLog(shape: Shape): Record<string, unknown> {
  const summary: Record<string, unknown> = { type: 'Shape' };
  if (shape.colorHex != null) summary.color = shape.colorHex;
  summary.geometry = shape.geometryInfo();

  try {
    const bbox = shape.boundingBox();
    const min = toRoundedNumberArray(bbox.min);
    const max = toRoundedNumberArray(bbox.max);
    summary.bbox = { min, max };
    if (min.length === max.length && min.length > 0) {
      summary.size = min.map((value, index) => roundLogNumber(max[index] - value));
    }
  } catch (error) {
    summary.bboxError = formatLogError(error);
  }

  try { summary.volume = roundLogNumber(shape.volume()); } catch (error) { summary.volumeError = formatLogError(error); }
  try { summary.surfaceArea = roundLogNumber(shape.surfaceArea()); } catch (error) { summary.surfaceAreaError = formatLogError(error); }
  try { summary.triangles = shape.numTri(); } catch (error) { summary.triangleError = formatLogError(error); }
  try { summary.isEmpty = shape.isEmpty(); } catch (error) { summary.isEmptyError = formatLogError(error); }
  return summary;
}

function summarizeTrackedShapeForLog(shape: TrackedShape): Record<string, unknown> {
  const faceNames = shape.faceNames();
  const edgeNames = shape.edgeNames();
  const limitedFaceNames = faceNames.slice(0, LOG_MAX_ARRAY_ITEMS);
  const limitedEdgeNames = edgeNames.slice(0, LOG_MAX_ARRAY_ITEMS);

  const faceDetails: Record<string, unknown> = {};
  for (const name of limitedFaceNames) {
    try {
      const face = shape.face(name);
      faceDetails[name] = {
        normal: toRoundedNumberArray(face.normal),
        center: toRoundedNumberArray(face.center),
      };
    } catch (error) {
      faceDetails[name] = { error: formatLogError(error) };
    }
  }

  const edgeDetails: Record<string, unknown> = {};
  for (const name of limitedEdgeNames) {
    try {
      const edge = shape.edge(name);
      edgeDetails[name] = {
        start: toRoundedNumberArray(edge.start),
        end: toRoundedNumberArray(edge.end),
      };
    } catch (error) {
      edgeDetails[name] = { error: formatLogError(error) };
    }
  }

  return {
    type: 'TrackedShape',
    geometry: shape.geometryInfo(),
    shape: summarizeShapeForLog(shape.toShape()),
    topology: {
      faceCount: faceNames.length,
      edgeCount: edgeNames.length,
      faceNames: limitedFaceNames,
      edgeNames: limitedEdgeNames,
      truncatedFaces: Math.max(0, faceNames.length - limitedFaceNames.length),
      truncatedEdges: Math.max(0, edgeNames.length - limitedEdgeNames.length),
      faces: faceDetails,
      edges: edgeDetails,
    },
  };
}

function inspectForLog(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? roundLogNumber(value) : String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') {
    const name = value.name || 'anonymous';
    return `[Function ${name}]`;
  }

  if (value instanceof Shape) return summarizeShapeForLog(value);
  if (value instanceof TrackedShape) return summarizeTrackedShapeForLog(value);
  if (value instanceof Error) return { type: value.name, message: value.message, stack: value.stack };
  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();

  if (depth >= LOG_MAX_DEPTH) return `[MaxDepth ${LOG_MAX_DEPTH}]`;

  if (Array.isArray(value)) {
    const items = value.slice(0, LOG_MAX_ARRAY_ITEMS).map((item) => inspectForLog(item, depth + 1, seen));
    if (value.length > LOG_MAX_ARRAY_ITEMS) {
      items.push(`[+${value.length - LOG_MAX_ARRAY_ITEMS} more items]`);
    }
    return items;
  }

  if (value instanceof Map) {
    const entries: Array<[string, unknown]> = [];
    let index = 0;
    for (const [key, entryValue] of value.entries()) {
      if (index >= LOG_MAX_ARRAY_ITEMS) break;
      entries.push([String(key), inspectForLog(entryValue, depth + 1, seen)]);
      index += 1;
    }
    return {
      type: 'Map',
      size: value.size,
      entries,
      truncatedEntries: Math.max(0, value.size - entries.length),
    };
  }

  if (value instanceof Set) {
    const setValues = Array.from(value.values());
    return {
      type: 'Set',
      size: value.size,
      values: setValues.slice(0, LOG_MAX_ARRAY_ITEMS).map((entry) => inspectForLog(entry, depth + 1, seen)),
      truncatedValues: Math.max(0, setValues.length - LOG_MAX_ARRAY_ITEMS),
    };
  }

  if (typeof value === 'object') {
    if (typeof (value as { toShape?: unknown }).toShape === 'function') {
      try {
        const resolved = (value as { toShape: () => unknown }).toShape();
        if (resolved instanceof Shape) {
          return {
            type: (value as { constructor?: { name?: string } }).constructor?.name ?? 'ShapeLike',
            shape: summarizeShapeForLog(resolved),
          };
        }
      } catch (error) {
        return { type: 'ShapeLike', error: formatLogError(error) };
      }
    }

    if (seen.has(value as object)) return '[Circular]';
    seen.add(value as object);

    const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;
    const out: Record<string, unknown> = {};
    if (constructorName && constructorName !== 'Object') out.type = constructorName;

    const entries = Object.entries(value as Record<string, unknown>);
    const limitedEntries = entries.slice(0, LOG_MAX_OBJECT_KEYS);
    for (const [key, entryValue] of limitedEntries) {
      out[key] = inspectForLog(entryValue, depth + 1, seen);
    }
    if (entries.length > LOG_MAX_OBJECT_KEYS) {
      out.truncatedKeys = entries.length - LOG_MAX_OBJECT_KEYS;
    }

    seen.delete(value as object);
    return out;
  }

  return String(value);
}

function formatLogArg(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const inspected = inspectForLog(value);
    if (typeof inspected === 'string') return inspected;
    return JSON.stringify(inspected, null, 2);
  } catch (error) {
    return `[Log serialization failed: ${formatLogError(error)}]`;
  }
}

function makeSandboxConsole(): Record<string, (...args: unknown[]) => void> {
  const capture = (level: LogEntry['level']) => (...args: unknown[]) => {
    _collectedLogs.push({
      level,
      args: args.map(formatLogArg),
      timestamp: Date.now(),
    });
  };
  return { log: capture('log'), warn: capture('warn'), error: capture('error'), info: capture('info') };
}

function parseImportParamArgs(
  importKind: 'importSketch' | 'importPart' | 'importGroup' | 'importAssembly',
  fileName: string,
  args: unknown,
): Record<string, number> {
  if (args == null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new Error(`${importKind}("${fileName}") overrides must be an object: { "Param Name": number }`);
  }

  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${importKind}("${fileName}") override "${key}" must be a finite number`);
    }
    normalized[key] = value;
  }
  return normalized;
}

const SVG_IMPORT_OPTION_KEYS = new Set([
  'include',
  'regionSelection',
  'maxRegions',
  'minRegionArea',
  'minRegionAreaRatio',
  'flattenTolerance',
  'arcSegments',
  'scale',
  'maxWidth',
  'maxHeight',
  'centerOnOrigin',
  'simplify',
  'invertY',
]);

function parseSvgImportArgs(
  importKind: 'importSketch' | 'importSvgSketch',
  fileName: string,
  args: unknown,
): SvgImportOptions {
  if (args == null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new Error(`${importKind}("${fileName}") options must be an object`);
  }

  const out: SvgImportOptions = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (!SVG_IMPORT_OPTION_KEYS.has(key)) {
      throw new Error(
        `${importKind}("${fileName}") unknown SVG option "${key}". ` +
        `Allowed keys: ${Array.from(SVG_IMPORT_OPTION_KEYS).join(', ')}`,
      );
    }

    switch (key) {
      case 'include': {
        if (typeof value !== 'string' || !['auto', 'fill', 'stroke', 'fill-and-stroke'].includes(value)) {
          throw new Error(
            `${importKind}("${fileName}") option "include" must be one of: auto, fill, stroke, fill-and-stroke`,
          );
        }
        out.include = value as SvgImportOptions['include'];
        break;
      }
      case 'regionSelection': {
        if (typeof value !== 'string' || !['all', 'largest'].includes(value)) {
          throw new Error(
            `${importKind}("${fileName}") option "regionSelection" must be one of: all, largest`,
          );
        }
        out.regionSelection = value as SvgImportOptions['regionSelection'];
        break;
      }
      case 'invertY': {
        if (typeof value !== 'boolean') {
          throw new Error(`${importKind}("${fileName}") option "invertY" must be a boolean`);
        }
        out.invertY = value;
        break;
      }
      case 'centerOnOrigin': {
        if (typeof value !== 'boolean') {
          throw new Error(`${importKind}("${fileName}") option "centerOnOrigin" must be a boolean`);
        }
        out.centerOnOrigin = value;
        break;
      }
      default: {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`${importKind}("${fileName}") option "${key}" must be a finite number`);
        }
        (out as Record<string, number>)[key] = value;
        break;
      }
    }
  }

  return out;
}

function describeScriptResultType(value: unknown): string {
  if (value == null) return String(value);
  if (value instanceof Shape) return 'Shape';
  if (value instanceof Sketch) return 'Sketch';
  if (value instanceof TrackedShape) return 'TrackedShape';
  if (value instanceof ShapeGroup) return 'ShapeGroup';
  if (value instanceof Assembly) return 'Assembly';
  if (value instanceof ImportedAssembly) return 'ImportedAssembly';
  if (Array.isArray(value)) return 'Array';
  if (typeof value === 'object' && typeof (value as { toShape?: unknown }).toShape === 'function') {
    try {
      const resolved = (value as { toShape: () => unknown }).toShape();
      if (resolved instanceof Shape) {
        const ctorName = (value as { constructor?: { name?: string } }).constructor?.name ?? 'Object';
        return `${ctorName}(toShape()->Shape)`;
      }
    } catch {
      // Ignore toShape probing failures and fall back to constructor/type.
    }
  }
  const ctorName = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctorName && ctorName !== 'Object') return ctorName;
  return typeof value;
}

function envFlagEnabled(name: string): boolean {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

function collapsePathSegments(path: string): string {
  const normalized = normalizePathSeparators(path);
  const isAbsolute = normalized.startsWith('/');
  const segments = normalized.split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbsolute) {
        stack.push('..');
      }
      continue;
    }
    stack.push(segment);
  }

  const joined = stack.join('/');
  if (isAbsolute) return joined ? `/${joined}` : '/';
  return joined;
}

function dirnamePath(path: string): string {
  const collapsed = collapsePathSegments(path);
  if (collapsed === '/' || collapsed === '') return '';
  const trimmed = collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
  const slash = trimmed.lastIndexOf('/');
  if (slash < 0) return '';
  return trimmed.slice(0, slash);
}

function isRelativeImportSpecifier(specifier: string): boolean {
  return (
    specifier === '.' ||
    specifier === '..' ||
    specifier.startsWith('./') ||
    specifier.startsWith('../')
  );
}

function normalizeLookupPath(path: string): string {
  return collapsePathSegments(path).replace(/^\/+/, '');
}

function resolveImportPath(fromFile: string, requestedPath: string): string {
  const normalizedRequest = requestedPath.trim();
  if (!normalizedRequest) return '';

  if (isRelativeImportSpecifier(normalizedRequest)) {
    const fromDir = dirnamePath(fromFile);
    const combined = fromDir ? `${fromDir}/${normalizedRequest}` : normalizedRequest;
    return normalizeLookupPath(combined);
  }

  return normalizeLookupPath(normalizedRequest);
}

function buildFileIndex(allFiles: Record<string, string>): Map<string, string> {
  const fileIndex = new Map<string, string>();
  for (const key of Object.keys(allFiles)) {
    const normalized = normalizeLookupPath(key);
    if (!normalized) continue;
    if (!fileIndex.has(normalized)) fileIndex.set(normalized, key);
  }
  return fileIndex;
}

function resolveImportSource(
  fromFile: string,
  requestedName: string,
  allFiles: Record<string, string>,
  options: RunnerExecutionOptions,
): ResolvedImportSource {
  if (typeof requestedName !== 'string' || requestedName.trim().length === 0) {
    throw new Error('Import path must be a non-empty string');
  }
  const resolvedPath = resolveImportPath(fromFile, requestedName);
  const lookupKey = options.fileIndex.get(resolvedPath);
  if (!lookupKey) {
    const suffix = resolvedPath && resolvedPath !== requestedName
      ? ` (resolved to "${resolvedPath}" from "${fromFile}")`
      : ` (from "${fromFile}")`;
    throw new Error(`File not found: "${requestedName}"${suffix}`);
  }
  const source = allFiles[lookupKey];
  if (typeof source !== 'string') {
    throw new Error(`File not found: "${requestedName}" (resolved to "${resolvedPath}")`);
  }
  return { source, lookupKey, resolvedPath };
}

function logImportTrace(
  fileName: string,
  scope: ImportScope,
  options: RunnerExecutionOptions,
  kind: 'importSketch' | 'importPart' | 'importSvgSketch' | 'importGroup' | 'importAssembly' | 'require',
  target: string,
  phase: 'start' | 'success' | 'error',
  details: Record<string, unknown> = {},
): void {
  if (!options.debugImports) return;
  const payload = {
    kind,
    from: fileName,
    to: target,
    scope: scope.namePrefix ?? fileName,
    phase,
    ...details,
  };
  _collectedLogs.push({
    level: 'info',
    args: [`[import] ${kind} ${phase}`, formatLogArg(payload)],
    timestamp: Date.now(),
  });
}

function isSvgImportPath(path: string): boolean {
  return path.toLowerCase().endsWith('.svg');
}

function stableSerializeOverrides(overrides?: Record<string, number>): string {
  if (!overrides) return '';
  return JSON.stringify(Object.keys(overrides).sort().map((key) => [key, overrides[key]]));
}

function makeModuleCacheKey(fileName: string, scope: ImportScope): string {
  return `${fileName}\0${scope.namePrefix ?? ''}\0${stableSerializeOverrides(scope.localOverrides)}`;
}

const BASE64_VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VLQ_LOOKUP = Object.fromEntries(
  BASE64_VLQ_CHARS.split('').map((char, index) => [char, index]),
) as Record<string, number>;

function decodeBase64Vlq(segment: string): number[] {
  const values: number[] = [];
  let index = 0;

  while (index < segment.length) {
    let value = 0;
    let shift = 0;
    let continuation = false;

    do {
      const digit = BASE64_VLQ_LOOKUP[segment[index]];
      index += 1;
      if (digit == null) {
        throw new Error(`Invalid source map segment "${segment}"`);
      }
      continuation = (digit & 32) !== 0;
      value += (digit & 31) << shift;
      shift += 5;
    } while (continuation && index < segment.length);

    const signed = (value & 1) === 1 ? -(value >> 1) : (value >> 1);
    values.push(signed);
  }

  return values;
}

function decodeSourceMapSegments(sourceMapText?: string): SourceMapSegment[][] {
  if (!sourceMapText) return [];

  let mappings = '';
  try {
    const parsed = JSON.parse(sourceMapText) as { mappings?: string };
    mappings = typeof parsed.mappings === 'string' ? parsed.mappings : '';
  } catch {
    return [];
  }
  if (!mappings) return [];

  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let nameIndex = 0;

  return mappings.split(';').map((line) => {
    if (!line) return [];

    let generatedColumn = 0;
    const segments: SourceMapSegment[] = [];
    for (const segmentText of line.split(',')) {
      if (!segmentText) continue;
      const values = decodeBase64Vlq(segmentText);
      generatedColumn += values[0] ?? 0;
      if (values.length >= 4) {
        sourceIndex += values[1];
        sourceLine += values[2];
        sourceColumn += values[3];
        if (values.length >= 5) nameIndex += values[4];
        if (sourceIndex === 0) {
          segments.push({
            generatedColumn,
            sourceLine: sourceLine + 1,
            sourceColumn: sourceColumn + 1,
          });
        }
      }
    }
    void nameIndex;
    return segments;
  });
}

function formatTranspileDiagnostic(fileName: string, code: string, diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const sourceFile = diagnostic.file ?? ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  return `${message} (${fileName}:${line + 1}:${character + 1})`;
}

function compileScript(code: string, fileName: string, options: RunnerExecutionOptions): CompiledScript {
  const cached = options.compiledFiles.get(fileName);
  if (cached && cached.source === code) {
    return cached;
  }

  const transpiled = ts.transpileModule(code, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      sourceMap: true,
      inlineSources: true,
      newLine: ts.NewLineKind.LineFeed,
    },
  });

  const diagnostics = (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    throw new Error(formatTranspileDiagnostic(fileName, code, diagnostics[0]));
  }

  const compiled: CompiledScript = {
    source: code,
    code: transpiled.outputText.replace(/\n\/\/# sourceMappingURL=.*$/u, ''),
    sourceMapSegments: decodeSourceMapSegments(transpiled.sourceMapText),
  };
  options.compiledFiles.set(fileName, compiled);
  return compiled;
}

function mapGeneratedPositionToSource(
  compiled: CompiledScript | undefined,
  generatedLine: number,
  generatedColumn: number,
): { line: number; column: number } | null {
  if (!compiled) return null;
  const segments = compiled.sourceMapSegments[generatedLine - 1];
  if (!segments || segments.length === 0) return null;

  let match = segments[0];
  for (const segment of segments) {
    if (segment.generatedColumn + 1 > generatedColumn) break;
    match = segment;
  }

  return {
    line: match.sourceLine,
    column: match.sourceColumn + Math.max(0, generatedColumn - (match.generatedColumn + 1)),
  };
}

function resolveErrorLocation(
  stack: string,
  compiledFiles: Map<string, CompiledScript>,
): { fileName: string; line: number; column: number } | null {
  const framePattern = /(?:eval\s+\()?([^()\s]+):(\d+):(\d+)\)?/u;

  for (const line of stack.split('\n')) {
    const match = line.match(framePattern);
    if (!match) continue;
    const [, candidateFile, lineText, columnText] = match;
    if (!compiledFiles.has(candidateFile)) continue;
    const generatedLine = parseInt(lineText, 10);
    const generatedColumn = parseInt(columnText, 10);
    const mapped = mapGeneratedPositionToSource(compiledFiles.get(candidateFile), generatedLine, generatedColumn);
    return {
      fileName: candidateFile,
      line: mapped?.line ?? generatedLine,
      column: mapped?.column ?? generatedColumn,
    };
  }

  const anonymousMatch = stack.match(/<anonymous>:(\d+):(\d+)/u);
  if (!anonymousMatch) return null;
  return {
    fileName: '<anonymous>',
    line: Math.max(1, parseInt(anonymousMatch[1], 10) - 2),
    column: parseInt(anonymousMatch[2], 10),
  };
}

function isRenderableEntryResult(value: unknown): boolean {
  return (
    value instanceof Shape
    || value instanceof Sketch
    || value instanceof TrackedShape
    || value instanceof ShapeGroup
    || Array.isArray(value)
  );
}

function resolveExportedEntryResult(exportsValue: unknown): unknown {
  if (isRenderableEntryResult(exportsValue)) return exportsValue;
  if (
    exportsValue
    && typeof exportsValue === 'object'
    && 'default' in (exportsValue as Record<string, unknown>)
    && isRenderableEntryResult((exportsValue as Record<string, unknown>).default)
  ) {
    return (exportsValue as Record<string, unknown>).default;
  }
  return undefined;
}

function hasExplicitModuleExports(exportsValue: unknown, initialExportsRef: unknown): boolean {
  if (exportsValue !== initialExportsRef) return true;
  if (!exportsValue || typeof exportsValue !== 'object') return exportsValue != null;
  const keys = Object.keys(exportsValue as Record<string, unknown>);
  return keys.some((key) => key !== '__esModule');
}

function createForgeRuntimeModule(bindings: Record<string, unknown>): Record<string, unknown> {
  const runtime = { ...bindings } as Record<string, unknown>;
  Object.defineProperty(runtime, '__esModule', { value: true });
  runtime.default = runtime;
  return runtime;
}

/**
 * Execute a single file's code with the forge sandbox.
 * `allFiles` enables cross-file imports.
 * `visited` prevents circular imports.
 */
function executeFile(
  code: string,
  fileName: string,
  allFiles: Record<string, string>,
  visited: Set<string>,
  scope: ImportScope = {},
  options: RunnerExecutionOptions,
  executionMode: 'script' | 'module' = 'script',
  moduleCacheEntry?: ModuleCacheEntry,
): unknown {
  const trackCircularImports = executionMode === 'script';
  if (trackCircularImports) {
    if (visited.has(fileName)) {
      throw new Error(`Circular import detected: ${fileName}`);
    }
    visited.add(fileName);
  }
  try {
    let importCallCount = 0;
    const makeChildScopePrefix = (name: string) => {
      importCallCount += 1;
      const local = `${name}#${importCallCount}`;
      return scope.namePrefix ? `${scope.namePrefix} > ${local}` : local;
    };

    const importSketch = (name: string, paramOverrides?: Record<string, number> | SvgImportOptions): Sketch => {
      const { source: src, lookupKey, resolvedPath } = resolveImportSource(fileName, name, allFiles, options);
      if (isSvgImportPath(resolvedPath)) {
        const svgOptions = parseSvgImportArgs('importSketch', name, paramOverrides);
        logImportTrace(fileName, scope, options, 'importSketch', resolvedPath, 'start', {
          requested: name,
          mode: 'svg',
          options: svgOptions,
        });
        try {
          const result = sketchFromSvg(src, svgOptions);
          logImportTrace(fileName, scope, options, 'importSketch', resolvedPath, 'success', {
            requested: name,
            mode: 'svg',
            got: 'Sketch',
            area: Number(result.area().toFixed(4)),
            verts: result.numVert(),
          });
          return result;
        } catch (error) {
          logImportTrace(fileName, scope, options, 'importSketch', resolvedPath, 'error', {
            requested: name,
            mode: 'svg',
            error: formatLogError(error),
          });
          throw error;
        }
      }

      const localOverrides = parseImportParamArgs('importSketch', name, paramOverrides);
      const childScope = { namePrefix: makeChildScopePrefix(resolvedPath), localOverrides };
      logImportTrace(fileName, scope, options, 'importSketch', resolvedPath, 'start', { requested: name, overrides: localOverrides });
      let result: ReturnType<typeof executeFile>;
      try {
        result = executeFile(src, lookupKey, allFiles, visited, childScope, options);
      } catch (error) {
        logImportTrace(fileName, scope, options, 'importSketch', resolvedPath, 'error', { requested: name, error: formatLogError(error) });
        throw error;
      }
      if (result instanceof Sketch) {
        logImportTrace(fileName, scope, options, 'importSketch', resolvedPath, 'success', { requested: name, got: 'Sketch' });
        return result;
      }
      const got = describeScriptResultType(result);
      logImportTrace(fileName, scope, options, 'importSketch', resolvedPath, 'error', { requested: name, got });
      throw new Error(`"${resolvedPath}" did not return a Sketch (got ${got})`);
    };

    // importSvgSketch("name.svg", options?) — parses an SVG into Sketch geometry
    const importSvgSketch = (name: string, optionsArg?: SvgImportOptions): Sketch => {
      const { source: src, resolvedPath } = resolveImportSource(fileName, name, allFiles, options);
      if (!isSvgImportPath(resolvedPath)) {
        throw new Error(`importSvgSketch("${name}") requires an .svg file (resolved to "${resolvedPath}")`);
      }
      const svgOptions = parseSvgImportArgs('importSvgSketch', name, optionsArg);
      logImportTrace(fileName, scope, options, 'importSvgSketch', resolvedPath, 'start', { requested: name, options: svgOptions });
      try {
        const result = sketchFromSvg(src, svgOptions);
        logImportTrace(fileName, scope, options, 'importSvgSketch', resolvedPath, 'success', {
          requested: name,
          got: 'Sketch',
          area: Number(result.area().toFixed(4)),
          verts: result.numVert(),
        });
        return result;
      } catch (error) {
        logImportTrace(fileName, scope, options, 'importSvgSketch', resolvedPath, 'error', {
          requested: name,
          error: formatLogError(error),
        });
        throw error;
      }
    };

    // importPart("name", { ...paramOverrides }) — executes another file, expects a Shape result
    const importPart = (name: string, paramOverrides?: Record<string, number>): Shape => {
      const { source: src, lookupKey, resolvedPath } = resolveImportSource(fileName, name, allFiles, options);
      const localOverrides = parseImportParamArgs('importPart', name, paramOverrides);
      const childScope = { namePrefix: makeChildScopePrefix(resolvedPath), localOverrides };
      const dimStart = getCollectedDimensions().length;
      logImportTrace(fileName, scope, options, 'importPart', resolvedPath, 'start', { requested: name, overrides: localOverrides });
      let result: ReturnType<typeof executeFile>;
      try {
        result = executeFile(src, lookupKey, allFiles, visited, childScope, options);
      } catch (error) {
        logImportTrace(fileName, scope, options, 'importPart', resolvedPath, 'error', { requested: name, error: formatLogError(error) });
        throw error;
      }
      const importedDims = takeCollectedDimensions(dimStart);
      if (result instanceof Shape) {
        logImportTrace(fileName, scope, options, 'importPart', resolvedPath, 'success', { requested: name, got: 'Shape', importedDims: importedDims.length });
        return setShapeDimensions(result, importedDims as ShapeDimension[]);
      }
      if (result instanceof TrackedShape) {
        logImportTrace(fileName, scope, options, 'importPart', resolvedPath, 'success', {
          requested: name,
          got: 'TrackedShape',
          importedDims: importedDims.length,
          unwrapped: true,
        });
        return setShapeDimensions(result.toShape(), importedDims as ShapeDimension[]);
      }
      const got = describeScriptResultType(result);
      logImportTrace(fileName, scope, options, 'importPart', resolvedPath, 'error', { requested: name, got });
      throw new Error(`"${resolvedPath}" did not return a Shape (got ${got})`);
    };

    // importGroup("name", { ...paramOverrides }) — executes another file, expects a ShapeGroup result
    const importGroup = (name: string, paramOverrides?: Record<string, number>): ShapeGroup => {
      const { source: src, lookupKey, resolvedPath } = resolveImportSource(fileName, name, allFiles, options);
      const localOverrides = parseImportParamArgs('importGroup', name, paramOverrides);
      const childScope = { namePrefix: makeChildScopePrefix(resolvedPath), localOverrides };
      logImportTrace(fileName, scope, options, 'importGroup', resolvedPath, 'start', { requested: name, overrides: localOverrides });
      let result: ReturnType<typeof executeFile>;
      try {
        result = executeFile(src, lookupKey, allFiles, visited, childScope, options);
      } catch (error) {
        logImportTrace(fileName, scope, options, 'importGroup', resolvedPath, 'error', { requested: name, error: formatLogError(error) });
        throw error;
      }
      if (result instanceof ShapeGroup) {
        logImportTrace(fileName, scope, options, 'importGroup', resolvedPath, 'success', { requested: name, got: 'ShapeGroup' });
        return result;
      }
      const got = describeScriptResultType(result);
      logImportTrace(fileName, scope, options, 'importGroup', resolvedPath, 'error', { requested: name, got });
      throw new Error(`"${resolvedPath}" did not return a ShapeGroup (got ${got}). Use group(...) as the return value, or use importPart() for single-shape files.`);
    };

    // importAssembly("name", { ...paramOverrides }) — executes another file, expects an Assembly result
    const importAssembly = (name: string, paramOverrides?: Record<string, number>): ImportedAssembly => {
      const { source: src, lookupKey, resolvedPath } = resolveImportSource(fileName, name, allFiles, options);
      const localOverrides = parseImportParamArgs('importAssembly', name, paramOverrides);
      const childScope = { namePrefix: makeChildScopePrefix(resolvedPath), localOverrides };
      logImportTrace(fileName, scope, options, 'importAssembly', resolvedPath, 'start', { requested: name, overrides: localOverrides });
      let result: ReturnType<typeof executeFile>;
      try {
        result = executeFile(src, lookupKey, allFiles, visited, childScope, options);
      } catch (error) {
        logImportTrace(fileName, scope, options, 'importAssembly', resolvedPath, 'error', { requested: name, error: formatLogError(error) });
        throw error;
      }
      if (result instanceof Assembly) {
        logImportTrace(fileName, scope, options, 'importAssembly', resolvedPath, 'success', { requested: name, got: 'Assembly' });
        return new ImportedAssembly(result, result.getReferences());
      }
      const got = describeScriptResultType(result);
      logImportTrace(fileName, scope, options, 'importAssembly', resolvedPath, 'error', { requested: name, got });
      throw new Error(`"${resolvedPath}" did not return an Assembly (got ${got}). Return the assembly() instance directly (before calling .solve()).`);
    };

    // Wrappers that auto-unwrap TrackedShape for boolean ops
    const unwrap = (s: Shape | TrackedShape): Shape =>
      s instanceof TrackedShape ? s.toShape() : s;
    const wrappedUnion = (...shapes: (Shape | TrackedShape)[]) => union(...shapes.map(unwrap));
    const wrappedDifference = (...shapes: (Shape | TrackedShape)[]) => difference(...shapes.map(unwrap));
    const wrappedIntersection = (...shapes: (Shape | TrackedShape)[]) => intersection(...shapes.map(unwrap));

    const wrappedHull3d = (...args: (Shape | TrackedShape | [number, number, number])[]) =>
      hull3d(...args.map(a => a instanceof TrackedShape ? a.toShape() : a));

    // Tracked wrappers for primitives — user scripts get TrackedShape with named faces/edges
    const trackedBox = (x: number, y: number, z: number, center = false): TrackedShape => {
      const shape = box(x, y, z, center);
      const ox = center ? -x / 2 : 0;
      const oy = center ? -y / 2 : 0;
      const r = Rectangle2D.fromDimensions(ox, oy, x, y);
      const topo = buildRectExtrusionTopology(r, z, true, center ? -z / 2 : 0);
      return new TrackedShape(shape, topo, 0, true);
    };

    const trackedCylinder = (
      height: number, radius: number, radiusTop?: number, segments?: number, center = false,
    ): TrackedShape => {
      const shape = cylinder(height, radius, radiusTop, segments, center);
      const c = { center: new Point2D(0, 0), radius, radiusTop };
      const topo = buildCircleExtrusionTopology(c, height, center);
      return new TrackedShape(shape, topo, 0, true);
    };

    const sandboxConsole = makeSandboxConsole();
    const runtimeBindings: Record<string, unknown> = {
      box: trackedBox,
      cylinder: trackedCylinder,
      sphere,
      union: wrappedUnion,
      difference: wrappedDifference,
      intersection: wrappedIntersection,
      hull3d: wrappedHull3d,
      levelSet,
      rect,
      circle2d,
      roundedRect,
      polygon,
      ngon,
      ellipse,
      slot,
      star,
      path,
      stroke,
      constrainedSketch,
      union2d,
      difference2d,
      intersection2d,
      hull2d,
      Point2D,
      Line2D,
      Circle2D,
      Rectangle2D,
      TrackedShape,
      point,
      line,
      circle,
      rectangle,
      Constraint,
      degrees,
      radians,
      linearPattern,
      circularPattern,
      mirrorCopy,
      filletCorners,
      filletEdge,
      chamferEdge,
      arcBridgeBetweenRects,
      Curve3D,
      spline2d,
      spline3d,
      loft,
      sweep,
      sheetMetal,
      SheetMetalPart,
      param,
      boolParam,
      Shape,
      Sketch,
      lib: partLibrary,
      joint,
      Transform,
      composeChain,
      assembly,
      Assembly,
      SolvedAssembly,
      bomToCsv,
      intersectWithPlane,
      projectToPlane,
      selectEdge,
      selectEdges,
      coalesceEdges,
      filletEdgeSegment,
      chamferEdgeSegment,
      importSketch,
      importPart,
      importGroup,
      importAssembly,
      importSvgSketch,
      text2d,
      textWidth,
      dim,
      dimLine,
      sketchToSvg,
      sketchToDxf,
      bom,
      robotExport,
      group,
      ShapeGroup,
      console: sandboxConsole,
      cutPlane,
      explodeView,
      jointsView,
      viewConfig,
      verify,
    };

    const requireModule = (requestedName: string): unknown => {
      if (typeof requestedName !== 'string' || requestedName.trim().length === 0) {
        throw new Error('Module specifier must be a non-empty string');
      }
      const normalizedRequested = requestedName.trim();

      if (FORGE_RUNTIME_MODULE_SPECIFIERS.has(normalizedRequested)) {
        logImportTrace(fileName, scope, options, 'require', normalizedRequested, 'start', { requested: normalizedRequested, virtual: true });
        const runtimeModule = createForgeRuntimeModule(runtimeBindings);
        logImportTrace(fileName, scope, options, 'require', normalizedRequested, 'success', {
          requested: normalizedRequested,
          virtual: true,
          got: 'ForgeRuntimeModule',
        });
        return runtimeModule;
      }

      const { source: src, lookupKey, resolvedPath } = resolveImportSource(fileName, normalizedRequested, allFiles, options);
      if (isSvgImportPath(resolvedPath)) {
        throw new Error(
          `JS import "${normalizedRequested}" resolved to "${resolvedPath}", which is an SVG asset. ` +
          'Use importSketch() or importSvgSketch() instead.',
        );
      }
      if (resolvedPath.endsWith('.forge-notebook.json')) {
        throw new Error(
          `JS import "${normalizedRequested}" resolved to "${resolvedPath}", which is a notebook file. ` +
          'Export the notebook to .forge.js first.',
        );
      }

      logImportTrace(fileName, scope, options, 'require', resolvedPath, 'start', { requested: normalizedRequested });

      const cacheKey = makeModuleCacheKey(lookupKey, scope);
      const cached = options.moduleCache.get(cacheKey);
      if (cached) {
        logImportTrace(fileName, scope, options, 'require', resolvedPath, 'success', {
          requested: normalizedRequested,
          got: describeScriptResultType(cached.exports),
          cached: true,
        });
        return cached.exports;
      }

      const nextModuleEntry: ModuleCacheEntry = { exports: {}, loaded: false };
      options.moduleCache.set(cacheKey, nextModuleEntry);
      try {
        const moduleExports = executeFile(
          src,
          lookupKey,
          allFiles,
          visited,
          scope,
          options,
          'module',
          nextModuleEntry,
        );
        nextModuleEntry.exports = moduleExports;
        nextModuleEntry.loaded = true;
        logImportTrace(fileName, scope, options, 'require', resolvedPath, 'success', {
          requested: normalizedRequested,
          got: describeScriptResultType(moduleExports),
          cached: false,
        });
        return moduleExports;
      } catch (error) {
        options.moduleCache.delete(cacheKey);
        logImportTrace(fileName, scope, options, 'require', resolvedPath, 'error', {
          requested: normalizedRequested,
          error: formatLogError(error),
        });
        throw error;
      }
    };

    const compiled = compileScript(code, fileName, options);
    const bindingNames = Object.keys(runtimeBindings);
    const bindingValues = bindingNames.map((name) => runtimeBindings[name]);
    const fn = new Function(
      'exports',
      'module',
      'require',
      '__filename',
      '__dirname',
      ...bindingNames,
      `${compiled.code}\n//# sourceURL=${fileName}`,
    );

    const moduleValue = {
      exports: executionMode === 'module' && moduleCacheEntry ? moduleCacheEntry.exports : {},
    };
    const initialExportsRef = moduleValue.exports;
    const returnValue = runWithParamScope(scope, () => fn(
      moduleValue.exports,
      moduleValue,
      requireModule,
      fileName,
      dirnamePath(fileName),
      ...bindingValues,
    ));

    if (executionMode === 'module') {
      if (returnValue !== undefined) {
        if (hasExplicitModuleExports(moduleValue.exports, initialExportsRef)) {
          throw new Error(
            `"${fileName}" mixed top-level return with exports while being imported as a JS module. ` +
            'Use either return or export/module.exports, not both.',
          );
        }
        if (moduleCacheEntry) {
          moduleCacheEntry.exports = returnValue;
        }
        return returnValue;
      }
      if (moduleCacheEntry) {
        moduleCacheEntry.exports = moduleValue.exports;
      }
      return moduleValue.exports;
    }

    const exportedResult = resolveExportedEntryResult(moduleValue.exports);
    if (returnValue === undefined) {
      return exportedResult ?? null;
    }
    return returnValue;
  } finally {
    if (trackCircularImports) {
      visited.delete(fileName);
    }
  }
}

export function runScript(
  code: string,
  fileName = 'main.forge.js',
  allFiles: Record<string, string> = {},
  options: RunScriptOptions = {},
): RunResult {
  resetParams();
  resetShapeQueryOwnerIds();
  resetDimensions();
  resetBom();
  resetRobotExport();
  resetCutPlanes();
  resetExplodeView();
  resetJointsView();
  resetViewConfig();
  resetVerifications();
  _collectedLogs = [];
  const t0 = performance.now();
  const execOptions: RunnerExecutionOptions = {
    debugImports: options.debugImports ?? envFlagEnabled('FORGECAD_DEBUG_IMPORTS'),
    fileIndex: buildFileIndex(allFiles),
    compiledFiles: new Map(),
    moduleCache: new Map(),
  };
  const quality = resolveForgeQualityPreset(options.quality);

  try {
    return runWithForgeQuality(quality, () => {
      const result = executeFile(code, fileName, allFiles, new Set(), {}, execOptions);

    const objects: SceneObject[] = [];
    const shapeDimensions: DimensionDef[] = [];
    const pushShape = (
      shape: Shape,
      name: string,
      groupName?: string,
      color?: string,
      geometryInfo?: GeometryInfo,
      treePath?: string[],
    ) => {
      const objectId = `obj-${objects.length + 1}`;
      objects.push({
        id: objectId,
        name,
        shape,
        sketch: null,
        color: color || shape.colorHex,
        geometryInfo: geometryInfo ?? shape.geometryInfo(),
        groupName,
        treePath: treePath && treePath.length > 0 ? [...treePath] : [name],
      });

      const dims = getShapeDimensions(shape) as unknown as DimensionDef[];
      dims.forEach((dim) => {
        if (dim.currentComponent) {
          const ownerNames = new Set<string>(dim.components ?? []);
          ownerNames.add(name);
          shapeDimensions.push({
            ...dim,
            components: Array.from(ownerNames),
            currentComponent: undefined,
          });
          return;
        }
        shapeDimensions.push(dim);
      });
      if (shape.isEmpty()) {
        _collectedLogs.push({
          level: 'warn',
          args: [`Object "${name}" is empty. This usually means full clipping, full subtraction, or invalid geometry.`],
          timestamp: Date.now(),
        });
      }
    };
    const pushSketch = (sketch: Sketch, name: string, groupName?: string, treePath?: string[]) => {
      const meta = sketch instanceof ConstraintSketch ? sketch.constraintMeta : undefined;
      objects.push({
        id: `obj-${objects.length + 1}`,
        name,
        shape: null,
        sketch,
        geometryInfo: null,
        sketchMeta: meta,
        color: sketch.colorHex,
        groupName,
        treePath: treePath && treePath.length > 0 ? [...treePath] : [name],
      });
    };

    const isNamedObject = (item: unknown): item is { name: string; shape?: Shape; sketch?: Sketch; color?: string; group?: unknown[] } => {
      return !!item && typeof item === 'object' && 'name' in item;
    };

    const shapeGroupChildSegment = (grp: ShapeGroup, index: number, root = false): string => {
      const childName = grp.childName(index);
      if (childName) return childName;
      return root ? `Object ${index + 1}` : `${index + 1}`;
    };

    const groupChildLabel = (grp: ShapeGroup, parentLabel: string, index: number): string => {
      return `${parentLabel}.${shapeGroupChildSegment(grp, index)}`;
    };

    const rootGroupChildLabel = (grp: ShapeGroup, index: number): string => {
      return shapeGroupChildSegment(grp, index, true);
    };

    const flattenGroupChild = (
      child: Shape | Sketch | TrackedShape | ShapeGroup,
      label: string,
      groupName?: string,
      treePath?: string[],
    ) => {
      const resolvedTreePath = treePath && treePath.length > 0 ? treePath : [label];
      if (child instanceof ShapeGroup) {
        child.children.forEach((nested, i) => {
          flattenGroupChild(
            nested,
            groupChildLabel(child, label, i),
            groupName,
            [...resolvedTreePath, shapeGroupChildSegment(child, i)],
          );
        });
        return;
      }
      if (child instanceof TrackedShape) {
        pushShape(child.toShape(), label, groupName, undefined, child.geometryInfo(), resolvedTreePath);
      } else if (child instanceof Shape) {
        pushShape(child, label, groupName, undefined, undefined, resolvedTreePath);
      } else if (child instanceof Sketch) {
        pushSketch(child, label, groupName, resolvedTreePath);
      }
    };

    /** Process a named object item (from array return format), optionally within a parent group */
    const processNamedItem = (
      item: any,
      fallbackLabel: string,
      fallbackSegment: string,
      parentGroup?: string,
      parentTreePath: string[] = [],
    ) => {
      const name = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : fallbackLabel;
      const localSegment = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : fallbackSegment;
      const treePath = [...parentTreePath, localSegment];
      const grp = parentGroup;

      // Handle { name, group: ShapeGroup } — pre-built group passed directly
      if (item.group instanceof ShapeGroup) {
        item.group.children.forEach((child: any, i: number) => {
          flattenGroupChild(
            child,
            groupChildLabel(item.group, name, i),
            name,
            [...treePath, shapeGroupChildSegment(item.group, i)],
          );
        });
        return;
      }

      // Handle { name, group: [...] } — nested assembly group
      if (Array.isArray(item.group)) {
        item.group.forEach((child: any, i: number) => {
          const childLabel = `${name}.${i + 1}`;
          const childTreePath = [...treePath, `${i + 1}`];
          if (child instanceof ShapeGroup) {
            child.children.forEach((nested: any, nestedIndex: number) => {
              flattenGroupChild(
                nested,
                groupChildLabel(child, name, nestedIndex),
                name,
                [...treePath, shapeGroupChildSegment(child, nestedIndex)],
              );
            });
          } else if (child instanceof TrackedShape) {
            pushShape(child.toShape(), childLabel, name, undefined, child.geometryInfo(), childTreePath);
          } else if (child instanceof Shape) {
            pushShape(child, childLabel, name, undefined, undefined, childTreePath);
          } else if (child instanceof Sketch) {
            pushSketch(child, childLabel, name, childTreePath);
          } else if (isNamedObject(child)) {
            processNamedItem(child, childLabel, `${i + 1}`, name, treePath);
          }
        });
        return;
      }

      if (item.shape instanceof ShapeGroup) {
        item.shape.children.forEach((child: any, i: number) => (
          flattenGroupChild(
            child,
            groupChildLabel(item.shape, name, i),
            name,
            [...treePath, shapeGroupChildSegment(item.shape, i)],
          )
        ));
        return;
      }
      if (item.shape instanceof TrackedShape) {
        pushShape(item.shape.toShape(), name, grp, item.color, item.shape.geometryInfo(), treePath);
        return;
      }
      if (item.shape instanceof Shape) {
        pushShape(item.shape, name, grp, item.color, undefined, treePath);
        return;
      }
      if (item.sketch instanceof Sketch) {
        const meta = item.sketch instanceof ConstraintSketch ? item.sketch.constraintMeta : undefined;
        objects.push({
          id: `obj-${objects.length + 1}`,
          name,
          shape: null,
          sketch: item.sketch,
          geometryInfo: null,
          sketchMeta: meta,
          color: item.color || item.sketch.colorHex,
          groupName: grp,
          treePath,
        });
        return;
      }
    };

    if (result instanceof ShapeGroup) {
      result.children.forEach((child, i) => {
        const label = rootGroupChildLabel(result, i);
        flattenGroupChild(child, label, undefined, [label]);
      });
    } else if (Array.isArray(result)) {
      result.forEach((item, index) => {
        const label = `Object ${index + 1}`;
        if (item instanceof ShapeGroup) {
          item.children.forEach((child, i) => {
            flattenGroupChild(
              child,
              groupChildLabel(item, label, i),
              undefined,
              [label, shapeGroupChildSegment(item, i)],
            );
          });
          return;
        }
        if (item instanceof TrackedShape) {
          pushShape(item.toShape(), label, undefined, undefined, item.geometryInfo(), [label]);
          return;
        }
        if (item instanceof Shape) {
          pushShape(item, label, undefined, undefined, undefined, [label]);
          return;
        }
        if (item instanceof Sketch) {
          pushSketch(item, label, undefined, [label]);
          return;
        }
        if (isNamedObject(item)) {
          processNamedItem(item, label, label);
          return;
        }
        throw new Error('Array results must contain Shape/Sketch items');
      });
    } else if (result instanceof TrackedShape) {
      pushShape(result.toShape(), fileName, undefined, undefined, result.geometryInfo(), [fileName]);
    } else if (result instanceof Shape) {
      pushShape(result, fileName, undefined, undefined, undefined, [fileName]);
    } else if (result instanceof Sketch) {
      pushSketch(result, fileName, undefined, [fileName]);
    }

    const shape = objects.length === 1 ? objects[0].shape : null;
    const sketch = objects.length === 1 ? objects[0].sketch : null;

      return {
        shape,
        sketch,
        objects,
        params: getCollectedParams(),
        dimensions: [...getCollectedDimensions(), ...shapeDimensions],
        bom: getCollectedBom(),
        cutPlanes: getCollectedCutPlanes(),
        explodeView: getCollectedExplodeView(),
        jointsView: getCollectedJointsView(),
        viewConfig: getCollectedViewConfig(),
        robotExport: getCollectedRobotExport(),
        quality,
        error: objects.length > 0 || options.allowEmptyResult ? null : 'Script must return a Shape or Sketch',
        timeMs: performance.now() - t0,
        logs: _collectedLogs.slice(),
        verifications: getCollectedVerifications(),
      };
    });
  } catch (e: any) {
    const msg = e.message || String(e);
    const stack = e.stack || '';
    let lineInfo = '';
    const location = resolveErrorLocation(stack, execOptions.compiledFiles);
    if (location) {
      lineInfo = location.fileName === fileName
        ? ` (line ${location.line})`
        : ` (${location.fileName}:${location.line}:${location.column})`;
    }
    _collectedLogs.push({ level: 'error', args: [`${msg}${lineInfo}`, ...(stack ? [stack] : [])], timestamp: Date.now() });
    return {
      shape: null,
      sketch: null,
      objects: [],
      params: getCollectedParams(),
      dimensions: getCollectedDimensions(),
      bom: getCollectedBom(),
      cutPlanes: getCollectedCutPlanes(),
      explodeView: getCollectedExplodeView(),
      jointsView: getCollectedJointsView(),
      viewConfig: getCollectedViewConfig(),
      robotExport: getCollectedRobotExport(),
      quality,
      error: `${msg}${lineInfo}`,
      timeMs: performance.now() - t0,
      logs: _collectedLogs.slice(),
      verifications: getCollectedVerifications(),
    };
  }
}

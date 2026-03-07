/**
 * ForgeCAD Script Runner
 *
 * Takes user code, wraps it so that forge API is available,
 * executes it in a Function() sandbox, and returns the resulting Shape.
 *
 * Supports cross-file imports via importSketch() and importPart().
 */

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
import { intersectWithPlane, projectToPlane } from './section';
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
  filletEdge,
  chamferEdge,
  arcBridgeBetweenRects,
  Curve3D,
  spline2d,
  spline3d,
  loft,
  sweep,
  sketchFromSvg,
  dim,
  dimLine,
  resetDimensions,
  getCollectedDimensions,
  takeCollectedDimensions,
  type DimensionDef,
  type SvgImportOptions,
} from './sketch';
import { param, resetParams, getCollectedParams, runWithParamScope, setParamOverrides, type ParamDef } from './params';
import { joint } from './joint';
import { Assembly, SolvedAssembly, assembly, bomToCsv } from './assembly';
import { Transform, composeChain } from './transform';
import { partLibrary } from './library';
import { ShapeGroup, group } from './group';
import { cutPlane, resetCutPlanes, getCollectedCutPlanes, type CutPlaneDef } from './cutPlane';
import { bom, resetBom, getCollectedBom, type BomDef } from './bom';
import { robotExport, resetRobotExport } from './robotExport';
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
import {
  resolveForgeQualityPreset,
  runWithForgeQuality,
  type ForgeQualityPreset,
} from './quality';

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
  quality: ForgeQualityPreset;
  error: string | null;
  timeMs: number;
  logs: LogEntry[];
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
}

const LOG_MAX_DEPTH = 4;
const LOG_MAX_ARRAY_ITEMS = 24;
const LOG_MAX_OBJECT_KEYS = 32;
const LOG_NUMBER_PRECISION = 4;

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
  importKind: 'importSketch' | 'importPart',
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
): Shape | Sketch | TrackedShape | ShapeGroup | null {
  if (visited.has(fileName)) {
    throw new Error(`Circular import detected: ${fileName}`);
  }
  visited.add(fileName);
  try {
    let importCallCount = 0;
    const makeChildScopePrefix = (name: string) => {
      importCallCount += 1;
      const local = `${name}#${importCallCount}`;
      return scope.namePrefix ? `${scope.namePrefix} > ${local}` : local;
    };

    const resolveImportSource = (requestedName: string) => {
      if (typeof requestedName !== 'string' || requestedName.trim().length === 0) {
        throw new Error('Import path must be a non-empty string');
      }
      const resolvedPath = resolveImportPath(fileName, requestedName);
      const lookupKey = options.fileIndex.get(resolvedPath);
      if (!lookupKey) {
        const suffix = resolvedPath && resolvedPath !== requestedName
          ? ` (resolved to "${resolvedPath}" from "${fileName}")`
          : ` (from "${fileName}")`;
        throw new Error(`File not found: "${requestedName}"${suffix}`);
      }
      const source = allFiles[lookupKey];
      if (typeof source !== 'string') {
        throw new Error(`File not found: "${requestedName}" (resolved to "${resolvedPath}")`);
      }
      return { source, lookupKey, resolvedPath };
    };

    const logImportTrace = (
      kind: 'importSketch' | 'importPart' | 'importSvgSketch',
      target: string,
      phase: 'start' | 'success' | 'error',
      details: Record<string, unknown> = {},
    ) => {
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
    };

    // importSketch("name", { ...paramOverrides }) — executes another file, expects a Sketch result
    const isSvgImportPath = (path: string): boolean => path.toLowerCase().endsWith('.svg');

    const importSketch = (name: string, paramOverrides?: Record<string, number> | SvgImportOptions): Sketch => {
      const { source: src, lookupKey, resolvedPath } = resolveImportSource(name);
      if (isSvgImportPath(resolvedPath)) {
        const svgOptions = parseSvgImportArgs('importSketch', name, paramOverrides);
        logImportTrace('importSketch', resolvedPath, 'start', {
          requested: name,
          mode: 'svg',
          options: svgOptions,
        });
        try {
          const result = sketchFromSvg(src, svgOptions);
          logImportTrace('importSketch', resolvedPath, 'success', {
            requested: name,
            mode: 'svg',
            got: 'Sketch',
            area: Number(result.area().toFixed(4)),
            verts: result.numVert(),
          });
          return result;
        } catch (error) {
          logImportTrace('importSketch', resolvedPath, 'error', {
            requested: name,
            mode: 'svg',
            error: formatLogError(error),
          });
          throw error;
        }
      }

      const localOverrides = parseImportParamArgs('importSketch', name, paramOverrides);
      const childScope = { namePrefix: makeChildScopePrefix(resolvedPath), localOverrides };
      logImportTrace('importSketch', resolvedPath, 'start', { requested: name, overrides: localOverrides });
      let result: ReturnType<typeof executeFile>;
      try {
        result = executeFile(src, lookupKey, allFiles, visited, childScope, options);
      } catch (error) {
        logImportTrace('importSketch', resolvedPath, 'error', { requested: name, error: formatLogError(error) });
        throw error;
      }
      if (result instanceof Sketch) {
        logImportTrace('importSketch', resolvedPath, 'success', { requested: name, got: 'Sketch' });
        return result;
      }
      const got = describeScriptResultType(result);
      logImportTrace('importSketch', resolvedPath, 'error', { requested: name, got });
      throw new Error(`"${resolvedPath}" did not return a Sketch (got ${got})`);
    };

    // importSvgSketch("name.svg", options?) — parses an SVG into Sketch geometry
    const importSvgSketch = (name: string, optionsArg?: SvgImportOptions): Sketch => {
      const { source: src, resolvedPath } = resolveImportSource(name);
      if (!isSvgImportPath(resolvedPath)) {
        throw new Error(`importSvgSketch("${name}") requires an .svg file (resolved to "${resolvedPath}")`);
      }
      const svgOptions = parseSvgImportArgs('importSvgSketch', name, optionsArg);
      logImportTrace('importSvgSketch', resolvedPath, 'start', { requested: name, options: svgOptions });
      try {
        const result = sketchFromSvg(src, svgOptions);
        logImportTrace('importSvgSketch', resolvedPath, 'success', {
          requested: name,
          got: 'Sketch',
          area: Number(result.area().toFixed(4)),
          verts: result.numVert(),
        });
        return result;
      } catch (error) {
        logImportTrace('importSvgSketch', resolvedPath, 'error', {
          requested: name,
          error: formatLogError(error),
        });
        throw error;
      }
    };

    // importPart("name", { ...paramOverrides }) — executes another file, expects a Shape result
    const importPart = (name: string, paramOverrides?: Record<string, number>): Shape => {
      const { source: src, lookupKey, resolvedPath } = resolveImportSource(name);
      const localOverrides = parseImportParamArgs('importPart', name, paramOverrides);
      const childScope = { namePrefix: makeChildScopePrefix(resolvedPath), localOverrides };
      const dimStart = getCollectedDimensions().length;
      logImportTrace('importPart', resolvedPath, 'start', { requested: name, overrides: localOverrides });
      let result: ReturnType<typeof executeFile>;
      try {
        result = executeFile(src, lookupKey, allFiles, visited, childScope, options);
      } catch (error) {
        logImportTrace('importPart', resolvedPath, 'error', { requested: name, error: formatLogError(error) });
        throw error;
      }
      const importedDims = takeCollectedDimensions(dimStart);
      if (result instanceof Shape) {
        logImportTrace('importPart', resolvedPath, 'success', { requested: name, got: 'Shape', importedDims: importedDims.length });
        return setShapeDimensions(result, importedDims as ShapeDimension[]);
      }
      if (result instanceof TrackedShape) {
        logImportTrace('importPart', resolvedPath, 'success', {
          requested: name,
          got: 'TrackedShape',
          importedDims: importedDims.length,
          unwrapped: true,
        });
        return setShapeDimensions(result.toShape(), importedDims as ShapeDimension[]);
      }
      const got = describeScriptResultType(result);
      logImportTrace('importPart', resolvedPath, 'error', { requested: name, got });
      throw new Error(`"${resolvedPath}" did not return a Shape (got ${got})`);
    };

    const wrapped = `"use strict";\n${code}`;

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

    const fn = new Function(
      // 3D
      'box', 'cylinder', 'sphere',
      'union', 'difference', 'intersection',
      'hull3d', 'levelSet',
      // 2D
      'rect', 'circle2d', 'roundedRect', 'polygon', 'ngon', 'ellipse', 'slot', 'star', 'path', 'stroke', 'constrainedSketch',
      'union2d', 'difference2d', 'intersection2d', 'hull2d',
      // Entities
      'Point2D', 'Line2D', 'Circle2D', 'Rectangle2D', 'TrackedShape', 'point', 'line', 'circle', 'rectangle', 'Constraint', 'degrees', 'radians',
      // Patterns
      'linearPattern', 'circularPattern', 'mirrorCopy',
      // Fillets
      'filletEdge', 'chamferEdge',
      // Arc bridge
      'arcBridgeBetweenRects',
      // Curves & surfacing
      'Curve3D', 'spline2d', 'spline3d', 'loft', 'sweep',
      // Params & classes
      'param', 'Shape', 'Sketch', 'lib',
      // Joints
      'joint',
      // Transform + Assembly
      'Transform', 'composeChain', 'assembly', 'Assembly', 'SolvedAssembly', 'bomToCsv',
      // Plane ops
      'intersectWithPlane', 'projectToPlane',
      // Cross-file imports
      'importSketch', 'importPart', 'importSvgSketch',
      // Dimensions
      'dim', 'dimLine',
      // Bill of materials
      'bom',
      // Robot export declarations
      'robotExport',
      // Group
      'group', 'ShapeGroup',
      // Console
      'console',
      // Cut planes
      'cutPlane',
      // View explode override
      'explodeView',
      // Runtime joints (viewport-only)
      'jointsView',
      // Viewport helper visuals
      'viewConfig',
      wrapped,
    );

    return runWithParamScope(scope, () => fn(
      trackedBox, trackedCylinder, sphere,
      wrappedUnion, wrappedDifference, wrappedIntersection,
      wrappedHull3d, levelSet,
      rect, circle2d, roundedRect, polygon, ngon, ellipse, slot, star, path, stroke, constrainedSketch,
      union2d, difference2d, intersection2d, hull2d,
      Point2D, Line2D, Circle2D, Rectangle2D, TrackedShape, point, line, circle, rectangle, Constraint, degrees, radians,
      linearPattern, circularPattern, mirrorCopy,
      filletEdge, chamferEdge,
      arcBridgeBetweenRects,
      Curve3D, spline2d, spline3d, loft, sweep,
      param, Shape, Sketch, partLibrary,
      joint,
      Transform, composeChain, assembly, Assembly, SolvedAssembly, bomToCsv,
      intersectWithPlane, projectToPlane,
      importSketch, importPart, importSvgSketch,
      dim, dimLine,
      bom,
      robotExport,
      group, ShapeGroup,
      makeSandboxConsole(),
      cutPlane,
      explodeView,
      jointsView,
      viewConfig,
    ));
  } finally {
    visited.delete(fileName);
  }
}

export function runScript(
  code: string,
  fileName = 'main.forge.js',
  allFiles: Record<string, string> = {},
  options: RunScriptOptions = {},
): RunResult {
  resetParams();
  resetDimensions();
  resetBom();
  resetRobotExport();
  resetCutPlanes();
  resetExplodeView();
  resetJointsView();
  resetViewConfig();
  _collectedLogs = [];
  const t0 = performance.now();
  const execOptions: RunnerExecutionOptions = {
    debugImports: options.debugImports ?? envFlagEnabled('FORGECAD_DEBUG_IMPORTS'),
    fileIndex: buildFileIndex(allFiles),
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
    const pushSketch = (sketch: Sketch, name: string, groupName?: string) => {
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
      });
    };

    const isNamedObject = (item: unknown): item is { name: string; shape?: Shape; sketch?: Sketch; color?: string; group?: unknown[] } => {
      return !!item && typeof item === 'object' && 'name' in item;
    };

    const flattenGroupChild = (child: Shape | Sketch | TrackedShape | ShapeGroup, label: string, groupName?: string) => {
      if (child instanceof ShapeGroup) {
        child.children.forEach((nested, i) => {
          flattenGroupChild(nested, `${label}.${i + 1}`, groupName);
        });
        return;
      }
      if (child instanceof TrackedShape) {
        pushShape(child.toShape(), label, groupName, undefined, child.geometryInfo());
      } else if (child instanceof Shape) {
        pushShape(child, label, groupName);
      } else if (child instanceof Sketch) {
        pushSketch(child, label, groupName);
      }
    };

    /** Process a named object item (from array return format), optionally within a parent group */
    const processNamedItem = (item: any, fallbackLabel: string, parentGroup?: string) => {
      const name = typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : fallbackLabel;
      const grp = parentGroup;

      // Handle { name, group: [...] } — nested assembly group
      if (Array.isArray(item.group)) {
        item.group.forEach((child: any, i: number) => {
          const childLabel = `${name}.${i + 1}`;
          if (child instanceof ShapeGroup) {
            flattenGroupChild(child, childLabel, name);
          } else if (child instanceof TrackedShape) {
            pushShape(child.toShape(), childLabel, name, undefined, child.geometryInfo());
          } else if (child instanceof Shape) {
            pushShape(child, childLabel, name);
          } else if (child instanceof Sketch) {
            pushSketch(child, childLabel, name);
          } else if (isNamedObject(child)) {
            processNamedItem(child, childLabel, name);
          }
        });
        return;
      }

      if (item.shape instanceof ShapeGroup) {
        item.shape.children.forEach((child: any, i: number) => flattenGroupChild(child, `${name}.${i + 1}`, name));
        return;
      }
      if (item.shape instanceof TrackedShape) {
        pushShape(item.shape.toShape(), name, grp, item.color, item.shape.geometryInfo());
        return;
      }
      if (item.shape instanceof Shape) {
        pushShape(item.shape, name, grp, item.color);
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
        });
        return;
      }
    };

    if (result instanceof ShapeGroup) {
      result.children.forEach((child, i) => flattenGroupChild(child, `Object ${i + 1}`));
    } else if (Array.isArray(result)) {
      result.forEach((item, index) => {
        const label = `Object ${index + 1}`;
        if (item instanceof ShapeGroup) {
          item.children.forEach((child, i) => flattenGroupChild(child, `${label}.${i + 1}`));
          return;
        }
        if (item instanceof TrackedShape) {
          pushShape(item.toShape(), label, undefined, undefined, item.geometryInfo());
          return;
        }
        if (item instanceof Shape) {
          pushShape(item, label);
          return;
        }
        if (item instanceof Sketch) {
          pushSketch(item, label);
          return;
        }
        if (isNamedObject(item)) {
          processNamedItem(item, label);
          return;
        }
        throw new Error('Array results must contain Shape/Sketch items');
      });
    } else if (result instanceof TrackedShape) {
      pushShape(result.toShape(), fileName, undefined, undefined, result.geometryInfo());
    } else if (result instanceof Shape) {
      pushShape(result, fileName);
    } else if (result instanceof Sketch) {
      pushSketch(result, fileName);
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
        quality,
        error: objects.length > 0 || options.allowEmptyResult ? null : 'Script must return a Shape or Sketch',
        timeMs: performance.now() - t0,
        logs: _collectedLogs.slice(),
      };
    });
  } catch (e: any) {
    const msg = e.message || String(e);
    const stack = e.stack || '';
    // Extract script line number from stack: "<anonymous>:LINE:COL" — offset by 2 (Function wrapper + "use strict")
    let lineInfo = '';
    const m = stack.match(/<anonymous>:(\d+):(\d+)/);
    if (m) {
      const scriptLine = Math.max(1, parseInt(m[1], 10) - 2);
      lineInfo = ` (line ${scriptLine})`;
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
      quality,
      error: `${msg}${lineInfo}`,
      timeMs: performance.now() - t0,
      logs: _collectedLogs.slice(),
    };
  }
}

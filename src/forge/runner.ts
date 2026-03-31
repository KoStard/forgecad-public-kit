/**
 * ForgeCAD Script Runner
 *
 * Takes user code, wraps it so that forge API is available,
 * executes it in a Function() sandbox, and returns the resulting Shape.
 *
 * Supports cross-file imports via require().
 */

import './holeCut';
import { Assembly, assembly, bomToCsv, ImportedAssembly, SolvedAssembly } from './assembly/assembly';
import { port } from './port';
import { type BomDef, bom, getCollectedBom, resetBom } from './bom';
import type { ShapeCompilePlan } from './compilePlan';
import { appendShapeCompileTransform, createOwnedShapeCompilePlan, resetShapeQueryOwnerIds } from './compilePlan';
import { type CutPlaneDef, cutPlane, getCollectedCutPlanes, resetCutPlanes } from './cutPlane';
import { coalesceEdges, selectEdge, selectEdges } from './query/edgeQuery';
import { chamferEdgeSegment, filletEdgeSegment } from './edge-features/edgeSegmentFeatures';
import { type ExplodeViewOptions, explodeView, getCollectedExplodeView, resetExplodeView } from './assembly/explodeView';
import { chamfer, draft, fillet, offsetSolid } from './fillet';
import type { ToolpathData } from './export/gcode';
import { GCodeBuilder, gcode } from './export/gcode';
import { group, ShapeGroup } from './group';
import { joint } from './assembly/joint';
import {
  type CollectedJointsView,
  getCollectedJointsView,
  jointsView,
  resetJointsView,
  restoreJointsView,
  saveJointsView,
} from './assembly/jointsView';
import {
  box,
  buildShapeFromCompilePlan,
  cylinder,
  difference,
  type GeometryInfo,
  getShapeDimensions,
  intersection,
  sdf,
  Shape,
  type ShapeDimension,
  setShapeDimensions,
  sphere,
  torus,
  union,
} from './kernel';
import { partLibrary } from './library';
import { detectMeshFormat } from './mesh/meshParsers';
import {
  boolParam,
  createTrackedScope,
  getCollectedParams,
  type ParamDef,
  param,
  resetParams,
  runWithParamScope,
  setParamOverrides,
  validateConsumedOverrides,
} from './params';
import { type ForgeQualityPreset, resolveForgeQualityPreset, runWithForgeQuality } from './quality';
import { type CollectedRobotExport, getCollectedRobotExport, resetRobotExport, robotExport } from './export/robotExport';
import { getCollectedScene, resetScene, type SceneConfig, scene } from './scene';
import { faceProfile, intersectWithPlane, projectToPlane } from './section';
import './faceOps';
import { SheetMetalPart, sheetMetal } from './sheetMetal';
import { getCollectedSheetStock, resetSheetStock, type SheetStockDef, sheetStock } from './export/sheetStock';
import {
  arcBridgeBetweenRects,
  arcSlot,
  buildCircleExtrusionTopology,
  buildRectExtrusionTopology,
  Circle2D,
  Constraint,
  ConstraintSketch,
  Curve3D,
  chamferEdge,
  circle,
  circle2d,
  circularLayout,
  circularPattern,
  circularPattern2d,
  connectEdges,
  constrainedSketch,
  type DebugHighlight3D,
  type DimensionDef,
  degrees,
  difference2d,
  HermiteCurve3D,
  hermiteTransition,
  hermiteTransitionG2,
  pickEdge,
  pickEdgeSegment,
  QuinticHermiteCurve3D,
  transitionCurve,
  transitionCurveFromPoints,
  transitionSurface,
  dim,
  dimLine,
  ellipse,
  filletCorners,
  filletEdge,
  getCollectedDebugHighlights3D,
  getCollectedDimensions,
  getCollectedHighlights,
  getPendingShapeHighlights,
  type HighlightDef,
  highlight,
  intersection2d,
  Line2D,
  line,
  linearPattern,
  linearPattern2d,
  loadFont,
  loft,
  mirrorCopy,
  ngon,
  Point2D,
  path,
  point,
  polar,
  polygon,
  polygonVertices,
  Rectangle2D,
  radians,
  rect,
  rectangle,
  routePerimeter,
  routeStepFactories,
  resetDimensions,
  resetHighlights,
  resetPendingShapeHighlights,
  roundedRect,
  Sketch,
  type SketchConstraintMeta,
  type SvgImportOptions,
  sketchFromSvg,
  sketchToDxf,
  sketchToSvg,
  slot,
  spline2d,
  spline3d,
  star,
  stroke,
  sweep,
  TrackedShape,
  takeCollectedDimensions,
  variableSweep,
  loftAlongSpine,
  surfacePatch,
  text2d,
  textWidth,
  union2d,
} from './sketch';
import type { SolverWasmRunDebugSnapshot } from './sketch/constraints/solver-wasm';
import { composeChain, Transform } from './transform';
import { getCollectedVerifications, resetVerifications, spec, type VerificationResult, verify } from './verification';
import { getCollectedViewConfig, resetViewConfig, type ViewConfig, viewConfig } from './scene/viewConfig';

// Sub-module imports
import {
  type SceneObject,
  type LogEntry,
  type RunResult,
  type MeshImportOptions,
  type RunScriptOptions,
  type ImportScope,
  type CompiledScript,
  type ModuleCacheEntry,
  type ResolvedImportSource,
  type RunnerExecutionOptions,
} from './runner/types';
import { formatLogArg, formatLogError, logImportTrace, makeSandboxConsole } from './runner/logging';
import {
  buildFileIndex,
  dirnamePath,
  envFlagEnabled,
  isSvgImportPath,
  makeModuleCacheKey,
  parseImportParamArgs,
  parseSvgImportArgs,
  resolveImportPath,
  resolveImportSource,
} from './runner/pathUtils';
import { compileScript, createForgeRuntimeModule, resolveErrorLocation } from './runner/compiler';

// Re-export public types
export type { SceneObject, LogEntry, RunResult, MeshImportOptions, RunScriptOptions };

const FORGE_RUNTIME_MODULE_SPECIFIERS = new Set(['forgecad', '@forge/runtime', '@forgecad/runtime']);

// Collected logs from the current script execution
let _collectedLogs: LogEntry[] = [];

function describeScriptResultType(value: unknown): string {
  if (value == null) return String(value);
  if (value instanceof Shape) return 'Shape';
  if (value instanceof Sketch) return 'Sketch';
  if (value instanceof TrackedShape) return 'TrackedShape';
  if (value instanceof ShapeGroup) return 'ShapeGroup';
  if (value instanceof GCodeBuilder) return 'GCodeBuilder';
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

function isRenderableEntryResult(value: unknown): boolean {
  return (
    value instanceof Shape ||
    value instanceof Sketch ||
    value instanceof TrackedShape ||
    value instanceof ShapeGroup ||
    value instanceof GCodeBuilder ||
    value instanceof Assembly ||
    value instanceof SolvedAssembly ||
    Array.isArray(value)
  );
}

function resolveExportedEntryResult(exportsValue: unknown): unknown {
  if (isRenderableEntryResult(exportsValue)) return exportsValue;
  if (
    exportsValue &&
    typeof exportsValue === 'object' &&
    'default' in (exportsValue as Record<string, unknown>) &&
    isRenderableEntryResult((exportsValue as Record<string, unknown>).default)
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

/**
 * Post-process the result of requiring a `.forge.js` child file:
 * - Unwrap TrackedShape → Shape (topology is coordinate-system-relative and must not leak
 *   into the parent; the shape's placement refs are already stored on the Shape layer).
 * - Attach any `dim()` calls collected from the child onto the shape so subsequent
 *   transforms (translate, rotate, …) propagate them correctly.
 */
function finalizeForgeJsImport(moduleExports: unknown, importedDims: DimensionDef[]): unknown {
  // Unwrap TrackedShape to plain Shape — matches require() import behaviour and ensures
  // that placement refs live on the Shape layer, not the TrackedShape topology layer.
  const base = moduleExports instanceof TrackedShape ? moduleExports.toShape() : moduleExports;
  if (!(base instanceof Shape)) return moduleExports;
  if (importedDims.length === 0) return base;
  return setShapeDimensions(base, [...getShapeDimensions(base), ...importedDims] as ShapeDimension[]);
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

    // importSvgSketch("name.svg", options?) — parses an SVG into Sketch geometry
    const importSvgSketch = (name: string, optionsArg?: SvgImportOptions): Sketch => {
      const { source: src, resolvedPath } = resolveImportSource(fileName, name, allFiles, options);
      if (!isSvgImportPath(resolvedPath)) {
        throw new Error(`importSvgSketch("${name}") requires an .svg file (resolved to "${resolvedPath}")`);
      }
      const svgOptions = parseSvgImportArgs('importSvgSketch', name, optionsArg);
      logImportTrace(_collectedLogs, fileName, scope, options, 'importSvgSketch', resolvedPath, 'start', {
        requested: name,
        options: svgOptions,
      });
      try {
        const result = sketchFromSvg(src, svgOptions);
        logImportTrace(_collectedLogs, fileName, scope, options, 'importSvgSketch', resolvedPath, 'success', {
          requested: name,
          got: 'Sketch',
          area: Number(result.area().toFixed(4)),
          verts: result.numVert(),
        });
        return result;
      } catch (error) {
        logImportTrace(_collectedLogs, fileName, scope, options, 'importSvgSketch', resolvedPath, 'error', {
          requested: name,
          error: formatLogError(error),
        });
        throw error;
      }
    };

    // importMesh("name.stl", options?) — imports a mesh file as a Shape
    const importMesh = (name: string, meshOptions?: MeshImportOptions): Shape => {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('importMesh() requires a non-empty file path string');
      }
      const resolvedPath = resolveImportPath(fileName, name.trim());
      const format = detectMeshFormat(resolvedPath);
      if (!format) {
        const ext = resolvedPath.split('.').pop() ?? '';
        throw new Error(`importMesh("${name}"): unsupported format ".${ext}". Supported: .stl, .obj, .3mf`);
      }
      if (!options.readBinaryFile) {
        throw new Error(
          `importMesh("${name}"): binary file reading is not available in this environment. ` +
            'Provide a readBinaryFile callback in RunScriptOptions.',
        );
      }
      const fileData = options.readBinaryFile(resolvedPath);

      let plan: ShapeCompilePlan = {
        kind: 'importedMesh',
        filePath: resolvedPath,
        format,
        fileData,
      };

      // Apply scale as a transform node
      if (meshOptions?.scale != null && meshOptions.scale !== 1) {
        const s = meshOptions.scale;
        if (!Number.isFinite(s) || s <= 0) {
          throw new Error(`importMesh("${name}"): scale must be a positive finite number, got ${s}`);
        }
        plan = appendShapeCompileTransform(plan, { kind: 'scale', x: s, y: s, z: s })!;
      }

      return buildShapeFromCompilePlan(createOwnedShapeCompilePlan(plan, 'importedMesh')!, undefined, {
        fidelity: 'sampled',
        sources: ['imported'],
      });
    };

    // Wrappers that auto-unwrap TrackedShape for boolean ops
    const unwrap = (s: Shape | TrackedShape): Shape => (s instanceof TrackedShape ? s.toShape() : s);
    const wrappedUnion = (...shapes: (Shape | TrackedShape)[]) => union(...shapes.map(unwrap));
    const wrappedDifference = (...shapes: (Shape | TrackedShape)[]) => difference(...shapes.map(unwrap));
    const wrappedIntersection = (...shapes: (Shape | TrackedShape)[]) => intersection(...shapes.map(unwrap));

    // Tracked wrappers for primitives — user scripts get TrackedShape with named faces/edges
    const trackedBox = (x: number, y: number, z: number, center = false): TrackedShape => {
      const shape = box(x, y, z, center);
      const ox = center ? -x / 2 : 0;
      const oy = center ? -y / 2 : 0;
      const r = Rectangle2D.fromDimensions(ox, oy, x, y);
      const topo = buildRectExtrusionTopology(r, z, true, center ? -z / 2 : 0);
      return new TrackedShape(shape, topo, 0, true);
    };

    const trackedCylinder = (height: number, radius: number, radiusTop?: number, segments?: number, center = false): TrackedShape => {
      const shape = cylinder(height, radius, radiusTop, segments, center);
      const c = { center: new Point2D(0, 0), radius, radiusTop };
      const topo = buildCircleExtrusionTopology(c, height, center);
      return new TrackedShape(shape, topo, 0, true);
    };

    const sandboxConsole = makeSandboxConsole(_collectedLogs);
    const runtimeBindings: Record<string, unknown> = {
      box: trackedBox,
      cylinder: trackedCylinder,
      sphere,
      torus,
      union: wrappedUnion,
      difference: wrappedDifference,
      intersection: wrappedIntersection,
      rect,
      arcSlot,
      circle2d,
      roundedRect,
      polygon,
      polygonVertices,
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
      polar,
      radians,
      routePerimeter,
      route: routeStepFactories,
      linearPattern,
      circularPattern,
      circularLayout,
      linearPattern2d,
      circularPattern2d,
      mirrorCopy,
      filletCorners,
      filletEdge,
      chamferEdge,
      arcBridgeBetweenRects,
      Curve3D,
      spline2d,
      spline3d,
      loft,
      loftAlongSpine,
      sweep,
      HermiteCurve3D,
      QuinticHermiteCurve3D,
      hermiteTransition,
      hermiteTransitionG2,
      transitionCurve,
      transitionSurface,
      transitionCurveFromPoints,
      pickEdge,
      pickEdgeSegment,
      connectEdges,
      variableSweep,
      surfacePatch,
      sheetMetal,
      SheetMetalPart,
      param,
      boolParam,
      sdf,
      Shape,
      Sketch,
      lib: partLibrary,
      joint,
      Transform,
      composeChain,
      assembly,
      Assembly,
      port,
      SolvedAssembly,
      bomToCsv,
      faceProfile,
      intersectWithPlane,
      projectToPlane,
      selectEdge,
      selectEdges,
      coalesceEdges,
      filletEdgeSegment,
      chamferEdgeSegment,
      fillet,
      chamfer,
      draft,
      offsetSolid,
      importSvgSketch,
      importMesh,
      text2d,
      textWidth,
      loadFont,
      dim,
      dimLine,
      highlight,
      sketchToSvg,
      sketchToDxf,
      bom,
      sheetStock,
      robotExport,
      group,
      ShapeGroup,
      console: sandboxConsole,
      cutPlane,
      explodeView,
      jointsView,
      viewConfig,
      scene,
      verify,
      spec,
      gcode,
      GCodeBuilder,
    };

    const requireModule = (requestedName: string, paramOverrides?: Record<string, number>): unknown => {
      if (typeof requestedName !== 'string' || requestedName.trim().length === 0) {
        throw new Error('Module specifier must be a non-empty string');
      }
      const normalizedRequested = requestedName.trim();

      if (FORGE_RUNTIME_MODULE_SPECIFIERS.has(normalizedRequested)) {
        logImportTrace(_collectedLogs, fileName, scope, options, 'require', normalizedRequested, 'start', {
          requested: normalizedRequested,
          virtual: true,
        });
        const runtimeModule = createForgeRuntimeModule(runtimeBindings);
        logImportTrace(_collectedLogs, fileName, scope, options, 'require', normalizedRequested, 'success', {
          requested: normalizedRequested,
          virtual: true,
          got: 'ForgeRuntimeModule',
        });
        return runtimeModule;
      }

      const { source: src, lookupKey, resolvedPath } = resolveImportSource(fileName, normalizedRequested, allFiles, options);
      if (isSvgImportPath(resolvedPath)) {
        throw new Error(
          `JS import "${normalizedRequested}" resolved to "${resolvedPath}", which is an SVG asset. ` + 'Use importSvgSketch() instead.',
        );
      }
      if (resolvedPath.endsWith('.forge-notebook.json')) {
        throw new Error(
          `JS import "${normalizedRequested}" resolved to "${resolvedPath}", which is a notebook file. ` +
            'Export the notebook to .forge.js first.',
        );
      }

      const hasOverrides = paramOverrides != null && typeof paramOverrides === 'object' && Object.keys(paramOverrides).length > 0;

      if (hasOverrides) {
        const localOverrides = parseImportParamArgs('require', normalizedRequested, paramOverrides);
        const childScope = createTrackedScope(makeChildScopePrefix(resolvedPath), localOverrides);
        const dimStart = getCollectedDimensions().length;
        logImportTrace(_collectedLogs, fileName, scope, options, 'require', resolvedPath, 'start', {
          requested: normalizedRequested,
          overrides: localOverrides,
        });
        const cacheKey = makeModuleCacheKey(lookupKey, childScope);
        const cached = options.moduleCache.get(cacheKey);
        if (cached) {
          logImportTrace(_collectedLogs, fileName, scope, options, 'require', resolvedPath, 'success', {
            requested: normalizedRequested,
            got: describeScriptResultType(cached.exports),
            cached: true,
          });
          return cached.exports;
        }
        const nextModuleEntry: ModuleCacheEntry = { exports: {}, loaded: false };
        options.moduleCache.set(cacheKey, nextModuleEntry);
        const savedJointsView = saveJointsView();
        try {
          const moduleExports = executeFile(src, lookupKey, allFiles, visited, childScope, options, 'module', nextModuleEntry);
          nextModuleEntry.exports = moduleExports;
          nextModuleEntry.loaded = true;
          validateConsumedOverrides(childScope, 'require', resolvedPath);
          const importedDims = takeCollectedDimensions(dimStart);
          const finalExports = finalizeForgeJsImport(moduleExports, importedDims);
          nextModuleEntry.exports = finalExports;
          logImportTrace(_collectedLogs, fileName, scope, options, 'require', resolvedPath, 'success', {
            requested: normalizedRequested,
            got: describeScriptResultType(finalExports),
            importedDims: importedDims.length,
            cached: false,
          });
          return finalExports;
        } catch (error) {
          options.moduleCache.delete(cacheKey);
          logImportTrace(_collectedLogs, fileName, scope, options, 'require', resolvedPath, 'error', {
            requested: normalizedRequested,
            error: formatLogError(error),
          });
          throw error;
        } finally {
          restoreJointsView(savedJointsView);
        }
      }

      logImportTrace(_collectedLogs, fileName, scope, options, 'require', resolvedPath, 'start', { requested: normalizedRequested });

      const cacheKey = makeModuleCacheKey(lookupKey, scope);
      const cached = options.moduleCache.get(cacheKey);
      if (cached) {
        logImportTrace(_collectedLogs, fileName, scope, options, 'require', resolvedPath, 'success', {
          requested: normalizedRequested,
          got: describeScriptResultType(cached.exports),
          cached: true,
        });
        return cached.exports;
      }

      const dimStart = getCollectedDimensions().length;
      const nextModuleEntry: ModuleCacheEntry = { exports: {}, loaded: false };
      options.moduleCache.set(cacheKey, nextModuleEntry);
      try {
        const moduleExports = executeFile(src, lookupKey, allFiles, visited, scope, options, 'module', nextModuleEntry);
        nextModuleEntry.exports = moduleExports;
        nextModuleEntry.loaded = true;
        const importedDims = takeCollectedDimensions(dimStart);
        const finalExports = finalizeForgeJsImport(moduleExports, importedDims);
        nextModuleEntry.exports = finalExports;
        logImportTrace(_collectedLogs, fileName, scope, options, 'require', resolvedPath, 'success', {
          requested: normalizedRequested,
          got: describeScriptResultType(finalExports),
          importedDims: importedDims.length,
          cached: false,
        });
        return finalExports;
      } catch (error) {
        options.moduleCache.delete(cacheKey);
        logImportTrace(_collectedLogs, fileName, scope, options, 'require', resolvedPath, 'error', {
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
    const returnValue = runWithParamScope(scope, () =>
      fn(moduleValue.exports, moduleValue, requireModule, fileName, dirnamePath(fileName), ...bindingValues),
    );

    if (executionMode === 'module') {
      const hasExports = hasExplicitModuleExports(moduleValue.exports, initialExportsRef);
      if (returnValue !== undefined && hasExports) {
        const merged = { ...(moduleValue.exports as Record<string, unknown>), default: returnValue };
        // Mark as an ES module so that __importDefault (esModuleInterop) recognises it
        // and returns the value directly rather than double-wrapping it.
        Object.defineProperty(merged, '__esModule', { value: true });
        if (moduleCacheEntry) {
          moduleCacheEntry.exports = merged;
        }
        return merged;
      }
      if (returnValue !== undefined) {
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
  resetHighlights();
  resetBom();
  resetSheetStock();
  resetRobotExport();
  resetCutPlanes();
  resetExplodeView();
  resetJointsView();
  resetViewConfig();
  resetScene();
  resetVerifications();
  _collectedLogs = [];
  const t0 = performance.now();
  const execOptions: RunnerExecutionOptions = {
    debugImports: options.debugImports ?? envFlagEnabled('FORGECAD_DEBUG_IMPORTS'),
    fileIndex: buildFileIndex(allFiles),
    compiledFiles: new Map(),
    moduleCache: new Map(),
    readBinaryFile: options.readBinaryFile,
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
          materialProps: shape.materialProps,
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

      const isNamedObject = (
        item: unknown,
      ): item is { name: string; shape?: Shape; sketch?: Sketch; color?: string; group?: unknown[] } => {
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
            flattenGroupChild(nested, groupChildLabel(child, label, i), groupName, [...resolvedTreePath, shapeGroupChildSegment(child, i)]);
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
            flattenGroupChild(child, groupChildLabel(item.group, name, i), name, [...treePath, shapeGroupChildSegment(item.group, i)]);
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
                flattenGroupChild(nested, groupChildLabel(child, name, nestedIndex), name, [
                  ...treePath,
                  shapeGroupChildSegment(child, nestedIndex),
                ]);
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
          item.shape.children.forEach((child: any, i: number) =>
            flattenGroupChild(child, groupChildLabel(item.shape, name, i), name, [...treePath, shapeGroupChildSegment(item.shape, i)]),
          );
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

      // Assembly / SolvedAssembly: auto-solve and flatten into named scene objects.
      // Uses toSceneObjects() to preserve group names (groupName on SceneObject).
      const assemblySceneItems =
        result instanceof Assembly ? result.solve().toSceneObjects() : result instanceof SolvedAssembly ? result.toSceneObjects() : null;
      if (assemblySceneItems) {
        assemblySceneItems.forEach((item, index) => {
          const label = `Object ${index + 1}`;
          processNamedItem(item, label, label);
        });
      } else if (result instanceof ShapeGroup) {
        result.children.forEach((child, i) => {
          const label = rootGroupChildLabel(result, i);
          flattenGroupChild(child, label, undefined, [label]);
        });
      } else if (Array.isArray(result)) {
        result.forEach((item, index) => {
          const label = `Object ${index + 1}`;
          if (item instanceof ShapeGroup) {
            item.children.forEach((child, i) => {
              flattenGroupChild(child, groupChildLabel(item, label, i), undefined, [label, shapeGroupChildSegment(item, i)]);
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
      } else if (
        result !== null &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        !(result instanceof Shape) &&
        !(result instanceof Sketch) &&
        !(result instanceof TrackedShape) &&
        !(result instanceof ShapeGroup) &&
        !(result instanceof GCodeBuilder) &&
        !(result instanceof Assembly) &&
        !(result instanceof SolvedAssembly)
      ) {
        // Plain object return — check for default, then render all renderables
        const obj = result as Record<string, unknown>;
        const defaultValue = obj.default;
        if (defaultValue && isRenderableEntryResult(defaultValue)) {
          // Render the default as if it were the direct return
          if (defaultValue instanceof Assembly) {
            const items = defaultValue.solve().toSceneObjects();
            items.forEach((item, index) => {
              const label = `Object ${index + 1}`;
              processNamedItem(item, label, label);
            });
          } else if (defaultValue instanceof SolvedAssembly) {
            const items = defaultValue.toSceneObjects();
            items.forEach((item, index) => {
              const label = `Object ${index + 1}`;
              processNamedItem(item, label, label);
            });
          } else if (defaultValue instanceof ShapeGroup) {
            defaultValue.children.forEach((child, i) => {
              const label = rootGroupChildLabel(defaultValue, i);
              flattenGroupChild(child, label, undefined, [label]);
            });
          } else if (defaultValue instanceof TrackedShape) {
            pushShape(defaultValue.toShape(), fileName, undefined, undefined, defaultValue.geometryInfo(), [fileName]);
          } else if (defaultValue instanceof Shape) {
            pushShape(defaultValue, fileName, undefined, undefined, undefined, [fileName]);
          } else if (defaultValue instanceof Sketch) {
            pushSketch(defaultValue, fileName, undefined, [fileName]);
          }
        } else {
          // No default — render all renderable values
          const entries = Object.entries(obj);
          entries.forEach(([key, value]) => {
            if (value instanceof TrackedShape) {
              pushShape(value.toShape(), key, undefined, undefined, value.geometryInfo(), [key]);
            } else if (value instanceof Shape) {
              pushShape(value, key, undefined, undefined, undefined, [key]);
            } else if (value instanceof Sketch) {
              pushSketch(value, key, undefined, [key]);
            } else if (value instanceof ShapeGroup) {
              value.children.forEach((child, i) => {
                flattenGroupChild(child, groupChildLabel(value, key, i), undefined, [key, shapeGroupChildSegment(value, i)]);
              });
            }
          });
        }
      } else if (result instanceof TrackedShape) {
        pushShape(result.toShape(), fileName, undefined, undefined, result.geometryInfo(), [fileName]);
      } else if (result instanceof Shape) {
        pushShape(result, fileName, undefined, undefined, undefined, [fileName]);
      } else if (result instanceof Sketch) {
        pushSketch(result, fileName, undefined, [fileName]);
      } else if (result instanceof GCodeBuilder) {
        objects.push({
          id: `obj-${objects.length + 1}`,
          name: fileName,
          shape: null,
          sketch: null,
          toolpath: result.build(),
          geometryInfo: null,
          treePath: [fileName],
        });
      }

      // Inject collected highlights into sketch objects' meta for rendering.
      const highlights = getCollectedHighlights();
      if (highlights.length > 0) {
        for (const obj of objects) {
          if (obj.sketchMeta) {
            obj.sketchMeta = { ...obj.sketchMeta, highlights };
          }
        }
      }

      // Resolve pending shape highlights → match shapes to scene object indices.
      const pendingShapeHls = getPendingShapeHighlights();
      for (const pending of pendingShapeHls) {
        const rawShape = pending.shape;
        // Extract the underlying Shape for TrackedShape
        const targetShape = (rawShape as any).shape?.getMesh ? (rawShape as any).shape : rawShape;
        const idx = objects.findIndex((o) => o.shape === targetShape);
        if (idx >= 0) {
          getCollectedDebugHighlights3D().push({
            kind: 'shape',
            shapeIndex: idx,
            color: pending.color,
            label: pending.label,
            pulse: pending.pulse,
          });
        }
      }
      resetPendingShapeHighlights();

      const shape = objects.length === 1 ? objects[0].shape : null;
      const sketch = objects.length === 1 ? objects[0].sketch : null;

      return {
        shape,
        sketch,
        objects,
        params: getCollectedParams(),
        dimensions: [...getCollectedDimensions(), ...shapeDimensions],
        highlights: getCollectedHighlights(),
        debugHighlights3D: getCollectedDebugHighlights3D(),
        bom: getCollectedBom(),
        sheetStock: getCollectedSheetStock(),
        cutPlanes: getCollectedCutPlanes(),
        explodeView: getCollectedExplodeView(),
        jointsView: getCollectedJointsView(),
        viewConfig: getCollectedViewConfig(),
        sceneConfig: getCollectedScene(),
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
      lineInfo =
        location.fileName === fileName ? ` (line ${location.line})` : ` (${location.fileName}:${location.line}:${location.column})`;
    }
    _collectedLogs.push({ level: 'error', args: [`${msg}${lineInfo}`, ...(stack ? [stack] : [])], timestamp: Date.now() });
    return {
      shape: null,
      sketch: null,
      objects: [],
      params: getCollectedParams(),
      dimensions: getCollectedDimensions(),
      highlights: getCollectedHighlights(),
      debugHighlights3D: getCollectedDebugHighlights3D(),
      bom: getCollectedBom(),
      sheetStock: getCollectedSheetStock(),
      cutPlanes: getCollectedCutPlanes(),
      explodeView: getCollectedExplodeView(),
      jointsView: getCollectedJointsView(),
      viewConfig: getCollectedViewConfig(),
      sceneConfig: getCollectedScene(),
      robotExport: getCollectedRobotExport(),
      quality,
      error: `${msg}${lineInfo}`,
      timeMs: performance.now() - t0,
      logs: _collectedLogs.slice(),
      verifications: getCollectedVerifications(),
    };
  }
}

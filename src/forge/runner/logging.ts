/**
 * Runner logging utilities: log serialization, console sandbox, import tracing.
 */

import { Shape } from '../kernel';
import { Sketch, TrackedShape } from '../sketch';
import type { ImportScope, LogEntry, RunnerExecutionOptions } from './types';

const LOG_MAX_DEPTH = 4;
const LOG_MAX_ARRAY_ITEMS = 24;
const LOG_MAX_OBJECT_KEYS = 32;
const LOG_NUMBER_PRECISION = 4;

export function formatLogError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function roundLogNumber(value: number): number {
  return Number(value.toFixed(LOG_NUMBER_PRECISION));
}

function toRoundedNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)).map(roundLogNumber);
  }
  if (ArrayBuffer.isView(value) && 'length' in value && typeof (value as { length: unknown }).length === 'number') {
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

  try {
    summary.volume = roundLogNumber(shape.volume());
  } catch (error) {
    summary.volumeError = formatLogError(error);
  }
  try {
    summary.surfaceArea = roundLogNumber(shape.surfaceArea());
  } catch (error) {
    summary.surfaceAreaError = formatLogError(error);
  }
  try {
    summary.triangles = shape.numTri();
  } catch (error) {
    summary.triangleError = formatLogError(error);
  }
  try {
    summary.isEmpty = shape.isEmpty();
  } catch (error) {
    summary.isEmptyError = formatLogError(error);
  }
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

export function formatLogArg(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const inspected = inspectForLog(value);
    if (typeof inspected === 'string') return inspected;
    return JSON.stringify(inspected, null, 2);
  } catch (error) {
    return `[Log serialization failed: ${formatLogError(error)}]`;
  }
}

export function makeSandboxConsole(collectedLogs: LogEntry[]): Record<string, (...args: unknown[]) => void> {
  const capture =
    (level: LogEntry['level']) =>
    (...args: unknown[]) => {
      collectedLogs.push({
        level,
        args: args.map(formatLogArg),
        timestamp: Date.now(),
      });
    };
  return { log: capture('log'), warn: capture('warn'), error: capture('error'), info: capture('info') };
}

export function logImportTrace(
  collectedLogs: LogEntry[],
  fileName: string,
  scope: ImportScope,
  options: RunnerExecutionOptions,
  kind: 'importSvgSketch' | 'importMesh' | 'require',
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
  collectedLogs.push({
    level: 'info',
    args: [`[import] ${kind} ${phase}`, formatLogArg(payload)],
    timestamp: Date.now(),
  });
}

/**
 * Path resolution and import parameter helpers for the runner sandbox.
 */

import type { ResolvedImportSource, RunnerExecutionOptions } from './types';
import type { SvgImportOptions } from '../sketch';

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

export function parseImportParamArgs(
  importKind: string,
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

export function parseSvgImportArgs(importKind: 'importSketch' | 'importSvgSketch', fileName: string, args: unknown): SvgImportOptions {
  if (args == null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new Error(`${importKind}("${fileName}") options must be an object`);
  }

  const out: SvgImportOptions = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (!SVG_IMPORT_OPTION_KEYS.has(key)) {
      throw new Error(
        `${importKind}("${fileName}") unknown SVG option "${key}". ` + `Allowed keys: ${Array.from(SVG_IMPORT_OPTION_KEYS).join(', ')}`,
      );
    }

    switch (key) {
      case 'include': {
        if (typeof value !== 'string' || !['auto', 'fill', 'stroke', 'fill-and-stroke'].includes(value)) {
          throw new Error(`${importKind}("${fileName}") option "include" must be one of: auto, fill, stroke, fill-and-stroke`);
        }
        out.include = value as SvgImportOptions['include'];
        break;
      }
      case 'regionSelection': {
        if (typeof value !== 'string' || !['all', 'largest'].includes(value)) {
          throw new Error(`${importKind}("${fileName}") option "regionSelection" must be one of: all, largest`);
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

export function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

export function collapsePathSegments(path: string): string {
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

export function dirnamePath(path: string): string {
  const collapsed = collapsePathSegments(path);
  if (collapsed === '/' || collapsed === '') return '';
  const trimmed = collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
  const slash = trimmed.lastIndexOf('/');
  if (slash < 0) return '';
  return trimmed.slice(0, slash);
}

export function isRelativeImportSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

export function normalizeLookupPath(path: string): string {
  return collapsePathSegments(path).replace(/^\/+/, '');
}

export function resolveImportPath(fromFile: string, requestedPath: string): string {
  const normalizedRequest = requestedPath.trim();
  if (!normalizedRequest) return '';

  if (isRelativeImportSpecifier(normalizedRequest)) {
    const fromDir = dirnamePath(fromFile);
    const combined = fromDir ? `${fromDir}/${normalizedRequest}` : normalizedRequest;
    return normalizeLookupPath(combined);
  }

  return normalizeLookupPath(normalizedRequest);
}

export function buildFileIndex(allFiles: Record<string, string>): Map<string, string> {
  const fileIndex = new Map<string, string>();
  for (const key of Object.keys(allFiles)) {
    const normalized = normalizeLookupPath(key);
    if (!normalized) continue;
    if (!fileIndex.has(normalized)) fileIndex.set(normalized, key);
  }
  return fileIndex;
}

export function resolveImportSource(
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
    const suffix =
      resolvedPath && resolvedPath !== requestedName ? ` (resolved to "${resolvedPath}" from "${fromFile}")` : ` (from "${fromFile}")`;
    throw new Error(`File not found: "${requestedName}"${suffix}`);
  }
  const source = allFiles[lookupKey];
  if (typeof source !== 'string') {
    throw new Error(`File not found: "${requestedName}" (resolved to "${resolvedPath}")`);
  }
  return { source, lookupKey, resolvedPath };
}

export function isSvgImportPath(path: string): boolean {
  return path.toLowerCase().endsWith('.svg');
}

export function stableSerializeOverrides(overrides?: Record<string, number>): string {
  if (!overrides) return '';
  return JSON.stringify(
    Object.keys(overrides)
      .sort()
      .map((key) => [key, overrides[key]]),
  );
}

export function makeModuleCacheKey(fileName: string, scope: { namePrefix?: string; localOverrides?: Record<string, number> }): string {
  return `${fileName}\0${scope.namePrefix ?? ''}\0${stableSerializeOverrides(scope.localOverrides)}`;
}

export function envFlagEnabled(name: string): boolean {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Static import analysis for ForgeCAD files.
 *
 * Extracts all import references from a .forge.js file and recursively
 * resolves the full dependency tree. Used by the share button to bundle
 * all required files into a single shareable URL.
 */

/** Regex patterns that match ForgeCAD import calls and ES/CJS imports. */
const FORGE_IMPORT_RE =
  /\b(?:importPart|importSketch|importAssembly|importGroup|importMesh|importSvgSketch)\s*\(\s*(?:"([^"]+)"|'([^']+)')/g;

const REQUIRE_RE = /\brequire\s*\(\s*(?:"([^"]+)"|'([^']+)')/g;

const ES_IMPORT_RE = /\bfrom\s+(?:"([^"]+)"|'([^']+)')/g;

/** Known virtual modules that should not be resolved as files. */
const VIRTUAL_MODULES = new Set(['forgecad', '@forge/runtime', '@forgecad/runtime']);

export interface ImportRef {
  /** The raw path string from the source code. */
  raw: string;
  /** The kind of import. */
  kind: 'forgePart' | 'forgeSketch' | 'forgeAssembly' | 'forgeGroup' | 'forgeMesh' | 'forgeSvg' | 'require' | 'esImport';
}

/** Extract all import references from source code (non-recursive, single file). */
export function extractImports(code: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const seen = new Set<string>();

  const add = (raw: string, kind: ImportRef['kind']) => {
    if (!seen.has(raw) && !VIRTUAL_MODULES.has(raw)) {
      seen.add(raw);
      refs.push({ raw, kind });
    }
  };

  const kindMap: Record<string, ImportRef['kind']> = {
    importPart: 'forgePart',
    importSketch: 'forgeSketch',
    importAssembly: 'forgeAssembly',
    importGroup: 'forgeGroup',
    importMesh: 'forgeMesh',
    importSvgSketch: 'forgeSvg',
  };

  // ForgeCAD import functions
  let m: RegExpExecArray | null;
  const forgeRe = new RegExp(FORGE_IMPORT_RE.source, FORGE_IMPORT_RE.flags);
  while ((m = forgeRe.exec(code)) !== null) {
    const path = m[1] ?? m[2];
    const fn = m[0].match(/\b(importPart|importSketch|importAssembly|importGroup|importMesh|importSvgSketch)/)?.[1];
    add(path, kindMap[fn!] ?? 'forgePart');
  }

  // require()
  const reqRe = new RegExp(REQUIRE_RE.source, REQUIRE_RE.flags);
  while ((m = reqRe.exec(code)) !== null) {
    const path = m[1] ?? m[2];
    add(path, 'require');
  }

  // ES import ... from "path"
  const esRe = new RegExp(ES_IMPORT_RE.source, ES_IMPORT_RE.flags);
  while ((m = esRe.exec(code)) !== null) {
    const path = m[1] ?? m[2];
    add(path, 'esImport');
  }

  return refs;
}

/** Resolve a relative import path against a base file path. */
function resolveRelative(fromFile: string, importPath: string): string {
  if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
    return importPath;
  }
  const fromDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
  const combined = fromDir ? `${fromDir}/${importPath}` : importPath;

  // Collapse ".." and "." segments
  const parts = combined.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

export interface DependencyTree {
  /** All code files needed (filename → source code). */
  codeFiles: Record<string, string>;
  /** Mesh/binary file paths that are referenced but can't be bundled. */
  meshFiles: string[];
  /** SVG file paths referenced. */
  svgFiles: string[];
}

/**
 * Recursively collect all dependencies for a given entry file.
 *
 * @param entryFile - The filename of the entry file
 * @param allFiles - All available files (filename → code)
 * @returns The full dependency tree
 */
export function collectDependencies(
  entryFile: string,
  allFiles: Record<string, string>,
): DependencyTree {
  const codeFiles: Record<string, string> = {};
  const meshFiles: string[] = [];
  const svgFiles: string[] = [];
  const visited = new Set<string>();

  function visit(fileName: string) {
    if (visited.has(fileName)) return;
    visited.add(fileName);

    const code = allFiles[fileName];
    if (code == null) return; // File not available

    codeFiles[fileName] = code;

    const imports = extractImports(code);
    for (const imp of imports) {
      const resolved = resolveRelative(fileName, imp.raw);

      if (imp.kind === 'forgeMesh') {
        if (!meshFiles.includes(resolved)) meshFiles.push(resolved);
        continue; // Binary files can't be bundled into code
      }

      if (imp.kind === 'forgeSvg') {
        // SVG files are text — include them if available
        if (allFiles[resolved] != null) {
          if (!svgFiles.includes(resolved)) svgFiles.push(resolved);
          codeFiles[resolved] = allFiles[resolved];
        }
        continue;
      }

      // Recurse into code dependencies
      if (allFiles[resolved] != null) {
        visit(resolved);
      }
    }
  }

  visit(entryFile);
  return { codeFiles, meshFiles, svgFiles };
}

/** Check whether a file has any imports that reference other files. */
export function hasImports(code: string): boolean {
  return extractImports(code).length > 0;
}

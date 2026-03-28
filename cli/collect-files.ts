/**
 * Shared CLI utilities for ForgeCAD CLI tools.
 *
 * Handles project file collection with correct path resolution
 * so that require() paths match between frontend and CLI.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

const FORGE_EXTS = ['.forge.js', '.js', '.svg', '.forge-notebook.json'];
const isForgeFile = (f: string) => FORGE_EXTS.some((ext) => f.endsWith(ext));

/**
 * Recursively collect all forge/sketch files under a directory.
 * Returns a dict keyed by path relative to `root`.
 */
function collectFilesRecursive(dir: string, root: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      Object.assign(result, collectFilesRecursive(full, root));
    } else if (stat.isFile() && isForgeFile(entry)) {
      const relPath = relative(root, full);
      result[relPath] = readFileSync(full, 'utf-8');
    }
  }
  return result;
}

/**
 * Find the project root for a given script path.
 *
 * Strategy: the project root is the directory the user would "open" in the
 * frontend. Walk up from the script's directory — the root is the highest
 * ancestor (up to 2 levels) that directly contains forge files or has
 * immediate child directories with forge files. We only check direct
 * children (not deeply nested) to avoid going too far up.
 */
export function findProjectRoot(scriptPath: string): string {
  const absScript = resolve(scriptPath);
  const scriptDir = dirname(absScript);

  let root = scriptDir;
  let candidate = dirname(scriptDir);

  for (let i = 0; i < 2; i++) {
    if (candidate === root) break;
    try {
      // Check if candidate directly contains forge files (not in deep subdirs)
      const entries = readdirSync(candidate);
      const hasDirectForgeFiles = entries.some((e) => {
        try {
          return statSync(join(candidate, e)).isFile() && isForgeFile(e);
        } catch {
          return false;
        }
      });
      if (hasDirectForgeFiles) {
        root = candidate;
        candidate = dirname(candidate);
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return root;
}

/**
 * Collect all project files and compute the script's relative fileName.
 * Returns { allFiles, fileName } ready to pass to runScript().
 */
export function collectProjectFiles(scriptPath: string): {
  allFiles: Record<string, string>;
  fileName: string;
  /** Read a binary file by path (relative to project root). For importMesh(). */
  readBinaryFile: (relativePath: string) => ArrayBuffer;
} {
  const absScript = resolve(scriptPath);
  const root = findProjectRoot(scriptPath);
  const allFiles = collectFilesRecursive(root, root);
  const fileName = relative(root, absScript);
  const readBinaryFile = (relativePath: string): ArrayBuffer => {
    const absPath = resolve(root, relativePath);
    const buf = readFileSync(absPath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  };
  return { allFiles, fileName, readBinaryFile };
}

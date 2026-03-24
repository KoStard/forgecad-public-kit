/**
 * File path and project file helpers for the forge store.
 */

import projectFiles from 'virtual:forge-project';
import { isNotebookFile } from '../notebook/model';
import { decodeSharedBundle, decodeSharedHash } from '../share';

export const EMPTY_FILE: Record<string, string> = {
  'untitled.forge.js': '// New part\n\nreturn box(50, 30, 10);\n',
};

export const INITIAL_FILES = projectFiles && Object.keys(projectFiles).length > 0 ? (projectFiles as Record<string, string>) : EMPTY_FILE;

export const collectInitialFolders = (files: Record<string, string>): string[] => {
  const folders = new Set<string>();
  Object.keys(files).forEach((name) => {
    const parts = name.replace(/\\/g, '/').split('/');
    if (parts.length <= 1) return;
    let current = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      folders.add(current);
    }
  });
  return Array.from(folders).sort();
};

export const INITIAL_FOLDERS = collectInitialFolders(INITIAL_FILES);
export const isModelFile = (name: string): boolean => name.endsWith('.forge.js') || name.endsWith('.sketch.js'); // legacy compat
export const isRunnableFile = isModelFile;
export const findPreferredEntryFile = (names: string[]): string | null =>
  names.find((n) => isModelFile(n)) || names.find((n) => isNotebookFile(n)) || null;

export const getActiveFileFromHash = (): string | null => {
  const hash = window.location.hash.slice(1); // Remove the #
  if (hash.startsWith('code/') || hash.startsWith('bundle/')) return null; // handled by shared model / bundle logic
  return hash || null;
};

/** If the URL contains a shared model (`#code/...`), decode it once at startup. */
export const sharedModel = decodeSharedHash(window.location.hash);
if (sharedModel) {
  INITIAL_FILES[sharedModel.filename] = sharedModel.code;
}

/** If the URL contains a multi-file bundle (`#bundle/...`), decode and inject all files. */
export const sharedBundle = decodeSharedBundle(window.location.hash);
if (sharedBundle) {
  for (const [name, code] of Object.entries(sharedBundle.files)) {
    INITIAL_FILES[name] = code;
  }
}

export const LAST_ACTIVE_FILE_KEY = 'fc-last-active-file';

export const normalizePath = (value: string): string =>
  value
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

export const getParentPath = (value: string): string => {
  const normalized = normalizePath(value);
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? '' : normalized.slice(0, idx);
};

export const sharedPathDepth = (a: string, b: string): number => {
  const aParts = normalizePath(a).split('/').filter(Boolean);
  const bParts = normalizePath(b).split('/').filter(Boolean);
  const length = Math.min(aParts.length, bParts.length);
  let depth = 0;
  while (depth < length && aParts[depth] === bParts[depth]) depth += 1;
  return depth;
};

export const resolvePreviewFile = (activeFile: string, files: Record<string, string>): string | null => {
  if (isRunnableFile(activeFile) || isNotebookFile(activeFile)) return activeFile;

  const candidates = Object.keys(files).filter((name) => isRunnableFile(name) || isNotebookFile(name));
  if (candidates.length === 0) return null;

  const activeDir = getParentPath(activeFile);
  let best = candidates[0];
  let bestDepth = -1;
  for (const candidate of candidates) {
    const depth = sharedPathDepth(activeDir, getParentPath(candidate));
    const bestIsNotebook = isNotebookFile(best);
    const candidateIsNotebook = isNotebookFile(candidate);
    if (
      depth > bestDepth ||
      (depth === bestDepth && bestIsNotebook && !candidateIsNotebook) ||
      (depth === bestDepth && bestIsNotebook === candidateIsNotebook && candidate < best)
    ) {
      best = candidate;
      bestDepth = depth;
    }
  }
  return best;
};

export const collectParentPaths = (value: string): string[] => {
  const normalized = normalizePath(value);
  const parts = normalized.split('/');
  if (parts.length <= 1) return [];
  const parents: string[] = [];
  let current = '';
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    parents.push(current);
  }
  return parents;
};

export const movePath = (value: string, from: string, to: string): string => {
  if (value === from) return to;
  if (value.startsWith(`${from}/`)) return `${to}${value.slice(from.length)}`;
  return value;
};

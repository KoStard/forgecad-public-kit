import { readdirSync, statSync } from 'fs';
import { basename, join, relative, resolve } from 'path';
import { API_AND_CORPUS_EXAMPLE_MANIFEST } from './api-and-corpus';
import { EXPERIMENTAL_EXAMPLE_MANIFEST } from './experimental';
import { NON_PART_EXAMPLE_MANIFEST } from './non-part';
import { PRODUCT_DEMO_EXAMPLE_MANIFEST } from './product-demos';
import type { ExampleManifestEntry, ExampleManifestFamily } from './types';
import { packageRootFrom } from '../package-runtime';

const EXAMPLE_ARTIFACT_EXTENSIONS = ['.forge.js', '.forge-notebook.json'] as const;

export const EXAMPLE_MANIFEST: ExampleManifestEntry[] = [
  ...API_AND_CORPUS_EXAMPLE_MANIFEST,
  ...PRODUCT_DEMO_EXAMPLE_MANIFEST,
  ...NON_PART_EXAMPLE_MANIFEST,
  ...EXPERIMENTAL_EXAMPLE_MANIFEST,
];

export const EXAMPLE_MANIFEST_FAMILIES: ExampleManifestFamily[] = [
  'api-parts',
  'compiler-corpus',
  'product-demos',
  'non-part',
  'experimental',
];

function manifestPackageRoot(): string {
  const candidate = packageRootFrom(import.meta.url);
  return basename(candidate) === 'cli' ? resolve(candidate, '..') : candidate;
}

export function listExampleArtifacts(): string[] {
  const packageRoot = manifestPackageRoot();
  const examplesRoot = join(packageRoot, 'examples');
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (EXAMPLE_ARTIFACT_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
        found.push(relative(packageRoot, fullPath).replaceAll('\\', '/'));
      }
    }
  };

  walk(examplesRoot);
  return found.sort();
}

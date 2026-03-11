import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { fileURLToPath } from 'url';

export function packageRootFrom(metaUrl: string): string {
  return resolve(dirname(fileURLToPath(metaUrl)), '..');
}

export function resolvePackagePath(metaUrl: string, ...segments: string[]): string {
  return resolve(packageRootFrom(metaUrl), ...segments);
}

export function isDirectCliRun(metaUrl: string): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(metaUrl);
}

export function viteBinPath(metaUrl: string): string {
  const vitePath = resolvePackagePath(metaUrl, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vitePath)) {
    throw new Error(
      `Missing Vite runtime at ${vitePath}. Run "npm install" in the ForgeCAD package before using studio, notebook, render, or capture commands.`,
    );
  }
  return vitePath;
}

export function spawnPackageVite(
  metaUrl: string,
  args: string[],
  options: SpawnOptions = {},
): ChildProcess {
  return spawn(process.execPath, [viteBinPath(metaUrl), ...args], options);
}

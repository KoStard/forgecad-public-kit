import type { FileSystemProvider } from './FileSystemProvider';
import { LocalStudioProvider } from './LocalStudioProvider';
import { BrowserStorageProvider } from './BrowserStorageProvider';

export type { FileSystemProvider, FileSystemCapabilities, FileChangeEvent } from './FileSystemProvider';

/**
 * The active file system provider for this build.
 *
 * - studio mode  (default): LocalStudioProvider — SSE watch + server-side save
 * - web mode (FORGE_MODE=web): BrowserStorageProvider — localStorage + no server
 *
 * __FORGE_MODE__ is injected at build time by vite.config.ts.
 */
export const fileSystem: FileSystemProvider =
  __FORGE_MODE__ === 'web'
    ? new BrowserStorageProvider()
    : new LocalStudioProvider();

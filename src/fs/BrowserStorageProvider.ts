import type { FileChangeEvent, FileSystemCapabilities, FileSystemProvider } from './FileSystemProvider';
import { EXAMPLE_FILES } from './exampleFiles';

const STORAGE_KEY = 'forgecad-browser-project';

/**
 * File system provider for web/playground mode.
 * Files are persisted in localStorage and survive page reloads.
 * No live filesystem watch — all edits happen in the browser.
 */
export class BrowserStorageProvider implements FileSystemProvider {
  readonly capabilities: FileSystemCapabilities = {
    liveWatch: false,
    notebookServer: false,
  };

  // In-memory mirror of persisted state, updated on every save
  private _files: Record<string, string> = {};

  subscribe(onChange: (event: FileChangeEvent) => void): () => void {
    const files = this._loadFromStorage();
    this._files = { ...files };
    // Defer to next tick so React has finished its first render
    setTimeout(() => onChange({ type: 'init', files }), 0);
    return () => { /* no cleanup needed */ };
  }

  async save(filename: string, content: string): Promise<void> {
    this._files[filename] = content;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._files));
    } catch (e) {
      // localStorage may be full (private browsing, quota exceeded) — changes
      // survive the session in memory but won't persist across reloads.
      console.warn('ForgeCAD: localStorage write failed — changes are in-memory only.', e);
    }
  }

  async projectPath(): Promise<string | null> {
    return null;
  }

  private _loadFromStorage(): Record<string, string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Object.keys(parsed).length > 0
        ) {
          const stored = parsed as Record<string, string>;
          return this._reconcileWithExamples(stored);
        }
      }
    } catch {
      // Corrupt or missing entry — fall through to defaults
    }
    return { ...EXAMPLE_FILES };
  }

  /**
   * Reconcile cached localStorage files with the current bundle's examples:
   * - Remove cached example files that no longer exist in EXAMPLE_FILES
   * - Add new example files that weren't in the cache yet
   * - Preserve user edits to existing example files
   */
  private _reconcileWithExamples(stored: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};

    // Keep non-example files and still-valid example files
    for (const [path, content] of Object.entries(stored)) {
      if (path.startsWith('examples/')) {
        // Only keep if the example still exists in the bundle
        if (path in EXAMPLE_FILES) {
          result[path] = content;
        }
      } else {
        // User-created files — always keep
        result[path] = content;
      }
    }

    // Add any new examples not already in storage
    for (const [path, content] of Object.entries(EXAMPLE_FILES)) {
      if (!(path in result)) {
        result[path] = content;
      }
    }

    return result;
  }
}

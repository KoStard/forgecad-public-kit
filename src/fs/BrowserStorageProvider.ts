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
          return parsed as Record<string, string>;
        }
      }
    } catch {
      // Corrupt or missing entry — fall through to defaults
    }
    return { ...EXAMPLE_FILES };
  }
}

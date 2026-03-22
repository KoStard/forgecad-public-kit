import type { FileChangeEvent, FileSystemCapabilities, FileSystemProvider } from './FileSystemProvider';

/**
 * File system provider for local Studio mode.
 * Uses the Vite dev server's SSE /api/watch endpoint for live file sync
 * and POST /api/save to write files back to disk.
 */
export class LocalStudioProvider implements FileSystemProvider {
  readonly capabilities: FileSystemCapabilities = {
    liveWatch: true,
    notebookServer: true,
  };

  subscribe(onChange: (event: FileChangeEvent) => void): () => void {
    const es = new EventSource('/api/watch');

    es.addEventListener('init', (e) => {
      onChange({ type: 'init', files: JSON.parse((e as MessageEvent).data) });
    });
    es.addEventListener('change', (e) => {
      const { filename, content } = JSON.parse((e as MessageEvent).data);
      onChange({ type: 'change', filename, content });
    });
    es.addEventListener('delete', (e) => {
      const { filename } = JSON.parse((e as MessageEvent).data);
      onChange({ type: 'delete', filename });
    });

    return () => es.close();
  }

  async save(filename: string, content: string): Promise<void> {
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error((payload as { error?: string }).error || 'Save failed');
    }
  }

  async delete(filename: string): Promise<void> {
    const response = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error((payload as { error?: string }).error || 'Delete failed');
    }
  }

  async projectPath(): Promise<string | null> {
    try {
      const response = await fetch('/api/project-path');
      const data = await response.json() as { projectDir: string | null };
      return data.projectDir ?? null;
    } catch {
      return null;
    }
  }
}

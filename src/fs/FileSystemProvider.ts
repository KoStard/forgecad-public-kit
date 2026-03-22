export type FileChangeEvent =
  | { type: 'init'; files: Record<string, string> }
  | { type: 'change'; filename: string; content: string }
  | { type: 'delete'; filename: string };

export interface FileSystemCapabilities {
  /** True when the provider watches the real filesystem and pushes live changes. */
  readonly liveWatch: boolean;
  /** True when server-side notebook cell execution (/api/notebook/execute) is available. */
  readonly notebookServer: boolean;
}

export interface FileSystemProvider {
  readonly capabilities: FileSystemCapabilities;

  /**
   * Subscribe to file system events.
   * Implementations must call onChange({ type: 'init', files }) as soon as the
   * initial file set is known (may be deferred to next tick).
   * Returns an unsubscribe function.
   */
  subscribe(onChange: (event: FileChangeEvent) => void): () => void;

  /** Persist a file. Throws on unrecoverable failure. */
  save(filename: string, content: string): Promise<void>;

  /** Delete a file from persistent storage. */
  delete(filename: string): Promise<void>;

  /** Return the absolute project directory path, or null if not applicable. */
  projectPath(): Promise<string | null>;
}

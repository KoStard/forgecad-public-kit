# Web Deployment Architecture

**Goal:** Deploy ForgeCAD as a static GitHub Pages site ("playground" mode) while keeping
`forgecad studio path/to/dir/` working exactly as today. Both modes share the same React app
and geometry kernel — only the file I/O layer differs.

**Status:** Planning

---

## 1. Current State

ForgeCAD's web app currently works only as a local dev server (`vite dev`) that requires a
running Node.js process. The Vite server acts as both the static asset server and a thin file
system bridge via custom middleware:

| Endpoint | Purpose |
|---|---|
| `GET /api/watch` (SSE) | Initial file snapshot + live filesystem change events |
| `POST /api/save` | Write file to disk |
| `GET /api/project-path` | Show project path in UI |
| `POST /api/notebook/execute` | Server-side notebook cell execution (Node.js kernel) |
| `virtual:forge-project` | Vite plugin bakes initial file snapshot into bundle (dev only) |

Everything else — geometry computation (manifold-3d WASM), 3D rendering (Three.js), code editing
(Monaco), script evaluation (`evalWorkerClient`) — is already 100% client-side.

---

## 2. Architecture Summary

The app state lives in `forgeStore.ts` (Zustand). File I/O is currently done in two places:

- **`App.tsx`** — opens `EventSource('/api/watch')` at startup, calls `applyServerSnapshot` /
  `applyServerFileChange` / `applyServerFileDelete` on the store.
- **`forgeStore.ts`** — `saveFile()` calls `POST /api/save`; `saveFileAs()` uses the browser
  File System Access API (already browser-native).
- **`CommandPalette.tsx`** — calls `GET /api/project-path` for display only.
- **`NotebookEditor.tsx`** — calls `POST /api/notebook/execute` for server-side cell execution.

The key insight: the **entire UI + geometry engine** is already browser-capable. The only
server-coupled surface is file I/O.

---

## 3. Proposed Architecture

### 3.1 FileSystemProvider abstraction

Introduce `src/fs/` with a single interface implemented two ways:

```
src/fs/
  FileSystemProvider.ts        # interface + type definitions
  LocalStudioProvider.ts       # SSE + /api/save (current behaviour)
  BrowserStorageProvider.ts    # OPFS + File System Access API
  index.ts                     # exports the active provider (chosen at startup)
```

```ts
interface FileSystemProvider {
  // Called once at app startup — returns initial file map and subscribes to changes.
  // onChange is called whenever a file is added/changed/deleted.
  subscribe(onChange: (event: FileChangeEvent) => void): () => void;

  // Called when the user saves a file.
  save(filename: string, content: string): Promise<void>;

  // Optional — returns display path (null in web mode).
  projectPath(): Promise<string | null>;

  // Capabilities declared by the provider.
  readonly capabilities: {
    readonly liveWatch: boolean;    // filesystem watches live updates?
    readonly notebookServer: boolean; // server-side notebook execution available?
  };
}
```

### 3.2 Mode selection

Use a Vite `define` plugin to stamp `__FORGE_MODE__` = `'studio' | 'web'` at build time.

```
npm run build                        # FORGE_MODE=studio (default, local)
FORGE_MODE=web npm run build         # for GitHub Pages
```

`src/fs/index.ts` picks the implementation:

```ts
export const fileSystem: FileSystemProvider =
  __FORGE_MODE__ === 'web'
    ? new BrowserStorageProvider()
    : new LocalStudioProvider();
```

### 3.3 App.tsx changes

Replace the hard-coded `EventSource('/api/watch')` `useEffect` with:

```ts
const unsub = fileSystem.subscribe((event) => {
  if (event.type === 'init') applySnapshot(event.files);
  if (event.type === 'change') applyFileChange(event.filename, event.content);
  if (event.type === 'delete') applyFileDelete(event.filename);
});
return unsub;
```

### 3.4 Store changes

Replace `fetch('/api/save', ...)` in `saveFile()` with `fileSystem.save(filename, content)`.

### 3.5 Notebook execution in web mode

`/api/notebook/execute` runs the notebook server-side (Node.js kernel). In web mode there is
no server, so we need browser-side notebook execution via the existing `evalWorkerClient`.

`runNotebook` (in `src/notebook/runtime.ts`) is already pure TypeScript with no Node.js deps.
The server-side route in `vite.config.ts` is just calling `runNotebook` + `saveNotebook`.
In web mode, `NotebookEditor.tsx` can call `runNotebook` directly in a worker — no server needed.

**Short-term:** Disable/hide notebook execution in web mode for the initial GitHub Pages launch.
Evaluate client-side notebook execution as a follow-up.

### 3.6 BrowserStorageProvider implementation

For the initial GitHub Pages deployment, use **OPFS** (Origin Private File System) for
persistence. Key decisions:

- On first load: show a "New project / Open folder" splash.
- "Open folder": use File System Access API (`showDirectoryPicker`) — gives read/write access to
  a real local folder from the browser (no server needed). Useful for users who want to work on
  local files while visiting the site.
- "New project": create an in-memory project, saved to OPFS for persistence across reloads.
- No external sync in web mode (OPFS is origin-scoped, local to the browser).

### 3.7 CommandPalette `/api/project-path`

Replace with `fileSystem.projectPath()` — returns `null` in web mode; the UI omits the path display.

---

## 4. Progress Tracker

| # | Change | Studio mode | Web mode | Status |
|---|--------|------------|----------|--------|
| — | Baseline | Works | N/A | ✅ |
| W1 | `FileSystemProvider` interface + `LocalStudioProvider` | ✅ | — | ⬜ |
| W2 | Wire store + App.tsx through provider | ✅ | — | ⬜ |
| W3 | `BrowserStorageProvider` (OPFS + File System Access) | — | ✅ | ⬜ |
| W4 | Build mode flag (`__FORGE_MODE__`) + Vite config | ✅ | ✅ | ⬜ |
| W5 | GitHub Actions workflow + gh-pages deploy | — | ✅ | ⬜ |
| W6 | Notebook execution in web mode (browser-side) | — | ✅ | ⬜ |

---

## 5. Experiment Log

*(To be filled as implementation proceeds.)*

---

## 6. Files to Modify / Create

| File | Change |
|---|---|
| `src/fs/FileSystemProvider.ts` | **New** — interface |
| `src/fs/LocalStudioProvider.ts` | **New** — SSE + /api/save |
| `src/fs/BrowserStorageProvider.ts` | **New** — OPFS + File System Access API |
| `src/fs/index.ts` | **New** — mode-selected export |
| `src/App.tsx` | Replace EventSource useEffect with fileSystem.subscribe |
| `src/store/forgeStore.ts` | Replace fetch('/api/save') with fileSystem.save |
| `src/components/CommandPalette.tsx` | Replace /api/project-path with fileSystem.projectPath() |
| `src/components/NotebookEditor.tsx` | Guard /api/notebook/execute with capabilities.notebookServer |
| `vite.config.ts` | Add `__FORGE_MODE__` define; keep forgeProjectPlugin for studio |
| `.github/workflows/deploy-pages.yml` | **New** — build + deploy with FORGE_MODE=web |

---

## 7. Open Questions

1. **Splash screen in web mode** — "New project" vs "Open folder" — what's the right UX for
   first-time visitors to the GitHub Pages site?
2. **OPFS vs localStorage** — OPFS supports large files and directories; localStorage is simpler
   but 5MB-limited. OPFS is the right call for .forge.js projects.
3. **Sharing** — out of scope for this phase, but worth noting: URL-encoded model sharing
   (gzip + base64 in the URL hash) could be a zero-backend sharing mechanism for small files.
4. **Notebook in web mode** — disable for launch vs implement browser-side execution?

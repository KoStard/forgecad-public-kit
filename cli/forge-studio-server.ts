import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import chokidar from 'chokidar';
import { init, resolveForgeQualityPreset } from '../src/forge/headless';
import { buildNotebookOutputs } from '../src/notebook/output';
import {
  appendNotebookCell,
  createNotebook,
  isNotebookFile,
  parseNotebook,
  serializeNotebook,
  updateNotebookCellExecution,
} from '../src/notebook/model';
import { runNotebook } from '../src/notebook/runtime';

export interface StudioServerOptions {
  projectDir: string | null;
  distDir: string;
  port: number;
  host: string;
  open: boolean;
  strictPort: boolean;
}

const PROJECT_FILE_EXTS = ['.forge.js', '.js', '.svg', '.forge-notebook.json'];
const isProjectFile = (name: string): boolean => PROJECT_FILE_EXTS.some((ext) => name.endsWith(ext));
const MESH_FILE_EXTS = ['.stl', '.obj', '.3mf'];
const isMeshFile = (name: string): boolean => MESH_FILE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ---- Helpers (mirrored from vite.config.ts) ----

function sendJson(res: http.ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function scanProjectFiles(projectDir: string | null): Record<string, string> {
  if (!projectDir) return {};
  const abs = path.resolve(projectDir);
  const entries: Record<string, string> = {};
  function scan(dir: string, prefix: string): void {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.isDirectory()) { scan(path.join(dir, item.name), rel); }
      else if (item.isFile() && isProjectFile(item.name)) {
        entries[rel] = fs.readFileSync(path.join(dir, item.name), 'utf-8');
      }
    }
  }
  try { scan(abs, ''); } catch {}
  return entries;
}

function resolveProjectFile(projectDir: string | null, filename: string): { filePath: string; filename: string } {
  if (!projectDir) throw new Error('No project directory');
  if (!filename) throw new Error('Invalid file path');
  const abs = path.resolve(projectDir);
  const filePath = path.isAbsolute(filename) ? path.resolve(filename) : path.resolve(abs, filename);
  if (!isProjectFile(filePath)) throw new Error('Invalid file type');
  const rel = path.relative(abs, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${filename}" is outside the project root`);
  }
  return { filePath, filename: rel.replace(/\\/g, '/') };
}

function loadNotebook(
  projectDir: string | null,
  filename: string,
  notebookText?: string,
  createIfMissing = false,
): { filename: string; notebook: ReturnType<typeof parseNotebook> } {
  const resolved = resolveProjectFile(projectDir, filename);
  if (!isNotebookFile(resolved.filename)) throw new Error('Filename must end with .forge-notebook.json');
  if (typeof notebookText === 'string') {
    return { filename: resolved.filename, notebook: parseNotebook(notebookText) };
  }
  if (!fs.existsSync(resolved.filePath)) {
    if (createIfMissing) return { filename: resolved.filename, notebook: createNotebook() };
    throw new Error(`Notebook "${resolved.filename}" does not exist`);
  }
  return { filename: resolved.filename, notebook: parseNotebook(fs.readFileSync(resolved.filePath, 'utf-8')) };
}

function saveNotebook(projectDir: string | null, filename: string, text: string): void {
  const resolved = resolveProjectFile(projectDir, filename);
  fs.mkdirSync(path.dirname(resolved.filePath), { recursive: true });
  fs.writeFileSync(resolved.filePath, text, 'utf-8');
}

let notebookKernelReady: Promise<void> | null = null;
function ensureNotebookKernel(): Promise<void> {
  if (!notebookKernelReady) notebookKernelReady = init();
  return notebookKernelReady;
}

async function executeNotebookRequest(projectDir: string | null, body: any, createIfMissing = false): Promise<object> {
  const requestFilename = typeof body.filename === 'string' ? body.filename : '';
  const { filename, notebook } = loadNotebook(
    projectDir,
    requestFilename,
    typeof body.notebook === 'string' ? body.notebook : undefined,
    createIfMissing,
  );
  await ensureNotebookKernel();
  const notebookText = serializeNotebook(notebook);
  const allFiles = { ...scanProjectFiles(projectDir), [filename]: notebookText };
  const quality = resolveForgeQualityPreset(typeof body.quality === 'string' ? body.quality : undefined);
  const run = runNotebook(notebook, filename, allFiles, {
    quality,
    targetCellId: typeof body.cellId === 'string' ? body.cellId : undefined,
  });
  const nextNotebook = run.targetCellId
    ? updateNotebookCellExecution(notebook, run.targetCellId, buildNotebookOutputs(run.cellResult))
    : notebook;
  const nextNotebookText = serializeNotebook(nextNotebook);
  saveNotebook(projectDir, filename, nextNotebookText);
  return {
    cellId: run.targetCellId,
    filename,
    notebook: nextNotebook,
    notebookText: nextNotebookText,
    outputs: run.targetCellId
      ? (nextNotebook.cells.find((c) => c.id === run.targetCellId)?.outputs ?? [])
      : [],
    summary: {
      error: run.cellResult.error,
      objectCount: run.cellResult.objects.length,
      paramNames: run.cellResult.params.map((p) => p.name),
      timeMs: run.cellResult.timeMs,
    },
  };
}

// ---- Static file serving ----

function serveStatic(distDir: string, req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const urlPath = (req.url ?? '/').split('?')[0];
  let filePath = path.join(distDir, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // SPA fallback: serve index.html for any unknown path
    filePath = path.join(distDir, 'index.html');
  }
  if (!fs.existsSync(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  const isText = mime.includes('charset');
  const content = fs.readFileSync(filePath, isText ? 'utf-8' : null);
  res.statusCode = 200;
  res.setHeader('Content-Type', mime);
  // Assets are content-hashed by Vite — cache forever. HTML: no-cache for SPA routing.
  res.setHeader('Cache-Control', urlPath.startsWith('/assets/') ? 'max-age=31536000,immutable' : 'no-cache');
  res.end(content);
  return true;
}

// ---- Port selection ----

function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(port, host, () => s.close(() => resolve(true)));
    s.on('error', () => resolve(false));
  });
}

async function pickPort(preferred: number, host: string, strict: boolean): Promise<number> {
  for (let p = preferred; p < preferred + 10; p++) {
    if (await isPortAvailable(p, host)) return p;
    if (strict) break;
  }
  throw new Error(`Port ${preferred} is already in use. Use --port to specify another.`);
}

// ---- Browser open ----

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// ---- Server ----

export async function startStudioServer(
  options: StudioServerOptions,
): Promise<{ url: string; close(): Promise<void> }> {
  const { projectDir, distDir, open, strictPort } = options;
  const host = options.host || '127.0.0.1';
  const port = await pickPort(options.port || 5173, host, strictPort);

  const sseClients = new Set<http.ServerResponse>();
  const broadcast = (event: string, data: object): void => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try { client.write(msg); } catch { sseClients.delete(client); }
    }
  };

  let watcher: ReturnType<typeof chokidar.watch> | null = null;
  if (projectDir) {
    const abs = path.resolve(projectDir);
    watcher = chokidar.watch(abs, { ignoreInitial: true, ignored: /(^|[/\\])\../ });
    watcher.on('add', (f) => {
      if (!isProjectFile(f)) return;
      const rel = path.relative(abs, f).replace(/\\/g, '/');
      try { broadcast('change', { filename: rel, content: fs.readFileSync(f, 'utf-8') }); } catch {}
    });
    watcher.on('change', (f) => {
      if (!isProjectFile(f)) return;
      const rel = path.relative(abs, f).replace(/\\/g, '/');
      try { broadcast('change', { filename: rel, content: fs.readFileSync(f, 'utf-8') }); } catch {}
    });
    watcher.on('unlink', (f) => {
      if (!isProjectFile(f)) return;
      broadcast('delete', { filename: path.relative(abs, f).replace(/\\/g, '/') });
    });
  }

  const server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/api/project-path') {
      sendJson(res, 200, { projectDir: projectDir ? path.resolve(projectDir) : null });
      return;
    }

    if (method === 'GET' && url === '/api/watch') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      if (projectDir) {
        const entries = scanProjectFiles(projectDir);
        res.write(`event: init\ndata: ${JSON.stringify(entries)}\n\n`);
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
      } else {
        res.end();
      }
      return;
    }

    if (method === 'POST' && url === '/api/save') {
      readJsonBody(req)
        .then((body) => {
          if (!projectDir) { sendJson(res, 400, { error: 'No project directory' }); return; }
          const { filename, content } = body;
          if (!filename || typeof content !== 'string') { sendJson(res, 400, { error: 'Invalid request' }); return; }
          const resolved = resolveProjectFile(projectDir, filename);
          fs.mkdirSync(path.dirname(resolved.filePath), { recursive: true });
          fs.writeFileSync(resolved.filePath, content, 'utf-8');
          sendJson(res, 200, { success: true });
        })
        .catch((e: any) => sendJson(res, 500, { error: e.message }));
      return;
    }

    if (method === 'POST' && url === '/api/delete') {
      readJsonBody(req)
        .then((body) => {
          if (!projectDir) { sendJson(res, 400, { error: 'No project directory' }); return; }
          const { filename } = body;
          if (!filename || typeof filename !== 'string') { sendJson(res, 400, { error: 'Invalid request' }); return; }
          const resolved = resolveProjectFile(projectDir, filename);
          if (fs.existsSync(resolved.filePath)) {
            fs.unlinkSync(resolved.filePath);
          }
          sendJson(res, 200, { success: true });
        })
        .catch((e: any) => sendJson(res, 500, { error: e.message }));
      return;
    }

    if (method === 'GET' && url?.startsWith('/api/read-binary?')) {
      try {
        const params = new URLSearchParams(url.split('?')[1]);
        const filename = params.get('path');
        if (!projectDir || !filename) {
          sendJson(res, 400, { error: 'Missing project dir or path' });
          return;
        }
        const absProject = path.resolve(projectDir);
        const filePath = path.resolve(absProject, filename);
        const rel = path.relative(absProject, filePath);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          sendJson(res, 403, { error: 'Path outside project root' });
          return;
        }
        if (!isMeshFile(filePath)) {
          sendJson(res, 400, { error: `Not a mesh file: ${filename}` });
          return;
        }
        if (!fs.existsSync(filePath)) {
          sendJson(res, 404, { error: `File not found: ${filename}` });
          return;
        }
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.end(data);
      } catch (e: any) {
        sendJson(res, 500, { error: e.message });
      }
      return;
    }

    if (method === 'POST' && url === '/api/notebook/execute') {
      readJsonBody(req)
        .then((body) => executeNotebookRequest(projectDir, body, true))
        .then((payload) => sendJson(res, 200, payload))
        .catch((e: any) => sendJson(res, 500, { error: e.message }));
      return;
    }

    if (method === 'POST' && url === '/api/notebook/append-cell') {
      readJsonBody(req)
        .then(async (body) => {
          const filename = typeof body.filename === 'string' ? body.filename : '';
          const source = typeof body.source === 'string' ? body.source : '';
          const loaded = loadNotebook(
            projectDir, filename,
            typeof body.notebook === 'string' ? body.notebook : undefined,
            true,
          );
          const appended = appendNotebookCell(
            loaded.notebook, source,
            typeof body.afterCellId === 'string' ? body.afterCellId : undefined,
          );
          return executeNotebookRequest(projectDir, {
            ...body,
            filename: loaded.filename,
            notebook: serializeNotebook(appended.notebook),
            cellId: appended.cell.id,
          }, true);
        })
        .then((payload) => sendJson(res, 200, payload))
        .catch((e: any) => sendJson(res, 500, { error: e.message }));
      return;
    }

    if (!serveStatic(distDir, req, res)) {
      res.statusCode = 404;
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));

  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const url = `http://${displayHost}:${port}`;
  if (open) openBrowser(url);

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      watcher?.close();
      sseClients.forEach((c) => { try { c.end(); } catch {} });
      sseClients.clear();
      server.close(() => resolve());
    });

  return { url, close };
}

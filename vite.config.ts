import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { init, resolveForgeQualityPreset } from './src/forge/headless';
import { buildNotebookOutputs } from './src/notebook/output';
import {
  appendNotebookCell,
  createNotebook,
  isNotebookFile,
  parseNotebook,
  serializeNotebook,
  updateNotebookCellExecution,
} from './src/notebook/model';
import { runNotebook } from './src/notebook/runtime';

// Resolve project dir from: FORGE_PROJECT env var, or first non-flag CLI arg after '--'
function resolveProjectDir(): string | null {
  if (process.env.FORGE_PROJECT) return process.env.FORGE_PROJECT;
  const sep = process.argv.indexOf('--');
  if (sep !== -1) {
    const arg = process.argv[sep + 1];
    if (arg && !arg.startsWith('-')) return arg;
  }
  return null;
}

const projectDir = resolveProjectDir();
const PROJECT_FILE_EXTS = ['.forge.js', '.sketch.js', '.js', '.svg', '.forge-notebook.json'];
const isProjectFile = (name: string): boolean => PROJECT_FILE_EXTS.some((ext) => name.endsWith(ext));

let notebookKernelReady: Promise<void> | null = null;

function ensureNotebookKernel(): Promise<void> {
  if (!notebookKernelReady) {
    notebookKernelReady = init();
  }
  return notebookKernelReady;
}

// Helper to scan project directory for forge/sketch files
function scanProjectFiles(projectPath: string | null): Record<string, string> {
  if (!projectPath) return {};
  const abs = path.resolve(projectPath);
  const entries: Record<string, string> = {};
  
  function scanDir(dirPath: string, prefix: string = '') {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const relativePath = prefix ? `${prefix}/${item.name}` : item.name;
      
      if (item.isDirectory()) {
        scanDir(fullPath, relativePath);
      } else if (item.isFile() && isProjectFile(item.name)) {
        entries[relativePath] = fs.readFileSync(fullPath, 'utf-8');
      }
    }
  }
  
  try {
    scanDir(abs);
  } catch (e) {
    // Directory might not exist
  }
  
  return entries;
}

function sendJson(res: any, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function resolveProjectFileRequest(projectPath: string | null, filename: string): {
  filePath: string;
  filename: string;
} {
  if (!projectPath) throw new Error('No project directory');
  if (!filename) throw new Error('Invalid file path');
  const requestedPath = filename;
  const absProjectPath = path.resolve(projectPath);
  const filePath = path.isAbsolute(filename)
    ? path.resolve(filename)
    : path.resolve(absProjectPath, filename);
  if (!isProjectFile(filePath)) throw new Error('Invalid file type');
  const relativePath = path.relative(absProjectPath, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path "${requestedPath}" is outside the opened project root`);
  }
  return {
    filePath,
    filename: relativePath.replace(/\\/g, '/'),
  };
}

function loadNotebook(projectPath: string | null, filename: string, notebookText?: string, createIfMissing = false) {
  const resolved = resolveProjectFileRequest(projectPath, filename);
  if (!isNotebookFile(resolved.filename)) {
    throw new Error('Notebook filename must end with .forge-notebook.json');
  }
  if (typeof notebookText === 'string') {
    return {
      filename: resolved.filename,
      notebook: parseNotebook(notebookText),
    };
  }
  if (!fs.existsSync(resolved.filePath)) {
    if (createIfMissing) {
      return {
        filename: resolved.filename,
        notebook: createNotebook(),
      };
    }
    throw new Error(`Notebook "${resolved.filename}" does not exist`);
  }
  return {
    filename: resolved.filename,
    notebook: parseNotebook(fs.readFileSync(resolved.filePath, 'utf-8')),
  };
}

function saveNotebook(projectPath: string | null, filename: string, notebookText: string): void {
  const resolved = resolveProjectFileRequest(projectPath, filename);
  fs.mkdirSync(path.dirname(resolved.filePath), { recursive: true });
  fs.writeFileSync(resolved.filePath, notebookText, 'utf-8');
}

async function executeNotebookRequest(body: any, createIfMissing = false) {
  const requestFilename = typeof body.filename === 'string' ? body.filename : '';
  const { filename, notebook } = loadNotebook(
    projectDir,
    requestFilename,
    typeof body.notebook === 'string' ? body.notebook : undefined,
    createIfMissing,
  );

  await ensureNotebookKernel();

  const notebookText = serializeNotebook(notebook);
  const allFiles = {
    ...scanProjectFiles(projectDir),
    [filename]: notebookText,
  };
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
      ? (nextNotebook.cells.find((cell) => cell.id === run.targetCellId)?.outputs ?? [])
      : [],
    summary: {
      error: run.cellResult.error,
      objectCount: run.cellResult.objects.length,
      paramNames: run.cellResult.params.map((param) => param.name),
      timeMs: run.cellResult.timeMs,
    },
  };
}

function forgeProjectPlugin() {
  const virtualId = 'virtual:forge-project';
  const resolvedId = '\0' + virtualId;

  return {
    name: 'forge-project',
    resolveId(id: string) {
      if (id === virtualId) return resolvedId;
    },
    load(id: string) {
      if (id !== resolvedId) return;
      if (!projectDir) return 'export default null;';
      const entries = scanProjectFiles(projectDir);
      return `export default ${JSON.stringify(entries)};`;
    },
    handleHotUpdate({ file, server }: any) {
      if (!projectDir) return;
      const abs = path.resolve(projectDir);
      if (file.startsWith(abs) && isProjectFile(file)) {
        // Ignore - don't trigger HMR for project file changes
        return [];
      }
    },
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        // Handle /api/files - dynamically fetch all project files
        if (req.method === 'GET' && req.url === '/api/files') {
          try {
            const entries = scanProjectFiles(projectDir);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(entries));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }
        
        // Handle /api/save - save a file
        if (req.method === 'POST' && req.url === '/api/save') {
          readJsonBody(req)
            .then((body) => {
              const { filename, content } = body;
              if (!projectDir) {
                sendJson(res, 400, { error: 'No project directory' });
                return;
              }
              if (!filename || typeof content !== 'string') {
                sendJson(res, 400, { error: 'Invalid request' });
                return;
              }
              const resolved = resolveProjectFileRequest(projectDir, filename);
              fs.mkdirSync(path.dirname(resolved.filePath), { recursive: true });
              fs.writeFileSync(resolved.filePath, content, 'utf-8');
              sendJson(res, 200, { success: true });
            })
            .catch((e: any) => {
              sendJson(res, 500, { error: e.message });
            });
          return;
        }

        if (req.method === 'POST' && req.url === '/api/notebook/execute') {
          readJsonBody(req)
            .then((body) => executeNotebookRequest(body, true))
            .then((payload) => sendJson(res, 200, payload))
            .catch((e: any) => sendJson(res, 500, { error: e.message }));
          return;
        }

        if (req.method === 'POST' && req.url === '/api/notebook/append-cell') {
          readJsonBody(req)
            .then(async (body) => {
              const filename = typeof body.filename === 'string' ? body.filename : '';
              const source = typeof body.source === 'string' ? body.source : '';
              const loaded = loadNotebook(
                projectDir,
                filename,
                typeof body.notebook === 'string' ? body.notebook : undefined,
                true,
              );
              const appended = appendNotebookCell(
                loaded.notebook,
                source,
                typeof body.afterCellId === 'string' ? body.afterCellId : undefined,
              );
              const payload = await executeNotebookRequest({
                ...body,
                filename: loaded.filename,
                notebook: serializeNotebook(appended.notebook),
                cellId: appended.cell.id,
              }, true);
              sendJson(res, 200, payload);
            })
            .catch((e: any) => sendJson(res, 500, { error: e.message }));
          return;
        }
        
        next();
      });
    },
  };
}

function stripBrokenManifoldSourceMaps() {
  const manifoldLibPattern = /[\\/]node_modules[\\/]manifold-3d[\\/]lib[\\/].+\.js(?:\?.*)?$/;
  const sourceMapTrailerPattern = /\n\/\/# sourceMappingURL=.*?\.map\s*$/gm;

  return {
    name: 'strip-broken-manifold-sourcemaps',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!manifoldLibPattern.test(id)) return null;
      if (!code.includes('sourceMappingURL=')) return null;
      const sanitized = code.replace(sourceMapTrailerPattern, '');
      return {
        code: sanitized,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [forgeProjectPlugin(), stripBrokenManifoldSourceMaps(), react()],
  resolve: {
    alias: {
      '@forge': path.resolve(__dirname, './src/forge'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  worker: {
    format: 'es',
  },
  server: {
    fs: {
      allow: ['.'],
    },
  },
});

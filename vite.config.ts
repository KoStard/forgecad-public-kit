import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { execFileSync, execSync } from 'child_process';
import chokidar from 'chokidar';
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
const initialFile = process.env.FORGE_FILE ?? null;

function scanProject(): { files: Record<string, string>; folders: string[] } {
  if (initialFile && projectDir) return scanSingleFile(projectDir, initialFile);
  return scanProjectFiles(projectDir);
}
const PROJECT_FILE_EXTS = ['.forge.js', '.js', '.svg', '.forge-notebook.json'];
const isProjectFile = (name: string): boolean => PROJECT_FILE_EXTS.some((ext) => name.endsWith(ext));
const MESH_FILE_EXTS = ['.stl', '.obj', '.3mf'];
const isMeshFile = (name: string): boolean => MESH_FILE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

let notebookKernelReady: Promise<void> | null = null;

function ensureNotebookKernel(): Promise<void> {
  if (!notebookKernelReady) {
    notebookKernelReady = init();
  }
  return notebookKernelReady;
}

// When a single file was passed on the CLI, return just that one file without scanning the directory.
function scanSingleFile(dir: string, filename: string): { files: Record<string, string>; folders: string[] } {
  try {
    const content = fs.readFileSync(path.join(dir, filename), 'utf-8');
    return { files: { [filename]: content }, folders: [] };
  } catch {
    return { files: {}, folders: [] };
  }
}

// Helper to scan project directory for forge/sketch files
function scanProjectFiles(projectPath: string | null): { files: Record<string, string>; folders: string[] } {
  if (!projectPath) return { files: {}, folders: [] };
  const abs = path.resolve(projectPath);
  const files: Record<string, string> = {};
  const emptyFolders: string[] = [];

  function scanDir(dirPath: string, prefix: string = '') {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    // Check if this directory has any project-relevant content
    let hasContent = false;
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      const relativePath = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.isDirectory()) {
        if (item.name.startsWith('.')) continue;
        scanDir(fullPath, relativePath);
        hasContent = true;
      } else if (item.isFile() && isProjectFile(item.name)) {
        files[relativePath] = fs.readFileSync(fullPath, 'utf-8');
        hasContent = true;
      } else if (item.isFile() && isMeshFile(item.name)) {
        // Mesh files: include path only (binary content fetched on demand via /api/read-binary)
        files[relativePath] = '';
        hasContent = true;
      }
    }
    if (!hasContent && prefix) {
      emptyFolders.push(prefix);
    }
  }

  try {
    scanDir(abs);
  } catch (e) {
    // Directory might not exist
  }

  return { files, folders: emptyFolders };
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
    ...scanProject().files,
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

// ─── Solver auto-build & watch plugin ─────────────────────────────────────────

function forgeSolverPlugin() {
  const solverPkg = path.resolve(__dirname, 'solver/pkg/solver.js');
  const solverBuildScript = path.resolve(__dirname, 'scripts/solver-build.mjs');
  const solverSrc = path.resolve(__dirname, 'solver/src');

  function buildSolver() {
    try {
      execFileSync(process.execPath, [solverBuildScript], {
        cwd: __dirname,
        stdio: 'inherit',
      });
      return true;
    } catch {
      return false;
    }
  }

  return {
    name: 'forge-solver',
    // Auto-build solver on dev server start if pkg is missing.
    configureServer(server: any) {
      if (!fs.existsSync(solverPkg)) {
        console.log('\n  Solver WASM not found — building…\n');
        if (!buildSolver()) {
          console.error('\n  ✖ Solver build failed. Sketches will not work.\n');
        }
      }

      // Watch Rust source files and rebuild on change.
      const watcher = chokidar.watch([`${solverSrc}/**/*.rs`, path.resolve(__dirname, 'solver/Cargo.toml')], {
        ignoreInitial: true,
      });

      let building = false;
      const rebuild = () => {
        if (building) return;
        building = true;
        console.log('\n  Rust source changed — rebuilding solver…\n');
        buildSolver();
        building = false;
        // Trigger a full page reload so the new WASM is picked up.
        server.ws.send({ type: 'full-reload' });
      };

      watcher.on('change', rebuild);
      watcher.on('add', rebuild);

      server.httpServer?.once('close', () => watcher.close());
    },
  };
}

function forgeProjectPlugin(enableInitialScan = true) {
  const virtualId = 'virtual:forge-project';
  const resolvedId = '\0' + virtualId;

  return {
    name: 'forge-project',
    resolveId(id: string) {
      if (id === virtualId) return resolvedId;
    },
    load(id: string) {
      if (id !== resolvedId) return;
      // Never bake project files into the production build — the production
      // server always delivers the real project via the SSE /api/watch init event.
      if (!enableInitialScan || !projectDir) return 'export default null;';
      const { files: entries } = scanProject();
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
      const sseClients = new Set<any>();

      const broadcast = (event: string, data: object) => {
        const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const client of sseClients) {
          try { client.write(msg); } catch { sseClients.delete(client); }
        }
      };

      if (projectDir) {
        const abs = path.resolve(projectDir);
        const watchTarget = initialFile ? path.join(abs, initialFile) : abs;
        const watcher = chokidar.watch(watchTarget, {
          ignoreInitial: true,
          ignored: /(^|[/\\])\../,
        });
        watcher.on('add', (filePath) => {
          const rel = path.relative(abs, filePath).replace(/\\/g, '/');
          if (isProjectFile(filePath)) {
            try { broadcast('change', { filename: rel, content: fs.readFileSync(filePath, 'utf-8') }); } catch {}
          } else if (isMeshFile(filePath)) {
            broadcast('change', { filename: rel, content: '' });
          }
        });
        watcher.on('change', (filePath) => {
          const rel = path.relative(abs, filePath).replace(/\\/g, '/');
          if (isProjectFile(filePath)) {
            try { broadcast('change', { filename: rel, content: fs.readFileSync(filePath, 'utf-8') }); } catch {}
          } else if (isMeshFile(filePath)) {
            broadcast('change', { filename: rel, content: '' });
          }
        });
        watcher.on('unlink', (filePath) => {
          if (!isProjectFile(filePath) && !isMeshFile(filePath)) return;
          const rel = path.relative(abs, filePath).replace(/\\/g, '/');
          broadcast('delete', { filename: rel });
        });
        server.httpServer?.once('close', () => {
          watcher.close();
          sseClients.forEach((c) => { try { c.end(); } catch {} });
          sseClients.clear();
        });
      }

      server.middlewares.use((req: any, res: any, next: any) => {
        // Handle /api/project-path - return the absolute project directory
        if (req.method === 'GET' && req.url === '/api/project-path') {
          const absDir = projectDir ? path.resolve(projectDir) : null;
          sendJson(res, 200, { projectDir: absDir });
          return;
        }

        // Handle /api/watch - SSE stream for file change notifications
        if (req.method === 'GET' && req.url === '/api/watch') {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders();
          const scan = scanProject();
          const initPayload = initialFile ? { ...scan, initialFile } : scan;
          res.write(`event: init\ndata: ${JSON.stringify(initPayload)}\n\n`);
          if (projectDir) {
            sseClients.add(res);
            req.on('close', () => sseClients.delete(res));
          } else {
            res.end();
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

        // Handle /api/delete - delete a file
        if (req.method === 'POST' && req.url === '/api/delete') {
          readJsonBody(req)
            .then((body) => {
              const { filename } = body;
              if (!projectDir) {
                sendJson(res, 400, { error: 'No project directory' });
                return;
              }
              if (!filename) {
                sendJson(res, 400, { error: 'Invalid request' });
                return;
              }
              const resolved = resolveProjectFileRequest(projectDir, filename);
              if (fs.existsSync(resolved.filePath)) {
                fs.unlinkSync(resolved.filePath);
                // Clean up empty parent directories up to project root
                let dir = path.dirname(resolved.filePath);
                const absProject = path.resolve(projectDir);
                while (dir !== absProject && dir.startsWith(absProject)) {
                  try {
                    const entries = fs.readdirSync(dir);
                    if (entries.length === 0) {
                      fs.rmdirSync(dir);
                      dir = path.dirname(dir);
                    } else {
                      break;
                    }
                  } catch {
                    break;
                  }
                }
              }
              sendJson(res, 200, { success: true });
            })
            .catch((e: any) => {
              sendJson(res, 500, { error: e.message });
            });
          return;
        }

        // Handle /api/mkdir - create a directory
        if (req.method === 'POST' && req.url === '/api/mkdir') {
          readJsonBody(req)
            .then((body) => {
              const { dirPath: dirName } = body;
              if (!projectDir) {
                sendJson(res, 400, { error: 'No project directory' });
                return;
              }
              if (!dirName || typeof dirName !== 'string') {
                sendJson(res, 400, { error: 'Invalid request' });
                return;
              }
              const absProject = path.resolve(projectDir);
              const absDir = path.resolve(absProject, dirName);
              const rel = path.relative(absProject, absDir);
              if (rel.startsWith('..') || path.isAbsolute(rel)) {
                sendJson(res, 400, { error: 'Path is outside the project root' });
                return;
              }
              fs.mkdirSync(absDir, { recursive: true });
              sendJson(res, 200, { success: true });
            })
            .catch((e: any) => {
              sendJson(res, 500, { error: e.message });
            });
          return;
        }

        // Handle /api/read-binary?path=... - read a mesh file as binary
        if (req.method === 'GET' && req.url?.startsWith('/api/read-binary?')) {
          try {
            const params = new URLSearchParams(req.url.split('?')[1]);
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

/**
 * Scans manifold-3d/lib/*.js for bare-specifier imports and returns them as
 * Vite optimizeDeps.include entries. This ensures that any npm packages
 * imported by the raw-served manifold-3d lib files are pre-bundled (so CJS
 * packages get converted to ESM and Node.js globals like Buffer are polyfilled).
 *
 * We scan automatically so that future manifold-3d upgrades that add new deps
 * don't require manual maintenance here. We exclude:
 *  - Node.js built-ins (path, assert, fs, node:* protocol, etc.)
 *  - Build/test-only tools (vitest, esbuild-wasm, glob)
 *  - Self-imports (manifold-3d/*)
 */
function getManifoldLibIncludes(): string[] {
  // Packages that are Node.js-only or build-tool-only and must not be pre-bundled for browser
  const exclude = new Set([
    'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dns', 'domain',
    'events', 'fs', 'http', 'http2', 'https', 'module', 'net', 'os', 'path',
    'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl',
    'stream', 'string_decoder', 'sys', 'timers', 'tls', 'tty', 'url', 'util',
    'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
    'glob', 'vitest', 'esbuild', 'esbuild-wasm',
  ]);

  const libDir = path.resolve(__dirname, 'node_modules/manifold-3d/lib');
  const deps = new Set<string>();

  let files: string[];
  try {
    files = fs.readdirSync(libDir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
  } catch {
    return [];
  }

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(libDir, file), 'utf-8');
      for (const match of content.matchAll(/from '((?:@[^/'\s]+\/[^'\s]+|[^./'\s][^'\s]*)?)'/g)) {
        const dep = match[1];
        if (!dep) continue;
        if (dep.startsWith('node:')) continue;
        if (dep.startsWith('manifold-3d')) continue;
        const pkgName = dep.startsWith('@') ? dep.split('/').slice(0, 2).join('/') : dep.split('/')[0];
        if (exclude.has(pkgName)) continue;
        deps.add(dep);
      }
    } catch {
      // skip unreadable files
    }
  }

  return [...deps];
}

function forgeTypesPlugin() {
  return {
    name: 'forge-types',
    configureServer() {
      const forgeDir = path.resolve(__dirname, 'src/forge');
      let debounce: ReturnType<typeof setTimeout> | null = null;

      const regen = () => {
        try {
          execSync('node scripts/gen-forge-types.mjs', { cwd: __dirname, stdio: 'pipe' });
          console.log('✓ forge-api.d.ts regenerated');
        } catch (e: any) {
          console.error('✗ gen:types failed:', e.stderr?.toString() ?? e.message);
          return;
        }
        // Chain: docs and skill depend on the freshly generated .d.ts
        try {
          execSync('node scripts/gen-api-docs.mjs', { cwd: __dirname, stdio: 'pipe' });
          console.log('✓ generated API docs regenerated');
        } catch (e: any) {
          console.error('✗ gen:docs failed:', e.stderr?.toString() ?? e.message);
        }
        try {
          execSync('node scripts/build-forgecad-skill.mjs', { cwd: __dirname, stdio: 'pipe' });
          console.log('✓ SKILL.md rebuilt');
        } catch (e: any) {
          console.error('✗ build:skill failed:', e.stderr?.toString() ?? e.message);
        }
      };

      const watcher = chokidar.watch(`${forgeDir}/**/*.ts`, {
        ignoreInitial: true,
        ignored: /forge-api\.d\.ts$/,
      });

      watcher.on('all', () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(regen, 500);
      });
    },
  };
}

function stripBrokenManifoldSourceMaps() {
  const manifoldLibPattern = /[\\/]node_modules[\\/]manifold-3d[\\/]lib[\\/].+\.js$/;
  const sourceMapTrailerPattern = /\n\/\/# sourceMappingURL=.*?\.map\s*$/gm;

  return {
    name: 'strip-broken-manifold-sourcemaps',
    enforce: 'pre' as const,
    // Vite extracts file sourcemaps before transform hooks, so intercept the load itself.
    load(id: string) {
      const cleanId = id.replace(/\?.*$/, '');
      if (!manifoldLibPattern.test(cleanId)) return null;
      const code = fs.readFileSync(cleanId, 'utf-8');
      return code.includes('sourceMappingURL=')
        ? code.replace(sourceMapTrailerPattern, '')
        : code;
    },
  };
}

const forgeMode = process.env.FORGE_MODE === 'web' ? 'web' : 'studio';

/**
 * Ensures dist-skill/CONTEXT.md exists during dev so the ?raw import in
 * AISkillDialog.tsx doesn't break Vite.  If the real file is missing (e.g.
 * fresh clone, npm install only), writes a placeholder stub.
 */
function ensureSkillContextStub() {
  const contextPath = path.resolve(__dirname, 'dist-skill/CONTEXT.md');
  if (!fs.existsSync(contextPath)) {
    fs.mkdirSync(path.resolve(__dirname, 'dist-skill'), { recursive: true });
    fs.writeFileSync(
      contextPath,
      '<!-- stub: run `npm run build:skill:forgecad` to generate the real file -->\n',
    );
  }
}

/**
 * Copies dist-skill/ into dist/skill/ during web builds so the AI skill files
 * are served as static assets on GitHub Pages (e.g. /ForgeCAD/skill/CONTEXT.md).
 */
function forgeSkillStaticPlugin() {
  return {
    name: 'forge-skill-static',
    closeBundle() {
      const src = path.resolve(__dirname, 'dist-skill');
      const dest = path.resolve(__dirname, 'dist/skill');
      if (!fs.existsSync(src)) return;
      fs.cpSync(src, dest, { recursive: true });
      console.log('✓ Skill files copied to dist/skill/');
    },
  };
}

/**
 * Serves docs-web/ at /docs/ during dev and copies it into dist/docs/ for
 * production builds, so the docs site is available at /ForgeCAD/docs/ on
 * GitHub Pages and at /docs/ during local development.
 */
function forgeDocsPlugin() {
  const docsDir = path.resolve(__dirname, 'docs-web');
  return {
    name: 'forge-docs',
    configureServer(server: any) {
      // Serve docs-web/ at /docs/ during dev
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === '/docs' || req.url === '/docs/') {
          const indexPath = path.join(docsDir, 'index.html');
          if (fs.existsSync(indexPath)) {
            res.setHeader('Content-Type', 'text/html');
            res.end(fs.readFileSync(indexPath, 'utf-8'));
            return;
          }
        }
        next();
      });

      // Rebuild docs-web/ when any markdown source changes
      const docsSourceDir = path.resolve(__dirname, 'docs', 'permanent');
      let debounce: ReturnType<typeof setTimeout> | null = null;
      const watcher = chokidar.watch(`${docsSourceDir}/**/*.md`, { ignoreInitial: true });
      watcher.on('all', () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => {
          try {
            execSync('node scripts/build-docs-site.mjs', { cwd: __dirname, stdio: 'pipe' });
            console.log('✓ docs-web rebuilt');
          } catch (e: any) {
            console.error('✗ build:docs failed:', e.stderr?.toString() ?? e.message);
          }
        }, 300);
      });
    },
    closeBundle() {
      // Copy docs-web/ into dist/docs/ for production builds
      if (!fs.existsSync(docsDir)) return;
      const dest = path.resolve(__dirname, 'dist/docs');
      fs.cpSync(docsDir, dest, { recursive: true });
      console.log('✓ Docs site copied to dist/docs/');
    },
  };
}

/**
 * Removes the OCCT WASM from the build output so it can be loaded from CDN
 * instead. The file is ~48MB which exceeds Cloudflare Pages' 25MB asset limit.
 */
function removeOcctWasmPlugin() {
  return {
    name: 'remove-occt-wasm',
    closeBundle() {
      const assetsDir = path.resolve(__dirname, 'dist', 'assets');
      if (!fs.existsSync(assetsDir)) return;
      for (const file of fs.readdirSync(assetsDir)) {
        if (file.startsWith('opencascade.full') && file.endsWith('.wasm')) {
          fs.unlinkSync(path.join(assetsDir, file));
          console.log('✓ Removed OCCT WASM from dist (loaded from CDN instead)');
        }
      }
    },
  };
}

export default defineConfig(({ command }) => {
  // Ensure the CONTEXT.md stub exists so the ?raw import doesn't break dev server
  if (command === 'serve') ensureSkillContextStub();

  return {
  plugins: [
    // Auto-build & watch the Rust solver (dev server only)
    ...(command === 'serve' ? [forgeSolverPlugin()] : []),
    // Only serve the project plugin (SSE watch, /api/save etc.) in local studio mode
    forgeProjectPlugin(command === 'serve' && forgeMode === 'studio'),
    ...(command === 'serve' ? [forgeTypesPlugin()] : []),
    stripBrokenManifoldSourceMaps(),
    react(),
    // Copy skill files into the web build output for static serving
    ...(forgeMode === 'web' && command === 'build' ? [forgeSkillStaticPlugin()] : []),
    // Serve docs at /docs/ in dev and copy into dist/docs/ for production
    forgeDocsPlugin(),
    // Remove OCCT WASM from dist — it's loaded from CDN (too large for Cloudflare Pages)
    ...(command === 'build' ? [removeOcctWasmPlugin()] : []),
  ],
  // GitHub Pages serves at /ForgeCAD/; local dev serves at /
  base: forgeMode === 'web' ? '/ForgeCAD/' : '/',
  define: {
    // Injected at build time — picked up by src/fs/index.ts
    __FORGE_MODE__: JSON.stringify(forgeMode),
  },
  resolve: {
    alias: {
      '@forge': path.resolve(__dirname, './src/forge'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: [
      'manifold-3d',
      // OpenCascade.js WASM — raw-served like manifold-3d.
      'opencascade.js',
      // The WASM solver is a raw wasm-pack package — exclude from dep optimisation
      // so Vite serves the .wasm file directly.
      'solver',
    ],
    // Auto-discovered: all npm deps imported by manifold-3d/lib/*.js files.
    // Vite can't discover these itself because manifold-3d is excluded from its
    // module scan. See getManifoldLibIncludes() for the exclusion logic.
    include: getManifoldLibIncludes(),
  },
  worker: {
    format: 'es',
  },
  server: {
    fs: {
      // Allow serving solver/pkg/ WASM files from the project root.
      allow: ['.'],
    },
  },
  assetsInclude: ['**/*.wasm'],
};
});

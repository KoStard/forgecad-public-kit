import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

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
      } else if (item.isFile() && (item.name.endsWith('.forge.js') || item.name.endsWith('.sketch.js'))) {
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
      if (file.startsWith(abs) && (file.endsWith('.forge.js') || file.endsWith('.sketch.js'))) {
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
          let body = '';
          req.on('data', (chunk: any) => body += chunk);
          req.on('end', () => {
            try {
              const { filename, content } = JSON.parse(body);
              if (!projectDir) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'No project directory' }));
                return;
              }
              if (!filename || typeof content !== 'string') {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid request' }));
                return;
              }
              if (!filename.endsWith('.forge.js') && !filename.endsWith('.sketch.js')) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid file type' }));
                return;
              }
              const abs = path.resolve(projectDir);
              const filePath = path.join(abs, filename);
              if (!filePath.startsWith(abs)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid path' }));
                return;
              }
              fs.writeFileSync(filePath, content, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
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

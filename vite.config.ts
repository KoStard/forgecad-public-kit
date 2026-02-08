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
      const abs = path.resolve(projectDir);
      const entries: Record<string, string> = {};
      for (const f of fs.readdirSync(abs)) {
        if (f.endsWith('.forge.js') || f.endsWith('.sketch.js')) {
          entries[f] = fs.readFileSync(path.join(abs, f), 'utf-8');
        }
      }
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
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [forgeProjectPlugin(), react()],
  resolve: {
    alias: {
      '@forge': path.resolve(__dirname, './src/forge'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  server: {
    fs: {
      allow: ['.'],
    },
  },
});

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
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (mod) return [mod];
      }
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

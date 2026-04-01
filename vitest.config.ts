import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@forge': path.resolve(__dirname, './src/forge'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});

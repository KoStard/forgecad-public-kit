#!/usr/bin/env node

/**
 * ForgeCAD CLI — SVG export (legacy wrapper)
 *
 * This file is deprecated. Use `npm run svg` which calls cli/forge-svg.ts directly.
 * This wrapper exists only for backwards compatibility.
 */

import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).map(a => JSON.stringify(a)).join(' ');
try {
  execSync(`npx tsx ${resolve(__dirname, 'forge-svg.ts')} ${process.argv.slice(2).join(' ')}`, {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  });
} catch (e) {
  process.exit(e.status || 1);
}

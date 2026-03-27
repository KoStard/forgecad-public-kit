#!/usr/bin/env node
/**
 * Generates src/forge/forge-api.d.ts from src/forge/forge-public-api.ts.
 *
 * Uses dts-bundle-generator to resolve and inline all imported types into a
 * single file, then strips `export` keywords to produce ambient global
 * declarations suitable for Monaco's addExtraLib().
 *
 * Run: node scripts/gen-forge-types.mjs
 *   or: npm run gen:types
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const entry = 'src/forge/forge-public-api.ts';
const tmp = '/tmp/forge-api-raw.d.ts';
const out = resolve(root, 'src/forge/forge-api.d.ts');

console.log('Running dts-bundle-generator…');
execSync(
  `node_modules/.bin/dts-bundle-generator --no-check --export-referenced-types=false --project tsconfig.dts.json --out-file ${tmp} ${entry}`,
  { cwd: root, stdio: 'inherit' },
);

let content = readFileSync(tmp, 'utf-8');

// ── Replace external package imports with opaque type stubs ─────────────────
// Monaco's addExtraLib() cannot resolve node_modules imports.
// Collect all top-level import statements, extract the named bindings, and
// replace them with `type X = unknown` stubs so references compile in Monaco.
// A single remaining `import` turns the file into a TS module (not ambient),
// making all declarations invisible to Monaco — so we must catch every form.
const importStubs = [];
// Default imports: `import Foo from 'pkg'` → `type Foo = unknown`
content = content.replace(
  /^import ([A-Za-z_$][A-Za-z0-9_$]*) from '[^']+';?\s*\n?/gm,
  (_, name) => {
    importStubs.push(`type ${name} = unknown;`);
    return '';
  },
);
// Namespace imports: `import * as Foo from 'pkg'` → `type Foo = unknown`
content = content.replace(
  /^import \* as ([A-Za-z_$][A-Za-z0-9_$]*) from '[^']+';?\s*\n?/gm,
  (_, name) => {
    importStubs.push(`type ${name} = unknown;`);
    return '';
  },
);
// Named imports: `import { Foo, Bar } from 'pkg'` → `type Foo = unknown; type Bar = unknown`
content = content.replace(
  /^import \{([^}]+)\} from '[^']+';?\s*\n?/gm,
  (_, names) => {
    for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
      importStubs.push(`type ${name} = unknown;`);
    }
    return '';
  },
);
// Also replace inline `import("pkg").Type` references with `unknown`
content = content.replace(/import\(['"'][^'"']+['"']\)\.[A-Za-z_$][A-Za-z0-9_$]*/g, 'unknown');

// ── Strip export keywords to produce ambient (global) declarations ──────────
// Monaco's addExtraLib() needs ambient declarations with no module system.
content = content
  // Remove re-export statements: export { Foo, Bar }; and export { Foo } from '...';
  .replace(/^export (?:type )?\{[^}]*\}[^;]*;\s*\n?/gm, '')
  // Remove export {};
  .replace(/^export \{\};\s*\n?/gm, '')
  // Strip `export ` prefix from declarations (export declare, export interface,
  // export abstract class, export enum, export type Alias = ...)
  .replace(/^export (declare |interface |abstract class |enum |const enum )/gm, '$1')
  // export type Alias = ... (not re-export form)
  .replace(/^export type ([A-Za-z_$])/gm, 'type $1')
  // export class / export function / export const that lack `declare`
  .replace(/^export (class |function |const |let |var )/gm, 'declare $1')
  .trim();

// ── Remove lib-only declarations from global scope ──────────────────────────
// Members of `partLibrary` (exposed as `lib.*`) are NOT in the global eval
// context — only `lib` itself is. Remove standalone top-level `declare
// function` globals for each lib member and inline their signatures directly
// into the partLibrary object type so Monaco shows `lib.foo(...)` correctly
// but never offers `foo(...)` as a global.
const libBlockMatch = content.match(/declare const partLibrary:\s*\{([^}]+)\}/s);
if (libBlockMatch) {
  const libMembers = new Set(
    [...libBlockMatch[1].matchAll(/^\s{1,4}(\w+):/gm)].map(m => m[1])
  );
  // Collect signatures before removing — handles optional generics <T extends ...>
  const signatures = new Map();
  for (const name of libMembers) {
    const fnMatch = content.match(
      new RegExp(`^declare function (${name})(<[^>]*>)?(\\([^)]*(?:\\([^)]*\\)[^)]*)*\\)[^;\\n]*);`, 'm')
    );
    if (fnMatch) {
      const generics = fnMatch[2] ?? '';
      signatures.set(name, `${name}${generics}${fnMatch[3]}`);
    }
    // Always remove the standalone top-level declaration
    content = content.replace(
      new RegExp(`^declare function ${name}\\b[^\\n]*\\n`, 'gm'),
      '',
    );
  }
  // Replace `name: typeof name` with the inlined method signature
  for (const [name, sig] of signatures) {
    content = content.replace(
      new RegExp(`(\\s+)${name}: typeof ${name};`, 'g'),
      `$1${sig};`,
    );
  }
}

// Prepend header and stubs for external types
const header = '// AUTO-GENERATED — do not edit by hand.\n// Regenerate: npm run gen:types  (source: src/forge/forge-public-api.ts)\n';
if (importStubs.length > 0) {
  content = `${header}// External type stubs (opaque — not user-facing)\n${importStubs.join('\n')}\n\n${content}`;
} else {
  content = `${header}\n${content}`;
}

writeFileSync(out, content + '\n');
console.log(`Written: src/forge/forge-api.d.ts (${content.split('\n').length} lines)`);

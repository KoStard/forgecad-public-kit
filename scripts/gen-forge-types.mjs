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
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

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

// ── Recover JSDoc from source files ─────────────────────────────────────────
// dts-bundle-generator drops JSDoc on functions it synthesises for `typeof`
// references. This helper reads all .ts files under a directory and extracts
// the JSDoc block immediately preceding `export function <name>`.

function collectTsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectTsFiles(full));
    else if (entry.name.endsWith('.ts')) results.push(full);
  }
  return results;
}

function findJsdocInDir(dir, fnName) {
  for (const file of collectTsFiles(dir)) {
    const src = readFileSync(file, 'utf-8');
    // Match the JSDoc block immediately before `export function <name>`.
    // The JSDoc must be the last thing before the function (only whitespace between).
    const regex = new RegExp(
      `(/\\*\\*(?:[^*]|\\*(?!/))*\\*/)\n\\s*export function ${fnName}\\s*[(<]`
    );
    const m = src.match(regex);
    if (m) return m[1];
  }
  return null;
}

// ── Remove lib-only declarations from global scope ──────────────────────────
// Members of `partLibrary` (exposed as `lib.*`) are NOT in the global eval
// context — only `lib` itself is. Remove standalone top-level `declare
// function` globals for each lib member and inline their signatures directly
// into the partLibrary object type so Monaco shows `lib.foo(...)` correctly
// but never offers `foo(...)` as a global.
//
// dts-bundle-generator synthesises these `declare function` stubs to resolve
// `typeof` references inside the `partLibrary` const type, but the synthesis
// drops JSDoc. We recover JSDoc from the original source files.
const libBlockMatch = content.match(/declare const partLibrary:\s*\{([^}]+)\}/s);
if (libBlockMatch) {
  const libMembers = new Set(
    [...libBlockMatch[1].matchAll(/^\s{1,4}(\w+):/gm)].map(m => m[1])
  );

  // Recover JSDoc from source files for lib functions.
  // The bundler's synthetic `declare function` stubs don't carry JSDoc,
  // so we read it from the original `export function` definitions.
  const libSrcDir = resolve(root, 'src/forge/lib');
  const libJsdocs = new Map();
  for (const name of libMembers) {
    const jsdoc = findJsdocInDir(libSrcDir, name);
    if (jsdoc) libJsdocs.set(name, jsdoc);
  }

  // Collect signatures before removing — uses findTopLevelDecl to handle
  // multi-line declarations (e.g. inline object-type parameters spanning lines)
  const signatures = new Map();
  for (const name of libMembers) {
    const fnDecls = findTopLevelDecl(content, 'declare function', name);
    if (fnDecls.length > 0) {
      // Extract the signature (everything after 'declare function ')
      const decl = fnDecls[0];
      const sig = decl.replace(/^declare function /, '').replace(/;$/, '');
      signatures.set(name, sig);
    }
    // Remove all standalone top-level declarations (may be multi-line)
    for (const decl of findTopLevelDecl(content, 'declare function', name)) {
      content = content.replace(decl + '\n', '');
    }
  }
  // Replace `name: typeof name` with the inlined method signature,
  // prepending the recovered JSDoc comment.
  for (const [name, sig] of signatures) {
    const jsdoc = libJsdocs.get(name);
    const replacement = jsdoc
      ? `\n${jsdoc}\n$1${sig};`
      : `$1${sig};`;
    content = content.replace(
      new RegExp(`(\\s+)${name}: typeof ${name};`, 'g'),
      replacement,
    );
  }
}

// ── Expand namespace re-exports to inline declarations ──────────────────────
// dts-bundle-generator produces `declare namespace X { export { ... } }` with
// re-export syntax that Monaco's JS IntelliSense cannot resolve. We find ALL
// such namespaces, expand re-exports into proper member declarations, and
// remove the corresponding top-level globals so they're only accessible via
// the namespace (e.g. `sdf.sphere()` instead of bare `sphere()`).

/**
 * Find a top-level declaration for `name` and return its full text.
 * Handles multi-line declarations (inline object types) via brace counting.
 * `endsAtBrace`: true for class/interface (ends at closing `}`),
 *                false for function/type (ends at `;` when braces balanced).
 */
function findTopLevelDecl(src, prefix, name, { exactMatch = true, endsAtBrace = false } = {}) {
  // exactMatch uses (?=[(<]) lookahead to avoid matching `name$1` variants
  const suffix = exactMatch ? '(?=[(<])' : '\\b';
  const startRegex = new RegExp(`^${prefix} ${name}${suffix}`, 'gm');
  const starts = [...src.matchAll(startRegex)];
  return starts.map((m) => {
    let braces = 0;
    let i = m.index;
    for (; i < src.length; i++) {
      if (src[i] === '{') braces++;
      else if (src[i] === '}') {
        braces--;
        if (endsAtBrace && braces === 0) { i++; break; }
      }
      else if (src[i] === ';' && braces === 0) { i++; break; }
    }
    return src.slice(m.index, i);
  });
}

const nsReExportRegex = /declare namespace (\w+) \{\s*export \{([^}]+)\};\s*\}/gs;
for (const nsMatch of [...content.matchAll(nsReExportRegex)]) {
  const nsName = nsMatch[1];
  const members = nsMatch[2].split(',').map(n => n.trim()).filter(Boolean);
  const nsLines = [];
  for (const name of members) {
    // 1. Functions — use exact match to avoid `name$1` collisions
    const fnDecls = findTopLevelDecl(content, 'declare function', name);
    if (fnDecls.length > 0) {
      for (const decl of fnDecls) {
        nsLines.push('  ' + decl.replace('declare function', 'export function').replace(/\n/g, '\n  '));
        content = content.replace(decl + '\n', '');
      }
      continue;
    }
    // 2. Interfaces — multi-line, ends with `^}`
    const ifaceRegex = new RegExp(`^interface ${name}\\b[\\s\\S]*?^\\}`, 'gm');
    const ifaceMatch = content.match(ifaceRegex);
    if (ifaceMatch) {
      nsLines.push('  export ' + ifaceMatch[0].replace(/^/gm, '  ').trimStart());
      content = content.replace(ifaceRegex, '');
      continue;
    }
    // 3. Classes
    const classDecls = findTopLevelDecl(content, 'declare class', name, { exactMatch: false, endsAtBrace: true });
    if (classDecls.length > 0) {
      for (const decl of classDecls) {
        nsLines.push('  export ' + decl.replace('declare class', 'class').replace(/\n/g, '\n  '));
        content = content.replace(decl + '\n', '');
      }
      continue;
    }
    // 4. Type aliases
    const typeRegex = new RegExp(`^type ${name}\\b[^\\n]*`, 'gm');
    const typeMatch = content.match(typeRegex);
    if (typeMatch) {
      nsLines.push('  export ' + typeMatch[0]);
      content = content.replace(new RegExp(`^type ${name}\\b[^\\n]*\\n`, 'gm'), '');
      continue;
    }
    // Fallback: keep as re-export (shouldn't happen)
    nsLines.push(`  export { ${name} };`);
  }
  content = content.replace(nsMatch[0], `declare namespace ${nsName} {\n${nsLines.join('\n')}\n}`);
}

// ── Alias `lib` → `partLibrary` ─────────────────────────────────────────────
// The bundler loses the `export { partLibrary as lib }` rename. Add an
// explicit alias so Monaco autocompletes `lib.*` in user scripts.
content += '\n/** All library parts. Access via `lib.xxx()` in scripts. */\ndeclare const lib: typeof partLibrary;\n';

// Prepend header and stubs for external types
const header = '// AUTO-GENERATED — do not edit by hand.\n// Regenerate: npm run gen:types  (source: src/forge/forge-public-api.ts)\n';
if (importStubs.length > 0) {
  content = `${header}// External type stubs (opaque — not user-facing)\n${importStubs.join('\n')}\n\n${content}`;
} else {
  content = `${header}\n${content}`;
}

writeFileSync(out, content + '\n');
console.log(`Written: src/forge/forge-api.d.ts (${content.split('\n').length} lines)`);

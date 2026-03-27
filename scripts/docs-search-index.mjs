/**
 * docs-search-index.mjs — Build the search index for the docs site.
 *
 * Extracted so it can be tested independently of the full HTML build.
 *
 * Usage (standalone):
 *   node scripts/docs-search-index.mjs                  # dump all entries as JSON
 *   node scripts/docs-search-index.mjs --query pocket   # search for "pocket"
 *   node scripts/docs-search-index.mjs --query "pocket()" --assert  # exit 1 if no results
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename, extname } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DOCS_DIR = join(ROOT, 'docs', 'permanent');

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function categoryFromPath(relPath) {
  const parts = relPath.split('/');
  if (parts[0] === 'generated') return 'API Reference';
  if (parts[0] === 'API') return parts.length > 1 ? `API / ${parts[1]}` : 'API';
  if (parts[0] === 'guides') return 'Guides';
  return 'General';
}

// ── Index Builder ────────────────────────────────────────────────────────────

/**
 * Parse a markdown file and return search entries.
 *
 * Each entry has: { id, title, category, signature, content, docId, anchor }
 */
export function indexMarkdownFile(fullPath, docsDir = DOCS_DIR) {
  const relPath = relative(docsDir, fullPath);
  const raw = readFileSync(fullPath, 'utf-8');
  const category = categoryFromPath(relPath);
  const docId = relPath.replace(/\.md$/, '');

  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : basename(fullPath, '.md');

  const searchEntries = [];
  const lines = raw.split('\n');
  let currentHeading = title;
  let currentAnchor = slugify(title);
  let currentContent = [];
  let currentSignature = '';

  function flush() {
    if (currentContent.length > 0) {
      const content = currentContent.join(' ').replace(/\s+/g, ' ').trim();
      if (content.length > 10) {
        searchEntries.push({
          id: `${docId}#${currentAnchor}`,
          title: currentHeading,
          category,
          signature: currentSignature,
          content: content.slice(0, 300),
          docId,
          anchor: currentAnchor,
        });
      }
    }
    currentContent = [];
    currentSignature = '';
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2].replace(/`/g, '');
      currentAnchor = slugify(headingMatch[2]);
    } else if (line.startsWith('```')) {
      // skip code fences
    } else if (line.match(/^\w+.*\(.*\)/) && !currentSignature) {
      currentSignature = line.trim();
      currentContent.push(line);
    } else if (line.match(/^-\s+`\w+\(/)) {
      // list-item API entries like "- `pocket()` — description"
      // Each one becomes its own search entry so individual methods are findable.
      flush();
      const sigMatch = line.match(/^-\s+`([^`]+)`/);
      if (sigMatch) currentSignature = sigMatch[1];
      const clean = line
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#*_`\[\]]/g, '')
        .replace(/^-\s*/, '')
        .trim();
      if (clean) currentContent.push(clean);
    } else {
      const clean = line
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#*_`\[\]]/g, '')
        .trim();
      if (clean) currentContent.push(clean);
    }
  }
  flush();

  return searchEntries;
}

/**
 * Build the full search index from all markdown files in docsDir.
 */
export function buildSearchIndex(docsDir = DOCS_DIR) {
  const allEntries = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (extname(entry.name) === '.md') {
        allEntries.push(...indexMarkdownFile(full, docsDir));
      }
    }
  }

  walk(docsDir);
  return allEntries;
}

/**
 * Simple substring search over the index (no Fuse.js needed).
 * Returns entries where query appears in signature, title, or content.
 */
export function searchIndex(entries, query) {
  const q = query.toLowerCase();
  return entries.filter(
    (e) =>
      (e.signature || '').toLowerCase().includes(q) ||
      e.title.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q),
  );
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && new URL(process.argv[1], 'file://').pathname === new URL(import.meta.url).pathname;

if (isMain) {
  const args = process.argv.slice(2);
  const queryIdx = args.indexOf('--query');
  const assertMode = args.includes('--assert');
  const statsMode = args.includes('--stats');

  const entries = buildSearchIndex();

  if (queryIdx !== -1 && args[queryIdx + 1]) {
    const query = args[queryIdx + 1];
    const results = searchIndex(entries, query);
    console.log(`Search "${query}": ${results.length} results (of ${entries.length} total)`);
    for (const r of results.slice(0, 20)) {
      console.log(`  ${r.docId} > ${r.title}${r.signature ? ` [${r.signature}]` : ''}`);
    }
    if (assertMode && results.length === 0) {
      console.error(`FAIL: no results for "${query}"`);
      process.exit(1);
    }
  } else if (statsMode) {
    console.log(`Total search entries: ${entries.length}`);
    const bySig = entries.filter((e) => e.signature);
    console.log(`Entries with signatures: ${bySig.length}`);
    const byDoc = {};
    for (const e of entries) {
      byDoc[e.docId] = (byDoc[e.docId] || 0) + 1;
    }
    const sorted = Object.entries(byDoc).sort((a, b) => b[1] - a[1]);
    console.log('Top docs by entry count:');
    for (const [doc, count] of sorted.slice(0, 15)) {
      console.log(`  ${count.toString().padStart(4)} ${doc}`);
    }
  } else {
    // Dump full index as JSON
    console.log(JSON.stringify(entries, null, 2));
  }
}

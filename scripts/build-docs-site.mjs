#!/usr/bin/env node
/**
 * build-docs-site.mjs — Generate a static documentation website from docs/permanent/
 *
 * Reads all markdown, converts to HTML, builds a Fuse.js search index,
 * and outputs a self-contained SPA to docs-web/.
 *
 * Usage: node scripts/build-docs-site.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, basename, dirname, extname } from 'path';
import { marked } from 'marked';
import hljs from 'highlight.js';

// Configure marked to use highlight.js for code blocks via custom renderer
const renderer = new marked.Renderer();
renderer.code = function({ text, lang }) {
  let highlighted;
  if (lang && hljs.getLanguage(lang)) {
    highlighted = hljs.highlight(text, { language: lang }).value;
  } else {
    highlighted = hljs.highlightAuto(text).value;
  }
  return `<pre><code class="hljs language-${lang || ''}">${highlighted}</code></pre>`;
};
marked.use({ renderer });

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DOCS_DIR = join(ROOT, 'docs', 'permanent');
const OUT_DIR = join(ROOT, 'docs-web');

// ---------------------------------------------------------------------------
// 1. Collect all markdown files
// ---------------------------------------------------------------------------

function collectMdFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectMdFiles(full, files);
    } else if (extname(full) === '.md' && basename(full) !== 'README.md') {
      files.push(full);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// 2. Parse a markdown file into doc + search entries
// ---------------------------------------------------------------------------

/** Slugify a heading for anchor links */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`()\[\]{}]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Derive a human-readable category from the file path */
function categoryFromPath(relPath) {
  const parts = relPath.replace(/\.md$/, '').split('/');
  return parts.map(p =>
    p.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  ).join(' / ');
}

/** Derive a sort order for sidebar grouping */
const CATEGORY_ORDER = [
  'API/core', 'API/sketch', 'API/assembly', 'API/sheet-metal',
  'API/runtime', 'API/output', 'API/toolbox', 'API/generated',
  'guides', 'CLI', 'internals', 'project',
];

function sortKey(relPath) {
  for (let i = 0; i < CATEGORY_ORDER.length; i++) {
    if (relPath.startsWith(CATEGORY_ORDER[i])) return i;
  }
  return CATEGORY_ORDER.length;
}

function parseMdFile(fullPath) {
  const relPath = relative(DOCS_DIR, fullPath);
  const raw = readFileSync(fullPath, 'utf-8');
  const category = categoryFromPath(relPath);
  const docId = relPath.replace(/\.md$/, '');

  // Extract title from first heading
  const titleMatch = raw.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : basename(fullPath, '.md');

  // Convert to HTML
  const html = marked.parse(raw, { gfm: true, breaks: false });

  // Extract search entries per heading
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
      // skip code fences but capture signatures
      if (line.startsWith('```ts') || line.startsWith('```typescript')) {
        // next few lines might be a signature
      }
    } else if (line.match(/^\w+.*\(.*\)/) && !currentSignature) {
      currentSignature = line.trim();
      currentContent.push(line);
    } else {
      // strip markdown formatting for search content
      const clean = line
        .replace(/[#*_`\[\]]/g, '')
        .replace(/\(.*?\)/g, '')
        .trim();
      if (clean) currentContent.push(clean);
    }
  }
  flush();

  return { docId, relPath, title, category, html, searchEntries, sortKey: sortKey(relPath) };
}

// ---------------------------------------------------------------------------
// 3. Build the sidebar tree structure
// ---------------------------------------------------------------------------

function buildSidebarTree(docs) {
  const groups = {};
  for (const doc of docs) {
    const parts = doc.relPath.split('/');
    let groupName;
    if (parts.length === 1) {
      groupName = 'General';
    } else if (parts[0] === 'API' && parts.length >= 3) {
      groupName = `API / ${parts[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;
    } else {
      groupName = parts[0].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(doc);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 4. Generate HTML
// ---------------------------------------------------------------------------

function generateSite(docs) {
  const sorted = docs.sort((a, b) => a.sortKey - b.sortKey || a.relPath.localeCompare(b.relPath));
  const sidebarTree = buildSidebarTree(sorted);
  const allSearchEntries = sorted.flatMap(d => d.searchEntries);

  // Build doc pages data
  const pagesJson = JSON.stringify(sorted.map(d => ({
    id: d.docId,
    title: d.title,
    html: d.html,
  })));

  const searchJson = JSON.stringify(allSearchEntries);

  // Build sidebar HTML
  let sidebarHtml = '';
  for (const [group, groupDocs] of Object.entries(sidebarTree)) {
    sidebarHtml += `<div class="sidebar-group">`;
    sidebarHtml += `<div class="sidebar-group-title">${escapeHtml(group)}</div>`;
    for (const doc of groupDocs) {
      sidebarHtml += `<a class="sidebar-link" href="#" data-doc="${escapeHtml(doc.docId)}">${escapeHtml(doc.title)}</a>`;
    }
    sidebarHtml += `</div>`;
  }

  // Fuse.js from node_modules — inline the UMD build
  const fusePath = join(ROOT, 'node_modules', 'fuse.js', 'dist', 'fuse.min.js');
  const fuseJs = readFileSync(fusePath, 'utf-8');

  // highlight.js theme CSS — scope dark/light by data-theme attribute
  const hljsDarkCss = readFileSync(join(ROOT, 'node_modules/highlight.js/styles/tokyo-night-dark.min.css'), 'utf-8');
  const hljsLightCss = readFileSync(join(ROOT, 'node_modules/highlight.js/styles/tokyo-night-light.min.css'), 'utf-8');

  // Extract only the color rules (skip base layout and background — we handle those ourselves)
  function scopeHljsTheme(css, themeAttr) {
    // Remove the base layout rules (pre code.hljs{...}code.hljs{...})
    let colorRules = css.replace(/^pre code\.hljs\{[^}]*\}code\.hljs\{[^}]*\}/, '');
    // Remove the .hljs{background:...;color:...} rule — our own pre/code styles handle bg
    colorRules = colorRules.replace(/\.hljs\{background:#[0-9a-f]+;color:#[0-9a-f]+\}/, '');
    // Scope .hljs selectors under [data-theme="..."]
    return colorRules.replace(/\.hljs/g, `[data-theme="${themeAttr}"] .hljs`);
  }
  const hljsScopedCss = scopeHljsTheme(hljsDarkCss, 'dark') + '\n' + scopeHljsTheme(hljsLightCss, 'light');

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ForgeCAD Docs</title>
<style>
${getStyles()}
${hljsScopedCss}
</style>
</head>
<body>
  <!-- Search overlay -->
  <div id="search-overlay" class="search-overlay hidden">
    <div class="search-modal">
      <div class="search-input-wrap">
        <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input id="search-input" type="text" placeholder="Search docs... (type to filter)" autocomplete="off" spellcheck="false">
        <kbd class="search-hint">esc</kbd>
      </div>
      <div id="search-results" class="search-results"></div>
      <div class="search-footer">
        <span><kbd>↑↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  </div>

  <!-- Layout -->
  <div class="layout">
    <nav id="sidebar" class="sidebar">
      <div class="sidebar-header">
        <span class="logo">ForgeCAD</span>
        <span class="logo-sub">Docs</span>
        <button id="theme-toggle" class="theme-toggle" title="Toggle light/dark theme" aria-label="Toggle theme"></button>
      </div>
      <button id="search-trigger" class="search-trigger">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <span>Search docs...</span>
        <kbd>/</kbd>
      </button>
      <div class="sidebar-nav">
        ${sidebarHtml}
      </div>
    </nav>

    <main id="content" class="content">
      <div id="doc-content" class="doc-content">
        <div class="welcome">
          <h1>ForgeCAD Documentation</h1>
          <p>Press <kbd>/</kbd> to search, or browse the sidebar.</p>
          <div class="quick-links">
            <a href="#" data-doc="API/core/reference" class="quick-link">Getting Started</a>
            <a href="#" data-doc="API/generated/api-reference" class="quick-link">API Reference</a>
            <a href="#" data-doc="guides/modeling-recipes" class="quick-link">Recipes</a>
            <a href="#" data-doc="API/sketch/core" class="quick-link">Sketches</a>
          </div>
        </div>
      </div>
    </main>
  </div>

<script>
${fuseJs}
</script>
<script>
${getAppJs()}
</script>
<script>
// Initialize with data
window.__FORGE_DOCS_INIT(${pagesJson}, ${searchJson});
</script>
</body>
</html>`;

  return html;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// 5. Styles
// ---------------------------------------------------------------------------

function getStyles() {
  return `
:root {
  --sidebar-w: 280px;
  --search-w: 600px;
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace;
  --radius: 8px;
  --radius-sm: 4px;
}

/* Dark theme (default) */
[data-theme="dark"] {
  --bg: #1a1b26;
  --bg-surface: #1f2029;
  --bg-elevated: #24253a;
  --bg-hover: #292a3d;
  --bg-active: #33345a;
  --text: #c0caf5;
  --text-muted: #7982a9;
  --text-dim: #565f89;
  --accent: #7aa2f7;
  --accent-dim: #3d59a1;
  --border: #292e42;
  --code-bg: #16161e;
  --green: #9ece6a;
  --orange: #ff9e64;
  --red: #f7768e;
  --purple: #bb9af7;
  --cyan: #7dcfff;
  --yellow: #e0af68;
}

/* Light theme */
[data-theme="light"] {
  --bg: #f8f9fc;
  --bg-surface: #ffffff;
  --bg-elevated: #f0f1f5;
  --bg-hover: #e8eaf0;
  --bg-active: #dde0ea;
  --text: #1e2030;
  --text-muted: #5b6078;
  --text-dim: #8c8fa1;
  --accent: #2e5cb8;
  --accent-dim: #a0b8e0;
  --border: #dce0e8;
  --code-bg: #eff1f5;
  --green: #40a02b;
  --orange: #d56a00;
  --red: #d20f39;
  --purple: #8839ef;
  --cyan: #0b7285;
  --yellow: #df8e1d;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  height: 100%;
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

/* Layout */
.layout {
  display: flex;
  height: 100vh;
}

/* Sidebar */
.sidebar {
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 20px 20px 12px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.logo {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
}

.logo-sub {
  font-size: 13px;
  color: var(--text-dim);
  font-weight: 400;
}

.theme-toggle {
  margin-left: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 5px 7px;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  transition: border-color 0.15s, color 0.15s;
  display: flex;
  align-items: center;
}

.theme-toggle:hover {
  border-color: var(--accent-dim);
  color: var(--text);
}

.search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 12px;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.search-trigger:hover {
  border-color: var(--accent-dim);
  color: var(--text-muted);
}

.search-trigger kbd {
  margin-left: auto;
  padding: 2px 6px;
  font-size: 11px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0 0 20px;
}

.sidebar-nav::-webkit-scrollbar { width: 4px; }
.sidebar-nav::-webkit-scrollbar-track { background: transparent; }
.sidebar-nav::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.sidebar-group { margin-bottom: 4px; }

.sidebar-group-title {
  padding: 12px 20px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
}

.sidebar-link {
  display: block;
  padding: 4px 20px 4px 28px;
  font-size: 13px;
  color: var(--text-muted);
  text-decoration: none;
  border-left: 2px solid transparent;
  transition: color 0.1s, background 0.1s, border-color 0.1s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-link:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.sidebar-link.active {
  color: var(--accent);
  border-left-color: var(--accent);
  background: var(--bg-hover);
}

/* Main content */
.content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.doc-content {
  max-width: 800px;
  margin: 0 auto;
  padding: 40px 48px 80px;
}

.welcome {
  padding-top: 120px;
  text-align: center;
}

.welcome h1 {
  font-size: 32px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}

.welcome p {
  color: var(--text-muted);
  font-size: 16px;
  margin-bottom: 32px;
}

.welcome kbd {
  padding: 3px 8px;
  font-size: 13px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  color: var(--accent);
}

.quick-links {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.quick-link {
  padding: 10px 20px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  text-decoration: none;
  font-size: 14px;
  transition: border-color 0.15s, background 0.15s;
}

.quick-link:hover {
  border-color: var(--accent-dim);
  background: var(--bg-hover);
}

/* Markdown content styling */
.doc-content h1 {
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.doc-content h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  margin: 36px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.doc-content h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin: 28px 0 8px;
}

.doc-content h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  margin: 20px 0 6px;
}

.doc-content p {
  margin: 0 0 12px;
  color: var(--text);
}

.doc-content a {
  color: var(--accent);
  text-decoration: none;
}

.doc-content a:hover {
  text-decoration: underline;
}

.doc-content ul, .doc-content ol {
  margin: 0 0 12px;
  padding-left: 24px;
}

.doc-content li {
  margin-bottom: 4px;
}

.doc-content li > ul, .doc-content li > ol {
  margin-top: 4px;
  margin-bottom: 0;
}

.doc-content code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: var(--cyan);
}

.doc-content pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  overflow-x: auto;
  margin: 0 0 16px;
  line-height: 1.5;
}

.doc-content pre code {
  background: none;
  padding: 0;
  font-size: 13px;
  color: var(--text);
}

.doc-content blockquote {
  border-left: 3px solid var(--accent-dim);
  margin: 0 0 12px;
  padding: 8px 16px;
  background: var(--bg-elevated);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-muted);
}

.doc-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 16px;
  font-size: 13px;
}

.doc-content th, .doc-content td {
  padding: 8px 12px;
  border: 1px solid var(--border);
  text-align: left;
}

.doc-content th {
  background: var(--bg-elevated);
  font-weight: 600;
  color: var(--text);
}

.doc-content td {
  color: var(--text-muted);
}

.doc-content hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 24px 0;
}

.doc-content strong { color: var(--text); }

.doc-content img {
  max-width: 100%;
  border-radius: var(--radius);
}

/* Search overlay */
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: min(20vh, 160px);
}

.search-overlay.hidden { display: none; }

.search-modal {
  width: var(--search-w);
  max-width: calc(100vw - 32px);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 24px 48px rgba(0,0,0,0.4);
  overflow: hidden;
}

.search-input-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.search-icon { color: var(--text-dim); flex-shrink: 0; }

#search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-size: 16px;
  font-family: var(--font);
  color: var(--text);
}

#search-input::placeholder { color: var(--text-dim); }

.search-hint {
  padding: 2px 6px;
  font-size: 11px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
}

.search-results::-webkit-scrollbar { width: 4px; }
.search-results::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.search-result {
  display: block;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background 0.08s;
}

.search-result:last-child { border-bottom: none; }

.search-result:hover, .search-result.selected {
  background: var(--bg-hover);
}

.search-result.selected {
  background: var(--bg-active);
}

.search-result-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.search-result-title .match {
  color: var(--accent);
  font-weight: 700;
}

.search-result-category {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 2px;
}

.search-result-snippet {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-dim);
  font-size: 14px;
}

.search-footer {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
}

.search-footer kbd {
  padding: 1px 5px;
  font-size: 11px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 3px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

/* Scroll-to highlight */
.highlight-target {
  animation: flash 1.5s ease-out;
}

@keyframes flash {
  0% { background: var(--bg-active); }
  100% { background: transparent; }
}

/* Responsive */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .doc-content { padding: 20px 16px 60px; }
}
`;
}

// ---------------------------------------------------------------------------
// 6. Application JavaScript
// ---------------------------------------------------------------------------

function getAppJs() {
  return `
(function() {
  'use strict';

  // -----------------------------------------------------------------------
  // Theme toggle
  // -----------------------------------------------------------------------

  const themeToggle = document.getElementById('theme-toggle');
  const THEME_KEY = 'forgecad-docs-theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggle.textContent = theme === 'dark' ? '\\u2600' : '\\u263E';
    themeToggle.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }

  // Restore saved preference or use system preference
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    applyTheme('light');
  } else {
    applyTheme('dark');
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  });

  let pages = [];
  let searchEntries = [];
  let fuse = null;
  let selectedIndex = -1;
  let currentDocId = null;

  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const content = document.getElementById('doc-content');
  const contentScroller = document.getElementById('content');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const searchTrigger = document.getElementById('search-trigger');

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------

  window.__FORGE_DOCS_INIT = function(p, s) {
    pages = p;
    searchEntries = s;
    fuse = new Fuse(searchEntries, {
      keys: [
        { name: 'title', weight: 0.45 },
        { name: 'signature', weight: 0.25 },
        { name: 'category', weight: 0.15 },
        { name: 'content', weight: 0.15 },
      ],
      threshold: 0.35,
      distance: 100,
      includeMatches: true,
      minMatchCharLength: 1,
      ignoreLocation: true,
    });

    // Wire up sidebar links
    sidebarLinks.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigateTo(link.dataset.doc);
      });
    });

    // Wire up quick links
    document.querySelectorAll('.quick-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navigateTo(link.dataset.doc);
      });
    });

    // Handle hash on load
    if (location.hash) {
      const [docId, anchor] = location.hash.slice(1).split('::');
      if (docId) navigateTo(docId, anchor);
    }
  };

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  function navigateTo(docId, anchor) {
    const page = pages.find(p => p.id === docId);
    if (!page) return;

    currentDocId = docId;
    content.innerHTML = page.html;
    contentScroller.scrollTop = 0;

    // Update sidebar
    sidebarLinks.forEach(l => {
      l.classList.toggle('active', l.dataset.doc === docId);
    });

    // Scroll sidebar active link into view
    const active = document.querySelector('.sidebar-link.active');
    if (active) active.scrollIntoView({ block: 'nearest' });

    // Update URL
    history.replaceState(null, '', '#' + docId + (anchor ? '::' + anchor : ''));

    // Scroll to anchor
    if (anchor) {
      requestAnimationFrame(() => {
        const target = content.querySelector('#' + CSS.escape(anchor))
          || content.querySelector('[id="' + anchor + '"]');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.classList.add('highlight-target');
        }
      });
    }

    // Make internal doc links navigable
    content.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('#')) {
        a.addEventListener('click', e => {
          e.preventDefault();
          // Resolve relative path
          const resolved = resolveDocLink(docId, href);
          if (resolved) navigateTo(resolved.docId, resolved.anchor);
        });
      }
    });
  }

  function resolveDocLink(fromDocId, href) {
    // Handle ../foo/bar.md, ./foo.md, foo.md style links
    const [pathPart, anchorPart] = href.split('#');
    const cleanPath = pathPart.replace(/\\.md$/, '');
    if (!cleanPath) return { docId: fromDocId, anchor: anchorPart };

    // Resolve relative to current doc's directory
    const fromDir = fromDocId.includes('/') ? fromDocId.substring(0, fromDocId.lastIndexOf('/')) : '';
    const parts = (fromDir ? fromDir + '/' + cleanPath : cleanPath).split('/');
    const resolved = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p !== '.') resolved.push(p);
    }
    const resolvedId = resolved.join('/');
    const found = pages.find(p => p.id === resolvedId);
    return found ? { docId: resolvedId, anchor: anchorPart } : null;
  }

  // -----------------------------------------------------------------------
  // Search
  // -----------------------------------------------------------------------

  function openSearch() {
    overlay.classList.remove('hidden');
    input.value = '';
    input.focus();
    selectedIndex = -1;
    results.innerHTML = renderRecentOrAll();
  }

  function closeSearch() {
    overlay.classList.add('hidden');
    input.blur();
    selectedIndex = -1;
  }

  function renderRecentOrAll() {
    // Show first N entries as "browse all"
    const items = searchEntries.slice(0, 12);
    return items.map((item, i) => renderResultItem(item, i, null)).join('');
  }

  function renderResultItem(item, index, matches) {
    const title = matches
      ? highlightMatches(item.title, matches.find(m => m.key === 'title'))
      : escapeHtml(item.title);
    return '<div class="search-result' + (index === selectedIndex ? ' selected' : '') + '" data-index="' + index + '" data-doc="' + escapeHtml(item.docId) + '" data-anchor="' + escapeHtml(item.anchor || '') + '">'
      + '<div class="search-result-title">' + title + '</div>'
      + '<div class="search-result-category">' + escapeHtml(item.category) + '</div>'
      + (item.content ? '<div class="search-result-snippet">' + escapeHtml(item.content.slice(0, 120)) + '</div>' : '')
      + '</div>';
  }

  function highlightMatches(text, match) {
    if (!match || !match.indices) return escapeHtml(text);
    let result = '';
    let last = 0;
    const sorted = [...match.indices].sort((a, b) => a[0] - b[0]);
    for (const [start, end] of sorted) {
      result += escapeHtml(text.slice(last, start));
      result += '<span class="match">' + escapeHtml(text.slice(start, end + 1)) + '</span>';
      last = end + 1;
    }
    result += escapeHtml(text.slice(last));
    return result;
  }

  function doSearch(query) {
    if (!query.trim()) {
      selectedIndex = -1;
      results.innerHTML = renderRecentOrAll();
      return;
    }

    const hits = fuse.search(query, { limit: 20 });
    selectedIndex = hits.length > 0 ? 0 : -1;

    if (hits.length === 0) {
      results.innerHTML = '<div class="search-empty">No results for "' + escapeHtml(query) + '"</div>';
      return;
    }

    results.innerHTML = hits.map((hit, i) =>
      renderResultItem(hit.item, i, hit.matches)
    ).join('');
    updateSelected();
  }

  function updateSelected() {
    const items = results.querySelectorAll('.search-result');
    items.forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIndex);
      if (i === selectedIndex) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function selectResult() {
    const items = results.querySelectorAll('.search-result');
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      const el = items[selectedIndex];
      closeSearch();
      navigateTo(el.dataset.doc, el.dataset.anchor);
    }
  }

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  // Search trigger button
  searchTrigger.addEventListener('click', openSearch);

  // Overlay backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeSearch();
  });

  // Search input
  input.addEventListener('input', () => doSearch(input.value));

  input.addEventListener('keydown', e => {
    const items = results.querySelectorAll('.search-result');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectResult();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    }
  });

  // Click on search results
  results.addEventListener('click', e => {
    const item = e.target.closest('.search-result');
    if (item) {
      selectedIndex = parseInt(item.dataset.index, 10);
      selectResult();
    }
  });

  // Global keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Don't trigger if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      openSearch();
    }

    // [ and ] for prev/next doc
    if (e.key === '[' || e.key === ']') {
      e.preventDefault();
      const allDocs = Array.from(sidebarLinks).map(l => l.dataset.doc);
      const idx = allDocs.indexOf(currentDocId);
      if (idx === -1) return;
      const next = e.key === ']' ? idx + 1 : idx - 1;
      if (next >= 0 && next < allDocs.length) navigateTo(allDocs[next]);
    }
  });
})();
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const files = collectMdFiles(DOCS_DIR);
console.log(`Found ${files.length} markdown files in docs/permanent/`);

const docs = files.map(f => parseMdFile(f));
const totalEntries = docs.reduce((n, d) => n + d.searchEntries.length, 0);
console.log(`Generated ${totalEntries} search entries`);

mkdirSync(OUT_DIR, { recursive: true });

const html = generateSite(docs);
writeFileSync(join(OUT_DIR, 'index.html'), html, 'utf-8');

console.log(`Wrote docs-web/index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
console.log('Done! Open docs-web/index.html in a browser.');

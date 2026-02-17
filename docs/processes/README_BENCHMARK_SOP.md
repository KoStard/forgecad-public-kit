# README Benchmark Maintenance SOP

This SOP explains how to maintain the `## LLM Benchmarks` section in `/Users/kostard/Projects/CAD/ForgeCAD/README.md` while keeping heavy media out of the main ForgeCAD Git history.

It covers:
- selecting latest benchmark iteration per run
- extracting the benchmark prompt
- generating benchmark GIFs locally
- publishing benchmark GIFs to a dedicated GitHub assets repository
- updating the README table to point at raw GitHub asset URLs
- handling failures

## Scope

Benchmark source data is read from:
- `/Users/kostard/Projects/CAD/ForgeCADBenchmark/results`

Benchmark media is published to:
- repository: `https://github.com/KoStard/ForgeCAD-assets`
- raw base URL: `https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks`

Each benchmark run folder is expected to look like:
- `{model-or-run-name}_{YYYYMMDD}_{HHMMSS}/version_{n}.forge.js`
- optional `history.json` containing `<user_message>...</user_message>`

Example:
- `qwen3.5-397b-a17b_20260216_142922/version_3.forge.js`

## Output Contract

The README benchmark section is bounded by markers and must only be edited between them:
- `<!-- BENCHMARKS:START -->`
- `<!-- BENCHMARKS:END -->`

Benchmark table GIF cells in README must reference the assets repo raw URLs, not local paths.

ForgeCAD main repo must not track benchmark GIF binaries:
- keep only `/Users/kostard/Projects/CAD/ForgeCAD/docs/attachments/benchmarks/.gitkeep`
- keep `/Users/kostard/Projects/CAD/ForgeCAD/docs/attachments/benchmarks/*.gif` ignored

Local rendering happens in:
- `/Users/kostard/Projects/CAD/ForgeCAD/tmp/benchmark-gifs/`

GIF file naming convention:
- `{runName}-{YYYY-MM-DD}-{HH-MM-SS}-v{n}.gif`

This prevents collisions across multiple runs on the same day.

## Preflight

From `/Users/kostard/Projects/CAD/ForgeCAD`:

```bash
npm install
```

Verify required local paths:

```bash
test -d /Users/kostard/Projects/CAD/ForgeCADBenchmark/results
```

Verify GitHub CLI auth:

```bash
gh auth status
```

Ensure assets repo is available locally (clone once if missing):

```bash
if [ ! -d /Users/kostard/Projects/CAD/ForgeCAD-assets/.git ]; then
  gh repo clone KoStard/ForgeCAD-assets /Users/kostard/Projects/CAD/ForgeCAD-assets
fi
```

Optional: quick list of benchmark runs:

```bash
find /Users/kostard/Projects/CAD/ForgeCADBenchmark/results -mindepth 1 -maxdepth 1 -type d | sort
```

## Standard Update Procedure

### 1. Build a manifest of benchmark rows

Run from `/Users/kostard/Projects/CAD/ForgeCAD`:

```bash
node - <<'NODE'
const fs = require('fs');
const path = require('path');

const benchmarkRoot = '/Users/kostard/Projects/CAD/ForgeCADBenchmark/results';
const repoRoot = '/Users/kostard/Projects/CAD/ForgeCAD';
const renderDir = path.join(repoRoot, 'tmp/benchmark-gifs');
const manifestPath = path.join(repoRoot, 'tmp/benchmark-manifest.json');
const assetsRawBase = 'https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks';

const dateRegex = /^(.*)_(\d{8})_(\d{6})$/;
const versionRegex = /^version_(\d+)\.forge\.js$/;

const normalizePrompt = (text) => text.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
const fileSafe = (text) => text.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

const extractPrompt = (historyPath) => {
  if (!fs.existsSync(historyPath)) return '';
  const raw = fs.readFileSync(historyPath, 'utf8');

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const m = raw.match(/<user_message>([\s\S]*?)<\/user_message>/);
    return m ? normalizePrompt(m[1]) : '';
  }

  const prompts = [];
  const queue = [data];
  const re = /<user_message>([\s\S]*?)<\/user_message>/g;

  while (queue.length) {
    const cur = queue.pop();
    if (typeof cur === 'string') {
      let m;
      while ((m = re.exec(cur)) !== null) {
        const prompt = normalizePrompt(m[1]);
        if (prompt) prompts.push(prompt);
      }
      continue;
    }
    if (Array.isArray(cur)) {
      for (const item of cur) queue.push(item);
      continue;
    }
    if (cur && typeof cur === 'object') {
      for (const value of Object.values(cur)) queue.push(value);
    }
  }

  return prompts[0] || '';
};

fs.mkdirSync(path.join(repoRoot, 'tmp'), { recursive: true });
fs.mkdirSync(renderDir, { recursive: true });

const rows = [];
const dirs = fs.readdirSync(benchmarkRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const dirName of dirs) {
  const dirPath = path.join(benchmarkRoot, dirName);
  const versions = fs.readdirSync(dirPath).filter((f) => versionRegex.test(f));
  if (!versions.length) continue;

  const latest = versions
    .map((f) => ({ file: f, n: Number(f.match(versionRegex)[1]) }))
    .sort((a, b) => b.n - a.n)[0];

  const parsed = dirName.match(dateRegex);
  const runName = parsed ? parsed[1] : dirName;
  const dateCompact = parsed ? parsed[2] : 'unknown';
  const timeCompact = parsed ? parsed[3] : '000000';
  const date = /^\d{8}$/.test(dateCompact) ? `${dateCompact.slice(0,4)}-${dateCompact.slice(4,6)}-${dateCompact.slice(6,8)}` : dateCompact;
  const time = /^\d{6}$/.test(timeCompact) ? `${timeCompact.slice(0,2)}-${timeCompact.slice(2,4)}-${timeCompact.slice(4,6)}` : timeCompact;

  const gifName = `${fileSafe(runName)}-${date}-${time}-v${latest.n}.gif`;

  rows.push({
    dirName,
    modelName: runName,
    date,
    time,
    version: latest.n,
    scriptPath: path.join(dirPath, latest.file),
    prompt: extractPrompt(path.join(dirPath, 'history.json')),
    assetFileName: gifName,
    gifRenderAbsolutePath: path.join(renderDir, gifName),
    assetRawUrl: `${assetsRawBase}/${gifName}`,
  });
}

const manifest = {
  generatedAt: new Date().toISOString(),
  benchmarkRoot,
  assetsRawBase,
  rowCount: rows.length,
  rows,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`Manifest rows: ${rows.length}`);
console.log(`Manifest: ${manifestPath}`);
NODE
```

### 2. Generate GIFs locally for each manifest row

```bash
node - <<'NODE'
const fs = require('fs');
const { spawnSync } = require('child_process');

const repoRoot = '/Users/kostard/Projects/CAD/ForgeCAD';
const manifest = JSON.parse(fs.readFileSync(`${repoRoot}/tmp/benchmark-manifest.json`, 'utf8'));

const failures = [];
let i = 0;
for (const row of manifest.rows) {
  i += 1;
  if (fs.existsSync(row.gifRenderAbsolutePath)) {
    console.log(`[${i}/${manifest.rows.length}] SKIP existing ${row.modelName} ${row.date} ${row.time}`);
    continue;
  }

  console.log(`[${i}/${manifest.rows.length}] RENDER ${row.modelName} ${row.date} ${row.time} v${row.version}`);
  const result = spawnSync('npm', ['run', 'gif', '--', row.scriptPath, row.gifRenderAbsolutePath], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    failures.push(`${row.dirName} (status=${result.status})`);
  }
}

if (failures.length) {
  console.error('Failed renders:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log('All renders completed.');
NODE
```

### 3. Copy renders to `ForgeCAD-assets` and push

Copy rendered GIFs into the assets repo:

```bash
node - <<'NODE'
const fs = require('fs');
const path = require('path');

const manifestPath = '/Users/kostard/Projects/CAD/ForgeCAD/tmp/benchmark-manifest.json';
const assetsRepoRoot = '/Users/kostard/Projects/CAD/ForgeCAD-assets';
const assetsBenchDir = path.join(assetsRepoRoot, 'benchmarks');

if (!fs.existsSync(path.join(assetsRepoRoot, '.git'))) {
  throw new Error(`Missing assets repo at ${assetsRepoRoot}. Clone it first.`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
fs.mkdirSync(assetsBenchDir, { recursive: true });

for (const row of manifest.rows) {
  if (!fs.existsSync(row.gifRenderAbsolutePath)) {
    throw new Error(`Missing rendered GIF: ${row.gifRenderAbsolutePath}`);
  }
  fs.copyFileSync(row.gifRenderAbsolutePath, path.join(assetsBenchDir, row.assetFileName));
}

console.log(`Copied ${manifest.rows.length} benchmark GIFs to ${assetsBenchDir}`);
NODE
```

Commit and push in assets repo:

```bash
cd /Users/kostard/Projects/CAD/ForgeCAD-assets
git add benchmarks
if ! git diff --cached --quiet; then
  git commit -m "Update benchmark GIF assets"
  git push origin main
else
  echo "No benchmark asset changes to push."
fi
```

### 4. Update the README table from the manifest

```bash
node - <<'NODE'
const fs = require('fs');

const repoRoot = '/Users/kostard/Projects/CAD/ForgeCAD';
const readmePath = `${repoRoot}/README.md`;
const manifestPath = `${repoRoot}/tmp/benchmark-manifest.json`;

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const readme = fs.readFileSync(readmePath, 'utf8');

const escapeCell = (text) => text.replace(/\|/g, '\\|').replace(/\r\n?/g, ' ').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

const rows = manifest.rows
  .slice()
  .sort((a, b) => a.dirName.localeCompare(b.dirName))
  .map((row) => {
    const modelCell = `\`${escapeCell(row.modelName)}\`<br><sub>${row.date} ${row.time} • v${row.version}</sub>`;
    const promptCell = row.prompt ? escapeCell(row.prompt) : '_No `<user_message>` found._';
    const gifCell = fs.existsSync(row.gifRenderAbsolutePath)
      ? `![${escapeCell(row.modelName)}](${row.assetRawUrl})`
      : '_GIF generation failed (script runtime error)._';
    return `| ${modelCell} | ${promptCell} | ${gifCell} |`;
  });

const section = [
  '## LLM Benchmarks',
  '',
  'Latest benchmark iterations from `ForgeCADBenchmark/results/*` (`version_{n}.forge.js` with highest `n` per run folder).',
  '',
  '| model name | prompt | GIF |',
  '| --- | --- | --- |',
  ...rows,
  '',
].join('\n');

const start = '<!-- BENCHMARKS:START -->';
const end = '<!-- BENCHMARKS:END -->';
const markerRegex = new RegExp(`${start}[\\s\\S]*?${end}`, 'm');

if (!readme.includes(start) || !readme.includes(end)) {
  throw new Error('README benchmark markers not found');
}

const next = readme.replace(markerRegex, `${start}\n${section}${end}`);
fs.writeFileSync(readmePath, next, 'utf8');
console.log('README benchmark section updated.');
NODE
```

### 5. Validate

```bash
# Count table rows in benchmark section (should match manifest rowCount)
node - <<'NODE'
const fs = require('fs');
const readme = fs.readFileSync('/Users/kostard/Projects/CAD/ForgeCAD/README.md', 'utf8');
const m = readme.match(/<!-- BENCHMARKS:START -->([\s\S]*?)<!-- BENCHMARKS:END -->/);
const lines = (m ? m[1] : '').split('\n').filter((line) => /^\| `/.test(line));
console.log(`README benchmark rows: ${lines.length}`);
NODE

# Ensure benchmark URLs point to the assets repo
rg -n 'raw\.githubusercontent\.com/KoStard/ForgeCAD-assets/main/benchmarks/.*\.gif' /Users/kostard/Projects/CAD/ForgeCAD/README.md | wc -l

# Ensure no local benchmark GIF paths are used in README
if rg -n 'docs/attachments/benchmarks/.*\.gif' /Users/kostard/Projects/CAD/ForgeCAD/README.md; then
  echo "Found forbidden local benchmark GIF links in README"
  exit 1
fi

# Ensure ForgeCAD does not track benchmark GIF binaries
git -C /Users/kostard/Projects/CAD/ForgeCAD ls-files 'docs/attachments/benchmarks/*.gif'

# Review working tree
git -C /Users/kostard/Projects/CAD/ForgeCAD status --short
git -C /Users/kostard/Projects/CAD/ForgeCAD-assets status --short
```

### 6. Commit in ForgeCAD main repo

Step 3 already handles commit/push in `/Users/kostard/Projects/CAD/ForgeCAD-assets`.

Commit README and process documentation changes in the main ForgeCAD repository:

```bash
cd /Users/kostard/Projects/CAD/ForgeCAD
git add README.md docs/processes/README_BENCHMARK_SOP.md
git commit -m "Document benchmark assets repo workflow"
```

## Adding New Benchmarks

To add a new benchmark run into README:

1. Add run folder(s) in `/Users/kostard/Projects/CAD/ForgeCADBenchmark/results` using:
   - `{model-or-run-name}_{YYYYMMDD}_{HHMMSS}`
2. Ensure at least one `version_{n}.forge.js` exists.
3. Ensure `history.json` contains `<user_message>...</user_message>` if prompt attribution is needed.
4. Re-run the Standard Update Procedure.

No manual benchmark table edits are required. New runs are picked up automatically.

## Updating Existing Benchmark Runs

If you add a higher iteration in an existing run folder (for example `version_4.forge.js` after `version_3`):

1. Add the new file to the same run folder.
2. Re-run the Standard Update Procedure.
3. The README row updates to the newest `v{n}` automatically.

## Failure Policy

If a benchmark script fails GIF generation:

- keep its row in README
- keep model and prompt columns populated
- set GIF cell to:
  - `_GIF generation failed (script runtime error)._`

Do not drop failed rows. The table should represent benchmark coverage, not only successful renders.

## Troubleshooting

### `gh` auth or repo access issues

Check auth:

```bash
gh auth status
```

Re-auth if needed:

```bash
gh auth login
```

### Chrome/Chromium not found

Set:

```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Then rerun Step 2.

### Port collisions during GIF rendering

`npm run gif` may try to use a busy port.

Set an alternate port:

```bash
export FORGE_PORT=5181
```

Then rerun Step 2.

### Missing prompt text

If prompt extraction returns empty:

- verify `history.json` exists in the run folder
- verify `<user_message>...</user_message>` appears in that file
- if absent, keep fallback text `_No <user_message> found._`

## Cleanup (optional)

Temporary files created by this SOP:
- `/Users/kostard/Projects/CAD/ForgeCAD/tmp/benchmark-manifest.json`
- `/Users/kostard/Projects/CAD/ForgeCAD/tmp/benchmark-gifs/`

Optional cleanup:

```bash
rm -f /Users/kostard/Projects/CAD/ForgeCAD/tmp/benchmark-manifest.json
rm -rf /Users/kostard/Projects/CAD/ForgeCAD/tmp/benchmark-gifs
```

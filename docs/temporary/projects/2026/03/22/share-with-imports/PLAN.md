# Share Button with Imports — Investigation

## Goal & Current State

**Goal**: Make the Share button work for files that use imports (`importPart`, `importSketch`, `importAssembly`, `importGroup`, `require`, ES `import`) and mesh imports (`importMesh`).

**Current state**: The Share button encodes only the **active file's code** into the URL via LZ-string compression (`#code/<filename>/<compressed>`). If the shared file imports other files, the recipient gets a `File not found` error because those dependencies aren't included.

### Problem Categories

1. **Code imports** (`importPart`, `importSketch`, `importAssembly`, `importGroup`, `require`, ES `import`) — reference other `.forge.js`/`.js` files that contain code
2. **SVG imports** (`importSketch("file.svg")`) — reference SVG files parsed at runtime
3. **Mesh imports** (`importMesh("file.stl")`) — reference binary files (STL/OBJ/3MF) that can be megabytes

## Architecture Summary

### Share flow
- `src/share.ts`: `buildShareUrl(filename, code)` → `encodeSharedModel(filename, code)` → LZ-string compress → `#code/<filename>/<compressed>`
- `src/App.tsx`: `ShareButton` component reads active file code, calls `buildShareUrl`, copies to clipboard
- `src/store/forgeStore.ts`: On load, `decodeSharedHash(hash)` → injects single file into `INITIAL_FILES`

### Import resolution
- `src/forge/runner.ts`: `resolveImportSource(fromFile, requestedName, allFiles, options)` looks up files in `allFiles` (the in-memory file map)
- `allFiles` is passed from the eval worker, which gets it from the file system/store
- Mesh imports use `readBinaryFile()` callback that fetches from the server via sync XHR

### Size constraints
- Share URL warns at 8KB, gist recommended for larger
- Browser URL limits: ~2000-8000 chars depending on browser/service
- Gist alternative already exists for large content

## Approach Options

### Option A: Bundle all dependencies into the share URL

**For code imports**: Statically analyze the file to find all `importPart("...")`, `importSketch("...")`, etc. calls. Recursively resolve all dependencies. Encode a multi-file bundle (JSON map of `{filename: code}`) into the URL.

- **Pros**: Fully self-contained, works offline
- **Cons**: URL gets large fast, may exceed browser limits for complex projects
- **Format**: `#bundle/<compressed-json>` where JSON = `{entry: string, files: Record<string, string>}`

### Option B: Inline imports at share time

Flatten all imports into a single file by inlining the code. Replace `importPart("foo.forge.js")` with the actual `foo.forge.js` execution.

- **Pros**: Single file, simpler URL format
- **Cons**: Semantics change (name scoping, param overrides break), very complex to implement correctly

### Option C: Multi-file gist auto-creation

When sharing a file with imports, auto-create a GitHub Gist with all required files and share the `?gist=<id>` URL instead.

- **Pros**: No size limit, handles binary meshes via gist files
- **Cons**: Requires GitHub auth, gist is public, adds external dependency

### Option D: Hybrid — bundle code imports, warn/skip meshes

Bundle code dependencies into the URL (Option A). For mesh imports, either:
- Skip them with a warning
- Use a known hosted URL for common assets
- Encode small meshes as base64 in the bundle

**This is the recommended approach.**

## For Mesh Imports Specifically

Mesh files are binary and can be large. Options:
1. **Skip with warning**: "This model uses mesh imports that can't be shared via URL"
2. **Host common assets**: Keep `assets/` on GitHub Pages, mesh imports resolve against the hosted URL
3. **Base64 inline**: For small meshes (<50KB), encode as base64 in the bundle — runner would need to support `data:` URIs
4. **Gist fallback**: Auto-create gist when meshes are present

The practical solution is (2): assets already deployed to GitHub Pages are accessible. The share URL just needs the code — mesh imports resolve against the hosted server.

## Progress Tracker

| # | Experiment | Result | Status |
|---|-----------|--------|--------|
| — | Baseline | Share encodes 1 file, imports break | ✅ Confirmed |
| E1 | Static import analysis | Extracts all 6 import types + require + ES import | ✅ |
| E2 | Multi-file bundle encoding | `#bundle/<lz-json>` format, round-trip verified | ✅ |
| E3 | ShareButton bundling | Auto-detects imports, bundles deps, warns on meshes | ✅ |
| E4 | Bundle loading on startup | `decodeSharedBundle` + inject into INITIAL_FILES | ✅ |
| E5 | Mesh import handling | Toast warning — meshes resolve from hosted server | ✅ |

### Size measurements (real examples)

| Example | Single file URL | Bundle URL | Overhead |
|---------|----------------|------------|----------|
| table-lamp.forge.js (1 import) | 1,118 chars | 1,646 chars | +528 (47%) |

## Experiment Log

#### E1: Static import analysis (SUCCESS)
**What**: Created `src/importAnalysis.ts` with regex-based extraction for all import patterns.
**Result**: Correctly extracts `importPart`, `importSketch`, `importAssembly`, `importGroup`, `importMesh`, `importSvgSketch`, `require()`, and ES `import ... from`. Recursively collects dependency trees. Separates mesh files (binary, can't bundle) from code files.
**Why it worked**: Regex-based static analysis is sufficient because ForgeCAD import calls use string literals, not computed paths.
**Lesson**: Virtual modules (`forgecad`, `@forge/runtime`) must be excluded from the dependency tree.

#### E2: Multi-file bundle encoding (SUCCESS)
**What**: Added `#bundle/<compressed-json>` format to `src/share.ts`. JSON shape: `{entry: string, files: Record<string, string>}`.
**Result**: Round-trip encode/decode works. LZ-string compression keeps bundles compact. 47% overhead for a 2-file bundle vs single file (due to JSON structure + second file content).
**Why it worked**: LZ-string handles JSON well, and the JSON structure is minimal.

#### E3-E4: ShareButton + forgeStore integration (SUCCESS)
**What**: ShareButton now calls `collectDependencies()` when the active file has imports, and uses `buildBundleShareUrl()`. `forgeStore` decodes `#bundle/...` URLs and injects all files into `INITIAL_FILES`.
**Result**: Seamless — single-file models still use the compact `#code/` format, multi-file models auto-bundle.

#### E5: Mesh import handling (SUCCESS)
**What**: Mesh files are detected but excluded from bundles. A toast notification warns users. Assets on GitHub Pages resolve naturally since the production URL points to the hosted server.
**Result**: Meshes from `assets/` work when shared because they're served from the same origin.
**Lesson**: For user-uploaded meshes, the gist approach is needed. Future work could support base64 encoding for small meshes (<50KB).

## Files Modified

| File | Purpose |
|------|---------|
| `src/importAnalysis.ts` | **NEW** — Static import analysis, dependency collection |
| `src/share.ts` | Added `SharedBundle` type, `encodeSharedBundle`, `decodeSharedBundle`, `buildBundleShareUrl`, `buildBundleEmbedUrl` |
| `src/App.tsx` | ShareButton auto-detects imports, bundles deps, warns on mesh imports |
| `src/store/forgeStore.ts` | Handles `#bundle/...` URLs on startup, injects all bundle files |

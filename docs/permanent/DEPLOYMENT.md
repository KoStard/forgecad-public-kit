# GitHub Pages Deployment

ForgeCAD is deployed as a static site to GitHub Pages on every push to `mainline`.

## How it works

**Workflow:** `.github/workflows/deploy-pages.yml`

1. `npm ci` — install dependencies
2. `npm run build:web` — builds everything for the web:
   - `npm run build:solver` — compiles the Rust solver to WASM via `wasm-pack` (`solver/pkg/solver_bg.wasm`)
   - `tsc` — type-check
   - `FORGE_MODE=web vite build` — bundle with base path `/ForgeCAD/`
3. Upload `dist/` and deploy to Pages

The `FORGE_MODE=web` env var tells Vite to set `base: '/ForgeCAD/'` so all asset URLs (JS, CSS, WASM) resolve correctly under the GitHub Pages subpath.

## WASM handling

The Rust solver (`solver/`) is compiled to WASM as part of the build. Two WASM files end up in `dist/assets/`:

| File | Source | Size |
|------|--------|------|
| `solver_bg-*.wasm` | Rust solver (`solver/src/`) | ~830 KB |
| `manifold-*.wasm` | manifold-3d (npm dependency) | ~445 KB |

Both are loaded in the browser via dynamic `import()` — no server-side WASM execution needed. GitHub Pages serves `.wasm` with the correct `application/wasm` MIME type natively.

## Prerequisites for CI

- Node.js 20+
- `wasm-pack` — installed via `cargo install wasm-pack` (the CI runner needs Rust toolchain)

## Local preview

```sh
npm run build:web
npx serve dist        # or any static file server
```

## Key files

| File | Role |
|------|------|
| `.github/workflows/deploy-pages.yml` | GitHub Actions workflow |
| `scripts/solver-build.mjs` | WASM build script (finds `wasm-pack`, runs it) |
| `vite.config.ts` | Base path + WASM asset config |
| `src/forge/sketch/constraints/solver-wasm.ts` | Browser-side WASM loader |

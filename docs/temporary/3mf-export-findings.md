# 3MF Export Compatibility Findings (2026-02-16)

## Summary

We hit two independent issues that produced `.3mf` files some tools could not open:

1. XML fields were not escaped.
- Object names / metadata containing `&`, `<`, `>`, or `"` generated invalid `3D/3dmodel.model`.

2. Package relationship target path was too strict for some parsers.
- `_rels/.rels` used `Target="3D/3dmodel.model"` (relative path).
- `lib3mf` rejected this with object/build resolution errors.
- Using `Target="/3D/3dmodel.model"` fixed parser compatibility.

## What We Changed

- Added XML escaping for 3MF object names and metadata before serialization.
- Normalized `_rels/.rels` after export so model relationship always points to `Target="/3D/3dmodel.model"`.
- Added Vite-side workaround for broken `manifold-3d` source-map references (dev warning noise only).

## How To Prevent Regressions

- Treat exported 3MF as a package+XML artifact, not just a blob.
- Validate with a real parser (`lib3mf`), not only unzip/XML well-formedness.
- Include special-character test cases in export QA, e.g. names/titles like `A&B "Part" <test>`.
- Keep exported metadata and object labels sanitized/escaped by default.

## Quick Validation Command

```bash
python3 - <<'PY'
import sys, lib3mf
path = sys.argv[1] if len(sys.argv) > 1 else 'model.3mf'
w = lib3mf.get_wrapper()
m = w.CreateModel()
r = m.QueryReader('3mf')
r.ReadFromFile(path)
print('READ_OK', path)
PY model.3mf
```

If this fails, inspect:
- `_rels/.rels`
- `3D/3dmodel.model`
- escaping of `name` + metadata fields.

# BREP Matrix Scripts

Run exact STEP/BREP coverage with the repo-local CadQuery environment and a parallel worker pool.

## STEP matrix

```bash
uv run scripts/brep/matrix.py --format step examples
```

## BREP matrix

```bash
uv run scripts/brep/matrix.py --format brep examples
```

## Rerun only failures from a prior report

```bash
uv run scripts/brep/rerun_failures.py tmp/brep-matrix-step-20260306T120000Z.json
```

Both scripts default to:

- `uv` as the exporter launcher
- `.venv-brep/.venv/bin/python` as the Python interpreter
- a bounded parallel worker pool
- JSON reports written under `tmp/`

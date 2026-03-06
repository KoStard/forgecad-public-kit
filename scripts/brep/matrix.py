#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# ///

from __future__ import annotations

import argparse
from pathlib import Path

from brep_matrix_common import (
    MatrixRunConfig,
    default_python_bin,
    default_workers,
    discover_forge_files,
    report_path,
    repo_root_from_script,
    run_matrix,
    write_report,
)


def parse_args() -> argparse.Namespace:
    repo_root = repo_root_from_script(Path(__file__))
    parser = argparse.ArgumentParser(description="Run STEP/BREP export coverage across many .forge.js files.")
    parser.add_argument("paths", nargs="*", default=["examples"], help="Files or folders to scan for .forge.js inputs.")
    parser.add_argument("--format", choices=["step", "brep"], default="step", dest="export_format")
    parser.add_argument("--python", default=default_python_bin(repo_root), dest="python_bin")
    parser.add_argument("--uv", default="uv", dest="uv_bin")
    parser.add_argument("--npm", default="npm", dest="npm_bin")
    parser.add_argument("--workers", type=int, default=default_workers())
    parser.add_argument("--timeout", type=float, default=240.0, dest="timeout_seconds")
    parser.add_argument("--tail-lines", type=int, default=12, dest="tail_lines")
    parser.add_argument("--glob", default="*.forge.js", dest="glob_pattern")
    parser.add_argument("--output", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = repo_root_from_script(Path(__file__))
    files = discover_forge_files(repo_root, args.paths, args.glob_pattern)
    if not files:
        raise SystemExit("No .forge.js files found for the requested paths")

    config = MatrixRunConfig(
        repo_root=repo_root,
        export_format=args.export_format,
        python_bin=args.python_bin,
        uv_bin=args.uv_bin,
        npm_bin=args.npm_bin,
        workers=max(1, args.workers),
        timeout_seconds=max(1.0, args.timeout_seconds),
        tail_lines=max(1, args.tail_lines),
    )

    print(f"Running {config.export_format.upper()} matrix for {len(files)} file(s) with {config.workers} worker(s)", flush=True)
    report = run_matrix(config, files)
    output = args.output or report_path(repo_root, config.export_format, "brep-matrix")
    write_report(report, output)
    print(f"COUNTS {report['total']} {report['passed']} {report['failed']}", flush=True)
    print(f"REPORT {output}", flush=True)
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

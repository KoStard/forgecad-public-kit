#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# ///

from __future__ import annotations

import argparse
import json
from pathlib import Path

from brep_matrix_common import (
    MatrixRunConfig,
    default_workers,
    report_path,
    run_matrix,
    write_report,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rerun only failed entries from a prior STEP/BREP matrix report.")
    parser.add_argument("report", type=Path, help="JSON report produced by scripts/brep/matrix.py")
    parser.add_argument("--python", default=None, dest="python_bin")
    parser.add_argument("--uv", default=None, dest="uv_bin")
    parser.add_argument("--npm", default=None, dest="npm_bin")
    parser.add_argument("--workers", type=int, default=default_workers())
    parser.add_argument("--timeout", type=float, default=None, dest="timeout_seconds")
    parser.add_argument("--tail-lines", type=int, default=None, dest="tail_lines")
    parser.add_argument("--output", type=Path, default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = json.loads(args.report.read_text())
    repo_root = Path(payload["repo_root"]).resolve()
    failed = [repo_root / entry["path"] for entry in payload["results"] if not entry["passed"]]
    if not failed:
        print("No failed entries in the source report", flush=True)
        return 0

    config = MatrixRunConfig(
        repo_root=repo_root,
        export_format=payload["format"],
        python_bin=args.python_bin or payload["python_bin"],
        uv_bin=args.uv_bin or payload["uv_bin"],
        npm_bin=args.npm_bin or payload["npm_bin"],
        workers=max(1, args.workers),
        timeout_seconds=max(1.0, args.timeout_seconds or payload["timeout_seconds"]),
        tail_lines=max(1, args.tail_lines or payload["tail_lines"]),
    )

    print(f"Rerunning {len(failed)} failed {config.export_format.upper()} case(s) with {config.workers} worker(s)", flush=True)
    report = run_matrix(config, failed)
    report["source_report"] = str(args.report.resolve())
    output = args.output or report_path(repo_root, config.export_format, "brep-rerun-failures")
    write_report(report, output)
    print(f"COUNTS {report['total']} {report['passed']} {report['failed']}", flush=True)
    print(f"REPORT {output}", flush=True)
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

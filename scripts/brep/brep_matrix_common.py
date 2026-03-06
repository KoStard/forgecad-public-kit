from __future__ import annotations

import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class MatrixRunConfig:
    repo_root: Path
    export_format: str
    python_bin: str
    uv_bin: str
    npm_bin: str
    workers: int
    timeout_seconds: float
    tail_lines: int


@dataclass(frozen=True)
class MatrixEntry:
    path: str
    passed: bool
    exit_code: int
    duration_seconds: float
    tail: list[str]


def repo_root_from_script(script_path: Path) -> Path:
    return script_path.resolve().parents[2]


def default_python_bin(repo_root: Path) -> str:
    return str(repo_root / ".venv-brep" / ".venv" / "bin" / "python")


def default_workers() -> int:
    cpu = os.cpu_count() or 1
    return max(1, min(8, cpu))


def discover_forge_files(repo_root: Path, inputs: Iterable[str], glob_pattern: str = "*.forge.js") -> list[Path]:
    discovered: set[Path] = set()

    for raw in inputs:
        path = Path(raw)
        if not path.is_absolute():
            path = repo_root / path
        path = path.resolve()

        if path.is_file():
            if path.name.endswith(".forge.js"):
                discovered.add(path)
            continue

        if path.is_dir():
            for child in path.rglob(glob_pattern):
                if child.is_file():
                    discovered.add(child.resolve())

    return sorted(discovered)


def report_path(repo_root: Path, export_format: str, stem: str) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return repo_root / "tmp" / f"{stem}-{export_format}-{timestamp}.json"


def run_export(config: MatrixRunConfig, file_path: Path) -> MatrixEntry:
    cmd = [
        config.npm_bin,
        "run",
        config.export_format,
        "--",
        "--uv",
        config.uv_bin,
        "--python",
        config.python_bin,
        str(file_path),
    ]

    started = time.perf_counter()
    try:
        proc = subprocess.run(
            cmd,
            cwd=config.repo_root,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=config.timeout_seconds,
            check=False,
        )
        exit_code = int(proc.returncode)
        lines = proc.stdout.splitlines()
    except subprocess.TimeoutExpired as exc:
        exit_code = 124
        output = exc.stdout if isinstance(exc.stdout, str) else ""
        lines = output.splitlines()

    duration = time.perf_counter() - started
    rel = file_path.resolve().relative_to(config.repo_root).as_posix()
    return MatrixEntry(
        path=rel,
        passed=exit_code == 0,
        exit_code=exit_code,
        duration_seconds=duration,
        tail=lines[-config.tail_lines:],
    )


def run_matrix(config: MatrixRunConfig, files: list[Path]) -> dict:
    results: list[MatrixEntry] = []
    total = len(files)

    with ThreadPoolExecutor(max_workers=config.workers) as pool:
        futures = {pool.submit(run_export, config, path): path for path in files}
        completed = 0
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            completed += 1
            status = "PASS" if result.passed else "FAIL"
            print(f"{status} {completed}/{total} {result.path}", flush=True)

    results.sort(key=lambda entry: entry.path)
    passed = sum(1 for entry in results if entry.passed)
    failed = total - passed

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "repo_root": str(config.repo_root),
        "format": config.export_format,
        "python_bin": config.python_bin,
        "uv_bin": config.uv_bin,
        "npm_bin": config.npm_bin,
        "workers": config.workers,
        "timeout_seconds": config.timeout_seconds,
        "tail_lines": config.tail_lines,
        "total": total,
        "passed": passed,
        "failed": failed,
        "results": [asdict(entry) for entry in results],
    }


def write_report(report: dict, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n")

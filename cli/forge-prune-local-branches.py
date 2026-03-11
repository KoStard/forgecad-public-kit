#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "rich==13.9.4",
# ]
# ///

from __future__ import annotations

import argparse
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from rich import box
from rich.console import Console, Group
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table


console = Console()


class GitCommandError(RuntimeError):
    pass


@dataclass(frozen=True)
class BranchInfo:
    name: str
    commit: str
    commit_date: str
    subject: str
    upstream: str | None


@dataclass(frozen=True)
class WorktreeInfo:
    path: Path
    head: str
    branch: str | None
    detached: bool
    primary: bool
    exists: bool
    locked_reason: str | None
    prunable_reason: str | None


@dataclass(frozen=True)
class BranchCandidate:
    branch: BranchInfo
    worktrees: tuple[WorktreeInfo, ...]
    dirty_worktrees: tuple[WorktreeInfo, ...]
    checked_out_here: bool

    @property
    def needs_force(self) -> bool:
        return bool(self.dirty_worktrees)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Review local-only branches already merged into a base branch and delete them "
            "one by one, removing their linked worktrees first."
        )
    )
    parser.add_argument(
        "--base",
        default="mainline",
        help="Base branch or ref used to decide whether a branch is already merged (default: mainline).",
    )
    parser.add_argument(
        "--path",
        default=".",
        help="Path inside the target git repository (default: current directory).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show which branches would be offered without deleting anything.",
    )
    return parser.parse_args()


def run_git(
    args: Sequence[str],
    *,
    cwd: Path,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        capture_output=True,
    )
    if check and completed.returncode != 0:
        command = " ".join(shlex.quote(part) for part in ["git", *args])
        detail = (completed.stderr or completed.stdout).strip() or f"exit code {completed.returncode}"
        raise GitCommandError(f"{command} failed: {detail}")
    return completed


def git_stdout(args: Sequence[str], *, cwd: Path) -> str:
    return run_git(args, cwd=cwd).stdout.strip()


def resolve_repo_root(path: Path) -> Path:
    return Path(git_stdout(["rev-parse", "--show-toplevel"], cwd=path)).resolve()


def resolve_base_ref(repo_root: Path, base: str) -> str:
    candidates = (
        base,
        f"refs/heads/{base}",
        f"refs/remotes/{base}",
        f"refs/remotes/origin/{base}",
    )
    for candidate in candidates:
        result = run_git(["rev-parse", "--verify", "--quiet", f"{candidate}^{{commit}}"], cwd=repo_root, check=False)
        if result.returncode == 0:
            return candidate
    raise SystemExit(f"Base ref {base!r} does not exist in this repository.")


def local_branch_name_from_ref(ref: str) -> str:
    if ref.startswith("refs/heads/"):
        return ref.removeprefix("refs/heads/")
    if ref.startswith("refs/remotes/"):
        _, _, tail = ref.partition("refs/remotes/")
        _, _, branch = tail.partition("/")
        return branch
    if "/" in ref:
        return ref.split("/", 1)[1]
    return ref


def list_local_branches(repo_root: Path) -> list[BranchInfo]:
    fmt = "%(refname:short)\t%(objectname:short)\t%(committerdate:short)\t%(upstream:short)\t%(subject)"
    output = git_stdout(["for-each-ref", f"--format={fmt}", "refs/heads"], cwd=repo_root)
    branches: list[BranchInfo] = []
    for line in output.splitlines():
        if not line:
            continue
        name, commit, commit_date, upstream, subject = line.split("\t", 4)
        branches.append(
            BranchInfo(
                name=name,
                commit=commit,
                commit_date=commit_date,
                subject=subject,
                upstream=upstream or None,
            )
        )
    return branches


def list_remote_branch_names(repo_root: Path) -> set[str]:
    output = git_stdout(["for-each-ref", "--format=%(refname:short)", "refs/remotes"], cwd=repo_root)
    names: set[str] = set()
    for line in output.splitlines():
        if not line or line.endswith("/HEAD"):
            continue
        _, _, branch = line.partition("/")
        if branch:
            names.add(branch)
    return names


def list_worktrees(repo_root: Path) -> list[WorktreeInfo]:
    output = run_git(["worktree", "list", "--porcelain"], cwd=repo_root).stdout
    worktrees: list[WorktreeInfo] = []
    current: dict[str, object] = {}
    primary_index = 0

    def flush() -> None:
        nonlocal primary_index
        if not current:
            return
        path = Path(str(current["path"])).resolve()
        worktrees.append(
            WorktreeInfo(
                path=path,
                head=str(current.get("head", "")),
                branch=current.get("branch"),  # type: ignore[arg-type]
                detached=bool(current.get("detached", False)),
                primary=primary_index == 0,
                exists=path.exists(),
                locked_reason=current.get("locked_reason"),  # type: ignore[arg-type]
                prunable_reason=current.get("prunable_reason"),  # type: ignore[arg-type]
            )
        )
        primary_index += 1
        current.clear()

    for raw_line in output.splitlines():
        if not raw_line:
            flush()
            continue
        key, _, value = raw_line.partition(" ")
        if key == "worktree":
            current["path"] = value
        elif key == "HEAD":
            current["head"] = value
        elif key == "branch":
            current["branch"] = value.removeprefix("refs/heads/")
        elif key == "detached":
            current["detached"] = True
        elif key == "locked":
            current["locked_reason"] = value or "locked"
        elif key == "prunable":
            current["prunable_reason"] = value or "prunable"
    flush()
    return worktrees


def is_branch_merged(repo_root: Path, branch_name: str, base_ref: str) -> bool:
    result = run_git(["merge-base", "--is-ancestor", branch_name, base_ref], cwd=repo_root, check=False)
    return result.returncode == 0


def is_worktree_dirty(worktree_path: Path) -> bool:
    output = git_stdout(["status", "--porcelain"], cwd=worktree_path)
    return bool(output)


def collect_candidates(repo_root: Path, base_ref: str, active_path: Path) -> tuple[list[BranchCandidate], Path]:
    current_worktree_root = resolve_repo_root(active_path)
    base_branch_name = local_branch_name_from_ref(base_ref)
    remote_branch_names = list_remote_branch_names(repo_root)
    branches = list_local_branches(repo_root)
    worktrees = list_worktrees(repo_root)

    worktrees_by_branch: dict[str, list[WorktreeInfo]] = {}
    for worktree in worktrees:
        if worktree.branch:
            worktrees_by_branch.setdefault(worktree.branch, []).append(worktree)

    candidates: list[BranchCandidate] = []
    for branch in branches:
        if branch.name == base_branch_name:
            continue
        if branch.name in remote_branch_names:
            continue
        if not is_branch_merged(repo_root, branch.name, base_ref):
            continue
        branch_worktrees = tuple(sorted(worktrees_by_branch.get(branch.name, []), key=lambda item: str(item.path)))
        dirty_worktrees = tuple(
            worktree
            for worktree in branch_worktrees
            if worktree.exists and worktree.prunable_reason is None and is_worktree_dirty(worktree.path)
        )
        checked_out_here = any(worktree.path == current_worktree_root for worktree in branch_worktrees)
        candidates.append(
            BranchCandidate(
                branch=branch,
                worktrees=branch_worktrees,
                dirty_worktrees=dirty_worktrees,
                checked_out_here=checked_out_here,
            )
        )
    candidates.sort(key=lambda item: item.branch.name)
    return candidates, current_worktree_root


def render_overview(repo_root: Path, base_ref: str, candidates: list[BranchCandidate]) -> None:
    title = "Merged Local Branch Cleanup"
    subtitle = (
        f"[bold]{len(candidates)}[/bold] local-only branch"
        f"{'' if len(candidates) == 1 else 'es'} merged into [cyan]{base_ref}[/cyan]"
    )
    console.print(
        Panel(
            subtitle,
            title=title,
            border_style="blue",
            box=box.ROUNDED,
            subtitle_align="left",
        )
    )

    if not candidates:
        console.print("[green]Nothing to prune.[/green]")
        console.print(f"[dim]Repo:[/dim] {repo_root}")
        return

    table = Table(box=box.ROUNDED)
    table.add_column("Branch", style="cyan")
    table.add_column("Commit", style="magenta")
    table.add_column("Date", style="green")
    table.add_column("Worktrees", justify="right")
    table.add_column("State")

    for candidate in candidates:
        state_bits: list[str] = []
        if candidate.checked_out_here:
            state_bits.append("checked out here")
        if any(worktree.primary for worktree in candidate.worktrees):
            state_bits.append("primary worktree")
        if candidate.dirty_worktrees:
            state_bits.append("dirty worktree")
        if any(worktree.prunable_reason for worktree in candidate.worktrees):
            state_bits.append("prunable worktree")
        table.add_row(
            candidate.branch.name,
            candidate.branch.commit,
            candidate.branch.commit_date,
            str(len(candidate.worktrees)) if candidate.worktrees else "0",
            ", ".join(state_bits) if state_bits else "ready",
        )

    console.print(table)
    console.print(f"[dim]Repo:[/dim] {repo_root}")


def render_candidate(
    candidate: BranchCandidate,
    index: int,
    total: int,
    base_ref: str,
    current_worktree_root: Path,
) -> None:
    details = Table.grid(padding=(0, 1))
    details.add_row("[cyan]Branch[/cyan]", candidate.branch.name)
    details.add_row("[cyan]Merged into[/cyan]", base_ref)
    details.add_row("[cyan]Last commit[/cyan]", f"{candidate.branch.commit}  [dim]{candidate.branch.commit_date}[/dim]")
    details.add_row("[cyan]Subject[/cyan]", candidate.branch.subject or "[dim](no subject)[/dim]")

    worktree_lines = Table.grid()
    if candidate.worktrees:
        for worktree in candidate.worktrees:
            status_bits: list[str] = []
            if worktree.path == current_worktree_root:
                status_bits.append("current worktree")
            if worktree.primary:
                status_bits.append("primary")
            if worktree in candidate.dirty_worktrees:
                status_bits.append("dirty")
            if not worktree.exists:
                status_bits.append("missing")
            if worktree.locked_reason:
                status_bits.append("locked")
            if worktree.prunable_reason:
                status_bits.append("prunable")
            status_text = f" [yellow]({', '.join(status_bits)})[/yellow]" if status_bits else ""
            worktree_lines.add_row(f"[magenta]{worktree.path}[/magenta]{status_text}")
    else:
        worktree_lines.add_row("[dim]No linked worktrees[/dim]")

    notes: list[str] = []
    if candidate.checked_out_here:
        notes.append("[red]This branch is active in the current worktree, so it cannot be removed from here.[/red]")
    if any(worktree.primary for worktree in candidate.worktrees):
        notes.append("[red]This branch is checked out in the primary worktree. Switch that worktree away first.[/red]")
    elif candidate.needs_force:
        notes.append("[yellow]At least one linked worktree is dirty. Choose force if you want Git to remove it anyway.[/yellow]")
    if any(worktree.prunable_reason for worktree in candidate.worktrees):
        notes.append("[yellow]Prunable worktrees need manual cleanup before this branch can be deleted safely.[/yellow]")

    body = Group(details, Panel(worktree_lines, title="Linked Worktrees", border_style="magenta", box=box.ROUNDED))
    if notes:
        body = Group(body, *notes)

    console.print(
        Panel(
            body,
            title=f"[{index}/{total}] {candidate.branch.name}",
            border_style="blue",
            box=box.ROUNDED,
        )
    )


def prompt_action(candidate: BranchCandidate) -> str:
    if (
        candidate.checked_out_here
        or any(worktree.primary for worktree in candidate.worktrees)
        or any(worktree.prunable_reason for worktree in candidate.worktrees)
    ):
        console.print("[dim]Choices: s=skip, q=quit[/dim]")
        return Prompt.ask("Action", choices=["s", "q"], default="s")
    if candidate.needs_force:
        console.print("[dim]Choices: f=force delete, s=skip, q=quit[/dim]")
        return Prompt.ask("Action", choices=["f", "s", "q"], default="s")
    console.print("[dim]Choices: d=delete, s=skip, q=quit[/dim]")
    return Prompt.ask("Action", choices=["d", "s", "q"], default="s")


def remove_candidate(repo_root: Path, candidate: BranchCandidate, *, force_worktrees: bool) -> None:
    for worktree in candidate.worktrees:
        if worktree.primary:
            raise GitCommandError("Refusing to remove the primary worktree.")
        if not worktree.exists:
            raise GitCommandError(f"Linked worktree no longer exists on disk: {worktree.path}")
        args = ["worktree", "remove"]
        if force_worktrees:
            args.append("--force")
        args.append(str(worktree.path))
        run_git(args, cwd=repo_root)

    run_git(["branch", "-d", candidate.branch.name], cwd=repo_root)


def render_summary(
    *,
    deleted: list[str],
    skipped: list[str],
    failed: list[tuple[str, str]],
    aborted: bool,
) -> None:
    table = Table(box=box.ROUNDED, title="Cleanup Summary")
    table.add_column("Outcome")
    table.add_column("Branches")
    table.add_row("Deleted", ", ".join(deleted) if deleted else "0")
    table.add_row("Skipped", ", ".join(skipped) if skipped else "0")
    table.add_row("Failed", ", ".join(name for name, _ in failed) if failed else "0")
    console.print(table)

    for name, reason in failed:
        console.print(f"[red]{name}[/red]: {reason}")

    if aborted:
        console.print("[yellow]Stopped early at user request.[/yellow]")


def main() -> int:
    args = parse_args()
    start_path = Path(args.path).resolve()

    try:
        repo_root = resolve_repo_root(start_path)
    except GitCommandError as exc:
        console.print(f"[red]{exc}[/red]")
        return 1

    try:
        base_ref = resolve_base_ref(repo_root, args.base)
        candidates, current_worktree_root = collect_candidates(repo_root, base_ref, start_path)
    except (GitCommandError, SystemExit) as exc:
        console.print(f"[red]{exc}[/red]")
        return 1

    render_overview(repo_root, base_ref, candidates)
    if not candidates:
        return 0

    if args.dry_run:
        console.print("[dim]Run again without --dry-run to confirm deletions one by one.[/dim]")
        return 0

    deleted: list[str] = []
    skipped: list[str] = []
    failed: list[tuple[str, str]] = []
    aborted = False

    for index, candidate in enumerate(candidates, start=1):
        render_candidate(candidate, index, len(candidates), base_ref, current_worktree_root)
        action = prompt_action(candidate)
        if action == "q":
            aborted = True
            skipped.append(candidate.branch.name)
            break
        if action == "s":
            skipped.append(candidate.branch.name)
            continue

        force_worktrees = action == "f"
        try:
            with console.status(f"[bold blue]Removing {candidate.branch.name}[/bold blue]"):
                remove_candidate(repo_root, candidate, force_worktrees=force_worktrees)
        except GitCommandError as exc:
            failed.append((candidate.branch.name, str(exc)))
            console.print(f"[red]Failed to remove {candidate.branch.name}[/red]")
            continue

        deleted.append(candidate.branch.name)
        console.print(f"[green]Removed {candidate.branch.name}[/green]")

    render_summary(deleted=deleted, skipped=skipped, failed=failed, aborted=aborted)
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())

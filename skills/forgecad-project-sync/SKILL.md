---
name: forgecad-project-sync
description: Manage hosted ForgeCAD project sync from the CLI: init, clone, pull, push, file operations, members, publishing, and shares.
forgecad-public: true
---

# Project Sync

forgecad.io is the hosted ForgeCAD platform; a project is a local folder linked to the server by `forgecad.json`. The full command inventory (project, file, member, share, token commands and flags) lives in `forgecad project --help` and the forgecad skill's `docs/CLI.md` — do not relearn it here.

- **One studio process.** Run a single long-running `forgecad studio <folder> [<folder> ...]` naming every active project folder. The user opens the one printed localhost port once; create and edit files only under those folders so the browser live-updates. Never spawn extra servers per project.
- **studio vs dev.** `forgecad studio` is for users and agents; `forgecad dev` is only for developing ForgeCAD itself.
- **Login only for hosted commands.** `forgecad login` before any `project`/`publish` command; local work (run, render, studio) needs no auth.
- **init creates, push syncs.** `project init "Name"` creates the remote project, writes `forgecad.json`, and pushes existing local files. `push` only syncs an already-initialized project. `clone <slug>` is the inverse: remote → new local folder.
- **Sync is content-hash based.** `status`/`push`/`pull` compare file content hashes — no timestamps, no git; a file is "modified" purely by content difference. Loop: edit → `project status` → `project push`.
- **Sync vs single-file ops.** Use `status`/`pull`/`push` for normal sync; use `project file <read|save|delete|...>` only for one hosted-file operation without a full push/pull cycle.
- **Project context required.** All `project file *` and `publish` commands must run inside a folder containing `forgecad.json`.
- **Shares are live references.** A published model always shows the current project file, never a snapshot — pushing changes silently updates published models. `publish` prints the share URL.
- **Non-interactive runs.** Pass `--force` to skip confirmation prompts (push, pull, delete) in agent automation.

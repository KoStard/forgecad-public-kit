---
name: forgecad-project
description: ForgeCAD project CLI workflow — creating, managing, syncing projects and files on forgecad.io. Covers init, push, pull, file operations, member management, publishing, and sharing.
forgecad-public: true
---

# ForgeCAD Project CLI Workflow

## Overview

**forgecad.io** is the primary platform for ForgeCAD projects. The CLI is the main way AI agents interact with it — creating projects, managing files, publishing models, and collaborating. `forgecad studio <project-path> [project-path ...]` opens the installed local editor for users; `forgecad dev <project-path> [project-path ...]` is mainly for ForgeCAD source development.

## Authentication

```sh
forgecad login                          # Interactive email/password login
forgecad login --server http://localhost:5174  # Local dev server
forgecad logout
forgecad whoami                         # Show user, server, license
```

## Project Lifecycle

### Create a project

```sh
cd path/to/my-models
forgecad project init "My Project Name"
forgecad project init "My Project" --slug my-project --visibility public
```

Creates the project on the server, writes `forgecad.json` locally, and pushes any existing local files.

### Clone an existing project

```sh
forgecad project clone <slug>
```

Downloads into a new local directory.

### Sync (push/pull)

```sh
forgecad project push [--force]         # Upload local changes
forgecad project pull [--force]         # Download remote changes
forgecad project status                 # Show local vs remote diff
```

Sync is content-hash-based (SHA-256) — no timestamps, no git. `--force` skips confirmation.

### Inspect and modify

```sh
forgecad project list                   # List all your projects
forgecad project info                   # Name, visibility, files, URL
forgecad project rename "New Name"      # Rename
forgecad project set-visibility public  # private | shared | public
forgecad project delete [--force]       # Permanently delete
forgecad project open                   # Open in browser
```

## File Management (Remote)

Operate directly on remote files without the push/pull cycle:

```sh
forgecad file list [path]               # List remote files
forgecad file read <path>               # Print contents to stdout
forgecad file save <path>               # Upload local file (same relative path)
forgecad file save <path> --content "const x = box(10, 10, 10); return x;"
cat model.forge.js | forgecad file save model.forge.js --stdin
forgecad file delete <path> [--force]   # Delete remote file
forgecad file rename <old> <new>        # Rename/move
forgecad file mkdir <path>              # Create directory
forgecad file copy <source-slug> <path> [--dest <dest-path>]  # Copy from another project
```

All file commands require being inside an initialized project (has `forgecad.json`).

## Member Management

```sh
forgecad project members                          # List members
forgecad project add-member alice@example.com     # Add as editor (default)
forgecad project add-member bob@example.com --role viewer
forgecad project remove-member alice@example.com
forgecad project set-role bob@example.com editor
```

Roles: **owner** (full control), **editor** (read/write), **viewer** (read-only).

## Publishing & Sharing

```sh
forgecad publish model.forge.js --title "My Model"   # Publish, get URL
forgecad publish model.forge.js --no-sync             # Skip auto-push
forgecad shares list                                  # List published models
forgecad shares delete <share-id> [--force]           # Unpublish
forgecad link <gist-url-or-id>                        # Share from Gist
```

Published models are viewable at `forgecad.io/m/<shareId>`. Shares are **live references** to project files — they always show the current version, not a snapshot. Publishing requires a project context.

## AI Agent Workflow Example

```sh
# 1. Authenticate
forgecad login

# 2. Create project
mkdir my-gadget && cd my-gadget
forgecad project init "My Gadget" --visibility private

# 3. Create a model
forgecad new housing --template part

# 4. Edit and push
# ... edit housing.forge.js ...
forgecad project push --force

# 5. Or save directly to remote
forgecad file save housing.forge.js --content "$(cat housing.forge.js)"

# 6. Validate
forgecad run housing.forge.js

# 7. Publish
forgecad publish housing.forge.js --title "Gadget Housing"
```

## How sync works

- Scans local source files (`.forge.js`, `.js`, `.svg`), hashes each with SHA-256 (16-char prefix)
- Fetches remote files from `/api/projects/:projectId/files`, hashes them the same way
- Diffs: `added` (local only), `deleted` (remote only), `modified` (hash mismatch), `unchanged`
- No timestamps, no git — purely content-based

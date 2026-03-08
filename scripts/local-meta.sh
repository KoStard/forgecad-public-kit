#!/usr/bin/env bash

set -euo pipefail

LINK_NAME="${FORGE_LOCAL_META_LINK_NAME:-private}"

usage() {
  cat <<'EOF'
Usage:
  scripts/local-meta.sh init
  scripts/local-meta.sh status
  scripts/local-meta.sh path

Environment overrides:
  FORGE_LOCAL_META_ROOT       Absolute path for the shared local meta repo.
  FORGE_LOCAL_META_LINK_NAME  Link name created in each worktree. Default: private

Default behavior:
  - Creates a separate git repo in the main repo's shared git common dir.
  - Ensures local excludes ignore the link path in every worktree.
  - Migrates existing private directories into the shared repo.
  - Symlinks each ForgeCAD worktree's ./private to that shared meta repo.
EOF
}

require_git_repo() {
  git rev-parse --show-toplevel >/dev/null
}

git_common_dir() {
  git rev-parse --git-common-dir
}

exclude_file() {
  printf '%s/info/exclude\n' "$(git_common_dir)"
}

meta_root() {
  if [[ -n "${FORGE_LOCAL_META_ROOT:-}" ]]; then
    printf '%s\n' "${FORGE_LOCAL_META_ROOT}"
    return
  fi
  printf '%s/local-meta\n' "$(git_common_dir)"
}

canonical_dir() {
  (
    cd "$1"
    pwd -P
  )
}

ensure_exclude_pattern() {
  local file="$1"
  local pattern="$2"

  mkdir -p "$(dirname "$file")"
  touch "$file"

  if ! grep -Fqx "$pattern" "$file"; then
    printf '%s\n' "$pattern" >>"$file"
  fi
}

worktree_paths() {
  git worktree list --porcelain | awk '/^worktree / { print substr($0, 10) }'
}

main_worktree_root() {
  dirname "$(git_common_dir)"
}

worktree_label() {
  local worktree="$1"
  local main_root
  main_root="$(canonical_dir "$(main_worktree_root)")"

  if [[ "$(canonical_dir "$worktree")" == "$main_root" ]]; then
    printf 'mainline\n'
    return
  fi

  local parent
  parent="$(basename "$(dirname "$worktree")")"
  printf '%s\n' "$parent"
}

init_meta_repo() {
  local root="$1"

  mkdir -p "$root"
  if [[ ! -d "$root/.git" ]]; then
    git init --initial-branch=main "$root" >/dev/null
  fi

  mkdir -p \
    "$root/benchmarks" \
    "$root/ideas" \
    "$root/models" \
    "$root/notes" \
    "$root/scratch" \
    "$root/worktrees"

  if [[ ! -f "$root/README.md" ]]; then
    cat >"$root/README.md" <<'EOF'
# ForgeCAD Local Meta Repo

This repository is local-only. It exists to track notes, ideas, benchmark briefs, and other private working material without leaking into the main ForgeCAD repository.

Suggested layout:
- `benchmarks/` for prompt packs and evaluator notes
- `ideas/` for design sketches and roadmap fragments
- `models/` for local model variants and experiments
- `notes/` for durable project knowledge
- `scratch/` for disposable experiments
- `worktrees/` for worktree-specific temporary material

The same repo is exposed into every ForgeCAD worktree through the ignored `private/` link.
EOF
  fi

  if [[ ! -f "$root/.gitignore" ]]; then
    cat >"$root/.gitignore" <<'EOF'
.DS_Store
Thumbs.db
EOF
  fi
}

move_private_contents() {
  local src="$1"
  local dest="$2"
  local label="$3"

  mkdir -p "$dest"

  shopt -s dotglob nullglob
  local entries=("$src"/*)
  shopt -u dotglob nullglob

  if [[ ${#entries[@]} -eq 0 ]]; then
    return
  fi

  local conflict_dir="$dest/_conflicts/${label}"
  for entry in "${entries[@]}"; do
    local name
    name="$(basename "$entry")"
    local target="$dest/$name"

    if [[ -e "$target" || -L "$target" ]]; then
      mkdir -p "$conflict_dir"
      target="$conflict_dir/$name"
    fi

    mv "$entry" "$target"
    printf 'move  %s -> %s\n' "$entry" "$target"
  done
}

migrate_existing_link_path() {
  local worktree="$1"
  local root="$2"
  local link_name="$3"
  local link_path="${worktree}/${link_name}"

  if [[ -L "$link_path" || ! -e "$link_path" ]]; then
    return
  fi

  local label
  label="$(worktree_label "$worktree")"

  if [[ "$label" == "mainline" ]]; then
    move_private_contents "$link_path" "$root" "$label"
  else
    move_private_contents "$link_path" "$root/worktrees/${label}/imported-private" "$label"
  fi

  rmdir "$link_path" 2>/dev/null || true
}

link_worktrees() {
  local root="$1"
  local link_name="$2"
  local canonical_root
  canonical_root="$(canonical_dir "$root")"

  while IFS= read -r worktree; do
    [[ -n "$worktree" ]] || continue

    local link_path="${worktree}/${link_name}"

    migrate_existing_link_path "$worktree" "$root" "$link_name"

    if [[ -L "$link_path" ]]; then
      local current_target
      current_target="$(canonical_dir "$link_path")"
      if [[ "$current_target" == "$canonical_root" ]]; then
        printf 'ok    %s -> %s\n' "$link_path" "$canonical_root"
        continue
      fi
      printf 'warn  %s points to %s, leaving it untouched\n' "$link_path" "$current_target" >&2
      continue
    fi

    if [[ -e "$link_path" ]]; then
      printf 'warn  %s already exists and is not a symlink, leaving it untouched\n' "$link_path" >&2
      continue
    fi

    ln -s "$canonical_root" "$link_path"
    printf 'link  %s -> %s\n' "$link_path" "$canonical_root"
  done < <(worktree_paths)
}

cmd_init() {
  local root
  root="$(meta_root)"

  ensure_exclude_pattern "$(exclude_file)" "$LINK_NAME"
  ensure_exclude_pattern "$(exclude_file)" "${LINK_NAME}/"

  init_meta_repo "$root"
  link_worktrees "$root" "$LINK_NAME"

  printf '\nShared local meta repo ready at:\n%s\n' "$(canonical_dir "$root")"
  printf 'Use it from any worktree via:\n  %s/\n' "$LINK_NAME"
  printf 'Meta repo git status:\n  git -C %s status\n' "$LINK_NAME"
}

cmd_status() {
  local root
  root="$(meta_root)"

  printf 'meta_root=%s\n' "$root"
  printf 'exclude_file=%s\n' "$(exclude_file)"

  if [[ -d "$root/.git" ]]; then
    printf 'meta_repo=initialized\n'
    git -C "$root" status --short
  else
    printf 'meta_repo=missing\n'
  fi

  while IFS= read -r worktree; do
    [[ -n "$worktree" ]] || continue
    local link_path="${worktree}/${LINK_NAME}"
    if [[ -L "$link_path" ]]; then
      printf 'linked %s -> %s\n' "$link_path" "$(canonical_dir "$link_path")"
    elif [[ -e "$link_path" ]]; then
      printf 'blocked %s (exists, not symlink)\n' "$link_path"
    else
      printf 'missing %s\n' "$link_path"
    fi
  done < <(worktree_paths)
}

cmd_path() {
  printf '%s\n' "$(meta_root)"
}

main() {
  require_git_repo

  case "${1:-}" in
    init)
      cmd_init
      ;;
    status)
      cmd_status
      ;;
    path)
      cmd_path
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "${@:-}"

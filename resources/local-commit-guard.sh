#!/bin/sh
# Copyright 2026 insistin (https://github.com/insistin)
# SPDX-License-Identifier: Apache-2.0
# local-commit-guard: keep blacklist paths out of commits (unstage on commit if needed)
# Installed by the Local Commit Guard VS Code / Cursor extension.

set -e

ROOT=$(git rev-parse --show-toplevel)
GITDIR=$(git rev-parse --git-dir)
case "$GITDIR" in
  /*|?:*) ;;
  *) GITDIR="$ROOT/$GITDIR" ;;
esac

RULES="$GITDIR/local-commit-guard.rules"
if [ ! -f "$RULES" ] || [ ! -s "$RULES" ]; then
  exit 0
fi

blocked=""

check_path() {
  p=$1
  p=$(printf '%s' "$p" | tr '\\' '/')
  while IFS= read -r rule || [ -n "$rule" ]; do
    rule=$(printf '%s' "$rule" | tr -d '\r')
    case "$rule" in
      ""|\#*) continue ;;
    esac
    rule=$(printf '%s' "$rule" | tr '\\' '/')
    while [ "${rule#/}" != "$rule" ]; do
      rule=${rule#/}
    done
    while [ "${rule%/}" != "$rule" ]; do
      rule=${rule%/}
    done
    [ -z "$rule" ] && continue
    case "/$p/" in
      *"/$rule/"*) return 0 ;;
    esac
  done < "$RULES"
  return 1
}

unstage_path() {
  f=$1
  git restore --staged -- "$f" 2>/dev/null || git reset -q HEAD -- "$f" 2>/dev/null || true
}

tmpfile="${TMPDIR:-/tmp}/lcg-$$.txt"
seen_file="${tmpfile}.seen"
: > "$tmpfile"
: > "$seen_file"

git diff --cached --name-only --diff-filter=ACDMR -z 2>/dev/null | tr '\0' '\n' >> "$tmpfile" || true
git diff --cached --name-status --diff-filter=R -z 2>/dev/null | tr '\0' '\n' >> "$tmpfile" || true

while IFS= read -r f || [ -n "$f" ]; do
  [ -z "$f" ] && continue
  case "$f" in
    [ACDMR]|[ACDMR][0-9]|[ACDMR][0-9][0-9]|[ACDMR][0-9][0-9][0-9]) continue ;;
  esac
  if grep -Fxq -- "$f" "$seen_file" 2>/dev/null; then
    continue
  fi
  printf '%s\n' "$f" >> "$seen_file"
  if check_path "$f"; then
    blocked="$blocked$f
"
    unstage_path "$f"
  fi
done < "$tmpfile"

rm -f "$tmpfile" "$seen_file"

if [ -n "$blocked" ]; then
  remaining=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
  if [ "$remaining" = "0" ] || [ -z "$remaining" ]; then
    echo "Local Commit Guard: 以下路径已禁止提交（黑名单）：" >&2
    printf '%s' "$blocked" >&2
    echo "暂存区没有可提交的文件。" >&2
    exit 1
  fi
  echo "Local Commit Guard: 以下路径未加入本次提交（已从暂存区移出）：" >&2
  printf '%s' "$blocked" >&2
fi

exit 0

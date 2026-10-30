#!/usr/bin/env bash
# Usage: publish-media.sh <pr-branch> <evidence-dir>...
# Commits each evidence dir to the orphan `media` branch under <pr-branch>/<dir-name>/, pushes it,
# and prints Markdown for the PR body that embeds every file by the media commit's SHA.
set -euo pipefail

[ $# -ge 2 ] || { echo "usage: $0 <pr-branch> <evidence-dir>..." >&2; exit 2; }
branch=$1
shift
root=$(git rev-parse --show-toplevel)
git -C "$root" config user.email >/dev/null || { echo "publish-media: git has no user.email. Ask the human for an identity." >&2; exit 1; }
slug=$(git -C "$root" remote get-url origin | sed -E 's#(\.git)?$##; s#^.*github\.com[:/]##')

work=$(mktemp -d)
trap 'git -C "$root" worktree remove --force "$work" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

if git -C "$root" fetch -q origin media 2>/dev/null; then
  git -C "$root" worktree add -q --detach "$work" FETCH_HEAD
else
  git -C "$root" worktree add -q --detach "$work"
  git -C "$work" checkout -q --orphan media-new
  git -C "$work" rm -rfq .
fi

for dir in "$@"; do
  dest="$work/$branch/$(basename "$dir")"
  rm -rf "$dest"
  mkdir -p "$dest"
  find "$dir" -maxdepth 1 -type f \( -name '*.png' -o -name '*.gif' -o -name '*.mp4' -o -name '*.webm' -o -name '*.json' \) -exec cp {} "$dest/" \;
done

git -C "$work" add -A "$branch"
if git -C "$work" diff --cached --quiet; then
  echo "publish-media: nothing changed under $branch/" >&2
else
  git -C "$work" commit -qm "media: evidence for $branch"
fi

# Each thread writes only its own <pr-branch>/ folder, so a rebase onto a newer media tip cannot conflict.
for attempt in 1 2 3; do
  git -C "$work" push -q origin HEAD:refs/heads/media && break
  [ "$attempt" = 3 ] && { echo "publish-media: push failed 3 times" >&2; exit 1; }
  git -C "$work" fetch -q origin media
  git -C "$work" rebase -q FETCH_HEAD
done

sha=$(git -C "$work" rev-parse HEAD)
echo "media commit: $sha"
echo
cd "$work"
find "$branch" -type f | sort | while read -r path; do
  url="https://github.com/$slug/raw/$sha/$path"
  case "$path" in
    *.png | *.gif) echo "![$(basename "$path")]($url)" ;;
    *) echo "[$(basename "$path")]($url)" ;;
  esac
done

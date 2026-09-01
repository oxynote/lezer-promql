#!/usr/bin/env bash
# Replaces the upstream branch with prometheus's lezer-promql module at the
# given release tag, and commits it there. Run it from main, on a clean
# tree; the commit is left unpushed and unmerged.
#
#   ./scripts/sync-upstream.sh v3.14.0
set -euo pipefail

TAG="${1:?usage: sync-upstream.sh <prometheus tag, e.g. v3.14.0>}"
MODULE="web/ui/module/lezer-promql"
WORK="$(mktemp -d)"
cleanup() {
	git worktree remove --force "$WORK/upstream" 2>/dev/null || true
	rm -rf "$WORK"
}
trap cleanup EXIT

# a shallow sparse clone of one directory: seconds, and under a megabyte of
# git objects, rather than the whole monorepo.
git clone --depth 1 --filter=blob:none --sparse --branch "$TAG" \
	https://github.com/prometheus/prometheus.git "$WORK/prom" >/dev/null 2>&1
git -C "$WORK/prom" sparse-checkout set "$MODULE" >/dev/null

# the upstream branch is written through a worktree rather than by checking
# it out here: this script lives on main and only on main, so switching the
# current branch would take it out from under itself mid-run.
git worktree add --quiet "$WORK/upstream" upstream

# tracked files go first, so a file upstream deleted disappears here instead
# of surviving as a leftover.
git -C "$WORK/upstream" rm -rq --ignore-unmatch .
cp -R "$WORK/prom/$MODULE/." "$WORK/upstream/"
# the module directory carries no license of its own; both live at the root
# of the monorepo and are redistributed with the package.
cp "$WORK/prom/LICENSE" "$WORK/prom/NOTICE" "$WORK/upstream/"

# upstream's .gitignore ignores LICENSE, which is why it has to be forced.
git -C "$WORK/upstream" add -A
git -C "$WORK/upstream" add -f LICENSE

if git -C "$WORK/upstream" diff --cached --quiet; then
	echo "upstream is already at $TAG, nothing to sync"
	exit 0
fi

VERSION="$(node -p "require('$WORK/upstream/package.json').version")"
git -C "$WORK/upstream" commit -qm "sync: prometheus $TAG (lezer-promql $VERSION)"
echo "synced upstream to $TAG (lezer-promql $VERSION); merge it into main next"

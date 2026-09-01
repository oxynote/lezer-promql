# Syncing with upstream

Upstream is `web/ui/module/lezer-promql` inside
[prometheus/prometheus](https://github.com/prometheus/prometheus). This
repository carries that directory on its own branch:

- **`upstream`** — the module's contents at a pinned Prometheus release tag,
  verbatim, plus the `LICENSE` and `NOTICE` that live at the monorepo root.
  Only the sync writes here.
- **`main`** — `upstream` merged in, plus this fork's changes. `git log
  upstream..main` is the patch series, and `git diff upstream main` is the
  whole delta.

A sync is therefore a merge, and a conflict means upstream touched a line
this fork changed — which is exactly when someone should look.

## Automatic

[`.github/workflows/sync.yml`](.github/workflows/sync.yml) runs weekly and on
demand. It resolves the newest non-rc Prometheus tag, replaces `upstream`
with the module at that tag, and opens a pull request into `main`. Nothing
happens when the module did not change, so a pull request always means real
movement. Review it like any other: CI builds the grammar and runs the parse
tests against the merge.

## By hand

```sh
TAG=$(git ls-remote --tags --refs https://github.com/prometheus/prometheus.git 'v*' \
  | sed 's|.*refs/tags/||' | grep -v -- '-rc' | sort -V | tail -1)

./scripts/sync-upstream.sh "$TAG"   # commits to the upstream branch
git checkout main && git merge upstream
```

`sort -V` matters: sorted as text, `v3.9.1` comes after `v3.14.0`.

## After a sync

- `pnpm run build && pnpm test` — the parse tests are the specification, and
  the placeholder cases at the end of `test/expression.txt` are this fork's.
- Bump `version` in `package.json` to the new upstream version with the
  `-oxynote.N` suffix reset to 1, then tag `vX.Y.Z-oxynote.N` to publish.
  The tag is checked against the manifest before anything is published, and
  npm authenticates the workflow by its own identity — there is no token to
  rotate.
- `@prometheus-io/codemirror-promql` is released from the same monorepo at the
  same version number. Consumers should move both together.

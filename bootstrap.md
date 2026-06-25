# Adopting Claudinite

How a consuming repo bootstraps these shared guidelines. Bootstrapping is **idempotent** — safe to re-run on a fresh repo or one that already adopted Claudinite; every step first checks whether its requirement is met and only acts on what's missing, so re-running never duplicates work or clobbers existing setup.

Pick the method for where your sessions run. **Claude Code on the web → Method B** (the submodule clone 403s on cloud, where the git credential is scoped to the session's own repo).

## Method A — submodule

Pinned and reproducible. Add the submodule (skip if `.claudinite/` is already registered) and import the corpus from `CLAUDE.md`:

```sh
git submodule add https://github.com/missingbulb/Claudinite.git .claudinite
grep -qxF '@.claudinite/CLAUDE.md' CLAUDE.md 2>/dev/null \
  || printf '\n@.claudinite/CLAUDE.md\n' >> CLAUDE.md
# Fresh clones: git submodule update --init --recursive (add to your setup script)
```

Submodules aren't pulled automatically, so the consumer's setup or SessionStart hook should run `git submodule update --init --recursive` for every clone and session.

## Method B — session-start tarball sync

Auto-updating, no git credential needed. A SessionStart hook fetches the repo as a tarball over plain HTTPS into a gitignored `.claudinite/`, pulling latest `main` each session.

**1.** Add `.claude/hooks/sync-claudinite.sh` (`chmod +x`):

```sh
#!/bin/bash
# Sync Claudinite into .claudinite/ over plain HTTPS (codeload is allowlisted;
# a submodule clone 403s on cloud). Pulls latest main; fails soft when offline.
# Set CLAUDINITE_REF to a tag/SHA to pin instead of tracking main.
set -euo pipefail
REF="${CLAUDINITE_REF:-main}"
URL="https://codeload.github.com/missingbulb/Claudinite/tar.gz/refs/heads/${REF}"
dest="${CLAUDE_PROJECT_DIR:-.}/.claudinite"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
if curl -fsSL --retry 2 --max-time 30 "$URL" -o "$tmp/c.tgz" 2>/dev/null \
   && tar -tzf "$tmp/c.tgz" >/dev/null 2>&1; then
  rm -rf "$dest.new"; mkdir -p "$dest.new"
  tar -xzf "$tmp/c.tgz" -C "$dest.new" --strip-components=1
  rm -rf "$dest"; mv "$dest.new" "$dest"; exit 0
fi
[ -f "$dest/README.md" ] && exit 0   # offline: keep prior copy
echo "Claudinite sync failed, no local copy; @.claudinite/CLAUDE.md unresolved." >&2
exit 0
```

**2.** Register it in `.claude/settings.json`:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/sync-claudinite.sh" }
] } ] } }
```

**3.** Gitignore the cache — add `.claudinite/` and `.claudinite.new/`.

**4.** Import the corpus — append `@.claudinite/CLAUDE.md` to `CLAUDE.md`:

```sh
grep -qxF '@.claudinite/CLAUDE.md' CLAUDE.md 2>/dev/null \
  || printf '\n@.claudinite/CLAUDE.md\n' >> CLAUDE.md
```

Run the hook once locally to populate `.claudinite/` before first use.

**Pinning a tag/SHA:** set `CLAUDINITE_REF` and change the URL path to `.../tar.gz/<ref>` (drop `refs/heads/`).

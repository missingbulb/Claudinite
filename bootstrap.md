# Adopting Claudinite

How a consuming repo bootstraps these shared guidelines. Bootstrapping is **idempotent** — safe to re-run on a fresh repo or one that already adopted Claudinite (re-running is also how an existing repo picks up changes to these steps). Two kinds of step: a **generated artifact** that Claudinite owns (the `sync-claudinite.sh` hook) is re-written to match its canonical block every run, so re-bootstrapping refreshes a stale copy; **your own config** (the `@.claudinite/CLAUDE.md` import line, `settings.json` entries) is only added to what's missing, never clobbered. Re-running never duplicates work.

Two parts: **(1)** mount the corpus — pick Method A or B by where your sessions run; **(2)** register the preferences SessionStart hook (same for both methods). Do both.

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

**1.** Write `.claude/hooks/sync-claudinite.sh` (`chmod +x`) with exactly the block below. This is a generated artifact Claudinite owns — **overwrite** an existing copy rather than skipping it, so a re-bootstrap picks up updates (e.g. the marker-preserve line added in step 3):

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
  [ -f "$dest/.gitkeep" ] && cp "$dest/.gitkeep" "$dest.new/.gitkeep"  # keep the committed signal marker
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

**3.** Commit `.claudinite/` as a tracked **signal** while ignoring its synced contents. Keep one marker file under version control and gitignore everything else, so the repo carries a one-glance signal that it mounts Claudinite, while the synced corpus underneath stays out of git (idempotent):

```sh
mkdir -p .claudinite
[ -f .claudinite/.gitkeep ] || cat > .claudinite/.gitkeep <<'EOF'
DO NOT DELETE. This file keeps .claudinite/ committed as a signal that this
project mounts Claudinite (https://github.com/missingbulb/Claudinite). The
folder's contents are auto-populated (and gitignored) by
.claude/hooks/sync-claudinite.sh at session start; only this marker is tracked.
EOF
# Drop any wholesale-ignore lines from an earlier bootstrap — a bare `.claudinite/`
# excludes the whole dir, and git won't descend into it, so the `!` negation below
# can't re-include the marker unless that line is gone first.
if [ -f .gitignore ]; then
  grep -vxE '\.claudinite/|\.claudinite\.new/' .gitignore > .gitignore.tmp && mv .gitignore.tmp .gitignore
fi
for rule in '/.claudinite/*' '!/.claudinite/.gitkeep' '/.claudinite.new/'; do
  grep -qxF "$rule" .gitignore 2>/dev/null || echo "$rule" >> .gitignore
done
```

The `/.claudinite/*` + `!/.claudinite/.gitkeep` pair ignores the synced contents but keeps the marker tracked, so `.claudinite/` exists in the repo as an empty-but-committed folder. The sync hook above preserves this marker across its `rm -rf`/swap, so the working tree stays clean after each session sync.

**4.** Import the corpus — append `@.claudinite/CLAUDE.md` to `CLAUDE.md`:

```sh
grep -qxF '@.claudinite/CLAUDE.md' CLAUDE.md 2>/dev/null \
  || printf '\n@.claudinite/CLAUDE.md\n' >> CLAUDE.md
```

Run the hook once locally to populate `.claudinite/` before first use.

**Pinning a tag/SHA:** set `CLAUDINITE_REF` and change the URL path to `.../tar.gz/<ref>` (drop `refs/heads/`).

## Part 2 — preferences SessionStart hook (both methods)

The owner's per-user interaction preferences live in `.claudinite/preferences/<email>.md`. Rather than instructing the agent to go read that file (an instruction that fires unreliably), a SessionStart hook injects it into context automatically. The hook script ships **inside Claudinite** at `.claudinite/preferences/inject-preferences.sh` and self-locates its preferences relative to itself, so there's nothing to copy — you only register it in your repo's own `.claude/settings.json`:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claudinite/preferences/inject-preferences.sh" }
] } ] } }
```

The hook expands `CLAUDE_CODE_USER_EMAIL`, reads the matching `preferences/<email>.md`, and prints it to stdout (which Claude Code adds to the session context). It fails soft — no env var, or no matching file, injects nothing.

**Ordering (Method B):** `.claudinite/` must already exist when this hook runs, so it has to come **after** the `sync-claudinite.sh` entry. Add it as a second entry in the same `SessionStart` array (hooks run in array order):

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/sync-claudinite.sh" },
  { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claudinite/preferences/inject-preferences.sh" }
] } ] } }
```

**Ordering (Method A):** make sure `git submodule update --init --recursive` (your setup/SessionStart step that populates `.claudinite/`) runs before this hook.

## Part 3 — bespoke merge policy (optional, only if you diverge)

The portable merge-to-main recipe ships in the always-on baseline ([`.claudinite/always/merge-to-main.md`](always/merge-to-main.md)) and needs **nothing** from you — its default is squash-merge via a PR, gating on CI only when the repo has it. Adopt it and you're done.

Only if your project genuinely diverges (a non-squash method, a twice-green or extra-approval gate): put that policy in its own file in your repo and **name that file explicitly in your `CLAUDE.md`**. The recipe reads a project's merge-policy file only when the project's `CLAUDE.md` points to one, and lets it override the divergent points (merge method, CI gating).

## Part 4 — daily maintenance (open one tracking issue)

**A consuming project schedules nothing and wires up no plumbing.** The [growth lifecycle](growth/README.md) (extract → promote → dedup) and the nightly repo tidy-up all run **centrally**, from the owner's home repo, by the fleet routine [`routines/auto-all-repos-maintenance.md`](routines/auto-all-repos-maintenance.md) — which finds this repo by the tracked `.claudinite/` marker you committed above. No per-repo schedule, up-path, or plumbing to install; mounting the corpus is nearly the whole opt-in.

The catch: the routine only maintains repos on its access list — a per-repo allowlist the owner keeps in the routine's UI — so the marker alone doesn't enroll a repo until the owner adds it there. So **as part of bootstrap, open a GitHub issue in this repo's tracker assigned to `missingbulb`** asking to add the project to that list. Idempotent: search first, skip if one (open or closed) already exists.

## Part 5 — categorize the project (pick or define a template)

**Only for a fresh / empty project** — one without its own established `CLAUDE.md` working style yet. A project that already documents how it's run has answered this; skip.

The owner runs recurring **classes** of project, each with a shared, project-agnostic playbook in [`templates/`](templates/README.md). Categorizing a new project against that catalog is what lets it inherit the right working procedures from day one.

1. **Read the catalog** in [templates/README.md](templates/README.md) and **ask the owner** which class this project is — offer the catalog entries as the options ("is this one of these types?").
2. **A template fits →** declare the type and **link the template** from this project's `CLAUDE.md` (soft pointer, don't inline — the template stays canonical in Claudinite):
   ```
   > **Project type:** research-project — follows [.claudinite/templates/research-project.md](.claudinite/templates/research-project.md).
   ```
   Then write the project's *own* concrete specifics (inputs, metrics, invariants, run commands) in its own docs, as the linked template instructs.
3. **No template fits →** the project still owes a **category declaration** in its `CLAUDE.md` (name the general class in one line — a project that can't name its category hasn't understood itself yet). A missing template for that class is a signal to **uplevel** it into a new `templates/<class>.md`; see the reverse-direction process in [templates/README.md](templates/README.md) for how and when.

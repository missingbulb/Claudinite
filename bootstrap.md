# Adopting Claudinite

How a consuming repo bootstraps these shared guidelines. Bootstrapping is **idempotent** — safe to re-run on a fresh repo or one that already adopted Claudinite (re-running is also how an existing repo picks up changes to these steps). Two kinds of step: a **generated artifact** that Claudinite owns (the tracked `.claudinite/sync-claudinite.sh` hook) is re-written to match its canonical source every run, so baselining refreshes a stale copy — and corrects its `settings.json` registration when it still points at the legacy `.claude/hooks/` path; **your own config** (the `@.claudinite/CLAUDE.md` import line, other `settings.json` entries) is only added to what's missing, never clobbered. Re-running never duplicates work.

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

Auto-updating, no git credential needed. A SessionStart hook fetches the repo as a tarball over plain HTTPS into a gitignored `.claudinite/`, pulling latest `main` each session. The hook lives *inside* that folder: `.claudinite/sync-claudinite.sh` is the folder's one **tracked** file, doubling as the committed signal that the repo mounts Claudinite — there is no separate marker file.

**1.** Populate `.claudinite/` — one tarball pull delivers the corpus *and* places the hook. The hook's canonical source is [`sync-claudinite.sh`](sync-claudinite.sh) at the Claudinite repo root — never write an inline copy of its body. It is a generated artifact Claudinite owns: when baselining, **overwrite** the tracked copy with the canon's current one rather than skipping it, so a stale hook gets refreshed:

```sh
mkdir -p .claudinite
curl -fsSL https://codeload.github.com/missingbulb/Claudinite/tar.gz/main \
  | tar -xz --strip-components=1 -C .claudinite
chmod +x .claudinite/sync-claudinite.sh
```

**2.** Register it in `.claude/settings.json`. If an entry still points at the legacy `.claude/hooks/sync-claudinite.sh` path, **fix that entry in place** — this is the one settings entry baselining corrects rather than leaves alone:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claudinite/sync-claudinite.sh" }
] } ] } }
```

**3.** Track the hook while gitignoring everything else it syncs (idempotent). The `/.claudinite/*` + `!/.claudinite/sync-claudinite.sh` pair keeps just the hook under version control, so the repo carries a one-glance signal that it mounts Claudinite while the synced corpus underneath stays out of git:

```sh
# Drop rules from earlier bootstraps: a bare `.claudinite/` wholesale-ignore blocks
# the `!` negation below (git won't descend into a fully-ignored dir), and the
# `!/.claudinite/.gitkeep` negation belongs to the retired legacy marker.
if [ -f .gitignore ]; then
  grep -vxE '\.claudinite/|\.claudinite\.new/|!/\.claudinite/\.gitkeep' .gitignore > .gitignore.tmp && mv .gitignore.tmp .gitignore
fi
for rule in '/.claudinite/*' '!/.claudinite/sync-claudinite.sh' '/.claudinite.new/'; do
  grep -qxF "$rule" .gitignore 2>/dev/null || echo "$rule" >> .gitignore
done
git add .claudinite/sync-claudinite.sh
```

The hook preserves its own tracked copy across its `rm -rf`/swap — the tracked copy wins over the tarball's — so the working tree stays clean after each session sync even while the canon's copy has moved ahead; the nightly baselining is the tracked copy's update path.

**3b — migrate the legacy layout** (hook at `.claude/hooks/sync-claudinite.sh`, marker `.claudinite/.gitkeep`). Steps 1–3 already placed the relocated hook, corrected its registration, and rewrote the gitignore rules; what remains is deleting the two legacy files — idempotent, a no-op on a current repo. The fleet's nightly baselining applies this to every member transparently: a direct commit to the member's default branch, no PR, no prompt:

```sh
[ -f .claude/hooks/sync-claudinite.sh ] && git rm -q .claude/hooks/sync-claudinite.sh || true
[ -f .claudinite/.gitkeep ] && git rm -q .claudinite/.gitkeep || true
rmdir .claude/hooks 2>/dev/null || true
```

Because those synced contents are gitignored — absent on any plain checkout, notably a CI runner, which runs no session hook — committed code that CI executes (a test, a tool, a check) must never `import`/`require` a canon helper from `.claudinite/`: it resolves in a local session but fails module-not-found in CI. Inline the helper's logic instead, and point a comment back at the canonical source.

**4.** Import the corpus — append `@.claudinite/CLAUDE.md` to `CLAUDE.md`:

```sh
grep -qxF '@.claudinite/CLAUDE.md' CLAUDE.md 2>/dev/null \
  || printf '\n@.claudinite/CLAUDE.md\n' >> CLAUDE.md
```

Step 1 already populated `.claudinite/`, so the corpus is usable immediately — no extra priming run needed.

**Pinning a branch/tag/SHA:** set `CLAUDINITE_REF` in the environment — the hook fetches `.../tar.gz/$CLAUDINITE_REF`, and codeload accepts any ref there. Never hand-edit the hook to pin: it's canon-owned, and baselining overwrites it.

## Part 2 — SessionStart context hooks (both methods)

Two SessionStart hooks inject context automatically each session, so no behavior rides on the agent remembering to read a file. Both ship **inside Claudinite** and self-locate, so there is nothing to copy — you only register them in your repo's own `.claude/settings.json`, and both must run **after** `.claudinite/` is populated (see ordering below).

- **Preferences** — the owner's per-user interaction preferences live in `.claudinite/preferences/<email>.md`. The hook `.claudinite/preferences/inject-preferences.sh` expands `CLAUDE_CODE_USER_EMAIL`, reads the matching file, and prints it to stdout (which Claude Code adds to the session context). When it **can't** inject them — no `CLAUDE_CODE_USER_EMAIL`, or no matching `<email>.md` — it doesn't silently skip; it fires the halt-gate below so the session doesn't proceed unaware.
- **Active-pack prose** — every pack the project declares in `.claudinite-checks.json` carries its guidance as `RULES.md` prose, and that includes the `basics` baseline (working discipline, the task lifecycle): **no pack is active by default** — Part 6's `--init` seeds the `basics` declaration and its backfill step adds it to a pre-existing file. The hook `.claudinite/packs/load-active-prose.mjs` emits the active packs' prose each session. **Without this hook, declaring a pack has no effect** — the `@.claudinite/CLAUDE.md` import pulls only the corpus *index*, never a pack's prose, not even the basics baseline. This is the hook Part 5's "its prose then loads every session" relies on.

> **The halt-gate capability.** A SessionStart hook **cannot** block the session or prompt interactively — no exit code halts session start (exit 2 only prints stderr to the *user*, which never reaches the assistant's context). But a hook's **stdout is injected into the session context**. So when a hook can't do its job, instead of failing silently it emits JSON — `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}` — whose message directs the assistant to **STOP and use `AskUserQuestion`** before doing any work. The assistant carries out the confirmation the hook itself can't, turning an un-blockable hook into an effective, in-your-face gate. Both `sync-claudinite.sh` (Method B, when the sync fails and no local copy exists) and `inject-preferences.sh` (when preferences can't be injected) use exactly this. Keep the message plain text — no double quotes or backslashes — so it embeds in the JSON string without escaping.

Register both — and, for Method B, the `sync-claudinite.sh` entry first — in one `SessionStart` array. Hooks run in array order, and both context hooks must come **after** whatever populates `.claudinite/`:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claudinite/sync-claudinite.sh" },
  { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claudinite/preferences/inject-preferences.sh" },
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/packs/load-active-prose.mjs" }
] } ] } }
```

**Method A:** drop the `sync-claudinite.sh` entry and make sure `git submodule update --init --recursive` (your setup/SessionStart step that populates `.claudinite/`) runs before the two context hooks.

## Part 3 — bespoke merge policy (optional, only if you diverge)

The portable merge-to-main recipe ships as the `merge-to-main` skill ([skills/merge-to-main/SKILL.md](skills/merge-to-main/SKILL.md)) and needs **nothing** from you — its default is squash-merge via a PR, gating on CI only when the repo has it. Adopt it and you're done.

Only if your project genuinely diverges (a non-squash method, a twice-green or extra-approval gate): put that policy in its own file in your repo and **name that file explicitly in your `CLAUDE.md`**. The recipe reads a project's merge-policy file only when the project's `CLAUDE.md` points to one, and lets it override the divergent points (merge method, CI gating).

## Part 4 — daily maintenance (open one tracking issue)

**A consuming project schedules nothing and wires up no plumbing.** The [growth lifecycle](growth/README.md) (extract → promote → dedup) and the nightly repo tidy-up all run **centrally**, from the owner's home repo, by the fleet routine [`routines/auto-all-repos-maintenance.md`](routines/auto-all-repos-maintenance.md) — which finds this repo by the tracked `.claudinite/` marker you committed above. No per-repo schedule, up-path, or plumbing to install; mounting the corpus is nearly the whole opt-in.

The catch: the routine only maintains repos on its access list — a per-repo allowlist the owner keeps in the routine's UI — so the marker alone doesn't enroll a repo until the owner adds it there. So **as part of bootstrap, open a GitHub issue in this repo's tracker assigned to `missingbulb`**, titled exactly **`Enroll <PROJECT_NAME> in Claudinite fleet maintenance`** (the canonical title both the idempotent search below and the fleet bootstrap sweep's close-on-maintenance step match on), asking to add the project to that list. Idempotent: search first, skip if one (open or closed) already exists. This is a **first-adoption** step: when the fleet's bootstrap sweep baselines a repo it already maintains, it skips opening this outright — reaching that repo already proves it's on the access list, so there's nothing to request — and, since the ask is now fulfilled, it **closes** any still-open enrollment issue it finds (see [the baselining worker](packs/basics/run_daily/baselining.worker.md)).

## Part 5 — categorize the project (declare its class pack)

**Only for a fresh / empty project** — one without its own established `CLAUDE.md` working style yet. A project that already documents how it's run has answered this; skip.

The owner runs recurring **classes** of project, each carried by a **project-class pack** (a prose-only pack a project declares, no fingerprint — e.g. [`research-project`](packs/research-project/RULES.md), the algorithm-iteration playbook). Categorizing a new project is just declaring the pack that fits, alongside its technology packs from Part 3's `--init`:

1. **Match the class** — ask the owner which class this project is, offering the project-class packs under [`packs/`](packs/) as the options.
2. **A class pack fits →** add its id to `"packs"` in `.claudinite-checks.json`. Its prose then loads every session (via the pack-prose hook), and the project writes its *own* concrete specifics (inputs, metrics, invariants, run commands) in its own docs.
3. **No class pack fits →** run the `generate-project-instructions` skill: it decomposes the project into its pack facets (class, technology, aspect, domain) and **extracts** its working instructions into their homes — new or refined `packs/<facet>/` prose packs proposed to Claudinite as the primary deliverable (so the *next* project sharing a facet declares it instead of re-deriving), and a thin project-specific overlay in the project's own docs. Declarations are added here once those packs merge and the mount re-syncs.

## Part 6 — conformance checks and guards (hooks + pack declaration)

The corpus's enforceable rules run as deterministic checks — usage, configuration, and the rule catalog live in [checks/README.md](checks/README.md). Three idempotent steps wire a consumer up:

**1.** Register the Stop hook in `.claude/settings.json` (skip if already present). It runs the checks on what the session changed and blocks the stop while blocking findings remain, so they're fixed in the session that caused them:

```json
{ "hooks": { "Stop": [ { "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/checks/stop-hook.mjs" }
] } ] } }
```

No ordering constraint: Stop fires at end of turn, long after the SessionStart sync (Method B) or submodule update (Method A) has populated `.claudinite/`.

**2.** Register the PreToolUse guard alongside it (same file; skip if present). It deterministically blocks commands the corpus forbids outright — currently remote-branch-delete pushes, which fail in this environment:

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash", "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/checks/pretooluse-guard.mjs" }
] } ] } }
```

**3.** Write the initial pack declaration — the `basics` baseline plus the repo's technology fingerprint (skips itself if the file already exists):

```sh
node .claudinite/checks/run.mjs --init
```

From then on the declared packs run deterministically every session and in CI; the `pack-declaration` check keeps the declaration matched to the technologies actually in the repo — including telling the session that introduces a new technology to declare its pack.

**4.** Make the `basics` declaration explicit (idempotent — a no-op when it's already declared). **No pack is active by default, `basics` included**: a repo gets the baseline prose and checks only by declaring the pack, so the declaration is visible — and droppable — in the one file where every pack selection lives. `--init` above already seeds it into a fresh file; this backfills a pre-existing one:

```sh
node -e 'const fs=require("fs"),f=".claudinite-checks.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));j.packs=Array.isArray(j.packs)?j.packs:[];if(!j.packs.includes("basics")){j.packs.unshift("basics");fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")}'
```

**4b.** Seed the **default-on declared packs** (`tidy-repo`, `grow_with_claudinite`) into a pre-existing declaration that lacks them — but each **only while its one-time seed baseline migration is live** (its file still present in the mounted canon). New repos get these from `--init`; this seeds the *existing* fleet once, so their universal coverage doesn't regress. Unlike `basics`, they are **never re-added after removal**: once the census retires a pack's seed migration (deletes its file after the fleet converges), that pack's seeding no-ops, so a later opt-out (removing the pack) sticks. Idempotent:

```sh
node -e 'const fs=require("fs"),f=".claudinite-checks.json",seeds=[["tidy-repo","2026-07-12-tidy-repo-seed.mjs"],["grow_with_claudinite","2026-07-12-grow-with-claudinite-seed.mjs"]];const j=JSON.parse(fs.readFileSync(f,"utf8"));j.packs=Array.isArray(j.packs)?j.packs:[];let ch=false;for(const[p,m]of seeds){if(fs.existsSync(".claudinite/migrations/"+m)&&!j.packs.includes(p)){j.packs.push(p);ch=true}}if(ch)fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
```

**5.** Make the maintenance-delivery selection explicit (idempotent — a no-op when the key already exists). Every consumer's `.claudinite-checks.json` carries `"maintenance": { "delivery": "push" | "pr" }` — there is deliberately no implicit default, so the knob is always visible in the file where you'd change it (`pr` = the nightly fleet sweep delivers its baselining/alignment changes as a never-merged PR instead of a direct push). `--init` above already seeds `push` into a fresh file; this backfills a pre-existing one:

```sh
node -e 'const fs=require("fs"),f=".claudinite-checks.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));if(!(j.maintenance&&j.maintenance.delivery)){j.maintenance=Object.assign({},j.maintenance,{delivery:"push"});fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")}'
```

## Part 7 — mount the skills

The corpus's procedures and knowledge surface as Agent Skills (the catalog lives in [skills/README.md](skills/README.md)), and the set a repo mounts is **derived from its active packs**: each pack declares the skills it requires (`skills` in its `pack.mjs` — the baseline skills ride `basics`), and the SessionStart hook [`skills/mount-skills.mjs`](skills/mount-skills.mjs) (re)generates `.claude/skills/<name>` symlinks for the union over the declared packs — created, retargeted, and removed as the declaration changes. The mounts are **session-generated, never committed**: a committed link dangles on every plain checkout (CI, a Pages deploy — the hazard `gha/pages-artifact-symlinks` guards), and a catalog or declaration change would need a commit in every consumer. The hook also maintains a self-ignoring `.claude/skills/.gitignore`, so the generated links never dirty the tree; entries it doesn't own — a project's own skills — are never touched.

**1.** Migrate the legacy committed symlinks (earlier bootstraps committed one per skill). Idempotent — a no-op on a current repo — and scoped so a project's own tracked skills are untouched:

```sh
for f in $(git ls-files .claude/skills); do
  [ -L "$f" ] && readlink "$f" | grep -q '\.claudinite/skills/' && git rm -q "$f"
done
```

**2.** Register the hook in the `SessionStart` array of `.claude/settings.json` (skip if present). It must come **after** whatever populates `.claudinite/` — the sync entry for Method B, the submodule update for Method A — like the two context hooks of Part 2:

```json
{ "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/skills/mount-skills.mjs" }
```

**3.** Run it once now, so the current session already has the mounts:

```sh
node .claudinite/skills/mount-skills.mjs
```

Skill entries in `.claude/skills/` may be symlinks, and skill content is picked up live within a session — the same property the Method B tarball sync already relies on — so mounts generated at session start trigger normally. Without them the skills still work as soft pointers from the index, just without harness-managed triggering.

## Part 8 — cloud environment setup (Claude Code on the web)

The web base image is minimal — it ships no Flutter SDK, a repo's `npm` modules aren't cloned, etc. Install belongs in the environment **image** (built once, then Anthropic snapshots the filesystem and reuses it), NOT a per-session hook that would reinstall every start. The division of labour:

- **The corpus holds the one generic script** — [`environment-setup.sh`](environment-setup.sh), synced into every consumer's `.claudinite/`. It's identical for every project, so a project commits **no** copy of its own; it just wires the check hook (below) and pastes the corpus script into its environment.
- **The packs hold the requirements.** A pack declares what it needs in an `env` field ([packs/README.md](packs/README.md#environment-requirements-env)); the generic script asks `packs/env.mjs install` to run whatever THIS repo's *active* packs declare. Per-toolchain logic lives in Claudinite, not the project.
- **A SessionStart hook only asserts.** `env.mjs check` *probes* each requirement directly (Flutter on PATH, `node_modules` present) and, if one is missing, injects the halt-gate directive telling the assistant to have you re-paste. It never installs, and there is no version flag — the probes are the source of truth.

**1.** Register the SessionStart assertion in `.claude/settings.json` (after `sync-claudinite.sh` populates `.claudinite/`, since it imports `env.mjs`):

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/packs/env.mjs check" }
] } ] } }
```

**2.** Give the packs any per-repo parameters they need in `.claudinite-checks.json` under `packConfig` — e.g. where the `node` pack should run `npm ci` (default: repo root):

```json
{ "packConfig": { "node": { "dirs": ["firebase/functions"] } } }
```

**3.** Apply the setup to the environment: copy the full body of **`.claudinite/environment-setup.sh`** (present after a corpus sync; or copy it from the Claudinite repo) into the web environment's **Setup script** field (web UI → environment selector → edit environment → Setup script), then start a fresh session so the snapshot rebuilds. The network policy must reach whatever the active packs' setup fetches (for `flutter`: `github.com`, `storage.googleapis.com`, `pub.dev`; for `node`: the npm registry).

When a pack adds or changes a requirement, nothing in the project changes — the generic script is stable. A genuinely new requirement fails its `probe`, so the SessionStart check flags existing environments to re-paste + rebuild; that re-run installs the new requirement and becomes the new truth. A repo with no env-declaring active pack still benefits from the generic script (the corpus sync + git hygiene); `env.mjs install` simply installs nothing and the check stays silent.

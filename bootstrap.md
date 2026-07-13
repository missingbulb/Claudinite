# Adopting Claudinite

How a consuming repo bootstraps these shared guidelines. Bootstrapping is **idempotent** — safe to re-run on a fresh repo or one that already adopted Claudinite (re-running is also how an existing repo picks up changes to these steps). Two kinds of step: a **generated artifact** that Claudinite owns (the tracked `.claudinite/mount/sync-claudinite.sh` hook) is re-written to match its canonical source every run, so baselining refreshes a stale copy — and corrects its `settings.json` registration when it still points at a legacy path (`.claude/hooks/…` or the pre-mount `.claudinite/sync-claudinite.sh`), and consolidates the `SessionStart` array to the single orchestrator entry ([Part 2](#part-2--sessionstart-context-via-one-orchestrator-both-methods)); **your own config** (the `@.claudinite/CLAUDE.md` import line, other `settings.json` entries) is only added to what's missing, never clobbered. Re-running never duplicates work.

Two parts: **(1)** mount the corpus — pick Method A or B by where your sessions run; **(2)** register the single `SessionStart` orchestrator entry that runs the context steps (same for both methods). Do both.

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

Auto-updating, no git credential needed. A SessionStart hook fetches the repo as a tarball over plain HTTPS into a gitignored `.claudinite/`, pulling latest `main` each session. The hook lives *inside* that folder, under `mount/`: `.claudinite/mount/sync-claudinite.sh` is the corpus's one **tracked** file, doubling as the committed signal that the repo mounts Claudinite — there is no separate marker file.

**1.** Populate `.claudinite/` — one tarball pull delivers the corpus *and* places the hook. The hook's canonical source is [`mount/sync-claudinite.sh`](mount/sync-claudinite.sh) at the Claudinite repo — never write an inline copy of its body. It is a generated artifact Claudinite owns: when baselining, **overwrite** the tracked copy with the canon's current one rather than skipping it, so a stale hook gets refreshed:

```sh
mkdir -p .claudinite
curl -fsSL https://codeload.github.com/missingbulb/Claudinite/tar.gz/main \
  | tar -xz --strip-components=1 -C .claudinite
chmod +x .claudinite/mount/sync-claudinite.sh
```

**Prerequisite — `codeload.github.com` must be reachable.** The sync fetches over plain HTTPS from `codeload.github.com` (and, for a private Claudinite, needs auth). In a managed/remote environment behind an egress proxy this can 403 when the host isn't allowlisted, so the environment's **network policy must allowlist `codeload.github.com` / `github.com`** — otherwise every session's sync fails and the repo silently runs vanilla until a prior local copy or the not-loaded directive catches it.

**2.** Register it in `.claude/settings.json` as the **single** `SessionStart` entry: it syncs the corpus and then fans out to the session-start steps (preferences, prose, skills, env check) by calling `.claudinite/mount/session-start.sh` — see [Part 2](#part-2--sessionstart-context-via-one-orchestrator-both-methods) for why that fan-out lives in one process and not in sibling hook entries. Invoke it **through `bash`**, not as a bare path — a bare path requires the file's exec bit, so a checkout that drops it (or a committed-mode drift to `100644`) makes the hook fail at launch with `Permission denied` *before line 1*, which swallows its own "not loaded" directive. The `bash` prefix is mode-independent and lets that directive surface. If an entry still points at a legacy hook path (`.claude/hooks/sync-claudinite.sh`, or the pre-mount `.claudinite/sync-claudinite.sh`), **or invokes the hook as a bare path** (`$CLAUDE_PROJECT_DIR/.claudinite/mount/sync-claudinite.sh` with no interpreter), **fix that entry in place**; and remove the now-redundant separate context entries per Part 2 — these are the `SessionStart` edits baselining makes in place rather than leaving alone (scoped to Claudinite-owned commands only):

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "bash $CLAUDE_PROJECT_DIR/.claudinite/mount/sync-claudinite.sh" }
] } ] } }
```

**3.** Track the hook while gitignoring everything else it syncs (idempotent). The rules ignore all of `.claudinite/` except the one tracked hook at `.claudinite/mount/sync-claudinite.sh` — tracking a file inside an ignored dir needs the dir re-included first, so `mount/` gets a re-include/ignore pair before the file negation — so the repo carries a one-glance signal that it mounts Claudinite while the synced corpus underneath stays out of git; the root `.claudinite-hooks.log` the hooks write (kept outside `.claudinite/` so the sync's dir swap can't wipe it) is ignored alongside it:

```sh
# Drop rules from earlier bootstraps: a bare `.claudinite/` wholesale-ignore blocks
# the `!` negations below (git won't descend into a fully-ignored dir), the
# `!/.claudinite/.gitkeep` negation belongs to the retired legacy marker, and
# `!/.claudinite/sync-claudinite.sh` is the pre-mount hook location.
if [ -f .gitignore ]; then
  grep -vxE '\.claudinite/|\.claudinite\.new/|!/\.claudinite/\.gitkeep|!/\.claudinite/sync-claudinite\.sh' .gitignore > .gitignore.tmp || true
  mv .gitignore.tmp .gitignore
fi
# Track only the hook, now at .claudinite/mount/sync-claudinite.sh. A file inside an
# otherwise-ignored dir needs the dir re-included first, hence the mount/ pair
# (re-include the dir, ignore its contents) before the file negation.
for rule in '/.claudinite/*' '!/.claudinite/mount/' '/.claudinite/mount/*' '!/.claudinite/mount/sync-claudinite.sh' '/.claudinite.new/' '/.claudinite-hooks.log' '/.claudinite-hooks.log.tmp'; do
  grep -qxF "$rule" .gitignore 2>/dev/null || echo "$rule" >> .gitignore
done
# Converge a pre-mount tracked hook into mount/ (idempotent; no-op once moved).
if git ls-files --error-unmatch .claudinite/sync-claudinite.sh >/dev/null 2>&1; then
  mkdir -p .claudinite/mount
  git mv -f .claudinite/sync-claudinite.sh .claudinite/mount/sync-claudinite.sh
fi
git add .claudinite/mount/sync-claudinite.sh
```

The hook preserves its own tracked copy across its `rm -rf`/swap — the tracked copy wins over the tarball's — so the working tree stays clean after each session sync even while the canon's copy has moved ahead; the nightly baselining is the tracked copy's update path.

**3b — migrate the legacy layout** (hook at `.claude/hooks/sync-claudinite.sh`, marker `.claudinite/.gitkeep`). Steps 1–3 already placed the relocated hook, corrected its registration, and rewrote the gitignore rules; what remains is deleting the two legacy files — idempotent, a no-op on a current repo. The fleet's nightly baselining applies this to every member transparently: a direct commit to the member's default branch, no PR, no prompt:

```sh
[ -f .claude/hooks/sync-claudinite.sh ] && git rm -q .claude/hooks/sync-claudinite.sh || true
[ -f .claudinite/.gitkeep ] && git rm -q .claudinite/.gitkeep || true
rmdir .claude/hooks 2>/dev/null || true
```

Because those synced contents are gitignored — absent on any plain checkout, notably a CI runner, which runs no session hook — committed code that CI executes (a test, a tool, a check) must never `import`/`require` a canon helper from `.claudinite/`: it resolves in a local session but fails module-not-found in CI. Inline the helper's logic instead, and point a comment back at the canonical source.

**4.** Import the corpus — append `@.claudinite/CLAUDE.md` to `CLAUDE.md`, and a one-line self-check right after it:

```sh
grep -qxF '@.claudinite/CLAUDE.md' CLAUDE.md 2>/dev/null \
  || printf '\n@.claudinite/CLAUDE.md\n' >> CLAUDE.md
grep -qF 'Claudinite self-check' CLAUDE.md 2>/dev/null \
  || printf '\n> Claudinite self-check: if the `@.claudinite/CLAUDE.md` import above did not resolve (the `.claudinite/` payload is absent — e.g. no `.claudinite/README.md`), the Claudinite harness is **not active** this session. Treat it as not loaded and confirm with the user before substantive work, since a launch-layer hook failure can eat the sync hook'"'"'s own not-loaded directive.\n' >> CLAUDE.md
```

This self-check lives in the consumer's own tracked `CLAUDE.md` — the one file always in context even when the sync fails — so it gives the assistant a tell independent of the sync hook, which cannot signal its own launch failure. Step 1 already populated `.claudinite/`, so the corpus is usable immediately — no extra priming run needed.

**Pinning a branch/tag/SHA:** set `CLAUDINITE_REF` in the environment — the hook fetches `.../tar.gz/$CLAUDINITE_REF`, and codeload accepts any ref there. Never hand-edit the hook to pin: it's canon-owned, and baselining overwrites it.

## Part 2 — SessionStart context, via one orchestrator (both methods)

Several things happen at session start: whatever **populates** `.claudinite/`, then the steps that **read** it — preferences, active-pack prose (Part 5), skill mounts (Part 7), the env check (Part 8). The readers must run *after* the corpus is present. Here is the trap that made "the harness randomly didn't load this session" a recurring bug:

> **Claude Code runs the entries in a `SessionStart` array IN PARALLEL, with non-deterministic order** — "all matching hooks run in parallel… the order is non-deterministic" (the Claude Code hooks docs). **Array position is not execution order.** So a populate-then-read chain spread across sibling hook entries is a *race*, not a sequence: the readers fire before — or during — the sync's directory swap, hit an absent `.claudinite/`, and fail soft to nothing.

The fix is structural, not a matter of ordering the array: **every corpus-dependent step runs inside one script, `.claudinite/mount/session-start.sh`, in sequence, in a single process.** Ordering lives in that process, never across hook entries. Each step's stdout is forwarded through the one hook (SessionStart adds it to the session context), and each logs a timestamp + what it is doing to `.claudinite-hooks.log` (see below). So a consumer registers exactly **one** `SessionStart` entry — the one that populates the corpus and then calls the orchestrator:

- **Method B:** the single entry is the sync hook from Part 1. It syncs, then calls `session-start.sh`. Nothing else goes in the `SessionStart` array.

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "bash $CLAUDE_PROJECT_DIR/.claudinite/mount/sync-claudinite.sh" }
] } ] } }
```

- **Method A:** the single entry populates the submodule and then orchestrates, sequenced with `&&` **inside one command** (one process, not two racing entries):

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "git -C $CLAUDE_PROJECT_DIR submodule update --init --recursive .claudinite && bash $CLAUDE_PROJECT_DIR/.claudinite/mount/session-start.sh" }
] } ] } }
```

**Remove the redundant entries — the one `SessionStart` cleanup baselining applies in place.** Earlier bootstraps registered `inject-preferences.sh`, `load-active-prose.mjs`, `mount-skills.mjs`, and `env.mjs check` as their *own* `SessionStart` entries. `session-start.sh` now runs all four, so those separate entries are redundant — and, being parallel, they re-introduce the very race. Delete any `SessionStart` entry whose command invokes one of those four Claudinite-owned scripts, leaving only the single populate-then-orchestrate entry above. **Scope the deletion to those exact Claudinite-owned commands — never touch a project's own hooks.**

What the orchestrated steps do:

- **Preferences** — the owner's per-user interaction preferences live in `.claudinite/preferences/<email>.md`. `.claudinite/preferences/inject-preferences.sh` expands `CLAUDE_CODE_USER_EMAIL`, reads the matching file, and prints it (which the orchestrator forwards to the session context). When it **can't** inject them — no `CLAUDE_CODE_USER_EMAIL`, or no matching `<email>.md` — it doesn't silently skip; it fires the halt-gate below so the session doesn't proceed unaware.
- **Active-pack prose** — every pack the project declares in `.claudinite-checks.json` carries its guidance as `RULES.md` prose, including the `basics` baseline (working discipline, the task lifecycle): **no pack is active by default** — Part 6's `--init` seeds the `basics` declaration and its backfill step adds it to a pre-existing file. `.claudinite/packs/load-active-prose.mjs` emits the active packs' prose each session. **Without it, declaring a pack has no effect** — the `@.claudinite/CLAUDE.md` import pulls only the corpus *index*, never a pack's prose, not even the basics baseline. This is what Part 5's "its prose then loads every session" relies on.

> **The halt-gate capability.** A SessionStart hook **cannot** block the session or prompt interactively — no exit code halts session start (exit 2 doesn't block, and worse, it makes Claude Code **discard the hook's stdout**, the very channel a step would use to speak up). But on a normal (exit 0) hook, **stdout is injected into the session context**. So when a step can't do its job, instead of failing silently it prints a **plain-text** directive telling the assistant to **STOP and use `AskUserQuestion`** before doing any work. The assistant carries out the confirmation the hook itself can't, turning an un-blockable hook into an effective, in-your-face gate. `sync-claudinite.sh` (sync failed, no local copy), `inject-preferences.sh` (preferences can't be injected), and `env.mjs check` (a prerequisite is missing) all use exactly this. The message is **plain text, not a JSON envelope**: the orchestrator forwards every step's stdout through one hook, and one hook's stdout that mixes JSON and prose parses as neither — so each step emits plain text that simply concatenates.

**The durable hook log.** Every hook (the sync + orchestrator + its steps, and the `Stop`/`PreToolUse` guards) appends a timestamped line — `start`, `done exit=N`, an outcome note — to `.claudinite-hooks.log` at the project root (kept **outside** `.claudinite/` so the sync's dir swap never wipes it; gitignored in Part 1). It turns an intermittent failure into something inspectable: **no lines at all** for a session ⇒ the hook never *triggered*; a `start` with no matching `done` ⇒ it triggered but failed *executing*. That distinction is why the log exists — reach for it first when a session reports the harness didn't load.

## Part 3 — bespoke merge policy (optional, only if you diverge)

The portable merge-to-main recipe ships as the `merge-to-main` skill ([skills/merge-to-main/SKILL.md](skills/merge-to-main/SKILL.md)) and needs **nothing** from you — its default is squash-merge via a PR, gating on CI only when the repo has it. Adopt it and you're done.

Only if your project genuinely diverges (a non-squash method, a twice-green or extra-approval gate): put that policy in its own file in your repo and **name that file explicitly in your `CLAUDE.md`**. The recipe reads a project's merge-policy file only when the project's `CLAUDE.md` points to one, and lets it override the divergent points (merge method, CI gating).

## Part 4 — daily maintenance (open one tracking issue)

**A consuming project schedules nothing and wires up no plumbing.** The [growth lifecycle](packs/canon-curation/README.md) (extract → promote → dedup) and the nightly repo tidy-up all run **centrally**, from the owner's home repo, by the fleet routine [`routines/auto-all-repos-maintenance.md`](routines/auto-all-repos-maintenance.md) — which finds this repo by the tracked `.claudinite/` marker you committed above. No per-repo schedule, up-path, or plumbing to install; mounting the corpus is nearly the whole opt-in.

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

From then on the declared packs run deterministically every session and in CI. The `--init` fingerprint is a starting suggestion, not a standing rule: a `marker` only *suspects* a pack is wanted, so whether to add or drop a pack later is the project's call. What *is* enforced is settings validity — an unknown pack name, an unknown property, or malformed JSON in `.claudinite-checks.json` is caught when the file loads and surfaced as a blocking `config` error.

**4.** Make the `basics` declaration explicit (idempotent — a no-op when it's already declared). **No pack is active by default, `basics` included**: a repo gets the baseline prose and checks only by declaring the pack, so the declaration is visible — and droppable — in the one file where every pack selection lives. `--init` above already seeds it into a fresh file; this backfills a pre-existing one:

```sh
node -e 'const fs=require("fs"),f=".claudinite-checks.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));j.packs=Array.isArray(j.packs)?j.packs:[];const has=(n)=>j.packs.some((e)=>(typeof e==="string"?e:e&&e.id)===n);if(!has("basics")){j.packs.unshift("basics");fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")}'
```

**4b.** Seed the **default-on declared packs** (`tidy-repo`, `grow_with_claudinite`) into a pre-existing declaration that lacks them — but each **only while its one-time seed baseline migration is live** (its file still present in the mounted canon). New repos get these from `--init`; this seeds the *existing* fleet once, so their universal coverage doesn't regress. Unlike `basics`, they are **never re-added after removal**: once the migration retire pass retires a pack's seed migration (deletes its file after the fleet converges), that pack's seeding no-ops, so a later opt-out (removing the pack) sticks. Idempotent:

```sh
node -e 'const fs=require("fs"),f=".claudinite-checks.json",seeds=[["tidy-repo","2026-07-12-tidy-repo-seed.mjs"],["grow_with_claudinite","2026-07-12-grow-with-claudinite-seed.mjs"]];const j=JSON.parse(fs.readFileSync(f,"utf8"));j.packs=Array.isArray(j.packs)?j.packs:[];const has=(n)=>j.packs.some((e)=>(typeof e==="string"?e:e&&e.id)===n);let ch=false;for(const[p,m]of seeds){if(fs.existsSync(".claudinite/migrations/active_migrations/"+m)&&!has(p)){j.packs.push(p);ch=true}}if(ch)fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")'
```

**4c.** Import each declared pack's **dependencies** (idempotent). A pack can't be imported without the packs it requires — a release pack builds on its coding pack (`chrome-extension-release` → `chrome-extension`), a class pack on its framework (`spec-driven-product` → `executable-requirements`). A pack names those in its `requires` list; this pulls their transitive closure into the declaration so a prerequisite is materialized and visible in the file, like every other entry — written as `{ "id": "...", "via": [...] }`, `via` naming the declared packs that require it, so the file itself records why the dependency is there. `--init` above already resolves this for a fresh file; this backfills a pre-existing one (and keeps every entry's `via` accurate as dependents come and go):

```sh
node --input-type=module -e 'import{readFileSync,writeFileSync}from"node:fs";import{loadPacks,resolveDeclaredPacks}from"./.claudinite/packs/registry.mjs";const f=".claudinite-checks.json";const j=JSON.parse(readFileSync(f,"utf8"));j.packs=Array.isArray(j.packs)?j.packs:[];const r=resolveDeclaredPacks(j.packs,await loadPacks());if(JSON.stringify(r)!==JSON.stringify(j.packs)){j.packs=r;writeFileSync(f,JSON.stringify(j,null,2)+"\n")}'
```

**4d.** Fold a legacy top-level `packConfig` into the pack entries (idempotent — a no-op once nothing is left to fold). A pack's parameters live on its `packs` entry as `config` (`{ "id": "node", "config": { "dirs": [...] } }`); earlier bootstraps wrote them under a top-level `packConfig` key, which the engine still reads but nothing should keep authoring. This moves each declared pack's legacy parameters onto its entry (an entry that already has `config` wins) and drops the legacy key once empty:

```sh
node -e 'const fs=require("fs"),f=".claudinite-checks.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));if(j.packConfig&&typeof j.packConfig==="object"){j.packs=Array.isArray(j.packs)?j.packs:[];let ch=false;for(const[id,cfg]of Object.entries(j.packConfig)){const i=j.packs.findIndex((e)=>(typeof e==="string"?e:e&&e.id)===id);if(i<0)continue;const e=j.packs[i];j.packs[i]=typeof e==="string"?{id,config:cfg}:Object.assign({},e,{config:e.config??cfg});delete j.packConfig[id];ch=true}if(Object.keys(j.packConfig).length===0){delete j.packConfig;ch=true}if(ch)fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")}'
```

**5.** Make the maintenance-delivery selection explicit (idempotent — a no-op when the key already exists). Every consumer's `.claudinite-checks.json` carries `"maintenance": { "delivery": "push" | "pr" }` — there is deliberately no implicit default, so the knob is always visible in the file where you'd change it (`pr` = the nightly fleet sweep delivers its baselining/alignment changes as a never-merged PR instead of a direct push). `--init` above already seeds `push` into a fresh file; this backfills a pre-existing one:

```sh
node -e 'const fs=require("fs"),f=".claudinite-checks.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));if(!(j.maintenance&&j.maintenance.delivery)){j.maintenance=Object.assign({},j.maintenance,{delivery:"push"});fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n")}'
```

**6.** Land the adoption green — run the checks once (`node .claudinite/checks/run.mjs`) and clear whatever they surface. On a repo that already has code, **expect a pre-existing backlog**: enforcement scope is whole-repo, not just this session's diff, so findings in code the bootstrap never touched still surface and would leave every future session's Stop hook (and CI) blocking on debt this session didn't create. Resolve each as part of bootstrap — fix the underlying cause, or, for a deliberately-kept one, record a reasoned `accept` in `.claudinite-checks.json` (idiomatic `warning-suppression` pragmas — a framework-mandated method name, an optional-dependency import probe, a resilience broad-except — are the usual case). Don't reach for `--changed` to hide the backlog: it scopes to the diff but is a transitional adoption aid, never the enforcement default.

## Part 7 — mount the skills

The corpus's procedures and knowledge surface as Agent Skills (the catalog lives in [skills/README.md](skills/README.md)), and the set a repo mounts is **derived from its active packs**: each pack declares the skills it requires (`skills` in its `pack.mjs` — the baseline skills ride `basics`), and the session-start step [`skills/mount-skills.mjs`](skills/mount-skills.mjs) (run by the Part 2 orchestrator) (re)generates `.claude/skills/<name>` symlinks for the union over the declared packs — created, retargeted, and removed as the declaration changes. The mounts are **session-generated, never committed**: a committed link dangles on every plain checkout (CI, a Pages deploy — the hazard `gha/pages-artifact-symlinks` guards), and a catalog or declaration change would need a commit in every consumer. The step also maintains a self-ignoring `.claude/skills/.gitignore`, so the generated links never dirty the tree; entries it doesn't own — a project's own skills — are never touched.

**1.** Migrate the legacy committed symlinks (earlier bootstraps committed one per skill). Idempotent — a no-op on a current repo — and scoped so a project's own tracked skills are untouched:

```sh
for f in $(git ls-files .claude/skills); do
  [ -L "$f" ] && readlink "$f" | grep -q '\.claudinite/skills/' && git rm -q "$f"
done
```

**2.** No separate `SessionStart` entry — `mount-skills.mjs` runs as a step of `session-start.sh` (Part 2), so ordering after the corpus populates is already guaranteed. If a legacy standalone `SessionStart` entry for `mount-skills.mjs` survives, remove it per Part 2 (it re-introduces the parallel race).

**3.** Run it once now, so the current session already has the mounts:

```sh
node .claudinite/skills/mount-skills.mjs
```

Skill entries in `.claude/skills/` may be symlinks, and skill content is picked up live within a session — the same property the Method B tarball sync already relies on — so mounts generated at session start trigger normally. Without them the skills still work as soft pointers from the index, just without harness-managed triggering.

## Part 8 — cloud environment setup (Claude Code on the web)

The web base image is minimal — it ships no Flutter SDK, a repo's `npm` modules aren't cloned, etc. Install belongs in the environment **image** (built once, then Anthropic snapshots the filesystem and reuses it), NOT a per-session hook that would reinstall every start. The division of labour:

- **The corpus holds the one generic script** — [`mount/environment-setup.sh`](mount/environment-setup.sh), synced into every consumer's `.claudinite/mount/`. It's identical for every project, so a project commits **no** copy of its own; it just wires the check hook (below) and pastes the corpus script into its environment.
- **The packs hold the requirements.** A pack declares what it needs in an `env` field ([packs/README.md](packs/README.md#environment-requirements-env)); the generic script asks `packs/env.mjs install` to run whatever THIS repo's *active* packs declare. Per-toolchain logic lives in Claudinite, not the project.
- **A session-start step only asserts.** `env.mjs check` *probes* each requirement directly (Flutter on PATH, `node_modules` present) and, if one is missing, prints the halt-gate directive telling the assistant to have you re-paste. It never installs, and there is no version flag — the probes are the source of truth.

**1.** No separate `SessionStart` entry — `env.mjs check` runs as a step of `session-start.sh` (Part 2), which the sync entry calls after populating `.claudinite/` (env.mjs must load from the corpus). If a legacy standalone `SessionStart` entry for `env.mjs check` survives, remove it per Part 2.

**2.** Give the packs any per-repo parameters they need as `config` on the pack's entry in `.claudinite-checks.json` — e.g. where the `node` pack should run `npm ci` (default: repo root):

```json
{ "packs": [ { "id": "node", "config": { "dirs": ["firebase/functions"] } } ] }
```

**3.** Apply the setup to the environment: copy the full body of **`.claudinite/mount/environment-setup.sh`** (present after a corpus sync; or copy it from the Claudinite repo) into the web environment's **Setup script** field (web UI → environment selector → edit environment → Setup script), then start a fresh session so the snapshot rebuilds. The network policy must reach whatever the active packs' setup fetches (for `flutter`: `github.com`, `storage.googleapis.com`, `pub.dev`; for `node`: the npm registry).

When a pack adds or changes a requirement, nothing in the project changes — the generic script is stable. A genuinely new requirement fails its `probe`, so the SessionStart check flags existing environments to re-paste + rebuild; that re-run installs the new requirement and becomes the new truth. A repo with no env-declaring active pack still benefits from the generic script (the corpus sync + git hygiene); `env.mjs install` simply installs nothing and the check stays silent.

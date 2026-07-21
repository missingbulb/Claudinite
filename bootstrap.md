# Adopting Claudinite

How a consuming repo adopts these shared guidelines, under the **vendored mount**
([engine/mount/DESIGN.md](engine/mount/DESIGN.md)): adoption is the **one network moment** — fetch the canon
once, vendor what this repo needs into **tracked files** under `.claudinite/shared/`, wire the
hooks — and every session after runs **offline** from the committed snapshot. The nightly
maintenance is the only regular updater. Idempotent: re-running refreshes the snapshot exactly
like a nightly would (fetch → converge → stamp) and never clobbers your own config — the
`@`-import line and your other `settings.json` entries are only added where missing.

> **Members adopted before the vendored mount** (the tracked sync hook, gitignored corpus,
> per-session fetch): do **not** re-run this document to convert — conversion is the gated flip
> note the nightly applies. Until a member is flipped, the nightly maintains its legacy shape
> per the [transition appendix](#appendix--pre-flip-members-transition-window-retiring).

## Part 1 — fetch the canon (the network moment)

```sh
scratch="$(mktemp -d)"
curl -fsSL https://codeload.github.com/missingbulb/Claudinite/tar.gz/main \
  | tar -xz --strip-components=1 -C "$scratch"
ref="$(git ls-remote https://github.com/missingbulb/Claudinite.git main 2>/dev/null | cut -f1)"
```

Adoption (and an on-demand refresh) is the only time a consumer fetches — sessions never do, so
the environment's network policy no longer needs `codeload.github.com` for day-to-day work.

## Part 2 — write the pack declaration (and run the adoption interview)

```sh
node "$scratch/engine/check_the_world.mjs" --init
```

`--init` seeds `.claudinite-checks.json`: the baseline, the technology packs the repo's
fingerprint suspects, the default-on maintenance packs, each declared pack's `requires` closure,
and `"maintenance": { "delivery": "auto" }`. A fingerprint only *suspects* a pack — from here on
the declaration is authoritative and adding/dropping packs is the project's call. Settings
**validity** is enforced at load: an unknown pack name, an unknown property, or malformed JSON is
a blocking `config` error.

If `--init` prints **pending adoption questions**, run the adoption interview now — this is the
one strict point (the owner is present by construction; outside bootstrap the same gap only ever
surfaces as a mild SessionStart note — [packs/README.md](packs/README.md#adoption-interview-questions)):
ask the owner each question via `AskUserQuestion`, record each answer **verbatim** on that pack's
entry as `answers: { "<question-id>": "<answer>" }` ("n/a — none wanted" is a valid answer), and
derive the entry's `config` where the question's distill note says how.

## Part 3 — vendor the snapshot

```sh
node "$scratch/engine/mount/apply-vendor.mjs" --target . ${ref:+--ref "$ref"}
```

This materializes the repo's vendor set — the engine, the mount, the declared packs with their
skills, the corpus index — under `.claudinite/shared/` at canon-relative paths, and stamps the
declaration (`"claudinite": { "updated": "YYYY-MM-DD", "ref": "<sha>" }`). Whole-set convergence:
re-running it (or declaring a new pack and re-running) rebuilds the tree; errors abort before any
write. The `shared/` root is a **submodule emulation** — a future `git submodule add … .claudinite/shared`
lands a superset at the same path with no wiring change (see the design doc).

## Part 4 — track it

```sh
for rule in '/.claudinite-hooks.log' '/.claudinite-hooks.log.tmp'; do
  grep -qxF "$rule" .gitignore 2>/dev/null || echo "$rule" >> .gitignore
done
git add .gitignore .claudinite-checks.json .claudinite/shared
```

That is the **whole** ignore contract: the two hook-log lines. The vendored world writes
nothing untracked into `.claudinite/` — `shared/` and `local_packs/` are ordinary tracked
trees — so nothing there needs ignoring (#385).

## Part 5 — wire the hooks

Claude Code runs `SessionStart` entries **in parallel, in non-deterministic order**, so anything
sequenced must live inside **one** entry. Register exactly one — the orchestrator, which runs
the context steps in sequence in a single process (preferences → active-pack prose → skill
mounts → env check → interview check) and forwards their stdout into the session context:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "bash $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/session-start.sh" }
] } ] } }
```

Register the Stop hook (runs the conformance sweep when the session changed something; blocks
the stop while blocking findings remain) and the PreToolUse guard (deterministically blocks
forbidden commands) alongside it:

```json
{ "hooks": { "Stop": [ { "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/check_the_work.mjs" }
] } ],
  "PreToolUse": [ { "matcher": "Bash", "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/pretooluse-guard.mjs" }
] } ] } }
```

Invoke scripts **through `bash`/`node`**, never as bare paths — a dropped exec bit would fail the
hook before line 1 and swallow its own message. Notes on how the steps behave:

- **Preferences are fail-soft** — per-user content is never vendored;
  `shared/engine/hooks/inject-preferences.sh` reads a local copy where the tree has one and otherwise
  fetches the single `preferences/<email>.md`; any miss is a one-line note, and the session
  proceeds on defaults.
- **The halt-gate** — a SessionStart hook cannot block, but its stdout is injected into context,
  so a step that can't do its load-bearing job (`env.mjs check` — a missing toolchain) prints a
  plain-text directive telling the assistant to STOP and confirm via `AskUserQuestion` before any
  work. Plain text always — one hook's stdout must never mix JSON and prose.
- **The durable hook log** — every hook appends `start` / `done exit=N` lines to
  `.claudinite-hooks.log` at the repo root. No lines ⇒ the hook never triggered; `start` without
  `done` ⇒ it died executing. Reach for it first when a session says the harness didn't load.
- **Skill mounts are session-generated, never committed** — `shared/engine/skill_loader/mount-skills.mjs`
  (an orchestrator step) regenerates `.claude/skills/<name>` symlinks for the declared packs'
  union each session and maintains a self-ignoring `.gitignore` there; a committed link would
  dangle on every plain checkout.

## Part 6 — import the corpus index

```sh
grep -qxF '@.claudinite/shared/CLAUDE.md' CLAUDE.md 2>/dev/null \
  || printf '\n@.claudinite/shared/CLAUDE.md\n' >> CLAUDE.md
grep -qF 'Claudinite self-check' CLAUDE.md 2>/dev/null \
  || printf '\n> Claudinite self-check: if the `@.claudinite/shared/CLAUDE.md` import above did not resolve (no `.claudinite/shared/CLAUDE.md` in this checkout), the Claudinite harness is **not active** this session — a broken or partial checkout. Treat it as not loaded and confirm with the user before substantive work.\n' >> CLAUDE.md
```

The self-check lives in the consumer's own tracked `CLAUDE.md` — the one file always in context —
so the assistant has a tell that is independent of every hook.

One standing rule the vendored tree does **not** change: committed consumer code must not
`import`/`require` canon helpers from `.claudinite/` — the canon is refreshed nightly and
refactored upstream, so code reaching into it inherits every rename as a breaking change. Inline
what you need. The `claudinite-isolation` check enforces this outside the wiring files.

## Part 7 — request fleet enrollment (open one tracking issue)

A consuming project schedules nothing: the growth lifecycle and nightly maintenance run
centrally, from the owner's home repo — but only over repos on the routine's access list. So, as
part of a **first** adoption, open a GitHub issue in this repo's tracker assigned to
`missingbulb`, titled exactly **`Enroll <PROJECT_NAME> in Claudinite fleet maintenance`**
(idempotent: search first, skip if one exists, open or closed). Under the vendored mount this
matters more, not less: an unenrolled repo's snapshot simply freezes until someone refreshes it.
When the fleet's sweep baselines a repo it already maintains, it closes any still-open enrollment
issue — being reached proves enrollment.

## Part 8 — categorize the project (declare its class pack)

**Only for a fresh / empty project** — one without its own established working style. The owner
runs recurring **classes** of project, each carried by a project-class pack:

1. Ask the owner which class this project is, offering the project-class packs under
   [`packs/`](packs/) as the options.
2. A class pack fits → add its id to `"packs"` in `.claudinite-checks.json` and re-run Part 3
   (a declaration change triggers a whole-set refresh, so the new pack's content lands).
3. No class pack fits → run the project-instructions skill: it decomposes the project into pack
   facets and extracts its working instructions into new/refined canon packs (the primary
   deliverable) plus a thin project-specific overlay.

## Part 9 — land the adoption green

Run the sweep once and clear what it surfaces:

```sh
node .claudinite/shared/engine/check_the_world.mjs
```

On a repo with existing code, **expect a backlog** — enforcement scope is whole-repo, and
findings in code you never touched would otherwise block every future session's Stop hook and
CI. Fix causes, or record a reasoned `accept` in `.claudinite-checks.json` for the deliberate
keeps. Don't reach for `--changed` to hide the backlog — it is a transitional aid, never the
enforcement default. Commit the adoption as one change (the vendored tree, the declaration, the
wiring) and push it through the normal PR flow.

## Part 10 — cloud environment setup (Claude Code on the web)

The web base image ships no toolchains; installs belong in the environment **image** (built
once, snapshotted), not a per-session hook. The corpus holds the one generic script —
[`engine/mount/environment-setup.sh`](engine/mount/environment-setup.sh), vendored into
`.claudinite/shared/engine/mount/` — identical for every project: paste its full body into the
environment's **Setup script** field and rebuild. It runs each active pack's declared installs
(`env.mjs install`, driven by the declaration); the SessionStart `env.mjs check` then only
*probes* and halt-gates on a genuinely missing prerequisite. The network policy must reach what
the active packs install from (npm registry, `pub.dev`, …) — the corpus itself is already in the
checkout.

## Bespoke merge policy (optional)

The portable merge recipe ships as the merge skill and needs nothing from you (squash via PR,
gate on CI only when the repo has it). Only if your project genuinely diverges: put the policy in
its own file and **name it explicitly in your `CLAUDE.md`** — the recipe reads it only then.

---

## Appendix — pre-flip members (transition window, retiring)

Maintenance shapes for members still on the **legacy fetch-at-session-start mount** (tracked
sync hook at `.claudinite/mount/sync-claudinite.sh`, gitignored synced corpus, flat
`.claudinite/` paths, `@.claudinite/CLAUDE.md` import). The nightly baselining applies **only
this appendix** to them — never the fresh path above; conversion to the vendored mount is the
gated flip note's job ([engine/mount/DESIGN.md](engine/mount/DESIGN.md), phase 2). The whole appendix is
deleted in phase 3, once the fleet has flipped.

- **Sync hook refresh** — the tracked hook is a generated artifact the canon owns: overwrite the
  member's copy with the canon's current [`engine/mount/sync-claudinite.sh`](engine/mount/sync-claudinite.sh);
  never hand-edit or inline a copy. Its `settings.json` registration stays the single
  `SessionStart` entry, invoked through `bash`
  (`bash $CLAUDE_PROJECT_DIR/.claudinite/mount/sync-claudinite.sh`); fix in place an entry
  pointing at a legacy path (`.claude/hooks/…`, pre-mount `.claudinite/sync-claudinite.sh`) or
  invoking a bare path, and delete redundant standalone entries for the orchestrator's steps.
- **Legacy hook paths** — Stop `node …/.claudinite/checks/stop-hook.mjs`, PreToolUse
  `node …/.claudinite/checks/pretooluse-guard.mjs`, import `@.claudinite/CLAUDE.md` (flat, no
  `shared/`).
- **Legacy gitignore set** — `/.claudinite/*`, `!/.claudinite/mount/`, `/.claudinite/mount/*`,
  `!/.claudinite/mount/sync-claudinite.sh`, `!/.claudinite/local_packs/`, `/.claudinite.new/`,
  plus the hooks-log ignores; drop a bare `.claudinite/` wholesale-ignore (it blocks the
  negations) and the retired `.gitkeep` / pre-mount-hook negations.
- **Legacy file cleanup** (idempotent): `git rm` a hook at `.claude/hooks/sync-claudinite.sh`,
  a `.claudinite/.gitkeep` marker, and any committed `.claude/skills/*` symlink pointing into
  `.claudinite/skills/`.
- **Declaration backfills** (idempotent; `--init` covers fresh files): materialize a missing
  explicit `"basics"` entry; seed the default-on packs (`tidy-repo`, `grow_with_claudinite`)
  **only while each one's seed migration file is still present** in the canon (never re-add
  after the seed retires); re-run `resolveDeclaredPacks` so `requires` closures and `via` stay
  accurate; fold a legacy top-level `packConfig` into pack-entry `config`; materialize a missing
  `"maintenance": { "delivery": "auto" }`.
- **Environment prerequisite** — the legacy mount fetches at every session start, so these
  members still need `codeload.github.com` allowlisted in their environment's network policy.

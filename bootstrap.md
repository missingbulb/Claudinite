# Adopting Claudinite

How a consuming repo adopts these shared guidelines, under the **vendored mount**
([vendoring/DESIGN.md](vendoring/DESIGN.md)): adoption is the **one network moment** — fetch the canon
once, vendor what this repo needs into **tracked files** under `.claudinite/shared/`, wire the
hooks — and every session after runs **offline** from the committed snapshot. The nightly
maintenance is the only regular updater. Idempotent: re-running refreshes the snapshot exactly
like a nightly would (fetch → converge → stamp) and never clobbers your own config — your own
`settings.json` entries are only ever added to, never overwritten.

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
node "$scratch/engine/checks/check_the_world.mjs" --init
```

`--init` seeds `.claudinite-checks.json`: the baseline, the technology packs the repo's
fingerprint suspects, the default-on maintenance packs, each declared pack's `requires` closure,
and `"maintenance": { "delivery": "auto-merge" }`. A fingerprint only *suspects* a pack — from here on
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
node "$scratch/vendoring/apply-vendor-set.mjs" --target . ${ref:+--ref "$ref"}
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
  { "type": "command", "command": "bash $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/session-start-command.sh" }
] } ] } }
```

Register the Stop hook (runs the **work-scope** checks when the session changed something —
judging the change in front of the session, with the transcript — and blocks the stop while
blocking findings remain) and the PreToolUse guard (deterministically blocks forbidden commands)
alongside it. The **world-scope** sweep is not wired here — it goes into the project's test/CI
flow in Part 8:

```json
{ "hooks": { "Stop": [ { "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/stop-command.mjs" }
] } ],
  "PreToolUse": [ { "matcher": "Bash", "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/pretooluse-command.mjs" }
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

One standing rule the vendored tree does **not** change: committed consumer code must not
`import`/`require` canon helpers from `.claudinite/` — the canon is refreshed nightly and
refactored upstream, so code reaching into it inherits every rename as a breaking change. Inline
what you need. The `claudinite-isolation` check enforces this outside the wiring files.

## Part 6 — schedule the repo (it schedules itself)

A consuming project schedules **itself** (per-project-scheduling DESIGN §9). As part of
adoption:

1. **Vendor the scheduler workflow** — copy `claudinite-scheduler.yml` into
   `.github/workflows/` and rewrite its placeholder cron minute to this repo's stable
   hashed minute in :10–:50 (the repo's only cron). Compute the minute — never guess it —
   with the vendored hasher: `node .claudinite/shared/engine/scheduler/hash-minute.mjs
   <owner/repo>`. It is a pure function of the repo full name, so it is the same value on
   every re-vendor and baselining re-derives it to catch drift.
2. **Labels need no step** — the scheduler ensures `ready-for-agent`,
   `agent-running`, `needs-human`, and `workflow-failure` exist (create-if-missing,
   idempotent) before it dispatches, so they materialize on the first run and
   self-heal if deleted. No one-off creation, nothing to forget.
3. **Write the `taskScheduler` key** into `.claudinite-checks.json` (defaults:
   `{ "dailyHour": 4, "weeklyDay": "Sun", "monthlyDay": 1 }`, all UTC) — this is the
   cutover marker: the central routine stops planning the repo the same night, and its
   own scheduler + self-baselining take over the refresh.
4. **Create the label-wired executor routine** via the trigger API — fires on the
   `ready-for-agent` label event, model `sonnet`, launcher prompt
   `Execute the Claudinite executor: .claudinite/shared/engine/scheduler/executor.md`,
   sources = this repo + the Claudinite canon. If the trigger API isn't reachable, file
   an owner issue carrying that exact routine config in one enclosed block — the only
   human action left in wiring a repo into scheduling.

During the rollout the owner drives each repo's cutover in a session (MIGRATION.md); the
old enrollment issue and the central routine are retired at Phase 4.

## Part 7 — categorize the project (declare its class pack)

**Only for a fresh / empty project** — one without its own established working style. The owner
runs recurring **classes** of project, each carried by a project-class pack:

1. Ask the owner which class this project is, offering the project-class packs under
   [`packs/`](packs/) as the options.
2. A class pack fits → add its id to `"packs"` in `.claudinite-checks.json` and re-run Part 3
   (a declaration change triggers a whole-set refresh, so the new pack's content lands).
3. No class pack fits → run the project-instructions skill: it decomposes the project into pack
   facets and extracts its working instructions into new/refined canon packs (the primary
   deliverable) plus a thin project-specific overlay.

## Part 8 — wire the world sweep into the test/CI flow, and land green

The **world-scope** sweep is a whole-repo invariant assertion — the same shape as a test suite —
so it runs wherever the project runs its tests, not on the Stop hook. Wire it in as its own step,
invoked as the standalone command (it is the engine's always-vendored Node CLI, so it runs in any
flow regardless of the project's own language — **never** add it as a language-specific test file
a runner discovers):

```sh
node .claudinite/shared/engine/checks/check_the_world.mjs
```

- **The project already has a test/CI flow** (a CI job, a `make test` target, an npm/pnpm
  `test` script, a `justfile`, …): add the command above as one more step, so a red world sweep
  fails that flow exactly like a failing test. Only the world sweep goes here — the **work** scope
  judges a session's own change and runs at that session's Stop hook, not in the test/CI flow.
- **The project has none:** add a **minimal** flow — a single CI job (or a `make`/script target)
  whose steps run the project's own tests, if any, then the world command above. The point is a
  deterministic place the whole-repo sweep runs at each change; keep it as small as the repo needs.

Then run the world sweep once locally and clear what it surfaces. On a repo with existing code,
**expect a backlog** — enforcement scope is whole-repo, and findings in code you never touched
would otherwise fail every future run. Fix causes, or record a reasoned `accept` in
`.claudinite-checks.json` for the deliberate keeps. Don't reach for `--changed` to hide the
backlog — it is a transitional aid, never the enforcement default. Commit the adoption as one
change (the vendored tree, the declaration, the hook wiring, the test/CI step) and push it
through the normal PR flow.

## Part 9 — cloud environment setup (Claude Code on the web)

The web base image ships no toolchains; installs belong in the environment **image** (built
once, snapshotted), not a per-session hook. The corpus holds the one generic script —
[`engine/hooks/environment-setup-command.sh`](engine/hooks/environment-setup-command.sh), vendored into
`.claudinite/shared/engine/vendoring/` — identical for every project: paste its full body into the
environment's **Setup script** field and rebuild. It runs each active pack's declared installs
(`env.mjs install`, driven by the declaration); the SessionStart `env.mjs check` then only
*probes* and halt-gates on a genuinely missing prerequisite. The network policy must reach what
the active packs install from (npm registry, `pub.dev`, …) — the corpus itself is already in the
checkout.

## Bespoke merge policy (optional)

The portable merge recipe ships as the merge skill and needs nothing from you (squash via PR,
gate on CI only when the repo has it). Only if your project genuinely diverges: put the policy in
its own file and **name it explicitly in your `CLAUDE.md`** — the recipe reads it only then.

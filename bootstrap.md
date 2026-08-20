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
the declaration is authoritative and adding/dropping packs is the project's call. Offer the owner
that call from the full pack directory (`$scratch/packs/directory.GENERATED.md` — id, coverage,
activation and requires for every adoptable pack; it also vendors into the mount, so later
sessions re-read it from `.claudinite/shared/`). Settings
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
skills, the full pack directory — under `.claudinite/shared/` at canon-relative paths, and stamps the
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
the context steps in sequence in a single process (self-test → active-pack prose → each
active pack's own session-start step → skill mounts → env check → interview check) and forwards their stdout into the session context:

```json
{ "hooks": { "SessionStart": [ { "hooks": [
  { "type": "command", "command": "bash $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/session-start-command.sh" }
] } ] } }
```

Register the Stop hook (runs the **work-scope** checks when the session changed something —
judging the change in front of the session, with the transcript — and blocks the stop while
blocking findings remain), the PreToolUse guard (deterministically blocks forbidden commands),
and the SessionEnd runner (invokes each active pack's own `session-end.mjs`, once, when the
session ends — best-effort and fail-soft: it can never block a session from ending, and nothing
depends on it having run) alongside it. The **world-scope** sweep is not wired here — it goes
into the project's test/CI flow in Part 8:

```json
{ "hooks": { "Stop": [ { "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/stop-command.mjs" }
] } ],
  "PreToolUse": [ { "matcher": "Bash", "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/pretooluse-command.mjs" }
] } ],
  "SessionEnd": [ { "hooks": [
  { "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claudinite/shared/engine/hooks/session-end-command.mjs" }
] } ] } }
```

Invoke scripts **through `bash`/`node`**, never as bare paths — a dropped exec bit would fail the
hook before line 1 and swallow its own message. Notes on how the steps behave:

- **A pack may contribute its own session-start step** — the orchestrator runs
  `<pack>/session-start.mjs` for every declared pack that ships one, hands it that pack's
  entry `config`, and forwards what it prints into the session context under the pack's
  marker. It is for what a pack can only know at session time (content from outside this
  repo, or keyed to the person in front of it), where `RULES.md` is fixed at vendor time.
  Bounded and **fail-soft**: a step that fails, hangs, or overruns the context cap is one
  plain-text note and the session proceeds. Which packs contribute one is the packs'
  business, not bootstrap's.
- **The session opens by stating what loaded** — a last step counts the active packs, their
  checks, the token weight of the prose injected and the skills mounted, and emits that as one
  line the session repeats back before anything else. A pack whose step computed something worth
  adding to it says so on the facet channel (a `CLAUDINITE-FACET:` line), which the orchestrator
  opens and cleans up; core learns no pack's name to carry a facet.
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
   every re-vendor and the update task re-derives it to catch drift. This step, the Part 5
   hook registrations, dropping the retired `@.claudinite/shared/CLAUDE.md` import, the
   rules index (`.claudinite/claudinite-rules.GENERATED.md` and its `CLAUDE.md` import), this
   repo's own seed local pack, and the README pack-badge row (below)
   are all mechanized by `node .claudinite/shared/engine/scheduler/converge-wiring.mjs
   <owner/repo> --badges --seed-local-pack` — the single wiring surface bootstrap and the update
   flows both call, so the set is defined once in code, not re-enacted from this prose each
   night. Pass both flags here and only here: they are the surfaces adoption seeds that the
   nightly deliberately does not (step 2).
2. **The README pack-badge row needs no step either** — the same converge writes a
   one-line row of the declared packs' badges into `README.md`, under the title, between
   `<!-- claudinite:packs -->` markers — the opening one on its own line above the badges,
   so the badges are not swallowed by the HTML block a line beginning with `<!--` opens;
   anything the repo writes after the closing marker
   on that line is its own and is never touched. **This is a one-time seed.** Baselining
   runs the same converge WITHOUT `--badges`, so from here the row is the repo's own text
   — edit it, move it, or delete it, and nothing will argue. A README belongs to its repo,
   and a nightly-derived row would put a README diff in the update commit every time
   the declaration moved.
3. **Labels need no step** — the scheduler run and the executor ensure the queue's labels
   (`task:blocked`, `task:ready`, `task:urgent`, `task:executing`, `task:agent`,
   `needs-human`, `task:done`, `task:obsolete`) exist before applying any
   of them (create-if-missing, idempotent), so they materialize on the first run and
   self-heal if deleted. No one-off creation, nothing to forget.
4. **Write the `taskScheduler` key** into `.claudinite-checks.json` (defaults:
   `{ "dailyHour": 4, "weeklyDay": "Sun", "monthlyDay": 1 }`, all UTC) — the repo's
   own anchors, from which the scheduler run decides when each task's item comes due.
5. **Create the executor routine and wire it as an invocation endpoint.** The
   executor starts an agent session with an **API call**, not a label event, so this
   is two halves that only work together — and a repo with one half has a queue that
   fills and never hands anything off.

   a. **Create the routine** via the trigger API, named `Claudinite executor - <repo>`,
      whose whole stored prompt is the one line
      `Execute the Claudinite work item: .claudinite/shared/engine/scheduler/queue/instructions.md`.
      Everything a task session does comes from that tracked file; a prompt carrying
      instructions of its own is behavior nobody reviews. Sources = **this repo alone**
      (not the Claudinite canon — the update runner fetches canon Action-side, so no
      task needs it in session).

   b. **Point the repo at it.** Take the routine's API trigger URL and add it to
      `.claudinite-checks.json` under the key every task uses unless it names another:

      ```json
      "taskScheduler": { "endpoints": { "default": {
        "url": "https://api.anthropic.com/v1/claude_code/routines/<trigger-id>/fire",
        "tokenSecret": "CCR_ROUTINE_TOKEN"
      } } }
      ```

      `tokenSecret` is the **name** of a repo Actions secret, never a token — the
      config is tracked, so nothing adjacent to a credential goes in it. Set that
      secret to the routine's bearer token.

   The API sets only name, prompt and environment; **the repo binding and the model
   are UI-only**, so every routine an agent creates arrives unfinished. Do not file a
   separate issue for the remainder — a config that lives away from the thing it
   configures is a config someone reads once and never reconciles. **Carry the
   leftover steps in the routine's own prompt**, as a block below the launcher line
   whose last instruction is to delete itself:

   > `--- SETUP — delete this block once done, leaving only the line above ---`
   > 1. Model → Sonnet 5.
   > 2. Repo → `<owner>/<repo>`, and that repo alone (source and outcome).

   The routine then states its own unfinished-ness where the owner is already looking to
   fix it, and finishing it and clearing the block are the same edit — so a
   half-configured executor cannot quietly pass for a working one.

   Neither half fails silently if it is missing: the hand-off names exactly what is
   unset — the endpoint, its `url`, its `tokenSecret`, or the secret itself — on the
   work item, and converges that item to `needs-human`. Agentless tasks keep working
   throughout, since they never reach this path.

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

## Part 8 — wire both sweeps into the test/CI flow, and land green

Two commands, answering two different questions. Wire each in as its own step, invoked as the
standalone command (both are the engine's always-vendored Node CLIs, so they run in any flow
regardless of the project's own language — **never** add either as a language-specific test file
a runner discovers):

```sh
node .claudinite/shared/engine/checks/check_the_world.mjs                    # the TREE
node .claudinite/shared/engine/checks/ci-work-scope.mjs --branch "$BRANCH"   # the CHANGE
```

The **world** sweep is a whole-repo invariant assertion — the same shape as a test suite. The
**work** sweep judges this branch's diff against the base branch, which is the only way to see
what a change *did* rather than what the repo now contains: whether a commit references its
issue, whether a merge commit slipped in, whether an edit that must carry something with it did.
The Stop hook runs the work scope too, but only where a session runs — an unattended commit or a
hand-pushed branch reaches `main` unjudged otherwise.

`ci-work-scope.mjs` owns everything that makes that sweep meaningful, so a project carries the
invocation and never the recipe: it fetches the base branch (a CI checkout has none, and a
baseless scope is an empty diff that passes every rule), refuses a scope that would judge
nothing, skips the engine's own `claudinite/…` branches (their PRs have no issue behind them,
and their auto-merge is a queue for checks — a red check there stops the repo updating rather
than annoying anyone), and exits non-zero on a blocking finding. Pass `--branch` wherever the
checkout is detached (GitHub Actions: `${{ github.head_ref || github.ref_name }}`), since a
detached head reports no branch name and the skip above would never fire.

- **The project already has a test/CI flow** (a CI job, a `make test` target, an npm/pnpm
  `test` script, a `justfile`, …): add both commands as two more steps, so a red sweep fails that
  flow exactly like a failing test.
- **The project has none:** add a **minimal** flow — a single CI job (or a `make`/script target)
  whose steps run the project's own tests, if any, then the two commands above. The point is a
  deterministic place both sweeps run at each change; keep it as small as the repo needs.
- **The work sweep needs the base branch reachable**, so a CI checkout must not be shallow to the
  point of hiding it (`fetch-depth: 0` on `actions/checkout`); the entry point fetches the ref
  itself and fails loudly rather than judging an empty diff.

Then run the world sweep once locally and clear what it surfaces. On a repo with existing code,
**expect a backlog** — enforcement scope is whole-repo, and findings in code you never touched
would otherwise fail every future run. Fix causes, or record a reasoned `accept` in
`.claudinite-checks.json` for the deliberate keeps. Don't reach for `--changed` to hide the
backlog — it is a transitional aid, never the enforcement default. Commit the adoption as one
change (the vendored tree, the declaration, the hook wiring, the test/CI step) and push it
through the normal PR flow.

## Part 9 — cloud environment setup (Claude Code on the web)

The web base image ships no toolchains; installs belong in the environment **image** (built
once, snapshotted), not a per-session hook. The script to paste is a pack's, not core's —
[`packs/README.md`](packs/README.md#environment-requirements) names it and the pack that owns it.
Its body is identical for every project: paste it whole into the environment's **Setup script**
field and rebuild (`find .claudinite/shared -name environment-setup-command.sh` locates it in a
mount). It runs each active pack's declared installs
(`env.mjs install`, driven by the declaration); the SessionStart `env.mjs check` then only
*probes* and halt-gates on a genuinely missing prerequisite. The network policy must reach what
the active packs install from (npm registry, `pub.dev`, …) — the corpus itself is already in the
checkout.

## Bespoke merge policy (optional)

The portable merge recipe ships as the merge skill and needs nothing from you (squash via PR,
gate on CI only when the repo has it). Only if your project genuinely diverges: put the policy in
its own file and **name it explicitly in your `CLAUDE.md`** — the recipe reads it only then.

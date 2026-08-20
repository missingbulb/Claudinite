# Adopting Claudinite

How a consuming repo adopts these shared guidelines, under the **vendored mount**
([vendoring/DESIGN.md](vendoring/DESIGN.md)): adoption is the **one network moment** — fetch the
canon once, run [`bootstrap.mjs`](bootstrap.mjs) against the checkout, answer the interview — and
every session after runs **offline** from the committed snapshot. The nightly maintenance is the
only regular updater. Idempotent: re-running the script converges everything again and never
clobbers your own config — your own `settings.json` entries are only ever added to, never
overwritten.

## The fast path

Everything mechanical is one script invocation, so the whole adoption is five steps and only the
interview waits on a human. Don't re-enact the parts below by hand — they are the reference for
*what* each converged artifact is; the script performs them.

1. **Open the adoption issue first** — before anything is committed, so the adoption commit can
   reference it. The work-scope sweep blocks a commit that references no issue; creating the
   issue after committing costs an amend, a force-push and a CI rerun.
2. **Fetch the canon and run the script** (Part 1):

   ```sh
   scratch="$(mktemp -d)"
   curl -fsSL https://codeload.github.com/missingbulb/Claudinite/tar.gz/main \
     | tar -xz --strip-components=1 -C "$scratch"
   ref="$(git ls-remote https://github.com/missingbulb/Claudinite.git main 2>/dev/null | cut -f1)"
   node "$scratch/bootstrap.mjs" --target . --repo <owner>/<repo> ${ref:+--ref "$ref"} --packs <requested,…>
   ```

   One idempotent, sub-second invocation converges Parts 2–6 and Part 8's CI seed, then
   self-tests, sweeps, and reports what is left: the pending interview questions, the sweep's
   findings, and the steps only a human can take.
3. **Run the interview** (Part 2): ask **all** pending questions in one `AskUserQuestion` pass —
   batch up to 4 per call, never one popup per pack — folding in the project-class question
   (Part 7) when the project is fresh. Record the answers by re-running the same command with
   `--answer '<pack>/<question>=<verbatim answer>'` per reply, and derive each entry's `config`
   where the question's distill note (printed beside it) says how.
4. **Land it** (Part 8): clear or accept what the world sweep reported, commit the adoption as
   one change referencing the issue, push, PR.
5. **Finish the human-only halves**: the executor routine and its repo binding (Part 6), and —
   for Claude Code on the web — the environment Setup script (Part 9).

## Part 1 — fetch the canon (the network moment)

The commands above. Adoption (and an on-demand refresh) is the only time a consumer fetches —
sessions never do, so the environment's network policy no longer needs `codeload.github.com` for
day-to-day work.

## Part 2 — the pack declaration and the adoption interview

The script seeds `.claudinite-checks.json` (sharing `check_the_world.mjs --init`'s seeding): the
baseline, the technology packs the repo's fingerprint suspects, the default-on maintenance packs,
each declared pack's `requires` closure, and `"maintenance": { "delivery": "auto-merge" }`. A
fingerprint only *suspects* a pack — from here on the declaration is authoritative and
adding/dropping packs is the project's call; offer the owner that call from the full pack
directory (`$scratch/packs/directory.GENERATED.md` — it also vendors into the mount). Settings
**validity** is enforced at load: an unknown pack name, an unknown property, or malformed JSON is
a blocking `config` error.

The pending questions the script reports are the adoption interview — run it now, batched as the
fast path says. This is the one strict point (the owner is present by construction; outside
bootstrap the same gap only ever surfaces as a mild SessionStart note —
[packs/README.md](packs/README.md#adoption-interview-questions)). Each answer is recorded
**verbatim** on that pack's entry as `answers: { "<question-id>": "<answer>" }` ("n/a — none
wanted" is a valid answer); `--answer` does exactly that.

## Part 3 — vendor the snapshot

The script materializes the repo's vendor set — the engine, the mount, the declared packs with
their skills, the full pack directory — under `.claudinite/shared/` at canon-relative paths, and
stamps the declaration (via `vendoring/apply-vendor-set.mjs`: whole-set convergence, errors abort
before any write). The `shared/` root is a **submodule emulation** — a future
`git submodule add … .claudinite/shared` lands a superset at the same path with no wiring change
(see the design doc).

## Part 4 — track it

The script appends the two hook-log lines (`/.claudinite-hooks.log`, `/.claudinite-hooks.log.tmp`)
to `.gitignore` — that is the **whole** ignore contract: the vendored world writes nothing
untracked into `.claudinite/` (#385) — and stages every surface it wrote, so the sweep judges
tracked content and the adoption commit is one `git commit` away.

## Part 5 — the hooks

The script registers the settings hooks (`converge-wiring.mjs`'s `REQUIRED_HOOKS` — the single
SessionStart orchestrator, the Stop work-scope gate, the PreToolUse guard, the SessionEnd
runner), added-if-missing, never clobbering entries of your own. What a session should know about
them:

- **One SessionStart entry, deliberately**: Claude Code runs SessionStart entries in parallel, in
  non-deterministic order, so everything sequenced lives inside the one orchestrator (self-test →
  active-pack prose → each active pack's own session-start step → skill mounts → env check →
  interview check), which forwards its steps' stdout into the session context.
- **The session opens by stating what loaded** — a final step counts the active packs, checks,
  prose tokens and mounted skills into one line the session repeats back before anything else.
- **The halt-gate** — a SessionStart hook cannot block, but its stdout is injected, so a step
  that can't do its load-bearing job (a missing toolchain) prints a plain-text directive telling
  the assistant to STOP and confirm via `AskUserQuestion` before any work.
- **The durable hook log** — every hook appends `start` / `done exit=N` lines to
  `.claudinite-hooks.log`. No lines ⇒ the hook never triggered; `start` without `done` ⇒ it died
  executing. Reach for it first when a session says the harness didn't load.
- **Skill mounts are session-generated, never committed** — the orchestrator regenerates
  `.claude/skills/<name>` symlinks each session; a committed link would dangle on every plain
  checkout.

One standing rule the vendored tree does **not** change: committed consumer code must not
`import`/`require` canon helpers from `.claudinite/` — the canon is refreshed nightly and
refactored upstream, so code reaching into it inherits every rename as a breaking change. Inline
what you need. The `claudinite-isolation` check enforces this outside the wiring files.

## Part 6 — schedule the repo (it schedules itself)

A consuming project schedules **itself** (per-project-scheduling DESIGN §9). The script converges
the mechanical half: the `claudinite-scheduler.yml` workflow at the repo's stable hashed cron
minute (computed, never guessed — `hash-minute.mjs`, a pure function of the full name), the
executor workflow, the `taskScheduler` anchors
(`{ "dailyHour": 4, "weeklyDay": "Sun", "monthlyDay": 1 }`, all UTC), the rules index and its
`CLAUDE.md` import, the README pack-badge row and this repo's own seed local pack — the last two
one-time seeds the repo owns from there (baselining deliberately re-passes neither). Labels need
no step either: the scheduler run and the executor create the queue's labels if missing.

What remains is the half only a human-facing session can do — **create the executor routine and
wire it as an invocation endpoint**. The executor starts an agent session with an **API call**,
not a label event, so this is two halves that only work together; a repo with one half has a
queue that fills and never hands anything off.

a. **Create the routine** via the trigger API, named `Claudinite executor - <repo>`, whose whole
   stored prompt is the one line
   `Execute the Claudinite work item: .claudinite/shared/engine/scheduler/queue/instructions.md`.
   Everything a task session does comes from that tracked file; a prompt carrying instructions of
   its own is behavior nobody reviews. Sources = **this repo alone** (not the Claudinite canon —
   the update runner fetches canon Action-side, so no task needs it in session).

b. **Point the repo at it.** Take the routine's API trigger URL and add it to
   `.claudinite-checks.json` under the key every task uses unless it names another:

   ```json
   "taskScheduler": { "endpoints": { "default": {
     "url": "https://api.anthropic.com/v1/claude_code/routines/<trigger-id>/fire",
     "tokenSecret": "CCR_ROUTINE_TOKEN"
   } } }
   ```

   `tokenSecret` is the **name** of a repo Actions secret, never a token — the config is tracked,
   so nothing adjacent to a credential goes in it. Set that secret to the routine's bearer token.

The API sets only name, prompt and environment; **the repo binding and the model are UI-only**,
so every routine an agent creates arrives unfinished. Do not file a separate issue for the
remainder — a config that lives away from the thing it configures is a config someone reads once
and never reconciles. **Carry the leftover steps in the routine's own prompt**, as a block below
the launcher line whose last instruction is to delete itself:

> `--- SETUP — delete this block once done, leaving only the line above ---`
> 1. Model → Sonnet 5.
> 2. Repo → `<owner>/<repo>`, and that repo alone (source and outcome).

The routine then states its own unfinished-ness where the owner is already looking to fix it, and
finishing it and clearing the block are the same edit — so a half-configured executor cannot
quietly pass for a working one.

Neither half fails silently if it is missing: the hand-off names exactly what is unset — the
endpoint, its `url`, its `tokenSecret`, or the secret itself — on the work item, and converges
that item to `needs-human`. Agentless tasks keep working throughout, since they never reach this
path.

## Part 7 — categorize the project (declare its class pack)

**Only for a fresh / empty project** — one without its own established working style. The owner
runs recurring **classes** of project, each carried by a project-class pack:

1. Ask the owner which class this project is — in the same batched interview pass as Part 2's
   questions — offering the project-class packs under [`packs/`](packs/) as the options.
2. A class pack fits → re-run the script with it in `--packs` (a declaration change triggers a
   whole-set refresh, so the new pack's content lands).
3. No class pack fits → run the project-instructions skill: it decomposes the project into pack
   facets and extracts its working instructions into new/refined canon packs (the primary
   deliverable) plus a thin project-specific overlay.

## Part 8 — both sweeps in the test/CI flow, and land green

Two commands, answering two different questions — both always-vendored Node CLIs, so they run in
any flow regardless of the project's own language (**never** add either as a language-specific
test file a runner discovers):

```sh
node .claudinite/shared/engine/checks/check_the_world.mjs                    # the TREE
node .claudinite/shared/engine/checks/ci-work-scope.mjs --branch "$BRANCH"   # the CHANGE
```

The **world** sweep is a whole-repo invariant assertion — the same shape as a test suite. The
**work** sweep judges this branch's diff against the base branch: whether a commit references its
issue, whether a merge commit slipped in, whether an edit that must carry something with it did.
The Stop hook runs the work scope too, but only where a session runs — an unattended commit or a
hand-pushed branch reaches `main` unjudged otherwise. `ci-work-scope.mjs` owns everything that
makes its sweep meaningful (fetching the base branch, refusing an empty scope, skipping the
engine's own `claudinite/…` branches, exiting non-zero on a blocking finding); pass `--branch`
wherever the checkout is detached.

- **The project has no CI**: the script seeds `.github/workflows/claudinite-ci.yml`, a minimal
  single-job flow running both sweeps. The repo owns the file from there.
- **The project already has a test/CI flow** (detected by a workflow already running the world
  sweep, or reported by the script): add both commands as two more steps of that flow, so a red
  sweep fails it exactly like a failing test. The work sweep needs the base branch reachable, so
  the CI checkout must not be shallow to the point of hiding it (`fetch-depth: 0`).

The script already ran the world sweep and printed its findings. On a repo with existing code,
**expect a backlog** — enforcement scope is whole-repo, and findings in code you never touched
would otherwise fail every future run. Fix causes, or record a reasoned `accept` in
`.claudinite-checks.json` for the deliberate keeps. Don't reach for `--changed` to hide the
backlog — it is a transitional aid, never the enforcement default. Commit the adoption as one
change referencing the adoption issue, and push it through the normal PR flow.

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

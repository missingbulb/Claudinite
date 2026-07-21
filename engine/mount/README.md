# `mount/` — how Claudinite hooks itself into a repo

Everything that does the **initial loading** of Claudinite lives here: the machinery a
consuming repo runs at session start (and once at cloud-environment build) to mount the corpus
and inject its guidance. The full adoption procedure is [bootstrap.md](../../bootstrap.md); this
folder is the code that procedure wires in.

> **Direction:** the session-start *fetch* is being replaced by a tracked, nightly-updated
> vendor of the corpus — the decision record is [DESIGN.md](DESIGN.md). Until that transition
> lands, the files below describe the live (fetching) mount unchanged.

| File | Role |
|---|---|
| [`sync-claudinite.sh`](sync-claudinite.sh) | The **legacy** fetch-at-session-start hook — the one tracked file of the pre-vendored mount (at `.claudinite/mount/sync-claudinite.sh`). Fetches the corpus tarball into `.claudinite/`, then fans out to `session-start.sh`. Retired per repo by the vendored-mount flip; deleted from the canon in phase 3 ([DESIGN.md](DESIGN.md)). |
| [`session-start.sh`](session-start.sh) | The **orchestrator**. Runs the corpus-dependent session-start steps **in sequence, in one process** (Claude Code runs hook entries in parallel, so ordering can't live across sibling entries). Forwards each step's stdout to the session context and logs a timeline to `.claudinite-hooks.log`. Method A / the canon repo invoke it directly; Method B reaches it through `sync-claudinite.sh`. |
| [`environment-setup.sh`](environment-setup.sh) | The generic **cloud-environment setup** — pasted once into a web environment's Setup script field. Primes the corpus and runs each active pack's `env.mjs install`. Identical for every project, so a consumer commits no copy of its own. |
| [`vendor.mjs`](vendor.mjs) | The **vendor-set computation** for the incoming tracked mount ([DESIGN.md](DESIGN.md)): a repo's pack declaration → the minimal corpus file set that repo persists under `.claudinite/shared/`. Not yet wired into the live mount. |
| [`inject-preferences.sh`](inject-preferences.sh) | The **preferences step**: injects the current user's `preferences/<email>.md` — local copy first, single-file HTTPS fetch otherwise (preferences are per-user and never vendored). Fail-soft: any miss is a one-line note, never a halt. |

## What deliberately stays *out* of `mount/`

The remaining session-start **steps** stay with the domain they belong to; `session-start.sh`
reaches up one level (`..`) to run them (the preferences step is the exception — per-user
content is never vendored, so its step is mount machinery, in the table above):

- `engine/packs/load-active-prose.mjs` — emits the active packs' prose.
- `engine/skills/mount-skills.mjs` — (re)generates the skill mounts.
- `engine/packs/env.mjs check` — the cloud env-requirement assertion.

The enforcement hooks stay in `checks/` (`stop-hook.mjs`, `pretooluse-guard.mjs`) and the shared
logger in `checks/lib/hooklog.mjs`. `mount/` is the *loading* story; those are separate concerns.

---
name: adopt-claudinite
description: Bootstrap Claudinite into a consuming repo — mount, hooks, checks, skills. Use when asked to bootstrap, adopt, or set up Claudinite, or to baseline a repo to pick up updates.
---

Follow [bootstrap.md](../../../../bootstrap.md) — canonical there, and idempotent by design. Under the
vendored mount it is: fetch the canon once (the one network moment), `--init` the pack
declaration + run the adoption interview, vendor the snapshot into tracked
`.claudinite/shared/` (`vendoring/apply-vendor-set.mjs` — whole-set + stamp), track it, register the
single SessionStart orchestrator plus the Stop/PreToolUse hooks at their `shared/` paths, wire the
world-scope sweep into the project's test/CI flow (its own `check_the_world.mjs` step — adding a
minimal flow if the repo has none; the Stop hook carries only the work-scope checks), open the
maintenance-enrollment issue, categorize the project, and land the sweep green.

Bootstrap is the one place `apply-vendor-set.mjs` is the right tool, and only because the repo is at
version zero: it stamps every declared pack at the newest version, and with no older state there is
nothing to skip. Read the next section before reaching for it anywhere else.

**Refreshing** an already-vendored repo is **not** a session's job, and must not be hand-rolled.
Force the repo's own update task and let the flow do it:

```
gh workflow run claudinite-scheduler.yml -f overrides=FORCE_TASKS=update
```

**Never refresh a stamped repo by running `apply-vendor-set.mjs` against it.** It advances every
declared pack's stamp to the newest version without applying the records in between, and
`migrationApplies` is `want > have` — so each record it skips stops applying *permanently*, not just
this cycle. The repo is left claiming a version whose shape it was never migrated into, and because
the stamp is the only thing that remembers, nothing downstream can tell. This is silent, and it does
not self-heal.

The update flow exists precisely because a refresh is more than laying files down: it applies the
version-ranged records, opens one reviewable PR, withholds anything bound for `.github/workflows/`
that the Action token cannot write, and ends at the apply stage when a record's rules need a reader.
A session that re-vendors by hand does none of that while looking like it succeeded.

**Never** hand-convert a legacy (fetch-at-session-start) member to the
vendored mount — that conversion is the gated flip note the nightly applies
([vendoring/DESIGN.md](../../../../vendoring/DESIGN.md), phase 2); until then legacy members are maintained
per bootstrap.md's transition appendix.

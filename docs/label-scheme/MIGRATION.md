# Label-scheme migration — the phased plan

Phases sorted by what blocks, not by subject
([writing-migration-plans](../../packs/basics/skills/writing-migration-plans/SKILL.md)).
The mechanism is [DESIGN.md](DESIGN.md); status lives in #1119. The end-state
accepts every legacy spelling at the door (the decode map), so no member has to
converge before the flip for correctness — the ordering below exists for one
reason only: the executor stub's label trigger names literal strings, and a
member whose stub predates the new spellings would stop getting event-triggered
runs the moment its engine writes them.

## Phase 0 — out-of-band setup

None. Labels are created by the engine's own ensure-if-missing pass with the
Action's `GITHUB_TOKEN`; no secret, permission, or platform setting changes.
(Confirmed against the declared stub permissions — `issues: write` is already
there.)

## Review pass — one PR stack, base-first

1. **Read side + stubs** (additive; safe on every member in any order):
   the new label constants and ensure-list entries, the one-pass decode map
   (old spelling → canonical status), and the scheduler/executor stubs — canon's
   own `.github/workflows/` copies in the same commit — triggering on old *and*
   new ready/urgent spellings and filing failure issues under the new pair.
   Nothing writes a new label yet.
2. **One-issue request mode**: adoption reads `task:origin:ad-hoc`-with-no-status
   beside `claude-task`, writes the machine block onto the marked issue itself,
   author-gates the body parameters (collaborators-permission API), and the
   task-targeted `Task:` field lands with `add-packs` folded in. Still writes old
   status spellings.
3. **Write-side flip**: the constants' values change to the new spellings —
   statuses, origins (generator writes `planned`, adoption `ad-hoc`, stubs
   `github`), janitor, dashboard decode/render, and the `claude-*` writes retire.
4. **Ride-alongs**: `product-wiki-growth` gate swapped to the approval-parked
   item; docs and check catalogs swept for the old vocabulary
   (repo-text-sweeps discipline).

The stack ships together for one review arrival; each PR stays one concern.

## Execution — after the stack is approved

1. Merge PRs 1–2. Force `fleet-baseline` with `follow` and watch it to a terminal
   state: this changes what must work on every member (stub contract), so the
   nightly is not the delivery. **Exit condition:** every member's executor
   workflow at HEAD triggers on both spellings, read from each repo's file — and
   judged by stamps, never run conclusions. If stubs turn out not to be
   re-delivered by converge (the copied-once class), stop and use the drift-issue
   lane instead; do not merge PR 3 until the read-back is true fleet-wide.
2. Merge PRs 3–4, force the fleet again, watch to terminal state. **Exit:** a
   fresh scheduler-run cycle files items wearing only new spellings (read a real
   member's queue), and open pre-scheme items still decode and drain.
3. Live open items are not mass-relabeled: the decode map covers them, and each
   converges to a terminal state under its own run. **Exit:** no open item wears
   an old state spelling (they close naturally; the janitor's torn-item repair
   writes canonical labels when it touches one).

## Tail — destructive steps, only after the cutover is observed

- Remove the old spellings from the stub triggers once no fielded engine writes
  them (read the field: members' vendored engine versions, not the calendar).
- Mark the old label series historical wherever counts are folded (the
  deleted-writer rule); never delete old label definitions — deleting a label
  strips it from closed issues, which are stored data.
- `claude-*`, `workflow-failure`, `product-wiki-growth`, `add-packs` stay in the
  decode map permanently.

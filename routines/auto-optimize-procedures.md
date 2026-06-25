# Automated daily "optimize procedures" routine

A daily, unattended agent routine that is the **only** bridge between a project's
local documentation and the shared **canon** of portable rules it consumes (a
separate, read-only repo, vendored here as a submodule). Everything else — the
on-demand "learned lessons" command, the daily lessons digest — writes **only to
local docs**; this routine is what reconciles those local docs against the canon in
both directions. Like the other daily routines it runs unattended and **most days
changes little or nothing** — the steady state is already reconciled, so a forced
move is worse than none.

It does two independent things each run; either can be a no-op.

## 1. Pull **down**: prune / rephrase local docs the canon now covers (→ a PR)

The shared canon arrives as a read-only submodule, kept current by automated
dependency-bump PRs. When the canon has **absorbed** a practice that a local doc
still carries — most often an item this routine promoted on an earlier run (see
direction 2), now merged into the canon and pulled in by a submodule bump — the
local copy is redundant. The routine:

- **Removes** the now-duplicated local item (typically from the local working-set
  practice docs, but any local doc qualifies), since the canon is the single source
  of truth.
- **Rephrases / reframes** a local procedure when the canon's wording of the same
  idea has changed, so the local docs stay consistent with the canon they point at.

These edits go out as a single **PR for review** (never an auto-merge). Only remove
a local item you can show is genuinely covered by the *current pinned* canon —
quote the canon line. When in doubt, leave it; a wrongful prune loses a real local
lesson.

## 2. Push **up**: promote generalizable local items (→ an issue, not a removal)

Scan the local docs for insights that are **portable** — they'd help unseen
projects, not just this one (general engineering/agentic practices, portable
git/GitHub procedure, working-discipline or agent-architecture principle) — and
that the canon does **not** already cover. Collect all such items and **open one
handoff-labelled issue** listing them — each entry a complete, self-contained
proposal (the canon repo won't have this project's context) stating the lesson, the
shared doc it belongs in, and why it's portable. **One issue, not one per item:** a
deterministic hand-off Action copies it to a single issue in the canon repo, where a
curation routine dedupes/routes each lesson and opens **one** docs PR for the batch
— so many proposals can't collide as separate same-doc PRs that conflict on merge.
The curator is the real filter (it confirms and dedupes against the whole corpus),
so **propose broadly and let it choose** what to keep rather than pre-filtering hard
here.

**Do not remove the promoted item from the local docs now.** Promotion is a
*proposal*; the canon may reject or reword it. Removal happens **later**, on the day
direction 1 sees the item actually land in the canon (after the canon PR merges and
a submodule bump pulls it in). So a promoted-but-not-yet-accepted item keeps working
locally in the meantime, and a rejected one simply stays local.

**Ensuring the label won't explode:** before applying the handoff label, ensure it
exists idempotently (create-if-missing, no-op if present) — so the routine never
needs the label pre-created and never errors on a re-run.

## Discipline

- Be conservative in **both** directions: a forced promotion spams the canon repo,
  a wrongful prune deletes a real lesson. Most days, few or no items qualify.
- Keep the suite green: if a PR edits a doc a test reads, run the project's offline
  test suite before pushing.
- Compare local docs against the **currently pinned** submodule canon, not a live
  fetch — the pin is what the project actually consumes, and the dependency-bump PRs
  keep it current.
- Never edit the read-only canon submodule, and never merge anything itself.

## Output & tracking

- Direction 1 produces a **PR** on a dated branch with a random suffix (the suffix
  keeps two same-day runs from colliding); direction 2 produces **one bundled
  issue**. Never a merge.
- Log each run that produced a PR or an issue as a **dated comment** on this
  routine's own standing tracking issue (found **by title**, not a hard-coded
  number; open it if missing, reopen it if it was closed while the routine is still
  producing output). A quiet day logs nothing.

## The launcher

Keep the routine's config a **thin pointer** to this doc, not an inlined spec. The
launcher prompt should say: run the daily "optimize procedures" routine exactly as
specified in this doc — reconcile the local docs against the pinned shared canon in
both directions (open a PR that prunes/rephrases local docs the canon now covers,
and open **one** bundled handoff-labelled issue listing every generalizable local
item not yet in the canon, **without** removing them locally), follow the discipline
above, keep the offline test suite green, log the run on the routine's standing
tracking issue, and never merge anything.

Schedule it daily in the agent's routine scheduler; the repo can't schedule itself,
so the doc is the spec and the routine is the trigger.

# Fleet-coverage sweep (auto-adopt uncovered repos)

Daily, fleet-level step: **every repo under the owner's account mounts Claudinite unless the owner
opted it out.** The [fleet maintenance routine](auto-all-repos-maintenance.md) by design maintains
only repos that *already* carry the opt-in marker; this sweep is its complement — it finds the
account's repos that carry **no** marker and runs the adoption bootstrap on them, so the account
converges to covered-or-opted-out and a repo created yesterday is a maintained member by tomorrow's
run. It is **sequenced by that routine** as one of its independent, unordered steps — never
scheduled on its own — and, like every fleet step, works **entirely over the GitHub API tooling**
(MCP tools, or `gh` where available), never by cloning the target repo.

## The opt-out list

**[fleet-coverage-opt-out.md](fleet-coverage-opt-out.md)** — kept next to this doc in the home
repo, so exempting a repo is one edit there (for the reference deployment, in Claudinite itself). A
repo is opted out **iff its full `owner/name` appears as an entry under that file's "Opted out"
heading** (match the name case-insensitively; the entry's reason text is for humans). Read the list
fresh from the home repo's default branch at the start of every run — never act from a remembered
copy. If the list can't be fetched or its entries can't be made out, **adopt nothing and log the
failure**: without the list you cannot tell consent from omission, and the safe default is to do
nothing.

## Which repos are uncovered

Start from the day's full fleet enumeration (the fleet routine's Step 1 keeps it — every repo the
token can access, exhaustively paged). A repo is **uncovered**, and gets the bootstrap, only when
**all** of these hold:

1. **It belongs to the owner's account** — the same owner as the home repo. The token may reach
   other owners' repos (collaborations); never adopt those.
2. **It carries no opt-in signal** — neither mount signal the fleet routine's Step 1 detects (the
   tracked `.claudinite/sync-claudinite.sh` hook / legacy `.gitkeep`, or a `.claudinite` submodule
   in `.gitmodules`). Confirm with the per-repo file checks on the repo's default branch, exactly as
   Step 1 does — a repo the search index merely lags on is covered, not uncovered.
3. **It is not archived and not a fork** — an archived repo can't take a commit; a fork's added
   wiring would ride along in PRs to its upstream. Both are standing skips, not actions: they show
   in the tracker's snapshot, never in the run log.
4. **It is not the home repo** — the canon doesn't mount itself.
5. **It is not on the opt-out list.**

## What runs against an uncovered repo

One isolated subagent per uncovered repo (the fleet routine dispatches them like its other per-repo
steps): run the **idempotent adoption bootstrap** — [../bootstrap.md](../bootstrap.md), Method B —
exactly as that doc specifies, over the API, committing **directly to the repo's default branch**
(the same no-PR policy as the fleet's re-bootstrap: mechanical, idempotent, and the owner opted into
account-wide coverage by maintaining an opt-out list instead of a review gate). First adoption
differs from the nightly re-bootstrap in one way: **do open bootstrap Part 4's enrollment issue**
(`Enroll <PROJECT_NAME> in Claudinite fleet maintenance`) — the repo is new to the fleet, and that
issue is the owner's cue to add it to the maintenance access list. The bootstrap parts that need the
owner in the loop — project classification (Part 5) and cloud environment setup (Part 8) — are
skipped unattended; note them, and any step the API genuinely can't perform, in the enrollment issue
rather than silently dropping them (the bespoke merge policy, Part 3, needs nothing by default).

A repo the sweep **can't write to** (not on the maintenance access list yet, token scope) is a
failure to surface, not to retry blindly: log it on the tracker below so the owner acts once, and
let the next day's run re-attempt idempotently.

## Tracking: standing issue in the home repo

One standing tracker in the home repo, found **by title** `Claudinite fleet coverage` — open it if
absent, reopen it if it was closed while something still needs logging; never a fresh issue per run,
never a bare number that can dangle.

- **Body** — the current coverage picture, dated at the top: covered count, the opt-outs in force,
  the standing skips (forks, archived), and any repo pending owner action. Rewrite it only when the
  picture changed.
- **Comments** — a dated comment for each run **that did something**: every repo bootstrapped, and
  every failure (a bootstrap that couldn't complete, a repo the token couldn't write to, an
  unreadable opt-out list) — name the repo and the symptom.
- **A clean day writes nothing** — no adoptions, an unchanged picture, no writes anywhere.

## Run on a capable model

Detection is mechanical, but the bootstrap it dispatches makes judgment calls — merging the import
line and hook registrations into an existing `CLAUDE.md` / `settings.json` without clobbering what's
there. Run the sweep's subagents on a capable model.

## Never

- **Never adopt outside the owner's account, or a fork, an archived repo, or the home repo** — no
  matter what the enumeration returns.
- **Never adopt a repo on the opt-out list — and never treat an unreadable list as an empty one**;
  abort the sweep and log instead.
- **Never uninstall.** The list gates *adoption*, not removal: a covered repo later added to the
  opt-out list is simply left alone, and unmounting it is the owner's manual call.
- **Never open a PR for an adoption, and never register a separate schedule** — adoption commits
  directly under the fleet's no-PR re-bootstrap policy, and this sweep runs only where the fleet
  routine sequences it.
- **Never skip the enrollment issue on a first adoption** — the re-bootstrap's skip-and-close rule
  applies to already-enrolled members only.

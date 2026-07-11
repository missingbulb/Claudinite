# Fleet bootstrap sweep (adopt the uncovered, re-bootstrap the members)

Daily, fleet-level step that owns **all bootstrap work across the fleet**: after it runs, every repo
under the owner's account mounts Claudinite **with current wiring** — or is explicitly opted out.
One idempotent operation ([../bootstrap.md](../bootstrap.md), Method B, the content of the
`adopt-claudinite` skill), applied to two populations:

- **Members** — repos already carrying the opt-in marker — get a **re-bootstrap**: a refresh of
  whatever mount wiring has drifted.
- **Uncovered repos** — the owner's repos carrying **no** marker, minus the
  [opt-out list](fleet-bootstrap-opt-out.md) and the standing skips below — get an **adoption**:
  their first bootstrap.

It is **sequenced by the [fleet maintenance routine](auto-all-repos-maintenance.md)** as one of its
independent, unordered steps — never scheduled on its own — and that routine dispatches it like its
other steps: **one isolated subagent per target repo**. Like every fleet step it works **entirely
over the GitHub API tooling** (MCP tools, or `gh` where available), never by cloning the target
repo. Member-side changes land **directly on the target repo's default branch by default** — no PR:
mechanical, idempotent regeneration the owner has opted not to gate (the review-gates-by-blast-radius
choice documented in [../growth/README.md](../growth/README.md)) — unless the member itself opts into
PR delivery via the per-member flag (see "Delivery" below).

## Members: the re-bootstrap

Run against **every member repo** (never the home repo — the canon doesn't mount itself). It
refreshes the consumer's mount and *wiring* — the only step that renews the parts that **don't**
self-update at session start: the `sync-claudinite.sh` generated artifact, the `settings.json` hook
registrations, the `.claude/skills/` symlinks, the gitignore rules, the pack declaration (Method B
re-syncs the corpus *contents* each session, but never this wiring; Method A's pinned submodule
drifts in both). Most days nothing has drifted and it commits nothing — the owner's "try to
re-bootstrap" is exactly that: attempt it every day, act only when there's drift. It runs safely
concurrent with the growth phases because they touch different files (growth writes a project's
local docs; the re-bootstrap only the wiring above).

Reaching a member also proves the repo is already on the maintenance access list, so a re-bootstrap
**skips opening bootstrap Part 4's enrollment issue** — there's nothing left to request — and that
same proof **closes** it: if the enrollment issue (title
`Enroll <PROJECT_NAME> in Claudinite fleet maintenance`, found **by title**) is still open, close it
(`completed`) with a one-line comment noting maintenance now reaches the repo. Idempotent — most
days it's already closed and there's nothing to do.

## Aligning members with the canon's current rules and checks

The wiring refresh keeps the *mount* current; alignment keeps the *repo* current. When the canon
moves — a new conformance check lands, a rule's remedy changes, a generated artifact is renamed — a
member drifts without anyone touching it, and nothing fixes it until someone happens to work there.
So each member run also **evaluates the repo against its own declared packs' current checks** (the
same engine and rule modules its Stop hook and CI run, applied over API-read files — or a tarball
where the environment allows) and **applies the aligning fix** when a failing check's own `fix`
instruction states the remedy — mechanical, scoped to the files the violated rule governs.

The write surface stays hard-bounded (this is an unattended agent editing consumer repos):

- **Fix only what a failing check names**, exactly per that check's stated remedy — never refactor
  around it, never touch product logic beyond it.
- **A finding that needs judgment** — the remedy is directional, the change would alter behavior,
  or there's any doubt — is **not edited**: open an issue in the member repo naming the finding and
  the suggested remedy, and move on.
- **Deliver like every member-side change** — per the member's delivery flag (below).
- Most days there are no new violations: no edits, no issues, nothing to log.

## Delivery: push or pull request (the per-member flag, always explicit)

Every member's `.claudinite-checks.json` carries the flag **explicitly**:

```json
{ "maintenance": { "delivery": "push" } }
```

- **`push`**: commit member-side changes (the wiring refresh, the alignment fixes) directly to the
  member's default branch.
- **`pr`**: put the change on the stable automation branch `claudinite/maintenance`, open a PR to
  the member's default branch, and **never merge it** — the owner gates. Idempotent across nights:
  while that PR is open, amend the same branch and PR; never stack a second one.

There is deliberately **no implicit default** — the value is materialized into every settings file,
so the selection sits visibly in the file where anyone would go to change it, and a missing key is
**drift the re-bootstrap repairs**, not a case to interpret (the engineering-practices lesson on
avoiding default values). Concretely: `--init` seeds `"push"` into a fresh file, so an adoption
carries the flag from its first commit; the re-bootstrap **adds `"maintenance": { "delivery":
"push" }` to any member file missing it** — that write necessarily lands as a direct commit (a
member without the flag never chose gating, and this is the one-time write that removes the
ambiguity). A flag whose value is **unrecognized** gets the unreadable-opt-out-list treatment:
make **no** member-side commits to that repo, open an issue there naming the bad value, and let the
owner fix it — never guess a gate preference.

Read the flag fresh from the member's default branch each run.

## Uncovered repos: the adoption

Start from the day's full fleet enumeration (the fleet routine's Step 1 keeps it — every repo the
token can access, exhaustively paged). A repo is **uncovered**, and gets adopted, only when **all**
of these hold:

1. **It belongs to the owner's account** — the same owner as the home repo. The token may reach
   other owners' repos (collaborations); never adopt those.
2. **It carries no opt-in signal** — neither mount signal the fleet routine's Step 1 detects (the
   tracked `.claudinite/sync-claudinite.sh` hook / legacy `.gitkeep`, or a `.claudinite` submodule
   in `.gitmodules`). Confirm with the per-repo file checks on the repo's default branch, exactly as
   Step 1 does — a repo the search index merely lags on is covered, not uncovered. A **denied** file
   check means **unknown, not uncovered** — the repo isn't on the run's access list and can't be
   classified at all: log it as unreachable-pending-grant (see Tracking) and never attempt adoption
   on it.
3. **It is not archived and not a fork** — an archived repo can't take a commit; a fork's added
   wiring would ride along in PRs to its upstream. Both are standing skips, not actions: they show
   in the tracker's snapshot, never in the run log.
4. **It is not the home repo** — the canon doesn't mount itself.
5. **It is not on the opt-out list.**

Adoption is the same idempotent bootstrap with the enrollment flow inverted: the repo is new to the
fleet, so **do open bootstrap Part 4's enrollment issue** — it's the owner's cue to add the repo to
the maintenance access list. The bootstrap parts that need the owner in the loop — project
classification (Part 5) and cloud environment setup (Part 8) — are skipped unattended; note them,
and any step the API genuinely can't perform, in the enrollment issue rather than silently dropping
them (the bespoke merge policy, Part 3, needs nothing by default).

Discovery and access are **separate gates**: account-wide enumeration (the GitHub App's reach) can
surface a repo whose *contents* the run still can't touch — per-repo read/write access comes from
the environment's access list, and an unattended run can never grant itself a repo. A repo the
sweep can see but not read or write is a failure to surface, not to retry blindly: log it on the
tracker below as unreachable-pending-grant so the owner acts once, and let the next day's run
re-attempt idempotently. The durable per-repo queue is kept by the coverage census (below) as one
adoption issue per repo; the tracker logs what each sweep run encountered.

## The opt-out list (gates adoption only)

**[fleet-bootstrap-opt-out.md](fleet-bootstrap-opt-out.md)** — kept next to this doc in the home
repo, so exempting a repo is one edit there (for the reference deployment, in Claudinite itself). A
repo is opted out **iff its full `owner/name` appears as an entry under that file's "Opted out"
heading** (match the name case-insensitively; the entry's reason text is for humans). Read the list
fresh from the home repo's default branch at the start of every run — never act from a remembered
copy. If the list can't be fetched or its entries can't be made out, **adopt nothing and log the
failure**: without the list you cannot tell consent from omission, and the safe default is to do
nothing.

The list gates **adoption**, nothing else. A repo that already mounts the corpus is maintained by
its own committed marker — listing it here neither stops its re-bootstrap nor uninstalls anything.
To genuinely withdraw a covered repo: unmount it in that repo (remove the marker and wiring), **and**
list it here so the next day's sweep doesn't just re-adopt it.

## The coverage census (deterministic, in GitHub Actions)

Knowing the fleet's coverage must not depend on what any session's token happens to see, so the
home repo also runs a **daily deterministic census**:
[fleet-coverage.yml](../.github/workflows/fleet-coverage.yml) runs
[check-fleet-coverage.mjs](check-fleet-coverage.mjs) with a `FLEET_GITHUB_TOKEN` secret
(fine-grained PAT: this account, **all repositories**, Contents + Metadata read, Issues
read/write), so its reach never shrinks to a session allowlist. It enumerates every repo under the
owner, classifies each by the same signals as the sweep (covered / uncovered / opted-out / skipped
fork-or-archived), publishes the picture in the run summary, and **converges one adoption issue per
actionable uncovered repo** in the home repo — title `Adopt <owner>/<repo> into the Claudinite
fleet`, label `fleet-adoption`:

- **Uncovered, not opted out, no open issue** → open it (or reopen a *completed*-closed one whose
  repo is still uncovered; a *not-planned* close is the owner declining and is left alone — the
  standing form of "no" is the opt-out list).
- **Open issue whose repo is now covered / opted out / gone** → close it (`completed` /
  `not_planned`) with a one-line comment.
- **A marker check that errors** → the repo is **unknown, not uncovered** (the sweep's own rule):
  no issue, and the run fails so the cause escalates through the workflow-failure path.

The adoption issue is the owner's one manual step — grant the repo to the maintenance routine's
environment, or opt it out — and the machinery does the rest: the next nightly sweep adopts what
got granted, and the next census closes the issue. The census itself **never bootstraps, commits
to, or otherwise touches any repo**: it is read-only knowledge plus the queue in the home repo.

## Tracking: standing issue in the home repo

One standing tracker in the home repo, found **by title** `Claudinite fleet coverage` — open it if
absent, reopen it if it was closed while something still needs logging; never a fresh issue per run,
never a bare number that can dangle.

- **Body** — the current coverage picture, dated at the top: covered count, the opt-outs in force,
  the standing skips (forks, archived), and any repo pending owner action. Rewrite it only when the
  picture changed.
- **Comments** — a dated comment for each run **that did something**: every repo adopted, and every
  adoption-side failure (a bootstrap that couldn't complete, a repo visible but unreachable —
  pending the owner's grant, an unreadable opt-out list) — name the repo and the symptom.
- **A clean day writes nothing** — no adoptions, an unchanged picture, no writes anywhere.

The member re-bootstrap logs nothing here: a drift refresh is recorded by its own commit, and a
member run that fails to complete lands on the fleet routine's failure log like any other subagent.

## Run on a capable model

Detection is mechanical, but the bootstrap it dispatches makes judgment calls — merging the import
line and hook registrations into an existing `CLAUDE.md` / `settings.json` without clobbering what's
there. Run the sweep's subagents on a capable model.

## Never

- **Never run against the home repo** — neither half; the canon doesn't mount itself.
- **Never adopt outside the owner's account, or a fork, or an archived repo** — no matter what the
  enumeration returns.
- **Never adopt a repo on the opt-out list — and never treat an unreadable list as an empty one**;
  abort adoption and log instead.
- **Never treat a denied marker check as "no marker"** — unreachable means unknown: log the repo as
  pending-grant and move on; adoption waits for access.
- **Never uninstall.** The list gates *adoption*, not removal: a covered repo later added to the
  opt-out list is simply left alone, and unmounting it is the owner's manual call.
- **Never let alignment edit beyond a failing check's own remedy** — a judgment-needing finding
  becomes an issue in the member repo, not an edit.
- **Never open a PR the member didn't opt into, and never merge one** — direct commit is the
  default; a PR happens only under the member's `pr` flag, and only the owner lands it.
- **Never register a separate agent schedule** — the sweep runs only where the fleet routine
  sequences it (the deterministic census workflow is CI, not a second maintenance routine).
- **Never open the enrollment issue on a re-bootstrap, and never skip it on an adoption** — being
  reached proves a member enrolled (close a lingering one instead); an adopted repo isn't enrolled
  yet, and the issue is the owner's only cue.

# Provenance — the decision log behind every pack element

> **Status: not implemented.** A design under discussion; nothing below describes how the
> repository works today.

A pack carries guidelines, and each guideline reaches a session through one or more **carriers**:
a rule in `RULES.md`, a skill with its load triggers, a coded or declared check, a task with its
policy. The carriers say *what* to do, and they are rationed to that. Nothing in them says why
they read as they do, who decided, from what evidence, why this carrier and not another, or what
would have to become true for the guideline to go. That record is **provenance**: one append-only
file per element, in a `provenance/` folder beside the carriers, read by maintenance and never by
a working session.

| Surface | Question it answers | Who reads it |
|---|---|---|
| the carriers — `RULES.md`, `skills/`, the checks, `tasks/`, `pack.mjs` | what does a session do | every session in every repo that declares the pack |
| `provenance/<element>.md` | why the element is as it is, and what would retire it | the growth and curation passes, a promote run, a maintainer |

Provenance is a log of decisions. It is never a description of the current rule: an entry that
restates what the carrier says is wrong by construction, and a reader who wants the rule reads the
carrier.

## 1. The element and its file

An **element** is one guideline the pack maintains. It has exactly one provenance file, named by a
slug chosen when the file is created and never renamed afterwards (a rename breaks every entry that
cites it). The file's header **binds** it to the carriers that state the guideline:

| Binding | Names | Identity |
|---|---|---|
| `rule: <file> — <trigger>` | a top-level bullet in `RULES.md`, or in another prose file of the pack | its bold trigger phrase, whitespace-normalized |
| `skill: <name>` | a `skills/<name>/` directory: the body, the description, every `force-load-on-*` trigger | the directory name |
| `check: <id>` | a coded rule module or a declared check | the check id |
| `task: <id>` | a `tasks/<id>/` declaration: preconditions, `expected_outcome`, `automerge`, the worker | the task id |
| `pack: <id>` | the manifest: fingerprint, `requires`, routing guidance, seeding, and the pack's own existence and name | the pack id |

A rule is bound by its trigger, not by a marker in the prose: the trigger is the phrase a
maintainer already scans for, and binding on it costs the injected prose nothing. The cost falls
where it belongs — a change that rewords a trigger is a decision about the rule, and the same
change updates the binding and writes the entry that says why.

One file normally covers one carrier. It covers several when they are one guideline: a prose rule
and the check that enforces its checkable half, a rule and the skill it delegates to. The rule is
independence where it is real and one file where it is not; a carrier is covered by exactly one
live file, and a check or a skill is never split across files.

A skill is one element. Where a bullet inside a skill has its own decision history, an entry names
the bullet in its title and the file stays the skill's — the skill's own `SKILL.md` is the one
carrier and the bullets are not enumerated as elements, which is what keeps a long procedure from
minting thirty files.

Stubs and migrations are not elements: their rationale is their own module header, and the
decision to ship them is a `pack.md` entry. Contributed rules, merge rules and adoption questions
are manifest-level and belong to `pack.md` too.

### The file

```
---
covers:
  - rule: RULES.md — Matching a host with `chrome.events.UrlFilter`
status: live
---

## 2026-07-18 · born · promoted from a member's local pack (#319)
- **Source:** the member's own site rule, gated on `PageStateMatcher.pageUrl`, matched a
  lookalike host.
- **Reason:** `hostSuffix` is a raw string suffix, so `example.com` also matches
  `evilexample.com`; nothing in the API says so at the call site.
- **Actor:** automation `growth-promote`, merged by the owner.
- **Model:** as the landing commit's trailer names it.
- **Mechanism:** prose. A check would have to know which behaviours are origin-sensitive; the
  signature (a bare `hostSuffix`) is not the violation.
- **Rejected:** none recorded.
- **Retire when:** Chrome documents `hostSuffix` as label-bounded, or `UrlFilter` is removed.
- **Evidence:** #319.

## 2026-07-27 · reworded · the corpus-wide "when + what + one non-obvious fact" pass (#467)
- **Reason:** the `hostContains` clause and the lookalike sentence restated the rule; both cut.
- **Actor:** owner.
- **Evidence:** #467, per basics' rule-writing method.
```

The **header** is a line grammar, read without a YAML library: `covers:` followed by `  - <kind>:
<ref>` lines, then `status: live` or `status: retired`. The header is the only part of the file
that is ever edited, and only when `covers` or `status` change.

An **entry** opens `## <YYYY-MM-DD> · <kind> · <one line>` and carries bold-labelled fields, one
per bullet, continuation lines indented. Entries are appended in date order and never edited.

The **kinds** are closed: `born`, `reworded`, `strengthened`, `weakened`, `split`, `merged`,
`moved` (a carrier change — rule to skill, pack to pack), `converted` (prose to check),
`trigger-changed` (a skill's load trigger or description), `policy-changed` (a task's `automerge`,
`expected_outcome` or preconditions), `severity-changed`, `reaffirmed`, `promoted`, `retired`.
`strengthened` and `weakened` are the modality grade — "must" to "should" is a decision, and the
kind says which way it went.

The **fields**: `Source` (where the lesson came from — an incident, a document, a request, a
capture), `Reason`, `Actor`, `Model`, `Mechanism` (the ladder rung it landed on, and why the rungs
above it could not carry it), `Rejected` (the alternatives, each with its drawback), `Retire when`
(the test a future review reaffirms the element against), `Evidence` (pull requests, issues,
commits, a capture's date and session id). A `born` entry carries all eight; where the evidence
does not carry one, the value is `unrecovered`, never a plausible guess. A later entry carries the
fields the decision touched.

`Actor` names a role or, in a repo-local pack, a GitHub handle: `owner`, `maintainer`,
`contributor`, or `automation <task-id>`. Never an email: the git author line already carries what
it carries, and a second copy in a file outlives a history rewrite. `Model` is what the harness
tells the appending session, or the landing commit's trailer when written after the fact, and is
`unknown` when neither says.

### What is a decision

An entry is owed for any change to a carrier's normalized text, to a skill's trigger or
description, to a task's policy, to a check's severity, scope or gate; for a conversion, a split,
a merge, a move or a retirement; and for a reaffirmation that produced **new** evidence or changed
`Retire when`. No entry is owed for whitespace, a code comment in a coded check, a fixture, a
test, a README row, a version bump, or a reaffirmation that found the recorded reason still holds
— that run's pull request body is its record, and a row that says "still true" every week is the
data explosion this design refuses.

A sweep that rewords many elements under one guideline change writes one entry per affected
element, one line each, citing the decision once where it was made — which is itself an element
change: the rule that states the guideline (in `basics` or `claudinite-growth`) carries the full
entry, and every moved or reworded element cites it.

### `declined.md`

Beside the element files, a pack keeps one unbound log of the candidates it turned down: each
entry `## <date> · declined · <the candidate in a few words>` with `Source`, `Reason` and
`Actor`. An extraction pass that drops a candidate worth remembering, and a conversion pass whose
verdict is "not checkable" or whose owner said no, write here; the next pass reads it before
nominating. A technical verdict is re-derivable later and says so with its date; an owner's
rejection is settled.

## 2. Where it lives, and what never touches it

- **Location.** `packs/<pack>/provenance/` in a canon; `.claudinite/local/packs/<pack>/provenance/`
  in a member. The tree declares it, as it declares the rest of a pack.
- **Never vendored.** The vendor set drops a pack-root `provenance/` the way it drops `test/`,
  `docs/` and `updates/`, pinned by a test over the real corpus so the exclusion cannot go vacuous.
  A member mounting a canon pack receives the guidelines, not the reasoning, and never another
  organisation's decision log.
- **Never loaded.** No `@` import, no skill mount, no session-summary token count. The folder's
  size is invisible to a session by construction.
- **Never barrier-scanned.** A provenance file references what it explains — other packs, `docs/`,
  member repositories, retired mechanisms — so the barrier config carves `provenance/` out of every
  guarded region. Where the carve-out grammar cannot spell a folder one level below a `siblings`
  root, the grammar gains that form; never a bespoke exclusion in the scanner.
- **Opaque to every pack-walking check that judges carriers** — the rule-index drift guard, the
  prose size band, the doc-pointer resolver, the enforcement-narration check: a file under
  `provenance/` is neither prose nor code to them.

## 3. Who writes, and with what

Every flow that creates or changes an element appends, in the same change:

| Flow | Appends |
|---|---|
| `growth-extract` (activity and conversations) | `born` per landed lesson; a conversation-born lesson's `Source` names the capture's date and session id; `declined.md` for a candidate dropped for a reason worth keeping |
| `prose-to-checks` and `canon-prose-to-checks` | `converted` on the element, carrying the deletion-test verdict (prose deleted, or kept and why); `declined.md` for a rule judged not checkable, dated |
| `growth-dedup` | `retired` (superseded by the canon element it names), `weakened` (a strip), `reworded` |
| `rule-revalidation`, `canon-rule-revalidation`, `revalidate-from-source` | `reaffirmed` only with new evidence or a changed `Retire when`; `reworded` or `retired` for a correction |
| `growth-promote` | on the canon side the local file, reduced (§4), plus a `promoted` entry; the local file stays until dedup retires it |
| `generate-project-instructions`, `learning-a-technology` | `pack.md` and one `born` per element, citing the evidence set or the dated sources |
| an attended session editing a carrier | the skill the edit force-loads (`writing-pack-prose` for prose, `writing-repo-scanning-checks` for a check, `writing-tasks` for a task) ends with the append |

The mechanics are one helper, `provenance.mjs` in `claudinite-growth`, vendored so a member runs it
from the mount and the canon from the repo root:

| Command | Does |
|---|---|
| `mark <pack>` | enumerates the pack's elements and creates a header-only file for each one no live file covers, with a proposed slug |
| `append <pack> <element> --kind <kind> [--changed]` | validates and appends the entry read from stdin; `--changed` appends the same entry to every element the working tree's diff touched |
| `check <pack>` | the parser the check uses, run by hand |
| `convert-references <pack>` | the migration of a `references.md` (§6) |
| `reduce <file>` | the promotion reduction (§4) |
| `history <pack> <element>` | the backfill brief: the carrier's commits through every rename, a pickaxe on the trigger, the pull requests those commits name, the `VERSIONS.md` rows naming them, a README provenance line, the tracker comments |

`append` refuses an entry that matches the capture scrub's secret patterns: a decision log is prose
an agent writes, and the one place a token could land is the one place nothing else scans.

## 4. Promotion, and the reduction that makes a shared canon safe

A lesson promoted from a member's local pack travels with its provenance: promote copies the
element's file into the canon pack's `provenance/` (slug kept unless it collides, then suffixed)
and appends `promoted · from a member's local pack (<canon PR>)`. The canon's version of the file
is therefore the full history of the guideline, not a history that starts at promotion.

What must not leave the repo is rewritten before the copy lands:

| In the local pack (stays as written) | In the canon (after `reduce`) |
|---|---|
| `Actor` — a GitHub handle or a role | a role only |
| a session link | dropped |
| a quoted phrase (at most one sentence, as the extraction skills already limit) | dropped; the paraphrase stays |
| `owner/repo#n` references | kept when the canon repository is private; `a member repository` when it is public — read from the API at promote time, never a setting |
| product, file and path names in `Source` | generalized, as the promoted rule itself is |
| `Model`, dates, kinds, `Reason`, `Mechanism`, `Rejected`, `Retire when` | kept |

The policy is structural — what crosses a repository boundary is reduced — so no member configures
an identity policy and no canon has one to get wrong. A promote pull request is owner-gated
(`automerge: nothing`) exactly as today, so a reviewer's eyes are the last guard on what the
reduction is not built to see: a product name inside a `Reason`.

## 5. Pack kinds

| Kind | Provenance | Actors named as | Crosses a boundary |
|---|---|---|---|
| repo-local pack (`.claudinite/local/packs/`) | required; the origin of most decisions | handle or role | only through promote, reduced |
| canon pack (`packs/`), hidden packs included | required | role | vendored never; forked by clone with the folder intact |
| the home's structural local pack | as a repo-local pack | handle or role | never |
| organisation pack (a second canon in the organisation's registry) | as a canon pack; the organisation's release task is a promote target and source like any other | role | as a canon pack |
| vendor-authored pack | as a canon pack in the vendor's repository; a consumer never receives it | role | never; a consumer's decision *about* it — an `accept` waiver with its `reason`, an override that names the element's id — lives where it is declared and needs no file |
| process and rules-of-thumb packs (`basics`, testing, git) | as a canon pack; `Source` cites the practice, book or incident; `Retire when` may be a judgment ("the practice is abandoned corpus-wide") and says so | role | as a canon pack |
| a pack minted from project evidence | `pack.md`'s `born` cites the evidence set or the dated sources | role | as a canon pack |
| a stub pack with no rules | `pack.md` only | role | as a canon pack |
| personal preferences (`<email>.md` in the store) | not a pack: the person is the actor and the request is the reason; an optional per-person log in a sibling folder of the store, never promoted, never required | the person | never |

A consumer that forks an element from a canon into its local pack (an override) writes a `born`
entry citing the canon element it overrides; the canon's file is not copied down.

## 6. Backfill, conversion, and the standing mechanism

Two things bring existing packs onto the convention, and both are mechanisms rather than passes
someone remembers to run.

**Marking is one mechanical pass.** `mark` over every pack creates a header-only file per
uncovered element. From that commit every element is bound, the integrity check (§7) holds, and
the only thing missing is history.

**Filling is a task, one pack per run, until no header-only file remains.** The backfill task —
`provenance-backfill` in `claudinite-growth` over a member's local packs, its twin in
`claudinite-canon-curation` over the shelf — has the precondition "a header-only provenance file
exists under the corpus", runs weekly and is woken by hand for the first pass. Each run takes one
pack: `history` gathers the evidence per element, the agent derives the `born` entry and the
decision-bearing entries from that source **before** re-reading the rule, then diffs against what
the rule implied. A fact the evidence does not carry is `unrecovered`; a fabricated rationale
would let a future review reaffirm a rule on false grounds, which is worse than no rationale at
all. The task's pull request is one pack's backfill, reviewed as such.

**`references.md` converts mechanically.** `convert-references` turns each entry into an entry
of the element it keys — `RULES-n` resolves through the rule carrying the marker `(n)`,
`<skill>-n` to that skill, `check:<id>` to that check — as a `born` entry dated by the entry's
own adding commit, its reaffirmation sentence as `Retire when`, the rest as `Reason` and
`Evidence`; then strips the markers from the prose and deletes the file. A pack-root
`references.md` that still exists is a finding: advisory through the conversion window the
migration states, blocking after it, with the command in the fix text. In a member, the backfill
task runs the conversion as its first step.

**Existing README provenance paragraphs** ("distilled from …") move into `pack.md` with the same
pass: a README vendors, and that sentence is the one thing in it a third party should not receive.

## 7. The check: `provenance-integrity`

A coded rule in `claudinite-growth` (a declared check cannot read a bullet whose bold trigger
wraps), over both roots, replacing `references-integrity`.

World scope, blocking:

1. every element in every owned pack is covered by exactly one live file; a carrier covered twice
   or not at all is a finding naming the carrier;
2. every binding resolves — the trigger exists in the named file, the id exists in the pack;
3. every file parses: the header grammar, the entry grammar, a kind in the vocabulary, dates in
   order;
4. a file with entries opens with `born`; a header-only file is reported as pending history, at
   advisory, since it is the backfill task's worklist and not a defect;
5. a pack-root `references.md` is the migration finding above.

Work scope, blocking:

6. a carrier whose normalized text changed in this change is covered by a file that gained an
   entry in this change — comments stripped, whitespace collapsed, a marker-stripping conversion
   commit exempt by its `since`;
7. a provenance file changed in this change lost no line below the header, and its new lines
   follow the last existing entry;
8. a carrier deleted in this change is covered by a file whose status became `retired` with a
   `retired` entry in the same change — a removed-lines check cannot see a deleted file, so the
   deletion is asserted from the tree's side.

The work-scope half is what makes the convention hold for a hand edit: the skill says append, and
the Stop hook says so again when the session did not.

## 8. Invariants

1. Every live carrier has exactly one live provenance file, and every live file covers at least
   one live carrier.
2. Below its header a provenance file only grows; the header changes only when `covers` or
   `status` do.
3. No entry describes the current rule. The carrier is the description; the entry is the
   decision.
4. Nothing under `provenance/` reaches a session, a member's mount, a barrier scan, or a check that
   judges carriers.
5. What crosses a repository boundary is reduced (§4); what stays is written as the repository's
   own norms allow.
6. Unknown is written as `unrecovered`. Nothing is invented, and nothing is deleted to look
   complete.
7. A reaffirmation with nothing new writes nothing.

## 9. Sizing, and the failure modes stated

**Size.** The canon shelf holds roughly 560 rules, 150 checks, 60 skills, 40 tasks and 38 packs:
about 850 files, most under 2 KB, one to four entries each across a year of decisions; the home's
own local pack adds about 185. Per element the growth flows append perhaps twice a year; the
folder grows with decisions, not with runs, because §1 refuses the "still true" row. A pack
deletion removes its folder; git keeps the history, as it keeps everything else.

- **Two runs append to one element the same night.** Both change the same end of the same file
  and git reports a conflict; the resolution keeps both entries in date order. It is rare by
  construction — two runs deciding about one element at once is a conflict on the element itself —
  and it is the whole answer to the merge hazard that ruled out an aggregate changelog: per-element
  files collide only on the element, never on the line every run would append to.
- **A sweep rewords forty triggers.** Forty bindings change and forty one-line entries are owed;
  `append --changed` writes them and rebinds each trigger from the diff's removed and added bold
  spans in position. Without the helper the check fails the sweep's change forty times, which is
  the mechanism working.
- **A trigger is reworded and the binding is not.** The change fails the work-scope check; the
  rewording is the moment the entry was owed.
- **Two rules share a trigger in one file.** A binding conflict, reported; the second rule takes a
  distinct trigger, which it needed for readers anyway.
- **A promoted slug collides.** Suffixed on the canon side; the local file is never renamed.
- **A whole element is deleted.** The file stays, `status: retired`, with the `retired` entry: the
  decision to remove is a decision. A retired file binds nothing and costs nothing.
- **Private text reaches the canon.** The reduction removes what it is built to see; the
  owner-gated promote pull request is the guard for what it is not; the scrub refuses a secret at
  append time.
- **A backfill fabricates.** `unrecovered` is the required spelling of a gap, every entry cites its
  evidence, and one pack per pull request keeps the review readable.
- **A session edits a carrier without appending.** The work-scope check fails the change at the
  Stop hook with the `append` command in the fix.
- **A vendored copy leaks the folder.** The vendor-set test asserts over the real corpus that no
  `provenance/` path vendors, in the same test that pins `test/` and `docs/`.

## 10. Decisions and their alternatives

- **One file per element, in a folder** — over one `provenance.md` per pack. A single file is the
  aggregate changelog the growth pack already refuses: every run appends to the same file, two
  runs a night collide on it, and one element's history is interleaved with every other's. A folder
  of files makes each element's history its own file, its own `git log`, and its own copy on
  promotion. The cost is the file count, paid by no session and no member.
- **Binding a rule by its trigger phrase** — over a numbered marker at the end of every rule. A
  marker is a stable id, but every rule pays two or three tokens for it in every session of every
  declaring repo, and nothing forces the marker's entry to be written when the rule changes; the
  trigger costs nothing and its rewording is exactly the moment an entry is owed. The drawback is
  that a rule's identity in the file name is a slug someone chose, and a reader mapping prose to
  files goes through the header rather than a number in the prose.
- **A Markdown log with a line grammar** — over JSON or JSONL. A JSON array cannot be appended to;
  JSONL can, but a reviewer reads a decision log in a pull request and a maintainer reads it
  cold, and neither reads JSONL. The grammar is small enough to parse without a library.
- **Written at decision time** — over a log derived from git after the fact, as `VERSIONS.md` is.
  Git carries what changed; it never carries why, which alternative lost, or what would retire the
  result. Those exist only in the head of whoever decides, at the moment they decide.
- **Never vendored** — over shipping provenance to members so a session could read a rule's
  reason. A session that needs the reason to apply a rule has a rule that lacks its consequence
  clause, which is the prose's defect to fix; and a member's mount would carry every organisation's
  decision log, which is the privacy failure §4 exists to prevent.
- **A skill is one element** — over binding every skill bullet. A long skill is procedure, and
  procedure changes as a whole; thirty files for one skill is noise, and a bullet with its own
  history is still legible as a titled entry in the skill's file.
- **`declined.md` per pack** — over a tracker issue's comment feed. A comment feed is one
  scrollable history for every candidate in the corpus; a per-pack file is read by the pass that
  is about to re-nominate in that pack, which is the read that prevents the rework.
- **Roles in a canon, handles allowed locally** — over one identity policy everywhere. A local pack
  already sits beside a git log that names its authors; a canon is read by people who never saw
  that repo. The boundary is the policy.

## 11. What the log buys beyond the record

- **Revalidation reads `Retire when` per element, with the history behind it**, rather than one
  sentence that was overwritten at the last correction.
- **Conversion passes stop re-deriving**: `declined.md` and `converted` entries are the memory the
  prose-to-checks skill already asks for.
- **Promotion carries strength**: a canon reviewer reads that a lesson was born in one member,
  reaffirmed in another, and converted to a check in a third.
- **Conflicts between rules become resolvable**: both sides' reasons and evidence are in front of
  whoever judges them, and a rule born from an incident is weighed differently from one born from
  vendor documentation.
- **A false premise is findable**: when a platform changes, grepping `provenance/` for the source
  (a documentation URL, a Chrome version, an API name) lists every element that rests on it.
- **Demotion has a denominator**: a check's blocking-firing rate is read against the reason it was
  written, not against a guess.
- **Attribution becomes data**: which decisions were a person's and which a model's, and which
  model — read as a window against the previous window, never as a total — so a retirement rate
  per authoring model is a number something measures.
- **The conversion inventory's class column becomes derivable** from `converted` and `declined`
  entries instead of hand-dated corrections.
- **An audit can answer what shaped the rules**: incidents, documents and requests, and never a
  member's product source.

## 12. Retrospective brief

Filed at the merge that completes the mechanism, horizon one week after the marking pass lands
on `main`; a second reading a week after the backfill task's precondition first reads false.

- **Expected amounts.** One marking commit creating a header-only file per element (about 850 on
  the shelf, 185 in the home's local pack; the count is `mark`'s own report and the file count
  under `provenance/`). Backfill: one pull request per run, one pack each, so about 36 canon runs
  and one local; forced daily the shelf completes inside two weeks, weekly inside a season. Growth
  flows: a handful of `born` entries a week fleet-wide, read from the extract pull requests'
  diffs; zero `reaffirmed` entries from a revalidation run that found everything still true.
  `references.md` files on the shelf: 21 before the conversion, 0 after; in members' local packs
  the same fall on each member's first backfill run.
- **Expected behaviours.** Every promote pull request carries a reduced provenance file per
  promoted lesson (read from the promote PR's diff). A hand edit of a carrier in an attended
  session appends in the same commit (read from the `provenance-integrity` firing counts in the
  usage fold: a firing that the session then fixed is the check working; a firing rate near zero
  with carrier edits flowing means sessions append unprompted).
- **Misuse.** An entry that restates the rule; an edited entry (a removed line below the header,
  which the check reports); an `Actor` that is an email; a session link or a quote in a canon
  file; a provenance path in a member's mount.
- **Overuse.** `reaffirmed` entries with no new evidence; sweep entries longer than a line; a
  `declined.md` that grows by more than a few entries a week in one pack; backfill runs that end
  with every field `unrecovered` for a pack whose history is plainly in git.
- **Underuse.** Elements still header-only a season after marking; extract runs whose diff adds a
  rule and no entry (only possible outside a Stop hook — a direct API write — and the check on
  the branch would say so); promote pull requests with no provenance file beside a promoted rule.
- **Per decision, what would show the alternative was right.** Trigger binding: sweeps failing
  the work-scope check more than once each, or bindings drifting (a resolution failure on `main`)
  — the marker was cheaper after all. One file per element: conflict resolutions on
  `provenance/` files more than once a month — the collision was not rare. Skill as one element:
  entries on a skill file that name bullets more often than the skill, month after month.
  Roles-only in the canon: a review that could not judge a decision without knowing who took it.
- **Cheap to re-examine:** the backfill cadence and its one-pack-per-run size, the conversion
  window's date, the advisory grade on header-only files, the entry-field vocabulary. **Expensive:**
  the file grammar, the binding rule, the never-vendored and never-loaded properties, the
  reduction's boundary rule.
- **Metrics the review needs, and the read.** File and entry counts: `git ls-files
  'packs/*/provenance/*.md'` and a grep for `^## ` on the shelf. Firing counts for
  `provenance-integrity`: the usage fold's per-check series. Promote coverage: the diffs of the
  pull requests the `Claudinite tracker: Promote to Canon` issue's comments name. Backfill
  progress: the task's run records and the header-only count `mark` reports. Conflict
  resolutions: commits touching `provenance/` whose parents both touched the same file.

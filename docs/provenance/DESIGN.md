# Provenance — the decision log behind every pack element

> **Status: not implemented.** A design under discussion; nothing below describes how the
> repository works today.

A pack carries guidelines, and each guideline reaches a session through one or more **carriers**:
a rule in `RULES.md`, a skill with its load triggers, a coded or declared check, a task with its
policy. The carriers say *what* to do, and they are rationed to that. Nothing in them says why
they read as they do, who decided, from what evidence, why this carrier and this trigger and not
another, or what would have to become true for the guideline to go. That record is
**provenance**: one append-only file per element, in a `provenance/` folder beside the carriers,
read by maintenance and never by a working session.

| Surface | Question it answers | Who reads it |
|---|---|---|
| the carriers — `RULES.md`, `skills/`, the checks, `tasks/`, `pack.mjs` | what does a session do | every session in every repo that declares the pack |
| `provenance/<element>.md` | why the element is as it is — its mechanism above all — and what would retire it | the growth and curation passes, a promote run, a maintainer |
| `README.md` | how a repository uses the pack and its elements | a person adopting the pack, or reaching for one of its elements |

Provenance is a log of decisions. It is never a description of the current rule: an entry that
restates what the carrier says is wrong by construction, and a reader who wants the rule reads the
carrier.

## 1. The element, its id, and its file

An **element** is one guideline the pack maintains. It has exactly one provenance file, and the
file's name is the element's **id**: a slug chosen when the element is born, for the guideline
rather than its current wording, and never renamed afterwards (a rename breaks every entry and
every override that cites it). The id is also how each carrier references the file:

| Carrier | Its reference to the element |
|---|---|
| a coded or declared check | its check id; a slash becomes a hyphen (`cer/version-bumped` → `cer-version-bumped.md`) |
| a skill — the body, the description, every `force-load-on-*` trigger | its directory name |
| a task — the declaration, its preconditions, `expected_outcome`, `automerge`, the worker | its task id |
| the manifest — fingerprint, `requires`, routing guidance, seeding, the pack's own existence and name | `_pack`; the underscore sorts the pack's own file, and `_declined.md`, ahead of every element |
| a prose rule — a top-level bullet of `RULES.md`, or of a `SKILL.md` that declares its body a set of guidelines | a **marker** ending the rule: `… never a filesystem walk. (url-filter-host-operators)` |

A check, a skill and a task already carry a stable id, so their files are named by it and nothing
is added to them. A prose rule has none, and the marker gives it one: the reference from the prose
to its file, and the stable id by which a member's override or `accept` entry can name the rule
and survive its rewording — the one obligation the layering design places on the corpus, paid
once. The marker is the only thing this design adds to injected prose, and it is rationed like the
prose: a slug of two to four words, so a rewording never has to touch it. It costs a few tokens
per rule, two to three times what a numeric marker costs — on the order of a thousand tokens
across a member that loads two hundred rules, out of a budget of fifteen thousand — and nothing
cheaper carries both the reference and the id.

One file normally covers one carrier. It covers several when they are one guideline - a prose rule
and the check that enforces its checkable half, a rule and the skill it delegates to, two rules
whose history is one - and then the file is named by the check or the skill, or by the slug the
rules share, and each rule's marker cites that name. A shared file splits into more when the
histories diverge, and only then. Independence where it is real, one file where it is not; a
carrier names exactly one live file, and a check or a skill is never split across files.

A skill is a carrier of one of two shapes, and it says which in its frontmatter, under
`metadata`, as `body: workflow` or `body: guidelines` — declared, never inferred, because the two
look alike from outside (a workflow carries bold-trigger bullets too) and a skill that mixes steps
and gotchas is classified by its author, not by a count. A **workflow** skill is one element,
named by its directory: its steps and their gotchas change as the procedure changes, every
decision about them is a titled entry on the skill's file, and no step or bullet carries a marker
or has a file. A **guidelines** skill is a `RULES.md` behind a trigger: its top-level bullets are
elements, and the skill's own file - its directory name - is theirs by default, holding the
skill's own decisions (why a skill rather than prose, why these `force-load-on-*` triggers and
these paths rather than others, why the description names the moments it names) and the
bullets' alike, so the skill's provenance is denoted once and not per line. A bullet whose
history diverges from the skill's takes a marker and a file of its own, exactly as a rule has,
and only then. In both shapes the skill's file is where its **mechanism** is accounted for.
Provenance is extracted for the independent elements, the rules and the guidelines, and never
for the paragraphs of a procedure.

### What is not an element, and where its decision lives

Everything else a pack directory holds is either a property of an element, whose decisions go on
that element's file, or an artifact whose decision is the pack's, or evidence:

| Artifact | Its decision is recorded on |
|---|---|
| a check's `severity`, `scope`, `relevantWhen` gate, `since` date, `failureMessage` and `fix` text | the check's file (`born`, `severity-changed`, `reworded`) |
| a skill's `description` and every `force-load-on-*` trigger | the skill's file (`trigger-changed`) |
| a skill's `body` declaration | the skill's file: a workflow re-declared as guidelines changes nothing there until a bullet takes a file of its own, a `split` there and a `born` on the bullet's; the reverse is a `merged` there and a `retired` on each bullet's own file |
| a task's preconditions, `expected_outcome`, `automerge`, `agent_model`, worker | the task's file (`policy-changed`) |
| the manifest: `detect`/`marker`, `requires`, `ruleRoutingGuidance`, `seededByDefault`, `hidden`, `env`, adoption `questions`, `adoptionHandover`, `contributes` and `contributedRules`, `merge-rules.json`, the badge | `_pack` |
| the pack's own existence, name, split or collapse; a rename-map entry for an absorbed pack | `_pack` of the pack that exists afterwards |
| stubs and migrations | their own module headers, plus a `_pack` entry for the decision to ship them |
| tests and fixtures | nothing — a fixture is evidence, cited from the check's entry |
| `README.md` | nothing — it says how the pack is used (below), and every sentence of history in it moves onto the entry it is evidence for (§6) |
| `VERSIONS.md`, `directory.GENERATED.md`, the rule inventory | nothing — derived, never decided |
| a member's `accept` waiver, severity override or `disabledTasks` entry | the member's settings file, whose `reason` is the record; no provenance file |
| a design doc, a capture on the conversation-logs branch, a tracker comment, a pull request body | evidence — cited by an entry, never copied into one |

### The README beside them

A pack's `README.md` is for the person adopting the pack or reaching for one of its elements, and
it carries only what that person does with it: when the pack activates, what each check demands
and what satisfies it, when a skill is the thing to load, what the task does to the repository,
and the catalog of what the pack carries. It never carries how an element came to be, what it
replaced, why its id reads as it does, what an earlier shape did, or how the pack is maintained.
The test is the sentence: a date, a pull request number, an "until", a "was", a "kept as it was"
or a "distilled from" is a decision, and a decision is an entry on the element's file — `_pack`
for the pack's own shape, the element's own file for the rest. The maintainer's procedure is not
the README's either: it is the growth skills', forced when a pack file is edited (§3), and the
provenance those skills append to. What is left is shorter, and it is read by the one reader a
README has.

### The file

A file is its entries and nothing else — no header, no front matter, no restatement of what it
covers, because what it covers is derived: the carriers that name it, by id or by marker, and
`check` prints them. An empty file is an element whose history has not been written yet.

```
## 2026-07-18 · born · promoted from a member's local pack (#319)
- **Source:** the member's own site rule, gated on `PageStateMatcher.pageUrl`, matched a
  lookalike host.
- **Reason:** `hostSuffix` is a raw string suffix, so `example.com` also matches
  `evilexample.com`; nothing in the API says so at the call site.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose. A check would have to know which behaviours are origin-sensitive; the
  signature (a bare `hostSuffix`) is not the violation.
- **Retire when:** Chrome documents `hostSuffix` as label-bounded, or `UrlFilter` is removed.
- **Landed:** #319 · pack version 1.

## 2026-07-27 · reworded · the corpus-wide "when + what + one non-obvious fact" pass (#467)
- **Reason:** the `hostContains` clause and the lookalike sentence restated the rule; both cut.
- **Actor:** @missingbulb (owner).
- **Landed:** #467 · pack version 1.
```

An **entry** opens `## <YYYY-MM-DD> · <kind> · <one line>` and carries bold-labelled fields, one
per bullet, continuation lines indented. Entries are appended in date order; a wrong entry is
answered by a later entry, never edited. An element whose last entry is `retired` is retired;
nothing else says so.

The **kinds** are closed: `born`, `reworded`, `strengthened`, `weakened`, `split`, `merged`,
`moved` (a carrier change — rule to skill, pack to pack), `converted` (prose to check),
`trigger-changed` (a skill's load trigger or description), `policy-changed` (a task's `automerge`,
`expected_outcome` or preconditions), `severity-changed`, `reaffirmed`, `promoted`, `retired`.
`strengthened` and `weakened` are the modality grade — "must" to "should" is a decision, and the
kind says which way it went.

The **fields**, each written only when there is something to say — a field with nothing behind it
is omitted, never filled with a placeholder, because a reader must be able to tell what the record
knows from what it does not:

- `Source` — where the lesson came from: an incident, a document, a request, a capture (its date
  and session id).
- `Reason` — why the element says what it says.
- `Actor` — who decided: the person by GitHub handle with their role (`@handle (owner)`,
  `(maintainer)`, `(contributor)`), or the run (`the growth-promote run, merged by @handle (owner)`).
  Never an email.
- `Model` — the model that wrote the decision, as the harness tells the appending session or as
  the landing commit's trailer names it.
- `Mechanism` — the carrier and its trigger, and why: the ladder rung it landed on and why the
  rungs above could not carry it; for a check, its scope, its gate and its severity; for a skill,
  its load triggers and the paths or calls they name; for a task, its precondition and policy.
  This is the field the log exists for most, and a `born`, `converted`, `moved`,
  `trigger-changed`, `policy-changed` or `severity-changed` entry always carries it.
- `Rejected` — the alternatives, each with its drawback.
- `Retire when` — the test a future review reaffirms the element against.
- `Landed` — the pull request or commit that landed the decision, and the pack version that
  shipped it (`#1151 · pack version 60821.1`), so a reader can go from the decision to the diff and
  to the members that received it. It is a locator, not a proof: the proof, where one exists, is
  in `Source` (the failing run, the measurement, the document).

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

### `_declined.md`

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
- **Never loaded.** No `@` import, no skill mount, no session-summary token count. The marker at
  the end of a rule is the whole of what reaches a session, and it invites the reader nowhere: no
  rule names the folder, links it, or asks anyone to follow anything.
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
| `growth-extract` (activity and conversations) | `born` per landed lesson, and the marker on the rule; a conversation-born lesson's `Source` names the capture's date and session id; `_declined.md` for a candidate dropped for a reason worth keeping |
| `prose-to-checks` and `canon-prose-to-checks` | `converted` on the element, carrying the deletion-test verdict (prose deleted, or kept and why); `_declined.md` for a rule judged not checkable, dated |
| `growth-dedup` | `retired` (superseded by the canon element it names), `weakened` (a strip), `reworded` |
| `rule-revalidation`, `canon-rule-revalidation`, `revalidate-from-source` | `reaffirmed` only with new evidence or a changed `Retire when`; `reworded` or `retired` for a correction; an empty file it meets is filled from `history` first, which is how a member's local pack backfills with no task of its own |
| `growth-promote` | on the canon side the local file, reduced (§4), a `promoted` entry, and the marker on the promoted rule; the local file stays until dedup retires it |
| `extract-packs-from-a-project`, `learning-a-technology` | `_pack` and one `born` per element, citing the evidence set or the dated sources |
| `extract-from-instructions` | one `born` per element, citing the instruction file and line the rule was read from, in whichever pack the routing sent it to |
| an attended session editing a carrier or a README | `changing-pack-elements`, the skill forced on every pack file (below), which ends with the append |
| the backfill of an existing pack, by hand from a session | `backfilling-provenance`, the growth skill that owns the method (§6), one pack per pull request |

The mechanics are one helper, `provenance.mjs` in `claudinite-growth`, vendored so a member runs it
from the mount and the canon from the repo root:

| Command | Does |
|---|---|
| `mark <pack>` | creates an empty file for every check, skill, task and the manifest that none names; proposes a `body` for every skill that declares none (bold-trigger bullets and no numbered steps read as guidelines, anything else as a workflow); and for every unmarked rule — in `RULES.md` or a guidelines skill — appends a proposed marker and creates the file it names. The bodies and the slugs are proposals a maintainer refines before the change lands |
| `append <pack> <element> --kind <kind> [--changed]` | validates and appends the entry read from stdin; `--changed` appends the same entry to every element the working tree's diff touched |
| `check <pack>` | the parser the check uses, run by hand; prints what each file is named by |
| `convert-references <pack>` | the migration of a `references.md` (§6) |
| `reduce <file>` | the promotion reduction (§4) |
| `history <pack> <element>` | the backfill brief: the carrier's commits through every rename, a pickaxe on the rule's text, the pull requests those commits name, the `VERSIONS.md` rows naming them, the README's history sentences, the tracker comments |

`append` refuses an entry that matches the capture scrub's secret patterns: a decision log is prose
an agent writes, and the one place a token could land is the one place nothing else scans.

### The forced skill

One skill in `claudinite-growth`, `changing-pack-elements`, is forced by
`force-load-on-file-edits-paths` on every file of a pack that a decision can change, in a local
pack and on a canon's shelf alike, through the two-root patterns the pack's `writing-pack-prose`
already uses (`**/packs/*/…` matches `.claudinite/local/packs/<pack>/` in a member and
`packs/<pack>/` in a canon):

| Forced on | Because |
|---|---|
| `RULES.md`, `skills/**` | a rule's wording and modality, a skill's body, description and triggers |
| `worldRules/**`, `workRules/**`, `declared-checks.json` | a check's gate, scope, severity and text |
| `tasks/**` | a task's preconditions, policy and worker |
| `pack.mjs` | the fingerprint, requirements, routing and seeding |
| `README.md` | the one file with no skill today, and the one that history creeps back into |
| `provenance/**` | a hand edit of a file that is otherwise appended by the helper |

The skill is short and states three things: which kind of entry this edit owes, on which file (a
workflow skill's steps owe it to the skill's file) and the `append` command that writes it; what the README carries and what it does not (the paragraph above, in
the imperative); and that a file under `.claudinite/shared/` is never edited, which the lifecycle
pack's rule already says. It names no corpus, as a growth skill must, so the same skill serves the
shelf; `claudinite-canon-curation` adds no twin, only the rules below. The skills that already
load on these edits keep their subjects — `writing-pack-prose` the prose, `writing-tasks` the task
contract, `writing-repo-scanning-checks` the check — and none of them learns the append:
`writing-repo-scanning-checks` is the basics pack's, and a growth mechanism written into another
pack's skill is the pack-to-pack dependency the curation rules refuse. The cost is a second skill
loaded on a prose, task or check edit, and the first skill ever loaded on a README edit. One
line does go into `writing-pack-prose`, which already loads on every `SKILL.md` edit: a new skill
declares its `body` at birth, and what each shape means for its bullets.

### The rules that say so

The skill fires at the edit; three rules say the same thing where a session reads rules, so a
session that plans a pack change knows the shape before the hook holds its first edit:

| Pack | Rule |
|---|---|
| `claudinite-canon-curation` | **Writing a pack's `README.md`** — how a repo uses the pack and its elements: when it activates, what each check demands, when a skill is reached for, what the task does. Never how an element came to be, what it replaced or how it is maintained: a date, a pull request number, an "until" or a "kept as it was" is an entry on the element's provenance file, and the maintainer's method is the growth skills'. |
| `claudinite-canon-curation` | **Changing a carrier on the shelf** — a rule, a skill's trigger, a check's gate or severity, a task's policy — lands with the entry on its provenance file in the same change; the forced skill names the kind. The existing rule on descriptive prose in `RULES.md` gains the same destination: description to the module header and the README, rationale and history to the element's file. |
| `claudinite-growth` | **Recording a local pack change** keeps its verdict — no changelog file, the commit and its pull request are the record of *what* changed — and gains its complement: the *decision* is the entry on the element's provenance file, which the change carries. |

The home's own local pack carries one rule that names the old destination — a design doc whose
system is built moves "an owner-decision record with its rationale" into a module header or a
pack README — and that destination becomes the element's provenance file; the section-by-section
verification it asks for is unchanged.

## 4. Promotion, and the reduction that makes a shared canon safe

A lesson promoted from a member's local pack travels with its provenance: promote copies the
element's file into the canon pack's `provenance/`, ends the promoted rule with the marker, and
appends `promoted · from a member's local pack (<canon PR>)`. The canon's version of the file is
therefore the full history of the guideline, not a history that starts at promotion. A slug that
collides on the canon side is suffixed there, and the promoted rule's marker takes the suffixed
name; the local file is never renamed.

What must not leave the repo is rewritten before the copy lands, and the rule is one read of the
canon repository's visibility at promote time, never a setting:

| In the local pack (stays as written) | In a private canon | In a public canon |
|---|---|---|
| `Actor` — `@handle (role)` | kept | the role only |
| a session id or link | dropped | dropped |
| a quoted phrase (at most one sentence, as the extraction skills already limit) | dropped; the paraphrase stays | dropped |
| `owner/repo#n` references and `Landed` locators | kept | `a member repository` |
| product, file and path names in `Source` | generalized, as the promoted rule itself is | generalized |
| `Model`, dates, kinds, `Reason`, `Mechanism`, `Rejected`, `Retire when` | kept | kept |

The policy is structural — what crosses a repository boundary is reduced by what that boundary is —
so no member configures an identity policy and no canon has one to get wrong. A promote pull
request is owner-gated (`automerge: nothing`) exactly as today, so a reviewer's eyes are the last
guard on what the reduction is not built to see: a product name inside a `Reason`.

## 5. Pack kinds

| Kind | Provenance | Crosses a boundary |
|---|---|---|
| repo-local pack (`.claudinite/local/packs/`) | required; the origin of most decisions; actors by handle | only through promote, reduced |
| canon pack (`packs/`), hidden packs included | required; actors by handle in a private canon, by role once public | vendored never; forked by clone with the folder intact |
| the home's structural local pack | as a repo-local pack | never |
| organisation pack (a second canon in the organisation's registry) | as a canon pack; the organisation's release task is a promote target and source like any other | as a canon pack |
| vendor-authored pack | as a canon pack in the vendor's repository; a consumer never receives it; a consumer's decision *about* it — an `accept` waiver with its `reason`, an override naming the element's id — lives where it is declared and needs no file | never |
| process and rules-of-thumb packs (`basics`, testing, git) | as a canon pack; `Source` cites the practice, book or incident; `Retire when` may be a judgment ("the practice is abandoned corpus-wide") and says so | as a canon pack |
| a pack minted from project evidence | `_pack`'s `born` cites the evidence set or the dated sources | as a canon pack |
| a stub pack with no rules | `_pack` only | as a canon pack |
| personal preferences — a pack of one reader, whose rules file is the person's `<email>.md` in the store | each preference is an element with a marker; its files sit **beside** the store, at `<path>-provenance/<email>/`, because the store's own check keeps `<path>/` flat and addresses nothing but `<email>.md` there; written by the session that edits the preference; the person is the actor; coverage advisory, as everything in that pack is | never — a preference is never promoted, by the extraction rules that already bar it |

A consumer that forks an element from a canon into its local pack (an override) writes a `born`
entry citing the canon element by its id; the canon's file is not copied down.

Preferences pay the marker like any rules file — a few tokens per preference in the injected
text — and their entries are the shortest the log holds: the person is the actor, the request is
the reason, and what the file answers months later is when a preference was set or changed and
what prompted it.

## 6. Backfill, conversion, and the standing mechanism

Two things bring existing packs onto the convention, and both are mechanisms rather than passes
someone remembers to run.

**Marking is one mechanical pass.** `mark` over every pack creates an empty file per unnamed
carrier and ends every unmarked rule with a proposed marker. It therefore edits every `RULES.md`
and every `SKILL.md` that carries unmarked rules — prose that vendors — so the `pack-version-bump`
task cuts every touched pack's version once the pass lands, and the nightly converge delivers a
prose-only change the way it delivers any other. From that commit every carrier names a file, the
integrity check (§7) holds, and the only thing missing is history.

**Filling is a one-off, done by hand here, one pack per pull request.** The method is a skill,
`backfilling-provenance` in `claudinite-growth`, loaded by the session that takes a pack; no task
carries it, because the work ends when the last empty file fills, and a task with an ending is
a phase someone must remember to close. Each pack's run:
`history` gathers the evidence per element, the agent derives the `born` entry and the
decision-bearing entries from that source **before** re-reading the rule, then diffs against what
the rule implied. A field the evidence does not carry is left out; a fabricated rationale would
let a future review reaffirm a rule on false grounds, which is worse than no rationale at all.
An element whose history the evidence does not reach at all gets a `born` entry that says only
what is known — the date and commit it first appears in — and stays as short as that. The same
run trims the pack's README: each sentence of history it holds — the "distilled from" paragraph,
the "until #n", the "kept as it was", the mechanism's reasons — is evidence the run has already
read, so it moves onto the entry it evidences and leaves the README, which keeps only what §1
says a README carries. The pull request is one pack's backfill and one README's trim,
reviewed as such; the README is the one vendored file the run touches, so the pack's version is
cut once by automation as for any prose change.

**`references.md` converts mechanically.** `convert-references` turns each entry into an entry of
the element it keys — `RULES-n` resolves through the rule carrying the marker `(n)`, `<skill>-n`
to that skill, `check:<id>` to that check — as a `born` entry dated by the entry's own adding
commit, its reaffirmation sentence as `Retire when`, the rest as `Reason` and `Landed`; then
rewrites each numeric marker to the slug its element takes and deletes the file. A skill bullet
that carries a numeric marker today converts by its skill's declared body: in a guidelines skill
it becomes an element with a slug marker and a file, as a rule does; in a workflow skill its
entry becomes a titled entry on the skill's own file and the numeric marker leaves the step.
About fifty such bullets sit across twenty skills; by the shapes those skills have today roughly
thirty are guidelines and twenty are steps, and the `body` the maintainer confirms at marking
is what decides. A pack-root
`references.md` that still exists is a finding: advisory through the conversion window the
migration states, blocking after it, with the command in the fix text. In a member, a migration
record in `claudinite-lifecycle` runs `mark` and `convert-references` over the local packs at the
next converge, so every member is marked without a session; its empty files fill on
`rule-revalidation`'s cadence (§3), which reads each element's history anyway.

**No README is trimmed by the marking pass.** Which sentence of a README is history is a
judgment made with the element's evidence in hand, so it belongs to the backfill run and not to
the mechanical pass; until a pack's run has come, its README reads as today, and nothing loads it.

## 7. The check: `provenance-integrity`

A coded rule in `claudinite-growth` (a declared check cannot read a bullet whose last line and
bold trigger wrap), over both roots, replacing `references-integrity`.

World scope, blocking:

1. every check, skill and task id, and the manifest, names a live file; every `SKILL.md`
   declares its `body`; every top-level bullet of a `RULES.md` ends with a marker naming a
   live file, a guidelines skill's bullet ends with one only where it has a file of its own
   and is the skill's otherwise, and no bullet of a workflow skill carries one; a skill
   with no `body`, a rule with no marker, a marker where the body refuses one, a marker naming
   no live file, and a live file no carrier names are each a finding naming the carrier or the
   file. A live file is one whose last entry is not `retired`;
2. every file parses: the entry grammar, a kind in the vocabulary, dates in order, a field
   vocabulary the entry keeps to;
3. a file with entries opens with `born`, and the mechanism-bearing kinds carry `Mechanism`; an
   empty file is reported as pending history, at advisory, since it is the backfill's worklist
   and not a defect;
4. a pack-root `references.md` is the migration finding above.

Work scope, blocking:

5. a carrier whose normalized text changed in this change names a file that gained an entry in
   this change — comments stripped, whitespace collapsed, the marking pass exempt by its `since`;
   an unmarked guideline names its skill's file;
6. a provenance file changed in this change lost no line, and its new lines follow the last
   existing entry - at advisory: a rewrite that is the correct history (the backfill replacing
   what the conversion wrote) is the diff's to show, not the check's to refuse;
7. a carrier deleted in this change named a file that gained a `retired` entry as its last in the
   same change, or any entry where a live carrier still names that file; a removed-lines check
   cannot see a deleted file, so the deletion is asserted from the tree's side.

The work-scope half is what makes the convention hold for a hand edit: the skill says append, and
the Stop hook says so again when the session did not.

The preferences store is not under either root, so the preferences pack carries its own advisory
check, relevance-first like its siblings (inert unless this repo *is* the store): every preference
bullet ends with a marker naming a file under `<path>-provenance/<email>/`. It asserts existence
only — self-describing data, so nothing is shared between the two packs — and the grammar is
judged by the helper's `check`, run by the session that edits the preference.

## 8. Invariants

1. Every live carrier names exactly one live provenance file, and every live file is named by at
   least one live carrier.
2. A provenance file is meant to grow: a wrong entry is answered by a later entry, never edited.
   A line lost or altered is advised against, not refused; the one rewrite that is right is the
   backfill replacing what the conversion wrote with the element's derived history, once.
3. No entry describes the current rule. The carrier is the description; the entry is the
   decision, and its `Mechanism` is why the carrier is the carrier.
4. Nothing under `provenance/` reaches a session, a member's mount, a barrier scan, or a check that
   judges carriers; the marker is the one token a session sees.
5. What crosses a repository boundary is reduced (§4); what stays is written as the repository's
   own norms allow.
6. A field is written only when there is something behind it. Nothing is invented, nothing is
   padded, and nothing is deleted to look complete.
7. A reaffirmation with nothing new writes nothing.
8. An element's id never changes.

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
- **A sweep rewords forty rules.** Forty one-line entries are owed and `append --changed` writes
  them; the markers stay where they were, so nothing rebinds. A sweep that drops a marker while
  rewording leaves the rule unmarked, which the check reports.
- **A marker is misspelled or names a retired file.** A finding naming the rule; the fix is the
  file the rule meant.
- **Two rules carry one marker.** Legal only as a cluster the file's entries account for; a
  second rule that merely reused a slug takes its own.
- **A promoted slug collides.** Suffixed on the canon side, marker included; the local file is
  never renamed.
- **A whole element is deleted.** The file stays, its last entry `retired`: the decision to remove
  is a decision. A retired file is named by nothing and costs nothing.
- **A skill's body is declared against its shape.** A workflow whose one gotcha bullet keeps
  earning entries of its own on the skill's file is a guidelines skill in part, and the fix is
  the re-declaration §1 names, a `split` on the skill's file and a `born` per bullet; the
  reverse is a `merged` and a `retired` per bullet. Neither is the check's call: it holds only
  that the markers match the declared body.
- **Private text reaches the canon.** The reduction removes what it is built to see; the
  owner-gated promote pull request is the guard for what it is not; the scrub refuses a secret at
  append time.
- **A backfill fabricates.** A field is written only from evidence, every entry carries its
  `Landed` locator so a reviewer can go to the diff, and one pack per pull request keeps the
  review readable.
- **A session edits a carrier without appending.** The work-scope check fails the change at the
  Stop hook with the `append` command in the fix.
- **History creeps back into a README.** The forced skill states the scope at the edit, the
  curation rule states it where rules are read, and the next backfill or revalidation run over
  the pack reads the README as evidence and moves what it finds. No check greps a README for a
  date: the phrase list would be the whole check, and the skill at the edit is the cheaper guard.
- **A vendored copy leaks the folder.** The vendor-set test asserts over the real corpus that no
  `provenance/` path vendors, in the same test that pins `test/` and `docs/`.

## 10. Decisions and their alternatives

- **One file per element, in a folder** — over one `provenance.md` per pack. A single file is the
  aggregate changelog the growth pack already refuses: every run appends to the same file, two
  runs a night collide on it, and one element's history is interleaved with every other's. A folder
  of files makes each element's history its own file, its own `git log`, and its own copy on
  promotion. The cost is the file count, paid by no session and no member.
- **A slug marker naming the file** — over the numeric marker `references.md` uses, and over
  binding a rule by its trigger phrase with nothing in the prose. A number is stable but opaque: a
  reader cannot go from `(12)` to a file, and `RULES-12` says nothing about the guideline. Trigger
  binding costs the prose nothing but gives a rule no id — a rewording changes its identity, every
  sweep rebinds every header, and nothing a member writes survives the rewording of the rule it
  overrides. The slug is the reference and the id in one string, at a few tokens per rule, and the
  same string names the file, the override and the entry.
- **No header** — over a front matter carrying status or coverage. Coverage is derived from what
  names the file, and status from the last entry's kind; a header would be a second copy of each,
  and the one part of the file that invites editing.
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
- **A skill declares its body; a workflow's bullets are never elements, and a guidelines skill's
  bullets are the skill's file's until one diverges** - over one element per skill always, over a
  file per bullet always, and over reading the shape off the text. A workflow is procedure and
  changes as a whole, so thirty files for one skill is noise; a guidelines skill is a rules file
  behind a trigger, but its bullets mostly share one history with the skill (the file-placement
  skill's 28 definitions and options are one method, decided together), so its provenance is
  denoted once and a bullet takes a marker and a file of its own only when its history has
  diverged. An unmarked bullet is not ambiguous, because the body decides it: in a guidelines
  skill it is the skill's, in a workflow it is a step. A structural read fails on the skill that
  mixes steps and gotchas, which most procedures do. The declaration costs one frontmatter line
  the harness ignores.
- **`_declined.md` per pack** — over a tracker issue's comment feed. A comment feed is one
  scrollable history for every candidate in the corpus; a per-pack file is read by the pass that
  is about to re-nominate in that pack, which is the read that prevents the rework.
- **One forced skill for the append and the README scope** — over teaching every editing skill
  the append. Three skills from two packs load on carrier edits today, one of them the basics
  pack's, and a growth mechanism cannot be written into it; one growth skill states the append
  once, reaches the README that no skill reaches today, and serves the shelf without a curation
  twin. The cost is one more skill loaded per pack edit.
- **The README trimmed by the backfill run** — over a separate sweep, and over leaving READMEs as
  they are. The run holds the evidence each history sentence points at, so moving the sentence is
  the same read; a sweep would re-derive the element for every sentence, and a README that keeps
  its history keeps a second, unmaintained copy of the log beside the log.
- **Handles reduced by the canon's visibility** — over one identity policy everywhere. A local pack
  and a private canon sit beside git logs that already name their authors; a public canon is read
  by people who never saw that repo. The boundary is the policy, and it is read, not set.

## 11. What the log buys beyond the record

- **Overrides and waivers can name a rule** and survive its rewording: the marker is the stable id
  the layering design requires, and it exists for every rule from the marking pass on.
- **Mechanism choices become reviewable**: why a skill loads on these paths and not those, why a
  check is advisory, why a task's precondition reads as it does — each with the alternative it
  beat, so the next person to touch the trigger knows what it was for.
- **Revalidation reads `Retire when` per element, with the history behind it**, rather than one
  sentence that was overwritten at the last correction.
- **Conversion passes stop re-deriving**: `_declined.md` and `converted` entries are the memory the
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
- **A README shrinks to its reader**: a person adopting a pack reads how to use it, and the
  history that read as description — a third of some READMEs today — is on the file that can
  answer for it.
- **An audit can answer what shaped the rules**: incidents, documents and requests, and never a
  member's product source.

## 12. Retrospective brief

Filed at the merge that completes the mechanism, horizon one week after the marking pass lands
on `main`; a second reading a week after the shelf's last empty file fills.

- **Expected amounts.** One marking commit creating an empty file per unnamed carrier and a marker
  per unmarked rule (about 850 files on the shelf, 185 in the home's local pack; the count is
  `mark`'s own report and the file count under `provenance/`). Backfill: one pull request per
  pack, 36 on the shelf and one local, by hand; a member's local packs fill on the revalidation
  cadence. Growth flows: a handful of `born` entries a week fleet-wide,
  read from the extract pull requests' diffs; zero `reaffirmed` entries from a revalidation run
  that found everything still true. `references.md` files on the shelf: 21 before the conversion,
  0 after; in members' local packs the same fall at the converge that runs the migration record. About
  The session-start
  summary's prose token weight rises by the marker count and no more. Every skill declares a
  `body` (a frontmatter grep against the skill count); of the fifty skill bullets with numeric
  markers today, roughly thirty sit in guidelines skills and become elements of their own, and
  the rest fold into their workflow skill's file. README bytes on the shelf:
  about 230 KB across 37 files before the backfill; each run's pull request reports the pack's
  before and after, and the shelf total falls as the runs come.
- **Expected behaviours.** Every promote pull request carries a reduced provenance file and a
  marker per promoted lesson (read from the promote PR's diff). A hand edit of a carrier in an
  attended session appends in the same commit (read from the `provenance-integrity` firing counts
  in the usage fold: a firing that the session then fixed is the check working; a firing rate near
  zero with carrier edits flowing means sessions append unprompted). Every `trigger-changed` and
  `policy-changed` entry carries a `Mechanism` that names the alternative it beat.
- **Misuse.** An entry that restates the rule; an edited or removed line, which the check reports
  at advisory;
  a README edit made without the forced skill (the hook's `skill-not-loaded` count for
  `changing-pack-elements`); a history sentence written into a README after its trim;
  an `Actor` that is an email; a marker on a workflow skill's step; a session id or a quote in a
  canon file; a provenance path in a
  member's mount; a rule whose marker names a file and whose file says nothing about that rule; a
  placeholder value where a field should have been omitted.
- **Overuse.** `reaffirmed` entries with no new evidence; sweep entries longer than a line; a
  `_declined.md` that grows by more than a few entries a week in one pack; backfill runs that
  produce one-line `born` entries for a pack whose history is plainly in git.
- **Underuse.** Elements still empty a season after marking; extract runs whose diff adds a rule
  and no entry (only possible outside a Stop hook — a direct API write — and the check on the
  branch would say so); promote pull requests with no provenance file beside a promoted rule;
  overrides and waivers still naming rules by quoting their text after the marker exists; a
  `trigger-changed` entry with no `Mechanism`; READMEs of backfilled packs still carrying an
  "until #n".
- **Per decision, what would show the alternative was right.** The slug marker: the prose token
  weight rising by more than the marker count predicts, or markers dropped in reword sweeps more
  than once each — the marker was noisier than rationed, and a number or nothing was cheaper. One
  file per element: conflict resolutions on `provenance/` files more than once a month — the
  collision was not rare. Body per skill: workflow files whose entries name one step month
  after month (that step was a guideline), guidelines bullets whose files hold nothing but
  one-line entries citing the skill (the bullets were the skill's after all), or
  re-declarations more than a few a season. No header: a check or a reader that needed coverage
  written down after all. Handles by visibility: a review that could not judge a decision without
  knowing who took it, or a name in a public canon that should not have been there. One forced
  skill: sessions that loaded it on a README edit and changed nothing the skill speaks to (a
  typo, a link), often enough that the load is the cost and the README should leave the list.
- **Cheap to re-examine:** the backfill's one-pack-per-pull-request size, the conversion
  window's date, the advisory grade on empty files, the entry-field vocabulary, the slug length,
  the forced skill's path list, the shape `mark` proposes a body from.
  **Expensive:** the file grammar, the id rule (a marker is the id and never changes), the
  never-vendored and never-loaded properties, the reduction's boundary rule.
- **Metrics the review needs, and the read.** File and entry counts: `git ls-files
  'packs/*/provenance/*.md'` and a grep for `^## ` on the shelf. Marker counts: a grep for the
  marker pattern over `packs/*/RULES.md`. Firing counts for `provenance-integrity`: the usage
  fold's per-check series. Promote coverage: the diffs of the pull requests the `Claudinite
  tracker: Promote to Canon` issue's comments name. Backfill progress: the empty-file count `mark`
  reports. Conflict resolutions: commits touching `provenance/` whose
  parents both touched the same file.

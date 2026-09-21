---
name: backfilling-provenance
description: Filling a pack's empty provenance files from its history - each entry derived from the adding commit, its pull request and the version log before the rule is re-read, every commit that touched the pack weighed whether or not a draft covers it, and the README and manifest trimmed to use in the same change. Use when a pack under packs/ or .claudinite/local/packs/ carries empty provenance files, or when asked to backfill or write a pack's provenance.
metadata:
  body: workflow
---

# Backfilling a pack's provenance

The marking pass gave every carrier an empty file; this is how the history goes in. It is a
one-off done by hand because the judgment is what the pass is for: which sentence of a README
is history, which commit was the decision, which field the evidence carries and which it does
not. The tool gathers; every call it cannot make honestly it hands over rather than guessing,
so the sections it prints without a draft under them are the run's work, not its leftovers.

## The run, per pack

0. **Load [changing-pack-elements](../changing-pack-elements/SKILL.md) first.** The run edits
   `provenance/`, `README.md` and `pack.mjs`, each of which forces it - but `apply` writes
   through the tool rather than `Edit`, and the pre-edit guard reads only `Edit`/`Write`, so
   nothing holds the run until the Stop hook, with every file already written.
1. **Take one pack** and list what is owed: `node packs/claudinite-growth/provenance.mjs
   check <pack>` prints what each file is named by and which are empty; a file holding only
   the conversion's entry is owed too (in a member the tool is
   `.claudinite/shared/packs/claudinite-growth/provenance.mjs`).
2. **Write the brief**, source-first: `provenance.mjs brief <pack> > brief.md` (an element
   list after the pack narrows it to those files) reads every empty file's history out of
   git, pull request first: each commit's body once, then a draft entry per element it bore
   or changed with the fields git vouches for - the date, the kind, the actor, the model,
   the carrier as `Mechanism`, `Landed` with the version - and the commit's shared fields in
   one `entry-defaults` fence ahead of its entries. Read the tracker comments and the issues
   each body names on GitHub; `history <pack> <element>` prints one element's raw evidence
   where the brief's derivation looks wrong. A shallow clone reads as no history: unshallow
   before trusting an empty brief.
3. **Work the commit inventory before the drafts.** The drafts cover what a carrier's own
   text shows changing, which is less than the pack's history; the brief's *every commit that
   touched this pack* table is the rest, each row carrying the files it touched, the version
   row that claims it, and what it drafts. Two kinds of row are where the decisions hide. A
   row reading **NOTHING DRAFTED** changed something no carrier's text shows - a manifest
   field, a rule's rationale moving out to the README - so read its files before passing it.
   A row marked **sweep** is kept out of the drafts because a sweep usually re-wraps what it
   touches, but where its diff shows it *deciding* something about one element, that element
   owes the entry: touching twelve packs is not deciding nothing here. Read the version rows
   with them, the claimed ones and the *version rows no commit here claims* section alike -
   a row is the maintainer's own words for the decision a version was cut for, and often the
   only place a move is described as a decision at all.
4. **Derive the entries from that evidence before re-reading the rule**, then diff against
   what the rule implied. The first entry is `born` - where the lesson came from, why it
   says what it says, who decided, the carrier and its trigger and why (`Mechanism`), what
   lost (`Rejected`), what would retire it, and `Landed` as the pull request and pack
   version. Then one entry per decision the history shows: a rewording, a split, a move
   into a skill, a conversion to a check, a severity change, a policy change. A file the
   conversion filled from `references.md` is written the same way, its converted entry read as
   evidence: the `Reason` and `Retire when` go on the entries they evidence, and the
   placeholder `born` dated by the references write goes with the rest of the file.
5. **Write only what the evidence carries.** A field with nothing behind it is omitted,
   never filled with a placeholder or a plausible guess: a fabricated rationale lets a
   future review reaffirm a rule on false grounds, which is worse than no rationale. An
   element whose history the evidence does not reach gets a `born` entry that says only
   what is known - the date and commit it first appears in - and stays as short as that.
   Where the pack's evidence names a member per rule rather than rule by rule, the shared
   `Source` goes on the defaults fence and the per-element one is left off: an attribution
   split finer than the evidence is a guess wearing a citation.
6. **Write the entries in hyphens**, not long dashes - `no-new-long-dashes` fires on
   every file that carries one, and a backfill writing a pack's history in one pass earns
   the finding twenty-nine times over and a second commit to undo it.
7. **Edit the brief, then apply it**: `Source`, `Reason`, `Rejected` and `Retire when` go on
   the commit's defaults fence where every element it bore shares them, and on one entry
   where they are its own; a draft the commit did not decide is deleted, and the kind a
   draft guessed (`reworded` for any later commit) is corrected to what the change was.
   `provenance.mjs apply <pack> brief.md` validates every entry as one batch, appends each
   once under its defaults, and writes nothing while any one is refused; run twice it
   appends nothing. An entry the brief cannot carry - a split across files, a declined
   candidate - goes through `append <pack> <element>`, the entry on stdin. A mechanism the
   pack shares across elements - why a skill loads on these paths, why the release set
   vendors as stubs - is written once, on the element that owns it, and cited from the
   others.
8. **Trim the README and the manifest's header comment in the same change.** Each sentence
   of history the README holds (the "distilled from" paragraph, the "until #n", the "kept
   as it was", a mechanism's reasons) is evidence this run has already read, so it moves
   onto the entry it evidences and leaves the README, which keeps only what a person
   adopting the pack does with it. Work the brief's *README sections* list rather than its
   sentence tells: the tells find history that dates or numbers itself, while a section
   explaining why an element reads as it does carries neither and is the half most often
   left behind. The header comment of `pack.mjs` is the pack-level
   record `_pack.md` is written from - why the pack exists, why it fingerprints as it does
   or not at all, what it carries and why - so its decisions become `_pack` entries and the
   header keeps what a reader of the code needs: what the pack is, in a few lines. Report
   both files' bytes before and after in the pull request body.
9. **Candidates the history shows were turned down** - an extraction the owner declined, a
   conversion judged not checkable - go on `_declined.md`, kind `declined`, with `Source`,
   `Reason` and `Actor`, so the next pass reads them before nominating.
10. **Finish with `provenance.mjs check <pack>` reporting no fault** - it prints its
    file-to-carrier listing either way, so the pass is that listing alone and exit 0, never
    silence - the repo's offline suite green, and a pull request carrying the pack's
    provenance files, its trimmed README, its trimmed manifest and nothing else, titled `Provenance: backfill <pack>` and referencing
    the tracking issue. One pack per pull request is the default, and a pack whose elements
    arrived across several pull requests stays one; what a run costs is the reading, so
    packs whose history is one pull request apiece batch into one. Predict the automerge
    policy as each pack's `provenance/`, `README.md` and `pack.mjs` - the manifest trim is
    part of the method - and name the packs rather than reaching for a `packs/**` wildcard,
    which stops the policy being a prediction of the diff.

## What never happens here

- No carrier changes. A rule that reads wrong is a later change with its own entry; the
  backfill records what was decided, not what should have been.
- No entry restates the rule. The carrier is the description; the entry is the decision.
- No `Actor` is an email, no session id or quoted exchange lands in a canon file, and no
  field is written to look complete.

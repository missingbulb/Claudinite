---
name: backfilling-provenance
description: Filling a pack's empty provenance files from its history - one pack per pull request, each entry derived from the adding commit, its pull request and the version log before the rule is re-read, and the README trimmed to use in the same change. Use when a pack under packs/ or .claudinite/local/packs/ carries empty provenance files, or when asked to backfill or write a pack's provenance.
metadata:
  body: workflow
---

# Backfilling a pack's provenance

The marking pass gave every carrier an empty file; this is how the history goes in. It is a
one-off done by hand, one pack per pull request, because the judgment is what the pass is
for: which sentence of a README is history, which commit was the decision, which field the
evidence carries and which it does not.

## The run, per pack

1. **Take one pack** and list what is owed: `node packs/claudinite-growth/provenance.mjs
   check <pack>` prints what each file is named by and which are empty; a file holding only
   the conversion's entry is owed too (in a member the tool is
   `.claudinite/shared/packs/claudinite-growth/provenance.mjs`).
2. **Gather the evidence per element, source-first**: `provenance.mjs history <pack>
   <element>` prints the carrier's commits through every rename, a pickaxe on the rule's
   lead-in, the pull requests those commits name, the `VERSIONS.md` rows naming them and the
   README's history sentences. Read the tracker comments and the issues it names on GitHub.
   A shallow clone reads as no history: unshallow before trusting an empty log.
3. **Derive the entries from that evidence before re-reading the rule**, then diff against
   what the rule implied. The first entry is `born` - where the lesson came from, why it
   says what it says, who decided, the carrier and its trigger and why (`Mechanism`), what
   lost (`Rejected`), what would retire it, and `Landed` as the pull request and pack
   version. Then one entry per decision the history shows: a rewording, a split, a move
   into a skill, a conversion to a check, a severity change, a policy change. A file the
   conversion filled from `references.md` is written the same way, its converted entry read as
   evidence: the `Reason` and `Retire when` go on the entries they evidence, and the
   placeholder `born` dated by the references write goes with the rest of the file.
4. **Write only what the evidence carries.** A field with nothing behind it is omitted,
   never filled with a placeholder or a plausible guess: a fabricated rationale lets a
   future review reaffirm a rule on false grounds, which is worse than no rationale. An
   element whose history the evidence does not reach gets a `born` entry that says only
   what is known - the date and commit it first appears in - and stays as short as that.
5. **Append each entry through the tool** (`provenance.mjs append <pack> <element>`, the
   entry on stdin), which validates the grammar and the order. A mechanism the pack shares
   across elements - why a skill loads on these paths, why the release set vendors as
   stubs - is written once, on the element that owns it, and cited from the others.
6. **Trim the README in the same change.** Each sentence of history it holds (the
   "distilled from" paragraph, the "until #n", the "kept as it was", a mechanism's reasons)
   is evidence this run has already read, so it moves onto the entry it evidences and
   leaves the README, which keeps only what a person adopting the pack does with it.
   Report the README's bytes before and after in the pull request body.
7. **Candidates the history shows were turned down** - an extraction the owner declined, a
   conversion judged not checkable - go on `_declined.md`, kind `declined`, with `Source`,
   `Reason` and `Actor`, so the next pass reads them before nominating.
8. **Finish with `provenance.mjs check <pack>` reporting nothing**, the repo's offline suite
   green, and one pull request for the pack: its provenance files, its trimmed README, and
   nothing else. Title it `Provenance: backfill <pack>`, and reference the tracking issue.

## What never happens here

- No carrier changes. A rule that reads wrong is a later change with its own entry; the
  backfill records what was decided, not what should have been.
- No entry restates the rule. The carrier is the description; the entry is the decision.
- No `Actor` is an email, no session id or quoted exchange lands in a canon file, and no
  field is written to look complete.

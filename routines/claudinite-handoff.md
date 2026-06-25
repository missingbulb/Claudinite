# Handing portable lessons off to Claudinite

The shared rules a project consumes (vendored read-only as a submodule) live in a
separate **canon** repo, **Claudinite**. A session in the consuming repo can't push
to Claudinite, so a *portable* lesson — one that generalizes beyond this project —
can't be written into the shared docs directly. This is the **up-path**: how such a
lesson travels from the consuming repo into Claudinite.

Lessons are **captured locally** (the on-demand "learned lessons" command, the
daily lessons digest — capture never reaches Claudinite directly). The daily
**optimize-procedures** routine is the only thing that starts the up-path: it spots
the generalizable local items and **files a single handoff-labelled issue**
(bundling them all) that a deterministic Action then carries upward.

```
optimize-procedures routine (daily)
        │  files ONE handoff-labelled issue here, bundling every item (ensuring the label exists first)
        ▼
handoff Action  (consuming repo, deterministic — no agent)
        │  copies the issue to Claudinite (cross-repo PAT), links back, closes it here
        ▼
handoff issue in Claudinite
        │  curation routine (an agent, in Claudinite)
        ▼
docs PR in Claudinite  → review → merge
        │  a dependency bump updates the submodule pin here
        ▼
the canon absorbs it → optimize-procedures prunes the local copy
```

The generic-enough call is made **twice** — the consumer proposes, the Claudinite
curator confirms and dedupes against the whole shared corpus — which is a feature,
not redundancy.

## What lives in the consuming repo

- **A handoff workflow** — on an issue **labelled** with the handoff label, it
  copies the issue to Claudinite as a new handoff-labelled issue (with a provenance
  backlink), then comments the link and **closes the source issue** (the canonical
  home is now the Claudinite issue). It's deterministic — no agent — and bounded to
  issue plumbing. It triggers on the **label alone**, not on any issue template: the
  optimize-procedures routine files its issue programmatically with the fields in
  the body, and a human filing one by hand opens a plain issue carrying the
  lesson(s) and applies the label. Either way the body holds the proposal. And it
  fires the instant the label lands (including at issue creation), copying + closing
  within seconds, so it's **effectively irreversible from this side**: to withhold a
  borderline item, decide *before* filing and don't apply the label — removing the
  label afterward loses the race, and the already-created Claudinite copy then has
  to be closed in Claudinite, which a session scoped only to the consuming repo
  can't reach.
- **The handoff label** — the trigger. The optimize-procedures routine **ensures it
  exists idempotently** before applying it (create-if-missing, no-op-if-present), so
  it needs no manual pre-creation and never errors on a re-run. Where the literal
  label string must appear in more than one file (a workflow guard, a config), guard
  it against drift with a per-file occurrence-count check.

## The token

The Action copies cross-repo, which a workflow's automatic token **cannot** do, so
it uses a repo secret holding a fine-grained PAT with **Issues: Read and write**
scoped to **Claudinite only**. The back-link comment and the close happen on the
*consuming* repo and use the built-in workflow token (the PAT is Claudinite-scoped
and can't write here).

## The Claudinite-side curation routine (lives in Claudinite, not here)

An agent routine wired to the handoff label **in Claudinite** does the judgment
step: dedupe **each lesson** carried in the issue against the existing shared docs,
drop the ones that aren't genuinely new/portable, route the rest to the docs they
own, and open **one docs PR** for the whole batch (never a direct edit), referencing
the issue. Folding the issue's lessons into a single PR is the other half of the
no-collision design (the consumer side bundles them into one issue): many same-doc
edits land together instead of as rival PRs that conflict on merge. Keep its
launcher a **thin pointer** to a Claudinite doc, and give it its own standing
tracking issue **in Claudinite** that it logs each run to (the own-tracking-issue
convention).

## One-time owner setup

1. **The cross-repo PAT secret** — the fine-grained PAT above, under the consuming
   repo's Actions secrets.
2. **Stand up the Claudinite curation routine** and its tracking issue (above), and
   schedule the **optimize-procedures** routine that feeds this up-path.

The handoff label needs no manual creation — optimize-procedures ensures it on both
sides before use (the Action also self-creates it on the Claudinite side). Until 1
is done the hand-off can't run; until 2 is done a handed-off issue just waits in
Claudinite for a human.

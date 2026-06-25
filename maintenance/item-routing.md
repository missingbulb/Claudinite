# Evaluating and routing a new item

The shared method for two decisions every proposed addition to this corpus must
pass through: **is it worthy** of inclusion at all, and if so, **where does it
go**. Any routine or person that adds an item — the lesson-curation routine, an
on-demand "learned lessons" pass, a hand edit — applies this same protocol, so
the decision-making lives here once instead of being re-derived per caller.

This is a Claudinite-internal maintenance doc: it is **not** part of the mounted
corpus and consuming repos do not `@import` it.

An "item" is one **distilled, portable rule** — not a transcript, not a
narration of what happened. A candidate still phrased as "here's what we did" has
not been distilled yet and is below the bar on form alone, before any of the
tests below. The method that turns a raw session into a distilled rule is
[../general/extracting-lessons.md](../general/extracting-lessons.md); this doc
picks up once a rule exists and decides its fate.

## Worthiness — does it earn a place at all

The corpus is read read-only by every consuming repo, so a wrong or duplicative
item pollutes shared canon and costs every future reader. The bar is therefore
high and the **default is to reject**. Admit an item only when **all** hold:

- **Distilled.** It is a single tight rule in the imperative, not a story, a
  log, or a restatement of a generic truism.
- **Portable.** It is true for any consuming project read cold — it does not lean
  on one project's files, services, or mechanics. An item that only makes sense
  with a particular repo's context belongs in that repo's local docs, not here.
- **Durable and reusable.** It will still apply on a future, unseen task — not a
  one-off, not a situational detail, not something already implied by an existing
  rule.
- **Not already covered.** The insight does not already exist **anywhere** in the
  corpus, even worded differently or owned by a different file. This is checked
  against the *entire* corpus, not just the file it would land in — see
  [Dedupe against the whole corpus](#dedupe-against-the-whole-corpus).

Reject on any miss. Reject on a tie. A rejection is a **common, expected,
healthy** outcome — most candidates do not clear this bar, and saying "nothing
worthy here" and writing nothing is always preferable to padding the canon to
look productive. Failing none of these tests does not by itself force admission;
when genuinely unsure, still reject — a missed item is cheaper to recover than a
spurious one is to undo.

### Dedupe against the whole corpus

Before admitting anything, read across the corpus, not only the file you expect
to own the item. The same insight is frequently already present under a different
heading or in an adjacent group. If it sharpens an **existing** rule, fold it in
with a minimal edit rather than adding a second bullet that says nearly the same
thing — and never weaken or restate what is already there in the process.

## Routing — picking the right file

Routing is robust when it keys on **stable file groups**, not on the current
roster of individual files (which grows over time). The corpus is organized into
a few groups, each with its own selection rule:

1. **The portable-practice group** — the durable, project-agnostic engineering,
   agentic, git/GitHub, testing, investigation, discipline, and architecture
   rules. Within it, files are partitioned **by kind of practice**: each file
   owns one recurring subject cluster. Route by matching the item's *kind* to the
   file whose cluster already owns that subject. Read the group's own index/table
   from the repo to find the current owner for a kind — never from memory, since
   the set of clusters can grow.
2. **The per-user group** — interaction preferences and trigger phrases, **one
   file per person**, named for that person's identity. Route an item of this
   kind to the file for the user it belongs to; it never goes in the
   practice group.
3. **The per-technology group** — practices specific to one technology, **one
   file per technology**. Route a technology-specific item to that technology's
   file.

Pick **exactly one** owner. If an item plausibly fits two files, choose the
single best one — never split one item across files, and never duplicate it into
both. The group decides the *axis* (kind, person, or technology); the file within
the group is then the one whose existing scope the item falls squarely inside.

### When nothing fits

An item that matches **no** existing file is *usually* a reject signal: it is
probably project-specific rather than portable, and failing to find a home is
evidence it does not belong in shared canon. Resolve it in this order:

- **Reject** if it is non-portable or below the bar — the common case.
- **Route into the closest existing owner** if it genuinely belongs to that
  file's cluster and merely sits slightly off-center. A small stretch toward an
  existing owner beats spinning up a new file.
- **Open a new file** only in the rare case where the item is unmistakably
  portable and durable, opens a **genuinely new recurring cluster** that no
  existing file owns and that you expect to recur, and forcing it into the
  closest file would **distort** that file's stated scope. A lone item that fits
  nowhere is almost always a reject, not a new file. When unsure whether this bar
  is met, reject — a spurious new file fragments the corpus and is harder to undo
  than a missed one. Creating a file also obliges registering it where the corpus
  is indexed and in any routing table, in the same change, so it never lands
  orphaned.

Placing a brand-new file follows the corpus's normal placement judgment
([../general/filePlacement.md](../general/filePlacement.md)): it goes in the group
directory its kind belongs to, alongside its neighbors.

## Keep the write surface bounded

Once worthiness and routing are settled, the edit touches **only** the single
owning file: add or sharpen one terse rule in that file's existing voice and
format, and change nothing else. Do not "improve" unrelated rules while you are
in there. The sole exception is the rare new-file path above, whose surface is
itself bounded to the new file plus its index and routing-table registration.

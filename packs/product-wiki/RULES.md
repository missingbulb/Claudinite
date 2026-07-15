# product-wiki — the self-growing product research wiki

This project keeps its market/user/competitor research as a self-growing wiki
under `product/` (Karpathy's LLM-wiki pattern: compile findings once, refine in
place). Layout, required page sections, growth-log dating, source links,
staleness, and the isolation wall are **check-enforced** — the finding is the
instruction, so this prose never restates them. The full growth procedure is
the pack's worker doc (`packs/product-wiki/run_daily/wiki-growth.worker.md`);
GoogleCalendarEventCreator is the worked implementation.

- **The sink is human-reviewed only.** `product/product-requirements/` never
  changes as a side effect of wiki work or any unattended pass — a wiki finding
  that should move a requirement gets a growth-log note (and a repo issue) and
  waits for a human. It is the only `product/` content the rest of the repo may
  build on.
- **Compile once, refine in place.** Read the target page end to end before
  researching; `## Open questions` is the backlog — research what it flags as
  open, thin, or dated, and spot-check an existing citation or two per pass.
  Never re-derive a claim that's already cited and current.
- **Cited, never silently rewritten.** An uncited claim doesn't get written. A
  wrong or superseded claim is corrected with a note of why (and its source),
  never deleted without trace. Every real change appends one dated growth-log
  entry and updates the open questions in both directions.
- **No fabricated growth.** Most passes find little or nothing; no new citable
  material → no edit, no log entry, no PR. A padded update is worse than none.
- **sample-data and new wikis.** `product/sample-data/` gains a file only when
  a wiki claim needs one to point to — never test fixtures (anything a test
  asserts against belongs in engineering's tree). Any folder under `product/`
  outside the two reserved names *is* a wiki (the structural classifier), so
  create one only deliberately, seeded with the three sections; automation
  refines existing pages, it never invents new ones.
- **Review discipline.** Unattended growth always lands as an unmerged PR —
  researched claims entering a committed knowledge base need the review gate.
  The owner phrase **"grow the product wiki"** runs the worker method
  in-session with full web tooling: same rules, same PR discipline.

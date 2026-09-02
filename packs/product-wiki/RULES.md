# product-wiki — the self-growing product research wiki

- **Every page opens with what it found.** `## Key insights` leads the page: a
  few bullets carrying the research's actual conclusions — the numbers, the
  competitor that already does this, the thing that turned out not to be true —
  enough that a human who reads only the header understands what was researched
  and what it means. Not a table of contents ("covers pricing and competitors"),
  not a teaser. The body is where the reader goes for evidence, nuance and
  citations; the header is where they decide whether they need to.
- **Terse, plain, and only the non-obvious.** One short line per bullet, in
  ordinary words — no qualifying clause, no citation, no hedge, no jargon a
  newcomer would have to decode. Prefer the finding that would *surprise*
  someone who knows the field: the thing that turned out not to be true, the
  number nobody expects, the competitor who already shipped it. Whether a point
  is obvious is genuinely hard to call, so **don't agonise — when in doubt, keep
  it**. A borderline-obvious line costs the reader two seconds; a long, careful
  line costs them the header.
- **The header is a current view, not a log.** A pass that changes what a page's
  most important findings are rewrites the header to match — a superseded
  insight leaves it (the correction and its why stay in the body, per below),
  and an insight the pass didn't touch stays put. If nothing changed the page's
  top-line understanding, the header doesn't move.
- **The sink is human-reviewed only.** `product-wiki/product-requirements/` never
  changes as a side effect of wiki work or any unattended pass — a wiki finding
  that should move a requirement gets a growth-log note (and a repo issue) and
  waits for a human. It is the only `product-wiki/` content the rest of the repo may
  build on.
- **Compile once, refine in place.** Read the target page end to end before
  researching; `## Open questions` is the backlog — research what it flags as
  open, thin, or dated, and spot-check an existing citation or two per pass.
  Never re-derive a claim that's already cited and current.
- **Cited, never silently rewritten.** An uncited claim doesn't get written. A
  wrong or superseded claim is corrected with a note of why (and its source),
  never deleted without trace. Every real change records itself in the page's
  growth log and updates the open questions in both directions.
- **Seeing a figure in several places is not evidence of who published it.**
  Search snippets quote each other, so a number that recurs across five results
  is one source repeated, and the firm the snippets name is routinely not the
  firm that produced it. When you cannot open the report, attribute the figure to
  the publisher a source explicitly names as its **origin**; when sources
  disagree about that, say so on the page rather than picking one.
- **No fabricated growth.** Most passes find little or nothing; no new citable
  material → no edit, no log entry, no PR.
- **sample-data and new wikis.** `product-wiki/sample-data/` gains a file only when
  a wiki claim needs one to point to — never test fixtures (anything a test
  asserts against belongs in engineering's tree). Any folder under `product-wiki/`
  outside the two reserved names *is* a wiki (the structural classifier), so
  create one only deliberately, seeded with its required sections; automation
  refines existing pages, it never invents new ones.
- **Review discipline.** Unattended growth always lands as an unmerged PR —
  researched claims entering a committed knowledge base need the review gate.
  The owner phrase **"grow the product wiki"** runs the worker method
  in-session with full web tooling: same rules, same PR discipline.

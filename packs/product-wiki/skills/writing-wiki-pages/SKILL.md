---
name: writing-wiki-pages
description: How a product-wiki page is written and grown — the Key insights header, citation, correction without deletion, the growth log, sample-data, when a pass writes nothing. Loaded for any edit under product-wiki/.
metadata:
  force-load-on-file-edits-paths:
    - "product-wiki/**"
---

# Writing product-wiki pages

The rules a wiki page is held to while it is being edited. Which page to grow and where the
material comes from is the caller's business — the weekly
[wiki-growth](../../tasks/wiki-growth/task.md) pass picks from each page's open questions, and
[explore-link](../explore-link/SKILL.md) is handed a source — and both write under these.

- **Opening a page with what it found.** `## Key insights` leads the page: a few bullets carrying
  the research's actual conclusions — the numbers, the competitor that already does this, the
  thing that turned out not to be true — enough that a human who reads only the header
  understands what was researched and what it means. Not a table of contents ("covers pricing
  and competitors"), not a teaser. The body is where the reader goes for evidence, nuance and
  citations; the header is where they decide whether they need to.

- **Writing an insight bullet.** One short line, in ordinary words — no qualifying clause, no
  citation, no hedge, no jargon a newcomer would have to decode. Prefer the finding that would
  *surprise* someone who knows the field: the thing that turned out not to be true, the number
  nobody expects, the competitor who already shipped it. Whether a point is obvious is genuinely
  hard to call, so **don't agonise — when in doubt, keep it**. A borderline-obvious line costs
  the reader two seconds; a long, careful line costs them the header.

- **Touching the header after a pass.** It is a current view, not a log. A pass that changes
  what a page's most important findings are rewrites the header to match — a superseded insight
  leaves it (the correction and its why stay in the body, per below), and an insight the pass
  didn't touch stays put. If nothing changed the page's top-line understanding, the header
  doesn't move.

- **Starting a pass on a page.** Compile once, refine in place: read the target page end to end
  before researching; `## Open questions` is the backlog — research what it flags as open, thin,
  or dated, and spot-check an existing citation or two per pass. Never re-derive a claim that's
  already cited and current.

- **Writing a claim.** Cited, never silently rewritten: an uncited claim doesn't get written. A
  wrong or superseded claim is corrected with a note of why (and its source), never deleted
  without trace. Every real change records itself in the page's growth log and updates the open
  questions in both directions.

- **Attributing a figure you saw in several places.** Recurrence is not evidence of who
  published it: search snippets quote each other, so a number that recurs across five results
  is one source repeated, and the firm the snippets name is routinely not the firm that produced
  it. When you cannot open the report, attribute the figure to the publisher a source
  explicitly names as its **origin**; when sources disagree about that, say so on the page
  rather than picking one.

- **Finding nothing citable.** No fabricated growth: most passes find little or nothing; no new
  citable material → no edit, no log entry, no PR.

- **Adding to `product-wiki/sample-data/`, or a new wiki folder.** sample-data gains a file only
  when a wiki claim needs one to point to — never test fixtures (anything a test asserts against
  belongs in engineering's tree). Any folder under `product-wiki/` outside the two reserved
  names *is* a wiki (the structural classifier), so create one only deliberately, seeded with
  its required sections; automation refines existing pages, it never invents new ones.

- **Touching `product-wiki/product-requirements/`.** The sink is human-reviewed only, and it
  never changes as a side effect of wiki work or any unattended pass — a wiki finding that
  should move a requirement gets a growth-log note (and a repo issue) and waits for a human.

- **Landing the change.** Unattended growth always lands as an unmerged PR — researched claims
  entering a committed knowledge base need the review gate. The owner phrase **"grow the
  product wiki"** runs the worker method in-session with full web tooling: same rules, same PR
  discipline.

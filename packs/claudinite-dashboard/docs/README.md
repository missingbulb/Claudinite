# claudinite-dashboard — design and data specification

The end state of both pages and the data they render from. The pack's own
[README](../README.md) is the reader-facing description; these are the specification an
implementer of a page or of the fold works from. Tracking issue: #1602.

| Doc | What it specifies |
|---|---|
| [fleet-page.md](fleet-page.md) | The fleet page above the members grid: Start here, The machine, the ledger, the pulse — each panel's question, figures, derivations, *bad when* rules, and the alternatives not taken |
| [repo-page.md](repo-page.md) | The repo page's top block, scoped to one scheduler: the hourly machine strip, the ledger with its per-task expand, and the figures only one repo's page can state |
| [work-board.md](work-board.md) | The Work board: the time axis, a lane per flow, the four groups, every mark and the issue or PR field it reads, the task × day grid, the explore panel per status, the three views as tabs |
| [data-sources.md](data-sources.md) | Every figure → its source; the new fold fields with extraction, dedup, watermark and absence rules; the page-side changes; the request budget |
| [visual-identity.md](visual-identity.md) | The ledger-sheet identity: palette tokens for both themes, type roles, layout, the mark vocabulary, the delta-tint rule, and the rules a future change must respect |
| [pack-contributions.md](pack-contributions.md) | How any pack contributes its own figures to both pages — data, never code |
| [mocks/fleet.html](mocks/fleet.html), [mocks/repo.html](mocks/repo.html) | The committed mocks, drawn against real fold data; illustrative where a figure's source does not exist yet, and each says so in its own footer |

Three rules run through all of it and are stated once, here:

- **Not read is not zero.** A figure whose source is absent is named as absent, never drawn
  at the floor. The fold leaves no key; the page reads a missing key as *not recorded*.
- **Every count is a window against the previous window.** No cumulative totals, no
  scores, no invented hours.
- **A delta is tinted only where its own *bad when* rule fires.** A slower week is a
  figure, not a verdict.

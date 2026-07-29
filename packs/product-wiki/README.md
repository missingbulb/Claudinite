# product-wiki pack

The self-growing product research wiki standard: a repo keeps its
market/user/competitor research as agent-maintained wikis under `product-wiki/`
(Karpathy's LLM-wiki pattern — compile findings once, refine in place, cite
everything), walled off from the code so nothing can silently depend on
unreviewed research, with one human-reviewed crossing point. Declared by the
project (fingerprint: `product-wiki/product-requirements/README.md` — the sink is
the standard's one structural constant). Takes **no config**: the layout is the
standard.

## The standard

- `product-wiki/` at the repo root. Two reserved children with fixed meaning:
  **`product-wiki/product-requirements/`** — the human-reviewed distillation of the
  wikis into product requirements, the **only** `product-wiki/` content the rest of
  the repo may reference, never auto-grown — and **`product-wiki/sample-data/`** —
  small illustrative assets a wiki claim points to (never test fixtures).
- **Everything else under `product-wiki/` is wiki space** — any names, any nesting.
  A wiki page is a `README.md` at depth ≥ 2 under `product-wiki/` outside the two
  reserved subtrees. The folder is the classifier; there is no wikis manifest
  to drift, and a renamed wiki folder is still a wiki folder — still checked,
  still barred.
- Every wiki page **opens with `## Key insights`** — up to seven bullets, one
  terse plain-words line each, carrying what the research found, ahead of every
  other section. The body is the research record; the header is what makes it
  readable, so a human who reads only the header understands what was researched
  and what came of it.
- Every wiki page also carries `## Sources` (every source bullet carrying its
  real URL), `## Growth log` (dated bullets, newest change appended per pass),
  and `## Open questions` (the research backlog the growth passes work from).
- Growth is scheduled research: the pack's weekly scheduled task
  ([tasks/wiki-growth/task.md](tasks/wiki-growth/task.md)) reads
  the wikis, researches what their own open questions flag, writes back cited,
  and delivers an unmerged PR. Most passes correctly change nothing.

## Rules

| Rule | Enforces (≤5 words) | How |
|---|---|---|
| `product-wiki-layout` | skeleton exists (index + sink) | check, blocking |
| `product-wiki-page-sections` | pages carry the four sections | check, blocking |
| `product-wiki-key-insights` | header leads, bulleted, succinct | check, blocking |
| `product-wiki-growth-log` | log bullets dated, real dates | check, blocking |
| `product-wiki-sources` | source bullets carry their URL | check, blocking |
| `product-wiki-freshness` | stale wiki gets a nag | check, **advisory** |
| `product-wiki-isolation` | repo can't reference wiki space | check, blocking (fixed barrier) |
| sink is human-reviewed only | — | prose + worker must-never-do |
| cite / correct-with-note / no fabrication | — | prose + worker method |
| sample-data ≠ test fixtures | — | prose |
| unattended growth lands as unmerged PR | — | prose + worker delivery policy |

`product-wiki-key-insights` enforces the header's **shape** — it leads every other
section, it is bullets only, it carries at least one and at most seven, and no
bullet runs past **140 characters**, about one line (a bullet's indented
continuation lines count as part of it, so hard-wrapping is free). The tight cap
is the point: a header is worth having only if it is faster to read than the
page, and the failure mode in practice is a bullet that keeps qualifying itself.
*Which* insights lead, how plainly they are worded, and keeping them true as
research moves is judgment — that lives in RULES.md and the growth worker, and
no check can score it. The missing heading itself is
`product-wiki-page-sections`' finding, never double-reported.

`product-wiki-freshness` is advisory **by design**, not as a maturity stage: it
is time-driven (a repo goes stale with no change to its tree), and a
wall-clock-dependent finding must never block a Stop or fail CI. It fires per
page after 45 days without a growth-log entry — the in-repo observer for "the
unattended growth channel silently stopped firing". Silence it with
`rules: {"product-wiki-freshness": "off"}`.

## Scaffold template

```
product-wiki/
  README.md                        # index: what lives here, why it's walled off
  product-requirements/README.md   # the human-reviewed sink (required)
  <YourWiki>/README.md             # one folder per wiki — seeded like this:
```

```markdown
# <YourWiki>

What this wiki tracks, in a sentence or two.

## Key insights

- The non-obvious thing this research found, in one plain line.
- ...up to seven; short beats clever, no citations, no hedges.

## <Your content sections>

## Sources

- [Title](https://real.url/)

## Open questions

- What should the next growth pass look into?

## Growth log

- **YYYY-MM-DD** — initial seed.
```

## Excusing a deliberate crossing (accept, not except)

`product-wiki-isolation` is a **fixed** barrier — its edges are pack code, so a
consumer cannot add the barriers pack's per-rule `except` entries to it. Each
crossing finding's own fix text says so and names the lever that works: a
top-level (or pack-entry) **accept**:

```json
"accept": [
  { "rule": "product-wiki-isolation", "path": "docs/inventory.md",
    "reason": "historical ledger — enumerates the wikis it catalogs" }
]
```

Matched by rule id + exact path (or a `dir/` prefix for a subtree); the reason
is mandatory. Unlike a barrier rule's own `except`, accepts are **not**
staleness-audited — prune one by hand when the crossing it excused is gone.

## Bootstrap ordering

Declaring the pack before scaffolding `product-wiki/` yields two `layout` findings
plus the barrier's fail-closed empty-glob finding — three blocking arrows all
pointing at the same two-file scaffold. That is deliberate: a declaration is a
statement of intent, unlike the barriers pack's unconfigured no-op (where
config absence means "nothing declared").

## Known gaps

- The barrier engine never scans `*.test.mjs`/test files as sources, so a test
  importing from wiki space is invisible to `product-wiki-isolation` — covered
  by prose (nothing a test asserts against belongs under `product-wiki/`), not
  fought in code.
- Accepts against `product-wiki-isolation` are pruned by hand (no staleness
  audit — see above).
- The weekly growth task rides the repo's own scheduler
  ([../../docs/per-project-scheduling/DESIGN.md](../../docs/per-project-scheduling/DESIGN.md));
  a repo without a `taskScheduler` anchor gets no unattended growth — the freshness
  advisory is the backstop that surfaces that, and the owner phrase "grow the
  product wiki" runs the same worker method in-session.

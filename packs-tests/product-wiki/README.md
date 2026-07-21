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
- Every wiki page carries `## Sources` (every source bullet carrying its real
  URL), `## Growth log` (dated bullets, newest change appended per pass), and
  `## Open questions` (the research backlog the growth passes work from).
- Growth is scheduled research: the pack's weekly `run_daily` task
  ([packs/product-wiki/run_daily/wiki-growth.worker.md](../../packs/product-wiki/run_daily/wiki-growth.worker.md)) reads
  the wikis, researches what their own open questions flag, writes back cited,
  and delivers an unmerged PR. Most passes correctly change nothing.

## Rules

| Rule | Enforces (≤5 words) | How |
|---|---|---|
| `product-wiki-layout` | skeleton exists (index + sink) | check, blocking |
| `product-wiki-page-sections` | pages carry the three sections | check, blocking |
| `product-wiki-growth-log` | log bullets dated, real dates | check, blocking |
| `product-wiki-sources` | source bullets carry their URL | check, blocking |
| `product-wiki-freshness` | stale wiki gets a nag | check, **advisory** |
| `product-wiki-isolation` | repo can't reference wiki space | check, blocking (fixed barrier) |
| sink is human-reviewed only | — | prose + worker must-never-do |
| cite / correct-with-note / no fabrication | — | prose + worker method |
| sample-data ≠ test fixtures | — | prose |
| unattended growth lands as unmerged PR | — | prose + worker delivery policy |

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
- The weekly growth task rides the fleet daily routine
  ([../../routines/auto-all-repos-maintenance.md](../../routines/auto-all-repos-maintenance.md));
  a repo outside the fleet's scope gets no unattended growth — the freshness
  advisory is the backstop that surfaces that, and the owner phrase "grow the
  product wiki" runs the same worker method in-session.

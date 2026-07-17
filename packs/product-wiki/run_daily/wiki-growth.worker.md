# wiki-growth worker

One compile-once/refine-in-place research pass over the repo's product wikis (the
Karpathy LLM-wiki pattern): read what the wiki already knows, research only what
its own backlog flags, write it back cited. **Most runs find little or nothing —
no new citable material means no branch, no PR, and that is the documented good
outcome.** A padded or fabricated update is worse than none.

Works entirely over the session's **GitHub MCP tools** (`mcp__github__*`) — never
`gh`/`curl`/a clone; the fleet run has no consumer shell or npm. "Default branch"
below means the repo's actual default branch. The wiki set is derived
**structurally**: every `README.md` at depth ≥ 2 under `product-wiki/`, excluding the
`product-wiki/product-requirements/` and `product-wiki/sample-data/` subtrees.

## Preflight

Search the repo for an open PR whose head branch matches `claude/product-wiki-growth/*`.
If one is open, do **not** stack a second round of unreviewed research on it —
add one dated nudge comment on that PR and stop.

## Method

1. **Read every wiki page end to end** (`get_file_contents`), the `## Open
   questions` and `## Growth log` sections first-class. Never re-derive a claim
   that is already cited and current.
2. **Pick the one or two open questions** across the set most worth this run;
   also spot-check one or two existing citations for staleness (a dead link, a
   superseded stat).
3. **Research.** *Web mode* (WebSearch/WebFetch available): the open web.
   *Repo-derived mode* (web tools absent — do not fail, do not fake): citable
   repo-native signal only — new feature-request/extractor-request issues,
   merged PRs, issue/PR discussion carrying user-side signal — each citable to
   its own GitHub URL.
4. **Write into the relevant wiki page(s) only**, per the pack's RULES.md: cite
   every claim in that page's `## Sources`; correct a wrong or superseded claim
   with a note of why, never a silent deletion; touch `product-wiki/sample-data/`
   only when a new claim needs an illustrative example; **never write
   `product-wiki/product-requirements/`** — a finding that should move a requirement
   gets a growth-log note (and a repo issue) and waits for a human.
5. **One dated `## Growth log` entry per touched page** (`- **YYYY-MM-DD** —
   what changed`).
6. **Update `## Open questions` both directions** — remove what this run
   answered, add what its research surfaced.

## Stop condition

Neither mode yields citable material → stop. No commit, no log entry, no PR.

## Delivery

This worker's own delivery policy (deliberately stricter than the member's
`maintenance.delivery`, and documented here as that sanctioned deviation):
branch `claude/product-wiki-growth/<date>` (unique branch per run), commits
touching only `product-wiki/**` minus `product-requirements/`, one **PR — never
merged, never pushed to the default branch directly**. Web-researched claims
entering a committed knowledge base need the review gate; mechanical
drift-correction doesn't, but this isn't that. PR body: the question(s)
researched, what changed where, the citations added, and the open questions
left for the next run.

## Tracking

Standing issue found by exact title **"Claudinite tracker: Product Wiki
Growth"** in the member repo — found by title, never by number, never
opened/closed as state (open it if missing). One dated comment when a pass
**grew** (`grew (PR #N): <one line>`) or was **blocked** (`blocked: <why>` —
the human-visible convergence for a failed unattended run). Clean no-ops stay
silent — the pack's freshness advisory is the prolonged-silence observer.

Run on a capable model (`smarts: high`): open-web research plus curation is
judgment-heavy, and the PR review gate is the last catch for fabrication.

## What this worker must never do

Edit `product-wiki/product-requirements/`; edit anything outside `product-wiki/`; create
new wiki folders (automation refines existing pages — a human creates a wiki
deliberately); write an uncited claim; delete a claim without a superseded
note; pad a growth log or a wiki page to look productive; merge or approve its
own PR; schedule anything (no cron, no `schedule:` workflow); touch the shared
canon.

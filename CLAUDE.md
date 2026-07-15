# Claudinite — corpus index

> ℹ️ The owner's personal preferences and the active packs' prose are both injected automatically by
> SessionStart hooks — they're already in context above. Honor them; there is nothing to go read.

**Routing map, not a payload.** Two homes hold the corpus, selected by *when* a rule is active:

- **`packs/<name>/`** — a bundle of prose (a pack's `RULES.md`) **and** checks, selected **once per
  session** by the project's declaration in `.claudinite-checks.json`. No pack is active by default —
  `basics` too is declared explicitly (bootstrap seeds it). The active packs' prose loads at session
  start via `packs/load-active-prose.mjs`; the checks run at every Stop and in CI. This is the "decided
  once, seldom changes" set.
- **`skills/<name>/`** — activity-scoped procedures, surfaced **on demand** by the harness when the work
  in front of you matches the skill. Deployment is pack-driven: each pack declares the skills it
  requires, and a repo mounts the union over its active packs at session start
  (`skills/mount-skills.mjs`); the `skill-ownership` check keeps every skill required by some pack.
  Catalog: [skills/README.md](skills/README.md).

Everything enforceable is a check or a hook; everything always-relevant-to-a-project is pack prose;
everything activity-scoped is a skill. Before adding *any* rule as prose, run the promotion ladder in
[checks/DESIGN.md](checks/DESIGN.md): a platform setting, a hook, a check, or a skill that can carry it
beats prose. And before adding *any* feature — a rule, a technology's conventions, a nightly task —
decide the core/pack boundary first: [extending.md](extending.md) is the map of what's engine and what's
pack-contributed content, and where each kind of feature goes (almost never core).

## packs/ — prose + checks, active only when declared (`basics` too)

- **[packs/basics/](packs/basics/RULES.md)** — the baseline: working discipline, the task
  lifecycle, and the core checks. Declared explicitly like every other pack — bootstrap seeds
  the declaration, the nightly baselining backfills it into existing consumers.
- **[packs/barriers/](packs/barriers/README.md)** — a mechanism pack: enforce a directed
  folder-access graph (folder A may not reference folder B — imports, path/filename references, in
  any language, comments and docs included), declared per-project as `config` on the repo's barriers pack entry. Its
  detection engine is exported so other packs compose their own separation rules on it (the way
  `spec-driven-product` builds on `executable-requirements`).
- **Technology packs**, active when the project declares them (bootstrap's `--init` seeds the
  declaration from a fingerprint): `chrome-extension` (MV3 coding gotchas, fingerprinted by the
  manifest), `chrome-extension-release` (the *opt-in* release/store standard in its
  [RELEASE.md](packs/chrome-extension-release/RELEASE.md) + the conformance checks — declared when the
  project is ready to ship, fingerprinted by its single `Release to Chrome Store` workflow stub), `github-actions`
  (workflow lints), `node`, `aws-sam`, `html`, `flutter`, `firebase` (rules/functions/deploy
  discipline, fingerprinted by `firebase.json`) with its opt-in `firebase-release` (dev/prod
  project split + App Check store gating — declared near shipping), and the stubs `android`,
  `ios`, `play-store-release`, `app-store-release` (filled when first exercised).
- **Project-class packs**, declared by kind of project: `research-project` (the
  algorithm-iteration playbook — [packs/research-project/RULES.md](packs/research-project/RULES.md))
  and `spec-driven-product` (the executable-spec product playbook —
  [packs/spec-driven-product/RULES.md](packs/spec-driven-product/RULES.md)) with its mechanics
  companion `executable-requirements` (the framework standard — layout, gates, kinds incl. the
  storyboard `saga` kind, gallery, determinism; fingerprinted by `dev/requirements/requirements.md`
  — [packs/executable-requirements/RULES.md](packs/executable-requirements/RULES.md)); and
  `product-wiki` (the self-growing product research wiki standard — layout, section/citation/log
  checks, a fixed isolation barrier, a weekly growth daily task; fingerprinted by
  `product/product-requirements/README.md` — [packs/product-wiki/README.md](packs/product-wiki/README.md)).

The declaration is **pack-oriented**: a `packs` entry is a pack id, or an entry object carrying that
pack's own settings — its parameters (`config`), and the rule overrides/acceptances its declaration
motivates (`rules`/`accept`, the entry being their provenance). Top-level `rules`/`accept` stay for
project-wide decisions and skill-owned checks. Full schema: [checks/README.md](checks/README.md).

**Settings validity** — an unknown pack name, an unknown property (top-level or on a pack entry), or
malformed JSON in `.claudinite-checks.json` — is checked when the file loads and surfaced by the runner as
a blocking `config` error (a wrong pack name is as much a settings error as bad JSON), not a conformance
check among the packs. A pack's `marker` only *suspects* the pack is wanted; whether to declare it is the
project's call, so neither a marker without its declaration nor a declaration without its marker is flagged.

A pack that only makes sense alongside another names it in its `requires` list (e.g.
`chrome-extension-release` requires `chrome-extension`, `firebase-release` requires `firebase`,
`spec-driven-product` requires `executable-requirements`). This isn't a check: a pack can't be imported
without its dependencies, so `resolveDeclaredPacks` ([packs/registry.mjs](packs/registry.mjs)) pulls each
declared pack's `requires` closure into the declaration when it's written — at `--init` and the baselining
backfill — materializing the prerequisite in the file, visible like every other entry, as
`{ "id": ..., "via": [...] }` with `via` naming the packs that require it.

## skills/ — activity-scoped procedures, surfaced on demand

The full catalog and each skill's trigger live in [skills/README.md](skills/README.md) — the source of
truth, kept complete against the tree by the `catalog-completeness` check. Two kinds: **command skills**
(owner-phrase or bootstrap triggers — e.g. `merge-to-main`, `lessons-learned`, `bump-version`) and
**practice skills** (surfaced by the activity in front of you — e.g. `bug-investigation`,
`writing-tests`, `engineering-practices`, `file-placement`). See the catalog for the complete list.

## preferences/ — auto-injected by the SessionStart hook

`preferences/<email>.md` holds the owner's per-user interaction preferences. The
`preferences/inject-preferences.sh` SessionStart hook loads the current user's file into context — you
don't read it yourself.

---

Repo internals — what this repo is, how consumers mount it, the maintenance routines → [README.md](README.md).
Changing the canon without hurting consuming repos → [consumer-safe-changes.md](consumer-safe-changes.md) (provisional).

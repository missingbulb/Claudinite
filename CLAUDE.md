# Claudinite — corpus index

> ℹ️ The owner's personal preferences and the active packs' prose are both injected automatically by
> SessionStart hooks — they're already in context above. Honor them; there is nothing to go read.

**Routing map, not a payload.** Two homes hold the corpus, selected by *when* a rule is active:

- **`packs/<name>/`** — a bundle of prose (a pack's `RULES.md`) **and** checks, selected **once per
  session** by the project's declaration in `.claudinite-checks.json` (`universal` is always on). The
  active packs' prose loads at session start via `packs/load-active-prose.mjs`; the checks run at every
  Stop and in CI. This is the "decided once, seldom changes" set.
- **`skills/<name>/`** — activity-scoped procedures, surfaced **on demand** by the harness when the work
  in front of you matches the skill. Catalog: [skills/README.md](skills/README.md).

Everything enforceable is a check or a hook; everything always-relevant-to-a-project is pack prose;
everything activity-scoped is a skill. Before adding *any* rule as prose, run the promotion ladder in
[checks/DESIGN.md](checks/DESIGN.md): a platform setting, a hook, a check, or a skill that can carry it
beats prose.

## packs/ — prose + checks, active when declared (`universal` always)

- **[packs/universal/](packs/universal/RULES.md)** — the always-on baseline: working discipline, the
  task lifecycle, and the universal checks. Loaded every session.
- **Technology packs**, active when the project declares them (bootstrap's `--init` seeds the
  declaration from a fingerprint): `chrome-extension` (MV3 coding gotchas, fingerprinted by the
  manifest), `chrome-extension-release` (the *opt-in* release/store standard in its
  [RELEASE.md](packs/chrome-extension-release/RELEASE.md) + the conformance checks — declared when the
  project is ready to ship, fingerprinted by its `Release: *` workflow stubs), `github-actions`
  (workflow lints), `node`, `aws-sam`, `html`, `flutter`.
- **Project-class packs**, declared by kind of project: `research-project` (the
  algorithm-iteration playbook — [packs/research-project/RULES.md](packs/research-project/RULES.md))
  and `spec-driven-product` (the executable-spec product playbook —
  [packs/spec-driven-product/RULES.md](packs/spec-driven-product/RULES.md)).

The `pack-declaration` check keeps the declaration honest against the repo's real fingerprint — including
telling the session that introduces a new technology to declare its pack.

## skills/ — activity-scoped procedures, surfaced on demand

The catalog and each skill's trigger live in [skills/README.md](skills/README.md): the command skills
(`merge-to-main`, `lessons-learned`, `bump-version`, `adopt-claudinite`, `generate-project-instructions`)
and the practice skills (`bug-investigation`, `writing-tests`, `repo-text-sweeps`, `authoring-agent-docs`,
`unattended-agents`, `git-github-advanced`).

## preferences/ — auto-injected by the SessionStart hook

`preferences/<email>.md` holds the owner's per-user interaction preferences. The
`preferences/inject-preferences.sh` SessionStart hook loads the current user's file into context — you
don't read it yourself.

---

Repo internals — what this repo is, how consumers mount it, the maintenance routines → [README.md](README.md).

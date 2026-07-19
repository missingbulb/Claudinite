# packs/ — the corpus content, active by declaration

Each `packs/<name>/` bundles a pack's **prose** (`RULES.md`, injected at session start when the pack is active), its **checks** (run at every Stop and in CI), and the **skills** it requires (mounted at session start). **No pack is active by default** — every pack, the `basics` baseline included, activates only when declared in `.claudinite-checks.json` (bootstrap's `--init` seeds `basics` plus the fingerprinted technology packs; the nightly baselining backfills the explicit `basics` declaration into existing consumers). Discovery is structural — any `packs/<name>/pack.mjs` is a pack. Each pack's `README.md` lists its rules with a ≤5-word description and whether each is **hardcoded** (a check) or **prose**.

## Packs

| Pack | Active when | Checks | Prose rules |
|---|---|---|---|
| [basics](basics/README.md) | declared (seeded by `--init`) | 11 | ~8 (working-discipline + task-lifecycle) |
| [barriers](barriers/README.md) | declared (or pulled in via `requires`) | 1 | 0 (config-driven segregation) |
| [grow_with_claudinite](grow_with_claudinite/README.md) | declared (seeded by `--init`, opt-out by removal) | 0 | growth member-side daily tasks (extract / dedup / pack discovery) |
| [canon-curation](canon-curation/README.md) | declared (home-only: the canon home repo, never seeded) | 1 | growth promote + prose-to-checks sweep daily tasks |
| [tidy-repo](tidy-repo/README.md) | declared (seeded by `--init`, opt-out by removal) | 0 | policy (assess-only-vs-act) + tidy daily tasks |
| [sheepdog](sheepdog/README.md) | declared (opt-in; the fleet-enforcer repo only) | 0 | fleet-enforcer marker + config + coverage workflow stub |
| [github-actions](github-actions/README.md) | `.github/workflows/` | 8 | 0 |
| [chrome-extension](chrome-extension/README.md) | manifest_version manifest | 0 | 8 |
| [chrome-extension-release](chrome-extension-release/README.md) | single `Release to Chrome Store` stub (opt-in) | 8 | 0 (+ RELEASE contract) |
| [node](node/README.md) | root package.json | 0 | 2 |
| [python](python/README.md) | pyproject.toml near root | 0 (2 in its skill) | 3 |
| [web-speech](web-speech/README.md) | speech API in JS/TS source | 0 (2 in its skill) | 15 |
| [aws-sam](aws-sam/README.md) | SAM template | 3 | 3 |
| [google-identity](google-identity/README.md) | declared | 0 (3 in its skill) | 0 |
| [html](html/README.md) | declared | 0 | 1 |
| [flutter](flutter/README.md) | pubspec.yaml | 0 | 0 (stub) |
| [firebase](firebase/README.md) | `firebase.json` | 0 | rules / functions / deploy discipline |
| [firebase-release](firebase-release/README.md) | declared (opt-in) | 0 | dev/prod split + App Check store gating |
| [android](android/README.md) | `AndroidManifest.xml` | 0 | stub |
| [ios](ios/README.md) | `ios/Runner/Info.plist` | 0 | stub |
| [play-store-release](play-store-release/README.md) | declared (opt-in) | 0 | stub |
| [app-store-release](app-store-release/README.md) | declared (opt-in) | 0 | stub |
| [research-project](research-project/README.md) | declared (class) | 0 | 54 (14 sections) |
| [product-wiki](product-wiki/README.md) | declared (marker: `product-wiki/product-requirements/README.md`) | 6 | wiki growth discipline + weekly growth daily task |
| [spec-driven-product](spec-driven-product/README.md) | declared (class) | 0 | 25 (8 sections) |
| [executable-requirements](executable-requirements/README.md) | `dev/requirements/requirements.md` | 0 | framework standard (layout / gates / kinds) |

Activity-scoped practice prose lives in [../skills/](../skills/README.md), not in a pack.

## Local packs — a project's own packs

A consumer keeps its **project-specific** packs in its own tree at
`.claudinite/local_packs/<name>/` — the same slots (prose `RULES.md`, `rules` checks, `skills`,
`run_daily` tasks, `questions`), authored and committed by the project, discovered and run by the
same engine as these canon packs. `discoverPacks({ localRoot })` ([registry.mjs](registry.mjs)) scans this repo's
`packs/` **and** the consumer's `local_packs/`; each pack is stamped with its own `dir` (prose and
bundled skills resolve off it) and a `local` flag. A local pack:

- is **declared by hand** in `.claudinite-checks.json` like any pack — never fingerprinted or seeded
  (`detect`/`marker` null), and its id must be unique (it may not shadow a canon id — the collision
  is a blocking `config` finding);
- may **require a canon skill** by name and/or **bundle its own** at `<pack>/skills/<skill>/`
  (mounted from the tracked pack dir); a bundled skill may carry `checks.mjs`, run when the pack is
  active;
- rides the deployment plumbing every consumer already vendors: the sync hook preserves
  `.claudinite/local_packs/` across its dir swap and the `.gitignore` re-includes it.

A local pack's **prose, checks, and skills** are the proven, shipped path. A local pack may also
declare `run_daily` tasks, and the fleet planner has a tested seam to read them from the member repo
([../routines/fleet/local-tasks.mjs](../routines/fleet/local-tasks.mjs)) — but that daily-run path is
**experimental and not enabled by default** (not yet proven for the load and variety of arbitrary
member-authored jobs), so a project's scheduled work stays a canon-pack `run_daily` or an out-of-repo
routine until it's deliberately enabled.

The canon-vs-local line is the portable-vs-project-specific split ([../extending.md](../extending.md));
a project adopts the structure via the `generate-project-instructions` skill, and the growth lifecycle
treats `.claudinite/local_packs/` as the project's capture surface.

## Settings validity

The `"packs"` list and the rest of `.claudinite-checks.json` are validated **when the file loads**, not by a conformance check: [`loadConfig`](../checks/lib/context.mjs) reports malformed JSON and an unknown top-level property, and the runner adds an unknown *pack name* (it holds the registry). Each becomes a blocking `config` error — a wrong pack name is as much a settings error as invalid JSON. A pack's `detect`/`marker` only **suspects** a pack is wanted; declaring it is the project's call, so a declared pack without its marker (or a marker without its declaration) is **not** flagged.

## Pack dependencies (`requires`)

A pack states the packs it depends on in an optional `requires` field on its `pack.mjs` — a plain array of pack ids: a release pack builds on its coding pack (`chrome-extension-release` requires `chrome-extension`, `firebase-release` requires `firebase`) and a project-class pack leans on the framework that implements it (`spec-driven-product` requires `executable-requirements`).

This is **not a check** — a pack can't be imported without its dependencies, so the resolution happens **when the declaration is written**, at bootstrap `--init` and the baselining backfill ([bootstrap.md](../bootstrap.md) Part 6): [`resolveDeclaredPacks`](registry.mjs) pulls each declared pack's transitive `requires` closure into `.claudinite-checks.json`. The prerequisite is materialized and visible in the file — droppable like every other entry, the same reason `basics` is written explicitly rather than defaulted — rather than resolved implicitly at run time. Declared ids keep their order; each pack's pulled-in dependencies land right after it.

## Skill requirements (`skills`)

A pack declares the skills its projects need in an optional `skills` field on its `pack.mjs` — a plain array of `skills/<name>/` names:

```js
skills: ['merge-to-main', 'writing-tests'],
```

The SessionStart hook [`../skills/mount-skills.mjs`](../skills/mount-skills.mjs) mounts the **union over the active packs** (same activation as prose/checks/env) as session-generated `.claude/skills/<name>` symlinks — nothing committed, and a self-ignoring `.claude/skills/.gitignore` keeps them out of git status. Several packs requiring the same skill is normal; a skill required by **no** pack never reaches any consumer, which is why the `skill-ownership` check (corpus CI) blocks both an unowned skill and a declaration naming a skill that doesn't exist. The baseline activities every project has (`merge-to-main`, `writing-tests`, `bug-investigation`, …) ride the `basics` pack's list; move a skill to a narrower pack when it stops being a baseline activity.

## Environment requirements (`env`)

A pack may declare a toolchain (or per-repo deps) a cloud session needs but the Claude Code Web base image doesn't ship — the `flutter` pack needs the Flutter SDK; the `node` pack needs the repo's `npm` modules. Install belongs in the environment **image** (built once, snapshotted, reused), never a per-session hook. A pack declares it in an optional `env` field on its `pack.mjs`:

```js
env: {
  label: 'Flutter SDK',                         // human name for the check's messages
  setup: '<bash>',                              // idempotent install fragment for the image
  probe: 'command -v flutter >/dev/null 2>&1',  // exit 0 iff present in the running env
}
```

`setup` and `probe` may be a **string**, or a **function of the project's per-pack params** — a project supplies parameters about its own usage as `config` on the pack's entry in `.claudinite-checks.json`, so one pack fragment fits every repo. The `node` pack uses this for where `npm ci` runs:

```js
// packs/node/pack.mjs
setup: (p) => (p.dirs?.length ? p.dirs : ['.']).map((d) => `( cd "${d}" && npm ci ) || true`).join('\n'),
// a repo's .claudinite-checks.json: { "packs": [ { "id": "node", "config": { "dirs": ["firebase/functions"] } } ] }
```

[`env.mjs`](env.mjs) drives everything from the repo's **active** packs (same activation as prose/checks):

- `node .claudinite/packs/env.mjs install` runs every active pack's `setup` in the checkout. The corpus's one generic [`environment-setup.sh`](../mount/environment-setup.sh) (synced into every consumer's `.claudinite/mount/`) calls this after syncing the corpus.
- `node .claudinite/packs/env.mjs check` is a SessionStart hook (web only) that **asserts** — it runs each `probe` directly against the running environment and injects the halt-gate context if a requirement is missing. No version flag: the probes are the source of truth, and a genuinely new requirement fails its probe and prompts a re-run. Never installs.
- `node .claudinite/packs/env.mjs plan` prints what `install` would run (review / debug).

Wiring a consumer up — the check hook + the pack entries' `config`, with the script pasted from the corpus copy — is [bootstrap.md](../bootstrap.md) Part 8. A pack with no `env` field adds nothing; universal git hygiene lives in the generic script, not a pack.

## Adoption interview (`questions`)

A pack that needs to know the project's **intent** before it can provide value (barriers with no
graph is a silent no-op; a visual-testing pack can't assert anything before learning how this repo
should be tested) declares the mandatory questions its adoption must ask, in an optional
`questions` field on its `pack.mjs` — stable-id'd entries, `distill` saying how the answer becomes
the entry's `config`:

```js
questions: [{ id: 'goals', prompt: 'What should these barriers accomplish — …?', distill: 'derive the edge list into config.rules …' }],
```

The answers live **verbatim** on the pack's entry in `.claudinite-checks.json` (`answers:
{ "<question-id>": "<answer>" }` — [checks/README.md](../checks/README.md)): the settings file
records the project's intent beside the `config` distilled from it — provenance for the
configuration, versioned and diffable, and re-derivable if the pack's config shape later changes.
The **gap** — declared question ids minus answered ids — drives the asking
([interview.mjs](interview.mjs)): at adoption every question is pending; when the canon later adds
a question to a pack, just that one surfaces in every consumer; a pack with no questions adds
nothing. An answered question stays answered — "n/a, none wanted" is an answer, distinct from
never-asked.

The posture is **strict at bootstrap, mild everywhere else**. The adoption flow
([bootstrap.md](../bootstrap.md) Part 6) interviews the owner as part of `--init` — a human is
present by construction. Outside it, pending questions surface only as a mild SessionStart note
(the `interview-check` step) telling an interactive session to ask at a natural moment and an
unattended one to ignore it entirely — **never a conformance finding**, so a nightly baselining or
a new canon question can never block the fleet. The one sweep-side finding is hygiene: a stored
answer whose question the pack no longer declares (renamed or removed upstream) is an *advisory*
`config` finding, and a malformed `questions` declaration is a blocking one like any broken
manifest.

## Corpus tally — checks vs prose

| | Count |
|---|---|
| **Hardcoded conformance checks** | **37** (11 basics + 1 barriers + 8 github-actions + 8 chrome-extension-release + 3 aws-sam + 6 product-wiki) |
| PreToolUse guard | 1 (remote-branch-delete) |
| Platform setting | 1 (squash-only) |
| **Prose rules** — packs + practice skills + baseline | **~150** |
| Prose — research-project playbook (class pack) | 54 |
| Prose — spec-driven-product playbook (class pack) | 25 |

**Ratio ≈ 37 hardcoded : ~150 prose ≈ 1 : 4** (~20% of rules mechanized). Read against the *convertible* subset instead of all rules, it's higher: the audit ([../docs/conversion-inventory.md](../docs/conversion-inventory.md)) found only ~45 rules have any static signature — the other ~105 are judgment, in-flight process, or runtime knowledge that *should* stay prose — and ~25 of that ~45 are now checks. The `prose-to-checks` sweep keeps working the remainder; its adversarial pass rejects candidates whose detection would false-positive (the two SAM YAML checks needed a structural parser to stay FP-free), so the yield is deliberately small and high-precision.

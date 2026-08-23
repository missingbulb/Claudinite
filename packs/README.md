# packs/ — the corpus content, active by declaration

Each `packs/<name>/` bundles a pack's **prose** (`RULES.md`, injected at session start when the pack is active), its **checks** (run at every Stop), and its **bundled skills** (`<pack>/skills/`, mounted at session start). **No pack is active by default** — every pack, the `basics` baseline included, activates only when declared in `.claudinite-settings.json` (bootstrap's `--init` seeds `basics` plus the fingerprinted technology packs; the nightly update backfills the explicit `basics` declaration into existing consumers). Discovery is structural — any `packs/<name>/pack.mjs` is a pack, and that manifest is the pack's index: what it owns, the checks it runs in each scope, the skills it bundles. A pack's `README.md` is **optional** and carries only what the manifest cannot — provenance, design rationale, an index of its prose. A README that restates the manifest is duplication with a drift risk, and several had already drifted.

## Packs

This table is the canon maintainer's view. The catalog **consumers** receive is
[`directory.GENERATED.md`](directory.GENERATED.md) — rendered from the pack manifests by its drift
test (`engine-tests/pack-directory.test.mjs`, which regenerates it locally and asserts it in CI) and
vendored into every mount regardless of declaration, so a member session can see what it could adopt.
A pack that is not adoptable content — one serving the corpus itself rather than any member —
declares `hidden: true` and is withheld from that catalog; this table still carries it.

| Pack | Active when | Checks | Prose rules |
|---|---|---|---|
| <img src="claudinite-lifecycle/badge.svg" width="18" height="18" alt=""> [claudinite-lifecycle](claudinite-lifecycle/README.md) | declared (seeded by `--init`, mandatory — pulled in via `basics` `requires`) | 10 | 8 (Claudinite's own surface, plus the scheduled-task contract) |
| <img src="basics/badge.svg" width="18" height="18" alt=""> [basics](basics/README.md) | declared (seeded by `--init`) | 13 | 49 (working-discipline + task-lifecycle) |
| <img src="barriers/badge.svg" width="18" height="18" alt=""> [barriers](barriers/README.md) | declared (or pulled in via `requires`) | 1 | 0 (config-driven segregation) |
| <img src="git-github/badge.svg" width="18" height="18" alt=""> [git-github](git-github/README.md) | pulled in via `basics` `requires` | 9 | 0 (3 skills: git-github-advanced, github-actions-scheduling, merge-to-main) |
| <img src="claudinite-growth/badge.svg" width="18" height="18" alt=""> [claudinite-growth](claudinite-growth/README.md) | declared (seeded by `--init`, opt-out by removal) | 1 | 0 — growth member-side tasks (extract over activity + conversations / dedup / pack discovery / prose-to-checks) + in-session merge capture |
| <img src="tidy-repo/badge.svg" width="18" height="18" alt=""> [tidy-repo](tidy-repo/README.md) | declared (seeded by `--init`, opt-out by removal) | 0 | 2 (policy (assess-only-vs-act) + 3 per-dimension tidy tasks (issues daily, PRs/branches weekly)) |
| <img src="claudinite-fleet-sheepdog/badge.svg" width="18" height="18" alt=""> [claudinite-fleet-sheepdog](claudinite-fleet-sheepdog/README.md) | declared (opt-in; the fleet-enforcer repo only) | 1 | 0 (fleet-enforcer marker + config + the agentless `fleet-roster` daily task (coverage + freshness in one walk)) |
| <img src="claude-code-web-users-support/badge.svg" width="18" height="18" alt=""> [claude-code-web-users-support](claude-code-web-users-support/RULES.md) | declared (seeded by `--init`) | 2 | 4 (what a project offers people working from the web — their personal interaction preferences, and the environment Setup script body) |
| <img src="claudinite-canary-repo/badge.svg" width="18" height="18" alt=""> [claudinite-canary-repo](claudinite-canary-repo/README.md) | declared (opt-in; the canary repo only, and `hidden` from the consumer catalog) | 0 | 0 (one inert workflow, seeded then converged — the live proof of the workflow-delivery lane) |
| <img src="claudinite-dashboard/badge.svg" width="18" height="18" alt=""> [claudinite-dashboard](claudinite-dashboard/README.md) | declared (opt-in) | 0 | 0 (a browser dashboard over scheduler state, published to Pages; adoption seeds the deploy workflow) |
| <img src="chrome-extension/badge.svg" width="18" height="18" alt=""> [chrome-extension](chrome-extension/README.md) | manifest_version manifest | 10 | 24 |
| <img src="node/badge.svg" width="18" height="18" alt=""> [node](node/README.md) | root package.json | 0 | 5 |
| <img src="python/badge.svg" width="18" height="18" alt=""> [python](python/README.md) | pyproject.toml near root | 0 (2 in its skill) | 3 |
| <img src="web-speech/badge.svg" width="18" height="18" alt=""> [web-speech](web-speech/README.md) | speech API in JS/TS source | 0 (2 in its skill) | 15 |
| <img src="leaflet/badge.svg" width="18" height="18" alt=""> [leaflet](leaflet/README.md) | Leaflet reference in HTML/JS source | 2 | 4 |
| <img src="headless-browser/badge.svg" width="18" height="18" alt=""> [headless-browser](headless-browser/README.md) | driver reference in JS/TS source | 0 | 18 |
| <img src="aws-sam/badge.svg" width="18" height="18" alt=""> [aws-sam](aws-sam/README.md) | SAM template | 3 | 13 |
| <img src="cloudflare-workers/badge.svg" width="18" height="18" alt=""> [cloudflare-workers](cloudflare-workers/README.md) | wrangler.toml/.jsonc/.json near root | 0 | 7 |
| <img src="google-identity/badge.svg" width="18" height="18" alt=""> [google-identity](google-identity/README.md) | declared | 0 (3 in its skill) | 0 |
| <img src="jwt/badge.svg" width="18" height="18" alt=""> [jwt](jwt/README.md) | JWT library in JS/TS/Python source | 0 (5 in its skills) | 0 (2 skills + monthly advisory-watch task) |
| <img src="html/badge.svg" width="18" height="18" alt=""> [html](html/README.md) | declared | 0 | 4 |
| <img src="static-website/badge.svg" width="18" height="18" alt=""> [static-website](static-website/README.md) | declared (opt-in); marker: the `Release static site` orchestrator | 3 | 8 (+ RELEASE contract) |
| <img src="flutter/badge.svg" width="18" height="18" alt=""> [flutter](flutter/README.md) | pubspec.yaml | 0 | 15 |
| <img src="firebase/badge.svg" width="18" height="18" alt=""> [firebase](firebase/README.md) | `firebase.json` | 2 | 18 (rules / functions / deploy discipline) + 1 skill: create-release-plan |
| <img src="android/badge.svg" width="18" height="18" alt=""> [android](android/) | `AndroidManifest.xml` | 0 | 0 (stub) |
| <img src="ios/badge.svg" width="18" height="18" alt=""> [ios](ios/) | `ios/Runner/Info.plist` | 0 | 0 (stub) |
| <img src="macos/badge.svg" width="18" height="18" alt=""> [macos](macos/README.md) | `Package.swift` near root | 3 | 31 (bundle / TCC + Hardened Runtime / on-device speech / Developer ID + notarization / lifecycle) |
| <img src="play-store-release/badge.svg" width="18" height="18" alt=""> [play-store-release](play-store-release/) | declared (opt-in) | 0 | 0 (stub) |
| <img src="app-store-release/badge.svg" width="18" height="18" alt=""> [app-store-release](app-store-release/) | declared (opt-in) | 0 | 0 (stub) |
| <img src="web-scraping/badge.svg" width="18" height="18" alt=""> [web-scraping](web-scraping/README.md) | declared (opt-in) | 0 | 27 (+ 1 skill: map-a-data-source) |
| <img src="research-project/badge.svg" width="18" height="18" alt=""> [research-project](research-project/README.md) | declared (class) | 0 | 54 (14 sections) |
| <img src="product-wiki/badge.svg" width="18" height="18" alt=""> [product-wiki](product-wiki/README.md) | declared (marker: `product-wiki/product-requirements/README.md`) | 7 | 9 (wiki growth discipline + weekly growth daily task) |
| <img src="spec-driven-product/badge.svg" width="18" height="18" alt=""> [spec-driven-product](spec-driven-product/README.md) | declared (class) | 0 | 26 (8 sections) |
| <img src="executable-requirements/badge.svg" width="18" height="18" alt=""> [executable-requirements](executable-requirements/README.md) | `dev/requirements/requirements.md` | 0 | 19 (framework standard: layout / gates / kinds) |

## Local packs — a project's own packs

A consumer keeps its **project-specific** packs in its own tree at
`.claudinite/local_packs/<name>/` — the same slots (prose `RULES.md`, `rules` checks, `skills`,
scheduled `tasks/`, `questions`), authored and committed by the project, discovered and run by the
same engine as these canon packs. `discoverPacks({ localRoot })` ([registry.mjs](../engine/pack_loader/pack-registry.mjs)) scans this repo's
`packs/` **and** the consumer's `local_packs/`; each pack is stamped with its own `dir` (prose and
bundled skills resolve off it) and a `local` flag. A local pack:

- is **declared by hand** in `.claudinite-settings.json` like any pack — never fingerprinted or seeded
  (`detect`/`marker` null) — by its **namespaced token `local_packs/<name>`** (the canonical form;
  the engine's [`packEntryId`](../engine/pack_loader/pack-registry.mjs) resolves it and the legacy bare id alike to the bare
  pack id, so the bare form keeps working while the fleet's update flows rewrite it), and its id must
  be unique (it may not shadow a canon id — the collision is a blocking `config` finding);
- **bundles its skills** at `<pack>/skills/<skill>/` (mounted from the tracked pack dir — the
  same one shape canon packs use); a bundled skill may carry `checks.mjs`, run when the pack is
  active;
- rides the deployment plumbing every consumer already vendors: the sync hook preserves
  `.claudinite/local_packs/` across its dir swap and the `.gitignore` re-includes it.

A local pack contributes **every** slot first-class: prose, checks, skills, **and scheduled
tasks** — `tasks/<name>/task.mjs`, found by the repo's own scheduler in the same uniform scan that
finds a canon pack's tasks ([../engine/scheduler/discover.mjs](../engine/scheduler/discover.mjs)),
gated by the repo's declaration exactly like a canon pack's tasks. The canon home's own curation
tasks ride this path.

The canon-vs-local line is the portable-vs-project-specific split ([../extending.md](../extending.md));
a project adopts the structure via the `generate-project-instructions` skill, and the growth lifecycle
treats `.claudinite/local_packs/` as the project's capture surface.

## Settings validity

The `"packs"` list and the rest of `.claudinite-settings.json` are validated **when the file loads**, not by a conformance check: [`loadConfig`](../engine/checks/helpers/repo-context.mjs) reports malformed JSON and an unknown top-level property, and the runner adds an unknown *pack name* (it holds the registry). Each becomes a blocking `config` error — a wrong pack name is as much a settings error as invalid JSON. A pack's `detect`/`marker` only **suspects** a pack is wanted; declaring it is the project's call, so a declared pack without its marker (or a marker without its declaration) is **not** flagged.

## Pack dependencies (`requires`)

A pack states the packs it depends on in an optional `requires` field on its `pack.mjs` — a plain array of pack ids: a project-class pack leans on the framework that implements it (`spec-driven-product` requires `executable-requirements`).

This is **not a check** — a pack can't be imported without its dependencies, so the resolution happens **when the declaration is written**, at bootstrap `--init` and the update backfill ([bootstrap.md](../bootstrap.md) Part 2): [`resolveDeclaredPacks`](../engine/pack_loader/pack-registry.mjs) pulls each declared pack's transitive `requires` closure into `.claudinite-settings.json`. The prerequisite is materialized and visible in the file — droppable like every other entry, the same reason `basics` is written explicitly rather than defaulted — rather than resolved implicitly at run time. Declared ids keep their order; each pack's pulled-in dependencies land right after it.

## The manifest spec (`pack.mjs`)

What a `pack.mjs` may and must carry is declared once, in [`engine/pack_loader/pack-schema.mjs`](../engine/pack_loader/pack-schema.mjs), and [`validateManifest`](../engine/pack_loader/pack-schema.mjs) is the only thing that judges a manifest against it. The **loader** runs it on every pack it imports, canon and local alike, so an incomplete or malformed declaration surfaces as a blocking `config` error at load — the same class as invalid JSON in `.claudinite-settings.json`, and for the same reason: a required manifest field is part of the pack contract, not a conformance opinion about a repo's content. A conformance *check* would have to be declared by a pack, run only when that pack is active, and re-derive the manifest by reading its source text — enforcing the shape of the system from inside one of its members.

Reporting is not fatal: a pack whose declaration is incomplete still loads and still runs its checks. Silently disabling a repo's own rules is a worse failure than the one being reported. The field vocabulary is **closed** — an undeclared key is an error, so a typo (`rule:`, `skill:`) fails loudly instead of being ignored forever.

### What the directory says, and what silence says — so the manifest need not

Most of the manifest's fields had, in every pack ever written, exactly one correct value: either the one the pack's own tree already gave, or the one that means "this pack does not do that". [`engine/pack_loader/pack-conventions.mjs`](../engine/pack_loader/pack-conventions.mjs) resolves them before the spec judges the result, so a manifest states none of them:

| Field | Resolved from |
|---|---|
| `id` | the pack's directory name |
| `prose` | `RULES.md` beside the manifest, where one is present |
| `badge` | `badge.svg` beside the manifest, where one is present |
| `skills` | the subdirectories of `<pack>/skills/` |
| `worldRules` | the modules in `<pack>/worldRules/`, in filename order |
| `workRules` | the modules in `<pack>/workRules/`, in filename order |
| `detect`, `marker` | `null` — silence *is* "this pack carries no fingerprint" |

A manifest field still **overrides** the resolution where a pack genuinely differs — `prose: null` beside a `RULES.md` that is documentation rather than injected rules, a `skills` subset that withholds a directory from mounting. Only an *absent* field falls through, so an explicitly declared `null` overrides too. Declaring a field that merely restates the tree is what [`engine-tests/pack_loader/pack-conventions.test.mjs`](../engine-tests/pack_loader/pack-conventions.test.mjs) refuses across the corpus.

### `<pack>/test/` — the pack's tests, and nothing a member receives

A pack's tests live in one directory named for what it is, mirroring the pack's own layout inside it (`test/skills/<skill>/…`, `test/tasks/<task>/…`). [The vendor set drops that whole directory](../vendoring/compute-vendor-set.mjs) — the **name** is the rule, not the `*.test.mjs` suffix, so a fixture, a helper or a golden file a test needs stops shipping with it rather than riding into every member's mount for being one filename short of the exclusion.

### `ruleRoutingGuidance` — what belongs here, and what does not

```js
ruleRoutingGuidance: {
  belongs: 'workflow YAML and Actions runner platform behaviour: triggers, secrets, permissions, scheduling, artifacts, reusable workflows and their pitfalls',
  excludes: 'git and GitHub command procedure — git-github; release pipeline content for one product — its release pack',
},
```

Both sides are required and each is capped at **20 words**. The cap is a readability budget, not a style rule: the whole set is rendered as the two middle columns of [`directory.GENERATED.md`](directory.GENERATED.md), the catalog a session reads when deciding where a rule, doc, skill or check goes. Guess-by-default lands everything in `basics` — that is the failure this field exists to stop. (Until #807 the same rows were also injected into every session as a routing table; that duplicated the catalog on the one channel that charges for it, so the catalog is now the single home.)

Write `excludes` to **name the pack that owns the other side** wherever one exists (`— that is app-store-release`), so the table routes rather than merely refuses. A boundary that is **true of every pack carries no routing information** and wastes the row: "anything portable belongs in the canon" is the local-pack rule restated, not this local pack's edge. State what separates a pack from its **nearest neighbours** — the packs a reader would actually confuse it with. Sibling packs that split a domain (`basics` and `git-github`, a mobile pack and its store-release pack) are where the pair earns its keep, and their two declarations should agree on where the line falls. "No pack fits" is a real answer — it means a new pack, or the project's own `local_packs/` — never the baseline as a fallback.

The catalog covers every canon pack, whether or not a repo declares it — a session weighing what to adopt needs the ones it does *not* hold. It is vendored into every mount for that reason. Local packs declare `ruleRoutingGuidance` on the same terms, and state their boundary in their own prose.

### `worldRules/` / `workRules/` — a rule's scope is its placement

A pack's coded checks live in two directories, and **which directory a rule sits in is what makes it world- or work-scoped**: `<pack>/worldRules/*.mjs` audit repo state ([`check_the_world`](../engine/checks/check_the_world.mjs)), `<pack>/workRules/*.mjs` judge the change and session in front of you ([`check_the_work`](../engine/checks/check_the_work.mjs)). Each module default-exports one rule, and the loader imports them in filename order — discovered structurally, exactly like the `declared-checks.json` beside them, so adding a check is writing its file and nothing else. The loader flattens both scopes into the single `rules` array the runners walk, stamping each rule's scope from the directory it came from — one derivation, nothing downstream re-decides it. A rule module that carries its own `scope` field is a second source for the same fact, free to contradict its own placement, so the spec rejects it.

A manifest may still declare `worldRules`/`workRules` explicitly, which overrides the directory for that scope — the same override every convention has. Nothing in the canon needs it.

A skill's own `checks.mjs` sits outside this partition (it is a skill's content, not a manifest list) and still declares `scope` on the rule itself.

### `skills` — the bundle, declared

A pack's skills live in its own tree — `<pack>/skills/<skill>/SKILL.md`, one owning pack per skill (#385) — and the directory listing **is** the membership: adding a skill is creating its directory, with no manifest line to keep in sync. A manifest that does name `skills` is withholding one, and the spec still refuses a name with no directory behind it: that is a manifest that lies. What each skill covers stays in its own `SKILL.md` frontmatter, the description the harness triggers on — nothing carries a second copy of the summary.

The SessionStart hook [`../engine/pack_loader/mount-skills.mjs`](../engine/pack_loader/mount-skills.mjs) mounts the **union over the active packs' bundles** (same activation as prose/checks/env) as session-generated `.claude/skills/<name>` symlinks — nothing committed, and a self-ignoring `.claude/skills/.gitignore` keeps them out of git status. A skill rides its pack everywhere the pack goes: the vendor set, the mounts, the sweep (its `checks.mjs` runs when the pack is active). The baseline activities every project has (`merge-to-main`, `writing-tests`, `bug-investigation`, …) ride the `basics` pack's bundle; move a skill's directory to a narrower pack when it stops being a baseline activity.

## The rule index a pack README carries

A pack README is optional, but where one exists it **indexes what the pack asks of a project**: one
row per prose rule in its `RULES.md`, and one row per check it runs. Both tables carry the same two
judgments — **how bad it is when the rule isn't followed**, and **what kind of cost that is** —
because a reader deciding whether to adopt a pack, or which finding to fix first, is asking exactly
that and can otherwise only get it by reading every rule.

The prose index lists **every** rule, in the order `RULES.md` states them:

```markdown
## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Keep the tile provider's attribution | critical | legal | prose: 52 words + check (`leaflet/tile-attribution`) |
```

```markdown
## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `leaflet/tile-attribution` | critical | legal | check: blocking |
```

- **Rule** — a name, under 8 words: enough to find the rule, never a summary of it. **Check** — its id.
- **Severity** — the consequence of ignoring it: `critical` (ships a defect to users, loses data,
  breaks the fleet, or violates a licence or platform policy), `high` (the work lands wrong or
  silently doesn't work and someone must redo it), `medium` (rework or drift caught inside the
  repo), `low` (friction only).
- **Reason** — the kind of cost: `correctness`, `performance`, `complexity`, or `legal` (licence,
  privacy, disclosure, store or platform policy). One per rule, the dominant one.
- **Enforcement** — the mechanism and its price. `prose: <n> words` is what the rule *costs*: every
  declaring repo pays those words in every session's context, counted by
  [`../engine-tests/rule-index.mjs`](../engine-tests/rule-index.mjs). `check: blocking | advisory` is
  how the engine reports a finding. A rule carried both ways names the check too.

Neither table describes what a rule says — the prose and the check's own failure message do that.

Both indexes are held to the tree by [`../engine-tests/rule-index.test.mjs`](../engine-tests/rule-index.test.mjs):
the rows must match `RULES.md` one-for-one with the right word counts, every check the pack runs must
appear, and both vocabularies are closed. That guard is what makes a second listing of the rules safe
here — an earlier hand-kept index drifted into claiming a prose rule that never existed (#777) — so
recount a rule's row in the same change that edits its prose, and add a check's row in the change
that declares it.

## Pack badge (`badge`)

Every pack carries a mark — the 32×32 tile beside its name in the table above — so a repo's README
can show which Claudinite packs it runs. It is `badge.svg` beside the pack's manifest, found by
convention rather than named by it (above).

**The badge file is the artwork's source of truth.** Its colour and its glyph live in the SVG, not
in `pack.mjs`: they are visible to anyone who opens the file, editable without touching a manifest,
and reviewable as the image they describe. The glyph is an SVG path on the 32-unit grid, stroked in
white with a round-capped 2.2 line — so a dot is a zero-length segment (`M16 16h0`) and the whole
mark is one path. No `<text>` anywhere, so a badge renders identically wherever it is loaded.

[`../dev/tools/badges/render.mjs`](../dev/tools/badges/render.mjs) mints a new one and restyles the
set. It invents neither colour nor glyph — it *parses* both out of the file it is about to rewrite —
so a template change (a new corner radius, a different stroke weight, a stats corner later) is one
edit there and one run:

```sh
node dev/tools/badges/render.mjs new packs/<pack>/badge.svg '#4f46e5' 'M8 8h16'
node dev/tools/badges/render.mjs restyle
```

It lives in `dev/tools/`, not in the engine: nothing at session time reads a badge, and the engine is
what runs pack content and what every consumer vendors. The badge FILES do ship — a pack's badge
rides its directory into a consumer's vendor set exactly like its prose and skills, so a repo's row
points at its own `.claudinite/shared/packs/<id>/badge.svg` with no network dependency on this repo.

**Getting the row into a README is not a maintainer's job — keeping it current is.** Adoption writes
it, once, through the wiring converge
([`../engine/scheduler/converge-wiring.mjs`](../engine/scheduler/converge-wiring.mjs) run with
`--badges`, bootstrap Part 6): a one-line row of the declared packs' badges, under the title, between
`<!-- claudinite:packs -->` markers — so it lands where a reader looks first, and anything the repo
writes after the closing marker on that line is its own. The opening marker sits
on its own line above the badges and must stay there: a line that *begins* with `<!--` opens a
CommonMark HTML block, and badges written after it on the same line render as literal `![…](…)`
text rather than images.

**The nightly does not touch it.** Baselining runs the same converge without `--badges`, so a
member's README is never rewritten by a run it didn't ask for — a re-derived row would put a README
diff in every vendoring commit that followed a declaration change. The row is a seed, not maintained
state: once written, it belongs to the repo — edit it, move it, or delete it.

**The declaration is what makes a row wrong, so the row is refreshed where the declaration changes:**
adopting a pack re-runs the converge with `--badges`
([`claudinite-lifecycle/skills/adopt-pack/SKILL.md`](claudinite-lifecycle/skills/adopt-pack/SKILL.md), step 3),
which rewrites the row in place. Nothing else derives it — a repo that edits its declaration by hand
runs `converge-wiring <owner/repo> --badges` itself, or lives with a stale row.

The converge also materializes the repo's say into `.claudinite-settings.json`, so the knob sits where
anyone would look for it rather than being inferred from absence:

```json
"badges": { "readme": "auto" }
```

Set `"off"` and the nightly neither updates the row nor re-adds one the repo has deleted.

[`../dev/tools/tests/badges.test.mjs`](../dev/tools/tests/badges.test.mjs) guards the artwork side —
every pack declares a badge that exists and is tracked, every badge is current with the template and
titled with the pack whose directory holds it — and holds this repo's own row (the one member no
nightly maintains, since the canon has no vendored mount to refresh) to what that converge would
write.

## Environment requirements (`env`)

A pack may declare a toolchain (or per-repo deps) a cloud session needs but the Claude Code Web base image doesn't ship — the `flutter` pack needs the Flutter SDK; the `node` pack needs the repo's `npm` modules. Install belongs in the environment **image** (built once, snapshotted, reused), never a per-session hook. A pack declares it in an optional `env` field on its `pack.mjs`:

```js
env: {
  label: 'Flutter SDK',                         // human name for the check's messages
  setup: '<bash>',                              // idempotent install fragment for the image
  probe: 'command -v flutter >/dev/null 2>&1',  // exit 0 iff present in the running env
}
```

`setup` and `probe` may be a **string**, or a **function of the project's per-pack params** — a project supplies parameters about its own usage as `config` on the pack's entry in `.claudinite-settings.json`, so one pack fragment fits every repo. The `node` pack uses this for where `npm ci` runs:

```js
// packs/node/pack.mjs
setup: (p) => (p.dirs?.length ? p.dirs : ['.']).map((d) => `( cd "${d}" && npm ci ) || true`).join('\n'),
// a repo's .claudinite-settings.json: { "packs": [ { "id": "node", "config": { "dirs": ["firebase/functions"] } } ] }
```

[`env-requirements.mjs`](../engine/pack_loader/env-requirements.mjs) drives everything from the repo's **active** packs (same activation as prose/checks):

- `node .claudinite/shared/engine/pack_loader/env-requirements.mjs install` runs every active pack's `setup` in the checkout. The corpus's one generic [`environment-setup-command.sh`](claude-code-web-users-support/environment-setup-command.sh) — the web pack's, pasted into the environment's Setup script field — calls this.
- `node .claudinite/shared/engine/pack_loader/env-requirements.mjs check` runs at session start (web only) and **asserts** — it runs each `probe` directly against the running environment and injects the halt-gate context if a requirement is missing. No version flag: the probes are the source of truth, and a genuinely new requirement fails its probe and prompts a re-run. Never installs.
- `node .claudinite/shared/engine/pack_loader/env-requirements.mjs plan` prints what `install` would run (review / debug).

Wiring a consumer up — the check hook + the pack entries' `config`, with the script pasted from the corpus copy — is [bootstrap.md](../bootstrap.md) Part 9. A pack with no `env` field adds nothing; universal git hygiene lives in the generic script, not a pack.

## Adoption interview (`questions`)

A pack that needs to know the project's **intent** before it can provide value (barriers with no
graph is a silent no-op; a visual-testing pack can't assert anything before learning how this repo
should be tested) declares the mandatory questions its adoption must ask, in an optional
`questions` field on its `pack.mjs` — stable-id'd entries, `distill` saying how the answer becomes
the entry's `config`:

```js
questions: [{ id: 'goals', prompt: 'What should these barriers accomplish — …?', distill: 'derive the edge list into config.rules …' }],
```

The answers live **verbatim** on the pack's entry in `.claudinite-settings.json` (`answers:
{ "<question-id>": "<answer>" }` — [engine/checks/README.md](../engine/checks/README.md)): the settings file
records the project's intent beside the `config` distilled from it — provenance for the
configuration, versioned and diffable, and re-derivable if the pack's config shape later changes.
The **gap** — declared question ids minus answered ids — drives the asking
([interview.mjs](claudinite-lifecycle/skills/adopt-claudinite/interview.mjs) — the adoption skill's bundled
machinery): at adoption every question is pending; when the canon later adds
a question to a pack, just that one surfaces in every consumer; a pack with no questions adds
nothing. An answered question stays answered — "n/a, none wanted" is an answer, distinct from
never-asked.

The posture is **strict at bootstrap, mild everywhere else**. The adoption flow
([bootstrap.md](../bootstrap.md) Part 2) interviews the owner off `bootstrap.mjs`'s pending-question report — a human is
present by construction. Outside it, pending questions surface only as a mild SessionStart note
(the `interview-check` step) telling an interactive session to ask at a natural moment and an
unattended one to ignore it entirely — **never a conformance finding**, so a nightly update or
a new canon question can never block the fleet. The one sweep-side finding is hygiene: a stored
answer whose question the pack no longer declares (renamed or removed upstream) is an *advisory*
`config` finding, and a malformed `questions` declaration is a blocking one like any broken
manifest.

## Corpus size — checks vs prose

Counted, never quoted: `check_the_world.mjs --list` prints the check catalog a rule at a time (id,
severity, description, doc pointer), and each pack README's rule index carries that pack's prose rules
with their word counts. Ask those two, in the tree in front of you. A total transcribed into this file
is a copy of derived data that every pack change falsifies — it drifted to 41 against a real 65 once,
and the ratio it fed was wrong by a third.

The shape the numbers keep showing: roughly one hardcoded check per four prose rules. Most of the
remainder is judgment, in-flight process, or runtime knowledge that *should* stay prose. The
`prose-to-checks` sweep works the convertible part; its adversarial pass rejects candidates whose
detection would false-positive (the two SAM YAML checks needed a structural parser to stay FP-free),
so the yield is deliberately small and high-precision.

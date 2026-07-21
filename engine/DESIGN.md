# Checks — deterministic enforcement of the corpus (design)

> **Status: implemented** (issue #127, #131). The runner, the baseline + technology packs, Stop
> hook, PreToolUse guard, and the pack-prose loader are live; the corpus is reorganized into
> `packs/` (prose + checks, active by declaration) and `skills/` (activity-scoped procedures).
> This doc is the rationale and the ongoing design record. The per-rule audit lives in
> [../docs/conversion-inventory.md](../docs/conversion-inventory.md).

## The problem

The corpus enforces style/practice rules as instructions. Instructions have three standing costs:

1. **Context** — the always-on baseline loads every session whether or not it's needed, and
   adherence degrades as loaded context grows.
2. **Silent trigger failure** — soft-loaded docs depend on the agent following their trigger
   ("read filePlacement.md before placing a file"), which is itself instruction-following that
   fails silently. A rule the agent didn't read can't help.
3. **Invisible obsolescence** — a rule a newer Claude Code follows by default keeps costing
   tokens and attention forever; nothing measures that it stopped earning its place.

A deterministic check inverts all three: it costs zero context until violated, fires whether or
not anything was read, and its firing history is measurable — a check that never fails is
evidence its rule can retire.

## Why this is the right mechanism

Anthropic's published guidance says this directly: hooks exist to provide "deterministic control
… ensuring certain actions always happen rather than relying on the LLM to choose to run them"
(hooks guide); CLAUDE.md is "context, not enforced" (memory doc); and the core best-practice is
"give Claude a check it can run … Claude does the work, runs the check, reads the result, and
iterates until the check passes" (best practices). The corpus already states the principle in
an agent-practices skill: *"Prose is a request; the
post-hoc diff check is the guarantee."* This design scales that sentence up.

## What converts — and what doesn't

An instruction leaves context only when a deterministic mechanism can carry it. Four targets,
picked per rule:

| Mechanism | Fits when | Examples from the corpus |
|---|---|---|
| **Post-hoc check** (this system) | The rule constrains the *state of the repo* after work | file placement, dangling references, workflow lint, lifecycle compliance |
| **PreToolUse hook** | The action must be blocked *before* it runs | never delete a remote branch; don't `issue_write`-overwrite an issue body |
| **Skill / script** | A *procedure* or *knowledge* with a nameable (or path-scoped) trigger | the merge recipe; the lessons pass; the technology gotcha files |
| **Platform setting** | The platform enforces it outright, for free | squash-only merges; branch protection |

Two classes deliberately **stay as instructions**:

- **Process/judgment rules** — problem-first consensus, bug investigation method, naming
  quality. They shape work *in flight* and leave no artifact a check can inspect. Converting
  them post-hoc would also catch violations only after the expensive rework they exist to
  prevent.
- **Platform-gotcha knowledge** (`technologies/`) — split **per gotcha**, by whether the bad
  pattern has a *static signature in the artifact*. Where it does, it converts to a tech-pack
  check — a SAM `Handler` still carrying the entry's subdirectory under an esbuild build, an
  esbuild declared in `devDependencies`, a `SetIcon({path: …})`, a CloudFront custom
  origin-request policy listing `Authorization` — and the agent never needs to know the gotcha
  in advance: writing the bad pattern fails the check in the same session, moving discovery
  from runtime (often the first deploy or invoke) to write-time, with the gotcha's teaching in
  the failure message. Only the signature-less residue stays as skill knowledge: runtime
  divergence invisible in the artifact (jsdom *behaving* unlike Chrome, CORS being decided
  server-side) and diagnostic know-how. The release pack's **contract** is the
  largest signature-rich case — a conformance suite waiting to be written.

## Architecture

```
packs/                        # the mounted corpus: prose + checks, active by declaration
  registry.mjs                #   structural discovery — any packs/<name>/pack.mjs is a pack
  load-active-prose.mjs       #   SessionStart hook: emits active packs' RULES.md
  <baseline>/                 #   the baseline: RULES.md + the core checks (declared like any pack)
  <technology>/               #   coding gotchas (RULES.md, prose only)
  <technology>-release/       #   RELEASE.md (standard) + stubs + conformance checks (opt-in)
  <technology>/               #   the workflow lints (no prose)
  <technology>/  <technology>/  …      # more prose-only tech packs
  <project-class>/            #   a project-class pack (prose-only, declared)
checks/                       # the ENGINE only (runs the packs' checks)
  run.mjs                     #   dependency-free Node CLI
  lib/                        #   git diff scoping, findings format, markdown + manifest helpers
  stop-hook.mjs               #   blocks the agent's stop on blocking findings
  pretooluse-guard.mjs        #   blocks forbidden actions before they run
  test/                       #   fixtures (scratch git repos), red-first
packs/<pack>/skills/<name>/   # activity-scoped procedures, bundled in their owning pack
  checks.mjs                  #   the test-the-world checks that validate this skill's action
```

**Skill-owned checks.** A skill defines the performance of an *action*; the test-the-world
check that validates that action's result belongs **beside the SKILL.md that defines it**, not
in a pack that owns none of the context. So a skill may carry its own checks — the
`routine-structure` check lives in its owning skill's folder, next to the routine-authoring
prose it enforces, with its test co-located too. A skill lives inside its owning pack
(`<pack>/skills/<name>/` — #385), so discovery IS the pack registry: any bundled skill's
`checks.mjs` (default export = an array of rules) is gathered onto the pack (`skillChecks`) and
runs when the pack is active. The pack gate only says the project opted into the pack — not
that this skill's action ever happened in this repo — so a skill check's `run` must still
**detect relevance first, cheaply and specifically, and return `[]` when
the artifact is absent** (`routine-structure` keys off a `routine.md` existing before it asserts
anything). Get that wrong and the check fires false findings on every unrelated repo the corpus
is mounted in. Reserve skill checks for the world-state a skill's action leaves behind; a rule
with no skill to anchor it stays a baseline check.

**Where a check goes — the litmus test.** Classify by what the checked *artifact* is, not by
which doc teaches the fix (the `doc` pointer is where you *learn* the remedy — most baseline
checks point at a skill, so it is **not** the classifier):

- present in ~every repo (markdown links, file layout, the root `CLAUDE.md`, git history, a
  branch's issue reference) → a **baseline** check;
- present only when a declared **technology** is (a workflow, a SAM template, the release
  stubs) → a **technology-pack** check, whose relevance is gated by declaration;
- present **only because one skill's discrete action created it** (a routine folder, from
  authoring a routine) → a **skill** check.

Only the third — *the artifact would not exist had the action never run* — earns a home in the
skill. `routine-structure` is the sole current case: a routine folder exists only because
someone authored a routine. `squash-merge-history` points at the merge skill but stays
in the baseline, because git history exists in every repo and is disturbed by any merge, not only that
skill's action; `claude-md-length`, `generated-merge-driver`, and the placement check likewise
inspect artifacts every repo has, so they stay in the baseline despite naming a skill in `doc`.

**Not every pack-machinery concern is a check.** The `.claudinite-checks.json` *settings* are
validated when the file loads, not by a conformance rule: malformed JSON, an unknown property,
and an unknown pack name are equally settings errors, surfaced by the runner as blocking `config`
findings. A pack's `marker` only *suspects* the pack is wanted — whether to declare it is the
project's call — so nothing checks that a declared pack carries its marker, or that a marker's
pack is declared. Pack **dependencies** (`requires`) are likewise resolved when the declaration is
*written* — bootstrap `--init` and the baselining backfill run `resolveDeclaredPacks` to pull each
declared pack's transitive `requires` into the file, materializing the prerequisite (like
the baseline) rather than nagging at every Stop. A materialized dependency is written as
`{ "id": ..., "via": [...] }` — `via` naming the declared packs that require it — so the file
itself records why the dependency is there.

**Runner contract.** `node .claudinite/checks/run.js`. Dependency-free Node — no `npm install`
step exists on the tarball mount, and the corpus's own "earn each dependency" rule applies to
us first. Exit 0 = clean, exit 1 = blocking findings. The default scope is the **whole repo**:
on a text corpus the full sweep costs milliseconds, and only full scope sees cross-file
breakage — a change in one file dangling a reference in an unchanged one. The steady state is
a repo at zero findings (or reviewed acceptances), held there by every run. `--changed`
(diff vs the merge-base with main) exists only as a transitional aid while adopting a repo
that carries a backlog — it is not the enforcement default. (Rules that are inherently about
the *delta* — new suppression markers, commits referencing an issue — diff against the
merge-base in either scope.)

**Pack selection: declared for deterministic execution, fingerprinted against drift.** The
packs a project runs are **pinned in `.claudinite-checks.json`**
(`"packs": ["baseline", "a-technology-pack", "a-release-pack"]`; no pack runs
undeclared — the baseline too is declared explicitly, seeded by bootstrap).
Execution is a closed, declared set: every rule in a declared pack
runs on every run — Stop hook and CI alike — with no inference at execution time, so "the
project uses technology X" deterministically implies "every X check ran." Bootstrap writes the
initial declaration from the repo's fingerprint — a pack's `detect` marker (`.github/workflows/`
→ a workflow-lint pack; a `manifest.json` with `manifest_version` → the extension packs; the
release-workflow `name:`s → the conformance suite) seeds it at `--init`. But a marker only
*suspects* a pack is wanted: from then on the declaration is authoritative, and whether to add a
newly adopted technology's pack, or drop one whose technology has left, is the **project's** call
— the checker never second-guesses it. What *is* enforced is settings **validity**: an unknown
pack name, an unknown property, or malformed JSON is caught when the file loads
(`loadConfig` + the runner) and surfaced as a blocking `config` error — a wrong pack name is as
much a settings error as bad JSON. `.claudinite-checks.json` additionally holds per-rule
**overrides** and **acceptances** — at the top level for project-wide decisions, or on a pack's
own entry for the ones that pack's declaration motivates (see engine/README.md).

A declared id may name a **canon** pack or one of the repo's **own local packs**
(`.claudinite/local_packs/<id>/` — the project's tracked, project-specific packs, discovered from
the repo's own tree alongside the mounted canon; canonically declared by the namespaced token
`local_packs/<id>`, the bare id accepted while the fleet migrates — see engine/README.md). Both
are the same closed-declared-set execution;
`knownIds` spans both, so a local id is valid, not an unknown-pack error, while a broken or
id-colliding local `pack.mjs` is surfaced as a blocking `config` finding rather than silently
dropping the pack's checks. A local pack's checks run when it is declared, exactly like a canon
pack's; this is where a project's *own* deterministic rules live (the checks-over-prose economy,
applied at the project's level) instead of always-loaded prose.

**Acceptances are the escape hatch — deterministic and reviewable.** Rules with judgment
exemptions (a placement rule's "deliberate cross-cutting concern") need a way to say "yes, on
purpose" that isn't a fight with the hook: a per-finding `accept` entry with a mandatory reason
string, keyed by rule id + path. It lands in the diff like any code, so the *decision* gets
reviewed once instead of re-litigated every session. An acceptance a pack's adoption forces
lives on that pack's `packs` entry, so its provenance — which declaration required which
exception — is the file's own structure.

An acceptance is a **check-the-world** instrument: a persistent, committed exemption a future
sweep keeps re-finding and must be told to ignore. It is the wrong tool for a **check-the-work**
finding — a conversation- or branch-scoped rule (e.g. `feature-requirements-first`) whose finding
a fresh session wouldn't even re-raise; accepting one leaves a permanent suppression for a
one-session artifact. Author a check-the-work rule to be **satisfiable by fixing the work, or to
self-skip** when its precondition isn't met (the spec it enforces against isn't in the repo, say):
a finding no correct work can clear forces the wrong remedy — an accept, or a post-hoc rebase —
so it's a bug in the rule, not a candidate for an acceptance.

And when a rule mandates an **ordering** — X must happen before Y — it ships with a
check-the-work verification of that order, judged on the surface where the order is visible:
the conversation transcript (`feature-requirements-first`'s comment-scoped doc-first ordering)
or the branch commit log (a rule-before-fix test asserting the outlawing commit is an ancestor
of the fixing one, `pack-independence`'s pattern). A stated ordering with no check-the-work
verifier is prose-only enforcement — exactly what this system exists to replace.

**The finding is the instruction.** This is the context economy of the whole design: the rule's
teaching text moves out of always-loaded context and into the failure message, paying its token
cost only on violation, in the session that violated it, pointed at the exact spot. Every
finding carries: rule id, `file:line`, what's wrong, *why* (one line — the model generalizes
from motivation), the fix, and a doc pointer for depth.

<example>

```
reference-distance  src/report/render.js:12
  imports ../../util/dates.js at distance 4.
  Why: the folder tree should encode the dependency graph; far reaches make it lie.
  Fix: move dates.js next to its users, lift it to a common ancestor, or accept it
       in .claudinite-checks.json with a reason if it's a deliberate cross-cutting util.
  More: .claudinite/shared/packs/<pack>/skills/<name>/SKILL.md
```

</example>

## Enforcement wiring

**A Stop hook is the guarantee; instructions are not.** Wiring the checks into `npm test` and
hoping the agent runs it is exactly the instruction-following this design escapes. Instead,
bootstrap registers one more hook in the consumer's `.claude/settings.json` (the same mechanism
as the existing SessionStart hooks):

1. The Stop hook fires when the agent finishes a turn.
2. It **fast-exits in milliseconds** when no tracked file differs from `main` — conversational
   turns cost nothing.
3. Otherwise it runs the full sweep; on findings it exits 2 with the findings on stderr.
   Claude Code blocks the stop and feeds that text back to the agent, which fixes the
   violations **in the same session**. A clean run stops silently.

Loop safety comes from convergence (fixed findings stop firing) plus Claude Code's own runaway
protection (it overrides a Stop hook after ~8 consecutive blocks).

**The Stop hook is the whole enforcement surface — consumers ship no CI job.** Hooks fire only
in Claude Code sessions; a human editing on GitHub web, or any other tool, bypasses them, and
those edits are caught at the **next session's** Stop sweep instead (the sweep judges the tree,
not the turn). A standing consumer workflow running the sweep was tried and retired by owner
decision (#385) — no GitHub Action rides the standard wiring; a repo that wants one can wire
`node .claudinite/shared/engine/checks/run.mjs` itself.

**The conversation surface (Stop hook only).** Some process rules leave their artifact not in
the repo but in the *session itself* — e.g. `comment-classification` (the reply to the owner's
latest comment must declare an explicit `Comment class:` line: the assessment stays judgment,
but that an assessment was made is checkable) and `feature-requirements-first` (a
feature-classified comment's doc-first ordering on the branch). The Stop hook is the one surface
that can carry these: Claude Code passes the hook `transcript_path` on stdin, the hook forwards
it as `--transcript`, and `ctx.conversation()` exposes the parsed session
([checks_helpers/transcript.mjs](checks_helpers/transcript.mjs)). Everywhere else — CI, a manual run — the transcript
is absent and these rules self-gate to `[]`, the same self-supplied relevance gate skill checks
use. Two scoping choices keep them convergent rather than nagging: only the *latest* owner
comment is judged (a transcript is append-only, so an old omission could never be fixed), and
the ordering rule scopes to commits after the comment's timestamp (earlier work on the branch is
never re-litigated). The Stop hook's clean fast path also means a purely conversational turn —
no tracked change vs the base — runs no checks at all, conversation rules included.

**Prefer a platform setting when one exists — but never trust it.** Squash-only merging is a
GitHub repo setting; force-push protection is branch protection. The setting does the
*enforcing*, but it's configuration like any other: it can be off, get switched off, or be
bypassed, and nothing notices. So every setting rung pairs with a check that verifies it, in
order of strength:

- **Effect check (preferred)** — offline and deterministic, it verifies the *outcome* the
  setting guarantees rather than the setting itself: squash-only ⇒ the change lands squashed,
  so its own commits carry no merge commit (`squash-merge-history` in the baseline pack). It
  is scoped to the work — the merge commits the current change introduces on HEAD's first-parent
  chain since the merge-base — not the repo's whole history: it catches the setting being off or
  bypassed *for this change* without re-auditing (and demanding acceptances for) legacy merges
  already on `main` that the work never touched. Testing the work, not the world, is what keeps
  the check from firing on every unrelated session.
- **Config check** — reads the setting via the platform API and fails when it's off. Needs a
  network-capable surface: rules carry a surface tag, the Stop hook runs only offline rules,
  CI runs what its repo token can read (e.g. the allow-merge-commit flags), and the fleet
  maintenance routine covers settings a repo token can't (e.g. branch protection). Follow-up
  work alongside the Phase 2 packs.

## Governance

- **A converted rule leaves its doc.** The check's failure message owns the rule now; the doc
  keeps only rationale and the judgment parts. Keeping both pays twice and springs the corpus's
  own drift trap (two sources of truth).
- **Fail fast: a new check ships at its real severity — blocking for defect-kind rules.** A
  wrong blocking check surfaces in the very next session and gets fixed; an advisory false
  positive is noise nobody reads, so a burn-in stage never actually observes the precision it
  waits for. The escape hatches bound a bad check's blast radius: a reasoned acceptance, a
  severity override, and the Stop hook's own two-block release. `advisory` remains a per-rule
  **kind**, not a stage — for rules whose own semantics are directional (a placement rule's
  metric is "a direction, not a hard gate"), where a finding is a smell to judge, not a defect
  to fix. Revisit delayed adoption only if the fleet grows people who can be hurt by a wrong
  block.
- **Telemetry drives retirement.** The runner logs firings; the fleet-maintenance routine
  already reads every vendored repo and can report "rules that never fired in N days" —
  obsolescence made measurable, the property instructions never had.

## Skills — the on-demand layer for what checks can't carry

Checks carry the *enforceable* rules. Everything else that today rides on soft pointers —
procedures, task-gated practices, technology knowledge — moves to **Agent Skills**, a mechanism
the system doesn't use yet. The docs' own decision rule fits exactly: *"Create a skill when …
a section of CLAUDE.md has grown into a procedure rather than a fact"*, and knowledge-bearing
skills are explicitly endorsed (*"reference content adds knowledge … conventions, patterns,
style guides, domain knowledge"*). The official hook-vs-skill line mirrors this design's ladder:
*"Use a hook when the action must happen the same way every time … Use a skill when Claude
should decide how to apply the steps, or when the content is knowledge rather than a script."*

**What a skill buys over a CLAUDE.md soft pointer.** The token economics are roughly neutral —
a skill's name + description sit in context every session (progressive disclosure: the body
loads only on invocation), about what an index line costs today. The real gain is **trigger
reliability**: today a `tasks/` doc helps only if the agent remembers to follow the index line
("read before writing a test") — an instruction-following step that fails silently. Skill
matching is harness-managed and trained-for, skills are user-invocable as `/name` too (manual
invocation is deterministic — it runs when typed), and technology skills can be
**`paths`-scoped** (glob frontmatter) so they surface exactly when the matching files are
touched — a structural trigger, not a remembered one.

Be clear about what this is *not*: **model-invocation of a skill is still probabilistic** —
better odds than a soft pointer, never a guarantee. That is precisely why this design's
division of labor puts nothing that *must* happen on a skill: enforcement lives in hooks,
checks, and settings, which are deterministic by construction; skills carry only guidance whose
worst-case miss is today's status quo. In particular, check execution never depends on skill
routing — the Stop hook runs the declared packs whether or not any skill fired. The split is
therefore **per-rule, not per-doc**: a doc's enforceable rules go to a pack (which runs
unconditionally for every project that declares it), its judgment residue rides the skill, and
there is deliberately no one-to-one correspondence between an instruction file and a pack. Two documented limits
to respect: keep descriptions tight (the listing truncates them, and the description budget
scales with the context window — many verbose skills degrade matching), and keep each
`SKILL.md` body well under 500 lines.

### The catalog

The skill-by-skill catalog — each skill, its trigger, and the doc it replaces — lives in
[../skills/README.md](../skills/README.md); the skills themselves are bundled in their owning
packs (`<pack>/skills/<name>/SKILL.md`), the same way this design seeded `checks/`.

What stays always-loaded after this: a trimmed
baseline `RULES.md`, the judgment core of
the agent-practices skill (its trigger — "writing
code" — is near-universal, so a skill gains little; revisit with telemetry), and a much smaller
index. The routing index largely dissolves: routing *is what skill descriptions do natively*.

### Delivery — incremental now, plugin end-state

- **Now (works with both mount methods):** each skill is bundled in its owning pack
  (`<pack>/skills/<name>/`), and the SessionStart hook `engine/skill_loader/mount-skills.mjs`
  regenerates `.claude/skills/<name>` symlinks for the active packs' union each session —
  nothing committed (a committed link dangles on every plain checkout). Symlinked skill
  directories are documented, supported behavior, and skill changes are picked up live within
  a session — so mounts generated at session start still land, the same property the tarball
  sync populating their targets already relies on.
- **Later, maybe — Claudinite as a plugin (contingent on a spike).** A plugin is nothing
  exotic: a directory layout inside an ordinary git repo (`skills/`, `commands/`,
  `hooks/hooks.json`, a `plugin.json` manifest) plus a `.claude-plugin/marketplace.json` that
  lets the repo serve as its own catalog. **No publication to Anthropic** — any git repo works
  as a marketplace directly, and the repo may carry arbitrary other content alongside the
  plugin dirs, so Claudinite would remain exactly the freely-amended GitHub repo it is (growth
  PRs, this doc, everything — unchanged). The draw: plugins bundle precisely this design's
  pieces — skills, commands, and hooks (SessionStart, Stop, PreToolUse) with bundled scripts
  addressable via `${CLAUDE_PLUGIN_ROOT}` — and a consumer repo can commit
  `extraKnownMarketplaces` + `enabledPlugins` in `.claude/settings.json` to enable it for
  everyone. **Why it is not the plan of record:** the docs leave the operational questions that
  matter most to this system unanswered — how promptly consumers receive updates (manual
  `/plugin marketplace update` is documented; session-start auto-refresh is not), whether
  web/cloud sessions load marketplace plugins at all, and whether plugin hooks behave
  identically to settings-registered ones. A daily-growth corpus lives or dies on update
  latency, and the current SessionStart tarball sync *guarantees* latest-`main` every session.
  So: phases 1–4 ship entirely on the existing mount + symlinks and depend on the plugin route
  for nothing; adopt it only if a Phase-5 spike proves same-day propagation, web support, and
  hook parity. (Also documented: a plugin cannot inject always-on CLAUDE.md-style prose, so the
  residual baseline keeps its `@`-import either way.)

## Growth pipeline: checks-first promotion

New lessons enter the canon through the growth lifecycle (extract → promote → dedup). Today
the promote step generalizes a lesson and routes it to a prose doc.
Under this design, **prose becomes the fallback, not the default** — the point of promotion is
to relieve every project's context, and a check relieves it completely while prose only
relocates it.

**The promotion ladder.** Every lesson that clears the worthiness bar is triaged down the same
mechanism order as the conversion table above — the *first* rung that can carry it wins:

1. **Platform setting** — the platform enforces it outright, always paired with the check
   that verifies it holds (effect check first, config check where a token can read it).
2. **PreToolUse hook** — a bad action to block before it runs.
3. **Post-hoc check** — a constraint on repo state.
4. **Skill** — a procedure or knowledge with a nameable trigger.
5. **Prose canon** — only for what none of the above can carry, and the landing **names its
   reason** (judgment / in-flight behavior / platform knowledge), logged per lesson in the
   promote tracking issue so conversion rates are auditable.

Concretely, three growth docs change:

- **`item-routing.md`** gains a step 0: *mechanism triage*
  before file routing. "Which doc owns this" is only asked for lessons that fall through to
  rung 5.
- **`promote.md`**: for a rung-3 lesson, the routine authors
  the check in the same PR — rule id, detection, the failure message (which *is* the
  generalized lesson text), **plus a fixture proving it fires** on a violating input and stays
  quiet on a clean one (see-it-fail applies to checks too). When it can't produce a confident
  detection + fixture, it lands the lesson as prose **and** opens a tagged conversion-backlog
  issue — a visible miss to sweep later, never a silently-shipped broken check.
- **`dedup.md`**: a canon **check** covers a local prose item the
  same way a canon line does — better, since the coverage is enforced rather than stated. The
  runner exposes the rule catalog machine-readably (`run.js --list`: rule id, description,
  failure message, doc pointer); dedup quotes a **rule id** where it today quotes a canon line.
  This answers the obvious worry — "the canon won't have the instruction, only a test": the
  check *carries* its instruction as data (its failure message), so dedup compares against the
  catalog exactly as it compares against prose today, and more mechanically, since rule ids are
  stable where prose wording drifts. The keep-test is unchanged: a local item that says *more*
  than the check detects (a stronger point about a narrower case) stays.

Extract is untouched: project-local capture stays prose at the project's own level —
conversion is a promotion-time judgment, made once, centrally.

## Phasing

1. **Runner + Stop hook + first baseline checks** — reference-integrity, task-lifecycle,
   warning-suppression (blocking); the placement check (advisory by kind). Bootstrap gains the
   hook-registration step.
2. **a workflow-lint pack + a release-conformance pack**, piloted on one
   extension repo.
3. **Baseline restructure** — the first skills (a merge recipe, a lessons pass) + the
   squash-only setting; temporary-workarounds → PreToolUse hook; slim the converted docs and
   the index.
4. **Skills layer + growth pivot** — the rest of the catalog (practice + technology skills,
   symlink delivery in bootstrap), and the promotion ladder lands in
   `promote.md`,
   `item-routing.md`, and
   `dedup.md`.
5. **(Contingent) plugin packaging** — only after a spike proves same-day update propagation,
   web-session support, and hook parity; until then the mount + symlink delivery is the plan of
   record and nothing depends on this phase.
6. **(Deferred)** LLM-judge checks in CI for judgment rules (naming, comment quality) —
   possible, but nondeterministic and token-costly; revisit only after 1–4 prove out.

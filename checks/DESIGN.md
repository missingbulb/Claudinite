# Checks — deterministic enforcement of the corpus (design)

> **Status: proposal** (issue #127). No checks exist yet; this doc is the blueprint the
> implementation follows. The per-rule audit of the existing corpus lives in
> [conversion-inventory.md](conversion-inventory.md).

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
[../tasks/agent-architecture.md](../tasks/agent-architecture.md): *"Prose is a request; the
post-hoc diff check is the guarantee."* This design scales that sentence up.

## What converts — and what doesn't

An instruction leaves context only when a deterministic mechanism can carry it. Four targets,
picked per rule:

| Mechanism | Fits when | Examples from the corpus |
|---|---|---|
| **Post-hoc check** (this system) | The rule constrains the *state of the repo* after work | file placement, dangling references, workflow lint, lifecycle compliance |
| **PreToolUse hook** | The action must be blocked *before* it runs | never delete a remote branch; don't `issue_write`-overwrite an issue body |
| **Skill / script** | A *procedure* or *knowledge* with a nameable (or path-scoped) trigger | the merge-to-main recipe; the lessons pass; the technology gotcha files |
| **Platform setting** | The platform enforces it outright, for free | squash-only merges; branch protection |

Two classes deliberately **stay as instructions**:

- **Process/judgment rules** — problem-first consensus, bug-investigation method, naming
  quality. They shape work *in flight* and leave no artifact a check can inspect. Converting
  them post-hoc would also catch violations only after the expensive rework they exist to
  prevent.
- **Platform-gotcha knowledge** (`technologies/`) — jsdom vs. Chrome, MV3 path resolution, SAM
  esbuild traps. These prevent runtime failures no local check can observe, so they can't
  become checks — but their *delivery* still improves: they become `paths`-scoped skills (see
  [Skills](#skills--the-on-demand-layer-for-what-checks-cant-carry)). Exception: the
  chrome-extension-release **contract** is a conformance suite waiting to be written.

## Architecture

```
checks/
  run.js                      # dependency-free Node CLI (the only entry point)
  lib/                        # shared: git diff scoping, findings format, Markdown link parser
  packs/
    universal/                # always on: reference-integrity, file-placement,
                              #   task-lifecycle, warning-suppression, claude-md
    github-actions/           # the workflow lints
    node/
    chrome-extension-release/ # the release-standard conformance suite
```

**Runner contract.** `node .claudinite/checks/run.js [--changed|--all]`. Dependency-free Node —
no `npm install` step exists on the tarball mount, and the corpus's own "earn each dependency"
rule applies to us first. Exit 0 = clean, exit 1 = findings. `--changed` (the default for
enforcement) scopes to files touched since `merge-base(origin/main, HEAD)` plus untracked files,
so a session is never blocked on pre-existing violations it didn't cause; `--all` exists for
adoption audits and CI sweeps.

**Pack selection is structural, not configured.** Per the corpus's own
structural-classifier rule: the runner fingerprints the repo — `.github/workflows/` →
github-actions pack; `package.json` → node pack; a `manifest.json` with `manifest_version` →
extension packs; the five release-workflow `name:`s → the conformance suite. Universal packs
always run. `.claudinite-checks.json` exists only for **overrides** (disable a pack/rule) and
**acceptances**.

**Acceptances are the escape hatch — deterministic and reviewable.** Rules with judgment
exemptions (filePlacement's "deliberate cross-cutting concern") need a way to say "yes, on
purpose" that isn't a fight with the hook: a per-finding `accept` entry with a mandatory reason
string, keyed by rule id + path. It lands in the diff like any code, so the *decision* gets
reviewed once instead of re-litigated every session.

**The finding is the instruction.** This is the context economy of the whole design: the rule's
teaching text moves out of always-loaded context and into the failure message, paying its token
cost only on violation, in the session that violated it, pointed at the exact spot. Every
finding carries: rule id, `file:line`, what's wrong, *why* (one line — the model generalizes
from motivation), the fix, and a doc pointer for depth.

<example>

```
file-placement/reference-distance  src/report/render.js:12
  imports ../../util/dates.js at distance 4.
  Why: the folder tree should encode the dependency graph; far reaches make it lie.
  Fix: move dates.js next to its users, lift it to a common ancestor, or accept it
       in .claudinite-checks.json with a reason if it's a deliberate cross-cutting util.
  More: .claudinite/tasks/filePlacement.md
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
3. Otherwise it runs `run.js --changed`; on findings it exits 2 with the findings on stderr.
   Claude Code blocks the stop and feeds that text back to the agent, which fixes the
   violations **in the same session**. A clean run stops silently.

Loop safety comes from convergence (fixed findings stop firing) plus Claude Code's own runaway
protection (it overrides a Stop hook after ~8 consecutive blocks).

**CI is the backstop, not the mechanism.** Hooks fire only in Claude Code sessions; a human
editing on GitHub web, or any other tool, bypasses them. A CI job running the same
`run.js --changed --base origin/main` catches those — same rules, same messages, one source of
truth.

**Prefer a platform setting when one exists.** Squash-only merging is a GitHub repo setting;
force-push protection is branch protection. Zero tokens, zero code, zero test — a check for
what the platform will enforce outright is waste.

## Governance

- **A converted rule leaves its doc.** The check's failure message owns the rule now; the doc
  keeps only rationale and the judgment parts. Keeping both pays twice and springs the corpus's
  own drift trap (two sources of truth).
- **Advisory first, blocking after proven precision.** A new check reports without blocking
  until observed false-positive-free. False positives are the failure mode that kills the
  system: a check that wrongly blocks Stop teaches the agent to fight the harness and the owner
  to disable the pack.
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
matching is harness-managed and trained-for, skills are user-invocable as `/name` too, and
technology skills can be **`paths`-scoped** (glob frontmatter) so they surface exactly when the
matching files are touched — a structural trigger, not a remembered one. Two documented limits
to respect: keep descriptions tight (the listing truncates them, and the description budget
scales with the context window — many verbose skills degrade matching), and keep each
`SKILL.md` body well under 500 lines.

### The catalog

| Skill | Trigger | Replaces |
|---|---|---|
| `merge-to-main` | owner's "LGTM" (+ `/merge-to-main`) | [../always/merge-to-main.md](../always/merge-to-main.md) — force-loaded today; ends with the lessons pass |
| `lessons-learned` | owner's "learned lessons"; invoked by `merge-to-main` | [../growth/extracting-lessons.md](../growth/extracting-lessons.md) — force-loaded today |
| `bump-version` | owner's "bump version" | preference entry; delegates to the project's release doc |
| `adopt-claudinite` | bootstrap request | [../bootstrap.md](../bootstrap.md) as an executable procedure |
| `bug-investigation` | description-matched: investigating a bug, a fix that didn't hold | [../tasks/bug-investigations.md](../tasks/bug-investigations.md) |
| `writing-tests` | description-matched: writing/changing tests | the stays-residue of [../tasks/testingPractices.md](../tasks/testingPractices.md) |
| `repo-text-sweeps` | description-matched: grep/sed sweep, rename, relocation | the procedure-residue of [../tasks/textAndFileManipulation.md](../tasks/textAndFileManipulation.md) |
| `authoring-agent-docs` | description-matched: writing a Claude instruction doc | [../tasks/agentic-documentation.md](../tasks/agentic-documentation.md) |
| `unattended-agents` | description-matched: building agents/routines | [../tasks/agent-architecture.md](../tasks/agent-architecture.md) + [../tasks/agenticBestPractices.md](../tasks/agenticBestPractices.md) residue |
| `git-github-advanced` | description-matched: beyond-baseline git/GitHub work | the knowledge-residue of [../tasks/git-and-github.md](../tasks/git-and-github.md) |
| `chrome-extension` | `paths`-scoped to manifest/extension globs + description | [../technologies/chrome-extension.md](../technologies/chrome-extension.md) (+ pointer to the release standard, whose *enforcement* is the conformance pack) |
| `nodejs-testing` | `paths`-scoped to test globs + description | [../technologies/nodejs.md](../technologies/nodejs.md) |
| `aws-sam` | `paths`-scoped to `template.yaml` + description | [../technologies/aws-sam.md](../technologies/aws-sam.md) |
| `html` | description-matched | [../technologies/html.md](../technologies/html.md) |

What stays always-loaded after this: a trimmed
[../always/working-discipline.md](../always/working-discipline.md), the judgment core of
[../tasks/engineeringPractices.md](../tasks/engineeringPractices.md) (its trigger — "writing
code" — is near-universal, so a skill gains little; revisit with telemetry), and a much smaller
index. The routing index largely dissolves: routing *is what skill descriptions do natively*.

### Delivery — incremental now, plugin end-state

- **Now (works with both mount methods):** skills live in `.claudinite/skills/<name>/`;
  bootstrap symlinks `.claude/skills/<name>` → there. Symlinked skill directories are
  documented, supported behavior, and skill changes are picked up live within a session — so
  the tarball sync populating the target after session start still lands.
- **End-state — Claudinite as a plugin.** Plugins bundle exactly this design's pieces: skills,
  commands, and hooks (SessionStart, Stop, PreToolUse), with bundled scripts addressable via
  `${CLAUDE_PLUGIN_ROOT}`. The Claudinite repo doubles as its own marketplace
  (`.claude-plugin/marketplace.json`); a consumer repo commits two keys in
  `.claude/settings.json` (`extraKnownMarketplaces` + `enabledPlugins`) and every session in it
  gets the whole layer — hooks registered, skills discovered, runner shipped — with updates
  tracking the plugin repo's `main` (no `version` field → every commit is an update). That
  collapses most of bootstrap and retires the tarball-sync/symlink plumbing. One documented
  limit: a plugin cannot inject always-on CLAUDE.md-style prose, so the small residual baseline
  keeps the existing `@`-import (or moves into the plugin's SessionStart hook output, which
  becomes session context the same way the preferences hook works today). Phase 5; the symlink
  route ships value without waiting for it.

## Growth pipeline: checks-first promotion

New lessons enter the canon through the growth lifecycle (extract → promote → dedup). Today
[../growth/promote.md](../growth/promote.md) generalizes a lesson and routes it to a prose doc.
Under this design, **prose becomes the fallback, not the default** — the point of promotion is
to relieve every project's context, and a check relieves it completely while prose only
relocates it.

**The promotion ladder.** Every lesson that clears the worthiness bar is triaged down the same
mechanism order as the conversion table above — the *first* rung that can carry it wins:

1. **Platform setting** — the platform enforces it outright.
2. **PreToolUse hook** — a bad action to block before it runs.
3. **Post-hoc check** — a constraint on repo state.
4. **Skill** — a procedure or knowledge with a nameable trigger.
5. **Prose canon** — only for what none of the above can carry, and the landing **names its
   reason** (judgment / in-flight behavior / platform knowledge), logged per lesson in the
   promote tracking issue so conversion rates are auditable.

Concretely, three growth docs change:

- **[../growth/item-routing.md](../growth/item-routing.md)** gains a step 0: *mechanism triage*
  before file routing. "Which doc owns this" is only asked for lessons that fall through to
  rung 5.
- **[../growth/promote.md](../growth/promote.md)**: for a rung-3 lesson, the routine authors
  the check in the same PR — rule id, detection, the failure message (which *is* the
  generalized lesson text), **plus a fixture proving it fires** on a violating input and stays
  quiet on a clean one (see-it-fail applies to checks too). When it can't produce a confident
  detection + fixture, it lands the lesson as prose **and** opens a tagged conversion-backlog
  issue — a visible miss to sweep later, never a silently-shipped broken check.
- **[../growth/dedup.md](../growth/dedup.md)**: a canon **check** covers a local prose item the
  same way a canon line does — better, since the coverage is enforced rather than stated. The
  runner exposes the rule catalog machine-readably (`run.js --list`: rule id, description,
  failure message, doc pointer); dedup quotes a **rule id** where it today quotes a canon line.
  This answers the obvious worry — "the canon won't have the instruction, only a test": the
  check *carries* its instruction as data (its failure message), so dedup compares against the
  catalog exactly as it compares against prose today, and more mechanically, since rule ids are
  stable where prose wording drifts. The keep-test is unchanged: a local item that says *more*
  than the check detects (a stronger point about a narrower case) stays.

Phase 1 (extract) is untouched: project-local capture stays prose at the project's own level —
conversion is a promotion-time judgment, made once, centrally.

## Phasing

1. **Runner + Stop hook + first universal packs** — reference-integrity, task-lifecycle,
   warning-suppression (blocking after burn-in); file-placement (advisory). Bootstrap gains the
   hook-registration step.
2. **github-actions lint pack + chrome-extension-release conformance pack**, piloted on one
   extension repo.
3. **Baseline restructure** — the first skills (`merge-to-main`, `lessons-learned`) + the
   squash-only setting; temporary-workarounds → PreToolUse hook; slim the converted docs and
   the index.
4. **Skills layer + growth pivot** — the rest of the catalog (practice + technology skills,
   symlink delivery in bootstrap), and the promotion ladder lands in
   [../growth/promote.md](../growth/promote.md),
   [../growth/item-routing.md](../growth/item-routing.md), and
   [../growth/dedup.md](../growth/dedup.md).
5. **Plugin packaging** — Claudinite doubles as its own marketplace; hooks, skills, and the
   runner ship as one installable unit; bootstrap collapses to two committed settings keys.
6. **(Deferred)** LLM-judge checks in CI for judgment rules (naming, comment quality) —
   possible, but nondeterministic and token-costly; revisit only after 1–4 prove out.

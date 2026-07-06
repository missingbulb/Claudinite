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
| **Skill / script** | The rule is a *procedure* run on a trigger | the merge-to-main recipe; the lessons pass |
| **Platform setting** | The platform enforces it outright, for free | squash-only merges; branch protection |

Two classes deliberately **stay as instructions**:

- **Process/judgment rules** — problem-first consensus, bug-investigation method, naming
  quality. They shape work *in flight* and leave no artifact a check can inspect. Converting
  them post-hoc would also catch violations only after the expensive rework they exist to
  prevent.
- **Platform-gotcha knowledge** (`technologies/`) — jsdom vs. Chrome, MV3 path resolution, SAM
  esbuild traps. These prevent runtime failures no local check can observe; they're also
  already soft-loaded, so their standing cost is near zero. Exception: the
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

## Phasing

1. **Runner + Stop hook + first universal packs** — reference-integrity, task-lifecycle,
   warning-suppression (blocking after burn-in); file-placement (advisory). Bootstrap gains the
   hook-registration step.
2. **github-actions lint pack + chrome-extension-release conformance pack**, piloted on one
   extension repo.
3. **Baseline restructure** — merge-to-main → skill + squash-only setting; extracting-lessons →
   skill; temporary-workarounds → PreToolUse hook; slim the converted docs and the index.
4. **(Deferred)** LLM-judge checks in CI for judgment rules (naming, comment quality) —
   possible, but nondeterministic and token-costly; revisit only after 1–3 prove out.
